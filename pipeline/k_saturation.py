"""K magnitude (SIMBAD) next to the saturated fraction of the prepared targets, to choose the
K limit below which the quick look gives no rough motion (block 2, Ross 128).

Saturated fraction = overflow / exposures from site/public/data/<slug>/results.json
(OVERFLOW flag at the target position). Standard library only.
Usage: .venv python pipeline/k_saturation.py > logs/k_saturation.log
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "site" / "public" / "data"
# Same two servers as site/api/lookup.js, in the same order.
SIMBAD = ["https://simbad.harvard.edu/simbad/sim-script", "https://simbad.cds.unistra.fr/simbad/sim-script"]
EXTRA = ["Ross 128"]

def k_mag(name):
    script = f'output console=off script=off\nformat object "%IDLIST(1)|%FLUXLIST(K;F)"\nquery id {name}\n'
    for base in SIMBAD:
        url = base + "?script=" + urllib.parse.quote(script)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                text = r.read().decode("utf-8", "replace")
        except Exception as e:
            print(f"# {name}: {base}: {e}")
            continue
        for line in text.splitlines():
            if "|" in line and "error" not in line.lower():
                v = line.split("|")[1].strip()
                try:
                    return float(v)
                except ValueError:
                    return None
        return None
    return None

def main():
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))["targets"]
    rows = []
    for t in index:
        res = json.loads((DATA / t["slug"] / "results.json").read_text(encoding="utf-8"))
        sat = res.get("saturation") or {}
        n, o = sat.get("exposures") or 0, sat.get("overflow") or 0
        rows.append((t["name"], t["slug"], k_mag(t["name"]), o, n))
    for name in EXTRA:
        rows.append((name, "-", k_mag(name), None, None))
    rows.sort(key=lambda r: (r[2] is None, r[2] if r[2] is not None else 99))
    print("name | slug | K (SIMBAD) | overflow / exposures | fraction")
    for name, slug, k, o, n in rows:
        frac = f"{o / n:.2f}" if n else "n/a"
        ks = f"{k:.2f}" if k is not None else "n/a"
        print(f"{name} | {slug} | {ks} | {o}/{n} | {frac}")

if __name__ == "__main__":
    main()