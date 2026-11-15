# Submission draft

Draft for the NASA Space Apps Challenge 2026 project page. Every number below is
taken from a log file in `logs/`, named in brackets. Fields the team has to fill
in are marked **TO DO**.

## Project name

Blackhole 102 — SPHEREx motion viewer

## Challenge

Planet X and SPHEREx

## Summary (about 150 words)

A public web tool that blinks SPHEREx images of a patch of sky in time order so
that objects moving against the stars can be seen and measured. For each
prepared target it shows one stacked image per observing epoch next to the raw
exposures, with the catalogue position as an overlay, a difference image as a
hint, and a guided mode that walks a new visitor through three real moving
objects. For any other star name or position, the browser reads a few image
rows straight from the public cloud copy of the SPHEREx archive and builds a
quick look. Positions are aligned to Gaia DR3 field stars exposure by exposure
and fitted for proper motion and parallax. The fit was tested on 91 Gaia field
stars and on 10 fast-moving stars with known motion: for 8 of the 9 stars that
had enough clean exposures, both proper-motion components of the ePSF fit agree
with SIMBAD within 2 statistical errors. The idea of blinking survey epochs was inspired
by WiseView.

## Live site and code

- Site: https://blackhole-spherex.vercel.app
- Code: https://github.com/FearmessOp/blackhole-spherex (Apache-2.0; Gaia rows in
  `data/gaia/` under CC BY-NC 3.0 IGO)

## How it works

1. **Targets.** Positions, proper motions and parallaxes from SIMBAD
   (`logs/resolve_targets.log`). Five test targets (Barnard's Star,
   Epsilon Indi B, WISE 0855-0714, RW Aurigae, R Draconis) and ten fast movers
   chosen for a test of the fit.
2. **Data.** SPHEREx Level-2 spectral images from IRSA, collections
   `spherex_dr1` and `spherex_qr3`: 1973 exposures for the five test targets
   (`logs/sia_query.log`) and 3804 cutouts of 0.2 deg for the ten fast movers
   (`logs/download_fast.log`, `logs/download_fast_retry.log`).
3. **Stacks.** Exposures more than 30 days apart start a new epoch. Each epoch is
   resampled onto one fixed north-up grid of 6.15 arcsec per pixel and combined
   with a clipped mean, using the FLAGS image to mask bad pixels. The grid does
   not follow the target, so a moving target changes pixel when the epochs are
   blinked.
4. **Positions.** Target and Gaia DR3 field stars are measured in every exposure
   with two methods (windowed centroid, ePSF fit). Each exposure is aligned with
   the median offset of the field stars, then a 5-parameter fit (position,
   proper motion, parallax) is made; errors are bootstrap over exposures.
5. **Difference image.** Last epoch minus first epoch. A moving target shows a
   positive and a negative lobe; it is shown as a hint only where both lobes pass
   three fixed criteria against field stars and the rest of the field
   (`logs/diff_image_eps-indi-b.log`, `logs/diff_image_wise-0855.log`).
