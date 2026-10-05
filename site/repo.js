// Where this copy of the site lives on GitHub, worked out at run time.
// Served from <user>.github.io/<repo>/ -> https://github.com/<user>/<repo>;
// served from <user>.github.io/ -> the user-site repository <user>.github.io;
// anywhere else (localhost, the desktop app, a mirror) -> null.

/** @param {URL|Location} loc the site root */
export function repoUrl(loc) {
  const host = String(loc.hostname).toLowerCase();
  const m = /^([a-z0-9-]+)\.github\.io$/.exec(host);
  if (!m) return null;
  const seg = String(loc.pathname).split('/').filter(Boolean)[0];
  const repo = seg && /^[A-Za-z0-9._-]+$/.test(seg) && !seg.endsWith('.html') ? seg : `${m[1]}.github.io`;
  return `https://github.com/${m[1]}/${repo}`;
}
