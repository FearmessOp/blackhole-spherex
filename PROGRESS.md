# Progress

Team Blackhole 102, NASA Space Apps Challenge 2026, "Planet X and SPHEREx".
Times are local (UTC+3). Every number below comes from the log file named next to it.

## Status at 2026-11-15 12:10

Last round before the 16:00 deadline. Times are local.

### Commits (all pushed; remote hash checked with `git ls-remote` after each push)

| Commit | Content | Log |
|---|---|---|
| `b83da40` | Block 1, first screen: tabs in the target row, search label as `aria-label`, play/pause and epoch buttons directly under the panels, one-sentence result (EN/TR), note on black core pixels, motion arrow starts at the marker gap, quick-look motion table in the side column | `logs/first_screen_local2.log`, `logs/first_screen_live1.log` |
| `c6a253f` | Block 2, Ross 128: no sign error found; the quick look gives no rough motion for K < 8.0; `lookup.js` returns `k_mag` | `logs/ross128_sign.log`, `logs/k_saturation.log` |

### Block 1: first screen

- `--chrome` (vertical space outside the two images) measured, not guessed: at 430 px the result sentence ended
  7 px above the bottom of a 1400x900 window (EN and TR, `logs/first_screen_local1.log`,
  `logs/first_screen_local_tr.log`); set to 440 px, the sentence now ends at 883 px (863 px for WISE 0855)
  (`logs/first_screen_local2.log`). Live, 1400x900: Barnard, Epsilon Indi B and WISE 0855 show both panels,
  the play bar and the sentence without scrolling (`logs/first_screen_live1.log`). At 390x800 the first image is
  fully visible; no horizontal overflow.
- Result sentence, from `results.json` only. Fit: method with the id of `fit.arrow.method` ("psf", ePSF fit).
  Stack motion (WISE 0855): first-to-last epoch pair, method "two" (Gaussian fit, neighbour modelled), the method
  the guide (`FindMover.tsx`) puts first. Saturated: `overflow > exposures / 2`, as in `ResultsPanel.tsx`.
- Black-pixel note: shown where `saturation.core_empty > 0`. That includes Epsilon Indi B (2 exposures), not
  only the saturated targets.
- `res.arrow` (Measurement tab) still holds: arrow = ePSF proper motion, 4x the real length.
- Not seen: the quick-look table in the side column (IRSA did not answer, see Block 2).

### Block 2: Ross 128 east sign

Details in `logs/ross128_sign.log`.
- No sign error: the same code gives the right east sign in both directions on Epsilon Indi B (east positive)
  and WISE 0855 (east negative) against the full pipeline (`logs/test_motion.log`).
- Saturation is probable, not measured: SIMBAD K = 5.65; prepared targets with K 2.23 to 7.02 are saturated in
  91–98% of exposures, those with K 9.08 to 11.93 in 0–23%, except omi02 Eri B (K 9.86, 92%, bright companion)
  (`logs/k_saturation.log`).
- Not done because IRSA answered 502 (`logs/lookup_ross128_live.json`, `logs/irsa_probe_t1.log`): OVERFLOW flags
  of Ross 128 cutouts; comparison of quick look and full pipeline on LAWD 37 or SSSPM J1444-2019.
- Limit K < 8.0 chosen. A K limit does not catch a faint star next to a bright one (omi02 Eri B). Stars without a
  K value in SIMBAD still get the table (checked: WISE J085510.83-071442.5, `logs/lookup_k_field_check3.log`).

### Block 3: FQ Pav

- The missing cutout was fetched: 478 of 478 (`logs/download_variable_retry2.log`).
- **Mistake on the way:** a first retry was started without `--size 0.2 --tag wide`. It wrote 238 cutouts of
  0.05 deg into `cache/cutouts/fq-pav/` before it was stopped (`logs/download_variable_retry.log`,
  `logs/download_variable_retry_stop.log`). The 477 wide cutouts in `cache/cutouts_wide/fq-pav/` were not touched
  (last write 06:37:40, `logs/fq_pav_cache_check.log`). The 238 extra files were not deleted (`cache/` rule).
