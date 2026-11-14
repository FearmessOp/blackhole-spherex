"""SHA-1 of every file under site/public/data, one line per file.

Run before and after a pipeline step to see which published files changed.

Usage: .venv/Scripts/python.exe pipeline/hash_site_data.py > logs/site_data_hash_before.log 2>&1
       .venv/Scripts/python.exe pipeline/hash_site_data.py logs/site_data_hash_before.log > logs/site_data_hash_diff.log 2>&1
With a previous listing as argument, only the differences are printed.
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_DATA = ROOT / "site" / "public" / "data"

def listing():
    out = {}
    for p in sorted(SITE_DATA.rglob("*")):
        if p.is_file():
            out[p.relative_to(SITE_DATA).as_posix()] = hashlib.sha1(p.read_bytes()).hexdigest()
    return out

def main():
    now = listing()
    if len(sys.argv) < 2:
        for name, h in now.items():
            print(f"{h}  {name}")
        return 0
    before = {}
    for line in Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split("  ", 1)
        if len(parts) == 2:
            before[parts[1].strip()] = parts[0].strip()
    changed = [n for n in now if n in before and now[n] != before[n]]
    added = [n for n in now if n not in before]
    removed = [n for n in before if n not in now]
    same = [n for n in now if n in before and now[n] == before[n]]
    print(f"files before={len(before)} now={len(now)} unchanged={len(same)} "
          f"changed={len(changed)} added={len(added)} removed={len(removed)}")
    for label, names in (("changed", changed), ("added", added), ("removed", removed)):
        for n in names:
            print(f"{label}: {n}")
    return 0

if __name__ == "__main__":
    sys.exit(main())