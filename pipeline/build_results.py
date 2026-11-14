"""Collect measured results into site/public/data/<slug>/results.json.

No number is typed here: everything is read from data/astrometry/*.json|csv,
data/flicker/*.json, data/targets.json and the site's meta.json.

Usage: .venv/Scripts/python.exe pipeline/build_results.py > logs/build_results.log 2>&1
"""
import csv
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AST = ROOT / "data" / "astrometry"
SITE = ROOT / "site" / "public" / "data"
SCALE = 6.15
LABELS = {"win": "Windowed centroid", "psf": "ePSF fit", "gauss": "Gaussian fit"}
# target CSV used for the saturation count (one row per exposure, "flags" column)
SAT_SRC = {"barnard": "barnard_target_wings.csv", "eps-indi-b": "eps-indi-b_target.csv",
           "wise-0855": "wise-0855_target.csv", "rw-aur": "rw-aur_target.csv",
           "r-dra": "r-dra_target.csv"}

def load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

def saturation(slug):
    name = SAT_SRC.get(slug)
    if not name or not (AST / name).exists():
        return None
    rows = list(csv.DictReader((AST / name).open(encoding="utf-8")))
    n = sum(1 for r in rows if "OVERFLOW" in r["flags"].split("+"))
    res = {"overflow": n, "exposures": len(rows), "source": f"data/astrometry/{name}",
           "core_empty": None, "core_filled": None}
    # saturation_check.py: do the saturated cores hold NaN (drawn black) or a value?
    chk = (load(AST / "saturation_check.json") or {}).get(slug)
    if chk and chk["overflow"] == n:  # only if both scripts count the same exposures
        res.update(core_empty=chk["overflow_with_nan"], core_filled=chk["overflow_all_finite"],
                   check_source="data/astrometry/saturation_check.json")
    elif chk:
        print(f"{slug}: saturation_check.json has overflow={chk['overflow']}, CSV has {n}; "
              f"core counts not used")
    return res

def motion_fit(slug, meta):
    fit = load(AST / f"{slug}_fit_aligned.json")
    if not fit or slug != "eps-indi-b":  # the Barnard fit exists but is not usable
        return None
    ref = fit["reference"]
    methods = []
    for m in ("win", "psf"):
        v, e, loo = fit[m]["values"], fit[m]["bootstrap_err"], fit[m].get("leave_one_epoch_out", {})
        methods.append({
            "id": m, "label": LABELS[m], "n_used": fit[m]["n_used"],
            "pm_east": v["pm_east_masyr"], "pm_east_err": e["pm_east_masyr"],
            "pm_north": v["pm_north_masyr"], "pm_north_err": e["pm_north_masyr"],
            "plx": v["plx_mas"], "plx_err": e["plx_mas"],
            "plx_loo_min": min(loo["plx_mas"]) if loo else None,
            "plx_loo_max": max(loo["plx_mas"]) if loo else None,
            "plx_excess_pct": round(100.0 * (v["plx_mas"] - ref[2]) / ref[2], 1)})
    # Arrow on the image: ePSF proper motion over the time span of the data,
    # starting at the stack centroid of the first epoch (display pixels, y down).
    ep = meta["epochs"]
    span = ep[-1]["year_mean"] - ep[0]["year_mean"]
    start = ep[0].get("measured") or ep[0]["predicted"]
    psf = fit["psf"]["values"]
    arrow = {"x": start["x"], "y": start["y"], "span_years": round(span, 3),
             "dx": round(-psf["pm_east_masyr"] * span / 1000.0 / SCALE, 3),
             "dy": round(-psf["pm_north_masyr"] * span / 1000.0 / SCALE, 3),
             "method": "psf"}
    return {"t0_year": fit["t0_year"], "aligned_to_field_stars": fit["aligned_to_field_stars"],
            "reference": {"pm_east": ref[0], "pm_north": ref[1], "plx": ref[2],
                          "source": "SIMBAD", "bibcode": meta["reference"]["pm_bibcode"]},
            "methods": methods, "arrow": arrow,
            "source": f"data/astrometry/{slug}_fit_aligned.json"}

