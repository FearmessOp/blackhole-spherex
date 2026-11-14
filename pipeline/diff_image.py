"""Difference image: last epoch stack minus first epoch stack, from the numeric stacks.

For one target and one or more bands (all, d123, d56). The stacks are made from
the 0.2 deg cutouts on a grid with the same centre and pixel size as the site's
grid, so the central part is the site's field and the outer part holds field
stars for the check below.

Same detector group in both epochs: every detector of the band is stacked on its
own (clipped mean, as stack_epochs.py); only detectors with at least MIN_FRAMES
exposures in BOTH epochs are used; the difference is the mean over these
detectors of (last - first). So a detector that is missing in one epoch does not
enter, and each detector has the same weight in both epochs.

Check, written to the log:
  - noise of the difference (1.4826 MAD over the wide grid);
  - constant field stars (Gaia DR3, isolated, peak at least MIN_STAR_SNR times
    the noise of the mean stack): largest |difference| in 5x5 px at the star,
    relative to the star's own peak;
  - the target: brightest pixel of the difference in 3x3 px at its last-epoch
    position, darkest pixel in 3x3 px at its first-epoch position (catalogue
    position with proper motion and parallax), relative to its own peak.

"Distinct", fixed before any result was seen: (1) both lobes at least
LOBE_SIGMA times the noise of the difference; (2) both lobes, relative to the
target's peak, larger than the 90th percentile of the field-star residuals
relative to their peaks; (3) both lobes larger than the largest |difference|
anywhere else in the displayed field (further than EXCLUDE_PX from the two
target positions). The verdict is printed per band; nothing is tuned afterwards.

Output: site/public/data/<slug>/diff_<band>.png (zero = mid grey, linear,
        symmetric, +-vmax = largest |difference| in the displayed field),
        site/public/data/<slug>/diff.json, data/diff/<slug>.json
Usage:  .venv/Scripts/python.exe pipeline/diff_image.py eps-indi-b all,d123,d56 > logs/diff_image_eps-indi-b.log 2>&1
"""
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import astrom
import stack_epochs as se

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
NW = 81            # wide working grid, px (498 arcsec); the 0.2 deg cutouts are 117 px wide
MIN_FRAMES = 3     # per detector and epoch
MIN_STAR_SNR = 10.0
ISOLATION_ARCSEC = 25.0
ISOLATION_DMAG = 3.0
EDGE_PX = 4
EXCLUDE_PX = 2.5
LOBE_SIGMA = 5.0
LABEL = "bright = where it is now, dark = where it was"

def box(arr, x, y, half):
    xi, yi = int(round(x)), int(round(y))
    return arr[max(0, yi - half):yi + half + 1, max(0, xi - half):xi + half + 1]

def mad_sigma(a):
    v = a[np.isfinite(a)]
    return float(1.4826 * np.median(np.abs(v - np.median(v))))

def gaia_stars(slug, mjd):
    out = []
    path = ROOT / "data" / "gaia" / f"{slug}_wide.csv"
    for r in csv.DictReader(path.open(encoding="utf-8")):
        try:
            g = float(r["phot_g_mean_mag"])
            ra, dec = float(r["ra"]), float(r["dec"])
        except (TypeError, ValueError):
            continue
        f = lambda k: float(r[k]) if r[k] not in ("", None) else 0.0  # noqa: E731
        ra, dec = astrom.propagate(ra, dec, f("pmra"), f("pmdec"), f("parallax"), 2016.0, mjd)
        out.append({"id": r["source_id"], "g": g, "ra": ra, "dec": dec})
    return out

