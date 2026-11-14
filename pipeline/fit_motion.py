"""Proper motion + parallax fit to the per-exposure target positions.

Model on the sky (arcsec), t in years from the mean epoch t0:
  east(t)  = e0 + pm_east  * t + plx * f_east(t)
  north(t) = n0 + pm_north * t + plx * f_north(t)
Offsets are taken from the SIMBAD position moved to t0 with proper motion only.
Both estimators (win = windowed centroid, psf = ePSF fit) use the same exposures.

Errors: bootstrap over exposures (statistical only). With 4 or more epochs the
fit is repeated leaving one epoch out; the spread shows the epoch-level systematics.

Usage: .venv/Scripts/python.exe pipeline/fit_motion.py eps-indi-b [--tag wide] [--det 5,6] > logs/fit_motion_eps-indi-b.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom

ROOT = Path(__file__).resolve().parent.parent
N_BOOT = 1000
MIN_STARS = 5  # field stars needed in an exposure to align it
NAMES = ["e0_mas", "n0_mas", "pm_east_masyr", "pm_north_masyr", "plx_mas"]

def solve(t, fe, fn, east, north):
    n = len(t)
    a = np.zeros((2 * n, 5))
    a[:n, 0], a[:n, 2], a[:n, 4] = 1.0, t, fe
    a[n:, 1], a[n:, 3], a[n:, 4] = 1.0, t, fn
    return np.linalg.lstsq(a, np.concatenate([east, north]), rcond=None)[0]

def residuals(p, t, fe, fn, east, north):
    return east - (p[0] + p[2] * t + p[4] * fe), north - (p[1] + p[3] * t + p[4] * fn)

def main():
    args = sys.argv[1:]
    tag, dets, align = "", None, None
    methods, align_with = ("win", "psf"), None
    ignore_clean = "--ignore-clean" in args  # wings files: saturation is handled by the estimator
    if ignore_clean:
        args.remove("--ignore-clean")
    if "--methods" in args:  # e.g. --methods win
        i = args.index("--methods")
        methods = tuple(args[i + 1].split(","))
        del args[i:i + 2]
    if "--align-with" in args:  # field-star estimator used for the correction, e.g. psf
        i = args.index("--align-with")
        align_with = args[i + 1]
        del args[i:i + 2]
    if "--align" in args:  # tag of the field-star file, e.g. --align wide
        i = args.index("--align")
        align = args[i + 1]
        del args[i:i + 2]
    if "--tag" in args:
        i = args.index("--tag")
        tag = "_" + args[i + 1]
        del args[i:i + 2]
    if "--det" in args:
        i = args.index("--det")
        dets = {int(v) for v in args[i + 1].split(",")}
        del args[i:i + 2]
    slug = args[0]
    tg = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    src = ROOT / "data" / "astrometry" / f"{slug}_target{tag}.csv"
    rows = [r for r in csv.DictReader(src.open(encoding="utf-8"))
            if (ignore_clean or r["clean"] == "1") and all(r[f"ra_{m}"] for m in methods)
            and (dets is None or int(r["detector"]) in dets)]
    print(f"methods={methods} ignore_clean={ignore_clean} align={align} "
          f"align_with={align_with or 'same estimator'}")
    corr = {}
    if align:
        # Per-exposure correction: median offset (measured minus Gaia) of the field
        # stars in the same exposure, separately for each estimator.
        by_file = {}
        fsrc = ROOT / "data" / "astrometry" / f"{slug}_field_{align}.csv"
        for r in csv.DictReader(fsrc.open(encoding="utf-8")):
            by_file.setdefault(r["file"], []).append(r)
        for name, st in by_file.items():
            if len(st) >= MIN_STARS:
                corr[name] = {m: (float(np.median([float(s[f"de_{m}"]) for s in st])),
                                  float(np.median([float(s[f"dn_{m}"]) for s in st])))
                              for m in ("win", "psf")}
        n_before = len(rows)
        rows = [r for r in rows if r["file"] in corr]
        print(f"alignment: {fsrc.name}; exposures with at least {MIN_STARS} field stars: "
              f"{len(corr)} of {len(by_file)}; target exposures kept {len(rows)} of {n_before}")
    mjd = np.array([float(r["mjd"]) for r in rows])
    epoch = np.array([int(r["epoch"]) for r in rows])
    t0_mjd = float(mjd.mean())
    t = (mjd - t0_mjd) / 365.25
    ra0, dec0 = astrom.propagate(tg["ra_deg"], tg["dec_deg"], tg["pmra_masyr"],
                                 tg["pmdec_masyr"], 0.0, 2000.0, t0_mjd)
    fe, fn = astrom.parallax_factors(ra0, dec0, mjd)
    ref = [tg["pmra_masyr"], tg["pmdec_masyr"], tg["plx_mas"]]
    print(f"{slug}{tag}: input={src.name} exposures={len(rows)} detectors={dets or 'all'} "
          f"epochs={sorted(set(epoch.tolist()))} span={mjd.min():.1f}..{mjd.max():.1f} MJD "
          f"t0={astrom.year_of(t0_mjd):.4f}")
    print(f"reference (SIMBAD, {tg['pm_bibcode']}): pm_east={ref[0]} pm_north={ref[1]} mas/yr "
          f"plx={ref[2]} mas")
    out = {"slug": slug, "t0_year": round(astrom.year_of(t0_mjd), 4), "reference": ref}
    rng = np.random.default_rng(20261114)
    for m in methods:
        off = [astrom.sky_offset(float(r[f"ra_{m}"]), float(r[f"dec_{m}"]), ra0, dec0)
               for r in rows]
        east, north = (np.array(v) * 1000.0 for v in zip(*off))  # mas
        if align:
            am = align_with or m
            ce = np.array([corr[r["file"]][am][0] for r in rows]) * 1000.0
            cn = np.array([corr[r["file"]][am][1] for r in rows]) * 1000.0
            east, north = east - ce, north - cn
            print(f"alignment applied ({m}): median correction east={np.median(ce):+.0f} "
                  f"north={np.median(cn):+.0f} mas; scatter between exposures "
                  f"east={ce.std():.0f} north={cn.std():.0f} mas")
        keep = np.ones(len(rows), bool)
        for _ in range(5):  # clip on the radial residual
            p = solve(t[keep], fe[keep], fn[keep], east[keep], north[keep])
            re, rn = residuals(p, t, fe, fn, east, north)
            r = np.hypot(re, rn)
            keep = r <= 3.0 * 1.4826 * np.median(r[keep])
        idx = np.flatnonzero(keep)
        boot = np.array([solve(t[s], fe[s], fn[s], east[s], north[s])
                         for s in (rng.choice(idx, idx.size) for _ in range(N_BOOT))])
        err = boot.std(axis=0)
        print(f"--- method={m}: used={idx.size} of {len(rows)} (clipped {len(rows) - idx.size}); "
              f"residual rms east={re[keep].std():.0f} north={rn[keep].std():.0f} mas")
        for k, name in enumerate(NAMES):
            line = f"{name} = {p[k]:+.1f} +- {err[k]:.1f}"
            if k >= 2:
                d = p[k] - ref[k - 2]
                line += (f"   SIMBAD {ref[k - 2]:+.1f}   difference {d:+.1f} "
                         f"({abs(d) / err[k]:.1f} x bootstrap error)")
            print(line)
        out[m] = {"n_used": int(idx.size), "values": dict(zip(NAMES, np.round(p, 2).tolist())),
                  "bootstrap_err": dict(zip(NAMES, np.round(err, 2).tolist()))}
        eps = sorted(set(epoch[keep].tolist()))
        if len(eps) >= 4:
            loo = np.array([solve(*(v[keep & (epoch != e)] for v in (t, fe, fn, east, north)))
                            for e in eps])
            for k in (2, 3, 4):
                print(f"leave-one-epoch-out {NAMES[k]}: "
                      + " ".join(f"{v:+.1f}" for v in loo[:, k])
                      + f"   (min {loo[:, k].min():+.1f}, max {loo[:, k].max():+.1f})")
            out[m]["leave_one_epoch_out"] = {NAMES[k]: np.round(loo[:, k], 2).tolist()
                                             for k in (2, 3, 4)}
        else:
            print(f"leave-one-epoch-out: not done, only {len(eps)} epochs")
        for e in eps:
            s = keep & (epoch == e)
            print(f"epoch {e}: n={int(s.sum())} mean residual east={re[s].mean():+.0f} "
                  f"north={rn[s].mean():+.0f} mas")
    out["aligned_to_field_stars"] = bool(align)
    dst = ROOT / "data" / "astrometry" / f"{slug}_fit{tag}{'_aligned' if align else ''}.json"
    dst.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {dst}")
    return 0

if __name__ == "__main__":
    sys.exit(main())