"""One table for the fast movers: measured proper motion versus SIMBAD.

Reads, per target with "set": "fast" in data/targets.json:
  data/astrometry/<slug>_fit_wide_aligned.json  (fit_motion.py --tag wide --align wide)
  data/astrometry/<slug>_target_wide.csv        (target_astrometry.py --tag wide)
No number is typed here and nothing is fitted or tuned. A target without a fit
file stays in the table with fit = null. "within 2 errors" is the criterion of the
Validation section: |measured - SIMBAD| <= 2 x bootstrap error, per parameter.
The bootstrap error is statistical only (resampling of exposures).

Selection, the rule of the Validation section (validation_field_stars.py): at least
MIN_EXPOSURES usable exposures, in at least MIN_EPOCHS epochs of at least
MIN_PER_EPOCH exposures. "Usable" = clean core and measured by both estimators
(the rows fit_motion.py reads, before alignment and clipping). A target that does
not pass keeps its numbers in the table but is not counted as within or outside
2 errors: with a handful of exposures the bootstrap error is meaningless and the
criterion would be met by any value. This rule was added to this script after the
omi02 Eri B fit was seen (8 exposures, bootstrap errors of millions of mas).

Output: data/fast_movers.json, site/public/data/fast_movers.json
Usage:  .venv/Scripts/python.exe pipeline/fast_movers_table.py > logs/fast_movers_table.log 2>&1
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AST = ROOT / "data" / "astrometry"
PARAMS = [("pm_east", "pm_east_masyr", 0), ("pm_north", "pm_north_masyr", 1), ("plx", "plx_mas", 2)]
LABELS = {"win": "Windowed centroid", "psf": "ePSF fit"}
MIN_EXPOSURES, MIN_EPOCHS, MIN_PER_EPOCH = 30, 3, 5

def main():
    targets = [t for t in json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))
               if t.get("set") == "fast"]
    rows = []
    for t in targets:
        slug = t["slug"]
        row = {"slug": slug, "name": t["name"], "sp_type": t.get("sp_type"), "k_mag": t.get("k_mag"),
               "reference": {"pm_east": t["pmra_masyr"], "pm_north": t["pmdec_masyr"],
                             "plx": t["plx_mas"], "source": "SIMBAD", "bibcode": t.get("pm_bibcode")},
               "exposures": None, "overflow": None, "clean": None, "epochs": None,
               "usable": None, "usable_per_epoch": None, "passes_selection": False, "fit": None}
        src = AST / f"{slug}_target_wide.csv"
        if src.exists():
            rs = list(csv.DictReader(src.open(encoding="utf-8")))
            epochs = sorted({int(r["epoch"]) for r in rs})
            usable = [r for r in rs if r["clean"] == "1" and r["ra_win"] and r["ra_psf"]]
            per_epoch = [sum(1 for r in usable if int(r["epoch"]) == k) for k in epochs]
            row.update(exposures=len(rs),
                       overflow=sum(1 for r in rs if "OVERFLOW" in r["flags"].split("+")),
                       clean=sum(1 for r in rs if r["clean"] == "1"),
                       epochs=len(epochs), usable=len(usable), usable_per_epoch=per_epoch,
                       passes_selection=bool(len(usable) >= MIN_EXPOSURES and
                                             sum(1 for n in per_epoch if n >= MIN_PER_EPOCH) >= MIN_EPOCHS))
        fsrc = AST / f"{slug}_fit_wide_aligned.json"
        if fsrc.exists():
            fit = json.loads(fsrc.read_text(encoding="utf-8"))
            methods = []
            for m in ("win", "psf"):
                if m not in fit:
                    continue
                v, e = fit[m]["values"], fit[m]["bootstrap_err"]
                entry = {"id": m, "label": LABELS[m], "n_used": fit[m]["n_used"]}
                for short, key, k in PARAMS:
                    d = v[key] - fit["reference"][k]
                    # not judged (None) if the target does not pass the selection
                    ok = bool(e[key] > 0 and abs(d) <= 2.0 * e[key]) if row["passes_selection"] else None
                    entry.update({short: v[key], f"{short}_err": e[key], f"{short}_diff": round(d, 2),
                                  f"{short}_within2": ok})
                entry["pm_both_within2"] = (bool(entry["pm_east_within2"] and entry["pm_north_within2"])
                                            if row["passes_selection"] else None)
                methods.append(entry)
            row["fit"] = {"t0_year": fit["t0_year"], "aligned_to_field_stars": fit["aligned_to_field_stars"],
                          "methods": methods, "source": f"data/astrometry/{fsrc.name}",
                          "log": f"logs/fit_motion_{slug}_wide_aligned.log"}
        rows.append(row)
        print(f"{slug} ({t['name']}): exposures={row['exposures']} overflow={row['overflow']} "
              f"clean={row['clean']} epochs={row['epochs']} usable={row['usable']} "
              f"per epoch={row['usable_per_epoch']} passes_selection={row['passes_selection']} "
              f"reference pm=({t['pmra_masyr']}, {t['pmdec_masyr']}) plx={t['plx_mas']}")
        if not row["fit"]:
            print("  no fit file")
            continue
        for m in row["fit"]["methods"]:
            print(f"  {m['id']}: n_used={m['n_used']} "
                  + " ".join(f"{s}={m[s]:+.1f}+-{m[s + '_err']:.1f} (diff {m[s + '_diff']:+.1f}, "
                             f"within2={m[s + '_within2']})" for s, _, _ in PARAMS))
    summary = {}
    for m in ("win", "psf"):
        fitted = [x for r in rows if r["fit"] and r["passes_selection"]
                  for x in r["fit"]["methods"] if x["id"] == m]
        summary[m] = {"n_targets": len(rows), "n_fitted": len(fitted),
                      "n_not_passing_selection": sum(1 for r in rows if not r["passes_selection"]),
                      **{f"{s}_within2": sum(1 for x in fitted if x[f"{s}_within2"]) for s, _, _ in PARAMS},
                      "pm_both_within2": sum(1 for x in fitted if x["pm_both_within2"])}
        print(f"summary {m}: {summary[m]}")
    out = {"criterion": "|measured - SIMBAD| <= 2 x bootstrap error (statistical only)",
           "selection": {"min_exposures": MIN_EXPOSURES, "min_epochs": MIN_EPOCHS,
                         "min_per_epoch": MIN_PER_EPOCH,
                         "note": "usable = clean core and measured by both estimators; "
                                 "a target that does not pass is listed but not judged"},
           "fit": "5 parameters, aligned per exposure to Gaia field stars, as for Epsilon Indi B",
           "summary": summary, "targets": rows}
    for dst in (ROOT / "data" / "fast_movers.json", ROOT / "site" / "public" / "data" / "fast_movers.json"):
        dst.write_text(json.dumps(out, indent=1), encoding="utf-8")
        print(f"wrote {dst.relative_to(ROOT)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())