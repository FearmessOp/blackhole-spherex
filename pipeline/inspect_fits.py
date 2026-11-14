"""Dump the structure of a few cached cutouts (HDUs, headers, target pixel).

Usage: .venv/Scripts/python.exe pipeline/inspect_fits.py [slug] [n] > logs/inspect_fits.log 2>&1
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parent.parent
warnings.simplefilter("ignore")

def main():
    slug = sys.argv[1] if len(sys.argv) > 1 else "barnard"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}.json").read_text(encoding="utf-8"))
    have = [j for j in jobs if (ROOT / j["path"]).exists()]
    print(f"{slug}: manifest={len(jobs)} on_disk={len(have)}")
    # first, middle and last exposure on disk
    picks = [have[0], have[len(have) // 2], have[-1]][:n]
    for k, job in enumerate(picks):
        path = ROOT / job["path"]
        print(f"\n===== {job['path']} bytes={path.stat().st_size}")
        print(f"manifest: det={job['detector']} t_mid_mjd={job['t_mid_mjd']} "
              f"center=({job['center_ra_deg']}, {job['center_dec_deg']})")
        with fits.open(path) as hdul:
            for i, h in enumerate(hdul):
                shape = None if h.data is None else h.data.shape
                dtype = None if h.data is None else h.data.dtype
                print(f"HDU {i}: name={h.name!r} type={type(h).__name__} shape={shape} "
                      f"dtype={dtype} bunit={h.header.get('BUNIT')!r}")
            if k == 0:
                for i, h in enumerate(hdul):
                    print(f"\n--- full header HDU {i} ({h.name})")
                    print(h.header.tostring(sep="\n", padding=False))
                    if type(h).__name__ == "BinTableHDU":
                        print("columns:", h.columns.names)
                        for name in h.columns.names:
                            col = np.asarray(h.data[name])
                            print(f"  {name}: shape={col.shape} dtype={col.dtype} "
                                  f"first={col.ravel()[:6]}")
            img = hdul["IMAGE"]
            w = WCS(img.header)
            print("WCS:", repr(w).replace("\n", " | "))
            x, y = w.celestial.world_to_pixel_values(job["center_ra_deg"], job["center_dec_deg"])
            print(f"target pixel (0-based) x={float(x):.2f} y={float(y):.2f}")
            xi, yi = int(round(float(x))), int(round(float(y)))
            for name in ("IMAGE", "FLAGS", "VARIANCE", "ZODI"):
                if name not in hdul:
                    print(f"{name}: missing")
                    continue
                d = hdul[name].data
                y0, y1 = max(0, yi - 2), min(d.shape[0], yi + 3)
                x0, x1 = max(0, xi - 2), min(d.shape[1], xi + 3)
                print(f"{name} 5x5 around target:\n{d[y0:y1, x0:x1]}")
                if name != "FLAGS":
                    print(f"{name} stats: nan={int(np.isnan(d).sum())} "
                          f"min={np.nanmin(d):.4g} median={np.nanmedian(d):.4g} "
                          f"max={np.nanmax(d):.4g}")
                else:
                    vals, counts = np.unique(d, return_counts=True)
                    print(f"FLAGS unique values: {dict(zip(vals.tolist(), counts.tolist()))}")

if __name__ == "__main__":
    main()