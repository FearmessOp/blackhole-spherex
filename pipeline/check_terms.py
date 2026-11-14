"""Fetch the terms / license pages of the data providers and tools listed in
SOURCES.md and print the lines that mention licensing or acknowledgement.
Also reads the license files of the locally installed tools.

Nothing is decided here: the log is read by a person and SOURCES.md is edited
by hand from it. A URL that does not answer is reported as it is.

Usage: .venv/Scripts/python.exe pipeline/check_terms.py > logs/check_terms.log 2>&1
"""
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import requests

KEYWORDS = re.compile(r"acknowledg|cite|citation|licen[sc]e|terms of use|data use|copyright|"
                      r"public domain|restrict|permission|credit", re.I)
MAX_MATCHES = 14
MAX_LEN = 700
MAX_FULL = 120   # text lines printed for a "full" page
CONTEXT = 4      # text lines printed after a keyword line on a "context" page

# (label, url, kind): "page" = HTML, keyword lines; "context" = keyword lines and the
# CONTEXT lines after each; "full" = every text line; "text" = license text, first lines
URLS = [
    ("IRSA data use terms", "https://irsa.ipac.caltech.edu/data_use_terms.html", "full"),
    ("IRSA acknowledgement", "https://irsa.ipac.caltech.edu/ack.html", "full"),
    ("IRSA SPHEREx mission page", "https://irsa.ipac.caltech.edu/Missions/spherex.html", "context"),
    ("SIMBAD Harvard mirror front page", "https://simbad.harvard.edu/simbad/", "context"),
    ("Gaia DR3 credit and citation instructions",
     "https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/",
     "context"),
    ("Gaia credits", "https://www.cosmos.esa.int/web/gaia-users/credits", "page"),
    ("Gaia license", "https://www.cosmos.esa.int/web/gaia-users/license", "context"),
    ("Python license", "https://docs.python.org/3/license.html", "page"),
    ("curl copyright", "https://curl.se/docs/copyright.html", "page"),
    ("uv LICENSE-MIT", "https://raw.githubusercontent.com/astral-sh/uv/main/LICENSE-MIT", "text"),
    ("uv LICENSE-APACHE", "https://raw.githubusercontent.com/astral-sh/uv/main/LICENSE-APACHE", "text"),
    ("git COPYING", "https://raw.githubusercontent.com/git/git/master/COPYING", "text"),
    ("Node.js LICENSE", "https://raw.githubusercontent.com/nodejs/node/main/LICENSE", "text"),
    ("npm LICENSE", "https://raw.githubusercontent.com/npm/cli/latest/LICENSE", "text")]

def fetch(url):
    last = None
    for _ in range(3):
        try:
            r = requests.get(url, timeout=40, headers={"User-Agent": "blackhole-spherex terms check"})
            return r.status_code, r.url, r.text
        except Exception as e:  # noqa: BLE001
            last = repr(e)
    return None, url, last

def page_lines(text):
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text)
    text = re.sub(r"(?i)<(br|/p|/li|/h\d|/div|/tr)[^>]*>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]

def first_lines(text, n=8):
    return [ln.strip() for ln in text.splitlines() if ln.strip()][:n]

def local_file(label, path, n=6):
    p = Path(path)
    if not p.exists():
        print(f"== local: {label}: {p} not found")
        return
    print(f"== local: {label}: {p}")
    for ln in first_lines(p.read_text(encoding="utf-8", errors="replace"), n):
        print(f"   | {ln[:MAX_LEN]}")

def main():
    # the log is redirected to a file; the Windows console code page cannot hold every character
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for label, url, kind in URLS:
        status, final, text = fetch(url)
        if status is None:
            print(f"== {label}: {url} -> FAILED {text}")
            continue
        print(f"== {label}: {url} -> HTTP {status}, final URL {final}, {len(text)} characters")
        if status != 200:
            continue
        if kind == "text":
            for ln in first_lines(text):
                print(f"   | {ln[:MAX_LEN]}")
            continue
        m = re.search(r"(?is)<title>(.*?)</title>", text)
        title = " ".join(m.group(1).split()) if m else None
        print(f"   title: {title}")
        lines = page_lines(text)
        if kind == "full":
            print(f"   all {len(lines)} text lines (first {MAX_FULL} shown)")
            for ln in lines[:MAX_FULL]:
                print(f"   | {ln[:MAX_LEN]}")
            continue
        idx = [i for i, ln in enumerate(lines) if KEYWORDS.search(ln) and len(ln) > 25]
        after = CONTEXT if kind == "context" else 0
        print(f"   lines with a keyword: {len(idx)} (first {MAX_MATCHES} shown; "
              f"'+' = one of the {after} lines after a keyword line)")
        shown = set()
        for i in idx[:MAX_MATCHES]:
            for k in range(i, min(len(lines), i + after + 1)):
                if k not in shown:
                    shown.add(k)
                    print(f"   {'|' if k == i else '+'} {lines[k][:MAX_LEN]}")

    print("\n== local tools")
    print(f"python: {sys.version.split()[0]} base_prefix={sys.base_prefix}")
    local_file("Python LICENSE", Path(sys.base_prefix) / "LICENSE.txt")
    for tool in ("uv", "git", "curl", "node", "npm"):
        exe = shutil.which(tool)
        print(f"{tool}: {exe}")
        if not exe:
            continue
        try:
            out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=30)
            print(f"   version: {(out.stdout or out.stderr).splitlines()[0] if (out.stdout or out.stderr) else None}")
        except Exception as e:  # noqa: BLE001
            print(f"   version: FAILED {e!r}")
        d = Path(exe).resolve().parent
        if tool == "node":
            local_file("Node.js LICENSE", d / "LICENSE", 4)
            pkg = d / "node_modules" / "npm" / "package.json"
            if pkg.exists():
                meta = json.loads(pkg.read_text(encoding="utf-8"))
                print(f"== local: npm package.json: version={meta.get('version')} license={meta.get('license')}")
            else:
                print(f"== local: npm package.json: {pkg} not found")
        if tool == "git":
            for cand in (d.parent / "LICENSE.txt", d.parent.parent / "LICENSE.txt"):
                if cand.exists():
                    local_file("Git for Windows LICENSE", cand, 6)
                    break
            else:
                print(f"== local: no LICENSE.txt found above {d}")
    return 0

if __name__ == "__main__":
    sys.exit(main())