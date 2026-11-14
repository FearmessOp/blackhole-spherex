# Progress

Team Blackhole 102, NASA Space Apps Challenge 2026, "Planet X and SPHEREx".
Times are local (UTC+3). Every number below comes from the log file named next to it.

## Status at 2026-11-14 09:50 (first hour, in progress)

### Done and verified

| Step | Result | Evidence |
|---|---|---|
| Environment | git 2.43.0, uv 0.12.5, node v22.23.2, npm 11.4.2, Vercel CLI 59.11.7, Python 3.13.2 | terminal output (not logged to a file) |
| Python venv | astropy 8.0.2, numpy 2.5.4, scipy 1.18.1, pyvo 1.10.0, requests 2.34.2, pillow 13.0.0 | `logs/setup_env.log` |
| Challenge page | Details and Resources tabs read in a browser | screenshots only, no file on disk |
| Target resolution | 5 of 5 targets resolved at the SIMBAD Harvard mirror | `logs/resolve_targets.log`, `data/targets.json` |
| Archive collections | IRSA has `spherex_dr1`, `spherex_dr1_cal`, `spherex_dr1_cube`, `spherex_dr1_deep`, `spherex_qr3`, `spherex_qr3_deep`; there is no `spherex_qr2` | `logs/sia_collections.log`, `logs/sia_query_qr2_attempt.log` |
| SIA query | 1973 exposures over 5 targets (table below) | `logs/sia_query.log`, `data/sia/*.csv` |
| Cutout URL format | 2-file trial succeeded, about 4 MB per cutout | `logs/download.log` lines 1-6 |
| Cutout structure | 29x29 px; HDUs IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE | `logs/inspect_fits.log` |
| License file | Apache-2.0 text from apache.org, 11358 bytes | `logs/license_fetch.log` |

Exposures per target (`logs/sia_query.log`):

| Target | spherex_dr1 | spherex_qr3 | Total | Epochs (gap > 30 d) |
|---|---|---|---|---|
| Barnard's Star | 240 | 124 | 364 | 2 + 1 |
| WISE 0855-0714 | 258 | 0 | 258 | 3 + 0 |
| Epsilon Indi B | 347 | 120 (no D1, D4) | 467 | 3 + 1 |
| RW Aurigae | 226 | 110 | 336 | 2 + 1 |
| R Draconis | 422 | 126 | 548 | 3 + 1 |

### Running

- Full download (5 targets, 8 workers) started 09:24:13, pid 7268, progress in
  `logs/download.log`. No `DONE` line for this run at the last check (09:44).
- At the last check 2 cutouts had failed after all retries, both Barnard, both
  HTTP 503 "Server busy, retry later":
  `level2_2025W35_2A_0474_1D4_spx_l2b-v27-2026-231.fits`,
  `level2_2026W34_1A_0176_2D6_spx_l2b-v27-2026-243.fits`.
  Barnard: 362 of 364 on disk (`logs/inspect_fits.log` line 1).
  The script must be re-run once the download ends; cached files are skipped.

### Findings that affect the next steps

- Cutout orientation changes from exposure to exposure (WCS matrix signs flip),
  so frames must be resampled to a common north-up grid before stacking.
- Barnard's Star is saturated in all 3 inspected exposures: core pixels carry
  the OVERFLOW flag, and one D3 exposure has 2 NaN core pixels. This limits
  sub-pixel centroiding on the core.
- Per-pixel wavelength comes from the WCS-WAVE lookup table; its grid size
  differs between detectors.
- The SIA CSV has unquoted JSON in `cloud_access`; `pipeline/sia_query.py`
  rejoins the split fields.
- The RW Aurigae values from SIMBAD are from 2007 (Hipparcos reduction), not
  Gaia; a Gaia DR3 reference still has to be fetched.

### Not done / blocked

- GitHub repository: `gh` is not installed on this machine; no remote yet.
- Vercel: the stored CLI token is invalid, `vercel login` is required.
- Vite + React + TypeScript site: not started.
- Epoch-stacked frames (PNG + JSON) and the blink view: not started.
- README "Use of SI": heading only, text pending from the team.
- SOURCES.md: IRSA and SIMBAD terms and the Python, uv, git, curl licenses are
  marked "not yet verified".
- curl and Node could not verify the certificate chain of
  spaceappschallenge.org (`logs/challenge_curl.log`,
  `logs/challenge_cert_chain.log`); verification was not disabled, the page was
  read in a browser instead.
- Free disk at start was 33.6 GB (`logs/download.log`), not 39 GB.