- Gaia field stars: ESA archive connection timed out, IRSA copy answered 502 (`logs/gaia_field_fq-pav_wide.log`).
  Without them no saturation check against field stars, no brightness per detector and epoch, no comparison.
  FQ Pav is not on the site.

## Status at 2026-11-15 09:05

Morning list and design block. Work stopped at the 09:00 limit. The task was interrupted between
06:27 and 09:02; in that time only the FQ Pav download ran (it ended at 06:37).

### Commits (all pushed; remote hash checked with `git ls-remote` after each push)

| Commit | Content | Log |
|---|---|---|
| `2059803` | `SOURCES.md`: Playwright 1.53.0 (Apache-2.0), 15 prepared targets | `logs/commit_s1.log` |
| `762478f` | `logs/design_before.md` (17 defects of the old design), `pipeline/design_shots.py` | `logs/commit_t0.log` |
| `f7c8a9d` | Redesign: three tabs, guided-mode layout, "?" explanations, English and Turkish | `logs/commit_design.log` |
| `b1efa30` | Language fix in `site/src/i18n.ts`, `pipeline/design_links.py` | `logs/commit_lang.log` |
| `dc98015` | README opening; round 2 of `logs/design_after.md` | `logs/commit_s3.log` |

Local and remote HEAD were both `dc98015` at 09:02.

**Not committed and not pushed at 09:05:** this entry and the files of item 4. The build that has to pass before
a push failed at 09:05 (`logs/build_progress.log`) because of a stray file, see "Seen, not fixed". The live site
was not affected: that file was never in the repository.
**Added at 10:45:** the stray file was deleted on the team's decision (`logs/delete_guideview.log`), the build
passes again (`logs/build_block1.log`, same bundle names as before), and this entry and the files of item 4 were
committed after that.

### Morning list

| Item | State |
|---|---|
| 1. `SOURCES.md` | Done, `2059803`. |
| 2. Guided-mode layout (inside the design block) | Done, `f7c8a9d`. |
| 3. README opening | Done, `dc98015`, build `logs/build_s3.log`. "Known limitations" and "Use of SI" were not edited. |
| 4. Variable star that does not saturate | Not finished, see below. Nothing was added to the site. |
| 5. Spectrum of a prepared target | Not started. |
| 6. `docs/SUBMISSION_DRAFT.md` | Not updated. |

### Design block

Details, defects found and fixed, and what was not looked at by eye are in `logs/design_after.md`.

- Screenshots (not in git): before `cache/design/before/` (40 files); after `cache/design/local1/`,
  `cache/design/local2/` and `cache/design/live1/` (104 files each).
- Logs: `logs/design_shots_{before,local1,local2,live1}.log`, `logs/design_links_{live1,local1,live2}.log`,
  `logs/design_contrast.log` (11 pairs, lowest 6.84 : 1).
- Live site, bundle of `b1efa30` (`logs/design_links_live2.log`): 28 of 30 target loads "ok"; the 2 CHECK lines
  are WISE 0855 with 4 image panels where the script expects 2. Position link shown. Language kept in the address.
- The pages of `b1efa30` were checked by script only; the screenshots are of `f7c8a9d`.
- One table footnote stays English in Turkish mode (`val.nf.row`).
- Changes of content and placement are listed in `logs/design_after.md` ("to disclose").

### Variable star (item 4): state when work stopped

- **Criteria** (written in `pipeline/select_variable.py` before any SPHEREx result of a candidate was seen):
  SIMBAD type Mira; K between 10 and 12; galactic latitude at least 30 deg from the plane; in 2MASS no other
  source within 20 arcsec brighter than K + 2.5 and none brighter than K = 8 within 150 arcsec; SPHEREx
  exposures in at least 3 epochs; brightest K first.
