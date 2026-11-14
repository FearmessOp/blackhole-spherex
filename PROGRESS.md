# Progress

Team Blackhole 102, NASA Space Apps Challenge 2026, "Planet X and SPHEREx".
Times are local (UTC+3). Every number below comes from the log file named next to it.

## Status at 2026-11-14 13:55 (end of the second block)

Live site: https://blackhole-spherex.vercel.app (deployed by Vercel on every push to `main`).
All five targets have epoch stacks and raw playback on the site. The motion fit works
for Epsilon Indi B, partly for WISE 0855 (motion between epochs only) and not for
Barnard's Star.

### Done and verified

| Step | Result | Evidence |
|---|---|---|
| Targets | 5 of 5 resolved at the SIMBAD Harvard mirror | `logs/resolve_targets.log` |
| Archive | collections `spherex_dr1` + `spherex_qr3` (no `spherex_qr2`), 1973 exposures | `logs/sia_collections.log`, `logs/sia_query.log` |
| Cutouts, 0.05 deg | 1973 of 1973 on disk | `logs/download.log` lines 2830, 4817 |
| Cutouts, 0.2 deg | 1089 of 1089 on disk (Eps Indi B 467, Barnard 364, WISE 0855 258). First run failed=48 (HTTP 503), two re-runs fetched them | `logs/download_wide.log` lines 2431, 3570, 4042 |
| Epoch stacks | all 5 targets, grid cropped to the covered area | `logs/stack_<slug>.log` |
| Raw playback | every exposure on the same grid, one sprite sheet + JSON per target, wavelength per exposure | `logs/stack_<slug>.log` ("raw playback" line) |
| Site | stacked and raw views side by side; 5 targets in the selector; image panel fits a 390 px wide screen | `logs/site_build.log`; seen in a browser on the local preview |
| Live site | serves the same build and the data files of all 5 targets (HTTP 200) | `logs/live_site_check_5targets.log`, `logs/live_site_check_raw.log` |
| Gaia DR3 field stars | fetched from the ESA archive for all targets | `logs/gaia_field.log`, `logs/gaia_field_wide.log` |

Stacks per target (`logs/stack_<slug>.log`):

| Target | Exposures | Epochs | Output grid |
|---|---|---|---|
| Barnard's Star | 364 | 3 | 25 x 25 px |
| WISE 0855-0714 | 258 | 3 | 21 x 21 px |
| Epsilon Indi B | 467 | 4 | 19 x 19 px |
| RW Aurigae | 336 | 3 | 25 x 25 px |
| R Draconis | 548 | 3 (QR3 merges into the last DR1 epoch) | 19 x 19 px |

### DR1 versus QR3 astrometry (field stars against Gaia DR3)

Gaia DR3 stars were moved to each exposure date (proper motion + parallax) and
measured on the 0.2 deg cutouts with two estimators. Offsets are measured minus
Gaia. No release-dependent shift was measured.

| Field | Measurements | ePSF fit, east offset per epoch | QR3 minus DR1, ePSF (east / north) | Log |
|---|---|---|---|---|
| Epsilon Indi B | 7625 | -0.076, +0.008, -0.081, +0.011 arcsec | +0.046 +- 0.009 / +0.007 +- 0.009 arcsec | `logs/field_astrometry_eps-indi-b_wide.log` |
| Barnard's Star | 5949 | +0.074, -0.041, +0.053 arcsec | +0.041 +- 0.006 / +0.012 +- 0.005 arcsec | `logs/field_astrometry_barnard_wide.log` |
| WISE 0855-0714 | 2332 | +0.055, -0.040, +0.043 arcsec | no QR3 data | `logs/field_astrometry_wise-0855_wide.log` |

- The east offset alternates by about 0.1 arcsec from epoch to epoch in all three
  fields, also in the WISE 0855 field that has DR1 data only. The pattern follows
  the season, not the release, so the "QR3 minus DR1" numbers reflect which seasons
  each release covers. The cause of the seasonal pattern has not been identified.
- The windowed centroid shows the same pattern with a larger amplitude and about
  twice the scatter; the two estimators differ by a median of 0.35 to 0.55 arcsec
  on the same star and exposure.
- The Barnard's Star stack offsets that looked like a jump at the release change
  (+0.44, +0.57, -0.56 arcsec east) are mostly parallax, which was missing from the
  prediction: after subtracting it the east residuals are +0.93, +0.04, -0.08 arcsec
  (`logs/parallax_check_barnard.log`). The +0.93 arcsec of the first DR1 epoch is
  not explained; the field stars show no such shift in that epoch.

### Epsilon Indi B: proper motion and parallax

- Saturation check: OVERFLOW in 2 of 467 exposures; 412 have a clean core
  (`logs/target_astrometry_eps-indi-b.log`).
