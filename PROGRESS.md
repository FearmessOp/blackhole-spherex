# Progress

Team Blackhole 102, NASA Space Apps Challenge 2026, "Planet X and SPHEREx".
Times are local (UTC+3). Every number below comes from the log file named next to it.

## Status at 2026-11-14 19:05

Live site: https://blackhole-spherex.vercel.app (deployed by Vercel on every push to `main`).
The commits listed below were pushed (`be4f2a0..6fb46ee`, `logs/push_block3.log`).
The live site serves the same bundle as the local build and the new data files
(`logs/live_site_check_block3.log`) and was opened in a browser, see below.

All five targets have epoch stacks, raw playback, a flicker number and a results
panel on the site. A motion fit works for Epsilon Indi B, motion between
epochs is measured for WISE 0855, and the three saturated targets carry a warning
instead of a motion.

The site shows five prepared targets only. Coordinate entry, coordinates in the
URL, click-for-spectrum, the "find the mover" mode, catalogue overlays, frame
subtraction and field-size selection are not implemented.

### Commits of this block (pushed)

| Commit | Content |
|---|---|
| `6fb46ee` | README: "Use of SI" section marked as a draft |
| `826259d` | README, SOURCES and PROGRESS rewritten; terms and licence checks |
| `7268457` | Results panel, D1-3 and D5+6 bands, saturation and flicker for all five targets, WISE 0855 neighbour star test |
| `85a7bf9` | Narrow screens: motion table as one block per epoch pair, value and error kept on one line |
| `6cccbd5` | Motion arrow drawn 4x with label, outlined overlay text |
| `e5d8110` | Raw playback leaves out exposures with more than 20% of the grid masked (was 50%) |
| `819c627` | Flicker: epoch means compared detector by detector |

### Done and verified

| Step | Result | Evidence |
|---|---|---|
| Targets | 5 of 5 resolved at the SIMBAD Harvard mirror | `logs/resolve_targets.log` |
| Archive | collections `spherex_dr1` + `spherex_qr3` (no `spherex_qr2`), 1973 exposures | `logs/sia_collections.log`, `logs/sia_query.log` |
| Cutouts, 0.05 deg | 1973 of 1973 on disk | `logs/download.log` lines 2830, 4817 |
| Cutouts, 0.2 deg, first three targets | 1089 of 1089 on disk (Eps Indi B 467, Barnard 364, WISE 0855 258). First run failed=48 (HTTP 503), two re-runs fetched them | `logs/download_wide.log` lines 2431, 3570, 4042 |
| Cutouts, 0.2 deg, RW Aur and R Dra | 884 of 884 on disk. First run stopped at the free-disk guard (ok=583, failed=301), second run failed=2, third run failed=0 | `logs/download_wide.log` lines 5251, 6317, 7206 |
| Epoch stacks | all 5 targets, grid cropped to the covered area; bands: all, D1-3, D5+6, D1 to D6 | `logs/stack_<slug>.log` |
| Raw playback | single exposures on the same grid, one sprite sheet + JSON per target, wavelength per exposure | `logs/stack_<slug>.log` ("raw playback" lines) |
| Gaia DR3 field stars | fetched from the ESA archive for all targets | `logs/gaia_field.log`, `logs/gaia_field_wide.log` |
| Results on the site | every number copied from pipeline outputs by `pipeline/build_results.py` | `logs/build_results.log` |
| Site build | type check clean, 20 modules | `logs/site_build.log` |
| Licences and terms | read from the providers' pages; npm lock file: 75 packages, all with a licence field | `logs/check_terms.log`, `logs/npm_licenses.log` |

Stacks per target (`logs/stack_<slug>.log`):

| Target | Exposures | Epochs | Output grid |
|---|---|---|---|
| Barnard's Star | 364 | 3 | 25 x 25 px |
| WISE 0855-0714 | 258 | 3 | 21 x 21 px |
| Epsilon Indi B | 467 | 4 | 19 x 19 px |
| RW Aurigae | 336 | 3 | 25 x 25 px |
| R Draconis | 548 | 3 (QR3 merges into the last DR1 epoch) | 19 x 19 px |

### What was looked at in a browser (local preview, `http://localhost:4173/`)

- All five targets at 900 px and at 390 px width before commit `85a7bf9`; three
  layout defects found at 390 px and fixed in that commit.
