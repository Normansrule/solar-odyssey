"""Accessibility tests for every page.

1. axe-core (WCAG 2.0/2.1/2.2 A and AA rules) in the light theme, the dark theme and at
   Expert depth. Fails on any violation of impact "serious" or "critical" and prints every
   violation found. The same page load also checks the contrast of text drawn on <canvas>
   (chart labels, diagram labels), which axe cannot see.
2. Keyboard and screen-reader checks axe cannot make: every control is reached by Tab in
   order and shows a visible focus indicator that the sticky header does not hide; sliders,
   selects, checkboxes and buttons work from the keyboard and changing them updates a
   polite live region; canvases and SVG diagrams have a text alternative; with reduced
   motion nothing animates on its own.
3. Reflow: no sideways scrolling or clipped text at 200 % zoom (1280 px window = 640 CSS px)
   or at 320 px.
4. Header menus, glossary tooltips and the timeline's J/K keys.

Needs node_modules/axe-core (npm ci) and Playwright's Chromium. Browser contexts here are
created with bypass_csp=True (this file only) so axe can be injected into pages whose
Content Security Policy would otherwise refuse it.

Run: npm run test:a11y   (or python3 -m pytest -q tests/e2e/test_a11y.py)
"""
import http.server, re, socketserver, threading
from functools import partial
from pathlib import Path

import pytest

pw = pytest.importorskip("playwright.sync_api")

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
AXE = ROOT / "node_modules" / "axe-core" / "axe.min.js"
PROBE = Path(__file__).with_name("a11y_probe.js")
PAGES = re.findall(r"id: '([^']+)', path: '([^']+)'", (SITE / "assets/js/sitemap.js").read_text())
IDS = [p[0] for p in PAGES]
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]
BLOCKING = {"serious", "critical"}

if not AXE.exists():
    pytest.skip("axe-core is not installed: run npm ci", allow_module_level=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def server():
    handler = partial(Quiet, directory=str(SITE))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def open_page(browser, url, width=1280, height=900, scheme="light", reduced=True):
    ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme,
                              reduced_motion="reduce" if reduced else "no-preference", bypass_csp=True)
    ctx.add_init_script(path=str(PROBE))
    page = ctx.new_page()
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(400)  # charts, KaTeX and glossary settle
    return ctx, page


# --------------------------------------------------------------------------- 1. axe + canvas text

AXE_RUN = """async (tags) => {
  const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })) }));
}"""


def lum(c):
    f = [x / 255 for x in c]
    f = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in f]
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def canvas_text_problems(samples, mode):
    out, seen = [], set()
    for s in samples:
        large = s["size"] >= 24 or (s["bold"] and s["size"] >= 18.66)
        need = 3.0 if large else 4.5
        r = contrast(s["fg"], s["bg"])
        key = (s["canvas"], s["text"], tuple(round(x) for x in s["fg"]))
        if r + 0.02 < need and key not in seen:
            seen.add(key)
            out.append(f"[{mode}] canvas text {s['text']!r} in #{s['canvas']}: {r:.2f}:1 < {need}:1 "
                       f"(fg {tuple(round(x) for x in s['fg'])} on {tuple(round(x) for x in s['bg'])}, {s['size']:.0f}px)")
    return out


def report(violations):
    out = []
    for v in violations:
        out.append(f"[{v['impact']}] {v['id']}: {v['help']} ({len(v['nodes'])} node(s))")
        for n in v["nodes"][:8]:
            out.append(f"    {n['target']}\n      {n['summary'].replace(chr(10), chr(10) + '      ')}")
    return "\n".join(out)


