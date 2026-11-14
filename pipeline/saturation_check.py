"""Saturated cores: are OVERFLOW pixels empty (NaN) or do they still carry a value?

For every exposure, the 3x3 pixels at the catalogue position (same starting
point as target_astrometry.py) are inspected: OVERFLOW flag, NaN, and both.
The site draws NaN pixels black and OVERFLOW pixels with a value as they are,
so this tells what a viewer sees on a saturated target.

Output: data/astrometry/saturation_check.json
Usage:  .venv/Scripts/python.exe pipeline/saturation_check.py > logs/saturation_check.log 2>&1
"""
import json
import sys
from pathlib import Path

import numpy as np

import astrom

ROOT = Path(__file__).resolve().parent.parent

def main():
    targets = json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))
    slugs = sys.argv[1:] or [t["slug"] for t in targets]
    targets = {t["slug"]: t for t in targets}
    out = {}
    for slug in slugs:
        t = targets[slug]
        jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}.json").read_text(encoding="utf-8"))
        n = n_edge = n_over = n_nan = n_over_with_nan = n_over_all_finite = 0
        px_over = px_over_nan = 0
        for j in jobs:
            path = ROOT / j["path"]
            if not path.exists():
                continue
            cut = astrom.open_cutout(path)
            ra, dec = astrom.propagate(t["ra_deg"], t["dec_deg"], t["pmra_masyr"], t["pmdec_masyr"],
                                       t["plx_mas"], 2000.0, cut["mjd"])
            x, y = astrom.sky_to_pix(cut, ra, dec)
            xi, yi = int(round(x)), int(round(y))
            ny, nx = cut["img"].shape
            # same edge rule as target_astrometry.py, so the counts match its CSV
            if not (3 <= xi < nx - 3 and 3 <= yi < ny - 3):
                n_edge += 1
                continue
            n += 1
            sl = (slice(yi - 1, yi + 2), slice(xi - 1, xi + 2))
            over = (cut["flags"][sl] & cut["bits"].get("OVERFLOW", 0)) != 0
            nan = ~np.isfinite(cut["img"][sl])
            n_over += int(over.any())
            n_nan += int(nan.any())
            n_over_with_nan += int(over.any() and nan.any())
            n_over_all_finite += int(over.any() and not nan.any())
            px_over += int(over.sum())
            px_over_nan += int((over & nan).sum())
        out[slug] = {"exposures": n, "edge": n_edge, "overflow": n_over, "nan": n_nan,
                     "overflow_with_nan": n_over_with_nan,
                     "overflow_all_finite": n_over_all_finite,
                     "overflow_pixels": px_over, "overflow_pixels_nan": px_over_nan}
        print(f"{slug}: exposures={n} (target at cutout edge: {n_edge}); central 3x3 px: "
              f"OVERFLOW in {n_over}, NaN in {n_nan}; OVERFLOW exposures with a NaN pixel: "
              f"{n_over_with_nan}, with all 9 pixels finite: {n_over_all_finite}; "
              f"OVERFLOW pixels: {px_over}, of these NaN: {px_over_nan}")
    dst = ROOT / "data" / "astrometry" / "saturation_check.json"
    dst.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {dst}")
    return 0

if __name__ == "__main__":
    sys.exit(main())