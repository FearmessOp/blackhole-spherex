"""Does a nearby Gaia star pull the stack position of a faint target?

Two checks on per-epoch stacks (same grid and stacking as stack_astrometry.py):
1. Short-wavelength stack (detectors 1-3): a single Gaussian is fitted at the
   Gaia position of the neighbour. A small offset confirms that the bright
   source seen there is that star.
2. Long-wavelength stack (detectors 5+6): the target is measured twice, with a
   single Gaussian (as in stack_astrometry.py) and with a two-source model in
   which the neighbour sits at its Gaia position (fixed) with a free amplitude.
   Both sources share one width. Errors: bootstrap over frames.

Output: data/astrometry/<slug>_neighbour_test.json
Usage:  .venv/Scripts/python.exe pipeline/neighbour_test.py wise-0855 5756956644387831296 > logs/neighbour_test_wise-0855.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

import astrom
import stack_astrometry as sa
import stack_epochs as se

ROOT = Path(__file__).resolve().parent.parent
N_BOOT = 200
HALF = 4  # 9x9 px window: holds the target and the neighbour in every epoch
S = se.SCALE_ARCSEC

def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def two_fit(img, tx, ty, nx, ny, half=HALF):
    """Target (free position) + neighbour (fixed position), shared width, flat background.

    Returns (x, y, amplitude target, amplitude neighbour, sigma) or None.
    """
    xi, yi = int(round(tx)), int(round(ty))
    if not (half <= xi < img.shape[1] - half and half <= yi < img.shape[0] - half):
        return None
    jj, ii = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
    sub = img[yi - half:yi + half + 1, xi - half:xi + half + 1]
    good = np.isfinite(sub)
    bg = float(np.nanmedian(sub))
    amp0 = max(float(np.nanmax(sub)) - bg, 1e-9)

    def resid(p):
        g_t = np.exp(-((ii - p[0]) ** 2 + (jj - p[1]) ** 2) / (2 * p[4] ** 2))
        g_n = np.exp(-((ii - nx) ** 2 + (jj - ny) ** 2) / (2 * p[4] ** 2))
        return (sub - (p[2] * g_t + p[3] * g_n + p[5]))[good]

    try:
        fit = least_squares(resid, [tx, ty, amp0, amp0 / 2, 1.3, bg],
                            bounds=([tx - 2, ty - 2, 0, 0, 0.6, -np.inf],
                                    [tx + 2, ty + 2, np.inf, np.inf, 3, np.inf]))
    except Exception:  # noqa: BLE001
        return None
    return tuple(float(v) for v in fit.x[:5])

def epoch_cubes(jobs, dets, gra, gdec):
    """Per epoch: (frames of the chosen detectors resampled to the grid, their mean MJD)."""
    groups, last = [], None
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > se.GAP_DAYS:
            groups.append([])
        last = j["t_mid_mjd"]
        if j["detector"] in dets:
            groups[-1].append(j)
    return [(np.array([se.load_frame(j, gra, gdec)[0] for j in g]),
             float(np.mean([j["t_mid_mjd"] for j in g]))) for g in groups]

def main():
    slug, gaia_id = sys.argv[1], sys.argv[2]
    t = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    jobs = [j for j in json.loads((ROOT / "cache" / "manifest" / f"{slug}.json")
                                  .read_text(encoding="utf-8")) if (ROOT / j["path"]).exists()]
    star = next(r for r in csv.DictReader((ROOT / "data" / "gaia" / f"{slug}_wide.csv")
                                          .open(encoding="utf-8")) if r["source_id"] == gaia_id)
    ra0, dec0 = se.target_radec(t, float(np.mean([j["t_mid_mjd"] for j in jobs])))
    grid, gra, gdec = se.make_grid(ra0, dec0, se.NPIX)
    print(f"{slug}: neighbour Gaia DR3 {gaia_id} G={fnum(star['phot_g_mean_mag']):.2f} "
          f"RP={fnum(star['phot_rp_mean_mag']):.2f}; window {2 * HALF + 1}x{2 * HALF + 1} px; "
          f"{N_BOOT} bootstrap resamples")

    def positions(mjd):
        pra, pdec = astrom.propagate(t["ra_deg"], t["dec_deg"], t["pmra_masyr"], t["pmdec_masyr"],
                                     t["plx_mas"], 2000.0, mjd)
        sra, sdec = astrom.propagate(fnum(star["ra"]), fnum(star["dec"]), fnum(star["pmra"]),
                                     fnum(star["pmdec"]), fnum(star["parallax"]),
                                     fnum(star["ref_epoch"]), mjd)
        tx, ty = (float(v) for v in grid.wcs_world2pix(pra, pdec, 0))
        nx, ny = (float(v) for v in grid.wcs_world2pix(sra, sdec, 0))
        return tx, ty, nx, ny

    # 1. is the bright short-wavelength source the Gaia star?
    print("--- detectors 1-3: single Gaussian fitted at the Gaia position of the neighbour")
    short = []
    for k, (cube, mjd) in enumerate(epoch_cubes(jobs, {1, 2, 3}, gra, gdec)):
        tx, ty, nx, ny = positions(mjd)
        stack = se.clipped_mean(cube)[0]
        med = float(np.nanmedian(stack))
        sig = float(1.4826 * np.nanmedian(np.abs(stack - med)))
        xi, yi = int(round(nx)), int(round(ny))
        snr = float(np.nanmax(stack[yi - 1:yi + 2, xi - 1:xi + 2]) - med) / sig
        m = sa.gauss_fit(stack, nx, ny)
        row = {"epoch": k, "n": len(cube), "snr_peak": round(snr, 1)}
        if m:
            row.update(east=round(-(m[0] - nx) * S, 2), north=round((m[1] - ny) * S, 2))
        short.append(row)
        print(f"epoch {k}: n={len(cube)} peak S/N at the Gaia position={snr:.1f} "
              f"fitted minus Gaia: " + (f"east={row['east']:+.2f} north={row['north']:+.2f} arcsec"
                                        if m else "no fit"))

    # 2. target position with and without the neighbour in the model
    print("--- detectors 5+6: target measured minus predicted (SIMBAD pm + parallax), arcsec")
    rng = np.random.default_rng(20261114)
    c = (se.NPIX - 1) / 2.0
    long_ = []
    for k, (cube, mjd) in enumerate(epoch_cubes(jobs, {5, 6}, gra, gdec)):
        tx, ty, nx, ny = positions(mjd)
        stack = se.clipped_mean(cube)[0]
        one = sa.gauss_fit(stack, tx, ty)
        two = two_fit(stack, tx, ty, nx, ny)
        boot = []
        for _ in range(N_BOOT):
            b = two_fit(se.clipped_mean(cube[rng.integers(0, len(cube), len(cube))])[0],
                        tx, ty, nx, ny)
            if b:
                boot.append((b[0], b[1], b[3] / b[2] if b[2] > 0 else np.nan))
        boot = np.array(boot)
        ex, ey = boot[:, 0].std() * S, boot[:, 1].std() * S
        ratio_lo, ratio_hi = np.nanpercentile(boot[:, 2], [16, 84])
        row = {"epoch": k, "n": len(cube), "mjd": round(mjd, 2),
               "neighbour": {"east": round(-(nx - tx) * S, 2), "north": round((ny - ty) * S, 2)},
               "pred": {"east": -(tx - c) * S, "north": (ty - c) * S},
               "one": {"de": -(one[0] - tx) * S, "dn": (one[1] - ty) * S,
                       "east": -(one[0] - c) * S, "north": (one[1] - c) * S},
               "two": {"de": -(two[0] - tx) * S, "dn": (two[1] - ty) * S,
                       "east": -(two[0] - c) * S, "north": (two[1] - c) * S,
                       "ee": float(ex), "en": float(ey), "amp_ratio": two[3] / two[2],
                       "amp_ratio_16": float(ratio_lo), "amp_ratio_84": float(ratio_hi),
                       "sigma_px": two[4], "boot_ok": len(boot)}}
        long_.append(row)
        nb = row["neighbour"]
        print(f"epoch {k}: n={len(cube)} neighbour at east={nb['east']:+.2f} north={nb['north']:+.2f} "
              f"(sep {math.hypot(nb['east'], nb['north']):.2f}) from the predicted target | "
              f"one source: east={row['one']['de']:+.2f} north={row['one']['dn']:+.2f} | "
              f"two sources: east={row['two']['de']:+.2f}+-{ex:.2f} north={row['two']['dn']:+.2f}+-{ey:.2f}, "
              f"amplitude neighbour/target={row['two']['amp_ratio']:.2f} "
              f"(16-84%: {ratio_lo:.2f}..{ratio_hi:.2f}), sigma={two[4]:.2f} px, "
              f"bootstrap kept {len(boot)}/{N_BOOT}")
    for a in range(len(long_)):
        for b in range(a + 1, len(long_)):
            A, B = long_[a], long_[b]
            print(f"motion epoch {a} -> {b}: predicted east={B['pred']['east'] - A['pred']['east']:+.2f} "
                  f"north={B['pred']['north'] - A['pred']['north']:+.2f} | one source: "
                  f"east={B['one']['east'] - A['one']['east']:+.2f} "
                  f"north={B['one']['north'] - A['one']['north']:+.2f} | two sources: "
                  f"east={B['two']['east'] - A['two']['east']:+.2f}+-{math.hypot(A['two']['ee'], B['two']['ee']):.2f} "
                  f"north={B['two']['north'] - A['two']['north']:+.2f}+-{math.hypot(A['two']['en'], B['two']['en']):.2f}")
    dst = ROOT / "data" / "astrometry" / f"{slug}_neighbour_test.json"
    dst.write_text(json.dumps({"gaia_id": gaia_id, "short": short, "long": long_}, indent=1),
                   encoding="utf-8")
    print(f"wrote {dst}")
    return 0

if __name__ == "__main__":
    sys.exit(main())