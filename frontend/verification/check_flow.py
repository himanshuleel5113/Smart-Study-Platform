"""Real API UI checks using the account created by check_ui.py.
Run: python frontend/verification/check_flow.py dashboard subjects
"""
import sys
import os
import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect
from check_ui import ROOT, ARTIFACTS, QuietHandler


def navigate(page, view):
    page.evaluate("view => { location.hash = view; }", view)
    expect(page.locator(f"#view-{view}")).to_be_visible()


def dashboard(page):
    navigate(page, "dashboard")
    expect(page.locator("#welcomeMessage")).to_contain_text("UI Verification")
    expect(page.locator("#globalSearch")).to_be_disabled()
    page.locator("#recentActivityAll").click()
    expect(page.get_by_role("dialog")).to_contain_text("Activity History")
    page.keyboard.press("Escape")
    page.locator("#quickStartStudy").click()
    expect(page.locator("#view-study")).to_be_visible()


def subjects(page):
    navigate(page, "subjects")
    page.locator("#addSubjectBtn").click()
    page.locator("#modalSubjectName").fill("Frontend verification")
    page.locator("#modalSubjectDescription").fill("Created by the real browser verification flow")
    page.locator("[data-modal-ok]").click()
    expect(page.get_by_role("dialog")).not_to_be_visible()
    card = page.locator(".subject-card").filter(has_text="Frontend verification").last
    expect(card).to_be_visible()
    card.locator("[data-edit]").click()
    page.locator("#modalSubjectDescription").fill("Edited through the subject modal")
    page.locator("[data-modal-ok]").click()
    expect(page.get_by_role("dialog")).not_to_be_visible()
    card.locator("[data-view-details]").click()
    expect(page.get_by_role("dialog")).to_contain_text("Edited through the subject modal")
    page.keyboard.press("Escape")
    page.locator("#globalSearch").fill("no-such-subject")
    expect(page.locator("#searchStatus")).to_contain_text("No matches")
    page.locator("#globalSearch").fill("")
    card.locator("[data-study]").click()
    expect(page.locator("#view-study")).to_be_visible()
    assert page.locator("#studySubjectId").input_value()
    navigate(page, "subjects")
    page.locator("#addSubjectBtn").click()
    page.locator("#modalSubjectName").fill("Temporary subject to delete")
    page.locator("[data-modal-ok]").click()
    expect(page.get_by_role("dialog")).not_to_be_visible()
    temporary = page.locator(".subject-card").filter(has_text="Temporary subject to delete")
    temporary.locator("[data-delete]").click()
    page.locator("[data-modal-ok]").click()
    expect(temporary).to_have_count(0, timeout=15000)


def study(page):
    navigate(page, "study")
    page.locator('#view-study .quick-link[data-view="subjects"]').click()
    expect(page.get_by_role("dialog")).to_be_visible()
    page.keyboard.press("Escape")
    page.locator("#studySubjectId").select_option(index=1)
    page.locator("#startSessionBtn").click()
    expect(page.locator("#stopStudyButton")).to_be_visible(timeout=15000)
    expect(page.locator('#studyStartForm button[type="submit"]')).to_be_disabled()
    expect(page.locator("#studySubjectId")).to_be_disabled()
    expect(page.locator("#sessionTimer")).not_to_have_text("00:00", timeout=10000)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#stopStudyButton")).to_be_visible(timeout=15000)
    page.locator("#stopStudyButton").click()
    expect(page.locator("#startSessionBtn")).to_be_visible(timeout=15000)
    expect(page.locator("#studyHistoryList")).to_contain_text("Completed")
    expect(page.locator("#sessionTimer")).to_have_text("00:00")
    page.locator("#studyHistoryList [data-session]").first.click()
    expect(page.get_by_role("dialog")).to_contain_text("Frontend verification")
    page.keyboard.press("Escape")
    page.locator('#view-study .quick-link[data-view="results"]').click()
    expect(page.locator("#view-results")).to_be_visible()


