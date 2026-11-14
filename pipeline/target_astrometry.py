"""Per-exposure position of the target, with two estimators, plus a saturation check.

For every exposure: flags found in the 3x3 pixels at the catalogue position
(SIMBAD position + proper motion + parallax, used only as the starting point),
then a windowed centroid and an ePSF fit. Nothing is fitted to the motion here.

Output: data/astrometry/<slug>_target[_tag].csv
Usage:  .venv/Scripts/python.exe pipeline/target_astrometry.py eps-indi-b [--tag wide] > logs/target_astrometry_eps-indi-b.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

import astrom

ROOT = Path(__file__).resolve().parent.parent
GAP_DAYS = 30.0
MAX_PIX = 1.5  # a measurement further than this from the starting point is not the target

def med_mad(v):
    v = np.asarray(v, float)
    med = float(np.median(v))
    return med, float(1.4826 * np.median(np.abs(v - med)))

def main():
    args = sys.argv[1:]
    tag = ""
    if "--tag" in args:
        i = args.index("--tag")
        tag = "_" + args[i + 1]
        del args[i:i + 2]
    slug = args[0]
    t = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}{tag}.json").read_text(encoding="utf-8"))
    have = [j for j in jobs if (ROOT / j["path"]).exists()]
    print(f"{slug}{tag}: manifest={len(jobs)} on_disk={len(have)}; starting point = SIMBAD "
          f"pm=({t['pmra_masyr']}, {t['pmdec_masyr']}) mas/yr plx={t['plx_mas']} mas")
    rows, epoch, last, flag_count = [], -1, None, {}
    for j in have:
        if last is None or j["t_mid_mjd"] - last > GAP_DAYS:
            epoch += 1
        last = j["t_mid_mjd"]
        cut = astrom.open_cutout(ROOT / j["path"])
        ra, dec = astrom.propagate(t["ra_deg"], t["dec_deg"], t["pmra_masyr"], t["pmdec_masyr"],
                                   t["plx_mas"], 2000.0, cut["mjd"])
        x, y = astrom.sky_to_pix(cut, ra, dec)
        xi, yi = int(round(x)), int(round(y))
        ny, nx = cut["img"].shape
        row = {"file": j["file"], "collection": j["collection"], "epoch": epoch,
               "detector": j["detector"], "mjd": round(cut["mjd"], 5),
               "ra_start": round(ra, 7), "dec_start": round(dec, 7)}
        if not (3 <= xi < nx - 3 and 3 <= yi < ny - 3):
            row.update(flags="EDGE", clean=0)
            rows.append(row)
            continue
        fl = cut["flags"][yi - 1:yi + 2, xi - 1:xi + 2]
        names = sorted(n for n, b in cut["bits"].items() if (fl & b).any())
        for n in names:
            flag_count[n] = flag_count.get(n, 0) + 1
        bad = astrom.core_flags(cut, x, y)
        bg = astrom.local_background(cut["img"], xi, yi)
        peak = cut["img"][yi - 1:yi + 2, xi - 1:xi + 2]
        snr = float(np.nanmax((peak - bg) / np.sqrt(cut["var"][yi - 1:yi + 2, xi - 1:xi + 2])))
        row.update(flags="+".join(names), clean=int(not bad), snr_peak=round(snr, 1))
        win = astrom.win_centroid(cut, x, y)
        psf = astrom.fit_epsf(cut, x, y)
        for key, m in (("win", win), ("psf", psf)):
            if m and math.hypot(m[0] - x, m[1] - y) <= MAX_PIX:
                mra, mdec = astrom.pix_to_sky(cut, m[0], m[1])
                de, dn = astrom.sky_offset(mra, mdec, ra, dec)
                row.update({f"ra_{key}": round(mra, 7), f"dec_{key}": round(mdec, 7),
                            f"de_{key}": round(de, 3), f"dn_{key}": round(dn, 3)})
        if psf:
            row.update(err_psf_arcsec=round(6.15 * math.hypot(psf[3], psf[4]), 3))
        rows.append(row)
    fields = ["file", "collection", "epoch", "detector", "mjd", "ra_start", "dec_start", "flags",
              "clean", "snr_peak", "ra_win", "dec_win", "de_win", "dn_win", "ra_psf", "dec_psf",
              "de_psf", "dn_psf", "err_psf_arcsec"]
    out = ROOT / "data" / "astrometry" / f"{slug}_target{tag}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    n = len(rows)
    clean = [r for r in rows if r["clean"]]
    both = [r for r in clean if "de_win" in r and "de_psf" in r]
    print(f"exposures={n} -> {out}")
    print(f"flags in the central 3x3 px (exposures with the flag): "
          f"{dict(sorted(flag_count.items(), key=lambda kv: -kv[1]))}")
    print(f"saturation: OVERFLOW in {flag_count.get('OVERFLOW', 0)} of {n} exposures; "
          f"clean core (none of {astrom.CORE_BAD}, no NaN): {len(clean)} of {n}; "
          f"clean and measured by both methods: {len(both)}")
    if not both:
        return 1

    def report(title, keyf):
        print(f"--- {title}: offset from the starting point, arcsec, median (1.4826 MAD)")
        for key in sorted({keyf(r) for r in rows}):
            sel = [r for r in both if keyf(r) == key]
            tot = sum(1 for r in rows if keyf(r) == key)
            if len(sel) < 3:
                print(f"{key}: exposures={tot} usable={len(sel)}")
                continue
            parts = ["%s=%+.3f (%.3f)" % ((c,) + med_mad([r[c] for r in sel]))
                     for c in ("de_win", "dn_win", "de_psf", "dn_psf")]
            print(f"{key}: exposures={tot} usable={len(sel)} "
                  f"median_snr={np.median([r['snr_peak'] for r in sel]):.0f} " + " ".join(parts))

    report("by epoch and collection", lambda r: (r["epoch"], r["collection"]))
    report("by detector", lambda r: f"D{r['detector']}")
    d = [math.hypot(r["de_win"] - r["de_psf"], r["dn_win"] - r["dn_psf"]) for r in both]
    print(f"windowed centroid versus ePSF fit, same exposure: median separation "
          f"{np.median(d):.3f} arcsec, 90th percentile {np.percentile(d, 90):.3f}")
    return 0

if __name__ == "__main__":
    sys.exit(main())