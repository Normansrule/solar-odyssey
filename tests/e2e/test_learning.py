"""Browser tests for the learning features: lesson quizzes and objectives, site
search, and the teachers' guide. Uses the server/browser fixtures style of test_pages.py."""
import http.server, json, re, socketserver, threading
from functools import partial
from pathlib import Path

import pytest

pw = pytest.importorskip("playwright.sync_api")
ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
LESSONS = re.findall(r"id: '([^']+)', path: '([^']+)'[^\n]*lesson: true", (SITE / "assets/js/sitemap.js").read_text())


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), partial(Quiet, directory=str(SITE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def new_page(browser):
    ctx = browser.new_context(viewport={"width": 1200, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return ctx, page, errors


@pytest.mark.parametrize("lesson,path", LESSONS, ids=[l[0] for l in LESSONS])
def test_quiz_renders_and_marks(server, browser, lesson, path):
    quiz = json.loads((SITE / "data" / f"quiz-{lesson}.json").read_text())["data"]
    ctx, page, errors = new_page(browser)
    page.goto(server + path, wait_until="networkidle")
    page.wait_for_selector("section.quiz:not([hidden]) .quiz-q")
    qs = page.locator(".quiz-q")
    assert qs.count() == len(quiz["questions"])
    assert page.locator("details.objectives li").count() == len(quiz["objectives"])
    first = quiz["questions"][0]
    wrong = (first["answer"] + 1) % len(first["choices"])
    qs.nth(0).locator("label").nth(wrong).click()
    qs.nth(0).locator("button").click()
    assert qs.nth(0).get_attribute("data-state") == "wrong"
    assert "Not quite" in qs.nth(0).locator(".quiz-feedback").inner_text()
    qs.nth(0).locator("label").nth(first["answer"]).click()
    qs.nth(0).locator("button").click()
    assert qs.nth(0).get_attribute("data-state") == "right"
    stored = json.loads(page.evaluate("localStorage.getItem('so.quiz')"))
    assert stored[lesson][first["id"]] is True
    ctx.close()
    assert not errors, errors


def test_search_finds_and_navigates(server, browser):
    ctx, page, errors = new_page(browser)
    page.goto(server + "learn/band-gap.html", wait_until="networkidle")
    page.keyboard.press("/")
    page.wait_for_selector("dialog.search-dialog[open]")
    page.keyboard.type("betz")
    page.wait_for_selector(".search-results a")
    first = page.locator(".search-results a").first
    assert "Wind" in first.inner_text()
    page.keyboard.press("ArrowDown")
    assert page.evaluate("document.activeElement.closest('.search-results') !== null")
    page.keyboard.press("Escape")
    assert page.locator("dialog.search-dialog[open]").count() == 0
    page.keyboard.press("Control+k")
    page.wait_for_selector("dialog.search-dialog[open]")
    page.locator("#site-search-q").fill("zzqqxx")
    page.wait_for_timeout(200)
    assert "Nothing matches" in page.locator("#site-search-status").inner_text()
    ctx.close()
    assert not errors, errors


def test_teachers_guide(server, browser):
    ctx, page, errors = new_page(browser)
    page.goto(server + "teach.html", wait_until="networkidle")
    page.wait_for_selector("#teach-summary:has-text('questions')")
    n_q = sum(len(json.loads((SITE / "data" / f"quiz-{l}.json").read_text())["data"]["questions"]) for l, _ in LESSONS)
    assert f"{len(LESSONS)} lessons, {n_q} questions" in page.locator("#teach-summary").inner_text()
    assert page.locator(".teach-key").first.is_hidden()
    page.locator("#show-answers").check()
    assert page.locator(".teach-key").first.is_visible()
    ctx.close()
    assert not errors, errors
