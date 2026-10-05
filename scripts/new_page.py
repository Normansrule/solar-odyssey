#!/usr/bin/env python3
"""Create a page with the standard head (CSP, fonts, core.js) from the sitemap.

  python3 scripts/new_page.py <page-id>            create one page listed in sitemap.js
  python3 scripts/new_page.py --all-missing        create a stub for every listed page that is missing

Pages get a page-specific script and stylesheet next to them only when asked
(--js / --css), so the head stays minimal.
"""
import argparse, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
sys.path.insert(0, str(ROOT / "scripts"))
from check_site import CSP, sitemap_paths  # noqa: E402

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="no-referrer">
<title>{title_full}</title>
<meta name="description" content="{blurb}">
<link rel="icon" href="{root}assets/img/sun.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}assets/css/odyssey.css">{css}
<script type="module" src="{root}assets/js/core.js"></script>{js}
</head>
<body data-page="{id}">
<a class="skip" href="#main">Skip to content</a>
<header id="site-header"></header>
<main id="main" class="page">
  <header class="page-head">
    <h1>{title}</h1>
    <p class="lede">{blurb}</p>
  </header>
  <p class="noscript-note">This page is being written.</p>
</main>
<footer id="site-footer"></footer>
</body>
</html>
"""


def blurb_of(page_id: str) -> tuple[str, str]:
    src = (SITE / "assets/js/sitemap.js").read_text(encoding="utf-8")
    m = re.search(r"id: '%s', path: '[^']+', group: [^,]+, title: '((?:[^'\\]|\\.)*)', blurb: '((?:[^'\\]|\\.)*)'" % re.escape(page_id), src)
    if not m:
        raise SystemExit(f"{page_id} is not in sitemap.js")
    return m.group(1), m.group(2)


def create(page_id: str, path: str, js: bool, css: bool) -> None:
    dest = SITE / path
    if dest.exists():
        print(f"exists: {path}")
        return
    depth = path.count("/")
    root = "../" * depth
    stem = Path(path).stem
    title, blurb = blurb_of(page_id)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(TEMPLATE.format(
        csp=CSP, title=title, title_full=title if page_id == "home" else f"{title} – Solar Odyssey", blurb=blurb.replace('"', "&quot;"),
        root=root, id=page_id,
        css=f'\n<link rel="stylesheet" href="{stem}.css">' if css else "",
        js=f'\n<script type="module" src="{stem}.js"></script>' if js else "",
    ), encoding="utf-8")
    print(f"created: {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("id", nargs="?")
    ap.add_argument("--all-missing", action="store_true")
    ap.add_argument("--js", action="store_true")
    ap.add_argument("--css", action="store_true")
    a = ap.parse_args()
    pages = sitemap_paths()
    if a.all_missing:
        for pid, path in pages.items():
            create(pid, path, False, False)
    elif a.id:
        create(a.id, pages[a.id], a.js, a.css)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
