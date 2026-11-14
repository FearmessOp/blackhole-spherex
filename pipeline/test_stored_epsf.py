"""Test: the stored per-detector EPSF table equals the one inside each cutout.

For a sample of cached cutouts (every detector, both collections, narrow and
wide, spread over the file list) the zone centres and EPSF arrays returned by
astrom.stored_epsf are compared with those read from the file itself, and
fit_epsf is run at the cutout centre with both.

Usage: .venv/Scripts/python.exe pipeline/test_stored_epsf.py > logs/test_stored_epsf.log 2>&1
"""
import csv
import sys
from pathlib import Path

import numpy as np

import astrom

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
PER_GROUP = 4  # files per (detector, collection, kind)

def main():
    rows = list(csv.DictReader((ROOT / "data" / "epsf" / "epsf_check.csv").open(encoding="utf-8")))
    groups = {}
    for r in rows:
        groups.setdefault((int(r["detector"]), r["collection"], r["kind"]), []).append(r)
    n = n_same = n_fit = n_fit_same = 0
    for key in sorted(groups):
        g = groups[key]
        step = max(1, len(g) // PER_GROUP)
        for r in g[::step][:PER_GROUP]:
            path = ROOT / "cache" / r["kind"] / r["slug"] / r["collection"] / r["file"]
            cut = astrom.open_cutout(path)
            det = int(cut["hdr"]["DETECTOR"])
            st = astrom.stored_epsf(det)
            same = all(a.shape == b.shape and np.array_equal(a, b)
                       for a, b in ((cut["zx"], st["zx"]), (cut["zy"], st["zy"]), (cut["epsf"], st["epsf"])))
            n += 1
            n_same += same
            ny, nx = cut["img"].shape
            own = astrom.fit_epsf(cut, (nx - 1) / 2, (ny - 1) / 2)
            alt = astrom.fit_epsf({**cut, **st}, (nx - 1) / 2, (ny - 1) / 2)
            if own is not None or alt is not None:
                n_fit += 1
                n_fit_same += own == alt
            if not same or own != alt:
                print(f"DIFFERENT: {path.relative_to(ROOT).as_posix()} D{det} table_same={same} "
                      f"fit_own={own} fit_stored={alt}")
        print(f"D{key[0]} {key[1]} {key[2]}: {len(g)} files in group, sampled {min(PER_GROUP, len(g[::step]))}")
    print(f"\nfiles compared: {n}; stored table identical to the file's table: {n_same} of {n}")
    print(f"fit_epsf ran in {n_fit} files; identical result with the stored table: {n_fit_same} of {n_fit}")
    return 0 if n_same == n and n_fit_same == n_fit else 1

if __name__ == "__main__":
    sys.exit(main())