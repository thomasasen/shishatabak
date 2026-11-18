"""Real Chromium smoke test for saving personal ratings.

Run from repository root:
  python -m pip install playwright
  python -m playwright install chromium
  python tests/browser_save.py

This intentionally uses a real browser, real FormData, real localStorage and
the actual HTML/CSS/JS instead of mocks (which missed HTMLFormElement.id
shadowing in the past).
"""
from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
KEY = "tabakjournal:v1"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _fmt, *_args):
        pass


def assert_rating(page, brand, name, score):
    data = page.evaluate(f"JSON.parse(localStorage.getItem({json.dumps(KEY)}))")
    assert isinstance(data, dict), "Personal data is absent from localStorage"
    entries = [p for p in data["tobaccos"] if p["brand"] == brand and p["name"] == name]
    assert len(entries) == 1, f"Expected one saved {brand} {name}, got {len(entries)}"
    assert entries[0]["review"]["tolerability"] == score, f"Unexpected saved review: {entries[0]['review']}"
    assert not page.locator("#editorDialog").evaluate("(el) => el.open"), "Editor must close after successful save"
    return entries[0]


def main():
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT))
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
            context = browser.new_context()
            page = context.new_page()
            exceptions = []
            page.on("pageerror", lambda exc: exceptions.append(str(exc)))
            page.goto(base, wait_until="load")
            page.locator("#screen h1").wait_for()
            assert "Meine Tabake" in page.locator("#screen h1").inner_text()

            # Real user flow: catalog autocomplete, radio choice, submit, reload.
            page.get_by_role("button", name="Tabak hinzufügen").first.click()
            page.locator("#f-brand").fill("AINO Dark")
            page.locator("#f-name").fill("Conud")
            page.locator(".catalog-result").filter(has_text="Conud Shake").first.click()
            page.locator('input[name="tolerability"][value="4"]').check()
            assert page.locator("#f-quantity_g").input_value() == "200"
            page.get_by_role("button", name="Tabak speichern").click()
            saved = assert_rating(page, "AINO Dark", "Conud Shake", 4)
            assert saved["quantity_g"] == 200
            assert not page.url.split("?")[-1].startswith("brand="), f"Form data leaked in URL: {page.url}"
            page.reload(wait_until="load")
            assert_rating(page, "AINO Dark", "Conud Shake", 4)
            assert "Conud Shake" in page.locator("#collectionResults").inner_text()

            # Update a previous review with the optional details collapsed.
            page.get_by_role("button", name="Bewertung bearbeiten").click()
            assert page.locator(".optional-details").count() == 1
            page.locator('input[name="tolerability"][value="2"]').check()
            page.locator("details.optional-details summary").click()
            page.locator("#f-review-notes").fill("Verträglichkeit schlechter als gedacht")
            page.locator('input[name="symptom"][value="Schwindel"]').check()
            page.get_by_role("button", name="Änderungen speichern").click()
            saved = assert_rating(page, "AINO Dark", "Conud Shake", 2)
            assert saved["review"]["notes"] == "Verträglichkeit schlechter als gedacht"
            assert "Schwindel" in saved["review"]["symptoms"]
            page.reload(wait_until="load")
            assert_rating(page, "AINO Dark", "Conud Shake", 2)
            assert not exceptions, f"JavaScript runtime errors: {exceptions}"
            context.close()

            # Recover a failed historical GET submission: draft, never silently
            # save a link's values, scrub sensitive query, then explicit save.
            ctx2 = browser.new_context()
            recovery = ctx2.new_page()
            recovery.goto(
                base + "?brand=Argileh&name=ORNG+MNT&catalog_ean=4260623441833"
                "&tolerability=2&quantity_g=200&base=Virginia&flavor=Orange%2C+Minze"
                "&taste=&symptom=Schwindel&symptom=%C3%9Cbelkeit&review_notes=EhemaligerEntwurf&id=",
                wait_until="load",
            )
            assert recovery.locator("#editorDialog").evaluate("(el) => el.open")
            assert recovery.locator("#f-brand").input_value() == "Argileh"
            assert recovery.locator("#f-name").input_value() == "ORNG MNT"
            assert recovery.locator('input[name="tolerability"][value="2"]').is_checked()
            assert "brand=" not in recovery.url and "symptom=" not in recovery.url
            assert recovery.evaluate(f"localStorage.getItem({json.dumps(KEY)})") is None, (
                "Draft recovery must never silently persist URL data"
            )
            recovery.get_by_role("button", name="Tabak speichern").click()
            restored = assert_rating(recovery, "Argileh", "ORNG MNT", 2)
            assert "Schwindel" in restored["review"]["symptoms"]
            assert "Übelkeit" in restored["review"]["symptoms"]
            assert restored["review"]["notes"] == "EhemaligerEntwurf"
            recovery.reload(wait_until="load")
            assert_rating(recovery, "Argileh", "ORNG MNT", 2)
            ctx2.close()
            browser.close()
            print("PASS: real Chromium save/reload, rating edit, optional details, legacy draft recovery and URL privacy")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