- **Reason for K 10 or fainter** (`logs/fast_movers_table.log`): K 9.08 and 9.37 have OVERFLOW in 85 of 368 and
  64 of 341 exposures; K 10.15 to 11.93 in at most 2 exposures each.
- **Selection** (`logs/select_variable.log`): 3044 candidates, 1353 at high latitude. The first
  (OGLE LMC-LPV-47121) has one epoch. The second, **FQ Pav** (K 10.014), passed: 36 2MASS sources within
  150 arcsec, none of them excluding it; 163 / 180 / 135 rows in three epochs (both collections together,
  duplicates not removed).
- **2MASS source.** The IRSA TAP copy did not answer (`logs/twomass_probe.log`, `logs/select_variable_try1.log`)
  and the CDS TAP service could not be reached (`logs/vizier_probe.log`). The same catalogue (II/246/out) was
  read from the VizieR mirror at CfA. The criteria were not changed.
- **Download** (`logs/download_variable.log`): 477 of 478 wide cutouts, 140166720 bytes; 1 failed with
  HTTP 503 after its retries; the EPSF was stripped from every file.
- **Not done:** Gaia field stars (the query was never started), saturation check, brightness per detector and
  epoch, comparison with the scatter of field stars. So it is not known whether FQ Pav saturates or whether its
  change is visible.
- FQ Pav is in `data/variable_candidate.json` only. It is not in `data/targets.json` and not on the site.
- Not committed: `pipeline/select_variable.py` (new), the `--targets` option in `pipeline/download_cutouts.py` and
  `pipeline/gaia_field.py` (default behaviour unchanged), the SIA files of the two candidates, the logs above.

### Seen, not fixed

- **A file that this work did not create:** `site/src/GuideView.tsx` (61 lines, created 09:01:45, untracked).
  No file imports it. Where it comes from is not known. It was not touched and is not committed.
  With it in the working tree `npm run build` fails: 8 TypeScript errors, all in that file (unused imports and
  declarations, `logs/build_progress.log`). The last build that passed is `logs/build_s3.log` (06:10); no other
  file in `site/src` changed after it.
  Added at 10:45: the file was compared with `site/src/FindMover.tsx`. It is an older beginning of that component
  (same steps and constants; its `useTarget` lacks the slug guard and the `has_diff` check) and holds nothing that
  `FindMover.tsx` lacks. It was deleted on the team's decision (`logs/delete_guideview.log`).
- **Ross 128 quick look (live):** the east component of the rough motion has the opposite sign to the catalogue
  prediction in all three epoch pairs; the north component agrees. Table in `logs/design_after.md`. The cause was
  not looked into.
- In the quick look at 1400 px the lower half of the column beside the image is empty.

### Processes and disk at 09:02 (command output, not in a log file)

- Local preview on port 4173 (started 05:18 for the design checks) is still running.
- Not started by this work and not touched: `node server.js` (PID 24252), `python -m http.server 4321` for
  `viz3d` (PID 25276), two `hermes_cli` processes (PIDs 27652 and 3472, started 04:06).
- Free disk on C: 4.6 GB at 06:11 (`logs/disk_free_s4.log`), 5.49 GB at 06:26, 16.38 GB at 09:02. This work
  deleted nothing; the reason for the increase was not looked into.

## Status at 2026-11-15 04:05

Night work list, blocks 1 to 5. Sections further down describe the state at their own time.

### Commits (all pushed; remote hash checked with `git ls-remote` after each push)

