"""Checks the keyboard shortcuts in the quick look (a star that is not prepared), on the live site.

The quick look needs /api/lookup (Vercel only) and the archive, so it cannot be checked in the local
preview. If the archive does not answer, the script says so and does not count it as a failed check.

Usage: C:\\Python313\\python.exe pipeline/quick_keys_check.py <base_url> > logs/quick_keys_check_live.log 2>&1
"""
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://blackhole-spherex.vercel.app").rstrip("/")
URL = f"{BASE}/?target=Ross%20128"
# Epoch buttons of the quick look sit in the controls group, not in a play bar.
SEL_JS = "() => [...document.querySelectorAll('.controls button[aria-pressed=true]')].map(x => x.textContent).join()"

def main():
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
        pg.goto(URL, wait_until="load", timeout=60000)
        try:
            pg.wait_for_selector(".quick-side", timeout=120000)
        except Exception:
            warn = pg.locator(".warn").all_inner_texts()
            print(f"NOT CHECKED: the quick look did not show images within 120 s; warnings on the page: {warn!r}")
            br.close()
            sys.exit(2)

        def sel():
            return pg.evaluate(SEL_JS)

        def play():
            return pg.inner_text(".controls .play")

        n = pg.locator(".controls button[aria-pressed]").count()
        print(f"epoch buttons: {n}")
        check("starts playing", play() in ("Pause", "Duraklat"), f"button reads {play()!r}")
        pg.mouse.click(5, 5)
        pg.keyboard.press("ArrowRight")
        a = sel()
        pg.keyboard.press("ArrowRight")
        b = sel()
        check("right arrow steps the epoch", a != "" and b != "" and (a != b or n < 2), f"selected {a!r} then {b!r}")
        check("right arrow pauses", play() in ("Play", "Oynat"), f"button reads {play()!r}")
        pg.keyboard.press(" ")
        check("space plays", play() in ("Pause", "Duraklat"), f"button reads {play()!r}")
        pg.keyboard.press(" ")
        check("space pauses", play() in ("Play", "Oynat"), f"button reads {play()!r}")
        title = pg.get_attribute(".controls button[aria-pressed]", "title")
        check("epoch button has dates", bool(title) and "–" in title, repr(title))
        check("no console errors", not errs, repr(errs))
        br.close()
    print(f"checks failed: {fails}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()