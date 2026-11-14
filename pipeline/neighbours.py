"""Gaia DR3 sources near the target, per epoch: what else is inside the crosshair area?

For every epoch of the site's meta.json, Gaia sources of data/gaia/<slug>_wide.csv
are moved to the epoch's mean date (proper motion + parallax) and listed when
they lie within RADIUS arcsec of the target's catalogue position of that epoch.
Offsets are source minus target, in arcsec and in display pixels (x right =
west, y down = south, as drawn on the site).

Output: data/astrometry/<slug>_neighbours.json
Usage:  .venv/Scripts/python.exe pipeline/neighbours.py wise-0855 [radius_arcsec] > logs/neighbours_wise-0855.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import astrom

ROOT = Path(__file__).resolve().parent.parent
SCALE = 6.15

def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None

def main():
    slug = sys.argv[1]
    radius = float(sys.argv[2]) if len(sys.argv) > 2 else 45.0
    meta = json.loads((ROOT / "site" / "public" / "data" / slug / "meta.json").read_text(encoding="utf-8"))
    src = ROOT / "data" / "gaia" / f"{slug}_wide.csv"
    stars = list(csv.DictReader(src.open(encoding="utf-8")))
    print(f"{slug}: {len(stars)} Gaia DR3 sources in {src.name}; radius {radius} arcsec; "
          f"grid {meta['grid']['npix']} px = {meta['grid']['npix'] * SCALE:.0f} arcsec across")
    out = []
    for ep in meta["epochs"]:
        p = ep["predicted"]
        found = []
        for s in stars:
            ra0, dec0 = fnum(s["ra"]), fnum(s["dec"])
            ra, dec = astrom.propagate(ra0, dec0, fnum(s["pmra"]), fnum(s["pmdec"]),
                                       fnum(s["parallax"]), fnum(s["ref_epoch"]), ep["mjd_mean"])
            east, north = astrom.sky_offset(ra, dec, p["ra_deg"], p["dec_deg"])
            sep = math.hypot(east, north)
            if sep <= radius:
                found.append({"source_id": s["source_id"], "g": fnum(s["phot_g_mean_mag"]),
                              "rp": fnum(s["phot_rp_mean_mag"]), "has_pm": fnum(s["pmra"]) is not None,
                              "east": round(east, 2), "north": round(north, 2), "sep": round(sep, 2),
                              "dx_px": round(-east / SCALE, 2), "dy_px": round(-north / SCALE, 2),
                              "x": round(p["x"] - east / SCALE, 2),
                              "y": round(p["y"] - north / SCALE, 2)})
        found.sort(key=lambda r: r["sep"])
        out.append({"epoch": ep["index"], "mjd_mean": ep["mjd_mean"],
                    "target": {"ra_deg": p["ra_deg"], "dec_deg": p["dec_deg"], "x": p["x"], "y": p["y"]},
                    "neighbours": found})
        print(f"epoch {ep['index']} (MJD {ep['mjd_mean']}): target at display px "
              f"({p['x']}, {p['y']}); {len(found)} Gaia sources within {radius} arcsec")
        for r in found:
            print(f"  G={r['g']} RP={r['rp']} id={r['source_id']} pm={'yes' if r['has_pm'] else 'no'} "
                  f"east={r['east']:+.2f} north={r['north']:+.2f} sep={r['sep']:.2f} arcsec "
                  f"= ({r['dx_px']:+.2f}, {r['dy_px']:+.2f}) px from the target, display px ({r['x']}, {r['y']})")
    dst = ROOT / "data" / "astrometry" / f"{slug}_neighbours.json"
    dst.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {dst}")
    return 0

if __name__ == "__main__":
    sys.exit(main())