"""How much of the stack-centroid offset is parallax?

For each epoch of a target: the offset (measured centroid minus the
proper-motion-only prediction) from site/public/data/<slug>/meta.json, and the
parallax displacement expected from the SIMBAD parallax, averaged over the
exposure times of that epoch. Prints offset minus parallax.

Usage: .venv/Scripts/python.exe pipeline/parallax_check.py barnard > logs/parallax_check_barnard.log 2>&1
"""
import json
import sys
from pathlib import Path

import numpy as np

import astrom

ROOT = Path(__file__).resolve().parent.parent
GAP_DAYS = 30.0

def main():
    slug = sys.argv[1]
    t = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    meta = json.loads((ROOT / "site" / "public" / "data" / slug / "meta.json")
                      .read_text(encoding="utf-8"))
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}.json").read_text(encoding="utf-8"))
    epochs, last = [], None
    for j in jobs:
        if last is None or j["t_mid_mjd"] - last > GAP_DAYS:
            epochs.append([])
        last = j["t_mid_mjd"]
        epochs[-1].append(j)
    print(f"{slug}: parallax (SIMBAD) = {t['plx_mas']} mas; epochs in manifest={len(epochs)} "
          f"in meta.json={len(meta['epochs'])}")
    for k, (ep, em) in enumerate(zip(epochs, meta["epochs"])):
        mjd = np.array([j["t_mid_mjd"] for j in ep])
        fe, fn = astrom.parallax_factors(t["ra_deg"], t["dec_deg"], mjd)
        pe = float(np.mean(fe)) * t["plx_mas"] / 1000.0
        pn = float(np.mean(fn)) * t["plx_mas"] / 1000.0
        colls = sorted({j["collection"] for j in ep})
        line = (f"epoch {k} {em['t_start'][:10]}..{em['t_end'][:10]} n={len(ep)} {colls}: "
                f"parallax east={pe:+.3f} north={pn:+.3f} arcsec "
                f"(range east {fe.min() * t['plx_mas'] / 1000:+.3f}.."
                f"{fe.max() * t['plx_mas'] / 1000:+.3f})")
        off = em.get("offset_arcsec")
        if off and em.get("on_target"):
            line += (f"; stack offset east={off['east']:+.2f} north={off['north']:+.2f}; "
                     f"offset minus parallax east={off['east'] - pe:+.2f} "
                     f"north={off['north'] - pn:+.2f}")
        else:
            line += "; no on-target stack centroid"
        print(line)
    return 0

if __name__ == "__main__":
    sys.exit(main())