@pytest.mark.parametrize("page_id,path", PAGES, ids=IDS)
def test_axe_and_canvas_contrast(server, browser, page_id, path):
    """axe in light, dark and Expert depth on one page load; canvas text contrast in both themes."""
    ctx, page = open_page(browser, server + path)
    try:
        page.add_script_tag(path=str(AXE))
        results, canvas = {}, []
        results["light"] = page.evaluate(AXE_RUN, TAGS)
        # Canvases redraw on a theme change: record every label drawn in dark, then in light.
        page.evaluate("window.__so.collectText = true; window.__so.text = []")
        page.emulate_media(color_scheme="dark")
        page.wait_for_timeout(500)
        results["dark"] = page.evaluate(AXE_RUN, TAGS)
        canvas += canvas_text_problems(page.evaluate("window.__so.text.splice(0)"), "dark")
        page.emulate_media(color_scheme="light")
        page.wait_for_timeout(500)
        canvas += canvas_text_problems(page.evaluate("window.__so.text.splice(0)"), "light")
        page.evaluate("window.__so.collectText = false")
        page.click(".depth-switch button[value='expert']")
        page.wait_for_timeout(400)
        results["expert"] = page.evaluate(AXE_RUN, TAGS)
    finally:
        ctx.close()
    msgs, blocking = [], []
    for mode, violations in results.items():
        if violations:
            msgs.append(f"{path} ({mode}):\n{report(violations)}")
        bad = [v for v in violations if v["impact"] in BLOCKING]
        if bad:
            blocking.append(f"{path} ({mode}):\n{report(bad)}")
    if msgs or canvas:
        print("\n" + "\n".join(msgs + canvas))
    assert not blocking, "serious/critical accessibility violations:\n" + "\n".join(blocking)
    assert not canvas, "text drawn on canvas without enough contrast:\n" + "\n".join(canvas[:30])


# --------------------------------------------------------------------------- 2. keyboard + screen reader

HELPERS = """
window.__a11y = (() => {
  const ids = new WeakMap(); let next = 1; const byId = new Map();
  const idOf = (el) => { if (!ids.has(el)) { ids.set(el, next); byId.set(next, el); next += 1; } return ids.get(el); };
  const visible = (el) => {
    if (!el.isConnected || el.closest('[inert]')) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const describe = (el) => {
    if (!el || el === document.body) return 'body';
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push('#' + el.id);
    const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class');
    if (cls) bits.push('.' + cls.trim().split(/\\s+/).slice(0, 2).join('.'));
    const name = el.getAttribute('aria-label') || (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) || el.getAttribute('type') || '';
    return bits.join('') + (name ? ` "${name}"` : '');
  };
  const signature = (el) => [el.tagName, el.getAttribute('class'), el.getAttribute('role'), el.getAttribute('type'),
    el.parentElement?.getAttribute('class'), el.closest('header,nav,footer,main,aside')?.tagName].join('|');
  const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], audio[controls], video[controls], [contenteditable=""], [contenteditable="true"]';
  const focusables = () => [...document.querySelectorAll(FOCUSABLE)].filter((el) =>
    !el.disabled && el.tabIndex >= 0 && el.getAttribute('tabindex') !== '-1' && visible(el)
    && !(el.tagName === 'INPUT' && el.type === 'hidden'));
  const name = (el) => {
    const l = el.getAttribute('aria-label'); if (l && l.trim()) return l.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\\s+/).map((i) => document.getElementById(i)?.textContent || '').join(' ').trim(); if (t) return t; }
    if (el.tagName.toLowerCase() === 'svg') { const t = el.querySelector(':scope > title'); if (t && t.textContent.trim()) return t.textContent.trim(); }
    return '';
  };
  const liveRoot = (n) => {
    const el = n.nodeType === 1 ? n : n.parentElement;
    return el && el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"], output');
  };
  let muts = [];
  const mo = new MutationObserver((list) => { muts.push(...list); });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  return {
    idOf, describe, signature, focusables, name, visible,
    el: (id) => byId.get(id),
    active() {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      // a visually hidden input (custom chip or switch) shows its focus on its label
      const box = el.getBoundingClientRect();
      const r = (box.width < 4 || box.height < 4) && el.labels?.length ? el.labels[0].getBoundingClientRect() : box;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const cy = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 1), innerHeight - 1);
      const hit = document.elementFromPoint(cx, cy);
      const header = document.getElementById('site-header');
      const cs = getComputedStyle(el);
      return { id: idOf(el), desc: describe(el), sig: signature(el),
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        obscured: Boolean(hit && header && header.contains(hit) && !header.contains(el)),
        outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
        hidden: Boolean(el.closest('[aria-hidden="true"]')) };
    },
    rect(id) {
      const el = byId.get(id); if (!el) return null;
      let r = el.getBoundingClientRect();
      if ((r.width < 4 || r.height < 4) && el.labels?.length) r = el.labels[0].getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
    resetMuts() { mo.takeRecords(); muts = []; return window.__so.draws; },
    effect(selfId) {
      muts.push(...mo.takeRecords());
      const self = byId.get(selfId);
      const out = { mutations: 0, text: 0, live: 0, liveText: [] };
      for (const m of muts) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (m.type === 'attributes' && t === self && ['aria-describedby', 'value', 'data-test-state'].includes(m.attributeName)) continue;
        if (t && t.closest && t.closest('.term-tip')) continue;
        out.mutations += 1;
        if (m.type !== 'attributes') {
          out.text += 1;
          const lr = liveRoot(m.target);
          if (lr) { out.live += 1; if (out.liveText.length < 2) out.liveText.push((lr.textContent || '').trim().slice(0, 60)); }
        }
      }
      return out;
    },
  };
})();
"""

