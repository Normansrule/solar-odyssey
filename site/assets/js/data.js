// Verified data loading.
// Every dataset in site/data is listed in data/manifest.json with its byte length
// and SHA-256. The manifest is signed with Ed25519 (data/manifest.sig); the public
// key lives in trust.js. A dataset is only handed to a page after:
//   1. its URL resolves to an allowlisted origin (same origin only, by default),
//   2. the manifest signature verifies (or the browser lacks Ed25519: see below),
//   3. its size and SHA-256 match the manifest,
//   4. it parses as JSON and passes the caller's validator.
// Browsers without WebCrypto Ed25519 still get the hash checks, and the page is
// told the signature could not be checked ("unchecked"), never silently "verified".
// That fallback depends only on the browser (importing the built-in key fails),
// never on the downloaded signature: a bad or malformed signature is 'invalid'.
// Note that without the signature the hashes only catch corruption, not an attacker
// who can rewrite both the manifest and the data.

import { DATA_PUBLIC_KEY_B64 } from './trust.js';

export const ROOT = new URL('../../', import.meta.url);
const DATA_BASE = new URL('data/', ROOT);
const ALLOWED_ORIGINS = new Set([ROOT.origin]);
const MAX_BYTES = 8 * 1024 * 1024;

const b64 = (s) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export class DataIntegrityError extends Error {}

/** Resolve a path under site/data/ and refuse anything outside the allowlisted origin or that folder. */
export function checkedUrl(rel) {
  const url = new URL(rel, ROOT);
  if (!ALLOWED_ORIGINS.has(url.origin)) throw new DataIntegrityError(`host not allowlisted: ${url.origin}`);
  if (!url.href.startsWith(DATA_BASE.href) || url.search || url.hash) throw new DataIntegrityError(`not a data file: ${url.pathname}`);
  return url;
}

async function fetchBytes(url, limit = MAX_BYTES) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache', redirect: 'error' });
  if (!res.ok) throw new DataIntegrityError(`${url.pathname}: HTTP ${res.status}`);
  const tooLarge = () => new DataIntegrityError(`${url.pathname}: too large`);
  if (Number(res.headers?.get?.('content-length')) > limit) throw tooLarge();
  // Stream with a byte budget so an oversize file is abandoned instead of buffered whole.
  const reader = res.body?.getReader?.();
  if (!reader) { const buf = await res.arrayBuffer(); if (buf.byteLength > limit) throw tooLarge(); return buf; }
  const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > limit) { reader.cancel().catch(() => {}); throw tooLarge(); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out.buffer;
}

/**
 * 'valid' | 'invalid' | 'unsupported'. Only a failure to import the (trusted, built-in)
 * public key can mean 'unsupported'; nothing in the attacker-controlled signature or
 * message can reach that branch. A malformed signature, or any error while verifying, is 'invalid'.
 */
export async function verifySignature(messageBytes, signatureB64, publicKeyB64 = DATA_PUBLIC_KEY_B64) {
  let key;
  try {
    key = await crypto.subtle.importKey('raw', b64(publicKeyB64), { name: 'Ed25519' }, false, ['verify']);
  } catch (e) {
    if (e && (e.name === 'NotSupportedError' || e.name === 'TypeError')) return 'unsupported';
    throw e;
  }
  try {
    const sig = b64(String(signatureB64));
    if (sig.length !== 64) return 'invalid';
    return (await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, messageBytes)) ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
}

const validEntry = (e) => e && typeof e === 'object' && Number.isSafeInteger(e.bytes) && e.bytes >= 0 && e.bytes <= MAX_BYTES
  && typeof e.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256);

let manifestPromise = null;
export function loadManifest() {
  manifestPromise ??= (async () => {
    const [mBuf, sigBuf] = await Promise.all([
      fetchBytes(checkedUrl('data/manifest.json'), 512 * 1024),
      fetchBytes(checkedUrl('data/manifest.sig'), 1024),
    ]);
    const signature = await verifySignature(mBuf, new TextDecoder().decode(sigBuf));
    if (signature === 'invalid') throw new DataIntegrityError('data manifest signature is invalid');
    const manifest = JSON.parse(new TextDecoder().decode(mBuf));
    if (!manifest || typeof manifest.files !== 'object' || manifest.files === null || Array.isArray(manifest.files)) throw new DataIntegrityError('malformed manifest');
    return { manifest, signature };
  })();
  return manifestPromise;
}

const cache = new Map();
/**
 * Load site/data/<name> after integrity checks.
 * validate(obj) must return true for a good shape; anything falsy (or a throw) rejects the data.
 * Resolves to { data, state } where state is 'verified' or 'unchecked'.
 */
export function loadData(name, validate) {
  if (!/^[a-z0-9][a-z0-9_-]*\.json$/.test(name)) return Promise.reject(new DataIntegrityError(`bad dataset name ${name}`));
  if (!cache.has(name)) {
    cache.set(name, (async () => {
      const { manifest, signature } = await loadManifest();
      const entry = Object.hasOwn(manifest.files, name) ? manifest.files[name] : null;
      if (!entry) throw new DataIntegrityError(`${name} is not in the signed manifest`);
      if (!validEntry(entry)) throw new DataIntegrityError(`${name}: malformed manifest entry`);
      const buf = await fetchBytes(checkedUrl(`data/${name}`), Math.min(MAX_BYTES, entry.bytes + 1));
      if (buf.byteLength !== entry.bytes) throw new DataIntegrityError(`${name}: size mismatch`);
      const digest = hex(await crypto.subtle.digest('SHA-256', buf));
      if (digest !== entry.sha256) throw new DataIntegrityError(`${name}: SHA-256 mismatch`);
      const data = JSON.parse(new TextDecoder().decode(buf));
      return { data, state: signature === 'valid' ? 'verified' : 'unchecked' };
    })());
  }
  return cache.get(name).then((r) => {
    if (validate && !validate(r.data)) throw new DataIntegrityError(`${name}: failed validation`);
    return r;
  });
}

/** Show the integrity state next to a chart. el should be a <span class="data-badge">. */
export function setBadge(el, state, source) {
  if (!el) return;
  el.dataset.state = state;
  el.textContent = state === 'verified' ? `Data verified against signed manifest${source ? `: ${source}` : ''}`
    : state === 'unchecked' ? 'Data hash-checked (this browser cannot check the signature)'
      : 'Data failed its integrity check and was not shown';
}

// ---- small validators shared by pages ----
export const is = {
  num: (x) => typeof x === 'number' && Number.isFinite(x),
  str: (x) => typeof x === 'string',
  arr: (x) => Array.isArray(x),
  obj: (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
  year: (x) => Number.isInteger(x) && x >= 1800 && x <= 2100,
};
