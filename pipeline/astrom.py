"""Shared astrometry helpers: cutout reading, two position estimators, Gaia propagation.

Pixel coordinates are 0-based cutout pixels (x = column, y = row).
"""
import math
import warnings

import numpy as np
from astropy.coordinates import get_body_barycentric
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from scipy.interpolate import RectBivariateSpline
from scipy.optimize import least_squares

warnings.simplefilter("ignore")
# A position is rejected when one of these flags is set in the central 3x3 pixels.
CORE_BAD = ["OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD",
            "NONLINEAR", "SNOWBALL", "TRANSIENT"]
EPSF_OVERSAMPLE = 5  # OVSMPX / OVSMPY in the EPSF header

def year_of(mjd):
    return 2000.0 + (mjd - 51544.5) / 365.25

def open_cutout(path):
    """Image, flags, variance, WCS, flag bits and the ePSF zone table of one cutout."""
    with fits.open(path) as hdul:
        hdr = hdul["IMAGE"].header
        fh = hdul["FLAGS"].header
        bits = {str(fh[k]).strip(): int(fh["MSKM" + k[4:]]) for k in fh["MSKN*"]}
        ep = hdul["EPSF"].data
        return {"img": hdul["IMAGE"].data.astype(float),
                "flags": hdul["FLAGS"].data.copy(),
                "var": hdul["VARIANCE"].data.astype(float),
                "hdr": hdr, "wcs": WCS(hdr), "bits": bits,
                "mjd": float(hdr["MJD-AVG"]),
                "zx": np.array(ep["XCENTER"], float),
                "zy": np.array(ep["YCENTER"], float),
                "epsf": np.array(ep["EPSF"], float)}

def core_flags(cut, x, y):
    """Names of CORE_BAD flags (and NaN) found in the 3x3 pixels around (x, y)."""
    xi, yi = int(round(x)), int(round(y))
    ny, nx = cut["img"].shape
    if not (1 <= xi < nx - 1 and 1 <= yi < ny - 1):
        return ["EDGE"]
    fl = cut["flags"][yi - 1:yi + 2, xi - 1:xi + 2]
    found = [n for n in CORE_BAD if n in cut["bits"] and (fl & cut["bits"][n]).any()]
    if not np.isfinite(cut["img"][yi - 1:yi + 2, xi - 1:xi + 2]).all():
        found.append("NAN")
    return found

def local_background(img, xi, yi, r_in=4, r_out=7):
    """Median of the finite pixels in a square annulus around (xi, yi)."""
    ny, nx = img.shape
    jj, ii = np.mgrid[0:ny, 0:nx]
    d = np.maximum(np.abs(ii - xi), np.abs(jj - yi))
    vals = img[(d >= r_in) & (d <= r_out) & np.isfinite(img)]
    return float(np.median(vals)) if vals.size >= 8 else float(np.nanmedian(img))

def win_centroid(cut, x0, y0, half=3, sigma=1.5, n_iter=8):
    """Gaussian-windowed centroid (no PSF model). Returns (x, y, flux) or None."""
    img = cut["img"]
    ny, nx = img.shape
    bg = local_background(img, int(round(x0)), int(round(y0)))
    x, y = float(x0), float(y0)
    for _ in range(n_iter):
        xi, yi = int(round(x)), int(round(y))
        if not (half <= xi < nx - half and half <= yi < ny - half):
            return None
        jj, ii = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
        sub = img[yi - half:yi + half + 1, xi - half:xi + half + 1] - bg
        wgt = np.exp(-((ii - x) ** 2 + (jj - y) ** 2) / (2 * sigma ** 2))
        val = np.where(np.isfinite(sub), sub, 0.0) * wgt
        tot = val.sum()
        if tot <= 0:
            return None
        # A Gaussian window pulls the centroid towards its own centre; for a
        # Gaussian-like source the bias is removed by doubling the step.
        x, y = x + 2 * ((val * ii).sum() / tot - x), y + 2 * ((val * jj).sum() / tot - y)
    return x, y, float(np.where(np.isfinite(sub), sub, 0.0).sum())

