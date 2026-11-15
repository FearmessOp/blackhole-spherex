"""Checks the keyboard shortcuts, the epoch buttons and the reduced-motion start of the image view.

Space: play / pause; left / right: previous / next epoch; no shortcut while typing in the search box.
With prefers-reduced-motion the blink does not start by itself.

Usage: C:\\Python313\\python.exe pipeline/keys_check.py <base_url> > logs/keys_check_p1.log 2>&1
"""
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4175").rstrip("/")
URL = f"{BASE}/?target=eps-indi-b"
SEL_JS = "e => [...e.querySelectorAll('button[aria-pressed=true]')].map(x => x.textContent).join()"

def main():
    # The keys hint holds arrows; the Windows console code page (cp1254) cannot print them.
    sys.stdout.reconfigure(encoding="utf-8")
    fails = 0

    def check(name, ok, detail):
        nonlocal fails
        fails += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {detail}")

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 1400, "height": 900})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_selector(".summary")

        def sel():
            return pg.eval_on_selector(".playbar", SEL_JS)

        def play():
            return pg.inner_text(".playbar .play")

        check("starts playing", play() in ("Pause", "Duraklat"), f"button reads {play()!r}")
        pg.mouse.click(5, 5)  # focus the page, not a control
        pg.keyboard.press("ArrowRight")
        a = sel()
        pg.keyboard.press("ArrowRight")
        b = sel()
        check("right arrow steps the epoch", a != b and a != "" and b != "", f"selected {a!r} then {b!r}")
        check("right arrow pauses", play() in ("Play", "Oynat"), f"button reads {play()!r}")
        pg.keyboard.press("ArrowLeft")
        check("left arrow steps back", sel() == a, f"selected {sel()!r}, expected {a!r}")
        pg.keyboard.press(" ")
        check("space plays", play() in ("Pause", "Duraklat"), f"button reads {play()!r}")
        pg.keyboard.press(" ")
        check("space pauses", play() in ("Play", "Oynat"), f"button reads {play()!r}")
        pg.click("#search-input")
        s = sel()
        pg.keyboard.press("ArrowLeft")
        pg.keyboard.press(" ")
        check("no shortcut while typing", sel() == s and play() in ("Play", "Oynat"),
              f"selected {s!r} -> {sel()!r}, button {play()!r}")
        check("keys hint shown", pg.locator(".keys-hint").is_visible(), repr(pg.inner_text(".keys-hint")))
        check("tab panel role", pg.get_attribute("#target-panel", "role") == "tabpanel",
              repr(pg.get_attribute("#target-panel", "role")))
        title = pg.get_attribute(".playbar button[aria-pressed]", "title")
        check("epoch button has dates", bool(title) and "–" in title, repr(title))
        check("no console errors", not errs, repr(errs))

        ctx = br.new_context(reduced_motion="reduce", viewport={"width": 1400, "height": 900})
        q = ctx.new_page()
        q.goto(URL, wait_until="networkidle")
        q.wait_for_selector(".summary")
        btn = q.inner_text(".playbar .play")
        check("reduced motion: not playing at start", btn in ("Play", "Oynat"), f"button reads {btn!r}")

        m = br.new_page(viewport={"width": 390, "height": 800})
        m.goto(URL, wait_until="networkidle")
        m.wait_for_selector(".summary")
        check("390 px: keys hint hidden", not m.locator(".keys-hint").is_visible(), "")
        check("390 px: card second line shown", m.locator(".card-meta").first.is_visible(),
              repr(m.locator(".card-meta").first.inner_text()))
        br.close()
    print(f"checks failed: {fails}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()