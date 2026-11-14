"""Reference values from astropy for the browser code (block B): TAN-SIP and Range reading.

For eight full Level-2 files of the Epsilon Indi B field on the cloud copy (one per
detector from DR1, two from QR3) this writes
  - the raw IMAGE header text as read with a Range request,
  - sky -> pixel for 25 positions around the target (astropy all_world2pix),
  - pixel -> sky for 7 pixels across the detector (astropy all_pix2world),
  - the 3x3 image values at the target pixel, read with a Range request.
site/scripts/test_wcs.mjs feeds the same headers to site/src/quicklook.ts and compares.

Output: data/quicklook/wcs_reference.json
Usage:  .venv/Scripts/python.exe pipeline/wcs_reference.py > logs/wcs_reference.log 2>&1
"""
import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parent))
from range_probe import HEAD_BYTES, cloud_url, data_bytes, find_header, get_range, target_radec  # noqa: E402
from sia_query import read_rows  # noqa: E402

warnings.simplefilter("ignore")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "quicklook" / "wcs_reference.json"
SLUG = "eps-indi-b"
STEP_DEG = 30.75 / 3600.0  # 5 pixels

def pick(rows):
    """One DR1 exposure per detector, plus the first and last QR3 exposure."""
    out = []
    for det in range(1, 7):
        sel = [r for r in rows if r["obs_collection"] == "spherex_dr1"
               and r["energy_bandpassname"].endswith(f"D{det}")]
        out.append(sel[len(sel) // 2])
    qr3 = sorted((r for r in rows if r["obs_collection"] == "spherex_qr3"), key=lambda r: float(r["t_min"]))
    return out + [qr3[0], qr3[-1]]

def main():
    target = next(t for t in json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))
                  if t["slug"] == SLUG)
    rows = []
    for coll in ("spherex_dr1", "spherex_qr3"):
        text = (ROOT / "data" / "sia" / f"{SLUG}_{coll}.csv").read_text(encoding="utf-8", errors="replace")
        rows += read_rows(text)[1]
    cases = []
    for r in pick(rows):
        url, key, _ = cloud_url(r)
        buf = get_range(url, 0, HEAD_BYTES - 1).content
        h0 = find_header(buf, 0)
        off1 = h0[1] + data_bytes(h0[0])
        hdr, hlen = find_header(buf, off1)
        data_off = off1 + hlen
        w = WCS(hdr)
        ra0, dec0 = target_radec(target, float(r["t_min"]))
        world = []
        for j in range(-2, 3):
            for i in range(-2, 3):
                world.append([ra0 + i * STEP_DEG / math.cos(math.radians(dec0)), dec0 + j * STEP_DEG])
        wa = np.array(world)
        px, py = w.all_world2pix(wa[:, 0], wa[:, 1], 0)
        xt, yt = float(px[12]), float(py[12])
        pix = [[0.0, 0.0], [2039.0, 0.0], [0.0, 2039.0], [2039.0, 2039.0], [1019.5, 1019.5],
               [xt, yt], [500.25, 1500.75]]
        pa = np.array(pix)
        pra, pdec = w.all_pix2world(pa[:, 0], pa[:, 1], 0)
        ix, iy = int(round(xt)), int(round(yt))
        nx = hdr["NAXIS1"]
        raw = get_range(url, data_off + (iy - 1) * nx * 4, data_off + (iy + 2) * nx * 4 - 1).content
        box = np.frombuffer(raw, dtype=">f4").reshape(3, nx)[:, ix - 1:ix + 2].astype(float)
        cases.append({
            "key": key, "detector": int(hdr["DETECTOR"]), "collection": r["obs_collection"],
            "header": buf[off1:off1 + hlen].decode("ascii", "replace"), "data_off": data_off,
            "world": world, "world_to_pix": [[float(a), float(b)] for a, b in zip(px, py)],
            "pix": pix, "pix_to_world": [[float(a), float(b)] for a, b in zip(pra, pdec)],
            "box_ix": ix, "box_iy": iy,
            "box": [[None if not math.isfinite(v) else v for v in row] for row in box.tolist()]})
        print(f"{key}: detector={hdr['DETECTOR']} data_off={data_off} header_bytes={hlen} "
              f"target_pix=({xt:.4f}, {yt:.4f}) centre_value={box[1, 1]:.6f} "
              f"A_ORDER={hdr.get('A_ORDER')} AP_ORDER={hdr.get('AP_ORDER')} "
              f"has_PC={'PC1_1' in hdr} has_CD={'CD1_1' in hdr} CDELT=({hdr.get('CDELT1')}, {hdr.get('CDELT2')})")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"slug": SLUG, "cases": cases}), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT).as_posix()} with {len(cases)} cases, "
          f"{sum(len(c['world']) for c in cases)} sky->pixel and {sum(len(c['pix']) for c in cases)} pixel->sky points")
    return 0

if __name__ == "__main__":
    sys.exit(main())