| Commit | Content | Log |
|---|---|---|
| `d2a868b`, `2a6b7c1` | Fast-mover selection and download logs | `logs/download_fast.log`, `logs/download_fast_retry.log` |
| `13d6652` | Difference image, `--strip-epsf` | `logs/diff_image_*.log` |
| `b20ab45` | Find the mover (guided mode) | `logs/guide_blink_check.log` |
| `55b1708` | `has_diff` in results.json; `diff.json` only requested where it exists (fixed a live 404) | `logs/has_diff_live_check.log` |
| `ace40a7` | Guided mode keeps data with its slug (fixed a live 404 on `wise-0855/d123_e3.png`) | `logs/guide_live_404_check.log`, `logs/guide_live_after_fix.log` |
| `e73c7d5` | Ten fast movers as prepared targets, "Validation on fast movers" section, parallax sentence names each method | `logs/commit_block4.log`, `logs/live_check_block4.log`, `logs/live_check_block4_strict.log` |
| `db2a421` | `docs/SUBMISSION_DRAFT.md` (English draft, SI field empty) | `logs/commit_submission_draft.log` |

### Downloads

3799 ok + 2 cached + 3 failed (HTTP 503) in the first run; the 3 were fetched on
retry (`logs/download_fast.log`, `logs/download_fast_retry.log`).

### Fast movers (`logs/fast_movers_table.log`)

- 9 of 10 judged (at least 30 usable exposures, at least 3 epochs of at least 5).
  Within 2 errors of SIMBAD, ePSF fit: pm east 8, pm north 9, both 8, parallax 9;
  windowed centroid: 8, 8, 7, 7.
- ePSF outside 2 errors: LAWD 37 east, +2724.7 ± 23.2 against +2661.6 mas/yr.
- omi02 Eri B not judged: OVERFLOW in 399 of 432 exposures, 8 usable (3, 1, 4 per
  epoch), bootstrap errors in the millions of mas. The stack centroid lies 8.0, 7.8
  and 7.93 arcsec from the catalogue position; a Gaia star (DR3 3195919254111314816,
  G = 9.78) lies 4.15 W / 6.66 N arcsec away (`logs/omi02_eri_b_neighbours.log`).
- **The selection rule was added to `fast_movers_table.py` after the omi02 Eri B fit
  had been seen.** Without it the script counted omi02 Eri B as within 2 errors
  because its errors were huge. The constants (30 / 3 / 5) are those of
  `validation_field_stars.py` lines 42–44, fixed before the field-star results.

### Live site checks

- After `e73c7d5`: bundle `index-B6vxSKmh.js` served (`logs/live_bundle_block4.log`);
  15 pages, no 4xx, no HTML for `/data/` URLs, no console errors
  (`logs/live_check_block4.log`). The first selector also counted the validation
  tables; with a strict selector omi02 Eri B has no fit table and 3 warnings
  (`logs/live_check_block4_strict.log`).
- Full tour, 900 and 390 px (`pipeline/live_tour.py`, `logs/live_tour.log`): five
  prepared targets and the guided mode (3 steps, ends with "Play again"); no
  horizontal overflow, no 4xx, no console errors. The quick-look lines of that log
  are not valid (the script read a target card); they were repeated in
  `logs/live_tour_quick.log`: Wolf 359 291 exposures, Ross 128 341, Teegarden's Star
  337, 3 epochs each, 18 read in 2.2–2.4 s, 3 motion rows, no overflow.
- Seen by eye: the fast-mover table at 900 and 390 px (at 390 px it scrolls
  sideways inside its section, the page does not); Epsilon Indi B and guided step 3
  at 390 px (screenshots in `cache/tour/`, not in git).
- WISE 0855 results text is 112 characters shorter at 390 px: the motion table
  header is hidden on narrow screens on purpose (`logs/live_tour_wise_chars.log`).

### Other

- Port 3000: the earlier PID 20456 was gone; the process now on port 3000
  (`node server.js`, PID 24252) belongs to another program and was not touched.
- A process not started by this work: `C:\Python313\python.exe -m http.server 4321
  --bind 127.0.0.1 --directory viz3d` (PID 25276, started 03:22:13). Not touched.
- Tool incident: three writes of `site/src/GuideView.tsx` reported success and left
  a 0-byte file. The component was written as `FindMover.tsx`; the empty file was
  removed. Every written file was checked on disk afterwards.
- README "Use of SI" unchanged (`logs/readme_si_unchanged.log`).

## Status at 2026-11-14 22:20

