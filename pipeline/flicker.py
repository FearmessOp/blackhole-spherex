"""Flicker number: how much constant field stars change between raw exposures
and between epoch averages.

For up to N_STARS isolated Gaia DR3 stars per field, a 5x5 px aperture flux
(local background subtracted) is measured in every 0.2 deg cutout where the star
has a clean core. Two numbers per star:
- raw:   1.4826 MAD / median of the per-exposure fluxes (every exposure is taken
         at a different wavelength, so this is mostly the star's spectrum);
- epoch: (max - min) / (2 * mean) and std / mean of the per-epoch clipped means
         of those fluxes. This is the mean of the aperture fluxes of the epoch's
         exposures, not a measurement on the stacked image.

Output: data/flicker/<slug>.json
Usage:  .venv/Scripts/python.exe pipeline/flicker.py eps-indi-b > logs/flicker_eps-indi-b.log 2>&1
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom
import field_astrometry as fa

ROOT = Path(__file__).resolve().parent.parent
N_STARS = 5
HALF = 2            # 5x5 px aperture
MIN_PER_EPOCH = 8   # clean exposures a star needs in every epoch
GAP_DAYS = 30.0

def clipped_mean(v):
    v = np.asarray(v, float)
    med = np.median(v)
    mad = 1.4826 * np.median(np.abs(v - med))
    keep = np.abs(v - med) <= 5 * mad if mad > 0 else np.ones(len(v), bool)
    return float(v[keep].mean())

def main():
    slug = sys.argv[1]
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}_wide.json").read_text(encoding="utf-8"))
    n_all = len(jobs)
    jobs = [j for j in jobs if (ROOT / j["path"]).exists()]
    n_gaia, refs = fa.load_refs(slug, "_wide")
    print(f"{slug}: wide cutouts on_disk={len(jobs)} of {n_all}; candidate stars={len(refs)} "
          f"(isolated Gaia DR3, G {refs[0]['phot_g_mean_mag']:.2f}..{refs[-1]['phot_g_mean_mag']:.2f})")
    flux = {s["source_id"]: [] for s in refs}  # (epoch, flux)
    epoch, last = -1, None
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > GAP_DAYS:
            epoch += 1
        last = j["t_mid_mjd"]
        cut = astrom.open_cutout(ROOT / j["path"])
        ny, nx = cut["img"].shape
        for s in refs:
            ra, dec = astrom.propagate(s["ra"], s["dec"], s["pmra"], s["pmdec"], s["parallax"],
                                       s["ref_epoch"], cut["mjd"])
            if math.hypot(*astrom.sky_offset(ra, dec, j["center_ra_deg"],
                                             j["center_dec_deg"])) < fa.TARGET_EXCL:
                continue
            x, y = astrom.sky_to_pix(cut, ra, dec)
            xi, yi = int(round(x)), int(round(y))
            if not (9 <= xi < nx - 9 and 9 <= yi < ny - 9) or astrom.core_flags(cut, x, y):
                continue
            sub = cut["img"][yi - HALF:yi + HALF + 1, xi - HALF:xi + HALF + 1]
            if not np.isfinite(sub).all():
                continue
            bg = astrom.local_background(cut["img"], xi, yi, r_in=5, r_out=8)
            flux[s["source_id"]].append((epoch, float(sub.sum() - bg * sub.size)))
    n_ep = epoch + 1
    stars = []
    for s in refs:
        f = flux[s["source_id"]]
        per = [[v for e, v in f if e == k] for k in range(n_ep)]
        if min(len(p) for p in per) < MIN_PER_EPOCH:
            continue
        allv = np.array([v for _, v in f])
        med = float(np.median(allv))
        if med <= 0:
            continue
        raw = float(1.4826 * np.median(np.abs(allv - med)) / med)
        em = np.array([clipped_mean(p) for p in per])
        stars.append({"source_id": s["source_id"], "g": round(s["phot_g_mean_mag"], 2),
                      "n_exposures": len(f), "n_per_epoch": [len(p) for p in per],
                      "raw_scatter": round(raw, 4),
                      "epoch_std": round(float(em.std() / em.mean()), 4),
                      "epoch_half_range": round(float((em.max() - em.min()) / (2 * em.mean())), 4),
                      "epoch_means": [round(float(v), 4) for v in em]})
    stars = stars[:N_STARS]  # refs are sorted by brightness
    print(f"epochs={n_ep}; stars with at least {MIN_PER_EPOCH} clean exposures in every epoch, "
          f"brightest {N_STARS} kept: {len(stars)}")
    for st in stars:
        print(f"  G={st['g']} id={st['source_id']} n={st['n_exposures']} per_epoch={st['n_per_epoch']} "
              f"raw scatter={st['raw_scatter']:.1%} epoch std={st['epoch_std']:.1%} "
              f"epoch half-range={st['epoch_half_range']:.1%}")
    if not stars:
        print("no usable star; nothing written")
        return 1
    out = {"slug": slug, "n_exposures": len(jobs), "n_epochs": n_ep, "n_stars": len(stars),
           "aperture_px": 2 * HALF + 1,
           "raw_scatter_median": round(float(np.median([s["raw_scatter"] for s in stars])), 4),
           "epoch_std_median": round(float(np.median([s["epoch_std"] for s in stars])), 4),
           "epoch_half_range_median": round(float(np.median([s["epoch_half_range"] for s in stars])), 4),
           "stars": stars}
    print(f"field medians: raw scatter={out['raw_scatter_median']:.1%} "
          f"epoch std={out['epoch_std_median']:.1%} "
          f"epoch half-range={out['epoch_half_range_median']:.1%}")
    dst = ROOT / "data" / "flicker" / f"{slug}.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {dst}")
    return 0

if __name__ == "__main__":
    sys.exit(main())