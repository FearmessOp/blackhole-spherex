"""Re-measure what is needed to read SPHEREx images straight from the full files (block B).

Nothing is taken on trust from earlier notes; every number is measured here:
 1. layer sizes inside cached cutout files (how much is EPSF, how much is the image)
 2. HDU map of full Level-2 files on the cloud copy, read with HTTP Range requests
 3. CORS answers of the cloud copy (GET with Origin + Range, OPTIONS preflight)
 4. IRSA SIA query: time, size, CORS headers
 5. header + 29 image rows around the target for 24 exposures: time, bytes, failures
 6. the pixels read with Range against the pixels of the cached cutout (same exposure)

Usage: .venv/Scripts/python.exe pipeline/range_probe.py > logs/range_probe.log 2>&1
"""
import json
import math
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sia_query import read_rows  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
warnings.simplefilter("ignore")

ROOT = Path(__file__).resolve().parent.parent
S3 = "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/"
IBE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"
SIA = "https://irsa.ipac.caltech.edu/SIA"
ORIGIN = "https://blackhole-spherex.vercel.app"
SLUG = "eps-indi-b"
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
HALF = 14  # rows on each side of the target row -> 29 rows
HEAD_BYTES = 16 * 2880  # first request: primary header + IMAGE header
GAP_DAYS = 30.0
PER_EPOCH = 6

def pad(n):
    return (n + 2879) // 2880 * 2880

def find_header(buf, start):
    """Parse the FITS header that begins at buf[start]. Returns (Header, padded length) or None."""
    i = start
    while i + 80 <= len(buf):
        if buf[i:i + 80].rstrip() == b"END":
            return fits.Header.fromstring(buf[start:i + 80].decode("ascii", "replace")), pad(i + 80 - start)
        i += 80
    return None

