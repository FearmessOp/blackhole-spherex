"""Measures the first screen: are both image panels, the play bar and the result sentence
visible without scrolling? Writes element boxes per target and viewport.

Usage: python pipeline/first_screen.py <base_url> <log_path> [--shots <dir>]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

TARGETS = ["barnard", "eps-indi-b", "wise-0855", "Ross%20128"]
SIZES = [(1400, 900), (390, 800)]
SEL = {
    "picker": ".picker",
    "view0": ".views .view >> nth=0",
    "view1": ".views .view >> nth=1",
    "playbar": ".playbar",
    "summary": ".summary",
    "controls": ".controls",
    "quick_table": ".quick-side .motion"}

def box(page, sel):
    loc = page.locator(sel)
    if loc.count() == 0:
        return None
    b = loc.first.bounding_box()
    return None if b is None else {k: round(v) for k, v in b.items()}

def main():
    base = sys.argv[1].rstrip("/")
    log = Path(sys.argv[2])
    shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
    targets = sys.argv[sys.argv.index("--targets") + 1].split(",") if "--targets" in sys.argv else TARGETS
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    out = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w, h in SIZES:
            for tgt in targets:
                page = br.new_page(viewport={"width": w, "height": h})
                url = f"{base}/?target={tgt}"
                page.goto(url, wait_until="networkidle")
                quick = "Ross" in tgt
                try:
                    page.wait_for_selector(".quick-side .motion" if quick else ".summary", timeout=90000 if quick else 15000)
                except Exception:
                    pass
                page.wait_for_timeout(800)
                rec = {"url": url, "viewport": [w, h], "page_height": page.evaluate("document.documentElement.scrollHeight"),
                       "horizontal_overflow": page.evaluate("document.documentElement.scrollWidth > window.innerWidth")}
                for k, s in SEL.items():
                    rec[k] = box(page, s)
                bottoms = {k: (v["y"] + v["height"]) for k, v in rec.items() if isinstance(v, dict) and "y" in v}
                rec["fits_first_screen"] = {k: b <= h for k, b in bottoms.items()}
                if shots:
                    name = f"{tgt.replace('%20', '-').lower()}_{w}x{h}.png"
                    page.screenshot(path=str(shots / name))
                    rec["shot"] = str(shots / name)
                out.append(rec)
                page.close()
        br.close()
    log.write_text("\n".join(json.dumps(r) for r in out) + "\n", encoding="utf-8")
    for r in out:
        print(r["url"], r["viewport"], r["fits_first_screen"], "overflowX" if r["horizontal_overflow"] else "")

if __name__ == "__main__":
    main()