def quizzes(page):
    navigate(page, "quizzes")
    page.locator("#quizTitle").fill("Browser verification quiz")
    page.locator("#quizDescription").fill("Two questions saved through the existing API")
    page.locator('#quizForm button[type="submit"]').click()
    expect(page.locator("#quizMessage")).to_contain_text("successfully", timeout=15000)
    row = page.locator(".quiz-row").filter(has_text="Browser verification quiz").last
    expect(row.locator("[data-take]")).to_be_disabled()
    for question, correct in [("Which language styles a web page?", "B"), ("Which element represents a button?", "A")]:
        row.locator("[data-add-question]").click()
        page.locator("#editorQuestion").fill(question)
        for letter, value in zip("ABCD", ["button", "CSS", "Java", "SQL"]):
            page.locator(f"#editorOption{letter}").fill(value)
        page.locator("#editorCorrect").select_option(correct)
        page.locator("[data-modal-ok]").click()
        expect(page.get_by_role("dialog")).not_to_be_visible(timeout=15000)
    expect(row).to_contain_text("2 questions")
    expect(row.locator("[data-take]")).to_be_enabled()
    page.locator('[data-filter="ai"]').click()
    expect(row).not_to_be_visible()
    page.locator('[data-filter="manual"]').click()
    expect(row).to_be_visible()
    page.locator("#globalSearch").fill("no-such-quiz")
    expect(page.locator("#searchStatus")).to_contain_text("No matches")
    page.locator("#globalSearch").fill("")
    page.locator('[data-filter="all"]').click()


def taking(page):
    navigate(page, "quizzes")
    row = page.locator(".quiz-row").filter(has_text="Browser verification quiz").last
    row.locator("[data-take]").click()
    expect(page.locator("#questionText")).to_contain_text("Which language")
    page.locator("#submitQuizButton").click()
    expect(page.locator("#quizResultMessage")).to_contain_text("2 left")
    page.locator('#optionsList input[value="B"]').check()
    expect(page.locator('#optionsList input[value="B"]')).to_be_focused()
    expect(page.locator("#quizProgressLabel")).to_have_text("50%")
    page.locator("#nextQuestionBtn").click()
    expect(page.locator("#questionText")).to_contain_text("Which element")
    page.locator('#optionsList input[value="A"]').check()
    page.locator("#resetAnswerBtn").click()
    expect(page.locator('#optionsList input:checked')).to_have_count(0)
    page.locator('#optionsList input[value="A"]').check()
    page.locator('[data-jump="0"]').click()
    expect(page.locator('#optionsList input[value="B"]')).to_be_checked()
    page.locator('[data-jump="1"]').click()
    expect(page.locator("#quizProgressLabel")).to_have_text("100%")
    with page.expect_response(lambda r: "/api/quiz-submissions" in r.url) as response:
        page.locator("#nextQuestionBtn").click()
    assert response.value.ok
    expect(page.locator("#view-results")).to_be_visible(timeout=15000)
    expect(page.locator("#scorePercent")).to_have_text("100%")
    expect(page.locator("#resultCorrect")).to_have_text("2")
    expect(page.locator("#resultIncorrect")).to_have_text("0")
    expect(page.locator("#answerReviewList")).to_contain_text("Your answer")
    expect(page.locator("#answerReviewList")).to_contain_text("CSS")


def results(page):
    navigate(page, "results")
    page.locator("#quizAttemptsList [data-attempt]").first.click()
    expect(page.locator("#resultQuizTitle")).to_contain_text("Browser verification quiz")
    expect(page.locator("#resultTotal")).to_have_text("2")
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#view-results")).to_be_visible(timeout=15000)
    expect(page.locator("#answerReviewList")).to_contain_text("Saved answer details are coming soon")


def profile_settings(page):
    navigate(page, "profile")
    expect(page.locator("#profileName")).to_have_text("UI Verification")
    expect(page.locator("#profileEmail")).to_contain_text("@example.com")
    expect(page.locator("#pfSessions")).not_to_have_text("0")
    page.locator("#profileActivityAll").click()
    expect(page.get_by_role("dialog")).to_contain_text("Study Session")
    expect(page.get_by_role("dialog")).to_contain_text("Browser verification quiz")
    page.keyboard.press("Escape")
    navigate(page, "settings")
    expect(page.locator("#settingsName")).to_have_value("UI Verification")
    expect(page.locator("#settingsName")).to_be_disabled()
    expect(page.locator("#settingsCurrentPassword")).to_be_disabled()
    assert page.locator('.toggle input:disabled').count() == 3
    page.locator('[data-theme-choice="dark"]').click()
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.locator("#saveSettingsBtn").click()
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#view-settings")).to_be_visible(timeout=15000)
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.locator('[data-theme-choice="light"]').click()


