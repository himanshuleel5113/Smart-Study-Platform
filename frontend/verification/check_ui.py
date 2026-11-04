"""Browser verification against the existing API. Requires Python Playwright + Chrome.

Run from the repository root: python frontend/verification/check_ui.py
Uses a temporary static server; does not change Nginx or API configuration.
Generated screenshots and authentication state stay in ignored artifacts/.
"""
import json
import os
import secrets
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "verification" / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors, failed_assets, console_errors = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True)
            context = browser.new_context(viewport={"width": 1366, "height": 900}, color_scheme="light")
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("requestfailed", lambda request: failed_assets.append(request.url) if "/api/" not in request.url else None)
            page.on("response", lambda response: failed_assets.append(f"{response.status} {response.url}")
                    if response.status >= 400 and "/api/" not in response.url else None)
            page.goto(os.environ.get("SSP_BASE_URL", "http://localhost:8765"), wait_until="domcontentloaded")
            expect(page.locator("#loginSection")).to_be_visible()
            for view in ("login", "register"):
                if view == "register":
                    page.locator("#showRegisterButton").click()
                for width in (1920, 1366, 768, 390):
                    page.set_viewport_size({"width": width, "height": 900})
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{view} overflows at {width}"
                    page.screenshot(path=str(ARTIFACTS / f"{view}-{width}.png"), full_page=True, animations="disabled")
                    assert page.evaluate("document.fonts.check('400 14px Poppins')"), "Local Poppins font is unavailable"
            page.set_viewport_size({"width": 1366, "height": 900})
            email = f"ui-check-{int(time.time())}@example.com"
            password = secrets.token_urlsafe(18)
            page.locator("#registerName").fill("UI Verification")
            page.locator("#registerEmail").fill(email)
            page.locator("#registerPassword").fill(password)
            page.locator('#registerForm button[type="submit"]').click()
            expect(page.locator("#registerMessage")).to_contain_text("Registration successful", timeout=45000)
            page.locator("#showLoginButton2").click()
            page.locator("#loginEmail").fill(email)
            page.locator("#loginPassword").fill(password)
            page.locator('#loginForm button[type="submit"]').click()
            expect(page.locator("#appShell")).to_be_visible(timeout=45000)
            expect(page.locator("#welcomeMessage")).to_contain_text("UI Verification")
            page.evaluate("location.hash = 'subjects'")
            expect(page.locator("#subjectsGrid")).to_contain_text("No subjects yet")
            page.evaluate("location.hash = 'results'")
            expect(page.locator("#resultQuizTitle")).to_have_text("No attempts yet")
            expect(page.locator("#scorePercent")).to_have_text("—")
            page.evaluate("location.hash = 'dashboard'")
            context.storage_state(path=str(ARTIFACTS / "browser-state.json"))
            (ARTIFACTS / "test-account.json").write_text(json.dumps({"email": email, "password": password}))
            page.locator("#quickAddSubject").click()
            expect(page.get_by_role("dialog")).to_be_visible()
            expect(page.locator("#modalSubjectName")).to_be_focused()
            assert page.locator("#modalRoot").evaluate("el => getComputedStyle(el).position") == "fixed"
            page.keyboard.press("Escape")
            expect(page.locator("#quickAddSubject")).to_be_focused()
            page.set_viewport_size({"width": 390, "height": 844})
            page.locator("#sidebarToggle").click()
            expect(page.locator("#sidebarToggle")).to_have_attribute("aria-expanded", "true")
            page.keyboard.press("Escape")
            expect(page.locator("#sidebarToggle")).to_be_focused()
            assert not errors, errors
            assert not failed_assets, failed_assets
            assert not console_errors, console_errors
            print("PASS: real registration/login, auth at all four widths, modal focus, mobile menu, no JavaScript errors or missing assets.")
            browser.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
