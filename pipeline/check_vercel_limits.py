"""Read the Vercel function limits (duration, response size) from Vercel's own pages (block B).

Nothing is assumed: the pages are fetched and the lines that mention the limits
are printed with their neighbours, so the numbers can be read in the log.

Usage: .venv/Scripts/python.exe pipeline/check_vercel_limits.py > logs/vercel_limits.log 2>&1
"""
import html
import re
import sys

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PAGES = [
    "https://vercel.com/docs/functions/limitations",
    "https://vercel.com/docs/functions/configuring-functions/duration",
    "https://vercel.com/docs/limits",
    "https://vercel.com/docs/plans/hobby"]
KEYS = re.compile(r"max(imum)? duration|payload|response (body )?size|request body|4\.5 ?MB|"
                  r"hobby|timeout|invocations|commercial", re.I)

def text_lines(body):
    body = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", body)
    body = re.sub(r"(?i)</(p|div|li|tr|td|th|h[1-6]|table|section)>|<br\s*/?>", "\n", body)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    return [re.sub(r"\s+", " ", ln).strip() for ln in body.split("\n") if ln.strip()]

def main():
    for url in PAGES:
        print(f"===== {url}")
        try:
            r = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
        except Exception as e:  # noqa: BLE001
            print(f"FAILED: {e!r}")
            continue
        lines = text_lines(r.text)
        print(f"status={r.status_code} final_url={r.url} bytes={len(r.content)} text_lines={len(lines)}")
        if r.status_code != 200:
            continue
        shown = 0
        for i, ln in enumerate(lines):
            if KEYS.search(ln) and len(ln) < 600:
                print(f"  [{i}] {ln}")
                shown += 1
                if shown >= 80:
                    print("  ... (more matching lines not shown)")
                    break
        print(f"matching lines shown: {shown}")
    return 0

if __name__ == "__main__":
    sys.exit(main())