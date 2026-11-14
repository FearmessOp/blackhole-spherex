"""Download SPHEREx Level-2 cutouts for every exposure listed in data/sia/*.csv.

- Cutout centre follows the target: the SIMBAD J2000 position is propagated
  with its proper motion to the mid-time of each exposure.
- Disk cache: cache/cutouts/<slug>/<collection>/<file>.fits (skipped if valid).
- Parallel workers, retries with backoff, FITS sanity check, free-disk guard.
- Progress goes to logs/download.log; job list to cache/manifest/<slug>.json.
- --strip-epsf: the EPSF HDU (97% of a cutout file, logs/range_probe.log) is cut
  out of the downloaded bytes if the md5 of its data equals the stored table of
  that detector (data/epsf/index.json, written by epsf_check.py). If it differs
  the file is kept whole and the log line says EPSF_KEPT. astrom.open_cutout
  reads the stored table when a file has no EPSF HDU.
- --log NAME writes to logs/NAME.log; --min-free GB sets the free-disk guard.

Usage: .venv/Scripts/python.exe pipeline/download_cutouts.py [--limit N] [--size DEG --tag TAG]
           [--strip-epsf] [--log NAME] [--min-free GB] [slug ...]
"""
import hashlib
import io
import json
import math
import os
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from astropy.io import fits

from sia_query import COLLECTIONS, read_rows

ROOT = Path(__file__).resolve().parent.parent
SIA_DIR = ROOT / "data" / "sia"
CACHE = ROOT / "cache" / "cutouts"
MANIFEST = ROOT / "cache" / "manifest"
LOG = ROOT / "logs" / "download.log"
SIZE_DEG = 0.05
TAG = ""  # "--tag wide" keeps a second set of cutouts in cache/cutouts_wide
WORKERS = 8
MAX_TRIES = 6
MIN_FREE_GB = 5.0
STRIP_EPSF = False
EPSF_MD5 = {}  # detector -> md5 of the stored EPSF table data
ORDER = ["barnard", "wise-0855", "eps-indi-b", "rw-aur", "r-dra"]

_lock = threading.Lock()
_local = threading.local()

def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    with _lock:
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

def valid_fits(path):
    try:
        size = path.stat().st_size
        if size < 2880 or size % 2880:
            return False
        with path.open("rb") as f:
            return f.read(6) == b"SIMPLE"
    except OSError:
        return False

def strip_epsf(data):
    """Bytes of the file without its EPSF HDU, and a note for the log.

    The HDU is removed only if its data bytes have the md5 of the stored table
    of the same detector; otherwise the bytes are returned unchanged.
    """
    try:
        with fits.open(io.BytesIO(data)) as hdul:
            det = int(hdul["IMAGE"].header["DETECTOR"])
            info = hdul["EPSF"].fileinfo()
            a, b, c = info["hdrLoc"], info["datLoc"], info["datLoc"] + info["datSpan"]
        md5 = hashlib.md5(data[b:c]).hexdigest()
        if md5 != EPSF_MD5.get(det):
            return data, f" EPSF_KEPT det={det} md5={md5}"
        return data[:a] + data[c:], " epsf_stripped"
    except Exception as e:  # noqa: BLE001
        return data, f" EPSF_KEPT error={e!r}"

def build_jobs(target):
    slug = target["slug"]
    pmra = target["pmra_masyr"] or 0.0
    pmdec = target["pmdec_masyr"] or 0.0
    cosd = math.cos(math.radians(target["dec_deg"]))
    jobs, seen = [], set()
    for coll in COLLECTIONS:
        csv_path = SIA_DIR / f"{slug}_{coll}.csv"
        if not csv_path.exists():
            continue
        _, rows = read_rows(csv_path.read_text(encoding="utf-8", errors="replace"))
        for r in rows:
            name = r["access_url"].rsplit("/", 1)[-1]
            if name in seen:
                continue
            seen.add(name)
            t_mid = 0.5 * (float(r["t_min"]) + float(r["t_max"]))
            year = 2000.0 + (t_mid - 51544.5) / 365.25
            dt = year - 2000.0
            ra = (target["ra_deg"] + pmra * dt / 3.6e6 / cosd) % 360.0
            dec = target["dec_deg"] + pmdec * dt / 3.6e6
            jobs.append({
                "slug": slug,
                "collection": coll,
                "obs_id": r["obs_id"],
                "detector": int(r["energy_bandpassname"].rsplit("D", 1)[-1]),
                "em_min_m": float(r["em_min"]),
                "em_max_m": float(r["em_max"]),
                "t_mid_mjd": round(t_mid, 6),
                "epoch_year": round(year, 5),
                "center_ra_deg": round(ra, 7),
                "center_dec_deg": round(dec, 7),
                "file": name,
                "path": f"cache/cutouts{TAG}/{slug}/{coll}/{name}",
                "url": f"{r['access_url']}?center={ra:.7f},{dec:.7f}&size={SIZE_DEG}"})
    jobs.sort(key=lambda j: j["t_mid_mjd"])
    return jobs

