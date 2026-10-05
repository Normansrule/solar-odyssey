// Attacks on the data pipeline, run against the real site/assets/js/data.js with a
// mocked fetch that serves files from memory. Each scenario imports a fresh copy of
// the module (a query string defeats the ESM cache) so the manifest cache is empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';

const DATA_JS = new URL('../../site/assets/js/data.js', import.meta.url);
const DATA_DIR = new URL('../../site/data/', import.meta.url);
const real = Object.fromEntries(readdirSync(DATA_DIR).map((f) => [f, readFileSync(new URL(f, DATA_DIR))]));
const someDataset = Object.keys(real).find((f) => f.endsWith('.json') && f !== 'manifest.json');

let n = 0;
/** Fresh data.js whose fetch serves `files` (name -> Buffer) from site/data/. Records every request. */
async function harness(files = real) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const u = new URL(url);
    if (!u.href.startsWith(DATA_DIR.href)) return new Response('nope', { status: 404 });
    const name = decodeURIComponent(u.pathname.slice(new URL(DATA_DIR).pathname.length));
    return Object.hasOwn(files, name) ? new Response(files[name], { status: 200 }) : new Response('missing', { status: 404 });
  };
  const mod = await import(`${DATA_JS.href}?case=${++n}`);
  return { mod, requests };
}
const withFiles = (patch) => ({ ...real, ...patch });
const rejectsIntegrity = async (mod, p, re) => {
  await assert.rejects(p, (e) => e instanceof mod.DataIntegrityError && (!re || re.test(e.message)), `expected DataIntegrityError ${re ?? ''}`);
};

test('untampered data loads and is reported as verified', async () => {
  const { mod, requests } = await harness();
  const r = await mod.loadData(someDataset);
  assert.equal(r.state, 'verified');
  assert.ok(r.data && typeof r.data === 'object');
  for (const q of requests) {
    assert.equal(q.init.redirect, 'error', 'redirects are refused');
    assert.equal(q.init.credentials, 'omit', 'no cookies are sent');
  }
});