def stack_motion(slug):
    rows = load(AST / f"{slug}_stack_d56.json")
    if not rows:
        return None
    pairs = []
    for a in range(len(rows)):
        for b in range(a + 1, len(rows)):
            A, B = rows[a], rows[b]
            p = {"from": a, "to": b,
                 "predicted": {"east": round(B["pred"]["east"] - A["pred"]["east"], 2),
                               "north": round(B["pred"]["north"] - A["pred"]["north"], 2)},
                 "methods": []}
            for m in ("win", "gauss"):
                if m in A and m in B:
                    p["methods"].append({
                        "id": m, "label": LABELS[m],
                        "east": round(B[m]["east"] - A[m]["east"], 2),
                        "east_err": round(math.hypot(A[m]["ee"], B[m]["ee"]), 2),
                        "north": round(B[m]["north"] - A[m]["north"], 2),
                        "north_err": round(math.hypot(A[m]["en"], B[m]["en"]), 2)})
            pairs.append(p)
    res = {"band": "d56",
           "epochs": [{"epoch": r["epoch"], "n_frames": r["n"], "snr_peak": r["snr_peak"]}
                      for r in rows],
           "pairs": pairs, "neighbour": None, "source": f"data/astrometry/{slug}_stack_d56.json"}
    # neighbour_test.py: the same stacks measured with a nearby Gaia star in the model
    test = load(AST / f"{slug}_neighbour_test.json")
    if test and len(test["long"]) == len(rows):
        L = test["long"]
        for p in pairs:
            A, B = L[p["from"]]["two"], L[p["to"]]["two"]
            p["methods"].append({
                "id": "two", "label": "Gaussian fit, neighbour modelled",
                "east": round(B["east"] - A["east"], 2),
                "east_err": round(math.hypot(A["ee"], B["ee"]), 2),
                "north": round(B["north"] - A["north"], 2),
                "north_err": round(math.hypot(A["en"], B["en"]), 2)})
        nb = load(AST / f"{slug}_neighbours.json") or []
        g = next((s["g"] for e in nb for s in e["neighbours"]
                  if s["source_id"] == test["gaia_id"]), None)
        short = [s for s in test["short"] if "east" in s]
        # Gaia position of the star on the display grid, one entry per epoch (neighbours.py)
        xy = [next(({"x": s["x"], "y": s["y"]} for s in e["neighbours"]
                    if s["source_id"] == test["gaia_id"]), None) for e in nb]
        res["neighbour"] = {
            "gaia_id": test["gaia_id"], "g": None if g is None else round(g, 2),
            "xy": xy if len(xy) == len(rows) and all(xy) else None,
            "sep_arcsec": [round(math.hypot(r["neighbour"]["east"], r["neighbour"]["north"]), 1)
                           for r in L],
            "amp_ratio": [round(r["two"]["amp_ratio"], 2) for r in L],
            "amp_ratio_range": [[round(r["two"]["amp_ratio_16"], 2),
                                 round(r["two"]["amp_ratio_84"], 2)] for r in L],
            # short-wavelength stacks: fitted position of the star minus its Gaia position
            "short_offset_max_arcsec": (round(max(math.hypot(s["east"], s["north"])
                                                  for s in short), 2) if short else None),
            "short_snr_min": min(s["snr_peak"] for s in test["short"]),
            "source": f"data/astrometry/{slug}_neighbour_test.json, "
                      f"data/astrometry/{slug}_neighbours.json"}
    return res

def per_exposure_attempt(slug):
    """Summary of the per-exposure D5+D6 fit that did not work (WISE 0855)."""
    fit = load(AST / f"{slug}_fit.json")
    src = AST / f"{slug}_target.csv"
    if slug != "wise-0855" or not fit or not src.exists():
        return None
    rows = [r for r in csv.DictReader(src.open(encoding="utf-8"))
            if r["clean"] == "1" and r["ra_win"] and r["ra_psf"] and r["detector"] in ("5", "6")]
    return {"usable": False, "detectors": [5, 6], "n_exposures": len(rows),
            "median_snr": round(statistics.median(float(r["snr_peak"]) for r in rows), 1),
            "plx": [{"label": LABELS[m], "value": fit[m]["values"]["plx_mas"],
                     "err": fit[m]["bootstrap_err"]["plx_mas"]} for m in ("win", "psf")],
            "reference_plx": fit["reference"][2],
            "source": f"data/astrometry/{slug}_fit.json, data/astrometry/{slug}_target.csv"}

def main():
    index = []
    for t in load(ROOT / "data" / "targets.json"):
        slug = t["slug"]
        meta = load(SITE / slug / "meta.json")
        if not meta:
            print(f"{slug}: no meta.json, skipped")
            continue
        raw = load(SITE / slug / "raw.json")
        sm = stack_motion(slug)
        res = {"slug": slug, "saturation": saturation(slug), "fit": motion_fit(slug, meta),
               "stack_motion": sm, "per_exposure_fit": per_exposure_attempt(slug),
               "flicker": load(ROOT / "data" / "flicker" / f"{slug}.json"),
               "raw_dropped": {"dropped": raw["n_dropped"], "total": raw["n_total"],
                               "max_masked_fraction": raw["max_masked_fraction"]},
               # diff_image.py output exists: the site asks for diff.json only then (no 404 for the others)
               "has_diff": (SITE / slug / "diff.json").exists(),
               # faint cold target measured on the long-wavelength stack: show that stack first
               "default_band": "d56" if sm else "all",
               "compare_bands": ["d123", "d56"] if sm else None}
        (SITE / slug / "results.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        index.append({"slug": slug, "name": t["name"], "sp_type": t["sp_type"],
                      "n_exposures": meta["n_exposures"], "n_epochs": len(meta["epochs"])})
        fl = res["flicker"]
        print(f"{slug}: saturation={res['saturation']} raw_dropped={res['raw_dropped']} "
              f"flicker={None if not fl else (fl['raw_scatter_median'], fl['epoch_std_median'], fl['n_stars'])}")
        if res["per_exposure_fit"]:
            print(f"  per-exposure fit (not usable): {res['per_exposure_fit']}")
        if res["fit"]:
            for m in res["fit"]["methods"]:
                print(f"  fit {m['id']}: pm_east={m['pm_east']}+-{m['pm_east_err']} "
                      f"pm_north={m['pm_north']}+-{m['pm_north_err']} plx={m['plx']}+-{m['plx_err']} "
                      f"plx_excess={m['plx_excess_pct']}% loo={m['plx_loo_min']}..{m['plx_loo_max']}")
            print(f"  reference={res['fit']['reference']} arrow={res['fit']['arrow']}")
        if res["stack_motion"]:
            for p in res["stack_motion"]["pairs"]:
                print(f"  stack motion {p['from']}->{p['to']}: predicted={p['predicted']} "
                      f"measured={[(m['id'], m['east'], m['east_err'], m['north'], m['north_err']) for m in p['methods']]}")
            print(f"  neighbour: {res['stack_motion']['neighbour']}")
    (SITE / "index.json").write_text(json.dumps({"targets": index}, indent=1), encoding="utf-8")
    print(f"index.json: {index}")
    return 0

if __name__ == "__main__":
    sys.exit(main())