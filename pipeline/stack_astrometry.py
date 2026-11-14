"""Position of a faint target on per-epoch stacks of selected detectors.

Frames of the chosen detectors are resampled to one fixed sky grid and stacked
per epoch (same code as stack_epochs.py). On each stack the target is measured
near the SIMBAD prediction (proper motion + parallax) with two estimators:
Gaussian-windowed centroid and 2D Gaussian fit. Errors: bootstrap over frames.
With 3 epochs a 5-parameter motion fit is not constrained, so only the measured
motion between epochs is compared with the prediction.

Usage: .venv/Scripts/python.exe pipeline/stack_astrometry.py wise-0855 5,6 > logs/stack_astrometry_wise-0855.log 2>&1
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

import astrom
import stack_epochs as se

ROOT = Path(__file__).resolve().parent.parent
N_BOOT = 300
MAX_PIX = 1.5  # a result further than this from the prediction is not the target

def win_cen(img, x0, y0, half=3, sigma=1.5):
    bg = float(np.nanmedian(img))
    x, y = float(x0), float(y0)
    for _ in range(8):
        xi, yi = int(round(x)), int(round(y))
        if not (half <= xi < img.shape[1] - half and half <= yi < img.shape[0] - half):
            return None
        jj, ii = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
        sub = np.nan_to_num(img[yi - half:yi + half + 1, xi - half:xi + half + 1] - bg)
        val = sub * np.exp(-((ii - x) ** 2 + (jj - y) ** 2) / (2 * sigma ** 2))
        if val.sum() <= 0:
            return None
        x, y = x + 2 * ((val * ii).sum() / val.sum() - x), y + 2 * ((val * jj).sum() / val.sum() - y)
    return x, y

def gauss_fit(img, x0, y0, half=3):
    xi, yi = int(round(x0)), int(round(y0))
    if not (half <= xi < img.shape[1] - half and half <= yi < img.shape[0] - half):
        return None
    jj, ii = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
    sub = img[yi - half:yi + half + 1, xi - half:xi + half + 1]
    good = np.isfinite(sub)
    bg = float(np.nanmedian(sub))

    def resid(p):
        model = p[2] * np.exp(-((ii - p[0]) ** 2 + (jj - p[1]) ** 2) / (2 * p[3] ** 2)) + p[4]
        return (sub - model)[good]

    try:
        fit = least_squares(resid, [x0, y0, max(float(np.nanmax(sub)) - bg, 1e-9), 1.3, bg],
                            bounds=([x0 - 2, y0 - 2, 0, 0.6, -np.inf], [x0 + 2, y0 + 2, np.inf, 3, np.inf]))
    except Exception:  # noqa: BLE001
        return None
    return float(fit.x[0]), float(fit.x[1])

METHODS = {"win": win_cen, "gauss": gauss_fit}

def main():
    slug = sys.argv[1]
    dets = {int(v) for v in sys.argv[2].split(",")}
    t = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    jobs = [j for j in json.loads((ROOT / "cache" / "manifest" / f"{slug}.json")
                                  .read_text(encoding="utf-8")) if (ROOT / j["path"]).exists()]
    ra0, dec0 = se.target_radec(t, float(np.mean([j["t_mid_mjd"] for j in jobs])))
    grid, gra, gdec = se.make_grid(ra0, dec0, se.NPIX)
    epochs, last = [], None
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > se.GAP_DAYS:
            epochs.append([])
        last = j["t_mid_mjd"]
        if j["detector"] in dets:
            epochs[-1].append(j)
    print(f"{slug}: detectors={sorted(dets)} frames per epoch={[len(e) for e in epochs]}; "
          f"prediction = SIMBAD pm + parallax ({t['plx_mas']} mas); {N_BOOT} bootstrap resamples")
    rng = np.random.default_rng(20261114)
    res = []
    for k, ep in enumerate(epochs):
        cube = np.array([se.load_frame(j, gra, gdec)[0] for j in ep])
        mjd = float(np.mean([j["t_mid_mjd"] for j in ep]))
        pra, pdec = astrom.propagate(t["ra_deg"], t["dec_deg"], t["pmra_masyr"], t["pmdec_masyr"],
                                     t["plx_mas"], 2000.0, mjd)
        px, py = (float(v) for v in grid.wcs_world2pix(pra, pdec, 0))
        stack = se.clipped_mean(cube)[0]
        med = float(np.nanmedian(stack))
        sig = float(1.4826 * np.nanmedian(np.abs(stack - med)))
        xi, yi = int(round(px)), int(round(py))
        snr = float(np.nanmax(stack[yi - 1:yi + 2, xi - 1:xi + 2]) - med) / sig
        row = {"epoch": k, "n": len(ep), "mjd": round(mjd, 2), "snr_peak": round(snr, 1)}
        line = f"epoch {k}: n={len(ep)} mean MJD={mjd:.1f} peak S/N at prediction={snr:.1f}"
        for name, fn in METHODS.items():
            m = fn(stack, px, py)
            if not m or math.hypot(m[0] - px, m[1] - py) > MAX_PIX:
                line += f" | {name}: not measured within {MAX_PIX} px"
                continue
            boot = [fn(se.clipped_mean(cube[rng.integers(0, len(ep), len(ep))])[0], px, py)
                    for _ in range(N_BOOT)]
            ok = np.array([b for b in boot if b and math.hypot(b[0] - px, b[1] - py) <= MAX_PIX])
            e, n = -(m[0] - px) * se.SCALE_ARCSEC, (m[1] - py) * se.SCALE_ARCSEC
            ee, en = (ok.std(axis=0) * se.SCALE_ARCSEC) if len(ok) > 10 else (float("nan"),) * 2
            # absolute offset on the grid (east, north of the grid centre), for motion between epochs
            c = (se.NPIX - 1) / 2.0
            row[name] = {"de": e, "dn": n, "ee": float(ee), "en": float(en),
                         "east": -(m[0] - c) * se.SCALE_ARCSEC, "north": (m[1] - c) * se.SCALE_ARCSEC,
                         "boot_ok": len(ok)}
            line += (f" | {name}: measured-predicted east={e:+.2f}+-{ee:.2f} north={n:+.2f}+-{en:.2f} "
                     f"arcsec (bootstrap kept {len(ok)}/{N_BOOT})")
        c = (se.NPIX - 1) / 2.0
        row["pred"] = {"east": -(px - c) * se.SCALE_ARCSEC, "north": (py - c) * se.SCALE_ARCSEC}
        res.append(row)
        print(line)
    for a in range(len(res)):
        for b in range(a + 1, len(res)):
            pe = res[b]["pred"]["east"] - res[a]["pred"]["east"]
            pn = res[b]["pred"]["north"] - res[a]["pred"]["north"]
            line = f"motion epoch {a} -> {b}: predicted east={pe:+.2f} north={pn:+.2f} arcsec"
            for name in METHODS:
                if name in res[a] and name in res[b]:
                    A, B = res[a][name], res[b][name]
                    line += (f" | {name}: east={B['east'] - A['east']:+.2f}+-{math.hypot(A['ee'], B['ee']):.2f} "
                             f"north={B['north'] - A['north']:+.2f}+-{math.hypot(A['en'], B['en']):.2f}")
                else:
                    line += f" | {name}: not available"
            print(line)
    out = ROOT / "data" / "astrometry" / f"{slug}_stack_d{''.join(str(d) for d in sorted(dets))}.json"
    out.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"wrote {out}")
    return 0

if __name__ == "__main__":
    sys.exit(main())