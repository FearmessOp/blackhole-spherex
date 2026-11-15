"""Link and target check of the site for the design block: checks only, changes nothing.

1. Every target of data/index.json opens through ?target=<slug> at 1400 px and 390 px:
   heading, number of image panels, the three tabs, overflow, 4xx, console errors.
2. A ?ra=&dec= link opens a quick look.
3. The language: ?lang=tr sets the page language, stays in the address when another
   target is chosen, is kept in localStorage, and EN switches back.

Usage: C:/Python313/python.exe pipeline/design_links.py [--base URL] > logs/design_links_<name>.log 2>&1
"""
import argparse
import json
import urllib.request

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="https://blackhole-spherex.vercel.app/")
args = ap.parse_args()
BASE = args.base

with urllib.request.urlopen(BASE + "data/index.json", timeout=30) as r:
    targets = json.load(r)["targets"]
print(f"base: {BASE}", flush=True)
print(f"targets in data/index.json: {len(targets)}", flush=True)

def watch(pg):
    bad, errs = [], []
    pg.on("response", lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    return bad, errs

def overflow(pg):
    sw, cw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    return f"{'YES' if sw > cw else 'no'} ({sw}/{cw})"

def heading(pg):
    h = pg.locator(".target-head h2")
    return " ".join(h.first.inner_text().split()) if h.count() else None

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1. every target, both widths, three tabs
    n_ok = 0
    for w, h in [(1400, 900), (390, 844)]:
        pg = b.new_page(viewport={"width": w, "height": h})
        bad, errs = watch(pg)
        for t in targets:
            pg.goto(BASE + "?target=" + t["slug"])
            pg.wait_for_timeout(2500)
            head = heading(pg)
            views = pg.locator(".views .view").count()
            tabs = pg.locator("[role=tab]")
            n_tabs = tabs.count()
            over = [overflow(pg)]
            for i in range(1, n_tabs):
                tabs.nth(i).click()
                pg.wait_for_timeout(800)
                over.append(overflow(pg))
            name_ok = head is not None and " ".join(t["name"].split()) in head
            ok = name_ok and views == 2 and n_tabs == 3 and not bad and not errs and all(o.startswith("no") for o in over)
            n_ok += ok
            print(f"[{w}] target {t['slug']}: {'ok' if ok else 'CHECK'} heading={head!r} views={views} tabs={n_tabs} "
                  f"overflow_per_tab={over} 4xx={bad} console_errors={errs}", flush=True)
            bad.clear()
            errs.clear()
        pg.close()
    print(f"targets ok: {n_ok} of {2 * len(targets)} (15 targets x 2 widths)", flush=True)

    # 2. a position link
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    bad, errs = watch(pg)
    pg.goto(BASE + "?ra=164.0924&dec=6.9952")
    state = "timeout"
    for _ in range(60):
        if pg.locator(".quick-side").count():
            state = "shown"
            break
        if pg.locator("p.warn").count():
            state = "warning: " + " ".join(pg.locator("p.warn").first.inner_text().split())
            break
        pg.wait_for_timeout(1000)
    pg.wait_for_timeout(1500)
    print(f"position link ?ra=164.0924&dec=6.9952: state={state} heading={heading(pg)!r} canvases={pg.locator('.view canvas').count()} "
          f"overflow={overflow(pg)} 4xx={bad} console_errors={errs}", flush=True)
    pg.close()

    # 3. language (a fresh context, so that localStorage starts empty)
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    bad, errs = watch(pg)
    lang = "document.documentElement.lang"
    stored = "localStorage.getItem('spherex-lang')"

    pg.goto(BASE + "?target=eps-indi-b")
    pg.wait_for_timeout(2000)
    print(f"lang default: html_lang={pg.evaluate(lang)!r} stored={pg.evaluate(stored)!r} title={pg.locator('h1').first.inner_text()!r}", flush=True)

    pg.goto(BASE + "?target=eps-indi-b&lang=tr")
    pg.wait_for_timeout(2000)
    print(f"lang ?lang=tr: html_lang={pg.evaluate(lang)!r} stored={pg.evaluate(stored)!r} title={pg.locator('h1').first.inner_text()!r} "
          f"url={pg.url}", flush=True)

    pg.locator(".card").nth(2).click()
    pg.wait_for_timeout(2000)
    print(f"lang after choosing the third card: heading={heading(pg)!r} url={pg.url}", flush=True)

    pg.locator(".lang button").nth(1).click()  # TR
    pg.wait_for_timeout(500)
    print(f"lang after clicking TR: html_lang={pg.evaluate(lang)!r} stored={pg.evaluate(stored)!r} url={pg.url}", flush=True)

    pg.goto(BASE + "?target=barnard")
    pg.wait_for_timeout(2000)
    print(f"lang on a link without lang, after TR was clicked: html_lang={pg.evaluate(lang)!r} "
          f"title={pg.locator('h1').first.inner_text()!r} url={pg.url}", flush=True)

    pg.locator(".lang button").nth(0).click()  # EN
    pg.wait_for_timeout(500)
    print(f"lang after clicking EN: html_lang={pg.evaluate(lang)!r} stored={pg.evaluate(stored)!r} "
          f"title={pg.locator('h1').first.inner_text()!r} url={pg.url}", flush=True)
    print(f"lang part: 4xx={bad} console_errors={errs}", flush=True)
    ctx.close()
    b.close()
print("done", flush=True)