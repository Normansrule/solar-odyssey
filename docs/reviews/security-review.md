# Security review — Milestone 5

Date: 2026-10-02. Reviewer: independent (did not write the code). Baseline: `docs/SECURITY_MODEL.md` and
the brief's requirements (static local-first site, untrusted data and input, signed data manifest, offline
Tauri app, OWASP Top 10 2025 A03 supply chain).

## Scope

- Every first-party script under `site/` (not `site/vendor`): `assets/js/*.js`, `assets/js/physics/*.js`,
  and every page script.
- Data pipeline: `site/assets/js/data.js`, `trust.js`, `scripts/sign-manifest.mjs`, `site/data/`.
- Content Security Policy: the `CSP` constant in `scripts/check_site.py` and the meta tag on all 28 pages.
- Desktop: `desktop/src-tauri/` (`tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, `Cargo.*`).
- Supply chain: `.github/workflows/*.yml`, `.github/dependabot.yml`, `package.json`, `package-lock.json`,
  `requirements-dev.txt`, secrets in the tree and in history.

## Method

1. Read every first-party script, then grepped for sinks: `innerHTML` by any route (including ECharts
   tooltip `formatter`s, which ECharts inserts as HTML), `setAttribute`, SVG `href`, `style`, `location`,
   `window.open`, `fetch`, dynamic `import`, `JSON.parse`, `Object.assign`, `localStorage`.
   Followed every dataset field from `loadData` to where it is rendered.
2. Wrote `tests/unit/safe-expr-fuzz.test.mjs`: about 120 known JavaScript escape strings and parser edge
   cases, 40,000 random token soups and random code points, and 20,000 well-formed expressions from a small
   grammar, each against six variable sets (including prototype-less, NaN, string and function values).
   It runs in a worker thread with a 60 s deadline so a hang fails instead of stalling. Result: every input
   gives a number or an `ExprError`; slowest input under 5 ms; no global side effects.
3. Wrote `tests/unit/data-tamper.test.mjs`, which imports the real `data.js` (a fresh instance per case)
   with a mocked `fetch` and Node's WebCrypto. It shows these are rejected: a tampered dataset (same size:
   SHA-256), resized dataset, 9 MB dataset (abandoned while streaming), tampered manifest, manifest signed by
   another key, nine malformed signatures, an oversize signature, an unlisted file, 19 path-traversal or odd
   names (before any request is made), cross-origin and out-of-folder URLs, and validators that return false,
   throw, or return `null`/`undefined`/`0`. It also checks that requests omit credentials and refuse
   redirects, that `__proto__` keys in data do not pollute `Object.prototype`, and that without Ed25519 the
   data is labelled "unchecked" while hashes and manifest-entry checks still apply.
4. Compared the CSP on every page with the checker constant and the Tauri CSP. Ran `cargo check` and a
   release build with the new capability, and launched the app under Xvfb (it rendered the home page with
   its signed timeline data).
5. Read each workflow for `pull_request_target`, `${{ … }}` in `run:`, permissions, unpinned actions,
   secrets and the release artefact chain. Checked that the npm lockfile is complete (`resolved` +
   `integrity` from registry.npmjs.org on every package) and that `Cargo.lock` is current
   (`cargo metadata --locked`).
6. Ran gitleaks 8.28.0 (checksum verified) on the working tree (excluding `node_modules`, `target`) and on
   the full git history, and searched for `*.pem`, `*.key`, `.env` and `PRIVATE KEY` blocks.

## Findings

| # | Severity | Location | Finding | Resolution |
|---|---|---|---|---|
| 1 | Medium | `desktop/src-tauri/capabilities/default.json` | `core:default` gave page script more than the app uses: create tray icons and menus, `image:from-path` (read image files from disk), `path:resolve-directory` (the user's home path), toggle devtools. The page calls no Tauri API. | **Fixed**: `"permissions": []`. `cargo check`, release build and an Xvfb launch all work. |
| 2 | Medium | `.github/workflows/security.yml` (gitleaks) | gitleaks reported the bibliography id `shockley-queisser-1961` in `site/data/timeline.json` as a `generic-api-key`, so the secret-scanning job failed on every push. A control that is always red gets ignored. | **Fixed**: `.gitleaks.toml` extends the default rules with one allowlist, limited to that rule, to dataset JSON paths, and to `author-…-year` slugs. Tree and history now scan clean; planted keys in the same files are still found. |
| 3 | Medium (design) | `scripts/sign-manifest.mjs`, `site/assets/js/trust.js` | Run without the private key, `npm run sign` silently makes a new key pair and rewrites `trust.js`. A pull request that changes data, re-signs and rewrites `trust.js` passes CI, because CI can only check consistency. | **Documented** in `SECURITY_MODEL.md`. Recommended: CODEOWNERS and required review for `site/assets/js/trust.js` and `site/data/` (needs the owner's GitHub handle and branch-protection settings). |
| 4 | Low | `site/assets/js/data.js` `verifySignature` | One `try` covered key import, signature decoding and verification, and turned any `TypeError`/`NotSupportedError` into `'unsupported'` (hash-only mode). Node 22 does not throw those for bad signatures, but whether the downgrade happens should depend only on the browser. | **Fixed**: only a failure to import the built-in key means `'unsupported'`. A malformed signature, or one that is not 64 bytes, or any error while verifying, is `'invalid'`. Tested. |
| 5 | Low | `site/learn/band-gap.js` (tooltip), `site/today/efficiency-records.js` (no-record branch of the tooltip) | ECharts HTML tooltips put dataset strings into the HTML without escaping (`materials.json` `short`, series `label`). The CSP stops scripts from running, but markup could be injected. Exploiting it needs signed data. | **Fixed**: `esc()` added to `dom.js` and used in both places. The `charts.js` comment now requires `esc()` for data in HTML formatters. All other HTML formatters only use code constants or numbers. |
| 6 | Low | `site/assets/js/data.js` | (a) Manifest entries were not checked: a non-numeric `bytes` turned off the size cap in hash-only mode. (b) The size cap was checked only after the whole body was buffered. (c) Only the origin was allowlisted; on `github.io` that origin includes every other project of the account. (d) Validators returning `null`/`undefined` were accepted (`=== false`), and `is.obj(null)` returned `null`. | **Fixed**: entries must have a safe-integer `bytes` and a 64-hex `sha256`; bodies are streamed against the cap (with an early `Content-Length` check); URLs must also be under `data/`, with no query or fragment; any falsy validator result rejects the data; `is.obj` returns a boolean. |
| 7 | Low | `site/assets/js/core.js` `progress.all` | A `so.progress` value of the wrong shape threw at boot, so citations, glossary tooltips, KaTeX and worked-example checks never ran on any page. Any page on a shared `github.io` origin can write that key. | **Fixed**: a value of the wrong shape falls back to empty progress. |
| 8 | Low | `site/sources.js`, `site/glossary.js` | A link whose fragment has a bad %-escape (`sources.html#%E0`) threw inside `render()`. The page then reported its signed data as failed ("could not be loaded"), a false integrity alarm triggered from a URL. | **Fixed**: decode inside `try`, and ignore a bad fragment. |
| 9 | Info | `site/equations.js` playground | The `values` object keyed by user-typed variable names inherited `constructor`, `__proto__` and similar keys, which gave confusing messages. There was no pollution: assigning a primitive to `__proto__` is ignored. | **Fixed**: `Object.create(null)`. |
| 10 | Low | `.github/workflows/release.yml` | The only provenance attestation was made on files downloaded back from the release. That proves what was on the release at that moment, not what the build produced. | **Fixed**: the build job now attests the installers it built, before upload (`id-token`/`attestations: write` added for that job only). The checksums job is unchanged. The glob paths need confirming on the next tag. |
| 11 | Low | `release.yml` | `tauri build` runs `cargo build` without `--locked`, so a stale `Cargo.lock` would be re-resolved silently. | **Fixed**: the release fails if `cargo metadata --locked` fails. The lockfile is current today. |
| 12 | Low | `security.yml` (CodeQL) | The job-level `permissions` dropped `contents: read`, which only works on public repositories. | **Fixed**: `actions: read`, `contents: read`, `security-events: write`. |
| 13 | Info | `.github/dependabot.yml` | No delay before adopting brand-new versions (A03: malicious releases are often pulled within days). | **Fixed**: `cooldown: { default-days: 7 }` per ecosystem. Security updates are not delayed. |
| 14 | Info | `SECURITY_MODEL.md` | Stated `core:default`; left out the timeline's `so.tl.filter` key, the ECharts HTML-tooltip exception, what hash-only mode protects against, the limits of a meta CSP and the shared `github.io` origin. | **Fixed** (document updated). |

### Checked and found sound

- No `pull_request_target`. No attacker-controlled `${{ github.* }}` in `run:`: the release uses
  `$GITHUB_REF_NAME` and `$GITHUB_REPOSITORY` as quoted environment variables, and the one interpolation
  (`matrix.platform`) is static. Every action is pinned to a full SHA. Every checkout uses
  `persist-credentials: false`. Top-level permissions are `contents: read`, raised per job only where
  needed. The only secret is `GITHUB_TOKEN`. The gitleaks download is checksum-verified.
- `npm ci --ignore-scripts` everywhere; the lockfile has `integrity` for all 21 packages, all from
  registry.npmjs.org; `package.json` has no lifecycle scripts.
- The CSP is identical on all 28 pages and comes before any script or stylesheet. No page loads anything
  from another origin. There is no first-party `innerHTML`, `eval`, `new Function`, `document.write`,
  `window.open` or `location` write. `h()` refuses `on*` and `style` attributes and sanitises `href`/`src`.
  KaTeX runs with `trust: false`, on page-authored TeX only.
- Network: only same-origin requests (signed data via `data.js`, `vendor/VENDOR.json` on the Sources page
  rendered as text with https-only links, vendored scripts, physics modules). No analytics, no cookies.
- Tauri: local `frontendDist`, `withGlobalTauri: false`, `freezePrototype`, the site CSP plus `ipc:`,
  no commands, no plugins, and `main.rs` does nothing but run the window. No listening ports.
- Slider and number inputs are range-checked before use (custom latitude, longitude and elevation; array
  size). Formulas are capped at 500 characters and nesting depth 64; evaluation recursion is bounded by
  the length cap.

## Residual risks

- **Shared `github.io` origin.** On `<user>.github.io/<repo>/`, `'self'` and `localStorage` are shared with
  every other project site of that account. A hostile sibling project can read and write the `so.*` keys
  (now shape-checked), and its scripts would satisfy `script-src 'self'` if markup injection were ever
  found. A custom domain removes this.
- **Framing.** A meta CSP cannot set `frame-ancestors`, and GitHub Pages sends no headers. The impact is
  low: the only state-changing button clears local progress.
- **Hash-only mode.** Browsers without WebCrypto Ed25519 (for example Chrome before 137) get hash checks
  against an unauthenticated manifest. That catches corruption, not a host that rewrites both files. A
  host that can do that can also replace `data.js`, so the signature mainly protects against data-only
  tampering.
- **Key custody** (finding 3) depends on review discipline until CODEOWNERS and branch protection exist.
- **Release window.** *Resolved 2026-10-02:* releases are now created as drafts and published only after
  `SHA256SUMS.txt` and the SBOM are attached; release builds use no npm or Rust caches; the build job runs
  only for `refs/tags/v*`, so `workflow_dispatch` on a branch builds nothing.
- **CSP leftovers.** *Resolved 2026-10-02:* `blob:` was removed from `worker-src` and `media-src` on all
  28 pages, in `check_site.py` and in the desktop app's CSP (`img-src` keeps `blob:` for chart export). `efficiency-records.js` writes a dataset
  `colour` into a CSS custom property through CSSOM: it cannot run script, and `img-src` blocks remote
  URLs.
- **Python test dependencies** are pinned at the top level only, without hashes. They are test-only and
  never shipped.
- **Desktop runtime** with the empty capability was exercised on Linux (WebKitGTK) only. The new
  attestation step is untested until the next tag.

## Verification at the end of the review

- `node scripts/sign-manifest.mjs --verify`: OK, 12 datasets.
- `python3 scripts/check_site.py`: OK, 28 pages.
- `node --test "tests/unit/*.test.mjs"`: 278 tests, all pass (including the two new files).
- `pytest tests/e2e/test_pages.py`: 112 passed.
- `pytest tests/e2e -k <pages touched>`: the page tests pass. Five accessibility tests fail (keyboard on
  `equations`; 320 px reflow on `timeline`, `sun-path`, `equations`, `sources`). They involve layout and
  focus, not the changes above, and `tests/e2e/test_a11y.py` was being edited in parallel.
- gitleaks 8.28.0 on the tree and the full history: no leaks with `.gitleaks.toml`.
