"""Epoch-stacked frames for one target: cached cutouts -> PNG + JSON for the site.

Every exposure is resampled (bilinear) onto one fixed sky grid: TAN projection,
north up, east left, 6.15 arcsec per pixel, centred on the target position at
the mean time of all exposures. The grid does not follow the target, so a
moving target changes pixel between epochs.

Per epoch (exposures separated by more than GAP_DAYS start a new epoch) and per
band ("all" = every detector, "d1".."d6" = one detector) the frames are
median-background-subtracted and combined with a clipped mean. All epochs of a
band share one brightness scale.

Sanity check written to the log: flux-weighted centroid of the target in each
"all" stack versus the SIMBAD position propagated with proper motion only.

Usage: .venv/Scripts/python.exe pipeline/stack_epochs.py barnard > logs/stack_barnard.log 2>&1
       --tag wide reads cache/manifest/<slug>_wide.json (targets that only have the 0.2 deg cutouts)
"""
import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image
from scipy.interpolate import RegularGridInterpolator
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parent.parent
SITE_DATA = ROOT / "site" / "public" / "data"
NPIX = 29  # working grid; the output is cropped to the part every stack covers
SCALE_ARCSEC = 6.15
ON_TARGET_ARCSEC = 3.0  # a centroid further than this from the prediction is not the target
GAP_DAYS = 30.0
CLIP_SIGMA = 5.0
PNG_ZOOM = 1  # PNGs are written at native resolution; the site enlarges them unsmoothed
# Pixels with these flags are left out of the stacks. Saturation-related flags
# (OVERFLOW, SUR_ERROR, TRANSIENT, BLOOM) are kept on purpose: they cover the
# core of bright targets, masking them would punch a hole into the star.
MASK_FLAGS = ["NONFUNC", "MISSING_DATA", "HOT", "COLD", "SNOWBALL"]
BANDS = ["all", "d123", "d56", "d1", "d2", "d3", "d4", "d5", "d6"]
BAND_DETS = {"all": None, "d123": {1, 2, 3}, "d56": {5, 6},
             **{f"d{i}": {i} for i in range(1, 7)}}
BAND_LABELS = {"all": "All detectors", "d123": "Detectors 1-3 (short wavelength)",
               "d56": "Detectors 5+6 (long wavelength)",
               **{f"d{i}": f"Detector {i}" for i in range(1, 7)}}
# Raw frames with a larger masked fraction are left out of the playback. Measured
# at the earlier value of 0.5 (logs/raw_masked_fraction.log): 17 of 1950 frames
# kept in the five playbacks had more than 0.2 of the grid empty; the median
# was 0.002 to 0.03. A fully empty 3x3 core alone is 2.5% of the smallest grid
# (19x19 px), so frames that only lack a saturated core are kept.
RAW_MAX_MASKED = 0.2

warnings.simplefilter("ignore")

def select(frames, band):
    """Frames of one band."""
    dets = BAND_DETS[band]
    return frames if dets is None else [f for f in frames if f["job"]["detector"] in dets]

def year_of(mjd):
    return 2000.0 + (mjd - 51544.5) / 365.25

def target_radec(target, mjd):
    """SIMBAD J2000 position + linear proper motion (no parallax)."""
    dt = year_of(mjd) - 2000.0
    pmra = target["pmra_masyr"] or 0.0
    pmdec = target["pmdec_masyr"] or 0.0
    ra = target["ra_deg"] + pmra * dt / 3.6e6 / math.cos(math.radians(target["dec_deg"]))
    dec = target["dec_deg"] + pmdec * dt / 3.6e6
    return ra % 360.0, dec

