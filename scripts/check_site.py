#!/usr/bin/env python3
"""Static checks for every page in site/ (no network, no browser).

Fails the build when a page:
  - is missing from site/assets/js/sitemap.js (or the sitemap lists a missing page),
  - lacks the exact Content Security Policy, charset, viewport, title, description or lang,
  - has inline scripts, <style> blocks, style="" attributes, on* handlers or javascript: URLs,
  - loads a script, stylesheet, font or image from another origin,
  - links to a file or #fragment that does not exist,
  - cites a source id missing from data/sources.json, or a glossary term missing from data/glossary.json,
  - has an <img> without alt text, or not exactly one <h1>.
Also scans site JavaScript (not vendor/) for eval, new Function, innerHTML and friends.
"""
import json, re, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; "
       "connect-src 'self'; media-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; "
       "form-action 'none'; upgrade-insecure-requests")
DYNAMIC_FRAGMENTS = re.compile(r"^(ref-|src-|term-|eq-|ev-|era-)")
JS_FORBIDDEN = [
    (re.compile(r"\beval\s*\("), "eval()"),
    (re.compile(r"\bnew\s+Function\s*\("), "new Function()"),
    (re.compile(r"\.(innerHTML|outerHTML)\s*[+]?="), "innerHTML/outerHTML assignment"),
    (re.compile(r"insertAdjacentHTML\s*\("), "insertAdjacentHTML()"),
    (re.compile(r"document\.write\s*\("), "document.write()"),
    (re.compile(r"setTimeout\s*\(\s*['\"`]"), "setTimeout with a string"),
    (re.compile(r"setAttribute\(\s*['\"]style['\"]"), "setAttribute('style') (use el.style.x or classes)"),
]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict]] = []
        self.ids: set[str] = set()
        self.inline_script = False
        self.in_script_without_src = False
        self.style_blocks = 0
        self.h1 = 0

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        self.tags.append((tag, a))
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "script":
            self.in_script_without_src = "src" not in a
        if tag == "style":
            self.style_blocks += 1
        if tag == "h1":
            self.h1 += 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script_without_src = False

    def handle_data(self, data):
        if self.in_script_without_src and data.strip():
            self.inline_script = True


def sitemap_paths() -> dict:
    src = (SITE / "assets/js/sitemap.js").read_text(encoding="utf-8")
    return dict(re.findall(r"id: '([^']+)', path: '([^']+)'", src))