- After `85a7bf9` and `6cccbd5`: Epsilon Indi B and WISE 0855 at 900 px (tables,
  arrow, labels) and at 390 px (arrow, labels); Barnard's Star at 390 px (top of
  the page only).
- After `e5d8110`: the raw-playback sentence on Barnard's Star and WISE 0855 at 900 px.
- After `819c627`: the flicker sentence on R Draconis at 900 px.
- Not opened in the local preview after the last two commits: Epsilon Indi B and
  RW Aurigae. They were seen on the live site instead (next section).

### What was looked at in a browser (live site, after the push)

- 900 px width: all five targets, top of the page, flicker and raw-playback
  sentence, and the "Measured" section. The numbers shown are the ones in
  `logs/build_results.log`. For Epsilon Indi B the fit table was seen, the parallax
  warning and the arrow note below it were not scrolled to. No console errors.
- 390 px width: the top of the page for all five targets (cards, stacked panel,
  labels, arrow on Epsilon Indi B); the lower part of the page for R Draconis
  (flicker sentence, controls, saturation warning) and WISE 0855 (motion table as
  blocks, neighbour note). The lower part of Barnard's Star, Epsilon Indi B and
  RW Aurigae was not opened at this width on the live site. No console errors.
- Seen and left as it is: for RW Aurigae the saturation warning reads "In 0 of
  these exposures at least one of the central 3x3 pixels is empty and shows as
  black"; correct, but awkward to read.

### Saturation (`logs/saturation_check.log`, `logs/target_astrometry_<slug>.log`)

OVERFLOW in the central 3x3 px at the catalogue position:

| Target | OVERFLOW exposures | of these: at least one core pixel empty / all nine carry a value |
|---|---|---|
| Barnard's Star | 357 of 364 | 237 / 120 |
| Epsilon Indi B | 2 of 467 | 2 / 0 |
| WISE 0855-0714 | 0 of 258 | 0 / 0 |
| RW Aurigae | 305 of 336 | 0 / 305 |
| R Draconis | 534 of 548 | 532 / 2 |

- RW Aurigae looks unsaturated in the raw playback because none of its saturated
  cores is empty; the values are drawn but are not reliable.
- RW Aurigae: a clean core in 18 of 336 exposures, all on detector 1 (11, 5, 2 per
  epoch). R Draconis: 0 of 548. No motion is shown for either.

### Raw playback: masked frames (`logs/raw_masked_fraction.log`, `logs/raw_masked_fraction_after.log`)

- Measured on the published sprite sheets at the earlier limit of 50%: median empty
  fraction 0.2% to 3.1% per target; 17 frames with more than 20% empty (3, 3, 0, 2, 9
  for Barnard, Eps Indi B, WISE 0855, RW Aur, R Dra).
- Limit lowered to 20%. Frames left out now: 7 of 364, 9 of 467, 0 of 258, 4 of 336,
  20 of 548 (`logs/stack_<slug>.log`). Largest empty fraction that remains: 17.3%,
  12.2%, 1.8%, 14.7%, 16.3%.
- A fully empty 3x3 core is 2.5% of the smallest grid, so a frame is not left out
  for an empty saturated core alone. At the earlier limit, all nine core pixels were
  empty in 275 of the 537 R Draconis frames in the playback.
- The stacks did not change: 153 of 163 published files are identical before and
  after; the ten that changed are `raw.json`, `raw.png` and `index.json`
  (`logs/site_data_hash_diff.log`). `index.json` is rewritten by
  `build_results.py` and was identical again afterwards (`logs/site_data_hash_diff2.log`).
- Why the frames between 20% and 50% are empty was not examined.

### Flicker (`logs/flicker_<slug>.log`, `logs/flicker_diag_<slug>.log`)

Five brightest isolated Gaia DR3 stars per field with at least 8 clean exposures in
every epoch, 5x5 px aperture on the 0.2 deg cutouts.

| Field | Between raw exposures | Between epoch means, detector by detector | Earlier method (all detectors mixed) |
|---|---|---|---|
| Barnard's Star | 77.8% | 1.1% | 5.2% |
| Epsilon Indi B | 94.3% | 2.1% | 7.6% |
| WISE 0855-0714 | 97.7% | 2.4% | 2.1% |
| RW Aurigae | 74.7% | 0.8% | 2.7% |
| R Draconis | 96.4% | 0.9% | 6.2% |