Sections further down describe the state at their own time. Where they say that
coordinate entry is not implemented, this entry replaces them.

### Block B: quick look at any star or position (pushed: `760a5c4`, `ddac403`, `8ab9ac0`, `618220b`)

The site now has a search box and reads `?target=<name>` and `?ra=<deg>&dec=<deg>`
from the URL. A prepared target opens its prepared view; anything else opens the
quick look: exposure list from the site's function `/api/lookup`, image rows read
by the browser from the cloud copy, one stack per epoch, blink, and a table of
rough motions between epochs. No new library was added.

**Preliminary findings, measured again** (`logs/range_probe.log`, `logs/sia_probe.log`)

| Finding | Measured |
|---|---|
| Share of the EPSF layer in a cutout file | 97.4% to 97.5% (3 files); the image is 5760 bytes |
| Full files | 65,721,600 and 65,995,200 bytes. IMAGE, VARIANCE, ZODI uncompressed (16,646,400 bytes each); FLAGS is a RICE_1 table, one tile per row |
| IMAGE data offset | 25920 or 28800 bytes, differs from file to file, so the header is parsed for every file |
| Cloud copy | Range requests answered with 206; with an `Origin` header `Access-Control-Allow-Origin: *`; OPTIONS preflight for `range` answered 200 |
| Header + 29 rows of 24 exposures from Python | 9.9 s sequential, 6.8 s with 8 in parallel; 6,785,280 bytes in 48 requests; 0 failed |
| Range pixels against cached cutouts | 11x11 box identical in 6 of 6 exposures |
| IRSA SIA | 9 of 12 queries answered "502 Proxy Error". The 3 that worked took 1.4 to 3.5 s and returned 641, 110,723 and 318,822 bytes. No CORS header on any answer |

**Vercel limits** (`logs/vercel_limits.log`): Hobby plan 300 s per function call
(line 7), 4.5 MB request or response body (line 16). The largest answer of the
function was 60 kB.

**Lookup function** (`site/api/lookup.js`; `logs/lookup_local.log`, `logs/lookup_live.log`)

- Resolves a name at SIMBAD, queries SIA for both collections and retries on 502
  within a 45 s budget. Only the exposure list passes through it, no image bytes.
- Local test: Epsilon Indi B 467 exposures (9.7 s), WISE 0855 258 (9.6 s),
  Wolf 359 291 (6.3 s), a position 333 (5.8 s); unknown name 404; bad input 400.
  The counts for Epsilon Indi B and WISE 0855 equal those of the pipeline.
- One collection needed 12 attempts locally, which was the limit at that time;
  the limit was raised. On the live site one call took 11.3 s with 13 attempts
  for each collection.
- The CDS fallback for SIMBAD is in the code but was never exercised: the
  Harvard mirror answered every time.

**Browser code against astropy** (`site/src/quicklook.ts`, `logs/test_wcs.log`,
reference values from `pipeline/wcs_reference.py`, 8 files, all 6 detectors, DR1 and QR3)

- Sky to pixel: largest difference 1.0e-6 px (200 points). Pixel to sky:
  2.4e-10 arcsec (56 points).
- Data offset equal in 8 of 8 files; 3x3 pixel values read with Range requests
  identical in 8 of 8.

**Live site, built-in browser at 900 px** (numbers read from the page, not logged)

| Opened | Listed | Read | Time, size |
|---|---|---|---|
| `?target=Wolf 359` | 291 exposures, 3 epochs | 18 | 2.6 s, 5.1 MB, 36 requests |
| `?target=eps Ind B` | 467, 4 epochs | 22 | 3.2 s, 6.1 MB, 44 requests |
| `?target=WISE J085510.83-071442.5` | 258, 3 epochs | 23, later 24 | 2.4 s and 3.4 s, 6.5 and 6.8 MB |
| `?ra=164.0924&dec=6.9952` | 291, 3 epochs | 18 | 4.5 s, 5.1 MB, 36 requests |

