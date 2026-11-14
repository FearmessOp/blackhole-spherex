"""Resolve the five challenge test targets against the SIMBAD Harvard mirror.

No coordinates are hard-coded: every number comes from the SIMBAD response,
which is written verbatim to logs/resolve_targets.log.

Output: data/targets.json
Usage:  .venv/Scripts/python.exe pipeline/resolve_targets.py > logs/resolve_targets.log 2>&1
"""
import json
import math
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "targets.json"
SIMBAD = "https://simbad.harvard.edu/simbad/sim-script"

# slug -> (display name, SIMBAD identifier to query)
TARGETS = [
    ("barnard", "Barnard's Star", "Barnard's star"),
    ("eps-indi-b", "Epsilon Indi B", "eps Ind B"),
    ("wise-0855", "WISE 0855-0714", "WISE J085510.83-071442.5"),
    ("rw-aur", "RW Aurigae", "RW Aur"),
    ("r-dra", "R Draconis", "R Dra")]

FIELDS = ["main_id", "ra_deg", "dec_deg", "coo_bibcode", "pmra_masyr",
          "pmdec_masyr", "pm_bibcode", "plx_mas", "plx_bibcode", "rv_kms",
          "sp_type", "otype"]
FORMAT = ("%IDLIST(1)|%COO(d;A;ICRS;J2000;2000)|%COO(d;D;ICRS;J2000;2000)|%COO(B)|"
          "%PM(A)|%PM(D)|%PM(B)|%PLX(V)|%PLX(B)|%RV(V)|%SP(S)|%OTYPE(S)")

# Mid-epoch used only to centre the archive query for fast movers.
QUERY_EPOCH = 2025.9

def num(s):
    s = s.strip()
    try:
        return float(s)
    except ValueError:
        return None

def query(ident):
    script = ("output console=off script=off\n"
              f'format object "{FORMAT}"\n'
              f"query id {ident}\n")
    last = None
    for attempt in range(1, 5):
        try:
            r = requests.get(SIMBAD, params={"script": script}, timeout=60)
            r.raise_for_status()
            return r.text
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"  attempt {attempt} failed: {e!r}", flush=True)
            time.sleep(3 * attempt)
    raise RuntimeError(f"SIMBAD query failed for {ident!r}: {last!r}")

def main():
    results, failed = [], []
    for slug, name, ident in TARGETS:
        print(f"=== {slug} | query id {ident}", flush=True)
        try:
            raw = query(ident)
        except Exception as e:  # noqa: BLE001
            print(f"  FAILED: {e}", flush=True)
            failed.append(slug)
            continue
        print("--- raw response begin")
        print(raw.rstrip())
        print("--- raw response end", flush=True)
        rows = [ln for ln in raw.splitlines()
                if ln.count("|") == len(FIELDS) - 1 and "error" not in ln.lower()]
        if len(rows) != 1:
            print(f"  FAILED: expected 1 data row, got {len(rows)}", flush=True)
            failed.append(slug)
            continue
        rec = dict(zip(FIELDS, [p.strip() for p in rows[0].split("|")]))
        for k in ("ra_deg", "dec_deg", "pmra_masyr", "pmdec_masyr", "plx_mas", "rv_kms"):
            rec[k] = num(rec[k])
        if rec["ra_deg"] is None or rec["dec_deg"] is None:
            print("  FAILED: no coordinates parsed", flush=True)
            failed.append(slug)
            continue
        # Linear proper-motion propagation J2000 -> QUERY_EPOCH (query centring only).
        dt = QUERY_EPOCH - 2000.0
        pmra = rec["pmra_masyr"] or 0.0
        pmdec = rec["pmdec_masyr"] or 0.0
        dec = rec["dec_deg"] + pmdec * dt / 3.6e6
        ra = rec["ra_deg"] + pmra * dt / 3.6e6 / math.cos(math.radians(rec["dec_deg"]))
        rec.update(slug=slug, name=name, simbad_query=ident,
                   coord_epoch="J2000.0 (ICRS, as returned by SIMBAD)",
                   query_epoch=QUERY_EPOCH,
                   ra_query_deg=round(ra % 360.0, 7), dec_query_deg=round(dec, 7),
                   shift_arcsec=round(math.hypot(pmra, pmdec) * dt / 1000.0, 2),
                   source=SIMBAD)
        print("  parsed:", json.dumps(rec, ensure_ascii=False), flush=True)
        results.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {OUT} with {len(results)} targets; failed: {failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())