test('a tampered dataset (same length) is rejected by SHA-256', async () => {
  const buf = Buffer.from(real[someDataset]);
  const i = buf.indexOf('"'); buf[i + 1] ^= 0x01;
  const { mod } = await harness(withFiles({ [someDataset]: buf }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /SHA-256 mismatch/);
});

test('a dataset with bytes added or removed is rejected by size', async () => {
  const { mod } = await harness(withFiles({ [someDataset]: real[someDataset].subarray(0, real[someDataset].length - 1) }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /size mismatch/);
});

test('an oversize dataset is abandoned while streaming', async () => {
  const big = Buffer.alloc(9 * 1024 * 1024, 0x20);
  const { mod } = await harness(withFiles({ [someDataset]: big }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /too large/);
});

test('a tampered manifest (one hash changed to match tampered data) fails the signature', async () => {
  const m = JSON.parse(real['manifest.json']);
  m.files[someDataset].sha256 = 'f'.repeat(64);
  const { mod } = await harness(withFiles({ 'manifest.json': Buffer.from(JSON.stringify(m, null, 2) + '\n') }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /signature is invalid/);
});

test('a manifest signed by a different key is rejected', async () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const sig = Buffer.from(sign(null, real['manifest.json'], privateKey).toString('base64') + '\n');
  const { mod } = await harness(withFiles({ 'manifest.sig': sig }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /signature is invalid/);
});

test('malformed signatures never downgrade to "unchecked"', async () => {
  const bad = ['', '\n', 'AAAA', '!!!!not base64', Buffer.alloc(64).toString('base64'), Buffer.alloc(63).toString('base64'),
    Buffer.alloc(65).toString('base64'), `${real['manifest.sig'].toString().trim()}AA`, 'A'.repeat(1000)];
  for (const s of bad) {
    const { mod } = await harness(withFiles({ 'manifest.sig': Buffer.from(s) }));
    await rejectsIntegrity(mod, mod.loadData(someDataset));
  }
  const { mod } = await harness(withFiles({ 'manifest.sig': Buffer.from('A'.repeat(4096)) }));
  await rejectsIntegrity(mod, mod.loadData(someDataset), /too large/);
});

test('verifySignature: only a key-import failure means unsupported', async () => {
  const { mod } = await harness();
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64');
  const msg = new TextEncoder().encode('manifest');
  const sig = Buffer.from(await crypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, msg)).toString('base64');
  assert.equal(await mod.verifySignature(msg, sig, pub), 'valid');
  assert.equal(await mod.verifySignature(new TextEncoder().encode('manifesT'), sig, pub), 'invalid');
  for (const s of ['', '%%%', 'AAAA', Buffer.alloc(64).toString('base64'), Buffer.alloc(128).toString('base64'), null, undefined, 42]) {
    assert.equal(await mod.verifySignature(msg, s, pub), 'invalid', `signature ${JSON.stringify(s)}`);
  }
});

test('without Ed25519 support the data is labelled unchecked but the hashes are still enforced', async () => {
  const orig = crypto.subtle.importKey;
  crypto.subtle.importKey = async (...a) => {
    if (a[2]?.name === 'Ed25519') { const e = new Error('Unrecognized name'); e.name = 'NotSupportedError'; throw e; }
    return orig.apply(crypto.subtle, a);
  };
  try {
    let { mod } = await harness();
    assert.equal((await mod.loadData(someDataset)).state, 'unchecked');
    const buf = Buffer.from(real[someDataset]); buf[buf.length - 3] ^= 0x01;
    ({ mod } = await harness(withFiles({ [someDataset]: buf })));
    await rejectsIntegrity(mod, mod.loadData(someDataset), /SHA-256 mismatch/);
    const m = JSON.parse(real['manifest.json']); m.files[someDataset].bytes = 'lots';
    ({ mod } = await harness(withFiles({ 'manifest.json': Buffer.from(JSON.stringify(m)) })));
    await rejectsIntegrity(mod, mod.loadData(someDataset), /malformed manifest entry/);
    ({ mod } = await harness(withFiles({ 'manifest.json': Buffer.from('{"files":null}') })));
    await rejectsIntegrity(mod, mod.loadData(someDataset), /malformed manifest/);
  } finally {
    crypto.subtle.importKey = orig;
  }
});

test('a file that is not in the signed manifest is refused, even if served', async () => {
  const { mod, requests } = await harness(withFiles({ 'evil.json': Buffer.from('{"data":[]}') }));
  await rejectsIntegrity(mod, mod.loadData('evil.json'), /not in the signed manifest/);
  await rejectsIntegrity(mod, mod.loadData('constructor.json'), /not in the signed manifest/);
  assert.ok(!requests.some((q) => q.url.endsWith('evil.json')), 'the unlisted file is never fetched');
});

test('path-traversal and odd dataset names are refused before any request', async () => {
  const { mod, requests } = await harness();
  const names = ['../index.html', '../assets/js/trust.js', '..%2fmanifest.json', 'a/../../x.json', '%2e%2e/x.json', '/etc/passwd',
    'manifest.json/../x.json', '__proto__.json', '.json', 'x.json?y=1', 'x.json#a', 'X.JSON', 'x.json\u0000', ' x.json', 'x.js', 'x', '', null, 42];
  for (const name of names) await rejectsIntegrity(mod, mod.loadData(name), /bad dataset name/);
  assert.equal(requests.length, 0);
});

test('cross-origin and out-of-folder URLs are refused', async () => {
  const { mod, requests } = await harness();
  for (const u of ['https://evil.example/data/x.json', '//evil.example/data/x.json', 'http://localhost/x.json', 'data:application/json,{}',
    'javascript:alert(1)', '../index.html', 'data/../assets/js/core.js', 'data/x.json?v=1', 'data/x.json#frag']) {
    assert.throws(() => mod.checkedUrl(u), mod.DataIntegrityError, u);
  }
  for (const u of ['https://evil.example/x.json', '//evil.example/x.json']) await rejectsIntegrity(mod, mod.loadData(u));
  assert.equal(mod.checkedUrl('data/manifest.json').href, new URL('manifest.json', DATA_DIR).href);
  assert.equal(requests.length, 0);
});

test('a caller validator that returns false or throws stops the data', async () => {
  const { mod } = await harness();
  await rejectsIntegrity(mod, mod.loadData(someDataset, () => false), /failed validation/);
  await assert.rejects(mod.loadData(someDataset, () => { throw new TypeError('shape'); }), TypeError);
});

test('JSON with a __proto__ key does not pollute Object.prototype', async () => {
  const evil = Buffer.from('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"data":[]}');
  const m = JSON.parse(real['manifest.json']);
  const { createHash } = await import('node:crypto');
  m.files['evil.json'] = { bytes: evil.length, sha256: createHash('sha256').update(evil).digest('hex') };
  const orig = crypto.subtle.importKey; // the forged manifest can only be accepted on the "unsupported" path
  crypto.subtle.importKey = async () => { const e = new Error('no'); e.name = 'NotSupportedError'; throw e; };
  try {
    const { mod } = await harness(withFiles({ 'manifest.json': Buffer.from(JSON.stringify(m)), 'evil.json': evil }));
    const r = await mod.loadData('evil.json');
    assert.equal(r.state, 'unchecked');
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.getPrototypeOf(r.data), Object.prototype);
  } finally {
    crypto.subtle.importKey = orig;
  }
});

test('a validator that returns a falsy non-boolean (null, undefined, 0) also stops the data', async () => {
  const { mod } = await harness();
  for (const v of [null, undefined, 0, '']) await rejectsIntegrity(mod, mod.loadData(someDataset, () => v), /failed validation/);
  assert.equal(mod.is.obj(null), false);
  assert.equal(mod.is.obj([]), false);
});