def responsive(page):
    for width in (1920, 1366, 768, 390):
        page.set_viewport_size({"width": width, "height": 900})
        for view in ("dashboard", "subjects", "study", "quizzes", "results", "profile", "settings", "quiz"):
            if view == "quiz":
                navigate(page, "quizzes")
                page.locator(".quiz-row").filter(has_text="Browser verification quiz").last.locator("[data-take]").click()
                expect(page.locator("#view-quiz")).to_be_visible()
            else:
                navigate(page, view)
            page.screenshot(path=str(ARTIFACTS / f"{view}-{width}.png"), full_page=True, animations="disabled")
            overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            assert overflow <= 1, f"{view} overflows {overflow}px at {width}"
        if width < 900:
            page.locator("#sidebarToggle").click()
            page.screenshot(path=str(ARTIFACTS / f"sidebar-{width}.png"), full_page=True, animations="disabled")
            page.keyboard.press("Escape")
        print(f"PASS: all views at {width}px", flush=True)
    page.set_viewport_size({"width": 1366, "height": 900})
    navigate(page, "settings")
    page.locator('[data-theme-choice="dark"]').click()
    for view in ("dashboard", "subjects", "study", "quizzes", "results", "profile", "settings"):
        navigate(page, view)
        page.screenshot(path=str(ARTIFACTS / f"{view}-dark.png"), full_page=True, animations="disabled")
    navigate(page, "settings")
    page.locator('[data-theme-choice="system"]').click()
    page.emulate_media(color_scheme="light")
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    page.emulate_media(color_scheme="dark")
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.locator('[data-theme-choice="light"]').click()


def ai(page):
    navigate(page, "quizzes")
    page.locator("#aiTopic").fill("Basic HTML semantics")
    page.locator("#aiQuestionCount").fill("2")
    with page.expect_response(lambda r: "/api/ai-quizzes/generate" in r.url, timeout=120000) as response:
        page.locator('#aiQuizForm button[type="submit"]').click()
    status = response.value.status
    if response.value.ok:
        expect(page.locator("#view-quiz")).to_be_visible(timeout=15000)
        expect(page.locator("#quizProgressText")).to_have_text("1 / 2")
        print("AI generation succeeded against the real service.", flush=True)
    else:
        expect(page.locator("#aiQuizMessage")).not_to_contain_text("Generating")
        message = page.locator("#aiQuizMessage").inner_text()
        print(f"AI service returned {status}; UI displayed the error: {message}", flush=True)
    (ARTIFACTS / "ai-check.json").write_text(json.dumps({"status": status, "success": response.value.ok}))


def failures(page):
    navigate(page, "dashboard")
    page.route("**/api/study-stats", lambda route: route.fulfill(status=503, content_type="application/json", body='{"message":"Temporarily unavailable"}'))
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#dataLoadError")).to_be_visible(timeout=15000)
    expect(page.locator("#view-dashboard")).not_to_be_visible()
    page.unroute("**/api/study-stats")
    page.locator("#retryDataButton").click()
    expect(page.locator("#view-dashboard")).to_be_visible(timeout=15000)
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#sidebarToggle").click()
    page.locator("#logoutButton").click()
    expect(page.locator("#loginSection")).to_be_visible()
    assert not page.locator("body").evaluate("el => el.classList.contains('sidebar-visible')")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors, failed_assets, console_errors, api_errors = [], [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True)
            context = browser.new_context(storage_state=str(ARTIFACTS / "browser-state.json"),
                viewport={"width": 1366, "height": 900}, color_scheme="light")
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("requestfailed", lambda request: failed_assets.append(request.url) if "/api/" not in request.url else None)
            page.on("response", lambda response: api_errors.append(f"{response.status} {response.url}")
                    if "/api/" in response.url and response.status >= 400 else None)
            page.on("response", lambda r: failed_assets.append(f"{r.status} {r.url}")
                    if r.status >= 400 and "/api/" not in r.url else None)
            page.goto(os.environ.get("SSP_BASE_URL", "http://localhost:8765"), wait_until="domcontentloaded")
            expect(page.locator("#appShell")).to_be_visible(timeout=45000)
            for step in sys.argv[1:] or ["dashboard", "subjects"]:
                console_start = len(console_errors)
                api_start = len(api_errors)
                globals()[step](page)
                if step not in ("ai", "failures"):
                    assert len(console_errors) == console_start, console_errors[console_start:]
                    assert len(api_errors) == api_start, api_errors[api_start:]
                print(f"PASS: {step}", flush=True)
            assert not errors, errors
            assert not failed_assets, failed_assets
            print("PASS: no JavaScript errors or missing assets", flush=True)
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