def fetch(job):
    path = ROOT / job["path"]
    if valid_fits(path):
        return job, "cached", path.stat().st_size, 0.0, None
    path.parent.mkdir(parents=True, exist_ok=True)
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
    err = None
    for attempt in range(1, MAX_TRIES + 1):
        free = shutil.disk_usage(ROOT).free / 1e9
        if free < MIN_FREE_GB:
            return job, "FAILED", 0, 0.0, f"free disk {free:.1f} GB below {MIN_FREE_GB} GB"
        t0 = time.time()
        try:
            r = _local.s.get(job["url"], timeout=(30, 300))
            data = r.content
            if r.status_code == 200 and data[:6] == b"SIMPLE" and len(data) % 2880 == 0:
                note = ""
                if STRIP_EPSF:
                    data, note = strip_epsf(data)
                tmp = path.with_name(f"{path.name}.{threading.get_ident()}.part")
                tmp.write_bytes(data)
                os.replace(tmp, path)
                return job, f"ok try {attempt}{note}", len(data), time.time() - t0, None
            err = f"http {r.status_code} bytes {len(data)} head {data[:120]!r}"
            if r.status_code in (400, 404, 422) and attempt >= 2:
                break
        except Exception as e:  # noqa: BLE001
            err = repr(e)
        log(f"RETRY {job['slug']} {job['file']} try {attempt}: {err}")
        time.sleep(min(60, 4 * 2 ** (attempt - 1)))
    return job, "FAILED", 0, 0.0, err

def main():
    global SIZE_DEG, TAG, LOG, MIN_FREE_GB, STRIP_EPSF
    args = sys.argv[1:]
    if "--strip-epsf" in args:
        args.remove("--strip-epsf")
        STRIP_EPSF = True
        index = json.loads((ROOT / "data" / "epsf" / "index.json").read_text(encoding="utf-8"))
        if not index["one_table_per_detector"]:
            raise SystemExit("data/epsf/index.json: more than one table per detector, not stripping")
        EPSF_MD5.update({int(t["detector"]): t["data_md5"] for t in index["tables"]})
    if "--min-free" in args:
        i = args.index("--min-free")
        MIN_FREE_GB = float(args[i + 1])
        del args[i:i + 2]
    log_name = None
    if "--log" in args:
        i = args.index("--log")
        log_name = args[i + 1]
        del args[i:i + 2]
    if "--size" in args:
        i = args.index("--size")
        SIZE_DEG = float(args[i + 1])
        del args[i:i + 2]
    if "--tag" in args:
        i = args.index("--tag")
        TAG = "_" + args[i + 1]
        LOG = ROOT / "logs" / f"download{TAG}.log"
        del args[i:i + 2]
    if log_name:
        LOG = ROOT / "logs" / f"{log_name}.log"
    limit = None
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1])
        del args[i:i + 2]
    targets = {t["slug"]: t for t in
               json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}
    slugs = args or [s for s in ORDER if s in targets]
    LOG.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.mkdir(parents=True, exist_ok=True)
    (ROOT / "logs" / "download.pid").write_text(str(os.getpid()))
    log(f"START pid={os.getpid()} slugs={slugs} limit={limit} workers={WORKERS} "
        f"size_deg={SIZE_DEG} strip_epsf={STRIP_EPSF} min_free_gb={MIN_FREE_GB} "
        f"free_gb={shutil.disk_usage(ROOT).free / 1e9:.1f}")
    jobs = []
    for slug in slugs:
        tj = build_jobs(targets[slug])
        (MANIFEST / f"{slug}{TAG}.json").write_text(json.dumps(tj, indent=1), encoding="utf-8")
        log(f"PLAN {slug}: {len(tj)} cutouts")
        jobs += tj[:limit] if limit else tj
    if jobs:
        log(f"FIRST URL {jobs[0]['url']}")

    t0 = time.time()
    n_ok = n_cached = n_fail = 0
    total_bytes = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(fetch, j) for j in jobs]
        for k, fut in enumerate(as_completed(futures), 1):
            job, status, size, secs, err = fut.result()
            total_bytes += size
            if status == "cached":
                n_cached += 1
            elif status == "FAILED":
                n_fail += 1
                log(f"FAIL {job['slug']} {job['file']} ({k}/{len(jobs)}): {err}")
                continue
            else:
                n_ok += 1
            log(f"{status.upper()} {job['slug']} {job['file']} bytes={size} "
                f"secs={secs:.1f} ({k}/{len(jobs)})")
    log(f"DONE ok={n_ok} cached={n_cached} failed={n_fail} total={len(jobs)} "
        f"bytes={total_bytes} elapsed_s={time.time() - t0:.0f} "
        f"free_gb={shutil.disk_usage(ROOT).free / 1e9:.1f}")
    return 1 if n_fail else 0

if __name__ == "__main__":
    sys.exit(main())