def load_json(name):
    p = SITE / "data" / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def main() -> int:
    problems: list[str] = []
    pages = sitemap_paths()
    path_to_id = {v: k for k, v in pages.items()}
    sources = load_json("sources.json")
    glossary = load_json("glossary.json")
    html_files = sorted(p for p in SITE.rglob("*.html") if "vendor" not in p.parts)
    parsed: dict[Path, Page] = {}
    for f in html_files:
        pg = Page()
        pg.feed(f.read_text(encoding="utf-8"))
        parsed[f] = pg

    for rel in pages.values():
        if not (SITE / rel).exists():
            problems.append(f"sitemap lists {rel} but the file does not exist")

    for f, pg in parsed.items():
        rel = f.relative_to(SITE).as_posix()
        where = f"site/{rel}"
        if rel not in path_to_id:
            problems.append(f"{where}: not listed in sitemap.js")
        tags = pg.tags
        html = next((a for t, a in tags if t == "html"), {})
        if html.get("lang") != "en":
            problems.append(f"{where}: <html lang=\"en\"> missing")
        metas = [a for t, a in tags if t == "meta"]
        if not any(m.get("charset", "").lower() == "utf-8" for m in metas):
            problems.append(f"{where}: <meta charset=\"utf-8\"> missing")
        if not any(m.get("name") == "viewport" for m in metas):
            problems.append(f"{where}: viewport meta missing")
        if not any(m.get("name") == "description" and m.get("content") for m in metas):
            problems.append(f"{where}: description meta missing")
        csp = [m.get("content") for m in metas if m.get("http-equiv", "").lower() == "content-security-policy"]
        if csp != [CSP]:
            problems.append(f"{where}: Content-Security-Policy meta is missing or differs from the site policy")
        if not any(t == "title" for t, _ in tags):
            problems.append(f"{where}: <title> missing")
        body = next((a for t, a in tags if t == "body"), {})
        if rel in path_to_id and body.get("data-page") != path_to_id[rel]:
            problems.append(f"{where}: <body data-page> should be '{path_to_id[rel]}'")
        for need in ("site-header", "main", "site-footer"):
            if need not in pg.ids:
                problems.append(f"{where}: element #{need} missing")
        if pg.inline_script:
            problems.append(f"{where}: inline <script> content (CSP forbids it; move to a .js file)")
        if pg.style_blocks:
            problems.append(f"{where}: <style> block (CSP forbids it; move to a .css file)")
        if pg.h1 != 1:
            problems.append(f"{where}: has {pg.h1} <h1> elements (want exactly 1)")
        if not any(t == "script" and a.get("src", "").endswith("assets/js/core.js") for t, a in tags):
            problems.append(f"{where}: does not load assets/js/core.js")

        for t, a in tags:
            for k, v in a.items():
                if k.startswith("on"):
                    problems.append(f"{where}: <{t} {k}=…> inline event handler")
                if k == "style":
                    problems.append(f"{where}: <{t} style=…> inline style attribute")
                if k in ("href", "src", "xlink:href") and v.strip().lower().startswith("javascript:"):
                    problems.append(f"{where}: javascript: URL")
            if t == "img" and "alt" not in a:
                problems.append(f"{where}: <img src={a.get('src')}> has no alt attribute")
            ref = a.get("src") if t in ("script", "img", "source", "iframe", "video", "audio") else a.get("href") if t == "link" else None
            if ref and re.match(r"^(https?:)?//", ref):
                problems.append(f"{where}: <{t}> loads a third-party resource {ref}")
            link = a.get("href") if t in ("a", "link", "area") else a.get("src") if t in ("script", "img", "source") else None
            if not link or re.match(r"^(https?:|mailto:|data:|blob:)", link):
                continue
            target, _, frag = link.partition("#")
            if target:
                dest = (f.parent / target.split("?")[0]).resolve()
                if dest.is_dir():
                    dest = dest / "index.html"
                if not dest.exists():
                    problems.append(f"{where}: broken link {link}")
                    continue
                if frag and dest.suffix == ".html" and dest in parsed and frag not in parsed[dest].ids and not DYNAMIC_FRAGMENTS.match(frag):
                    problems.append(f"{where}: link {link} points at a missing #{frag}")
            elif frag and frag not in pg.ids and not DYNAMIC_FRAGMENTS.match(frag) and frag != "main":
                problems.append(f"{where}: in-page link #{frag} has no target")
            if "main" not in pg.ids and frag == "main":
                problems.append(f"{where}: skip link target #main missing")

        for t, a in tags:
            if t == "sup" and "cite" in a.get("class", "").split():
                for sid in filter(None, (s.strip() for s in a.get("data-src", "").split(","))):
                    if sid not in sources:
                        problems.append(f"{where}: cites unknown source '{sid}' (add it to data-src/sources/)")
            if t == "dfn" and "data-term" in a and a["data-term"] not in glossary:
                problems.append(f"{where}: glossary term '{a['data-term']}' is not defined (add it to data-src/glossary/)")

    for js in sorted(p for p in SITE.rglob("*.js") if "vendor" not in p.parts):
        text = js.read_text(encoding="utf-8")
        for rx, what in JS_FORBIDDEN:
            if rx.search(text):
                problems.append(f"site/{js.relative_to(SITE).as_posix()}: uses {what}")
        if re.search(r"""(import|from)\s*\(?\s*['"]https?://""", text):
            problems.append(f"site/{js.relative_to(SITE).as_posix()}: imports code from another origin")

    for css in sorted(p for p in SITE.rglob("*.css") if "vendor" not in p.parts):
        if re.search(r"url\(\s*['\"]?(https?:)?//", css.read_text(encoding="utf-8")):
            problems.append(f"site/{css.relative_to(SITE).as_posix()}: loads a third-party url()")

    if problems:
        print(f"check-site FAILED ({len(problems)} problems):")
        for p in problems:
            print("  " + p)
        return 1
    print(f"check-site OK: {len(parsed)} pages, {len(sources)} sources, {len(glossary)} glossary terms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