def make_grid(ra0, dec0, npix):
    """Fixed sky grid of npix x npix: north up, east left, SCALE_ARCSEC per pixel."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra0, dec0]
    w.wcs.crpix = [(npix + 1) / 2.0, (npix + 1) / 2.0]
    w.wcs.cdelt = [-SCALE_ARCSEC / 3600.0, SCALE_ARCSEC / 3600.0]
    jj, ii = np.mgrid[0:npix, 0:npix]
    ra, dec = w.wcs_pix2world(ii, jj, 0)
    return w, ra, dec

def bad_mask_value(flag_header):
    """Bit mask of MASK_FLAGS, read from the MSKN/MSKM keywords of the file.

    Some files do not declare every plane (e.g. SNOWBALL). A plane that is not
    declared has no bit in that file, so only the declared ones are masked.
    Returns (mask value, list of MASK_FLAGS not declared in this file).
    """
    names = {}
    for key in flag_header["MSKN*"]:
        names[str(flag_header[key]).strip()] = int(flag_header["MSKM" + key[4:]])
    undeclared = [n for n in MASK_FLAGS if n not in names]
    value = 0
    for n in MASK_FLAGS:
        value |= names.get(n, 0)
    return value, undeclared

def load_frame(job, grid_ra, grid_dec):
    """Read one cutout and resample it onto the common grid.

    Returns (image on the grid, NaN where there is no valid data;
             wavelength in um at the target pixel;
             footprint: grid pixels that fall inside this cutout, whatever their flags;
             list of MASK_FLAGS planes not declared in this file).
    """
    with fits.open(ROOT / job["path"]) as hdul:
        hdr = hdul["IMAGE"].header
        img = hdul["IMAGE"].data.astype(np.float64)
        flags = hdul["FLAGS"].data
        badval, undeclared = bad_mask_value(hdul["FLAGS"].header)
        tab = hdul["WCS-WAVE"].data
        wx = np.asarray(tab["X"][0], dtype=float)
        wy = np.asarray(tab["Y"][0], dtype=float)
        wv = np.asarray(tab["VALUES"][0], dtype=float)[..., 0]
    w = WCS(hdr)  # primary WCS: TAN + SIP
    bad = ~np.isfinite(img) | ((flags & badval) != 0)
    img = img - np.nanmedian(img[~bad])
    x, y = w.all_world2pix(grid_ra, grid_dec, 0)
    coords = np.array([y, x])
    num = map_coordinates(np.where(bad, 0.0, img), coords, order=1, cval=0.0)
    den = map_coordinates((~bad).astype(np.float64), coords, order=1, cval=0.0)
    out = np.where(den > 0.5, num / np.maximum(den, 1e-9), np.nan)
    foot = map_coordinates(np.ones_like(img), coords, order=1, cval=0.0) > 0.5
    # Wavelength at the target. The lookup table is indexed by 1-based detector
    # pixel; CRPIXnW / CRVALnW map cutout pixels to detector pixels.
    tx, ty = w.all_world2pix(job["center_ra_deg"], job["center_dec_deg"], 0)
    xdet = float(tx) + 1.0 - hdr["CRPIX1W"] + hdr["CRVAL1W"]
    ydet = float(ty) + 1.0 - hdr["CRPIX2W"] + hdr["CRVAL2W"]
    interp = RegularGridInterpolator((wy, wx), wv, bounds_error=False, fill_value=None)
    wave = float(interp([[ydet, xdet]])[0])
    return out, wave, foot, undeclared

def clipped_mean(cube):
    """Clipped mean along axis 0; also returns the number of valid frames per pixel."""
    n = np.sum(np.isfinite(cube), axis=0)
    if cube.shape[0] < 3:
        return np.nanmean(cube, axis=0), n
    med = np.nanmedian(cube, axis=0)
    mad = 1.4826 * np.nanmedian(np.abs(cube - med), axis=0)
    keep = np.abs(cube - med) <= CLIP_SIGMA * np.maximum(mad, np.nanmedian(mad))
    return np.nanmean(np.where(keep, cube, np.nan), axis=0), n

def centroid(stack, x0, y0, half=3):
    """Flux-weighted centroid (grid pixels, 0-based) in a box around (x0, y0)."""
    cx, cy = float(x0), float(y0)
    for _ in range(3):
        xi, yi = int(round(cx)), int(round(cy))
        ys = slice(max(0, yi - half), min(stack.shape[0], yi + half + 1))
        xs = slice(max(0, xi - half), min(stack.shape[1], xi + half + 1))
        sub = stack[ys, xs]
        wgt = np.where(np.isfinite(sub) & (sub > 0), sub, 0.0)
        if wgt.sum() <= 0:
            return None
        jj, ii = np.mgrid[ys, xs]
        cx = float((wgt * ii).sum() / wgt.sum())
        cy = float((wgt * jj).sum() / wgt.sum())
    return cx, cy

def band_scale(stacks):
    """One asinh brightness scale for all epochs of a band."""
    vals = np.concatenate([s[np.isfinite(s)] for s in stacks])
    med = float(np.median(vals))
    sig = float(1.4826 * np.median(np.abs(vals - med)))
    soft = max(3.0 * sig, 1e-6)
    vmin = med - 2.0 * sig
    vmax = max(float(np.percentile(vals, 99.9)), vmin + 2.0 * soft)
    return {"stretch": "asinh", "vmin": vmin, "vmax": vmax, "soft": soft, "unit": "MJy/sr"}

def to_la(stack, scale):
    """Grey + alpha array, north up, east left; pixels without data are transparent."""
    v = (stack - scale["vmin"]) / scale["soft"]
    top = np.arcsinh((scale["vmax"] - scale["vmin"]) / scale["soft"])
    g = np.clip(np.arcsinh(np.clip(v, 0, None)) / top, 0, 1) * 255.0
    finite = np.isfinite(stack)
    la = np.zeros(stack.shape + (2,), dtype=np.uint8)
    la[..., 0] = np.where(finite, np.round(np.nan_to_num(g)), 0)
    la[..., 1] = np.where(finite, 255, 0)
    return np.flipud(la)  # grid row 0 is south -> flip

def write_png(stack, scale, path):
    Image.fromarray(to_la(stack, scale)).save(path)

def main():
    args = sys.argv[1:]
    tag = ""
    if "--tag" in args:  # e.g. --tag wide: the 0.2 deg cutouts; the grid and the stacking are the same
        i = args.index("--tag")
        tag = "_" + args[i + 1]
        del args[i:i + 2]
    slug = args[0] if args else "barnard"
    targets = {t["slug"]: t for t in
               json.loads((ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}
    target = targets[slug]
    jobs = json.loads((ROOT / "cache" / "manifest" / f"{slug}{tag}.json").read_text(encoding="utf-8"))
    have = [j for j in jobs if (ROOT / j["path"]).exists()]
    print(f"{slug}: manifest={len(jobs)} on_disk={len(have)} missing={len(jobs) - len(have)}")
    for j in jobs:
        if j not in have:
            print(f"  missing: {j['file']}")

    t_mean = float(np.mean([j["t_mid_mjd"] for j in have]))
    ra0, dec0 = target_radec(target, t_mean)
    _, grid_ra, grid_dec = make_grid(ra0, dec0, NPIX)
    print(f"working grid: {NPIX}x{NPIX} px, {SCALE_ARCSEC} arcsec/px, "
          f"centre=({ra0:.7f}, {dec0:.7f}) at MJD {t_mean:.3f}; masked flags={MASK_FLAGS}")

    frames, n_wave_out, n_undeclared = [], 0, {}
    for j in have:
        try:
            img, wave, foot, undeclared = load_frame(j, grid_ra, grid_dec)
        except Exception as e:  # noqa: BLE001
            print(f"  LOAD FAILED {j['file']}: {e!r}")
            continue
        for name in undeclared:
            n_undeclared[name] = n_undeclared.get(name, 0) + 1
        lo, hi = j["em_min_m"] * 1e6, j["em_max_m"] * 1e6
        if not lo - 0.05 <= wave <= hi + 0.05:
            n_wave_out += 1
            print(f"  wavelength outside detector range: {j['file']} wave={wave:.4f} "
                  f"range={lo:.4f}..{hi:.4f}")
        frames.append({"job": j, "img": img, "wave": wave, "foot": foot})
    print(f"frames loaded={len(frames)} of {len(have)}; "
          f"wavelength outside SIA detector range: {n_wave_out}")
    print(f"files where a masked flag plane is not declared in the header: {n_undeclared}")
    if not frames:
        print("no frames, nothing written")
        return 1

    frames.sort(key=lambda f: f["job"]["t_mid_mjd"])
    epochs = [[frames[0]]]
    for f in frames[1:]:
        if f["job"]["t_mid_mjd"] - epochs[-1][-1]["job"]["t_mid_mjd"] > GAP_DAYS:
            epochs.append([f])
        else:
            epochs[-1].append(f)

    # Crop: the cutouts are rotated differently from exposure to exposure, so the
    # edges of the working grid are only partly covered. Keep the largest centred
    # square in which every band/epoch stack has at least half of its frames.
    c = NPIX // 2
    ok = np.ones((NPIX, NPIX), dtype=bool)
    for ep in epochs:
        for b in BANDS:
            sel = select(ep, b)
            if sel:
                ok &= np.mean([f["foot"] for f in sel], axis=0) >= 0.5
    h = 0
    while h < c and ok[c - h - 1:c + h + 2, c - h - 1:c + h + 2].all():
        h += 1
    npix = 2 * h + 1
    sl = slice(c - h, c + h + 1)
    for f in frames:
        f["img"] = f["img"][sl, sl]
    grid, _, _ = make_grid(ra0, dec0, npix)
    print(f"output grid: {npix}x{npix} px, cropped from {NPIX}x{NPIX} "
          f"(every stack has at least half of its frames on every pixel)")

    out_dir = SITE_DATA / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    epoch_meta, stacks = [], {b: {} for b in BANDS}
    for k, ep in enumerate(epochs):
        for f in ep:
            f["epoch"] = k
        mjd = [f["job"]["t_mid_mjd"] for f in ep]
        mjd_mean = float(np.mean(mjd))
        for b in BANDS:
            sel = select(ep, b)
            if not sel:
                continue
            stack, n = clipped_mean(np.array([f["img"] for f in sel]))
            waves = [f["wave"] for f in sel]
            stacks[b][k] = {"stack": stack, "n_frames": len(sel),
                            "wave_min_um": round(min(waves), 4),
                            "wave_max_um": round(max(waves), 4),
                            "min_coverage": int(n.min())}
        # Sanity check: measured centroid versus proper-motion-only prediction.
        pra, pdec = target_radec(target, mjd_mean)
        px, py = (float(v) for v in grid.wcs_world2pix(pra, pdec, 0))
        meas = centroid(stacks["all"][k]["stack"], px, py)
        em = {"index": k, "t_start": Time(min(mjd), format="mjd").isot[:16],
              "t_end": Time(max(mjd), format="mjd").isot[:16],
              "mjd_mean": round(mjd_mean, 3), "year_mean": round(year_of(mjd_mean), 4),
              "n_exposures": len(ep),
              "predicted": {"ra_deg": round(pra, 7), "dec_deg": round(pdec, 7),
                            "x": round(px, 3), "y": round(npix - 1 - py, 3),
                            "model": "SIMBAD J2000 position + proper motion, no parallax"},
              "on_target": False}
        if meas:
            mra, mdec = (float(v) for v in grid.wcs_pix2world(meas[0], meas[1], 0))
            dx = (meas[0] - px) * SCALE_ARCSEC
            dy = (meas[1] - py) * SCALE_ARCSEC
            # A centroid far from the prediction belongs to another source, not the target.
            em["on_target"] = math.hypot(dx, dy) <= ON_TARGET_ARCSEC
            key = "measured" if em["on_target"] else "off_target_centroid"
            em[key] = {"ra_deg": round(mra, 7), "dec_deg": round(mdec, 7),
                       "x": round(meas[0], 3), "y": round(npix - 1 - meas[1], 3),
                       "method": "flux-weighted centroid, 7x7 px box, 'all' stack"}
            em["offset_arcsec"] = {"east": round(-dx, 2), "north": round(dy, 2),
                                   "total": round(math.hypot(dx, dy), 2)}
        epoch_meta.append(em)
        print(f"epoch {k}: {em['t_start']} .. {em['t_end']} n={len(ep)} "
              f"predicted_px=({px:.2f}, {py:.2f}) "
              f"measured_px={None if not meas else (round(meas[0], 2), round(meas[1], 2))} "
              f"offset_arcsec={em.get('offset_arcsec')} on_target={em['on_target']}")

    if len(epoch_meta) > 1 and all("measured" in e for e in (epoch_meta[0], epoch_meta[-1])):
        a, b = epoch_meta[0], epoch_meta[-1]
        for key in ("measured", "predicted"):
            de = -(b[key]["x"] - a[key]["x"]) * SCALE_ARCSEC
            dn = -(b[key]["y"] - a[key]["y"]) * SCALE_ARCSEC
            print(f"shift epoch 0 -> {b['index']} ({key}): east={de:.2f} north={dn:.2f} "
                  f"total={math.hypot(de, dn):.2f} arcsec")

    band_meta = []
    for b in BANDS:
        if not stacks[b]:
            continue
        scale = band_scale([s["stack"] for s in stacks[b].values()])
        frames_meta = []
        for k, s in sorted(stacks[b].items()):
            name = f"{b}_e{k}.png"
            write_png(s["stack"], scale, out_dir / name)
            frames_meta.append({"epoch": k, "png": name, "n_frames": s["n_frames"],
                                "wave_min_um": s["wave_min_um"], "wave_max_um": s["wave_max_um"],
                                "min_coverage": s["min_coverage"]})
            print(f"band {b} epoch {k}: n={s['n_frames']} wave={s['wave_min_um']}.."
                  f"{s['wave_max_um']} um min_coverage={s['min_coverage']} -> {name}")
        dets = None if BAND_DETS[b] is None else sorted(BAND_DETS[b])
        band_meta.append({"id": b, "label": BAND_LABELS[b], "dets": dets, "scale": scale,
                          "frames": frames_meta})
        print(f"band {b} scale: vmin={scale['vmin']:.4g} vmax={scale['vmax']:.4g} "
              f"soft={scale['soft']:.4g} MJy/sr")

    # Raw playback: single exposures on the same cropped grid, in time order,
    # packed into one sprite sheet. All raw frames of a target share one scale.
    # Exposures with a large masked part are left out (they stay in the stacks).
    n_all = len(frames)
    raw_sel = [f for f in frames if np.mean(~np.isfinite(f["img"])) <= RAW_MAX_MASKED]
    n_dropped = n_all - len(raw_sel)
    print(f"raw playback: dropped {n_dropped} of {n_all} exposures with more than "
          f"{RAW_MAX_MASKED:.0%} of the pixels masked")
    raw_scale = band_scale([f["img"] for f in raw_sel])
    sheet_cols = 24
    sheet_rows = math.ceil(len(raw_sel) / sheet_cols)
    sheet = np.zeros((sheet_rows * npix, sheet_cols * npix, 2), dtype=np.uint8)
    raw_frames = []
    for i, f in enumerate(raw_sel):
        r, q = divmod(i, sheet_cols)
        sheet[r * npix:(r + 1) * npix, q * npix:(q + 1) * npix] = to_la(f["img"], raw_scale)
        raw_frames.append({"t": Time(f["job"]["t_mid_mjd"], format="mjd").isot[:16],
                           "epoch": f["epoch"], "det": f["job"]["detector"],
                           "wave_um": round(f["wave"], 3),
                           "release": f["job"]["collection"].replace("spherex_", "")})
    Image.fromarray(sheet).save(out_dir / "raw.png")
    (out_dir / "raw.json").write_text(json.dumps(
        {"sheet": "raw.png", "cols": sheet_cols, "npix": npix, "scale": raw_scale,
         "n_total": n_all, "n_dropped": n_dropped, "max_masked_fraction": RAW_MAX_MASKED,
         "frames": raw_frames}), encoding="utf-8")
    print(f"raw playback: {len(raw_frames)} exposures -> raw.png "
          f"({sheet.shape[1]}x{sheet.shape[0]} px, {sheet_cols} per row), raw.json; "
          f"scale vmin={raw_scale['vmin']:.4g} vmax={raw_scale['vmax']:.4g} "
          f"soft={raw_scale['soft']:.4g} MJy/sr")

    meta = {"slug": slug, "name": target["name"], "simbad_id": target["main_id"],
            "grid": {"npix": npix, "scale_arcsec": SCALE_ARCSEC, "orientation": "north up, east left",
                     "center_ra_deg": round(ra0, 7), "center_dec_deg": round(dec0, 7)},
            "reference": {"source": "SIMBAD (Harvard mirror)", "pmra_masyr": target["pmra_masyr"],
                          "pmdec_masyr": target["pmdec_masyr"], "plx_mas": target["plx_mas"],
                          "pm_bibcode": target["pm_bibcode"]},
            "n_exposures": len(frames), "n_missing": len(jobs) - len(frames),
            "masked_flags": MASK_FLAGS, "epochs": epoch_meta, "bands": band_meta,
            "raw": "raw.json"}
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    index_path = SITE_DATA / "index.json"
    index = (json.loads(index_path.read_text(encoding="utf-8"))
             if index_path.exists() else {"targets": []})
    index["targets"] = [t for t in index["targets"] if t["slug"] != slug]
    index["targets"].append({"slug": slug, "name": target["name"]})
    index_path.write_text(json.dumps(index, indent=1), encoding="utf-8")
    print(f"wrote {out_dir / 'meta.json'} and {index_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())