- 398 exposures aligned per exposure to their field stars (median star offset of
  the same estimator subtracted), 5-parameter fit, bootstrap errors
  (`logs/fit_motion_eps-indi-b_aligned.log`):

| | Windowed centroid | ePSF fit | SIMBAD |
|---|---|---|---|
| Proper motion east (mas/yr) | 3966.7 +- 29.1 | 3939.6 +- 24.6 | 3982.0 |
| Proper motion north (mas/yr) | -2462.6 +- 30.7 | -2440.7 +- 20.8 | -2466.8 |
| Parallax (mas) | 329.1 +- 16.3 | 300.4 +- 14.8 | 270.7 |
| Exposures used | 388 | 384 | |

- Proper motion: both methods within 2 bootstrap errors of SIMBAD.
- Parallax: 2.0 (ePSF) and 3.6 (centroid) bootstrap errors above SIMBAD.
- The errors are statistical only. Leaving one epoch out moves the ePSF parallax
  between 284 and 325 mas and the centroid parallax between 320 and 355 mas.
- Without the field-star alignment the two methods gave 237.8 and 426.0 mas
  (`logs/fit_motion_eps-indi-b.log`).
- The target is an unresolved pair of brown dwarfs; the fit treats it as one source.

### WISE 0855-0714: motion on D5+D6 epoch stacks (no fit)

- No saturation (OVERFLOW in 0 of 258 exposures). In the all-detector stacks the
  target is not measured: the centroid sits on a fixed field source a few arcsec
  away (`logs/stack_wise-0855.log`, `on_target=False` in all 3 epochs).
- On stacks of detectors 5 and 6 only, the peak S/N at the predicted position is
  11.3, 19.7 and 20.1 (11, 46 and 36 frames). Two estimators, bootstrap over frames
  (`logs/stack_astrometry_wise-0855.log`):

| Motion | SIMBAD prediction (east / north) | Windowed centroid | Gaussian fit |
|---|---|---|---|
| Epoch 1 to 3 | -8.01 / +0.65 arcsec | -6.50 +- 0.84 / +0.71 +- 0.76 | -7.24 +- 0.77 / +1.01 +- 0.54 |
| Epoch 2 to 3 | -4.52 / +0.56 arcsec | -3.48 +- 0.49 / +0.83 +- 0.48 | -3.26 +- 0.33 / +0.89 +- 0.31 |

- The westward motion is seen and the two methods agree within their errors. The
  epoch 2 to 3 east motion is shorter than predicted (2.1 and 3.8 errors); blending
  with the nearby field source is possible but has not been checked.
- Limits: 3 epochs, so no proper motion + parallax fit; the search is restricted to
  1.5 px around the prediction; not aligned to field stars.

### Tried and not usable

- **Barnard's Star motion fit.** OVERFLOW in 357 of 364 exposures, no exposure has
  a clean core. The ePSF fit on unflagged pixels fails (72 usable exposures, 35 of
  them more than 6 arcsec off; `logs/barnard_wings_diag.log`). A single method
  remains (point-symmetric masked centroid, 284 exposures): scatter 2.3 arcsec per
  exposure, parallax 804 +- 162 mas against 547.0, proper motion east -1517 +- 339
  against -801.6 mas/yr (`logs/fit_motion_barnard_wings.log`). Not a result.
- **WISE 0855 per-exposure fit (D5+D6).** 44 exposures with S/N about 4; the two
  methods disagree (parallax 687 +- 313 and -197 +- 257 mas;
  `logs/fit_motion_wise-0855_d56.log`). Replaced by the stack measurement above.
- **Field-star check on the 0.05 deg cutouts.** Too few stars (12 references,
  126 measurements; `logs/field_astrometry_barnard.log`). Replaced by the 0.2 deg
  cutouts.

### Open

- Barnard's Star: east residual of +0.93 arcsec in the first DR1 epoch, unexplained.
- Seasonal 0.1 arcsec pattern in the field-star offsets, cause not identified.
- R Draconis stacks: minimum coverage of 1 to 4 frames on some pixels
  (`logs/stack_r-dra.log`), probably the saturated core; not looked at.
- The site still labels the stack centroid offset without parallax; the fit results
  above are not shown on the site.
- The side-by-side view was checked on the local preview at desktop width only, not
  at phone width and not in a browser on the live site (the live data files and
  build were checked with curl).
- RW Aurigae reference values are from 2007 (Hipparcos reduction), not Gaia.
- README "Use of SI": heading only, text pending from the team.
- SOURCES.md: the IRSA, SIMBAD and Gaia archive terms and several tool licenses are
  still marked "not yet verified".
- Free disk: 15.6 GB (`logs/download_wide.log` line 4042).