- Two R Draconis stars had epoch scatters of 25.7% and 37.7% with the earlier
  method. They lie 415 and 376 arcsec from the target, at the corner of the cutout,
  and are measured on detectors 2 and 5 only. Their fluxes form two groups (25.6 and
  6.5; 16.5 and 3.2), and the epoch mean depended on how many exposures of each
  detector fell into the epoch. The same effect, smaller, was present in the other
  fields (for example no detector 1 or 4 exposures in the last Epsilon Indi B epoch).
- The epoch number is now computed per detector, relative to the detector's own
  mean, and averaged over the detectors that have at least 5 exposures in every
  epoch. With this the two stars give 2.8% and 1.1%. The same five stars are used
  in every field as before.
- Not explained: in the Epsilon Indi B field all five stars are 1.7% to 4.4% above
  their mean in the first epoch; in the WISE 0855 field four of five stars are 2.8%
  to 4.5% below in the first epoch (12 to 29 exposures per star in that epoch).
- Not examined: why the corner stars are covered by detectors 2 and 5 only; other
  values of the 5-exposure limit; the wavelength change within one detector.
- Weak entries: Barnard G = 12.47 rests on detector 1 only (3.7%); R Draconis
  G = 13.59 on 6 to 7 exposures per detector and epoch.

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
- This check was not run for the RW Aurigae and R Draconis fields.

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
- Parallax: 2.0 (ePSF) and 3.6 (centroid) bootstrap errors above SIMBAD, that is
  11% and 22%.
- The errors are statistical only. Leaving one epoch out moves the ePSF parallax
  between 284 and 325 mas and the centroid parallax between 320 and 355 mas.
- Without the field-star alignment the two methods gave 237.8 and 426.0 mas
  (`logs/fit_motion_eps-indi-b.log`).
- The target is an unresolved pair of brown dwarfs; the fit treats it as one source.
- On the site: both methods next to SIMBAD, the parallax excess and the
  leave-one-out range as a warning, and an arrow for the measured proper motion over
  1.39 years, drawn 4 times longer than the real motion (1.04 px) and labelled so.

### WISE 0855-0714: motion on D5+D6 epoch stacks (no fit)

- No saturation (OVERFLOW in 0 of 258 exposures). In the all-detector stacks the
  target is not measured: the centroid sits on a field source a few arcsec away
  (`logs/stack_wise-0855.log`, `on_target=False` in all 3 epochs).
- On stacks of detectors 5 and 6 only, the peak S/N at the predicted position is
  11.3, 19.7 and 20.1 (11, 46 and 36 frames). Motion between epochs, east / north in
  arcsec, bootstrap over frames (`logs/stack_astrometry_wise-0855.log`,
  `logs/neighbour_test_wise-0855.log`):

| Motion | SIMBAD prediction | Windowed centroid | Gaussian fit | Gaussian fit, neighbour modelled |
|---|---|---|---|---|
| Epoch 1 to 2 | -3.49 / +0.09 | -3.02 +- 0.85 / -0.12 +- 0.76 | -3.98 +- 0.81 / +0.12 +- 0.58 | -3.74 +- 0.66 / -0.28 +- 0.44 |
| Epoch 1 to 3 | -8.01 / +0.65 | -6.50 +- 0.84 / +0.71 +- 0.76 | -7.24 +- 0.77 / +1.01 +- 0.54 | -7.97 +- 0.68 / +1.08 +- 0.55 |
| Epoch 2 to 3 | -4.52 / +0.56 | -3.48 +- 0.49 / +0.83 +- 0.48 | -3.26 +- 0.33 / +0.89 +- 0.31 | -4.23 +- 0.48 / +1.36 +- 0.49 |

- The field source is Gaia DR3 5756956644387831296 (G = 16.31). It lies 11.4, 8.2
  and 4.3 arcsec from the predicted target position in the three epochs; the target
  is moving towards it (`logs/neighbours_wise-0855.log`). On the D1-3 stacks it is
  fitted within 0.19 arcsec of its Gaia position with a peak S/N of at least 60.3.
