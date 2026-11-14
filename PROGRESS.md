# Progress

Team Blackhole 102, NASA Space Apps Challenge 2026, "Planet X and SPHEREx".
Times are local (UTC+3). Every number below comes from the log file named next to it.

## Status at 2026-11-14 11:20 (end of the "first hour" block)

One target (Barnard's Star) works end to end on a local build: cutouts ->
epoch-stacked frames -> PNG + JSON -> blink view. The site is not deployed yet.

### Done and verified

| Step | Result | Evidence |
|---|---|---|
| Environment | git 2.43.0, uv 0.12.5, node v22.23.2, npm 11.4.2, Vercel CLI 59.11.7, Python 3.13.2 | terminal output (not logged to a file) |
| Python venv | astropy 8.0.2, numpy 2.5.4, scipy 1.18.1, pyvo 1.10.0, requests 2.34.2, pillow 13.0.0 | `logs/setup_env.log` |
| Challenge page | Details and Resources tabs read in a browser | screenshots only, no file on disk |
| Target resolution | 5 of 5 targets resolved at the SIMBAD Harvard mirror | `logs/resolve_targets.log`, `data/targets.json` |
| Archive collections | IRSA has `spherex_dr1`, `spherex_dr1_cal`, `spherex_dr1_cube`, `spherex_dr1_deep`, `spherex_qr3`, `spherex_qr3_deep`; there is no `spherex_qr2` | `logs/sia_collections.log`, `logs/sia_query_qr2_attempt.log` |
| SIA query | 1973 exposures over 5 targets (table below) | `logs/sia_query.log`, `data/sia/*.csv` |
| Download | 1973 of 1973 cutouts on disk, 7850439360 bytes. First run: ok=1967, cached=2, failed=4 (all HTTP 503). Re-run: ok=4, cached=1969, failed=0 | `logs/download.log` lines 2830 and 4817 |
| Cutout structure | 29x29 px; HDUs IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE | `logs/inspect_fits.log` |
| Epoch stacks, Barnard's Star | 364 of 364 exposures, 3 epochs (118, 122, 124 exposures), 7 bands, 21 PNG + `meta.json` | `logs/stack_barnard.log`, `site/public/data/barnard/` |
| Site build | type check and build pass, 17 modules | `logs/site_build.log` |
| Blink view | opened on the local preview server: "All" band epochs 1 and 3, D6 epoch 2; star and catalogue marker move north between epochs; no console errors | seen in a browser, no file on disk; `logs/site_404_check.log` for the data files |
| License file | Apache-2.0 text from apache.org, 11358 bytes | `logs/license_fetch.log` |
| GitHub | public repository `FearmessOp/blackhole-spherex`, branch `main`; repo, LICENSE and README pages return HTTP 200 without login | `logs/prepush_*.log`, `logs/push_verify.log` |

Exposures per target (`logs/sia_query.log`):

| Target | spherex_dr1 | spherex_qr3 | Total | Epochs (gap > 30 d) |
|---|---|---|---|---|
| Barnard's Star | 240 | 124 | 364 | 2 + 1 |
| WISE 0855-0714 | 258 | 0 | 258 | 3 + 0 |
| Epsilon Indi B | 347 | 120 (no D1, D4) | 467 | 3 + 1 |
| RW Aurigae | 226 | 110 | 336 | 2 + 1 |
| R Draconis | 422 | 126 | 548 | 3 + 1 |

### Barnard's Star position check (`logs/stack_barnard.log`)

This is a sanity check of the stacks, not an astrometric result: the centroid is
flux-weighted on a saturated core, and the prediction uses the SIMBAD position
and proper motion without parallax.

| Epoch | Dates | Measured minus predicted |
|---|---|---|
| 1 | 2025-08-15 to 2025-10-01 | 0.47 arcsec |
| 2 | 2026-03-11 to 2026-05-05 | 0.61 arcsec |
| 3 | 2026-08-16 to 2026-09-22 | 0.58 arcsec |

Shift from epoch 1 to epoch 3: measured 10.04 arcsec (east -1.79, north 9.88),
predicted 10.21 arcsec (east -0.79, north 10.18). The 1.0 arcsec difference in
the east component is not explained yet (parallax, saturation and detector
astrometry have not been separated).

### Findings that affect the next steps

- Cutout orientation changes from exposure to exposure, so every frame is
  resampled to one fixed north-up grid before stacking.
- Barnard's Star is saturated: core pixels carry the OVERFLOW flag and some are
  NaN (`logs/inspect_fits.log`). Sub-pixel astrometry needs a method that does
  not rely on the core.
- 29 of the 364 Barnard files do not declare the SNOWBALL flag plane in the
  FLAGS header; only declared planes are masked there. The first stacking run
  dropped these files (`logs/stack_barnard_run1.log`).
- Most stacks have grid pixels without any data (`min_coverage=0`); they are
  transparent in the PNG and show as black strips at the image edge.
- Per-pixel wavelength comes from the WCS-WAVE lookup table; for all 364
  Barnard frames the value at the target lies inside the detector range given
  by SIA.
- The SIA CSV has unquoted JSON in `cloud_access`; `pipeline/sia_query.py`
  rejoins the split fields.
- The RW Aurigae values from SIMBAD are from 2007 (Hipparcos reduction), not
  Gaia; a Gaia DR3 reference still has to be fetched.

### Not done / blocked

- Vercel: the stored CLI token is invalid, `vercel login` is required. Nothing
  is deployed; there is no public site URL.
- Stacks for WISE 0855-0714, Epsilon Indi B, RW Aurigae and R Draconis: data is
  on disk, the stacking script has not been run on them.
- Raw (unstacked) playback next to the blink view: not started.
- Proper motion + parallax fit and comparison with Gaia DR3: not started.
- DR1 versus QR3 astrometry check with field stars: not done.
- Blink view for detectors D1 to D5 has not been opened in a browser (their PNG
  files are served, `logs/site_404_check.log`).
- README "Use of SI": heading only, text pending from the team.
- SOURCES.md: IRSA and SIMBAD terms and the Python, uv, git, curl, Node.js and
  npm licenses are marked "not yet verified"; transitive npm dependencies have
  not been checked.
- curl and Node could not verify the certificate chain of
  spaceappschallenge.org (`logs/challenge_curl.log`,
  `logs/challenge_cert_chain.log`); verification was not disabled, the page was
  read in a browser instead.
- Free disk is 20.7 GB after the download (`logs/download.log` line 4817).