# Publishing Solar Odyssey to GitHub

One block, pasted once into an Ubuntu terminal, puts the project on GitHub as:

- **the website**, on GitHub Pages at `https://<your-username>.github.io/<repo>/`, and
- **the desktop app** (Windows, macOS and Linux installers), built by GitHub Actions and attached to a
  GitHub Release with SHA-256 checksums, a software bill of materials (SBOM) and signed build provenance.

It assumes a blank Ubuntu machine (Ubuntu 22.04 or newer, including Windows Subsystem for Linux 2 (WSL2)):
nothing installed, git not configured, not logged in to GitHub.

**Assumption:** `solar-odyssey.zip` is in `~/Downloads`. On WSL2, where Linux has no `~/Downloads`,
the block also looks in your Windows Downloads folder (`/mnt/c/Users/<you>/Downloads`) and takes the newest
`solar-odyssey*.zip` it finds.

**The one interactive moment:** the first time, `gh auth login` prints a one-time code and opens (or asks you
to open) github.com/login/device in a browser. Enter the code and approve. It asks for the `workflow`
permission because the project includes GitHub Actions workflows, and pushing those needs it. Everything
else runs straight through.

**Re-running is safe.** To publish an update, download the new zip and paste the same block again. It replaces
the files (keeping your git history), commits only if something changed, reuses the existing repository and
Pages site, and only creates the release tag if it does not exist yet. To publish a new desktop release, change
`APP_VERSION` (for example to `v1.2.0`) before pasting.

**The desktop app on this machine.** With `INSTALL_APP="yes"` the block keeps running after the site is live:
it waits for GitHub Actions to build the installers (about 20 minutes), downloads the Linux `.deb`, checks it
against `SHA256SUMS.txt` and its signed build provenance, and installs it with apt. Start it with
`solar-odyssey`. Under WSL2 on Windows 11 it opens as a normal window through WSLg. Windows and macOS users can
download their installer from the release page instead.

