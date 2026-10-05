# Security model

Solar Odyssey is a static, local-first teaching site. It has no server, no accounts and no analytics.
This document says what it protects, from what, and how.

## What there is to protect

- **The learner's device and browser.** The site must never become a way to run someone else's code.
- **The learner's privacy.** Nothing about what a learner does should leave their browser.
- **The integrity of the teaching.** Numbers and charts must be the ones the maintainers published, not
  altered data from a compromised mirror, cache or pull request.
- **The integrity of the downloads.** Desktop installers must be the ones built from this repository.

## Boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| GitHub Pages → browser | HTML, CSS, JS, fonts, JSON data | Strict Content Security Policy (CSP) on every page; everything served from the same origin |
| `site/data/*.json` → page code | Datasets | Signed manifest + SHA-256 + size + shape validation before use |
| Learner input → page code | Slider values, text fields, formulas | Parsed as numbers or by the safe expression evaluator; inserted as text only |
| Desktop app window → operating system | Nothing | Tauri with no commands, no plugins and an empty permission list |
| Repository → release artefacts | Source, lockfiles | Pinned dependencies, CI checks, SBOM, checksums, signed provenance |

## Browser

- **Content Security Policy** (identical on every page, enforced by `scripts/check_site.py`):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self';
  connect-src 'self'; media-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.
  No inline scripts, no inline styles, no `eval`, no third-party origins. The site cannot load or send
  anything to another host even if an attacker injects markup.
  Limits of a `<meta>` policy: `frame-ancestors` cannot be set from a meta tag and GitHub Pages sends no
  security headers, so the site can be framed by another page (it has no account or purchase actions to
  hijack). On `<user>.github.io/<repo>/`, `'self'` is the whole `<user>.github.io` origin, which every
  other project site of the same account shares.
- **No HTML from data.** Page code builds elements with a small helper (`dom.js`) that only creates text
  nodes, refuses `on*` attributes and sanitises `href`/`src` (only http(s), mailto, fragments and relative
  paths). The checker fails the build on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
  `eval`, `new Function` and string `setTimeout`. The one exception is an ECharts tooltip with a custom
  `formatter`, which ECharts inserts as HTML: such formatters use class-only markup and pass every string
  that comes from a dataset through `esc()` (`dom.js`). Tooltips without a formatter use ECharts'
  canvas (rich-text) renderer. KaTeX runs with `trust: false` on equations written in the page source.
- **User formulas.** The custom-calculation boxes use `safe-expr.js`: a tokeniser and recursive-descent parser
  over numbers, + − × ÷ ^, parentheses, a whitelist of maths functions and named variables. Length (500
  characters) and nesting depth (64) are capped; property access, strings, assignment and calls to anything
  outside the whitelist are syntax errors. Tests in `tests/unit/safe-expr.test.mjs` try known escape strings.
- **Third-party code** (ECharts, KaTeX, three.js, two fonts) is vendored into `site/vendor` from the npm
  lockfile by `scripts/vendor.mjs`, which records each file's SHA-256 in `site/vendor/VENDOR.json`. CI
  re-vendors and fails if the committed files differ.
- **Storage.** Only `localStorage` keys starting with `so.` (depth, theme, lesson progress, the timeline
  filter). No cookies. The About page has a button that deletes exactly those keys. Stored values are
  treated as untrusted (another site on a shared `github.io` origin can write them): they are parsed as
  JSON inside `try`, and a value of the wrong shape falls back to the default.

## Data files

A malicious or corrupted data file is the most likely way to make the site teach something false.

1. `scripts/build_data.py` builds every dataset from `data-src/` and validates it: required metadata
   (sources, licence, verification date), known source ids, DOI and date formats.
2. `scripts/sign-manifest.mjs` writes `site/data/manifest.json` (byte length and SHA-256 of every dataset)
   and signs it with Ed25519. The public key is in `site/assets/js/trust.js`; the private key is kept
   outside the repository (`~/.config/solar-odyssey/data-signing-key.pem` or a CI secret) and is never
   committed (`*.pem` is git-ignored and gitleaks scans every push).
