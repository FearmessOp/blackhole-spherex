"""Screenshots of the site for the design block: checks only, changes nothing.

Pages: opening, Epsilon Indi B, WISE 0855, one fast mover, one quick look and the
three steps of the guided mode, at 1400x900 and 390x844. Per page a screenshot
of the first screen (_top) and of the full page (_full), plus: horizontal
overflow of the document, 4xx responses, console errors.
Screenshots go to cache/design/<name>/ (not in git).

Usage: C:/Python313/python.exe pipeline/design_shots.py <name> [--base URL] [--langs en,tr] [--tabs]
       > logs/design_shots_<name>.log 2>&1
"""
import argparse
import os

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("name")
ap.add_argument("--base", default="https://blackhole-spherex.vercel.app/")
ap.add_argument("--langs", default="en")
ap.add_argument("--tabs", action="store_true", help="also click the tabs Measurement and Validation")
args = ap.parse_args()

OUT = os.path.join("cache", "design", args.name)
os.makedirs(OUT, exist_ok=True)
PAGES = [("home", ""), ("eps", "target=eps-indi-b"), ("wise", "target=wise-0855"),
         ("fast", "target=lp-651-7"), ("quick", "target=Ross%20128")]
WIDTHS = [(1400, 900), (390, 844)]

def url(query, lang):
    parts = [q for q in [query, "lang=tr" if lang == "tr" else ""] if q]
    return args.base + ("?" + "&".join(parts) if parts else "")

def shot(pg, label, bad, errs, full=True):
    sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    pg.screenshot(path=os.path.join(OUT, label + "_top.png"))
    if full:
        pg.screenshot(path=os.path.join(OUT, label + "_full.png"), full_page=True)
    h = pg.evaluate("document.documentElement.scrollHeight")
    print(f"{label}: overflow={'YES' if sw > cw else 'no'} ({sw}/{cw}) page_height={h} 4xx={bad} console_errors={errs}",
          flush=True)
    bad.clear()
    errs.clear()

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in WIDTHS:
        for lang in args.langs.split(","):
            pg = b.new_page(viewport={"width": w, "height": h})
            bad, errs = [], []
            pg.on("response", lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            for name, query in PAGES:
                pg.goto(url(query, lang))
                if name == "quick":
                    for _ in range(45):
                        if pg.locator(".quick-side").count() or pg.locator("p.warn").count():
                            break
                        pg.wait_for_timeout(1000)
                pg.wait_for_timeout(3000)
                shot(pg, f"{name}_{w}_{lang}", bad, errs)
                if args.tabs and name == "eps":
                    for i, tab in enumerate(pg.locator("[role=tab]").all()):
                        tab.click()
                        pg.wait_for_timeout(1200)
                        shot(pg, f"{name}_tab{i + 1}_{w}_{lang}", bad, errs)
            pg.goto(url("", lang))
            pg.wait_for_timeout(2000)
            pg.locator(".guide-start").first.click()
            for step in (1, 2, 3):
                pg.wait_for_timeout(2500)
                shot(pg, f"guide{step}a_{w}_{lang}", bad, errs, full=False)
                show = pg.locator("button.guide-show, button:has-text('Show me')")
                if show.count():
                    show.first.click()
                    pg.wait_for_timeout(1500)
                shot(pg, f"guide{step}b_{w}_{lang}", bad, errs)
                nxt = pg.locator("button.guide-next")
                if not nxt.count():
                    print(f"guide step {step}: no next button", flush=True)
                    break
                nxt.first.click()
            pg.wait_for_timeout(1500)
            shot(pg, f"guide_end_{w}_{lang}", bad, errs, full=False)
            pg.close()
    b.close()
print("done", flush=True)