CONTROLS = """() => {
  const A = window.__a11y; const out = [];
  const inMain = (el) => !el.closest('#site-header, #site-footer, .lesson-nav, .lesson-complete');
  for (const el of A.focusables()) {
    if (!inMain(el)) continue;
    const tag = el.tagName.toLowerCase(); const type = (el.getAttribute('type') || '').toLowerCase();
    let kind = null;
    if (tag === 'input' && type === 'range') kind = 'range';
    else if (tag === 'input' && (type === 'checkbox' || type === 'radio')) kind = type;
    else if (tag === 'select') kind = 'select';
    else if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'tab') kind = 'arrows';
    else if (tag === 'button' || el.getAttribute('role') === 'button') kind = 'button';
    else if ('scrolls' in el.dataset) kind = null; // a focusable scroll box (wide equation): nothing to operate
    else if (['img', 'group', 'region', 'application'].includes(el.getAttribute('role')) && el.getAttribute('tabindex') === '0') kind = 'arrows';
    else if (tag !== 'a' && tag !== 'input' && tag !== 'textarea' && el.getAttribute('tabindex') === '0' && el.getAttribute('role')) kind = 'button';
    if (kind) out.push({ id: A.idOf(el), kind, desc: A.describe(el), sig: A.signature(el) });
  }
  return out;
}"""

LABELS = """() => {
  const A = window.__a11y; const bad = [];
  const hidden = (el) => el.closest('[aria-hidden="true"], .katex-html, .katex');
  for (const el of document.querySelectorAll('canvas, svg')) {
    if (!A.visible(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 30) continue;
    if (el.closest('button, a, [role="button"]')) continue;
    // the element or an ancestor carries the text alternative (ECharts: role=img on the container)
    let ok = false;
    for (let e = el, i = 0; e && i < 4; e = e.parentElement, i += 1) {
      const role = e.getAttribute('role');
      if (['img', 'group', 'figure', 'application', 'graphics-document', 'region'].includes(role) && A.name(e)) { ok = true; break; }
      if (role === 'presentation' || role === 'none') { ok = true; break; }
    }
    if (!ok) bad.push(A.describe(el));
  }
  const assertive = [...document.querySelectorAll('[aria-live="assertive"]')].map(A.describe);
  return { bad, assertive };
}"""

SNAPSHOT = """() => {
  const out = {};
  document.querySelectorAll('canvas').forEach((c, i) => { try { const d = c.toDataURL(); out['canvas' + i + (c.id ? '#' + c.id : '')] = d.length + ':' + d.slice(-200); } catch { /* skip */ } });
  document.querySelectorAll('main svg').forEach((s, i) => { out['svg' + i + (s.id ? '#' + s.id : '')] = new XMLSerializer().serializeToString(s).length + ':' + s.innerHTML.slice(0, 0); });
  out.text = document.getElementById('main')?.innerText.length;
  return out;
}"""


