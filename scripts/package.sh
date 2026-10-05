#!/usr/bin/env bash
# Packages the committed repository (no node_modules, .git, build output) as dist/solar-odyssey.zip
# with a top-level solar-odyssey/ folder. Commit first: only committed files are included.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
git diff --quiet && git diff --cached --quiet || echo "warning: uncommitted changes are NOT in the zip" >&2
rm -f dist/solar-odyssey.zip
git archive --format=zip --prefix=solar-odyssey/ -o dist/solar-odyssey.zip HEAD
ls -l dist/solar-odyssey.zip
