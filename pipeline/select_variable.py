"""Select one long-period variable that should not saturate in SPHEREx.

Selection criteria, fixed before any SPHEREx result of the candidates was seen:
  1. SIMBAD main object type "Mi*" (Mira variable). The amplitude criterion is the
     class itself (a Mira has a visual amplitude above 2.5 mag by definition); no
     infrared amplitude is looked at.
  2. K magnitude (SIMBAD allfluxes.K) between K_BRIGHT and K_FAINT. Reason: of the
     prepared targets, K 9.08 and 9.37 have OVERFLOW in 85 of 368 and 64 of 341
     exposures, K 10.15 to 11.93 in at most 2 exposures each
     (logs/fast_movers_table.log, K from data/targets.json).
  3. Galactic latitude |b| >= B_MIN deg (crowding).
  4. Neighbours in the 2MASS point source catalogue (VizieR II/246/out at the CfA
     mirror; the IRSA TAP copy fp_psc did not answer, logs/twomass_probe.log):
     no other source within ISOLATION arcsec that is brighter than K + DK_NEIGHBOUR,
     and no source brighter than K_GLARE within GLARE arcsec. Reason for the second
     rule: omi02 Eri B has OVERFLOW in 399 of 432 exposures next to its bright
     primary (logs/fast_movers_table.log).
  5. SPHEREx exposures (IRSA SIA2, same query as sia_query.py) in at least
     MIN_EPOCHS epochs (gap of more than 30 days starts a new epoch).
  6. Candidates are taken in order of K (brightest first); the first one that
     passes 4 and 5 is selected. At most MAX_CHECK candidates are checked.
Nothing else is looked at. If the selected star turns out badly it is reported.

Output: data/variable_candidate.json (one target, same fields as data/targets.json),
        data/variable_candidates.csv, data/sia/<slug>_<collection>.csv
Usage:  .venv/Scripts/python.exe pipeline/select_variable.py > logs/select_variable.log 2>&1
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
from astropy.coordinates import SkyCoord

import sia_query
from select_fast_movers import num, tap

ROOT = Path(__file__).resolve().parent.parent
VIZIER = "https://vizier.cfa.harvard.edu/viz-bin/asu-tsv"
K_BRIGHT, K_FAINT = 10.0, 12.0
B_MIN = 30.0
ISOLATION, DK_NEIGHBOUR = 20.0, 2.5
GLARE, K_GLARE = 150.0, 8.0
MIN_EPOCHS = 3
MAX_CHECK = 12
QUERY_EPOCH = 2025.9

def twomass(ra, dec):
    """2MASS sources within GLARE arcsec: rows with RAJ2000, DEJ2000, Jmag, Hmag, Kmag (strings)."""
    params = {"-source": "II/246/out", "-c": f"{ra:.6f} {dec:+.6f}", "-c.rs": f"{GLARE:.0f}",
              "-out": "RAJ2000,DEJ2000,Jmag,Hmag,Kmag", "-out.max": "unlimited"}
    last = None
    for attempt in range(1, 4):
        try:
            r = requests.get(VIZIER, params=params, timeout=60)
            r.raise_for_status()
            lines = [ln for ln in r.text.splitlines() if ln.strip() and not ln.startswith("#")]
            if len(lines) < 3 or not lines[0].startswith("RAJ2000"):
                raise ValueError(f"unexpected response: {r.text[:200]!r}")
            head = lines[0].split("\t")
            # lines[1] is the unit row, lines[2] the dashes
            return [dict(zip(head, ln.split("\t"))) for ln in lines[3:]]
        except Exception as e:  # noqa: BLE001
            last = repr(e)
            print(f"    2MASS attempt {attempt} failed: {last}", flush=True)
            time.sleep(4 * attempt)
    raise RuntimeError(last)

def sep_arcsec(ra, dec, ra0, dec0):
    dra = ((ra - ra0 + 180.0) % 360.0 - 180.0) * math.cos(math.radians(dec0))
    return math.hypot(dra, dec - dec0) * 3600.0

def neighbours_ok(c):
    rows = twomass(c["ra"], c["dec"])
    src = []
    for r in rows:
        ra, dec, k = num(r.get("RAJ2000")), num(r.get("DEJ2000")), num(r.get("Kmag"))
        if ra is None or dec is None or k is None:
            continue
        src.append((sep_arcsec(ra, dec, c["ra"], c["dec"]), k))
    src.sort()
    own = [s for s in src if s[0] < 3.0]
    others = [s for s in src if s[0] >= 3.0]
    close = [s for s in others if s[0] < ISOLATION and s[1] < c["K"] + DK_NEIGHBOUR]
    glare = [s for s in others if s[1] < K_GLARE]
    print(f"    2MASS: {len(src)} sources within {GLARE:.0f} arcsec; own match (within 3 arcsec): "
          f"{[(round(s, 1), k) for s, k in own]}; within {ISOLATION:.0f} arcsec and K < "
          f"{c['K'] + DK_NEIGHBOUR:.2f}: {[(round(s, 1), k) for s, k in close]}; K < {K_GLARE}: "
          f"{[(round(s, 1), k) for s, k in glare]}", flush=True)
    if not own:
        return "no 2MASS source at the SIMBAD position"
    if close:
        return f"neighbour at {close[0][0]:.1f} arcsec with K={close[0][1]}"
    if glare:
        return f"bright star at {glare[0][0]:.1f} arcsec with K={glare[0][1]}"
    return ""

def epochs_of(slug, ra, dec):
    counts, mjd = {}, []
    for coll in sia_query.COLLECTIONS:
        _, _, path, status, err = sia_query.fetch(slug, coll, ra, dec)
        if err:
            raise RuntimeError(f"SIA {coll}: {err}")
        _, rows = sia_query.read_rows(path.read_text(encoding="utf-8", errors="replace"))
        counts[coll] = len(rows)
        mjd += [float(r["t_min"]) for r in rows if r.get("t_min")]
    mjd.sort()
    per = []
    for i, t in enumerate(mjd):
        if i == 0 or t - mjd[i - 1] > sia_query.GAP_DAYS:
            per.append(0)
        per[-1] += 1
    return counts, per

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(f"criteria: SIMBAD otype 'Mi*'; {K_BRIGHT} <= K <= {K_FAINT}; |b| >= {B_MIN} deg; 2MASS: no other "
          f"source within {ISOLATION} arcsec brighter than K + {DK_NEIGHBOUR}, none brighter than K = {K_GLARE} "
          f"within {GLARE} arcsec; SPHEREx exposures in at least {MIN_EPOCHS} epochs; brightest K first, "
          f"at most {MAX_CHECK} checked")
    print(f"2MASS source: {VIZIER} (II/246/out)")
    (ROOT / "data" / "sia").mkdir(parents=True, exist_ok=True)
    q = ("SELECT b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.pm_bibcode, b.plx_value, b.plx_bibcode, "
         "b.sp_type, b.otype, f.J, f.H, f.K, f.G, f.V "
         "FROM basic AS b JOIN allfluxes AS f ON f.oidref = b.oid "
         f"WHERE b.otype = 'Mi*' AND f.K >= {K_BRIGHT} AND f.K <= {K_FAINT}")
    print(f"=== candidates\n{q}")
    rows = list(csv.DictReader(io.StringIO(tap(q))))
    print(f"rows returned: {len(rows)}; columns: {list(rows[0].keys()) if rows else None}")
    cands = []
    for r in rows:
        c = {k: (v.strip().strip('"') if isinstance(v, str) else v) for k, v in r.items()}
        for k in ("ra", "dec", "pmra", "pmdec", "plx_value", "J", "H", "K", "G", "V"):
            c[k] = num(c[k])
        if None in (c["ra"], c["dec"], c["K"]):
            continue
        cands.append(c)
    if not cands:
        print("no candidate; nothing written")
        return 1
    b = SkyCoord([c["ra"] for c in cands], [c["dec"] for c in cands], unit="deg").galactic.b.deg
    for c, bb in zip(cands, b):
        c["glat"] = round(float(bb), 2)
        c["note"] = "" if abs(bb) >= B_MIN else f"|b| < {B_MIN}"
    cands.sort(key=lambda c: c["K"])
    high = [c for c in cands if not c["note"]]
    print(f"candidates with position and K: {len(cands)}; with |b| >= {B_MIN}: {len(high)}")
    picked = None
    for n, c in enumerate(high[:MAX_CHECK], 1):
        slug = re.sub(r"[^a-z0-9]+", "-", re.sub(r"^(NAME|V\*|\*+)\s+", "", c["main_id"]).lower()).strip("-")
        print(f"  check {n}: {c['main_id']} K={c['K']} J={c['J']} G={c['G']} V={c['V']} sp={c['sp_type']} "
              f"ra={c['ra']:.5f} dec={c['dec']:+.5f} b={c['glat']:+.1f} pm=({c['pmra']}, {c['pmdec']}) "
              f"plx={c['plx_value']}", flush=True)
        try:
            why = neighbours_ok(c)
            if not why:
                counts, per = epochs_of(slug, c["ra"], c["dec"])
                print(f"    SPHEREx exposures: {counts}; per epoch (both collections together, "
                      f"duplicates not removed): {per}", flush=True)
                if len(per) < MIN_EPOCHS:
                    why = f"{len(per)} epochs"
        except Exception as e:  # noqa: BLE001
            why = f"check failed: {e}"
        c["note"] = why or "SELECTED"
        print(f"    -> {c['note']}", flush=True)
        if not why:
            picked = (c, slug)
            break
    cols = ["main_id", "ra", "dec", "glat", "pmra", "pmdec", "plx_value", "sp_type", "otype", "J", "H", "K",
            "G", "V", "note"]
    with (ROOT / "data" / "variable_candidates.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(cands)
    print(f"wrote data/variable_candidates.csv ({len(cands)} rows; note is empty for candidates not checked)")
    if not picked:
        print(f"none of the first {MAX_CHECK} candidates passed; nothing selected")
        return 1
    c, slug = picked
    dt = QUERY_EPOCH - 2000.0
    pmra, pmdec = c["pmra"] or 0.0, c["pmdec"] or 0.0
    name = re.sub(r"^(NAME|V\*|\*+)\s+", "", c["main_id"])
    out = [{"main_id": c["main_id"], "ra_deg": c["ra"], "dec_deg": c["dec"], "coo_bibcode": "",
            "pmra_masyr": c["pmra"], "pmdec_masyr": c["pmdec"], "pm_bibcode": c["pm_bibcode"],
            "plx_mas": c["plx_value"], "plx_bibcode": c["plx_bibcode"], "rv_kms": None,
            "sp_type": c["sp_type"], "otype": c["otype"], "k_mag": c["K"], "slug": slug, "name": name,
            "simbad_query": c["main_id"], "coord_epoch": "J2000.0 (ICRS, as returned by SIMBAD)",
            "query_epoch": QUERY_EPOCH,
            "ra_query_deg": round((c["ra"] + pmra * dt / 3.6e6 / math.cos(math.radians(c["dec"]))) % 360.0, 7),
            "dec_query_deg": round(c["dec"] + pmdec * dt / 3.6e6, 7),
            "shift_arcsec": round(math.hypot(pmra, pmdec) * dt / 1000.0, 2),
            "source": "https://simbad.harvard.edu/simbad/sim-tap/sync", "set": "variable"}]
    (ROOT / "data" / "variable_candidate.json").write_text(json.dumps(out, indent=2, ensure_ascii=False),
                                                           encoding="utf-8")
    print(f"wrote data/variable_candidate.json: {slug} ({name})")
    return 0

if __name__ == "__main__":
    sys.exit(main())