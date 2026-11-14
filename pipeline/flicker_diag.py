"""Per-exposure diagnosis of flicker stars: why is a star measured in few
exposures, and where does its scatter come from?

Applies the same selection as flicker.py (same aperture, same rejection rules)
to the chosen Gaia stars and reports, per star:
- how many exposures were rejected, by reason;
- the kept aperture fluxes by detector and by epoch (count, median, share of
  negative values), and the detector mix of every epoch;
- the star's distance from the target and Gaia sources within NEIGHBOUR_ARCSEC.
Nothing is written except the log.

Usage: .venv/Scripts/python.exe pipeline/flicker_diag.py r-dra > logs/flicker_diag_r-dra.log 2>&1
       (optional: Gaia source ids after the slug; default = stars in data/flicker/<slug>.json)
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom
import field_astrometry as fa
import flicker

ROOT = Path(__file__).resolve().parent.parent
NEIGHBOUR_ARCSEC = 30.0

def med_scatter(v):
    v = np.asarray(v, float)
    med = float(np.median(v))
    return med, float(1.4826 * np.median(np.abs(v - med)))

def main():
    slug = sys.argv[1]
    ids = sys.argv[2:]
    if not ids:
        prev = json.loads((ROOT / "data" / "flicker" / f"{slug}.json").read_text(encoding="utf-8"))
        ids = [s["source_id"] for s in prev["stars"]]
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}_wide.json").read_text(encoding="utf-8"))
    jobs = [j for j in jobs if (ROOT / j["path"]).exists()]
    _, refs = fa.load_refs(slug, "_wide")
    refs = [s for s in refs if s["source_id"] in ids]
    gaia = list(csv.DictReader((ROOT / "data" / "gaia" / f"{slug}_wide.csv").open(encoding="utf-8")))
    print(f"{slug}: wide cutouts on_disk={len(jobs)}; stars examined={len(refs)} of {len(ids)} asked")
    rec = {s["source_id"]: {"drop": {}, "kept": [], "sep": []} for s in refs}
    epoch, last = -1, None
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > flicker.GAP_DAYS:
            epoch += 1
        last = j["t_mid_mjd"]
        cut = astrom.open_cutout(ROOT / j["path"])
        ny, nx = cut["img"].shape
        for s in refs:
            r = rec[s["source_id"]]
            ra, dec = astrom.propagate(s["ra"], s["dec"], s["pmra"], s["pmdec"], s["parallax"],
                                       s["ref_epoch"], cut["mjd"])
            sep = math.hypot(*astrom.sky_offset(ra, dec, j["center_ra_deg"], j["center_dec_deg"]))
            r["sep"].append(sep)
            x, y = astrom.sky_to_pix(cut, ra, dec)
            xi, yi = int(round(x)), int(round(y))
            why = None
            if sep < fa.TARGET_EXCL:
                why = "closer to the target than the exclusion radius"
            elif not (0 <= xi < nx and 0 <= yi < ny):
                why = "outside the cutout"
            elif not (9 <= xi < nx - 9 and 9 <= yi < ny - 9):
                why = "within 9 px of the cutout edge"
            else:
                bad = astrom.core_flags(cut, x, y)
                if bad:
                    why = "core flag " + "+".join(bad)
            if why is None:
                sub = cut["img"][yi - flicker.HALF:yi + flicker.HALF + 1,
                                 xi - flicker.HALF:xi + flicker.HALF + 1]
                if not np.isfinite(sub).all():
                    why = "empty pixel in the 5x5 aperture"
            if why:
                r["drop"][why] = r["drop"].get(why, 0) + 1
                continue
            bg = astrom.local_background(cut["img"], xi, yi, r_in=5, r_out=8)
            r["kept"].append({"epoch": epoch, "det": j["detector"],
                              "flux": float(sub.sum() - bg * sub.size), "bg": bg,
                              "peak": float(sub.max() - bg)})
    n_ep = epoch + 1
    for s in refs:
        r = rec[s["source_id"]]
        k = r["kept"]
        print(f"\n== G={s['phot_g_mean_mag']:.2f} id={s['source_id']}")
        print(f"   distance from the target: {min(r['sep']):.1f}..{max(r['sep']):.1f} arcsec")
        near = []
        for g in gaia:
            if g["source_id"] == s["source_id"] or fa.fnum(g["phot_g_mean_mag"]) is None:
                continue
            d = math.hypot(*astrom.sky_offset(fa.fnum(g["ra"]), fa.fnum(g["dec"]), s["ra"], s["dec"]))
            if d <= NEIGHBOUR_ARCSEC:
                near.append((d, fa.fnum(g["phot_g_mean_mag"]), g["source_id"]))
        print(f"   Gaia sources within {NEIGHBOUR_ARCSEC:.0f} arcsec: {len(near)}")
        for d, g, sid in sorted(near):
            print(f"      {d:.1f} arcsec  G={g:.2f}  id={sid}")
        print(f"   exposures: {len(jobs)}; kept {len(k)}; rejected {len(jobs) - len(k)}")
        for why, n in sorted(r["drop"].items(), key=lambda t: -t[1]):
            print(f"      rejected, {why}: {n}")
        if not k:
            continue
        fl = np.array([m["flux"] for m in k])
        med, sc = med_scatter(fl)
        print(f"   kept fluxes: median={med:.4g} scatter(1.4826 MAD)={sc:.4g} "
              f"ratio={sc / med if med else float('nan'):.3f} "
              f"p16={np.percentile(fl, 16):.4g} p84={np.percentile(fl, 84):.4g} "
              f"min={fl.min():.4g} max={fl.max():.4g} negative={int((fl < 0).sum())} of {len(fl)}")
        bgm, bgs = med_scatter([m["bg"] for m in k])
        print(f"   local background (MJy/sr per pixel): median={bgm:.4g} scatter={bgs:.4g}; "
              f"median peak pixel above background={np.median([m['peak'] for m in k]):.4g}")
        for d in sorted({m["det"] for m in k}):
            v = np.array([m["flux"] for m in k if m["det"] == d])
            dm, ds = med_scatter(v)
            per = [sum(1 for m in k if m["det"] == d and m["epoch"] == e) for e in range(n_ep)]
            print(f"      detector {d}: n={len(v)} per_epoch={per} median flux={dm:.4g} "
                  f"scatter={ds:.4g} negative={int((v < 0).sum())}")
        for e in range(n_ep):
            v = [m["flux"] for m in k if m["epoch"] == e]
            if not v:
                print(f"      epoch {e}: no kept exposure")
                continue
            print(f"      epoch {e}: n={len(v)} clipped mean={flicker.clipped_mean(v):.4g} "
                  f"median={np.median(v):.4g} min={min(v):.4g} max={max(v):.4g} "
                  f"median background={np.median([m['bg'] for m in k if m['epoch'] == e]):.4g}")
    return 0

if __name__ == "__main__":
    sys.exit(main())