def fit_epsf(cut, x0, y0, half=2):
    """Least-squares fit of the file's effective PSF. Returns (x, y, flux, ex, ey) or None.

    Assumes the 33x33 ePSF array is centred on its middle sample (index 16) and
    oversampled by EPSF_OVERSAMPLE, i.e. it spans +-3.2 detector pixels.
    """
    img, var, hdr = cut["img"], cut["var"], cut["hdr"]
    ny, nx = img.shape
    xi, yi = int(round(x0)), int(round(y0))
    if not (half <= xi < nx - half and half <= yi < ny - half):
        return None
    # Nearest ePSF zone; alternate WCS "A" maps cutout pixels to 0-based detector pixels.
    xdet = x0 + 1.0 - hdr["CRPIX1A"] + hdr["CRVAL1A"]
    ydet = y0 + 1.0 - hdr["CRPIX2A"] + hdr["CRVAL2A"]
    zone = int(np.argmin((cut["zx"] - xdet) ** 2 + (cut["zy"] - ydet) ** 2))
    off = (np.arange(33) - 16) / EPSF_OVERSAMPLE
    psf = RectBivariateSpline(off, off, cut["epsf"][zone], kx=3, ky=3)
    jj, ii = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
    sub = img[yi - half:yi + half + 1, xi - half:xi + half + 1]
    sig = np.sqrt(var[yi - half:yi + half + 1, xi - half:xi + half + 1])
    good = np.isfinite(sub) & np.isfinite(sig) & (sig > 0)
    if good.sum() < 12:
        return None
    bg0 = local_background(img, xi, yi)

    def resid(p):
        model = p[2] * psf.ev(jj - p[1], ii - p[0]) + p[3]
        return ((sub - model) / sig)[good]

    p0 = [x0, y0, max(float(np.nansum(sub - bg0)), 1e-6), bg0]
    try:
        fit = least_squares(resid, p0, bounds=([x0 - 2, y0 - 2, 0, -np.inf],
                                               [x0 + 2, y0 + 2, np.inf, np.inf]))
        cov = np.linalg.inv(fit.jac.T @ fit.jac)
    except Exception:  # noqa: BLE001
        return None
    chi2 = float((fit.fun ** 2).sum() / max(1, good.sum() - 4))
    ex, ey = (math.sqrt(max(cov[k, k], 0.0) * max(chi2, 1.0)) for k in (0, 1))
    return float(fit.x[0]), float(fit.x[1]), float(fit.x[2]), ex, ey

def parallax_factors(ra_deg, dec_deg, mjd):
    """Parallax factors (east, north) for unit parallax, from the Earth's barycentric position.

    The spacecraft is in low Earth orbit; its offset from the geocentre (about
    7000 km) changes the factors by less than 1e-4 and is ignored.
    """
    pos = get_body_barycentric("earth", Time(mjd, format="mjd"))
    x, y, z = (np.atleast_1d(v.to_value("au")) for v in (pos.x, pos.y, pos.z))
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    f_east = x * math.sin(ra) - y * math.cos(ra)
    f_north = (x * math.cos(ra) * math.sin(dec) + y * math.sin(ra) * math.sin(dec)
               - z * math.cos(dec))
    if np.ndim(mjd) == 0:
        return float(f_east[0]), float(f_north[0])
    return f_east, f_north

def propagate(ra_deg, dec_deg, pmra, pmdec, plx, ref_year, mjd):
    """Catalogue position (deg) moved to MJD with proper motion (mas/yr) and parallax (mas)."""
    dt = year_of(mjd) - ref_year
    fe, fn = parallax_factors(ra_deg, dec_deg, mjd)
    d_east = (pmra or 0.0) * dt + (plx or 0.0) * fe   # mas, on the sky
    d_north = (pmdec or 0.0) * dt + (plx or 0.0) * fn
    dec = dec_deg + d_north / 3.6e6
    ra = ra_deg + d_east / 3.6e6 / math.cos(math.radians(dec_deg))
    return ra % 360.0, dec

def sky_offset(ra_deg, dec_deg, ra0_deg, dec0_deg):
    """Offset of (ra, dec) from (ra0, dec0) in arcsec: (east, north). Small-angle."""
    dra = (ra_deg - ra0_deg + 180.0) % 360.0 - 180.0
    east = dra * math.cos(math.radians(dec0_deg)) * 3600.0
    north = (dec_deg - dec0_deg) * 3600.0
    return east, north

def pix_to_sky(cut, x, y):
    """Sky position (deg) of a 0-based cutout pixel through the file's TAN-SIP WCS."""
    ra, dec = cut["wcs"].all_pix2world(x, y, 0)
    return float(ra), float(dec)

def sky_to_pix(cut, ra_deg, dec_deg):
    x, y = cut["wcs"].all_world2pix(ra_deg, dec_deg, 0)
    return float(x), float(y)