3. In the browser, `data.js` loads a dataset only after: its name is a plain `name.json` (no paths), the
   URL is on the allowlist (same origin only) and inside `data/`, the manifest signature verifies with
   WebCrypto Ed25519, the dataset is listed in the manifest with a well-formed entry, and its size and
   SHA-256 match. Downloads are capped (8 MB; 512 KB for the manifest, 1 KB for the signature) while
   streaming, sent without cookies and refuse redirects. The dataset is then parsed as JSON (never executed)
   and passed through the page's shape validator. A failure hides the chart and says why.
   Browsers without Ed25519 support (detected only by the built-in public key failing to import, never by
   anything in the downloaded signature: a malformed signature is simply invalid) still get the hash
   checks, and the page labels the data "hash-checked" instead of "verified". Without the signature the
   hashes catch corruption, not an attacker who can rewrite both the manifest and the data.
   `tests/unit/data-tamper.test.mjs` runs these attacks against the real `data.js`.
4. CI rebuilds the data from `data-src/` and fails if it differs from what is committed, then verifies the
   signature. The Pages and release workflows refuse to publish if the signature does not verify.

Limits: someone with write access to the repository *and* the signing key can publish bad data. Review
`data-src/` changes like code. If the key leaks, rotate it: delete the key file and run `npm run sign`,
which generates a new pair and rewrites `trust.js`. Because `npm run sign` without the key silently does exactly
that, a pull request that changes `site/assets/js/trust.js` is a change of signing authority: CI cannot
tell it from a legitimate rotation, so reviewers must.

## Desktop app (Tauri 2)

- Shows the bundled `site/` folder from the app package; no remote URL is ever loaded.
- No custom Rust commands, no plugins (no filesystem, shell, HTTP, clipboard, updater or dialog access).
  The page calls no Tauri API, so the main window's capability grants no permissions at all
  (`desktop/src-tauri/capabilities/default.json`); even `core:default` would let page script create tray
  icons and menus, resolve the user's home directory and read image files by path.
- The same CSP is applied by Tauri (`tauri.conf.json`), plus `freezePrototype`.
- It opens no listening ports and makes no network requests: it works fully offline after install.

## Supply chain (OWASP Top 10 2025, A03: Software Supply Chain Failures)

- Lockfiles: `package-lock.json` (npm, installed with `npm ci --ignore-scripts`), `desktop/src-tauri/Cargo.lock`,
  exact versions in `requirements-dev.txt`.
- Every GitHub Action is pinned to a full commit SHA, with the version in a comment. Workflows default to
  `permissions: contents: read` and raise permissions per job only where needed.
- Dependabot watches npm, Cargo, pip and Actions, and waits 7 days before proposing a new version
  (`cooldown`) so a freshly published malicious release has time to be caught. CodeQL scans JavaScript,
  Python and the workflows; gitleaks scans the whole history for secrets (`.gitleaks.toml` adds one narrow
  exception for bibliography ids like `shockley-queisser-1961` in dataset JSON).
- The release build fails if `Cargo.lock` is out of date, so it cannot silently re-resolve dependencies.
  Python test dependencies are pinned at the top level only; they never ship.
- Releases: installers are built by GitHub Actions from a tag, published with `SHA256SUMS.txt`, an SPDX
  software bill of materials (SBOM), and Sigstore-signed build-provenance attestations
  (`gh attestation verify <file> --repo <owner>/<repo>`). The build job attests the installers it built
  before uploading them; the checksums job then hashes and attests what is on the release. The release
  stays a draft until the checksums and SBOM are attached, release builds use no caches, and only
  `v*` tags can trigger them.

## Reporting a problem

Open a GitHub issue for content errors. For a security problem, use the repository's
"Report a vulnerability" (private advisory) button rather than a public issue.