def data_bytes(h):
    if h.get("NAXIS", 0) == 0:
        return 0
    n = 1
    for k in range(1, h["NAXIS"] + 1):
        n *= h[f"NAXIS{k}"]
    return pad(abs(h["BITPIX"]) // 8 * h.get("GCOUNT", 1) * (h.get("PCOUNT", 0) + n))

def get_range(url, a, b, session=None, extra=None):
    headers = {"Range": f"bytes={a}-{b}"}
    headers.update(extra or {})
    r = (session or requests).get(url, headers=headers, timeout=60)
    if r.status_code != 206:
        raise RuntimeError(f"status {r.status_code} for bytes={a}-{b}")
    return r

def cloud_url(row):
    """Cloud URL from the SIA row: cloud_access key, checked against the access_url path."""
    from_url = row["access_url"].replace(IBE, "")
    key = None
    try:
        key = json.loads(row["cloud_access"])["aws"]["key"]
    except Exception:  # noqa: BLE001
        pass
    return S3 + (key or from_url), key, from_url

def target_radec(t, mjd):
    dt = (mjd - 51544.5) / 365.25
    ra = t["ra_deg"] + (t["pmra_masyr"] or 0) * dt / 3.6e6 / math.cos(math.radians(t["dec_deg"]))
    return ra % 360.0, t["dec_deg"] + (t["pmdec_masyr"] or 0) * dt / 3.6e6

def read_exposure(url, ra, dec, session=None):
    """Primary + IMAGE header, then 2*HALF+1 full rows around the target."""
    nreq, nbytes = 1, 0
    buf = get_range(url, 0, HEAD_BYTES - 1, session).content
    nbytes += len(buf)
    h0 = find_header(buf, 0)
    off1 = h0[1] + data_bytes(h0[0])
    h1 = find_header(buf, off1)
    while h1 is None:  # IMAGE header longer than the first request
        more = get_range(url, len(buf), len(buf) + HEAD_BYTES - 1, session).content
        buf += more
        nbytes += len(more)
        nreq += 1
        h1 = find_header(buf, off1)
    hdr = h1[0]
    data_off = off1 + h1[1]
    nx, ny = hdr["NAXIS1"], hdr["NAXIS2"]
    x, y = (float(v) for v in WCS(hdr).all_world2pix(ra, dec, 0))
    ix, iy = int(round(x)), int(round(y))
    res = {"nreq": nreq, "bytes": nbytes, "x": x, "y": y, "nx": nx, "ny": ny,
           "bitpix": hdr["BITPIX"], "data_off": data_off, "hdr": hdr, "sub": None}
    if not (0 <= ix < nx and 0 <= iy < ny):
        return res
    y0, y1 = max(0, iy - HALF), min(ny - 1, iy + HALF)
    r = get_range(url, data_off + y0 * nx * 4, data_off + (y1 + 1) * nx * 4 - 1, session)
    res["nreq"] += 1
    res["bytes"] += len(r.content)
    rows = np.frombuffer(r.content, dtype=">f4").reshape(y1 - y0 + 1, nx)
    res.update(rows=rows, y0=y0, ix=ix, iy=iy)
    return res

def part1_cutout_layers():
    print("=== 1. layer sizes in cached cutout files")
    files = sorted((ROOT / "cache" / "cutouts" / SLUG).glob("*/*.fits"))
    print(f"cached narrow cutouts of {SLUG}: {len(files)}")
    for p in (files[0], files[len(files) // 2], files[-1]):
        size = p.stat().st_size
        print(f"{p.relative_to(ROOT).as_posix()} bytes={size}")
        with fits.open(p) as hdul:
            for h in hdul:
                fi = h.fileinfo()
                span = fi["datSpan"]
                print(f"  {h.name:9s} header={fi['datLoc'] - fi['hdrLoc']:6d} data={span:8d} "
                      f"({100.0 * span / size:5.1f}% of file) shape={getattr(h.data, 'shape', None)}")

def part2_hdu_map(rows):
    print("\n=== 2. HDU map of full files on the cloud copy (Range requests)")
    for coll in COLLECTIONS:
        row = next(r for r in rows if r["obs_collection"] == coll)
        url, key, from_url = cloud_url(row)
        print(f"{coll}: {url}")
        print(f"  cloud_access key equals access_url path: {key == from_url} (key parsed: {key is not None})")
        t0 = time.time()
        r = requests.head(url, timeout=60)
        print(f"  HEAD status={r.status_code} content-length={r.headers.get('content-length')} "
              f"accept-ranges={r.headers.get('accept-ranges')} content-type={r.headers.get('content-type')} "
              f"({time.time() - t0:.2f}s)")
        total = int(r.headers.get("content-length", 0))
        off, k, nreq, nbytes = 0, 0, 0, 0
        while off < total:
            buf = b""
            h = None
            while h is None:
                part = get_range(url, off + len(buf), min(total, off + len(buf) + HEAD_BYTES) - 1).content
                buf += part
                nreq += 1
                nbytes += len(part)
                h = find_header(buf, 0)
            hdr, hlen = h
            dlen = data_bytes(hdr)
            shape = [hdr.get(f"NAXIS{i}") for i in range(1, hdr.get("NAXIS", 0) + 1)]
            print(f"  HDU {k}: EXTNAME={hdr.get('EXTNAME', 'PRIMARY')!s:9s} XTENSION={hdr.get('XTENSION')!s:9s} "
                  f"BITPIX={hdr['BITPIX']:4d} NAXISn={shape} PCOUNT={hdr.get('PCOUNT')} "
                  f"ZIMAGE={hdr.get('ZIMAGE')} ZCMPTYPE={hdr.get('ZCMPTYPE')} ZBITPIX={hdr.get('ZBITPIX')} "
                  f"ZNAXISn={[hdr.get('ZNAXIS1'), hdr.get('ZNAXIS2')]} ZTILEn={[hdr.get('ZTILE1'), hdr.get('ZTILE2')]} "
                  f"header_off={off} header_bytes={hlen} data_off={off + hlen} data_bytes={dlen} "
                  f"({100.0 * dlen / total:.1f}% of file)")
            off += hlen + dlen
            k += 1
        print(f"  walked {k} HDUs with {nreq} requests, {nbytes} bytes; end offset {off} file size {total}")

def part3_cors(rows):
    print("\n=== 3. CORS on the cloud copy")
    url = cloud_url(rows[0])[0]
    show = ("access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers",
            "access-control-expose-headers", "access-control-max-age", "vary", "content-range",
            "accept-ranges", "content-length")
    r = requests.get(url, headers={"Origin": ORIGIN, "Range": "bytes=0-2879"}, timeout=60)
    print(f"GET  Origin + Range: status={r.status_code} " + json.dumps({k: r.headers.get(k) for k in show}))
    r = requests.get(url, headers={"Range": "bytes=0-2879"}, timeout=60)
    print(f"GET  Range, no Origin: status={r.status_code} " + json.dumps({k: r.headers.get(k) for k in show}))
    r = requests.options(url, headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET",
                                       "Access-Control-Request-Headers": "range"}, timeout=60)
    print(f"OPTIONS preflight (GET, range): status={r.status_code} "
          + json.dumps({k: r.headers.get(k) for k in show}) + f" body={r.text[:200]!r}")

def part4_sia(t):
    print("\n=== 4. IRSA SIA query")
    show = ("access-control-allow-origin", "content-type", "content-encoding", "content-length")
    for coll in COLLECTIONS:
        params = {"COLLECTION": coll, "POS": f"circle {t['ra_query_deg']} {t['dec_query_deg']} 0.01",
                  "RESPONSEFORMAT": "CSV"}
        t0 = time.time()
        r = requests.get(SIA, params=params, headers={"Origin": ORIGIN}, timeout=180)
        dt = time.time() - t0
        _, rows = read_rows(r.text)
        print(f"{coll}: status={r.status_code} time={dt:.2f}s bytes={len(r.content)} rows={len(rows)} "
              + json.dumps({k: r.headers.get(k) for k in show}))

def part5_exposures(rows, t):
    print(f"\n=== 5. header + {2 * HALF + 1} rows around the target, {PER_EPOCH} exposures per epoch")
    rows = sorted(rows, key=lambda r: float(r["t_min"]))
    epochs = [[rows[0]]]
    for r in rows[1:]:
        if float(r["t_min"]) - float(epochs[-1][-1]["t_min"]) > GAP_DAYS:
            epochs.append([r])
        else:
            epochs[-1].append(r)
    picks = []
    for ep in epochs:
        idx = sorted({int(round(i)) for i in np.linspace(0, len(ep) - 1, PER_EPOCH)})
        picks += [ep[i] for i in idx]
    print(f"epochs: {[len(e) for e in epochs]}; exposures picked: {len(picks)}")
    jobs = []
    for r in picks:
        ra, dec = target_radec(t, float(r["t_min"]))
        jobs.append((cloud_url(r)[0], ra, dec, r))

    def run(job, session=None):
        try:
            return read_exposure(job[0], job[1], job[2], session), None
        except Exception as e:  # noqa: BLE001
            return None, repr(e)

    t0 = time.time()
    with requests.Session() as s:
        seq = [run(j, s) for j in jobs]
    dt_seq = time.time() - t0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as ex:
        par = list(ex.map(run, jobs))
    dt_par = time.time() - t0
    for label, res, dt in (("sequential, one session", seq, dt_seq), ("8 parallel, no session", par, dt_par)):
        ok = [r for r, e in res if r is not None]
        errs = [e for r, e in res if r is None]
        print(f"{label}: time={dt:.2f}s ok={len(ok)} failed={len(errs)} "
              f"requests={sum(r['nreq'] for r in ok)} bytes={sum(r['bytes'] for r in ok)} "
              f"off_image={sum(1 for r in ok if 'rows' not in r)}")
        for e in errs:
            print(f"  error: {e}")
    for (res, err), job in zip(seq, jobs):
        if res is None:
            continue
        r = job[3]
        print(f"  {r['obs_collection']} {r['energy_bandpassname']} t_min={float(r['t_min']):.3f} "
              f"x={res['x']:.2f} y={res['y']:.2f} nx={res['nx']} ny={res['ny']} bitpix={res['bitpix']} "
              f"data_off={res['data_off']} requests={res['nreq']} bytes={res['bytes']}")
    return seq, jobs

def part6_compare(seq, jobs):
    print("\n=== 6. pixels read with Range against the cached cutout of the same exposure")
    done = 0
    for (res, _), job in zip(seq, jobs):
        if res is None or "rows" not in res:
            continue
        r = job[3]
        local = ROOT / "cache" / "cutouts" / SLUG / r["obs_collection"] / r["access_url"].rsplit("/", 1)[1]
        if not local.exists():
            print(f"  no cached cutout for {local.name}")
            continue
        with fits.open(local) as hdul:
            ch = hdul["IMAGE"].header
            cut = hdul["IMAGE"].data
        xc, yc = (float(v) for v in WCS(ch).all_world2pix(job[1], job[2], 0))
        ixc, iyc = int(round(xc)), int(round(yc))
        ix, iy, y0 = res["ix"], res["iy"], res["y0"]
        a = res["rows"][iy - 5 - y0:iy + 6 - y0, ix - 5:ix + 6].astype(np.float64)
        b = cut[iyc - 5:iyc + 6, ixc - 5:ixc + 6].astype(np.float64)
        same_shape = a.shape == b.shape == (11, 11)
        if same_shape:
            both = np.isfinite(a) & np.isfinite(b)
            diff = float(np.max(np.abs(a[both] - b[both]))) if both.any() else float("nan")
            nan_same = bool(np.array_equal(np.isfinite(a), np.isfinite(b)))
        else:
            diff, nan_same = float("nan"), False
        print(f"  {local.name}: full x,y=({res['x']:.3f}, {res['y']:.3f}) cutout x,y=({xc:.3f}, {yc:.3f}) "
              f"offset=({res['x'] - xc:.4f}, {res['y'] - yc:.4f}) 11x11 box: shapes_ok={same_shape} "
              f"max_abs_diff={diff:.3g} MJy/sr finite_pattern_equal={nan_same} "
              f"centre_value full={a[5, 5] if same_shape else None} cutout={b[5, 5] if same_shape else None}")
        done += 1
        if done == 6:
            break
    print(f"compared {done} exposures")

def main():
    t_start = time.time()
    targets = {t["slug"]: t for t in json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}
    t = targets[SLUG]
    rows = []
    for coll in COLLECTIONS:
        text = (ROOT / "data" / "sia" / f"{SLUG}_{coll}.csv").read_text(encoding="utf-8", errors="replace")
        rows += read_rows(text)[1]
    print(f"{SLUG}: {len(rows)} SIA rows from data/sia/")
    part1_cutout_layers()
    part2_hdu_map(rows)
    part3_cors(rows)
    part4_sia(t)
    seq, jobs = part5_exposures(rows, t)
    part6_compare(seq, jobs)
    print(f"\ntotal time {time.time() - t_start:.1f}s")
    return 0

if __name__ == "__main__":
    sys.exit(main())