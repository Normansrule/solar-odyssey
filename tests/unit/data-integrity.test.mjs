import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';

const dir = new URL('../../site/data/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const trust = readFileSync(new URL('../../site/assets/js/trust.js', import.meta.url), 'utf8').match(/'([A-Za-z0-9+/=]+)'/)[1];

test('every data file is in the signed manifest with the right hash', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
  assert.deepEqual(Object.keys(manifest.files).sort(), files.sort());
  for (const f of files) {
    const buf = readFileSync(new URL(f, dir));
    assert.equal(manifest.files[f].bytes, buf.length, f);
    assert.equal(manifest.files[f].sha256, createHash('sha256').update(buf).digest('hex'), f);
  }
});

test('manifest signature verifies with the published key, and fails when tampered', () => {
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(trust, 'base64')]), format: 'der', type: 'spki' });
  const bytes = readFileSync(new URL('manifest.json', dir));
  const sig = Buffer.from(readFileSync(new URL('manifest.sig', dir), 'utf8').trim(), 'base64');
  assert.equal(verify(null, bytes, key, sig), true);
  const tampered = Buffer.from(bytes); tampered[tampered.length - 5] ^= 1;
  assert.equal(verify(null, tampered, key, sig), false);
});

test('datasets carry sources, licence and a verification date', () => {
  const sources = JSON.parse(readFileSync(new URL('sources.json', dir), 'utf8'));
  for (const f of Object.keys(manifest.files)) {
    if (f === 'sources.json' || f === 'glossary.json') continue;
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.ok(d.meta?.license, `${f} licence`);
    assert.match(d.meta?.last_verified ?? '', /^\d{4}-\d{2}-\d{2}$/, `${f} last_verified`);
    if (d.meta.internal) continue; // generated from the site itself (search index): no outside sources
    assert.ok(Array.isArray(d.meta.sources) && d.meta.sources.length, `${f} sources`);
    for (const s of d.meta.sources) assert.ok(sources[s], `${f} cites unknown ${s}`);
  }
});
