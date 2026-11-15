"""Full tour of the live site (block 5.13): checks only, changes nothing.

Five prepared targets, three quick looks and the guided mode, at 900 px and 390 px.
Per page: 4xx responses, console errors, horizontal overflow of the document.
Screenshots go to cache/tour/ (not in git).

Usage: C:/Python313/python.exe pipeline/live_tour.py > logs/live_tour.log 2>&1
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = "https://blackhole-spherex.vercel.app/"
PREPARED = ["barnard", "eps-indi-b", "wise-0855", "rw-aur", "r-dra"]
QUICK = ["Wolf 359", "Ross 128", "Teegarden's Star"]
WIDTHS = [(900, 1100), (390, 844)]
OUT = os.path.join("cache", "tour")
os.makedirs(OUT, exist_ok=True)

def attach(pg, bad, errs):
    pg.on("response", lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

def overflow(pg):
    return pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")

def report(label, pg, bad, errs, extra=""):
    sw, cw = overflow(pg)
    print(f"{label}: overflow={'YES' if sw > cw else 'no'} ({sw}/{cw}) 4xx={bad} console_errors={errs} {extra}")
    bad.clear()
    errs.clear()

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in WIDTHS:
        pg = b.new_page(viewport={"width": w, "height": h})
        bad, errs = [], []
        attach(pg, bad, errs)

        for s in PREPARED:
            pg.goto(BASE + "?target=" + s)
            pg.wait_for_timeout(3000)
            res = pg.locator("section.results:not(.validation)").first
            txt = res.inner_text() if res.count() else ""
            pg.screenshot(path=os.path.join(OUT, f"{s}_{w}.png"), full_page=True)
            report(f"[{w}] prepared {s}", pg, bad, errs,
                   f"results_chars={len(txt)} tables={pg.locator('section.results:not(.validation) > table').count()}")

        for q in QUICK:
            t0 = time.time()
            pg.goto(BASE + "?target=" + q.replace(" ", "%20"))
            state = "timeout"
            for _ in range(90):
                body = pg.inner_text("body")
                if "did not answer" in body or "does not know" in body or "failed" in body.lower():
                    state = "error"
                    break
                if pg.locator("canvas").count() and ("Epoch 1" in body or "epoch 1" in body):
                    state = "shown"
                    break
                pg.wait_for_timeout(1000)
            dt = time.time() - t0
            body = pg.inner_text("body")
            first = [ln for ln in body.splitlines() if "xposure" in ln][:2]
            pg.screenshot(path=os.path.join(OUT, f"quick_{q.split()[0].lower()}_{w}.png"), full_page=True)
            report(f"[{w}] quick {q}", pg, bad, errs, f"state={state} seconds={dt:.1f} lines={first}")

        pg.goto(BASE)
        pg.wait_for_timeout(2000)
        pg.locator(".guide-start").click()
        steps = 0
        for _ in range(6):
            pg.wait_for_timeout(2500)
            show = pg.get_by_role("button", name="Show me")
            if show.count():
                show.first.click()
                pg.wait_for_timeout(1500)
            steps += 1
            pg.screenshot(path=os.path.join(OUT, f"guide_step{steps}_{w}.png"), full_page=True)
            nxt = pg.locator("button.guide-next")
            if not nxt.count():
                break
            label = nxt.first.inner_text()
            nxt.first.click()
            if label.strip() == "Finish":
                pg.wait_for_timeout(1500)
                break
        body = pg.inner_text("body")
        report(f"[{w}] guide", pg, bad, errs,
               f"steps={steps} end_text_has_play_again={'Play again' in body}")
        pg.close()
    b.close()
print("done")