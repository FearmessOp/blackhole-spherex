"""Masked fraction of every raw playback frame, measured on the published sprite sheets.

Reads site/public/data/<slug>/raw.json and raw.png (grey + alpha; alpha 0 = no
data) and reports, per target, how many of the frames kept in the playback have
which fraction of empty pixels, and how many frames would be dropped at lower
thresholds than the current one. Nothing is changed.

Usage: .venv/Scripts/python.exe pipeline/raw_masked_fraction.py > logs/raw_masked_fraction.log 2>&1
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE_DATA = ROOT / "site" / "public" / "data"
EDGES = [0.0, 0.02, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50]
THRESHOLDS = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50]
LIST_ABOVE = 0.20  # frames with a larger empty fraction are listed one by one

def main():
    index = json.loads((SITE_DATA / "index.json").read_text(encoding="utf-8"))
    for t in index["targets"]:
        slug = t["slug"]
        raw = json.loads((SITE_DATA / slug / "raw.json").read_text(encoding="utf-8"))
        sheet = np.array(Image.open(SITE_DATA / slug / raw["sheet"]).convert("LA"))
        npix, cols = raw["npix"], raw["cols"]
        c = npix // 2
        frac, core = [], []
        for i in range(len(raw["frames"])):
            r, q = divmod(i, cols)
            alpha = sheet[r * npix:(r + 1) * npix, q * npix:(q + 1) * npix, 1]
            empty = alpha == 0
            frac.append(float(empty.mean()))
            core.append(int(empty[c - 1:c + 2, c - 1:c + 2].sum()))
        frac = np.array(frac)
        core = np.array(core)
        n = len(frac)
        print(f"== {slug}: {n} frames in playback, {raw['n_dropped']} of {raw['n_total']} "
              f"already dropped at threshold {raw['max_masked_fraction']}, grid {npix}x{npix} px")
        print(f"   empty fraction: median={np.median(frac):.4f} "
              f"p90={np.percentile(frac, 90):.4f} max={frac.max():.4f}")
        print(f"   frames with no empty pixel: {int((frac == 0).sum())}")
        for lo, hi in zip(EDGES[:-1], EDGES[1:]):
            k = int(((frac > lo) & (frac <= hi)).sum())
            print(f"   empty fraction in ({lo:.2f}, {hi:.2f}]: {k}")
        for th in THRESHOLDS:
            k = int((frac > th).sum())
            print(f"   threshold {th:.2f}: would drop {k} more ({k + raw['n_dropped']} "
                  f"of {raw['n_total']} in total)")
        print(f"   frames with empty pixels in the central 3x3: {int((core > 0).sum())} "
              f"(all nine empty: {int((core == 9).sum())})")
        for i in np.where(frac > LIST_ABOVE)[0]:
            f = raw["frames"][i]
            print(f"   frame {i}: empty={frac[i]:.3f} core_empty={core[i]}/9 t={f['t']} "
                  f"epoch={f['epoch']} det={f['det']} wave={f['wave_um']} release={f['release']}")
    return 0

if __name__ == "__main__":
    sys.exit(main())