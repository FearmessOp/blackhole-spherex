"""Time the IRSA SIA query a few times (block B): status, time, size, rows, CORS headers.

The first measurement in logs/range_probe.log got HTTP 502 for both collections,
so the query is repeated here with pauses. A response is only counted as data
when the status is 200 and the body parses as the SIA CSV (obs_id column).

Usage: .venv/Scripts/python.exe pipeline/sia_probe.py > logs/sia_probe.log 2>&1
"""
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sia_query import read_rows  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SIA = "https://irsa.ipac.caltech.edu/SIA"
ORIGIN = "https://blackhole-spherex.vercel.app"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
SLUGS = ["eps-indi-b", "wise-0855"]
TRIES = 3
SHOW = ("access-control-allow-origin", "content-type", "content-encoding", "content-length")

def main():
    targets = {t["slug"]: t for t in json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}
    n_ok = n_bad = 0
    for attempt in range(1, TRIES + 1):
        for slug in SLUGS:
            t = targets[slug]
            for coll in COLLECTIONS:
                params = {"COLLECTION": coll, "POS": f"circle {t['ra_query_deg']} {t['dec_query_deg']} 0.01",
                          "RESPONSEFORMAT": "CSV"}
                t0 = time.time()
                try:
                    r = requests.get(SIA, params=params, headers={"Origin": ORIGIN}, timeout=120)
                except Exception as e:  # noqa: BLE001
                    n_bad += 1
                    print(f"try {attempt} {slug} {coll}: FAILED after {time.time() - t0:.2f}s {e!r}")
                    continue
                dt = time.time() - t0
                header, rows = read_rows(r.text)
                is_data = r.status_code == 200 and "obs_id" in header
                n_ok += is_data
                n_bad += not is_data
                print(f"try {attempt} {slug} {coll}: status={r.status_code} time={dt:.2f}s bytes={len(r.content)} "
                      f"sia_rows={len(rows) if is_data else 'not a SIA table'} "
                      + json.dumps({k: r.headers.get(k) for k in SHOW})
                      + ("" if is_data else f" body={r.text[:160]!r}"))
                sys.stdout.flush()
        if attempt < TRIES:
            time.sleep(10)
    print(f"\nresponses with a SIA table: {n_ok}; without: {n_bad}")
    return 0

if __name__ == "__main__":
    sys.exit(main())