- No console error in any of these. The times are for reading the images only;
  the lookup before it takes several seconds more and was not timed in the browser.
- The unknown name "no such star xyz123", typed into the search box, gives the
  message "SIMBAD does not know this name…". The console shows the 404 of the
  function for it.
- WISE 0855 opens with detectors 5+6 because SIMBAD gives it type Y.
- At 390 px: the WISE 0855 quick look from the image down to the end of the page.
  The top of the page with the search box was not seen at this width.
- The browser is the Chromium of the SI tool, not a separately installed Chrome.
  The CORS preflight was not inspected in the browser's network panel; it was
  checked from Python (above) and by the absence of console errors.

**Rough motion (item 11)** (`site/scripts/test_motion.mjs`, `logs/test_motion.log`,
first run `logs/test_motion_run1.log`)

Method: windowed centroid of `stack_astrometry.py` on the browser stacks, looked
for within 1.5 px of the catalogue position (proper motion + parallax), bootstrap
over the exposures. Reference: the same method in the full pipeline on all
cached, masked exposures (`logs/stack_astrometry_eps-indi-b.log`, run for this
test; `logs/stack_astrometry_wise-0855.log`).

| | Epsilon Indi B (all detectors, 6 per epoch) | WISE 0855 (D5+6, 8 per epoch) |
|---|---|---|
| Epoch pairs | 6 | 3 |
| Within 2 combined errors of the full pipeline | 6 | 3 |
| Difference to the full pipeline | 0.06 to 0.54 arcsec | 0.03 to 1.29 arcsec |
| Quick-look error per component | 0.23 to 0.65 arcsec | 1.31 to 2.36 arcsec |
| Full-pipeline error per component | 0.06 to 0.09 arcsec | 0.48 to 0.85 arcsec |
| Within 2 quick-look errors of the catalogue prediction | 5 | 3 |

- The prediction computed in TypeScript (low-precision Sun formula) differs from
  the astropy-based one by at most 0.01 arcsec in the 9 pairs.
- First run: 7 of 9 pairs within 2 combined errors. The two that failed both
  involved the last Epsilon Indi B epoch, which had 4 instead of 6 exposures
  because two detectors have no exposure there. The selection now fills up from
  the other detectors. This was changed after seeing the result and tested on
  the same two targets, so it is not an independent confirmation. With 6
  exposures the error of that epoch grew only from 0.15 to 0.20 arcsec (north);
  what changed was the measured position (-0.97 to -0.72 arcsec from the
  prediction). Why 4 exposures gave a different position was not examined.
- Epsilon Indi B, epoch 3 to 4, north: still 2.2 quick-look errors from the
  catalogue prediction (-2.23 +- 0.38 against -1.39). The full pipeline shows
  the same sign (-1.69 +- 0.08).
- WISE 0855, epoch 2 to 3: 2.24 +- 3.03 arcsec, so the site prints "too slow to
  measure with this data". The target is not slow (prediction -4.49 arcsec
  east; full pipeline -3.48 +- 0.49). The wording was asked for; the note under
  the table says that it also covers a source that is too faint. Whether the
  line should read differently is a decision for the team.
- On the live site the tables of both targets show the numbers of
  `logs/test_motion.log` (6 and 3 rows compared by eye).
- The banner keeps the label "Quick look, unmasked, no measurement". Its second
  sentence now says that the rough motions are the only numbers taken from
  these images, because "nothing is measured" was no longer true.

**Not done or not tried in block B**

- FLAGS are not read (Rice-compressed table); nothing is masked in the quick look.
- No raw playback, no wavelength per exposure and no single-detector choice in
  the quick look (All, D1-3, D5+6 only).
- Not tried: positions without coverage, positions near a detector edge (the
  code leaves out exposures whose position is off the detector, but none
  occurred), crowded fields, a saturated star, a second browser, a phone.
- The detector buttons of the quick look (D1-3, D5+6) were not clicked on the
  live site.