6. **Find the mover.** A guided mode with three steps: a saturated bright star
   (Barnard's Star), a moving brown dwarf with the difference hint
   (Epsilon Indi B), and a cold brown dwarf that is only seen at long wavelength
   (WISE 0855-0714).
7. **Quick look.** A small function on Vercel (`site/api/lookup.js`) resolves the
   name at SIMBAD and gets the exposure list from IRSA. The browser then reads
   the header and 29 image rows of 6 to 8 exposures per epoch with HTTP Range
   requests from the cloud copy, projects them with its own TAN-SIP code and
   stacks them. No image bytes pass through the function.

## What was measured

**Epsilon Indi B**, 4 epochs, aligned to field stars (`logs/fit_motion_eps-indi-b_aligned.log`):

| | Windowed centroid | ePSF fit | SIMBAD |
|---|---|---|---|
| Proper motion east (mas/yr) | 3966.7 ± 29.1 | 3939.6 ± 24.6 | 3982.0 |
| Proper motion north (mas/yr) | −2462.6 ± 30.7 | −2440.7 ± 20.8 | −2466.8 |
| Parallax (mas) | 329.1 ± 16.3 | 300.4 ± 14.8 | 270.7 |

The parallax is 11% (ePSF) and 22% (centroid) above SIMBAD.

**WISE 0855-0714**, motion between epoch stacks of detectors 5+6, with the
nearby Gaia star modelled: epoch 1 → 3 −7.97 ± 0.68 / +1.08 ± 0.55 arcsec
(east / north) against a prediction of −8.01 / +0.65
(`logs/neighbour_test_wise-0855.log`).

**Control test on 91 Gaia DR3 field stars** in the five fields, ePSF fit
(`logs/validation_field_stars.log`): measured minus Gaia within 2 errors for
85 (proper motion east), 84 (north) and 85 (parallax) of 91 stars, all three
for 75; 86.9 and 79.1 expected for Gaussian errors of the right size. Without
the field-star alignment the median parallax difference is −54.0 mas and 17 of
91 stars are within 2 errors.

**Ten fast movers** (`logs/fast_movers_table.log`). A target is judged if it
has at least 30 usable exposures in at least 3 epochs of at least 5.

| | Judged | pm east within 2 errors | pm north | both | parallax |
|---|---|---|---|---|---|
| ePSF fit | 9 of 10 | 8 | 9 | 8 | 9 |
| Windowed centroid | 9 of 10 | 8 | 8 | 7 | 7 |

- Outside 2 errors (ePSF): LAWD 37 east, +2724.7 ± 23.2 against +2661.6 mas/yr.
- Not judged: omi02 Eri B (8 of 432 exposures usable; the core is saturated in
  399 exposures, `logs/fast_movers_table.log`).

## Limits

- Errors are statistical only (bootstrap over exposures).
- The selection rule for the fast movers is the rule of the field-star test, but
  it was applied to the fast-mover table after the omi02 Eri B result had been
  seen.
- Three of the five test targets (Barnard's Star, RW Aurigae, R Draconis) are
  saturated in most exposures; no motion is shown for them
  (`logs/saturation_check.log`).
- With 3 epochs, a parallax cannot be checked by leaving one epoch out.
- The quick look is unmasked and uses 6 to 8 exposures per epoch; its rough
  motions are not aligned to field stars. For stars brighter than K = 8.0 it
  gives no motion ("probably saturated"); the limit rests on the prepared
  targets (`logs/k_saturation.log`) and was not checked on Ross 128's flags.
- IRSA SIA answered 9 of 12 test queries with "502 Proxy Error"
  (`logs/sia_probe.log`); the quick look can fail when this happens.
  On 15 November 2026 the IRSA query service answered HTTP 502 from at least 12:13 (UTC+3)
  (`logs/irsa_probe_fix4.log`: HTTP 502 at 14:15:51); see Known limitations in the README.
- No spectrum on click and no automatic search for unknown movers.

## Tools

Python 3.13 with astropy, numpy, scipy, requests and pillow (pipeline); React,
Vite and TypeScript (site); Vercel (hosting and one function); git and GitHub.
Versions and licences: `SOURCES.md`.

## NASA data

- SPHEREx Level-2 spectral images, NASA/IPAC Infrared Science Archive (IRSA):
  SIA service `https://irsa.ipac.caltech.edu/SIA`, TAP service
  `https://irsa.ipac.caltech.edu/TAP/sync`
- Cloud copy of the same files: `https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/`

## Other data and sources

- SIMBAD (CDS, Strasbourg), through `https://simbad.harvard.edu/simbad/sim-script`
- Gaia DR3 (ESA/Gaia/DPAC), `https://gea.esac.esa.int/tap-server/tap/sync`
- Inspiration: WiseView, a blink tool for WISE images.
- Acknowledgements and licences: `SOURCES.md`.

## Use of SI

**TO DO (team):** left empty on purpose.