def main():
    slug = sys.argv[1]
    bands = sys.argv[2].split(",")
    t = {x["slug"]: x for x in json.loads(
        (ROOT / "data" / "targets.json").read_text(encoding="utf-8"))}[slug]
    site_dir = se.SITE_DATA / slug
    meta = json.loads((site_dir / "meta.json").read_text(encoding="utf-8"))
    npix = meta["grid"]["npix"]
    ra0, dec0 = meta["grid"]["center_ra_deg"], meta["grid"]["center_dec_deg"]
    grid, gra, gdec = se.make_grid(ra0, dec0, NW)
    jobs = sorted((j for j in json.loads((ROOT / "cache" / "manifest" / f"{slug}_wide.json")
                                         .read_text(encoding="utf-8")) if (ROOT / j["path"]).exists()),
                  key=lambda j: j["t_mid_mjd"])
    epochs = [[jobs[0]]]
    for j in jobs[1:]:
        if j["t_mid_mjd"] - epochs[-1][-1]["t_mid_mjd"] > se.GAP_DAYS:
            epochs.append([j])
        else:
            epochs[-1].append(j)
    k0, k1 = 0, len(epochs) - 1
    print(f"{slug}: wide cutouts on disk={len(jobs)} epochs={[len(e) for e in epochs]} "
          f"(site meta.json has {len(meta['epochs'])} epochs); difference = epoch {k1 + 1} minus epoch {k0 + 1}")
    print(f"grid: {NW}x{NW} px at {se.SCALE_ARCSEC} arcsec/px, centre=({ra0}, {dec0}) as the site grid; "
          f"displayed field = central {npix}x{npix} px")
    if len(epochs) != len(meta["epochs"]):
        print("epoch count differs from the site; stopping")
        return 1
    frames = {}
    for k in (k0, k1):
        frames[k] = []
        for j in epochs[k]:
            try:
                frames[k].append((j["detector"], j["t_mid_mjd"], se.load_frame(j, gra, gdec)[0]))
            except Exception as e:  # noqa: BLE001
                print(f"  LOAD FAILED {j['file']}: {e!r}")
        print(f"epoch {k + 1}: frames loaded={len(frames[k])} per detector="
              f"{ {d: sum(1 for f in frames[k] if f[0] == d) for d in range(1, 7)} }")

    c, h = NW // 2, (npix - 1) // 2
    crop = (slice(c - h, c + h + 1), slice(c - h, c + h + 1))
    jj, ii = np.mgrid[0:NW, 0:NW]
    out_bands, stats = [], {}
    for band in bands:
        want = se.BAND_DETS[band] or set(range(1, 7))
        used, d_list, m_list, s0_list, s1_list, n0, n1 = [], [], [], [], [], 0, 0
        for d in sorted(want):
            a = [f[2] for f in frames[k0] if f[0] == d]
            b = [f[2] for f in frames[k1] if f[0] == d]
            if len(a) < MIN_FRAMES or len(b) < MIN_FRAMES:
                print(f"band {band}: detector {d} left out (first epoch {len(a)}, last epoch {len(b)} frames)")
                continue
            s0, s1 = se.clipped_mean(np.array(a))[0], se.clipped_mean(np.array(b))[0]
            used.append(d)
            n0, n1 = n0 + len(a), n1 + len(b)
            d_list.append(s1 - s0)
            m_list.append(0.5 * (s0 + s1))
            s0_list.append(s0)
            s1_list.append(s1)
        if not used:
            print(f"band {band}: no detector with {MIN_FRAMES} frames in both epochs, no difference image")
            continue
        diff, mean = np.mean(d_list, axis=0), np.mean(m_list, axis=0)
        s0, s1 = np.mean(s0_list, axis=0), np.mean(s1_list, axis=0)
        noise, noise_mean = mad_sigma(diff), mad_sigma(mean)
        print(f"\n=== band {band}: detectors used={used} frames first/last={n0}/{n1} "
              f"noise of the difference={noise:.4g} MJy/sr, of the mean stack={noise_mean:.4g}")

        # target positions (catalogue, proper motion + parallax) on the grid
        pos = []
        for k in (k0, k1):
            mjd = float(np.mean([f[1] for f in frames[k] if f[0] in used]))
            ra, dec = astrom.propagate(t["ra_deg"], t["dec_deg"], t["pmra_masyr"], t["pmdec_masyr"],
                                       t["plx_mas"], 2000.0, mjd)
            pos.append(tuple(float(v) for v in grid.wcs_world2pix(ra, dec, 0)))
        (x0, y0), (x1, y1) = pos
        shift = math.hypot(x1 - x0, y1 - y0)
        bright, dark = float(np.nanmax(box(diff, x1, y1, 1))), float(np.nanmin(box(diff, x0, y0, 1)))
        peak0, peak1 = float(np.nanmax(box(s0, x0, y0, 1))), float(np.nanmax(box(s1, x1, y1, 1)))
        peak = 0.5 * (peak0 + peak1)
        print(f"target: first position px=({x0:.2f}, {y0:.2f}) last=({x1:.2f}, {y1:.2f}) shift={shift:.2f} px "
              f"({shift * se.SCALE_ARCSEC:.2f} arcsec); peak first/last={peak0:.4g}/{peak1:.4g} MJy/sr")
        print(f"target lobes: bright={bright:+.4g} ({bright / noise:.1f} noise, {bright / peak:.3f} of peak) "
              f"dark={dark:+.4g} ({-dark / noise:.1f} noise, {-dark / peak:.3f} of peak)")

        # field stars
        mjd_mid = float(np.mean([f[1] for k in (k0, k1) for f in frames[k]]))
        stars = gaia_stars(slug, mjd_mid)
        for s in stars:
            s["x"], s["y"] = (float(v) for v in grid.wcs_world2pix(s["ra"], s["dec"], 0))
        rows = []
        for s in stars:
            if not (EDGE_PX <= s["x"] < NW - EDGE_PX and EDGE_PX <= s["y"] < NW - EDGE_PX):
                continue
            if min(math.hypot(s["x"] - px, s["y"] - py) for px, py in pos) < 6:
                continue  # the target itself or a star on top of it
            near = [o for o in stars if o is not s and o["g"] < s["g"] + ISOLATION_DMAG and
                    math.hypot(o["x"] - s["x"], o["y"] - s["y"]) * se.SCALE_ARCSEC < ISOLATION_ARCSEC]
            if near:
                continue
            pk = float(np.nanmax(box(mean, s["x"], s["y"], 1)))
            if not np.isfinite(pk) or pk < MIN_STAR_SNR * noise_mean:
                continue
            sub = box(diff, s["x"], s["y"], 2)
            if not np.isfinite(sub).all():
                continue
            rows.append({"id": s["id"], "g": round(s["g"], 2), "x": round(s["x"], 2), "y": round(s["y"], 2),
                         "peak": pk, "res_max": float(sub.max()), "res_min": float(sub.min()),
                         "ratio": float(np.abs(sub).max() / pk),
                         "in_display": bool(abs(s["x"] - c) <= h and abs(s["y"] - c) <= h)})
        rows.sort(key=lambda r: r["g"])
        print(f"field stars: {len(rows)} (Gaia DR3, isolated: no source within {ISOLATION_ARCSEC} arcsec that is "
              f"less than {ISOLATION_DMAG} mag fainter; peak >= {MIN_STAR_SNR} x noise of the mean stack)")
        for r in rows:
            print(f"  G={r['g']:5.2f} id={r['id']} px=({r['x']:.1f}, {r['y']:.1f}) peak={r['peak']:.4g} "
                  f"residual max/min={r['res_max']:+.4g}/{r['res_min']:+.4g} |residual|/peak={r['ratio']:.3f} "
                  f"({max(abs(r['res_max']), abs(r['res_min'])) / noise:.1f} noise)"
                  f"{' in displayed field' if r['in_display'] else ''}")
        ratios = np.array([r["ratio"] for r in rows])
        p50, p90, rmax = ((float(np.percentile(ratios, 50)), float(np.percentile(ratios, 90)), float(ratios.max()))
                          if len(rows) else (float("nan"),) * 3)
        print(f"field-star |residual|/peak: median={p50:.3f} 90th percentile={p90:.3f} largest={rmax:.3f}")

        # displayed field
        dcrop = diff[crop]
        far = (np.hypot(ii - x0, jj - y0) > EXCLUDE_PX) & (np.hypot(ii - x1, jj - y1) > EXCLUDE_PX)
        other = float(np.nanmax(np.abs(np.where(far, diff, np.nan)[crop])))
        vmax = float(np.nanmax(np.abs(dcrop)))
        c1 = bright >= LOBE_SIGMA * noise and -dark >= LOBE_SIGMA * noise
        c2 = len(rows) > 0 and bright / peak > p90 and -dark / peak > p90
        c3 = bright > other and -dark > other
        distinct = bool(c1 and c2 and c3)
        print(f"displayed field: largest |difference|={vmax:.4g}; largest elsewhere (more than {EXCLUDE_PX} px from "
              f"both target positions)={other:.4g} ({other / noise:.1f} noise)")
        print(f"criteria: (1) both lobes >= {LOBE_SIGMA} noise: {c1}; (2) both lobes/peak > 90th percentile of "
              f"field stars: {c2}; (3) both lobes > largest elsewhere in the displayed field: {c3} "
              f"-> DISTINCT={distinct}")

        g = 127.5 + 127.5 * np.clip(dcrop / vmax, -1, 1)
        la = np.zeros(dcrop.shape + (2,), dtype=np.uint8)
        fin = np.isfinite(dcrop)
        la[..., 0] = np.where(fin, np.round(np.nan_to_num(g, nan=127.5)), 0)
        la[..., 1] = np.where(fin, 255, 0)
        name = f"diff_{band}.png"
        Image.fromarray(np.flipud(la)).save(site_dir / name)
        print(f"wrote {name}: {dcrop.shape[1]}x{dcrop.shape[0]} px, linear, zero = grey 127.5, +-{vmax:.4g} MJy/sr, "
              f"empty pixels={int((~fin).sum())}")
        out_bands.append({"id": band, "png": name, "dets_used": used, "n_first": n0, "n_last": n1,
                          "vmax": vmax, "unit": "MJy/sr", "distinct": distinct,
                          # the check above, for the sentence under the image
                          "n_stars": len(rows),
                          "star_ratio_median": None if not rows else round(p50, 3),
                          "star_ratio_p90": None if not rows else round(p90, 3),
                          "lobe_bright_ratio": round(bright / peak, 3),
                          "lobe_dark_ratio": round(-dark / peak, 3),
                          "lobe_bright_sigma": round(bright / noise, 1),
                          "lobe_dark_sigma": round(-dark / noise, 1)})
        stats[band] = {"dets_used": used, "n_first": n0, "n_last": n1, "noise": noise, "shift_px": shift,
                       "target": {"bright": bright, "dark": dark, "peak_first": peak0, "peak_last": peak1},
                       "field_stars": rows, "ratio_median": p50, "ratio_p90": p90, "ratio_max": rmax,
                       "largest_elsewhere_in_display": other, "vmax": vmax,
                       "criteria": {"sigma": bool(c1), "relative": bool(c2), "display": bool(c3)},
                       "distinct": distinct}
    (site_dir / "diff.json").write_text(json.dumps(
        {"from_epoch": k0, "to_epoch": k1, "label": LABEL, "stretch": "linear, zero = mid grey, symmetric",
         "source": f"data/diff/{slug}.json", "bands": out_bands}, indent=1), encoding="utf-8")
    dst = ROOT / "data" / "diff"
    dst.mkdir(parents=True, exist_ok=True)
    (dst / f"{slug}.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    print(f"\nwrote site/public/data/{slug}/diff.json and data/diff/{slug}.json")
    return 0

if __name__ == "__main__":
    sys.exit(main())