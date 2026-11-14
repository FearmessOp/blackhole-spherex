"""Query IRSA SIA2 for SPHEREx exposures covering each target (DR1 + QR3).

The collection list comes from logs/sia_collections.log (TAP query on
ivoa.obscore); "spherex_qr2" does not exist at IRSA any more.

Raw CSV responses are cached in data/sia/<slug>_<collection>.csv.
The log lists the returned columns, row counts and observation-time clusters.

Usage: .venv/Scripts/python.exe pipeline/sia_query.py > logs/sia_query.log 2>&1
"""
import csv
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from astropy.time import Time

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "data" / "targets.json"
OUT = ROOT / "data" / "sia"
SIA = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
RADIUS_DEG = 0.01
GAP_DAYS = 30.0  # exposures separated by more than this start a new epoch

def fetch(slug, coll, ra, dec):
    path = OUT / f"{slug}_{coll}.csv"
    if path.exists() and path.stat().st_size > 0:
        return slug, coll, path, "cached", None
    params = {"COLLECTION": coll, "POS": f"circle {ra} {dec} {RADIUS_DEG}",
              "RESPONSEFORMAT": "CSV"}
    last = None
    for attempt in range(1, 6):
        try:
            r = requests.get(SIA, params=params, timeout=180)
            r.raise_for_status()
            tmp = path.with_suffix(".part")
            tmp.write_bytes(r.content)
            tmp.replace(path)
            return slug, coll, path, f"http {r.status_code} attempt {attempt} url {r.url}", None
        except Exception as e:  # noqa: BLE001
            last = repr(e)
            time.sleep(5 * attempt)
    return slug, coll, path, "FAILED", last

def read_rows(text):
    """Parse the SIA CSV.

    IRSA leaves the JSON in the cloud_access column unquoted, so its commas
    split that field into several. Surplus fields are rejoined at that column.
    """
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header:
        return [], []
    k = header.index("cloud_access") if "cloud_access" in header else None
    rows = []
    for rec in reader:
        if not rec:
            continue
        extra = len(rec) - len(header)
        if extra > 0 and k is not None:
            rec = rec[:k] + [",".join(rec[k:k + extra + 1])] + rec[k + extra + 1:]
        rows.append(dict(zip(header, rec)))
    return header, rows

def summarize(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    cols, rows = read_rows(text)
    print(f"  rows={len(rows)} bytes={path.stat().st_size} columns={len(cols)}")
    if not rows:
        print(f"  first 120 chars: {text[:120]!r}")
        return
    keys = ["obs_id", "energy_bandpassname", "em_min", "em_max", "t_min",
            "t_exptime", "access_url", "access_estsize", "obs_release_date",
            "cloud_access", "upload_row_id"]
    print(f"  first row={json.dumps({k: rows[0].get(k) for k in keys})}")
    det = {}
    for r in rows:
        det[r.get("energy_bandpassname")] = det.get(r.get("energy_bandpassname"), 0) + 1
    print(f"  per detector={json.dumps(dict(sorted(det.items(), key=lambda kv: str(kv[0]))))}")
    if "t_min" in rows[0]:
        mjd = sorted(float(r["t_min"]) for r in rows if r["t_min"])
        clusters = [[mjd[0]]]
        for t in mjd[1:]:
            if t - clusters[-1][-1] > GAP_DAYS:
                clusters.append([t])
            else:
                clusters[-1].append(t)
        for i, c in enumerate(clusters):
            a = Time(c[0], format="mjd").isot[:16]
            b = Time(c[-1], format="mjd").isot[:16]
            print(f"  epoch {i}: n={len(c)} {a} .. {b} (MJD {c[0]:.3f} .. {c[-1]:.3f})")
    else:
        print("  no t_min column; epochs not derived")

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    targets = json.loads(TARGETS.read_text(encoding="utf-8"))
    jobs = [(t["slug"], c, t["ra_query_deg"], t["dec_query_deg"])
            for t in targets for c in COLLECTIONS]
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda j: fetch(*j), jobs))
    print(f"queries finished in {time.time() - t0:.1f}s")
    failed = 0
    for slug, coll, path, status, err in results:
        print(f"=== {slug} | {coll} | {status}")
        if err:
            failed += 1
            print(f"  error: {err}")
            continue
        summarize(path)
        sys.stdout.flush()
    print(f"\ndone; failed queries: {failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())