def good_pixels(cut):
    """Pixels that are finite and carry none of the CORE_BAD flags."""
    bad = np.zeros(cut["img"].shape, bool)
    for n in CORE_BAD:
        if n in cut["bits"]:
            bad |= (cut["flags"] & cut["bits"][n]) != 0
    return ~bad & np.isfinite(cut["img"]) & np.isfinite(cut["var"]) & (cut["var"] > 0)

def fit_epsf_wings(cut, x0, y0, half=3, min_pix=16):
    """ePSF fit that ignores flagged (saturated) pixels: only unflagged pixels are used.

    Returns (x, y, flux, ex, ey, n_pixels_used) or None.
    """
    img, hdr = cut["img"], cut["hdr"]
    ny, nx = img.shape
    xi, yi = int(round(x0)), int(round(y0))
    if not (half <= xi < nx - half and half <= yi < ny - half):
        return None
    xdet = x0 + 1.0 - hdr["CRPIX1A"] + hdr["CRVAL1A"]
    ydet = y0 + 1.0 - hdr["CRPIX2A"] + hdr["CRVAL2A"]
    zone = int(np.argmin((cut["zx"] - xdet) ** 2 + (cut["zy"] - ydet) ** 2))
    off = (np.arange(33) - 16) / EPSF_OVERSAMPLE
    psf = RectBivariateSpline(off, off, cut["epsf"][zone], kx=3, ky=3)
    sl = (slice(yi - half, yi + half + 1), slice(xi - half, xi + half + 1))
    jj, ii = np.mgrid[sl]
    sub = img[sl]
    sig = np.sqrt(cut["var"][sl])
    good = good_pixels(cut)[sl]
    if good.sum() < min_pix:
        return None
    bg0 = local_background(img, xi, yi, r_in=6, r_out=9)

    def resid(p):
        dx, dy = ii - p[0], jj - p[1]
        # The ePSF table spans +-3.2 px; pixels outside it are not modelled.
        use = good & (np.abs(dx) <= 3.2) & (np.abs(dy) <= 3.2)
        model = p[2] * psf.ev(np.clip(dy, -3.2, 3.2), np.clip(dx, -3.2, 3.2)) + p[3]
        return np.where(use, (sub - model) / np.where(good, sig, 1.0), 0.0).ravel()

    flux0 = max(float(np.sum(np.where(good, sub - bg0, 0.0))), 1e-6)
    try:
        fit = least_squares(resid, [x0, y0, flux0, bg0],
                            bounds=([x0 - 1.5, y0 - 1.5, 0, -np.inf],
                                    [x0 + 1.5, y0 + 1.5, np.inf, np.inf]))
        cov = np.linalg.inv(fit.jac.T @ fit.jac)
    except Exception:  # noqa: BLE001
        return None
    chi2 = float((fit.fun ** 2).sum() / max(1, int(good.sum()) - 4))
    ex, ey = (math.sqrt(max(cov[k, k], 0.0) * max(chi2, 1.0)) for k in (0, 1))
    return float(fit.x[0]), float(fit.x[1]), float(fit.x[2]), ex, ey, int(good.sum())

def sym_centroid(cut, x0, y0, half=4, n_iter=6):
    """Centroid from unflagged pixels only, with a point-symmetric mask.

    A pixel is used only if its mirror pixel about the current centre pixel is
    also unflagged, so that masked (saturated) pixels do not pull the centroid
    to one side. The mask is symmetric about a whole pixel, which can bias the
    result towards the pixel centre. Returns (x, y, n_pixels_used) or None.
    """
    img = cut["img"]
    ny, nx = img.shape
    good = good_pixels(cut)
    bg = local_background(img, int(round(x0)), int(round(y0)), r_in=6, r_out=9)
    x, y = float(x0), float(y0)
    for _ in range(n_iter):
        xi, yi = int(round(x)), int(round(y))
        if not (half <= xi < nx - half and half <= yi < ny - half):
            return None
        sl = (slice(yi - half, yi + half + 1), slice(xi - half, xi + half + 1))
        g = good[sl] & good[sl][::-1, ::-1]
        if g.sum() < 12:
            return None
        jj, ii = np.mgrid[sl]
        val = np.where(g, img[sl] - bg, 0.0)
        tot = val.sum()
        if tot <= 0:
            return None
        x, y = float((val * ii).sum() / tot), float((val * jj).sum() / tot)
    return x, y, int(g.sum())