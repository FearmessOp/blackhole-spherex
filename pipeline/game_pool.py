"""Pool of targets for the game mode (block B1).

A candidate enters if its first-to-last epoch shift of the catalogue position on the site
grid is at least MIN_SHIFT_PX, or if its difference image in the game band is "distinct"
(pipeline/diff_image.py, criteria fixed there). Rule fixed before the pool was built.
Candidates: Barnard, Epsilon Indi B, WISE 0855 (D5+6 only) and the nine fast movers with a fit.
Not candidates: omi02 Eri B (no fit), RW Aurigae and R Draconis (saturated, no motion).

Output: site/public/data/game.json. Usage: .venv python pipeline/game_pool.py > logs/game_pool.log
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site" / "public" / "data"
MIN_SHIFT_PX = 1.0
CANDIDATES = [("barnard", "all"), ("eps-indi-b", "all"), ("wise-0855", "d56"),
              ("ssspm-j1444-2019", "all"), ("wolf-28", "all"), ("lawd-37", "all"), ("g-275-92", "all"),
              ("lp-651-7", "all"), ("lehpm-3396", "all"), ("lsr-j1826-3014", "all"),
              ("2mass-j02511490-0352459", "all"), ("g-221-5", "all")]
EXCLUDED = {"omi02-eri-b": "no fit shown (8 of 432 exposures usable)",
            "rw-aur": "saturated, no motion measured", "r-dra": "saturated, no motion measured"}

def main():
    pool = []
    print(f"rule: shift >= {MIN_SHIFT_PX} px (first to last epoch, catalogue) or difference image distinct")
    for slug, band in CANDIDATES:
        meta = json.loads((SITE / slug / "meta.json").read_text(encoding="utf-8"))
        e0, e1 = meta["epochs"][0]["predicted"], meta["epochs"][-1]["predicted"]
        shift = math.hypot(e1["x"] - e0["x"], e1["y"] - e0["y"])
        dpath = ROOT / "data" / "diff" / f"{slug}.json"
        distinct = None
        if dpath.exists():
            d = json.loads(dpath.read_text(encoding="utf-8"))
            if band in d:
                distinct = bool(d[band].get("distinct"))
        has_png = (SITE / slug / f"diff_{band}.png").exists() and distinct is not None
        ok = shift >= MIN_SHIFT_PX or distinct is True
        print(f"{slug} band={band} shift={shift:.2f} px distinct={distinct} -> {'IN' if ok else 'OUT'}")
        if ok:
            pool.append({"slug": slug, "band": band, "has_diff": bool(has_png and distinct)})
    for slug, why in EXCLUDED.items():
        print(f"{slug}: not a candidate, {why}")
    print(f"pool: {len(pool)} targets")
    (SITE / "game.json").write_text(json.dumps({"rule": f"shift >= {MIN_SHIFT_PX} px or distinct difference image",
                                                "targets": pool}, indent=1), encoding="utf-8")
    print("wrote site/public/data/game.json")

if __name__ == "__main__":
    main()