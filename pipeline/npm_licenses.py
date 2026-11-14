"""Licences of every npm package pinned in site/package-lock.json.

Reads the lock file only (no network). For each package entry: name, version,
licence field and whether it is a development-only dependency ("dev": true).
Packages without a licence field in the lock file are looked up in
site/node_modules/<path>/package.json.

Usage: .venv/Scripts/python.exe pipeline/npm_licenses.py > logs/npm_licenses.log 2>&1
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    lock = json.loads((SITE / "package-lock.json").read_text(encoding="utf-8"))
    print(f"lockfileVersion={lock.get('lockfileVersion')}")
    rows = []
    for path, p in lock["packages"].items():
        if path == "":
            continue  # the site itself
        name = path.split("node_modules/")[-1]
        lic = p.get("license")
        src = "lock file"
        if lic is None:
            pj = SITE / path / "package.json"
            if pj.exists():
                meta = json.loads(pj.read_text(encoding="utf-8"))
                lic = meta.get("license") or meta.get("licenses")
                src = "node_modules package.json"
            else:
                src = "not installed on this machine"
        rows.append({"name": name, "version": p.get("version"), "license": lic,
                     "dev": bool(p.get("dev")), "optional": bool(p.get("optional")), "src": src})
    prod = [r for r in rows if not r["dev"]]
    dev = [r for r in rows if r["dev"]]
    print(f"packages in the lock file: {len(rows)} (not dev: {len(prod)}, dev only: {len(dev)})")
    for label, sel in (("not dev (shipped in the site bundle or needed at run time)", prod),
                       ("dev only (build tools, not shipped)", dev)):
        print(f"\n== {label}: {len(sel)}")
        for lic, n in Counter(str(r["license"]) for r in sel).most_common():
            print(f"   {n:4d}  {lic}")
    print("\n== not dev, one by one")
    for r in sorted(prod, key=lambda r: r["name"]):
        print(f"   {r['name']} {r['version']}  {r['license']}  ({r['src']})")
    odd = [r for r in rows if r["license"] is None or r["src"] != "lock file"]
    print(f"\n== packages without a licence field in the lock file: {len(odd)}")
    for r in sorted(odd, key=lambda r: r["name"]):
        print(f"   {r['name']} {r['version']}  licence={r['license']}  dev={r['dev']} "
              f"optional={r['optional']}  ({r['src']})")
    return 0

if __name__ == "__main__":
    sys.exit(main())