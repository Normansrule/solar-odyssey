"""Browser smoke tests: every page loads under the strict CSP with no console
errors, no uncaught exceptions, a built header, verified data, and no failed
worked-example checks. Needs Playwright's Chromium (python -m playwright install chromium).

Set SO_SCREENSHOTS=1 to also save full-width screenshots to media/screens/.
"""
import http.server, os, re, socketserver, threading
from functools import partial
from pathlib import Path

import pytest

pw = pytest.importorskip("playwright.sync_api")

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
PAGES = re.findall(r"id: '([^']+)', path: '([^']+)'", (SITE / "assets/js/sitemap.js").read_text())


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="session")
def server():
    handler = partial(Quiet, directory=str(SITE))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="session")
def browser():
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.mark.parametrize("page_id,path", PAGES, ids=[p[0] for p in PAGES])
@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_page_loads_clean(server, browser, page_id, path, scheme):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, color_scheme=scheme, reduced_motion="reduce")
    page = ctx.new_page()
    errors: list[str] = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url} {r.failure}"))
    page.goto(server + path, wait_until="networkidle")
    page.wait_for_timeout(400)
    assert page.locator("#site-header .wordmark").count() == 1, "header was not built"
    assert page.locator("h1").count() == 1
    assert page.locator("[data-test-state='fail'], [data-test-state='error']").count() == 0, "a worked example failed its live check"
    assert page.locator(".data-badge[data-state='failed']").count() == 0, "a dataset failed its integrity check"
    assert page.locator(".references li:has-text('Missing source')").count() == 0
    # no horizontal scroll at desktop width
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "page scrolls sideways"
    if os.environ.get("SO_SCREENSHOTS") and scheme == "light":
        out = ROOT / "media" / "screens"
        out.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(out / f"{page_id}.png"), full_page=False)
    ctx.close()
    assert not errors, "\n".join(errors)


@pytest.mark.parametrize("page_id,path", PAGES, ids=[p[0] for p in PAGES])
def test_page_fits_phone(server, browser, page_id, path):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    page = ctx.new_page()
    page.goto(server + path, wait_until="networkidle")
    page.wait_for_timeout(300)
    wide = page.evaluate("document.documentElement.scrollWidth")
    ctx.close()
    assert wide <= 391, f"{path} is {wide}px wide on a 390px phone"


@pytest.mark.parametrize("page_id,path", PAGES, ids=[p[0] for p in PAGES])
def test_interaction_respects_csp(server, browser, page_id, path):
    """Hover every chart and canvas and switch to Expert depth: nothing may trip the
    Content Security Policy (for example a chart tooltip injecting style="" attributes)."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
    ctx.add_init_script("""
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', e =>
        window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sample || '')));
    """)
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(server + path, wait_until="networkidle")
    page.click(".depth-switch button[value='expert']")
    page.wait_for_timeout(300)
    targets = page.locator("[_echarts_instance_], canvas")
    for i in range(min(targets.count(), 25)):
        t = targets.nth(i)
        try:
            t.scroll_into_view_if_needed(timeout=2000)
            box = t.bounding_box()
            if not box or box["width"] < 20 or box["height"] < 20:
                continue
            for fx, fy in ((0.3, 0.5), (0.5, 0.4), (0.7, 0.6)):
                page.mouse.move(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
                page.wait_for_timeout(120)
        except Exception:
            continue
    violations = page.evaluate("window.__csp")
    ctx.close()
    assert not violations, "CSP violations:\n" + "\n".join(violations[:10])
    assert not errors, "\n".join(errors)
