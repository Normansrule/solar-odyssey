// Copies pinned third-party libraries from node_modules into site/vendor so the
// static site has zero runtime CDN dependencies (strict CSP: script-src 'self').
// Writes site/vendor/VENDOR.json with version, license and SHA-256 of every file.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site', 'vendor');
const nm = join(root, 'node_modules');
const pkg = (name) => JSON.parse(readFileSync(join(nm, name, 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to) => { mkdirSync(dirname(join(out, to)), { recursive: true }); cpSync(join(nm, from), join(out, to), { recursive: true }); };

// ECharts: UMD minified build, exposes window.echarts
copy('echarts/dist/echarts.min.js', 'echarts/echarts.min.js');
copy('echarts/LICENSE', 'echarts/LICENSE');

// KaTeX: minified JS + CSS + fonts
copy('katex/dist/katex.min.js', 'katex/katex.min.js');
copy('katex/dist/katex.min.css', 'katex/katex.min.css');
copy('katex/dist/fonts', 'katex/fonts');
copy('katex/LICENSE', 'katex/LICENSE');

// three.js: ES modules. Addons import the bare specifier 'three', which needs an
// import map; inline import maps would need a CSP hash, so rewrite to a relative path.
copy('three/build/three.module.js', 'three/three.module.js');
copy('three/build/three.core.js', 'three/three.core.js');
copy('three/LICENSE', 'three/LICENSE');
for (const addon of ['controls/OrbitControls.js']) {
  const src = readFileSync(join(nm, 'three/examples/jsm', addon), 'utf8')
    .replace(/from ['"]three['"]/g, "from '../three.module.js'");
  mkdirSync(join(out, 'three/addons'), { recursive: true });
  writeFileSync(join(out, 'three/addons', addon.split('/').pop()), src);
}

// Fonts (SIL Open Font License 1.1), latin subset only, self-hosted
for (const [dir, files] of [
  ['@fontsource-variable/fraunces', ['fraunces-latin-full-normal.woff2', 'fraunces-latin-full-italic.woff2']],
  ['@fontsource-variable/atkinson-hyperlegible-next', ['atkinson-hyperlegible-next-latin-wght-normal.woff2', 'atkinson-hyperlegible-next-latin-wght-italic.woff2']],
]) {
  for (const f of files) copy(`${dir}/files/${f}`, `fonts/${f}`);
  copy(`${dir}/LICENSE`, `fonts/LICENSE-${dir.split('/').pop()}.txt`);
}

// Inventory with hashes (feeds the SBOM and CREDITS)
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
walk(out);
const inventory = {
  generated_by: 'scripts/vendor.mjs',
  packages: ['echarts', 'katex', 'three', '@fontsource-variable/fraunces', '@fontsource-variable/atkinson-hyperlegible-next'].map((n) => ({ name: n, version: pkg(n).version, license: pkg(n).license, homepage: pkg(n).homepage })),
  files: files.filter((f) => !f.endsWith('VENDOR.json')).sort().map((f) => ({
    path: relative(out, f), sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
  })),
};
writeFileSync(join(out, 'VENDOR.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log(`vendored ${inventory.files.length} files:`, inventory.packages.map((p) => `${p.name}@${p.version}`).join(', '));
