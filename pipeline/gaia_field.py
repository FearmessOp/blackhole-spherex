"""Fetch Gaia DR3 sources around each target (reference stars for astrometry checks).

Tries the ESA Gaia archive TAP first, then the Gaia DR3 copy at IRSA.
Raw CSV: data/gaia/<slug>.csv. No value is hard-coded; everything comes from the response.

Usage: .venv/Scripts/python.exe pipeline/gaia_field.py [--radius DEG --tag TAG] [--targets FILE] [slug ...]
           > logs/gaia_field.log 2>&1
--targets FILE reads the targets from FILE instead of data/targets.json.
"""
import csv
import io
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "gaia"
RADIUS_DEG = 0.04  # cutout is 29 px x 6.15 arcsec = 178 arcsec wide; half-diagonal 0.035 deg
COLS = ("source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, "
        "phot_rp_mean_mag, ruwe, ref_epoch")
SERVICES = [
    ("ESA Gaia archive", "https://gea.esac.esa.int/tap-server/tap/sync", "gaiadr3.gaia_source",
     {"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv"}),
    ("IRSA Gaia DR3 copy", "https://irsa.ipac.caltech.edu/TAP/sync", "gaia_dr3_source",
     {"FORMAT": "CSV"})]

def query(ra, dec):
    last = None
    for name, url, table, extra in SERVICES:
        adql = (f"SELECT {COLS} FROM {table} WHERE 1=CONTAINS(POINT('ICRS', ra, dec), "
                f"CIRCLE('ICRS', {ra}, {dec}, {RADIUS_DEG}))")
        for attempt in range(1, 4):
            try:
                r = requests.get(url, params={**extra, "QUERY": adql}, timeout=180)
                r.raise_for_status()
                if "source_id" not in r.text[:300]:
                    raise ValueError(f"unexpected response: {r.text[:200]!r}")
                return name, adql, r.text
            except Exception as e:  # noqa: BLE001
                last = f"{name} attempt {attempt}: {e!r}"
                print(f"  {last}", flush=True)
                time.sleep(4 * attempt)
    raise RuntimeError(last)

def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def main():
    global RADIUS_DEG
    args = sys.argv[1:]
    tag = ""
    if "--radius" in args:  # e.g. --radius 0.15 --tag wide for the 0.2 deg cutouts
        i = args.index("--radius")
        RADIUS_DEG = float(args[i + 1])
        del args[i:i + 2]
    if "--tag" in args:
        i = args.index("--tag")
        tag = "_" + args[i + 1]
        del args[i:i + 2]
    targets_path = ROOT / "data" / "targets.json"
    if "--targets" in args:
        i = args.index("--targets")
        targets_path = ROOT / args[i + 1]
        del args[i:i + 2]
    OUT.mkdir(parents=True, exist_ok=True)
    targets = json.loads(targets_path.read_text(encoding="utf-8"))
    if args:
        targets = [t for t in targets if t["slug"] in args]
    failed = 0
    for t in targets:
        slug = t["slug"]
        print(f"=== {slug} centre=({t['ra_query_deg']}, {t['dec_query_deg']}) radius={RADIUS_DEG} deg",
              flush=True)
        path = OUT / f"{slug}{tag}.csv"
        if path.exists() and path.stat().st_size > 0:
            text, service = path.read_text(encoding="utf-8"), "cached"
        else:
            try:
                service, adql, text = query(t["ra_query_deg"], t["dec_query_deg"])
            except Exception as e:  # noqa: BLE001
                print(f"  FAILED: {e}", flush=True)
                failed += 1
                continue
            print(f"  query: {adql}")
            path.write_text(text, encoding="utf-8")
        rows = list(csv.DictReader(io.StringIO(text)))
        mags = sorted(((fnum(r["phot_g_mean_mag"]), r) for r in rows
                       if fnum(r["phot_g_mean_mag"]) is not None), key=lambda mr: mr[0])
        with_pm = sum(1 for r in rows if fnum(r["pmra"]) is not None)
        print(f"  service={service} rows={len(rows)} with_proper_motion={with_pm} "
              f"G<15: {sum(1 for m, _ in mags if m < 15)} G<17: {sum(1 for m, _ in mags if m < 17)} "
              f"ref_epoch={sorted({r['ref_epoch'] for r in rows})}")
        for m, r in mags[:6]:
            print(f"  G={m:.2f} id={r['source_id']} ra={r['ra']} dec={r['dec']} "
                  f"pmra={r['pmra']} pmdec={r['pmdec']} plx={r['parallax']}")
        sys.stdout.flush()
    print(f"\ndone; failed targets: {failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())