- The local preview cannot run the function; the quick look was only seen live.

**Documents**: `README.md` (status, quick look, checks, limitations, tests) and
`SOURCES.md` (cloud copy, requests made by the site, Vercel limits) updated.
The "Use of SI" section was not touched.

**Tool incident**: while writing `site/src/quicklook.ts`, two writes reported
success but left a 0-byte file. After that every written source file was
checked on disk with a command before it was used.

Free disk: 8.3 GB at 22:21 (`logs/disk_free_block_b.log`). Between 20:58 and
21:09 the `dir` output in the terminal showed 10.55 to 10.57 GB (not logged).
The drop of about 2.2 GB did not happen in this folder: the files changed here
since 19:20 add up to 1.18 MB (`logs/disk_modified_block_b.log`); the folder
holds 16.4 GB, 16.1 GB of it in `cache/` (`logs/disk_usage_block_b.log`). The
cause of the change outside the folder was not identified.

## Status at 2026-11-14 20:20

Live site: https://blackhole-spherex.vercel.app (deployed by Vercel on every push to `main`).
Last pushed commit before this entry: `1dad231` (remote hash equal to local, checked
with `git ls-remote`).

### Block A: small fixes (commits `aa50678`, `1dad231`, pushed)

Changed:

- `README.md`: the term in "Use of SI" is now "Super Intelligence (SI)"; the draft
  line stays. The section is not to be edited again without text from the team.
  The License section says that `data/gaia/*.csv` is not covered by Apache-2.0.
- WISE 0855, short versus long wavelength: the Gaia star has its own off-white
  pointer and the label "Gaia neighbour, not the target"; the amber marker is
  labelled "target, catalogue position"; the explanation sits directly under the
  two panels and starts with "The source next to the amber marker in the
  short-wavelength stack is not the target." The star's grid position comes from
  `data/astrometry/wise-0855_neighbours.json` through `build_results.py`
  (`logs/build_results.log`, "neighbour:" line); only the WISE 0855
  `results.json` changed.
- Tables: an east / north pair stays on one line; tables and notes are as wide as
  the two panels. The motion arrow and its label are amber. Secondary text colour
  changed from `#9aa3b5` to `#bcc4d4` (the contrast ratio was not computed).
  "Pause" has its own group, "Playback".
- RW Aurigae warning: "In all 305 of these exposures the central 3×3 pixels still
  carry a value and are drawn as they are, but their brightness is not reliable."
- Build: type check clean, 20 modules (`logs/site_build.log`).

Looked at in a browser, no console errors:

- Local preview, 900 px: WISE 0855 (comparison panels, note, motion table),
  Epsilon Indi B (top of the page, arrow), RW Aurigae (lower part, warning).
- Live site, 390 px, whole page: Barnard's Star, Epsilon Indi B, WISE 0855.
  RW Aurigae down to the first lines of the warning; its last line was not
  scrolled to. No defect was found on these pages.
- Live site, 900 px, whole page: R Draconis.
- Not opened after these changes: R Draconis at 390 px; on the live site at
  900 px the lower part of the other four targets.

Seen and left as it is:

- In the third epoch the Gaia star is 4.3 arcsec (0.7 px) from the catalogue
  position, so its pointer ends inside the amber marker. That the bright source is
  not the target is then carried by the label and the note, not by the position.
- Two preview servers are running on this machine (ports 4173 and 4174,
  `logs/preview.log`).

## Status at 2026-11-14 19:05

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
  CC BY-NC 3.0 IGO (non-commercial), which is stated there. Team decision
  (block A): the files stay in the repository; the README License section says
  they are not covered by Apache-2.0.
- Still "not checked" in `SOURCES.md`: terms of GitHub, Vercel, Visual Studio Code
  and the SI tool; the DOI of the SPHEREx data set.

### Open

- Team: the "Use of SI" text is still a draft and waits for text from the team;
  the exact name and version of the SI tool are still missing in `SOURCES.md`.
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