def clip_shot(page, rect, pad=8):
    vw, vh = page.viewport_size["width"], page.viewport_size["height"]
    x0, y0 = max(0, rect["x"] - pad), max(0, rect["y"] - pad)
    x1, y1 = min(vw, rect["x"] + rect["w"] + pad), min(vh, rect["y"] + rect["h"] + pad)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    return page.screenshot(clip={"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}, animations="disabled")


@pytest.mark.parametrize("page_id,path", PAGES, ids=IDS)
def test_keyboard_and_screen_reader(server, browser, page_id, path):
    ctx, page = open_page(browser, server + path)
    problems: list[str] = []
    try:
        page.mouse.move(0, 0)
        # Reduced motion: nothing may change on its own after the page has settled.
        before = page.evaluate(SNAPSHOT)
        page.wait_for_timeout(1500)
        after = page.evaluate(SNAPSHOT)
        moved = [k for k in before if before[k] != after.get(k)]
        if moved:
            problems.append(f"with reduced motion these still change on their own: {moved}")

        page.evaluate(HELPERS)
        labels = page.evaluate(LABELS)
        problems += [f"canvas/svg without role=img + aria-label (or equivalent): {d}" for d in labels["bad"]]
        problems += [f"aria-live=assertive (should be polite): {d}" for d in labels["assertive"]]

        # Tab through the whole page from the top.
        # A radio group is one Tab stop (arrow keys move inside it), so expect each group once.
        groups = page.evaluate("""window.__a11y.focusables().map((el) => [window.__a11y.idOf(el),
            el.type === 'radio' && el.name ? el.name : null])""")
        expected, radio_group, seen_groups = [], {}, set()
        for k, g in groups:
            if g:
                radio_group[k] = g
                if g in seen_groups:
                    continue
                seen_groups.add(g)
            expected.append(k)
        page.evaluate("window.scrollTo(0, 0); document.activeElement && document.activeElement.blur()")
        seen, sigs = set(), set()
        pending = None  # (id, desc, png) of the last sampled stop, compared once focus has moved on
        first = None
        for _ in range(len(expected) + 40):
            page.keyboard.press("Tab")
            a = page.evaluate("window.__a11y.active()")
            if pending:
                pid, pdesc, png = pending
                r = page.evaluate("(id) => window.__a11y.rect(id)", pid)
                if r and png is not None and r["y"] >= 0 and r["y"] + r["h"] <= page.viewport_size["height"]:
                    if clip_shot(page, r) == png:
                        problems.append(f"no visible focus indicator: {pdesc}")
                pending = None
            if a is None:
                if first is not None:
                    break
                continue
            if a["id"] == first:
                break
            first = first or a["id"]
            if a["id"] in seen:
                continue
            seen.add(a["id"])
            if a["hidden"]:
                problems.append(f"focusable inside aria-hidden: {a['desc']}")
            if not a["inView"]:
                problems.append(f"focused element is off screen: {a['desc']}")
            elif a["obscured"]:
                problems.append(f"focused element is hidden under the sticky header: {a['desc']}")
            if a["sig"] not in sigs and len(sigs) < 45:
                sigs.add(a["sig"])
                pending = (a["id"], a["desc"], clip_shot(page, a["rect"]))
        reached_groups = {radio_group[k] for k in seen if k in radio_group}
        missed = [k for k in expected if k not in seen and not (k in radio_group and radio_group[k] in reached_groups)]
        for k in missed[:10]:
            problems.append(f"never reached by Tab: {page.evaluate('(id) => window.__a11y.describe(window.__a11y.el(id))', k)}")

        # Operate every control from the keyboard.
        controls = page.evaluate(CONTROLS)
        tried_sig: dict[str, int] = {}
        for c in controls:
            if tried_sig.get(c["sig"], 0) >= 3:
                continue  # three of a kind is enough (long lists of identical buttons)
            tried_sig[c["sig"]] = tried_sig.get(c["sig"], 0) + 1
            page.evaluate("(id) => { const el = window.__a11y.el(id); el.scrollIntoView({ block: 'center' }); el.focus(); }", c["id"])
            page.wait_for_timeout(60)
            state0 = page.evaluate("(id) => { const el = window.__a11y.el(id); return [el.value, el.checked, el.getAttribute('aria-pressed'), el.getAttribute('aria-expanded'), el.getAttribute('aria-selected'), location.hash, scrollY]; }", c["id"])
            draws0 = page.evaluate("window.__a11y.resetMuts()")
            if c["kind"] == "range":
                at_max = page.evaluate("(id) => { const el = window.__a11y.el(id); return Number(el.value) >= Number(el.max || 100); }", c["id"])
                page.keyboard.press("ArrowLeft" if at_max else "ArrowRight")
            elif c["kind"] == "select":
                n = page.evaluate("(id) => window.__a11y.el(id).options.length", c["id"])
                if n < 2:
                    continue
                at_end = page.evaluate("(id) => { const el = window.__a11y.el(id); return el.selectedIndex === el.options.length - 1; }", c["id"])
                page.keyboard.press("ArrowUp" if at_end else "ArrowDown")
            elif c["kind"] in ("checkbox", "radio"):
                page.keyboard.press("Space")
            elif c["kind"] == "arrows":
                page.keyboard.press("ArrowRight")
            else:
                page.keyboard.press("Enter")
            page.wait_for_timeout(160)
            state1 = page.evaluate("(id) => { const el = window.__a11y.el(id); return [el.value, el.checked, el.getAttribute('aria-pressed'), el.getAttribute('aria-expanded'), el.getAttribute('aria-selected'), location.hash, scrollY]; }", c["id"])
            draws1 = page.evaluate("window.__so.draws")
            eff = page.evaluate("(id) => window.__a11y.effect(id)", c["id"])
            focus_moved = page.evaluate("(id) => document.activeElement !== window.__a11y.el(id)", c["id"])
            changed = state1 != state0 or eff["mutations"] > 0 or draws1 > draws0 or focus_moved
            if not changed:
                problems.append(f"keyboard does nothing: {c['kind']} {c['desc']}")
            elif c["kind"] in ("range", "select", "checkbox", "radio", "arrows") and eff["text"] and not eff["live"]:
                problems.append(f"{c['kind']} {c['desc']} changes text on the page but no polite live region announces it")
            # undo toggles so the next control starts from the page's usual state
            if c["kind"] == "checkbox" or (c["kind"] == "button" and state0[2] is not None and state1[2] != state0[2]):
                if page.evaluate("(id) => document.activeElement === window.__a11y.el(id)", c["id"]):
                    page.keyboard.press("Space" if c["kind"] == "checkbox" else "Enter")
                    page.wait_for_timeout(120)
            page.keyboard.press("Escape")
    finally:
        ctx.close()
    if problems:
        print(f"\n{path}:\n  " + "\n  ".join(problems))
    assert not problems, f"{path}:\n  " + "\n  ".join(problems)


# --------------------------------------------------------------------------- 3. reflow

CLIPPED = """() => {
  const out = [];
  for (const el of document.querySelectorAll('#main *, #site-header *')) {
    if (el.closest('.katex, .visually-hidden, svg, canvas, [aria-hidden="true"]') || !el.checkVisibility()) continue;
    const box = el.getBoundingClientRect(); if (box.width <= 2 || box.height <= 2) continue; // deliberately hidden (clip-path)
    const cs = getComputedStyle(el);
    const ox = cs.overflowX; const oy = cs.overflowY;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text && !el.querySelector(':scope > :not(div,section,ul,ol)')) continue;
    if ((ox === 'hidden' || ox === 'clip') && el.scrollWidth > el.clientWidth + 2) out.push('cut sideways: ' + window.__a11y.describe(el));
    else if ((oy === 'hidden' || oy === 'clip') && el.scrollHeight > el.clientHeight + 2 && cs.display !== 'inline') out.push('cut off below: ' + window.__a11y.describe(el));
    else if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push('ellipsis: ' + window.__a11y.describe(el));
  }
  return out.slice(0, 12);
}"""


@pytest.mark.parametrize("page_id,path", PAGES, ids=IDS)
def test_reflow_200_percent_and_320px(server, browser, page_id, path):
    """200 % zoom of a 1280 x 900 window is a 640 x 450 CSS-pixel viewport; 320 px is WCAG 1.4.10's width;
    then the browser's text size alone at 200 % (WCAG 1.4.4)."""
    ctx, page = open_page(browser, server + path, width=640, height=450)
    problems = []
    try:
        page.evaluate(HELPERS)
        page.click(".depth-switch button[value='expert']")
        page.wait_for_timeout(300)
        for w, h in ((640, 450), (320, 640)):
            page.set_viewport_size({"width": w, "height": h})
            page.wait_for_timeout(400)
            wide = page.evaluate("document.documentElement.scrollWidth")
            if wide > w + 1:
                culprits = page.evaluate("""(w) => [...document.querySelectorAll('#main *')].filter((el) => {
                    const r = el.getBoundingClientRect(); return r.right > w + 1 && el.checkVisibility() && !el.closest('.table-wrap, [data-scrolls], pre');
                  }).slice(0, 5).map(window.__a11y.describe)""", w)
                problems.append(f"{w}px: page is {wide}px wide; overflowing: {culprits}")
            problems += [f"{w}px: {c}" for c in page.evaluate(CLIPPED)]
        # Text-only resize: the browser's default font size doubled (16 -> 32 px), window 1280 px wide.
        page.set_viewport_size({"width": 1280, "height": 900})
        cdp = page.context.new_cdp_session(page)
        cdp.send("Page.enable")
        cdp.send("Page.setFontSizes", {"fontSizes": {"standard": 32, "fixed": 26}})
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(400)
        page.evaluate(HELPERS)
        wide = page.evaluate("document.documentElement.scrollWidth")
        if wide > 1281:
            problems.append(f"text at 200 %: page is {wide}px wide in a 1280px window")
        problems += [f"text at 200 %: {c}" for c in page.evaluate(CLIPPED)]
    finally:
        ctx.close()
    if problems:
        print(f"\n{path}:\n  " + "\n  ".join(problems))
    assert not problems, f"{path}:\n  " + "\n  ".join(problems)


# --------------------------------------------------------------------------- 4. site-wide widgets

def test_header_menus_keyboard(server, browser):
    ctx, page = open_page(browser, server + "learn/band-gap.html")
    try:
        btn = page.locator(".nav-group > button").first
        btn.focus()
        page.keyboard.press("Enter")
        assert btn.get_attribute("aria-expanded") == "true"
        menu = page.locator("#" + btn.get_attribute("aria-controls"))
        assert menu.is_visible()
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('.nav-menu') !== null"), "Tab does not enter the open menu"
        page.keyboard.press("Escape")
        assert btn.get_attribute("aria-expanded") == "false" and not menu.is_visible()
        assert page.evaluate("document.activeElement === document.querySelector('.nav-group > button')"), "Escape does not return focus to the menu button"
        # Space opens it too, and opening another closes the first
        page.keyboard.press("Space")
        assert btn.get_attribute("aria-expanded") == "true"
        page.locator(".nav-group > button").nth(1).focus()
        page.keyboard.press("Enter")
        assert btn.get_attribute("aria-expanded") == "false"
        page.keyboard.press("Escape")
        # depth and theme switches
        page.locator(".depth-switch button[value='expert']").focus()
        page.keyboard.press("Enter")
        assert page.evaluate("document.documentElement.dataset.depth") == "expert"
        page.locator(".theme-toggle").focus()
        page.keyboard.press("Enter")
        assert page.evaluate("document.documentElement.dataset.theme") == "light"
        # phone layout: the menu button opens the whole navigation; Escape closes it and returns focus
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(200)
        mb = page.locator(".menu-toggle")
        mb.focus()
        page.keyboard.press("Enter")
        assert mb.get_attribute("aria-expanded") == "true" and page.locator("#site-nav").is_visible()
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('#site-nav') !== null")
        page.keyboard.press("Escape")
        assert mb.get_attribute("aria-expanded") == "false" and not page.locator("#site-nav").is_visible()
        assert page.evaluate("document.activeElement === document.querySelector('.menu-toggle')")
    finally:
        ctx.close()


def test_skip_link_moves_focus_to_main(server, browser):
    ctx, page = open_page(browser, server + "learn/band-gap.html")
    try:
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.classList.contains('skip')"), "first Tab stop is not the skip link"
        page.keyboard.press("Enter")
        page.keyboard.press("Tab")
        assert page.evaluate("document.getElementById('main').contains(document.activeElement)"), "skip link does not lead into the main content"
    finally:
        ctx.close()


def test_glossary_tooltip_on_focus(server, browser):
    ctx, page = open_page(browser, server + "learn/band-gap.html")
    try:
        term = page.locator("dfn[data-term]").first
        term.focus()
        tip = page.locator(".term-tip")
        assert tip.is_visible() and tip.get_attribute("role") == "tooltip"
        assert term.get_attribute("aria-describedby") == tip.get_attribute("id")
        page.keyboard.press("Escape")
        assert tip.count() == 0, "Escape does not dismiss the glossary tooltip"
        assert term.get_attribute("aria-describedby") is None, "aria-describedby points at a tooltip that is gone"
        # WCAG 1.4.13: the pointer can move from the term onto the tooltip without it vanishing
        term.hover()
        page.wait_for_timeout(100)
        box = page.locator(".term-tip").bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=6)
        page.wait_for_timeout(300)
        assert page.locator(".term-tip").count() == 1, "tooltip disappears when the pointer moves onto it"
    finally:
        ctx.close()


def test_timeline_j_k_keys(server, browser):
    ctx, page = open_page(browser, server + "timeline.html")
    try:
        page.locator("h1").click()
        y0 = page.evaluate("scrollY")
        page.keyboard.press("j")
        page.wait_for_timeout(500)
        y1 = page.evaluate("scrollY")
        assert y1 > y0, "J does not move to the next event"
        page.keyboard.press("j")
        page.wait_for_timeout(500)
        page.keyboard.press("k")
        page.wait_for_timeout(500)
        assert page.evaluate("scrollY") < page.evaluate("document.documentElement.scrollHeight"), "K does not move back"
        focused = page.evaluate("document.activeElement.closest('.tl-ev') !== null")
        assert focused, "J/K should move keyboard focus to the event so screen readers read it"
    finally:
        ctx.close()