```bash
(
# ======== Edit these lines, then paste the whole block into an Ubuntu terminal ========
GH_USER="your-github-username"   # GitHub account that will own the repository
REPO="solar-odyssey"             # name of the repository to create (or update)
GIT_NAME="Your Name"             # name recorded on your commits
GIT_EMAIL=""                     # email on your commits; leave "" to use GitHub's private no-reply address
APP_VERSION="v1.1.0"             # desktop release to build; change it (v1.2.0, ...) to publish a new release
INSTALL_APP="yes"                # "yes" = wait for the desktop build (~20 min), verify it and install it here; "no" = skip
# =======================================================================================
set -euo pipefail
DEST="$HOME/projects/$REPO"

# Install git, unzip, rsync and curl from Ubuntu's archive (the only step that uses sudo, with the app install at the end).
if ! command -v git >/dev/null || ! command -v unzip >/dev/null || ! command -v rsync >/dev/null || ! command -v curl >/dev/null; then
  sudo apt-get update || echo "(apt-get update reported a problem with another package source; continuing)"
  sudo apt-get install -y git unzip rsync curl ca-certificates
fi
# Install the GitHub CLI (gh) from GitHub's official apt repository, still part of the apt install step.
if ! command -v gh >/dev/null; then
  sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get update || true
  sudo apt-get install -y gh
fi

# Log in to GitHub (interactive the first time) with the workflow permission, and let git use that login.
gh auth status --hostname github.com >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web --scopes workflow
ME="$(gh api user --jq .login)"
[ "${ME,,}" = "${GH_USER,,}" ] || gh auth switch --hostname github.com --user "$GH_USER" 2>/dev/null || gh auth login --hostname github.com --git-protocol https --web --scopes workflow
ME="$(gh api user --jq .login)"
[ "${ME,,}" = "${GH_USER,,}" ] || { echo "Logged in as $ME, not $GH_USER. Fix GH_USER or log in as $GH_USER, then paste again."; exit 1; }
SCOPES="$(gh api -i user 2>/dev/null | grep -i '^x-oauth-scopes:' || true)"
case "$SCOPES" in *workflow*) ;; *) gh auth refresh --hostname github.com --scopes workflow ;; esac
gh auth setup-git --hostname github.com

# Find the newest solar-odyssey*.zip in ~/Downloads, or in the Windows Downloads folder under WSL2, and check it is the right archive.
ZIP="$(ls -t "$HOME"/Downloads/solar-odyssey*.zip /mnt/c/Users/*/Downloads/solar-odyssey*.zip 2>/dev/null | head -n 1 || true)"
[ -n "$ZIP" ] || { echo "No solar-odyssey*.zip in ~/Downloads or /mnt/c/Users/*/Downloads. Download it first."; exit 1; }
unzip -Z1 "$ZIP" solar-odyssey/site/index.html >/dev/null 2>&1 || { echo "$ZIP does not look like the Solar Odyssey archive."; exit 1; }
echo "Using $ZIP"

# Unpack the archive into ~/projects/<repo>, replacing old files but keeping any existing git history.
TMP="$(mktemp -d)"; unzip -q "$ZIP" -d "$TMP"
mkdir -p "$DEST"
rsync -a --delete --exclude '.git/' --exclude 'node_modules/' --exclude 'desktop/src-tauri/target/' --exclude 'desktop/src-tauri/gen/' "$TMP/solar-odyssey/" "$DEST/"
rm -rf "$TMP"

# Create the project's own git repository (never touching a repository in your home folder) and set your identity for it.
[ -d "$DEST/.git" ] || git -C "$DEST" init -b main
[ "$(git -C "$DEST" rev-parse --show-toplevel)" = "$(cd "$DEST" && pwd -P)" ] || { echo "$DEST is not its own git repository; stopping."; exit 1; }
[ -n "$GIT_EMAIL" ] || GIT_EMAIL="$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
git -C "$DEST" config user.name "$GIT_NAME"
git -C "$DEST" config user.email "$GIT_EMAIL"

# Stamp the desktop app's version number from APP_VERSION.
V="${APP_VERSION#v}"
sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$V\"/" "$DEST/desktop/src-tauri/tauri.conf.json" "$DEST/package.json"
sed -i "0,/^version = \"[^\"]*\"/s//version = \"$V\"/" "$DEST/desktop/src-tauri/Cargo.toml"
sed -i "/^name = \"solar-odyssey\"$/{n;s/^version = \"[^\"]*\"/version = \"$V\"/}" "$DEST/desktop/src-tauri/Cargo.lock"

# Commit everything, but only if something changed since the last run.
git -C "$DEST" add -A
git -C "$DEST" diff --cached --quiet || git -C "$DEST" commit -q -m "Publish Solar Odyssey $APP_VERSION"
git -C "$DEST" log --oneline -1

# Create the public GitHub repository if it does not exist yet.
SITE_URL="https://${GH_USER,,}.github.io/$REPO/"
gh repo view "$GH_USER/$REPO" >/dev/null 2>&1 || gh repo create "$GH_USER/$REPO" --public \
  --description "The history, physics and future of solar power and the clean-energy system, as interactive lessons. Web + offline desktop app." \
  --homepage "$SITE_URL"

# Point the local repository at GitHub and push the main branch.
git -C "$DEST" remote get-url origin >/dev/null 2>&1 || git -C "$DEST" remote add origin "https://github.com/$GH_USER/$REPO.git"
git -C "$DEST" remote set-url origin "https://github.com/$GH_USER/$REPO.git"
git -C "$DEST" push -u origin main

# Turn on GitHub Pages, published by the repository's "Deploy site to GitHub Pages" workflow; on the first run, start that workflow once Pages exists.
if gh api -X POST "repos/$GH_USER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 6; gh workflow run pages.yml --repo "$GH_USER/$REPO" --ref main 2>/dev/null && break; done
else
  gh api -X PUT "repos/$GH_USER/$REPO/pages" -f build_type=workflow >/dev/null
fi

# Tag the desktop release (only if this version is new) so GitHub Actions builds the Windows, macOS and Linux apps.
git -C "$DEST" rev-parse -q --verify "refs/tags/$APP_VERSION" >/dev/null || git -C "$DEST" tag -a "$APP_VERSION" -m "Solar Odyssey $APP_VERSION"
git -C "$DEST" push origin "$APP_VERSION"

# Wait for the website to go live.
echo "Waiting for the website to go live (usually 1-3 minutes)..."
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL" || true)" = "200" ] && break
  sleep 10
done
echo "Website (live):       $SITE_URL"

# Optionally wait for the desktop build, verify the Linux package (checksum + signed provenance) and install it here.
if [ "$INSTALL_APP" = "yes" ]; then
  PUBLISHED="$(gh release view "$APP_VERSION" --repo "$GH_USER/$REPO" --json isDraft --jq '.isDraft' 2>/dev/null || true)"
  if [ "$PUBLISHED" != "false" ]; then
    echo "Waiting for GitHub Actions to build the desktop apps (about 20 minutes; you can leave this running)..."
    RUN=""
    for _ in $(seq 1 30); do
      RUN="$(gh run list --repo "$GH_USER/$REPO" --workflow release.yml --limit 20 --json databaseId,headBranch --jq ".[] | select(.headBranch==\"$APP_VERSION\") | .databaseId" | head -n 1)"
      [ -n "$RUN" ] && break; sleep 10
    done
    [ -n "$RUN" ] || { echo "The release build for $APP_VERSION did not start; see https://github.com/$GH_USER/$REPO/actions"; exit 1; }
    gh run watch "$RUN" --repo "$GH_USER/$REPO" --interval 30 --exit-status >/dev/null || { echo "The release build failed; see https://github.com/$GH_USER/$REPO/actions/runs/$RUN"; exit 1; }
  fi
  APPDIR="$(mktemp -d)"
  gh release download "$APP_VERSION" --repo "$GH_USER/$REPO" --dir "$APPDIR" --pattern '*.deb' --pattern 'SHA256SUMS.txt'
  DEB="$(find "$APPDIR" -maxdepth 1 -name '*.deb' | head -n 1)"
  (cd "$APPDIR" && sha256sum -c SHA256SUMS.txt --ignore-missing)
  if gh attestation --help >/dev/null 2>&1; then gh attestation verify "$DEB" --repo "$GH_USER/$REPO" >/dev/null && echo "Signed provenance verified: built by $GH_USER/$REPO's release workflow."; fi
  sudo apt-get install -y "$DEB"
  rm -rf "$APPDIR"
  echo "Desktop app installed: start it with   solar-odyssey   (on WSL2 it opens as a Windows window through WSLg)"
fi

echo
echo "Website (live):       $SITE_URL"
echo "Desktop downloads:    https://github.com/$GH_USER/$REPO/releases/tag/$APP_VERSION   (Windows .msi/.exe, macOS .dmg, Linux .deb/.rpm/.AppImage)"
echo "Repository:           https://github.com/$GH_USER/$REPO"
echo "Local copy:           $DEST"
)
```

## Optional: build and run the desktop app on this Ubuntu machine

The release above already gives you installers. To build the app yourself instead (this also runs under WSL2
with WSLg, which shows Linux windows on the Windows desktop):

```bash
(
set -euo pipefail
cd "$HOME/projects/solar-odyssey"
# Install the system libraries Tauri needs, plus Node.js and npm (apt install step, the only use of sudo).
sudo apt-get update || true
sudo apt-get install -y build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev nodejs npm
# Install the Rust toolchain for your user (no sudo) if it is not there yet.
command -v cargo >/dev/null || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
# Install the pinned JavaScript toolchain and build the app and a .deb package.
npm ci --ignore-scripts
npx tauri build --bundles deb
# Start the app.
./desktop/src-tauri/target/release/solar-odyssey
)
```

## Optional: view the site locally without installing anything

```bash
cd "$HOME/projects/solar-odyssey" && python3 -m http.server 8000 --directory site
# then open http://localhost:8000
```

## Verifying a desktop download

Every release carries `SHA256SUMS.txt` and signed build-provenance attestations made by GitHub Actions:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
gh attestation verify "Solar.Odyssey_1.1.0_amd64.deb" --repo <owner>/solar-odyssey
```
