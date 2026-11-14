"""Control test: the proper motion + parallax fit of fit_motion.py on Gaia field stars.

For every Gaia DR3 reference star measured on the 0.2 deg cutouts
(data/astrometry/<slug>_field_wide.csv, written by field_astrometry.py) the same
5-parameter fit as for the target is run and compared with the Gaia values.

The field file holds "measured minus Gaia" per exposure, where Gaia was moved to
the exposure date with its proper motion and parallax. Adding that motion back
gives the measured offset from the Gaia position at the mean date t0, which is
what the fit needs:  east = de + pm_gaia * t + plx_gaia * f_east(t).

Alignment (as for the target): from every exposure the median offset of the
OTHER reference stars in the same exposure is subtracted, so a star never
corrects itself. The result is therefore tied to the Gaia frame of the field.

Selection, fixed before the results were seen: a star needs at least
MIN_EXPOSURES aligned exposures, in at least MIN_EPOCHS epochs with at least
MIN_PER_EPOCH exposures each. Stars that fail the comparison stay in the table.

Usage: .venv/Scripts/python.exe pipeline/validation_field_stars.py > logs/validation_field_stars.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom
from fit_motion import residuals, solve

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
AST = ROOT / "data" / "astrometry"
SLUGS = ["barnard", "eps-indi-b", "wise-0855", "rw-aur", "r-dra"]
METHODS = {"win": "Windowed centroid", "psf": "ePSF fit"}
PARAMS = [("pm_east", "pmra", "mas/yr"), ("pm_north", "pmdec", "mas/yr"), ("plx", "parallax", "mas")]
N_BOOT = 500
MIN_OTHERS = 5       # other reference stars in the same exposure, for the alignment
MIN_EXPOSURES = 30
MIN_EPOCHS = 3
MIN_PER_EPOCH = 5
P2 = math.erf(2.0 / math.sqrt(2.0))  # share within 2 errors if the errors are Gaussian and right
SITE_OUT = ROOT / "site" / "public" / "data" / "validation.json"

def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def fit_star(rows, gaia, m, by_file, aligned, rng):
    """Fit one star with estimator m. Returns a result dict, or a string saying why not."""
    use, ce, cn = [], [], []
    for r in rows:
        if aligned:
            others = [o for o in by_file[r["file"]] if o["source_id"] != r["source_id"]]
            if len(others) < MIN_OTHERS:
                continue
            ce.append(float(np.median([float(o[f"de_{m}"]) for o in others])))
            cn.append(float(np.median([float(o[f"dn_{m}"]) for o in others])))
        else:
            ce.append(0.0)
            cn.append(0.0)
        use.append(r)
    per_epoch = {}
    for r in use:
        per_epoch[r["epoch"]] = per_epoch.get(r["epoch"], 0) + 1
    good_epochs = [e for e, n in per_epoch.items() if n >= MIN_PER_EPOCH]
    if len(use) < MIN_EXPOSURES:
        return f"{len(use)} exposures (< {MIN_EXPOSURES})"
    if len(good_epochs) < MIN_EPOCHS:
        return f"{len(good_epochs)} epochs with >= {MIN_PER_EPOCH} exposures (< {MIN_EPOCHS})"
    mjd = np.array([float(r["mjd"]) for r in use])
    t = (mjd - mjd.mean()) / 365.25
    fe, fn = astrom.parallax_factors(gaia["ra"], gaia["dec"], mjd)
    east = (np.array([float(r[f"de_{m}"]) for r in use]) - np.array(ce)) * 1000.0 \
        + gaia["pmra"] * t + gaia["parallax"] * fe
    north = (np.array([float(r[f"dn_{m}"]) for r in use]) - np.array(cn)) * 1000.0 \
        + gaia["pmdec"] * t + gaia["parallax"] * fn
    keep = np.ones(len(use), bool)
    for _ in range(5):  # same clipping as fit_motion.py
        p = solve(t[keep], fe[keep], fn[keep], east[keep], north[keep])
        re, rn = residuals(p, t, fe, fn, east, north)
        rad = np.hypot(re, rn)
        keep = rad <= 3.0 * 1.4826 * np.median(rad[keep])
    idx = np.flatnonzero(keep)
    boot = np.array([solve(t[s], fe[s], fn[s], east[s], north[s])
                     for s in (rng.choice(idx, idx.size) for _ in range(N_BOOT))])
    err = boot.std(axis=0)
    out = {"n_used": int(idx.size), "n_epochs": len(good_epochs),
           "rms_mas": round(float(np.sqrt(np.mean(rad[keep] ** 2))), 0)}
    for k, (name, col, _) in zip((2, 3, 4), PARAMS):
        d = float(p[k] - gaia[col])
        out[name] = {"gaia": gaia[col], "gaia_err": gaia.get(col + "_error"),
                     "measured": round(float(p[k]), 1), "err": round(float(err[k]), 1),
                     "diff": round(d, 1), "diff_over_err": round(d / float(err[k]), 2)}
    return out

def summarize(stars, m):
    """Median, scatter and count within 2 errors of measured minus Gaia, per parameter."""
    res = {"n_stars": len(stars)}
    all_ok = np.ones(len(stars), bool)
    for name, _, unit in PARAMS:
        d = np.array([s[m][name]["diff"] for s in stars])
        e = np.array([s[m][name]["err"] for s in stars])
        ok = np.abs(d) <= 2.0 * e
        all_ok &= ok
        med = float(np.median(d))
        res[name] = {"unit": unit, "median_diff": round(med, 1),
                     "scatter": round(float(1.4826 * np.median(np.abs(d - med))), 1),
                     "median_err": round(float(np.median(e)), 1),
                     "within_2_err": int(ok.sum())}
    res["all_three_within_2_err"] = int(all_ok.sum())
    res["expected_within_2_err"] = round(P2 * len(stars), 1)
    res["expected_all_three"] = round(P2 ** 3 * len(stars), 1)
    return res

def print_summary(title, s):
    print(f"{title}: stars={s['n_stars']}")
    for name, _, unit in PARAMS:
        q = s[name]
        print(f"  {name:8s} measured-Gaia: median {q['median_diff']:+8.1f} {unit}, scatter (1.4826 MAD) "
              f"{q['scatter']:7.1f}, median bootstrap error {q['median_err']:7.1f}, "
              f"within 2 errors: {q['within_2_err']} of {s['n_stars']}")
    print(f"  all three parameters within 2 errors: {s['all_three_within_2_err']} of {s['n_stars']}")
    print(f"  expected for Gaussian errors of the right size: {s['expected_within_2_err']} per parameter, "
          f"{s['expected_all_three']} for all three (if the three were independent)")

def site_star(s):
    """One star for the site table: Gaia, measured, error, difference in errors."""
    out = {"id": s["source_id"], "g": round(s["g"], 2)}
    for m in METHODS:
        out[m] = {"n": s[m]["n_used"], "rms": s[m]["rms_mas"]}
        for name, _, _ in PARAMS:
            q = s[m][name]
            out[m][name] = [round(q["gaia"], 1), q["measured"], q["err"], q["diff_over_err"]]
    return out

def main():
    print(f"selection: >= {MIN_EXPOSURES} aligned exposures, >= {MIN_EPOCHS} epochs with >= {MIN_PER_EPOCH} "
          f"exposures; alignment: median of >= {MIN_OTHERS} other stars in the same exposure; "
          f"bootstrap resamples: {N_BOOT}")
    print(f"share within 2 errors for Gaussian errors: {P2:.4f} per parameter, {P2 ** 3:.4f} for three "
          f"independent parameters")
    rng = np.random.default_rng(20261114)
    result = {"selection": {"min_exposures": MIN_EXPOSURES, "min_epochs": MIN_EPOCHS,
                            "min_per_epoch": MIN_PER_EPOCH, "min_other_stars": MIN_OTHERS,
                            "n_boot": N_BOOT}, "fields": []}
    pooled = {True: [], False: []}
    for slug in SLUGS:
        src = AST / f"{slug}_field_wide.csv"
        if not src.exists():
            print(f"\n===== {slug}: {src.name} not found, field skipped")
            continue
        rows = list(csv.DictReader(src.open(encoding="utf-8")))
        gaia = {}
        for r in csv.DictReader((ROOT / "data" / "gaia" / f"{slug}_wide.csv").open(encoding="utf-8")):
            gaia[r["source_id"]] = {k: fnum(v) for k, v in r.items() if k != "source_id"}
        by_file, by_star = {}, {}
        for r in rows:
            by_file.setdefault(r["file"], []).append(r)
            by_star.setdefault(r["source_id"], []).append(r)
        print(f"\n===== {slug}: {len(rows)} measurements, {len(by_star)} stars, {len(by_file)} exposures, "
              f"epochs {sorted({int(r['epoch']) for r in rows})}")
        field = {"slug": slug, "n_measurements": len(rows), "n_stars_measured": len(by_star)}
        for aligned in (True, False):
            stars, skipped = [], []
            for sid, srows in sorted(by_star.items(), key=lambda kv: float(kv[1][0]["g"])):
                g = gaia.get(sid)
                if not g or g.get("pmra") is None or g.get("pmdec") is None or g.get("parallax") is None:
                    skipped.append((sid, "no Gaia proper motion or parallax"))
                    continue
                rec = {"source_id": sid, "g": float(srows[0]["g"])}
                why = None
                for m in METHODS:
                    fit = fit_star(srows, g, m, by_file, aligned, rng)
                    if isinstance(fit, str):
                        why = fit
                        break
                    rec[m] = fit
                if why:
                    skipped.append((sid, why))
                else:
                    stars.append(rec)
            label = "aligned" if aligned else "not aligned"
            print(f"--- {label}: stars fitted={len(stars)}, not fitted={len(skipped)}")
            for sid, why in skipped:
                print(f"  not fitted: Gaia DR3 {sid}: {why}")
            if not stars:
                continue
            if aligned:
                for m, mname in METHODS.items():
                    print(f"table ({mname}, aligned): value = Gaia | measured +- bootstrap error | "
                          f"difference (in errors)")
                    for s in stars:
                        parts = []
                        for name, _, _ in PARAMS:
                            q = s[m][name]
                            parts.append(f"{name} {q['gaia']:+8.1f} | {q['measured']:+8.1f} +- {q['err']:6.1f} | "
                                         f"{q['diff']:+7.1f} ({q['diff_over_err']:+5.2f})")
                        print(f"  {s['source_id']} G={s['g']:5.2f} n={s[m]['n_used']:3d} "
                              f"epochs={s[m]['n_epochs']} rms={s[m]['rms_mas']:.0f} mas  " + "  ".join(parts))
            summ = {m: summarize(stars, m) for m in METHODS}
            for m, mname in METHODS.items():
                print_summary(f"summary {slug}, {mname}, {label}", summ[m])
            pooled[aligned] += stars
            field["aligned" if aligned else "not_aligned"] = {
                "summary": summ,
                "not_fitted": [{"source_id": sid, "reason": why} for sid, why in skipped],
                **({"stars": stars} if aligned else {})}
        result["fields"].append(field)
    print("\n===== all fields together")
    result["all"] = {}
    for aligned in (True, False):
        if not pooled[aligned]:
            continue
        label = "aligned" if aligned else "not aligned"
        summ = {m: summarize(pooled[aligned], m) for m in METHODS}
        for m, mname in METHODS.items():
            print_summary(f"summary all fields, {mname}, {label}", summ[m])
        result["all"]["aligned" if aligned else "not_aligned"] = summ
    out = AST / "validation_field_stars.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT).as_posix()}")
    site = {"selection": result["selection"], "log": "logs/validation_field_stars.log",
            "all": result["all"],
            "fields": [{"slug": f["slug"], "summary": f["aligned"]["summary"],
                        "not_fitted": f["aligned"]["not_fitted"],
                        "stars": [site_star(s) for s in f["aligned"]["stars"]]}
                       for f in result["fields"] if "aligned" in f]}
    SITE_OUT.write_text(json.dumps(site, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {SITE_OUT.relative_to(ROOT).as_posix()} ({SITE_OUT.stat().st_size} bytes)")
    return 0

if __name__ == "__main__":
    sys.exit(main())