"""Is the EPSF table the same in every exposure of a detector?

Reads every cached cutout (narrow and wide), takes the raw data bytes of the
EPSF HDU and records: collection, detector, MJD, table rows, md5 of the data,
md5 of the EPSF header. Then counts the distinct tables per detector and, where
a detector has more than one, compares them zone by zone.

Each distinct table is saved once to cache/epsf/ (not in git); the list of
tables with their md5 is written to data/epsf/index.json and the per-file
record to data/epsf/epsf_check.csv.

Usage: .venv/Scripts/python.exe pipeline/epsf_check.py > logs/epsf_check.log 2>&1
"""
import csv
import hashlib
import json
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from astropy.io import fits

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
STORE = CACHE / "epsf"
OUT = ROOT / "data" / "epsf"

def probe(path):
    """Record for one cutout, or an error string."""
    try:
        with fits.open(path, memmap=True) as hdul:
            ih = hdul["IMAGE"].header
            eh = hdul["EPSF"].header
            info = hdul["EPSF"].fileinfo()
            rec = {"detector": int(ih["DETECTOR"]), "mjd": float(ih["MJD-AVG"]),
                   "rows": int(eh["NAXIS2"]), "row_bytes": int(eh["NAXIS1"]),
                   "header_md5": hashlib.md5(eh.tostring().encode("ascii", "replace")).hexdigest()}
        with open(path, "rb") as fh:
            fh.seek(info["datLoc"])
            rec["data_md5"] = hashlib.md5(fh.read(info["datSpan"])).hexdigest()
        rel = path.relative_to(CACHE).parts  # cutouts[_wide] / slug / collection / file
        rec.update(kind=rel[0], slug=rel[1], collection=rel[2], file=rel[-1],
                   path=path.relative_to(ROOT).as_posix())
        return rec
    except Exception as exc:  # noqa: BLE001
        return f"{path.relative_to(ROOT).as_posix()}: {type(exc).__name__}: {exc}"

def load_table(path):
    with fits.open(path) as hdul:
        d = hdul["EPSF"].data
        return (np.array(d["XCENTER"], float), np.array(d["YCENTER"], float),
                np.array(d["EPSF"], float), hdul["EPSF"].columns.formats)

def main():
    t0 = time.time()
    print(f"disk free at start: {shutil.disk_usage(ROOT).free / 1e9:.2f} GB")
    files = sorted(p for k in ("cutouts", "cutouts_wide") for p in (CACHE / k).rglob("*.fits"))
    print(f"cutout files found: {len(files)}")
    recs, errors = [], []
    with ThreadPoolExecutor(8) as pool:
        for i, r in enumerate(pool.map(probe, files), 1):
            (errors if isinstance(r, str) else recs).append(r)
            if i % 500 == 0:
                print(f"  {i} files read, {time.time() - t0:.0f} s", flush=True)
    print(f"read {len(recs)} files, {len(errors)} errors, {time.time() - t0:.0f} s")
    for e in errors[:20]:
        print(f"  error: {e}")
    OUT.mkdir(parents=True, exist_ok=True)
    cols = ["kind", "slug", "collection", "file", "detector", "mjd", "rows", "row_bytes", "data_md5", "header_md5"]
    with (OUT / "epsf_check.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(recs)

    groups = {}
    for r in recs:
        groups.setdefault((r["detector"], r["data_md5"]), []).append(r)
    dets = sorted({r["detector"] for r in recs})
    print(f"\ndistinct EPSF data tables: {len(groups)} over detectors {dets}")
    STORE.mkdir(parents=True, exist_ok=True)
    index, tables = [], {}
    for (det, md5), g in sorted(groups.items(), key=lambda kv: (kv[0][0], min(r["mjd"] for r in kv[1]))):
        colls = {}
        for r in g:
            colls[r["collection"]] = colls.get(r["collection"], 0) + 1
        mjds = [r["mjd"] for r in g]
        name = f"epsf_D{det}_{g[0]['rows']}_{md5[:8]}.fits"
        with fits.open(ROOT / g[0]["path"]) as hdul:
            fits.HDUList([fits.PrimaryHDU(), hdul["EPSF"].copy()]).writeto(STORE / name, overwrite=True)
        tables[(det, md5)] = load_table(STORE / name)
        entry = {"detector": det, "data_md5": md5, "rows": g[0]["rows"], "row_bytes": g[0]["row_bytes"],
                 "n_files": len(g), "collections": colls, "mjd_min": round(min(mjds), 3),
                 "mjd_max": round(max(mjds), 3), "header_md5_count": len({r["header_md5"] for r in g}),
                 "kinds": sorted({r["kind"] for r in g}), "stored_as": f"cache/epsf/{name}",
                 "stored_bytes": (STORE / name).stat().st_size, "example": g[0]["path"],
                 "column_formats": list(tables[(det, md5)][3])}
        index.append(entry)
        print(f"D{det} md5={md5} rows={entry['rows']} files={len(g)} collections={colls} "
              f"mjd={entry['mjd_min']}..{entry['mjd_max']} headers={entry['header_md5_count']} "
              f"kinds={entry['kinds']} formats={entry['column_formats']} stored={entry['stored_bytes']} bytes")

    print("\nper detector:")
    for det in dets:
        own = [e for e in index if e["detector"] == det]
        print(f"D{det}: {len(own)} distinct table(s), {sum(e['n_files'] for e in own)} files")
        # Do the tables of one detector overlap in time? Then MJD cannot choose between them.
        for a in own:
            for b in own:
                if a["data_md5"] >= b["data_md5"]:
                    continue
                xa, ya, pa, _ = tables[(det, a["data_md5"])]
                xb, yb, pb, _ = tables[(det, b["data_md5"])]
                common = [(i, int(np.argmin((xb - xa[i]) ** 2 + (yb - ya[i]) ** 2))) for i in range(len(xa))]
                common = [(i, j) for i, j in common if abs(xb[j] - xa[i]) < 1e-6 and abs(yb[j] - ya[i]) < 1e-6]
                diff = max((float(np.abs(pa[i] - pb[j]).max()) for i, j in common), default=float("nan"))
                peak = float(max(pa.max(), pb.max()))
                overlap = a["mjd_min"] <= b["mjd_max"] and b["mjd_min"] <= a["mjd_max"]
                print(f"  {a['data_md5'][:8]} ({a['rows']} rows) vs {b['data_md5'][:8]} ({b['rows']} rows): "
                      f"zones with the same centre {len(common)}, largest EPSF difference there {diff:.3e} "
                      f"(table peak {peak:.3e}), MJD ranges overlap: {overlap}")
    one = all(sum(1 for e in index if e["detector"] == d) == 1 for d in dets)
    print(f"\none table per detector in all cached files: {one}")
    (OUT / "index.json").write_text(json.dumps({"n_files": len(recs), "n_errors": len(errors),
                                                "one_table_per_detector": one, "tables": index}, indent=1),
                                    encoding="utf-8")
    print(f"wrote data/epsf/index.json, data/epsf/epsf_check.csv; tables in cache/epsf/: "
          f"{sum(e['stored_bytes'] for e in index)} bytes")
    print(f"disk free at end: {shutil.disk_usage(ROOT).free / 1e9:.2f} GB, {time.time() - t0:.0f} s")
    return 0

if __name__ == "__main__":
    sys.exit(main())