- On the D5+D6 stacks its amplitude relative to the target is 0.40 (0.28-0.55),
  0.39 (0.30-0.49) and 0.22 (0.01-0.43; 16-84% bootstrap range). A single-source
  measurement can be pulled towards it. The single-source east motion from epoch 2
  to 3 was shorter than predicted; with the star in the model it is not (next item).
  No other cause was tested.
- With the two-source fit (star fixed at its Gaia position, one shared width, 9x9 px
  window) the east motion agrees with the prediction within the errors in all three
  pairs. North, epoch 2 to 3: +1.36 +- 0.49 against +0.56 (1.6 errors).
- Limits: 3 epochs, so no proper motion + parallax fit; not aligned to field stars;
  in the last epoch the two sources are 0.7 px apart and the amplitude ratio is
  poorly constrained.

### Tried and not usable

- **Barnard's Star motion fit.** OVERFLOW in 357 of 364 exposures, no exposure has
  a clean core. The ePSF fit on unflagged pixels fails (72 usable exposures, 35 of
  them more than 6 arcsec off; `logs/barnard_wings_diag.log`). A single method
  remains (point-symmetric masked centroid, 284 exposures): scatter 2.3 arcsec per
  exposure, parallax 804 +- 162 mas against 547.0, proper motion east -1517 +- 339
  against -801.6 mas/yr (`logs/fit_motion_barnard_wings.log`). Not a result.
- **WISE 0855 per-exposure fit (D5+D6).** 44 exposures with a median S/N of 4.5; the
  two methods disagree (parallax 687 +- 313 and -197 +- 257 mas;
  `logs/fit_motion_wise-0855_d56.log`). Replaced by the stack measurement above.
- **Field-star check on the 0.05 deg cutouts.** Too few stars (12 references,
  126 measurements; `logs/field_astrometry_barnard.log`). Replaced by the 0.2 deg
  cutouts.
- **First R Draconis flicker run.** Made with 248 of 548 wide cutouts (2 epochs)
  while the download was incomplete; discarded and repeated with all 548.

### Documents

- `README.md`: rewritten with what the site shows, results, known limitations,
  pipeline steps and a "Use of SI" section. **The "Use of SI" text is a draft
  written by the SI tool itself and has to be confirmed by the team**, including
  the statement that all code was written with SI and the name of the tool.
- `SOURCES.md`: terms of IRSA, SIMBAD and Gaia and the licences of the tools filled
  in from `logs/check_terms.log`. The Gaia DR3 rows in `data/gaia/*.csv` are under
  CC BY-NC 3.0 IGO (non-commercial), which is stated there; whether these files
  stay in an Apache-2.0 repository is a decision for the team.
- Still "not checked" in `SOURCES.md`: terms of GitHub, Vercel, Visual Studio Code
  and the SI tool; the DOI of the SPHEREx data set.

### Open

- Live site at 390 px: lower part of the page for Barnard's Star, Epsilon Indi B
  and RW Aurigae not opened (same layout code as the two targets that were).
- Team decisions: confirm the "Use of SI" text and the name of the SI tool; decide
  whether `data/gaia/*.csv` (CC BY-NC 3.0 IGO) stays in the Apache-2.0 repository.
- Challenge features not implemented: coordinate entry and coordinates in the URL,
  spectrum on click, "find the mover", catalogue overlays, frame subtraction, field
  size. No light curve for the two variable stars.
- Demo (at most 30 seconds) and project page: nothing was done on them in this block.
- Barnard's Star: east residual of +0.93 arcsec in the first DR1 epoch, unexplained.
- Seasonal 0.1 arcsec pattern in the field-star offsets, cause not identified.
- Flicker: first-epoch differences in the Epsilon Indi B and WISE 0855 fields, not
  explained (see above).
- R Draconis stacks: the "all" stack shows dimmer pixels in the middle of the core,
  and some pixels have a coverage of 1 to 4 frames (`logs/stack_r-dra.log`);
  probably saturation, not examined.
- One RW Aurigae raw frame with its lower part black was seen before the 20% limit;
  RW Aurigae was not opened again afterwards.
- At 390 px the five target cards take about 260 px of height before the image.
- RW Aurigae reference values are from 2007 (bibcode `2007A&A...474..653V`), not Gaia.
- Free disk: 7.9 GB (`logs/download_wide.log` line 7206).