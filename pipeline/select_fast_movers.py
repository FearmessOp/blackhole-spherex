"""Select 10 high proper motion stars / brown dwarfs from SIMBAD (Harvard mirror, TAP).

Selection criteria, fixed before any result was seen:
  1. total proper motion > PM_MIN mas/yr (SIMBAD basic.pmra, basic.pmdec)
  2. a parallax is listed in SIMBAD
  3. K magnitude (SIMBAD allfluxes.K) between K_BRIGHT and K_FAINT
     (assumption: not saturated and bright enough for single exposures; the K of
     the five challenge targets is printed for comparison, and saturation is
     checked after the download from the OVERFLOW flags)
  4. not one of the five challenge targets (within SAME_ARCSEC of their J2000 position)
  5. one object per system: of candidates within SAME_ARCSEC of each other the
     one with the brightest K is kept
  6. the N_PICK with the largest total proper motion
Nothing else is looked at (no check of SPHEREx coverage, crowding or companions),
so targets that turn out badly stay in the list.

Output: data/fast_movers.json (same fields as data/targets.json), data/fast_movers_candidates.csv
Usage:  .venv/Scripts/python.exe pipeline/select_fast_movers.py > logs/select_fast_movers.log 2>&1
"""
import csv
import io
import json
import math
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
TAP = "https://simbad.harvard.edu/simbad/sim-tap/sync"
PM_MIN = 1000.0
K_BRIGHT, K_FAINT = 9.0, 12.0
SAME_ARCSEC = 60.0
N_PICK = 10
QUERY_EPOCH = 2025.9  # as in resolve_targets.py: centre of the archive query

def tap(adql):
    last = None
    for attempt in range(1, 5):
        try:
            r = requests.post(TAP, data={"request": "doQuery", "lang": "adql", "format": "csv",
                                         "query": adql}, timeout=120)
            print(f"  TAP status={r.status_code} bytes={len(r.content)} attempt={attempt}", flush=True)
            if r.status_code == 200:
                return r.text
            last = r.text[:500]
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        print(f"  attempt {attempt} failed: {last}", flush=True)
        time.sleep(3 * attempt)
    raise RuntimeError(f"TAP query failed: {last}")

def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def sep_arcsec(a, b):
    dra = ((a["ra"] - b["ra"] + 180.0) % 360.0 - 180.0) * math.cos(math.radians(a["dec"]))
    return math.hypot(dra, a["dec"] - b["dec"]) * 3600.0

