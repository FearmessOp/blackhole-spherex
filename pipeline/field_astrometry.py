"""Field-star astrometry check: measured positions versus Gaia DR3, per exposure.

Gaia DR3 stars are moved to each exposure date (proper motion + parallax) and
measured with two estimators (windowed centroid, ePSF fit). Offsets are
measured minus Gaia, in arcsec on the sky, through the file's own WCS.

Output: data/astrometry/<slug>_field.csv (one row per star and exposure).
Usage:  .venv/Scripts/python.exe pipeline/field_astrometry.py barnard > logs/field_astrometry_barnard.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom

ROOT = Path(__file__).resolve().parent.parent
G_MAX = 17.5          # faintest reference star
MAX_REFS = 40         # brightest isolated stars kept
ISOLATION = 20.0      # arcsec: no comparably bright Gaia neighbour (within 2.5 mag) inside this
TARGET_EXCL = 25.0    # arcsec: stars this close to the target are not used
MAX_PIX = 1.5         # a measurement further than this from the prediction is dropped
GAP_DAYS = 30.0

def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def load_refs(slug, tag):
    path = ROOT / "data" / "gaia" / f"{slug}{tag}.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    stars = [{k: (r[k] if k == "source_id" else fnum(r[k])) for k in r} for r in rows]
    stars = [s for s in stars if s["phot_g_mean_mag"] is not None]
    ra = np.array([s["ra"] for s in stars])
    dec = np.array([s["dec"] for s in stars])
    g = np.array([s["phot_g_mean_mag"] for s in stars])
    refs = []
    for i in np.argsort(g):
        s = stars[i]
        if s["phot_g_mean_mag"] > G_MAX or s["pmra"] is None:
            continue
        sep = np.hypot((ra - ra[i]) * math.cos(math.radians(dec[i])), dec - dec[i]) * 3600.0
        near = (sep < ISOLATION) & (g < g[i] + 2.5)
        near[i] = False
        if not near.any():
            refs.append(s)
        if len(refs) >= MAX_REFS:
            break
    return len(stars), refs

def stats(v):
    v = np.asarray(v, float)
    med = float(np.median(v))
    sig = float(1.4826 * np.median(np.abs(v - med)))
    return med, sig, 1.2533 * sig / math.sqrt(len(v))

def main():
    args = sys.argv[1:]
    tag = ""
    if "--tag" in args:
        i = args.index("--tag")
        tag = "_" + args[i + 1]
        del args[i:i + 2]
    slug = args[0]
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}{tag}.json").read_text(encoding="utf-8"))
    n_all = len(jobs)
    jobs = [j for j in jobs if (ROOT / j["path"]).exists()]
    n_gaia, refs = load_refs(slug, tag)
    print(f"{slug}{tag}: manifest={n_all} on_disk={len(jobs)} gaia_sources={n_gaia} "
          f"reference_stars={len(refs)} (brightest {MAX_REFS} with G<{G_MAX}, proper motion, "
          f"isolated {ISOLATION} arcsec; G range "
          f"{refs[0]['phot_g_mean_mag']:.2f}..{refs[-1]['phot_g_mean_mag']:.2f})")
    epoch, last, rows, drop = -1, None, [], {}
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > GAP_DAYS:
            epoch += 1
        last = j["t_mid_mjd"]
        cut = astrom.open_cutout(ROOT / j["path"])
        for s in refs:
            ra, dec = astrom.propagate(s["ra"], s["dec"], s["pmra"], s["pmdec"], s["parallax"],
                                       s["ref_epoch"], cut["mjd"])
            if math.hypot(*astrom.sky_offset(ra, dec, j["center_ra_deg"],
                                             j["center_dec_deg"])) < TARGET_EXCL:
                continue
            x, y = astrom.sky_to_pix(cut, ra, dec)
            if not (4 <= x <= cut["img"].shape[1] - 5 and 4 <= y <= cut["img"].shape[0] - 5):
                continue
            bad = astrom.core_flags(cut, x, y)
            win = None if bad else astrom.win_centroid(cut, x, y)
            psf = None if bad else astrom.fit_epsf(cut, x, y)
            why = (bad[0] if bad else "no_win" if not win else "no_psf" if not psf else
                   "far" if max(math.hypot(win[0] - x, win[1] - y),
                                math.hypot(psf[0] - x, psf[1] - y)) > MAX_PIX else None)
            if why:
                drop[why] = drop.get(why, 0) + 1
                continue
            ew, nw = astrom.sky_offset(*astrom.pix_to_sky(cut, win[0], win[1]), ra, dec)
            ep, np_ = astrom.sky_offset(*astrom.pix_to_sky(cut, psf[0], psf[1]), ra, dec)
            rows.append({"file": j["file"], "collection": j["collection"], "epoch": epoch,
                         "detector": j["detector"], "mjd": round(cut["mjd"], 5),
                         "source_id": s["source_id"], "g": round(s["phot_g_mean_mag"], 2),
                         "x": round(x, 2), "y": round(y, 2), "flux": round(psf[2], 4),
                         "de_win": round(ew, 3), "dn_win": round(nw, 3),
                         "de_psf": round(ep, 3), "dn_psf": round(np_, 3)})
    out = ROOT / "data" / "astrometry" / f"{slug}_field{tag}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["file"])
        w.writeheader()
        w.writerows(rows)
    print(f"measurements kept={len(rows)} dropped={drop} -> {out}")
    if not rows:
        return 1

    def report(title, keyf):
        print(f"--- {title}: median offset measured-Gaia, arcsec "
              f"(scatter = 1.4826 MAD, err = error of the median)")
        for key in sorted({keyf(r) for r in rows}):
            sel = [r for r in rows if keyf(r) == key]
            parts = []
            for c in ("de_win", "dn_win", "de_psf", "dn_psf"):
                med, sig, err = stats([r[c] for r in sel])
                parts.append(f"{c}={med:+.3f} (scatter {sig:.3f}, err {err:.3f})")
            print(f"{key}: n={len(sel)} stars={len({r['source_id'] for r in sel})} "
                  f"exposures={len({r['file'] for r in sel})} " + " ".join(parts))

    report("by collection", lambda r: r["collection"])
    report("by epoch and collection", lambda r: (r["epoch"], r["collection"]))
    report("by detector", lambda r: f"D{r['detector']}")
    colls = sorted({r["collection"] for r in rows})
    if len(colls) == 2:
        for c in ("de_win", "dn_win", "de_psf", "dn_psf"):
            a = stats([r[c] for r in rows if r["collection"] == colls[0]])
            b = stats([r[c] for r in rows if r["collection"] == colls[1]])
            print(f"{colls[1]} minus {colls[0]} {c}: {b[0] - a[0]:+.3f} "
                  f"+- {math.hypot(a[2], b[2]):.3f} arcsec")
    d = [math.hypot(r["de_win"] - r["de_psf"], r["dn_win"] - r["dn_psf"]) for r in rows]
    print(f"windowed centroid versus ePSF fit, same star and exposure: "
          f"median separation {np.median(d):.3f} arcsec, 90th percentile {np.percentile(d, 90):.3f}")
    return 0

if __name__ == "__main__":
    sys.exit(main())