def merge():
    """Append the selected targets to data/targets.json (every pipeline script reads targets there)."""
    path = ROOT / "data" / "targets.json"
    targets = json.loads(path.read_text(encoding="utf-8"))
    fast = json.loads((ROOT / "data" / "fast_movers.json").read_text(encoding="utf-8"))
    have = {t["slug"] for t in targets}
    new = [t for t in fast if t["slug"] not in have]
    path.write_text(json.dumps(targets + new, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"data/targets.json: {len(targets)} targets before, {len(new)} added, {len(targets) + len(new)} now; "
          f"added: {[t['slug'] for t in new]}")
    return 0

def main():
    if "--merge" in sys.argv:
        return merge()
    print(f"criteria: pm > {PM_MIN} mas/yr; parallax listed; {K_BRIGHT} <= K <= {K_FAINT}; not a challenge "
          f"target; one per system ({SAME_ARCSEC} arcsec, brightest K); top {N_PICK} by total proper motion")
    old = json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))
    ids = ",".join("'" + t["main_id"].replace("'", "''") + "'" for t in old)
    q0 = ("SELECT b.main_id, f.J, f.H, f.K, f.G, f.V FROM basic AS b JOIN allfluxes AS f ON f.oidref = b.oid "
          f"WHERE b.main_id IN ({ids})")
    print(f"=== K of the five challenge targets\n{q0}")
    try:
        print(tap(q0).rstrip())
    except Exception as e:  # noqa: BLE001
        print(f"  FAILED (comparison only): {e}")
    q = ("SELECT b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.pm_bibcode, b.plx_value, b.plx_bibcode, "
         "b.sp_type, b.otype, f.J, f.H, f.K, f.G, f.V "
         "FROM basic AS b JOIN allfluxes AS f ON f.oidref = b.oid "
         f"WHERE b.pmra*b.pmra + b.pmdec*b.pmdec > {PM_MIN ** 2:.0f} AND b.plx_value IS NOT NULL "
         f"AND f.K >= {K_BRIGHT} AND f.K <= {K_FAINT}")
    print(f"=== candidates\n{q}")
    text = tap(q)
    rows = list(csv.DictReader(io.StringIO(text)))
    print(f"rows returned: {len(rows)}; columns: {list(rows[0].keys()) if rows else None}")
    cands = []
    for r in rows:
        c = {k: (v.strip().strip('"') if isinstance(v, str) else v) for k, v in r.items()}
        for k in ("ra", "dec", "pmra", "pmdec", "plx_value", "J", "H", "K", "G", "V"):
            c[k] = num(c[k])
        if None in (c["ra"], c["dec"], c["pmra"], c["pmdec"], c["K"]):
            continue
        c["pm"] = math.hypot(c["pmra"], c["pmdec"])
        cands.append(c)
    cands.sort(key=lambda c: -c["pm"])
    for c in cands:
        hit = [t["slug"] for t in old if sep_arcsec(c, {"ra": t["ra_deg"], "dec": t["dec_deg"]}) < SAME_ARCSEC]
        c["drop"] = f"challenge target {hit[0]}" if hit else ""
    for c in cands:
        if c["drop"]:
            continue
        near = [o for o in cands if o is not c and not o["drop"] and sep_arcsec(c, o) < SAME_ARCSEC]
        brighter = [o for o in near if o["K"] < c["K"] or (o["K"] == c["K"] and o["pm"] > c["pm"])]
        if brighter:
            c["drop"] = f"same system as {brighter[0]['main_id']} (brighter K)"
    picked = [c for c in cands if not c["drop"]][:N_PICK]
    cols = ["main_id", "ra", "dec", "pmra", "pmdec", "pm", "plx_value", "sp_type", "otype", "J", "H", "K", "G",
            "V", "pm_bibcode", "plx_bibcode", "drop"]
    with (ROOT / "data" / "fast_movers_candidates.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(cands)
    print(f"candidates with position, proper motion and K: {len(cands)}; dropped: "
          f"{sum(1 for c in cands if c['drop'])}; first 30 by proper motion:")
    for c in cands[:30]:
        mark = "PICK" if c in picked else ("drop" if c["drop"] else "    ")
        print(f"  {mark} {c['main_id']:28s} pm={c['pm']:7.1f} K={c['K']:5.2f} plx={c['plx_value']} "
              f"sp={c['sp_type']} otype={c['otype']} ra={c['ra']:.5f} dec={c['dec']:+.5f} {c['drop']}")
    out, dt = [], QUERY_EPOCH - 2000.0
    for c in picked:
        slug = re.sub(r"[^a-z0-9]+", "-", re.sub(r"^(NAME|V\*|\*+)\s+", "", c["main_id"]).lower()).strip("-")
        ra = c["ra"] + c["pmra"] * dt / 3.6e6 / math.cos(math.radians(c["dec"]))
        out.append({"main_id": c["main_id"], "ra_deg": c["ra"], "dec_deg": c["dec"], "coo_bibcode": "",
                    "pmra_masyr": c["pmra"], "pmdec_masyr": c["pmdec"], "pm_bibcode": c["pm_bibcode"],
                    "plx_mas": c["plx_value"], "plx_bibcode": c["plx_bibcode"], "rv_kms": None,
                    "sp_type": c["sp_type"], "otype": c["otype"], "k_mag": c["K"], "slug": slug,
                    "name": re.sub(r"^(NAME|V\*|\*+)\s+", "", c["main_id"]), "simbad_query": c["main_id"],
                    "coord_epoch": "J2000.0 (ICRS, as returned by SIMBAD)", "query_epoch": QUERY_EPOCH,
                    "ra_query_deg": round(ra % 360.0, 7),
                    "dec_query_deg": round(c["dec"] + c["pmdec"] * dt / 3.6e6, 7),
                    "shift_arcsec": round(c["pm"] * dt / 1000.0, 2), "source": TAP, "set": "fast"})
    (ROOT / "data" / "fast_movers.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote data/fast_movers.json with {len(out)} targets: {[t['slug'] for t in out]}")
    return 0 if len(out) == N_PICK else 1

if __name__ == "__main__":
    sys.exit(main())