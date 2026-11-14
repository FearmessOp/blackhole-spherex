# Sources

Everything this project uses: data, services, libraries and tools.
Terms and licences were read from the providers' own pages on 14 November 2026;
the lines they were taken from are in `logs/check_terms.log`. Entries marked
"not checked" have not been read.

## Data and services

| Source | Used for | Access | Terms / licence (as read in `logs/check_terms.log`) |
|---|---|---|---|
| SPHEREx Level-2 spectral images, collections `spherex_dr1` and `spherex_qr3`, NASA/IPAC Infrared Science Archive (IRSA) | Image cutouts for all targets; every PNG on the site is made from them | IRSA SIA2 (`https://irsa.ipac.caltech.edu/SIA`), IRSA TAP (`https://irsa.ipac.caltech.edu/TAP/sync`), cutout service on the `access_url` returned by SIA; no login | IRSA terms of use: "Most data served by IRSA is public, with no usage restrictions." The page does not name SPHEREx; the cutouts were served without login. Acknowledgements requested, see below |
| SIMBAD astronomical database (CDS, Strasbourg), queried through the Harvard mirror `https://simbad.harvard.edu/simbad/sim-script` | Target coordinates, proper motions, parallaxes, spectral types (`data/targets.json`, `logs/resolve_targets.log`) | HTTP script interface | "Use of SIMBAD service is free without any registration under ODbL licence." Citation of the original papers requested, see below |
| Gaia DR3 source catalogue (`gaiadr3.gaia_source`), ESA Gaia archive TAP (`https://gea.esac.esa.int/tap-server/tap/sync`) | Reference stars: positions, proper motions, parallaxes, magnitudes (`data/gaia/*.csv`, `logs/gaia_field.log`, `logs/gaia_field_wide.log`) | TAP synchronous query | "Gaia data are distributed under the CC BY-NC 3.0 IGO license"; "open and free to use, provided credit is given to 'ESA/Gaia/DPAC'" |
| NASA Space Apps Challenge 2026 page "Planet X and SPHEREx" | Challenge requirements and resource list | Read in a browser | not applicable (not redistributed) |

### Files in this repository that carry third-party data

The Apache-2.0 licence of this repository covers the code and the text written
for it. It does not replace the terms of the data below.

| Files | Content | Terms |
|---|---|---|
| `data/gaia/*.csv` (10 files) | Rows of the Gaia DR3 source catalogue | CC BY-NC 3.0 IGO, credit ESA/Gaia/DPAC (non-commercial) |
| `data/targets.json` | Values returned by SIMBAD for the five targets | ODbL |
| `data/astrometry/*_neighbours.json`, `data/flicker/*.json`, `site/public/data/*/results.json` | Measurements of this project; they also contain Gaia DR3 source identifiers and G magnitudes of the stars used | Gaia terms for those values |
| `site/public/data/*/*.png`, `raw.json`, `meta.json` | Images and metadata derived from SPHEREx Level-2 cutouts | IRSA public data, see above |

### Acknowledgements requested by the providers

SPHEREx (IRSA SPHEREx mission page):

> This publication makes use of data products from the Spectro-Photometer for the
> History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which
> is a joint project of the Jet Propulsion Laboratory and the California Institute
> of Technology, and is funded by the National Aeronautics and Space Administration.

The same page names the canonical papers as "Mission: Bock et al (2026)" and
"Pipeline: Akeson et al (2026)". The DOI of the data set was not looked up.

IRSA:

> This research has made use of the NASA/IPAC Infrared Science Archive, which is
> funded by the National Aeronautics and Space Administration and operated by the
> California Institute of Technology.

SIMBAD:

> This research has made use of the SIMBAD database, operated at CDS, Strasbourg,
> France.

Reference given on the SIMBAD page: 2000, A&AS, 143, 9, "The SIMBAD astronomical
database", Wenger et al.

Gaia DR3:

> This work has made use of data from the European Space Agency (ESA) mission Gaia
> (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and
> Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium).
> Funding for the DPAC has been provided by national institutions, in particular
> the institutions participating in the Gaia Multilateral Agreement.

The Gaia documentation asks to cite the mission paper (Gaia Collaboration et al.
2016) and the DR3 summary paper (Gaia Collaboration et al. 2023).

Bibliographic references returned by SIMBAD for the values in `data/targets.json`
(bibcodes as given in `logs/resolve_targets.log`):
`2020yCat.1350....0G`, `2021ApJS..253....7K`, `2007A&A...474..653V`.

## Python packages (pipeline)

Versions from `logs/setup_env.log`, licences from the package metadata
(`logs/licenses_python.log`). Which script imports which package:
`logs/pipeline_inventory.log`.

| Package | Version | Licence (package metadata) | Role |
|---|---|---|---|
| astropy | 8.0.2 | BSD-3-Clause | FITS, WCS, time, Earth position for the parallax |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | arrays |
| scipy | 1.18.1 | BSD (classifier "BSD License") | resampling, interpolation, least-squares fits |
| requests | 2.34.2 | Apache-2.0 | HTTP |
| pillow | 13.0.0 | MIT-CMU | PNG output |
| pyvo | 1.10.0 | BSD-3-Clause | installed, not imported by any script |
| astropy-iers-data | 0.2026.11.9.0.35.9 | BSD-3-Clause | dependency of astropy |
| pyerfa | 2.0.1.5 | BSD 3-Clause | dependency of astropy |
| PyYAML | 6.0.3 | MIT | dependency of astropy |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | dependency of astropy |
| certifi | 2026.10.23 | MPL-2.0 | dependency of requests |
| charset-normalizer | 3.5.2 | MIT | dependency of requests |
| idna | 3.20 | BSD-3-Clause | dependency of requests |
| urllib3 | 2.8.0 | MIT | dependency of requests |

## npm packages (site)

Direct dependencies: versions and licences from the installed packages' own
`package.json` (`logs/licenses_node.log`).

| Package | Version | Licence (package.json) | Role |
|---|---|---|---|
| react | 19.3.1 | MIT | user interface |
| react-dom | 19.3.1 | MIT | user interface |
| vite | 8.3.8 | MIT | build tool (development only) |
| @vitejs/plugin-react | 6.3.0 | MIT | build tool (development only) |
| typescript | 7.0.2 | Apache-2.0 | type checking (development only) |
| @types/react | 19.3.0 | MIT | type definitions (development only) |
| @types/react-dom | 19.3.0 | MIT | type definitions (development only) |

All packages pinned in `site/package-lock.json`, licence field of the lock file
(`logs/npm_licenses.log`): 75 packages, every one with a licence field.

| Group | Packages | Licences |
|---|---|---|
| Not development-only (part of the site bundle) | 3: react, react-dom, scheduler | MIT (3) |
| Development-only (build tools, not shipped) | 72 | MIT (35), Apache-2.0 (22), MPL-2.0 (12), ISC (1), BSD-3-Clause (1), 0BSD (1) |

## Images and fonts

The PNG files under `site/public/data/` are produced by
`pipeline/stack_epochs.py` from the SPHEREx cutouts listed above. The site
contains no other images, logos or icons, loads no web fonts (system fonts only)
and requests nothing from other hosts (`logs/site_assets.log`).

## Tools

Versions from `logs/setup_env.log`, `logs/sources_check2.log` and
`logs/check_terms.log`; licences from `logs/check_terms.log`.

| Tool | Version | Used for | Licence |
|---|---|---|---|
| Python (CPython) | 3.13.2 | pipeline runtime | Python Software Foundation License Version 2 |
| uv | 0.12.5 (recorded in `.venv/pyvenv.cfg`) | virtual environment and package install | the uv repository carries `LICENSE-MIT` and `LICENSE-APACHE` (Apache License 2.0) |
| git (Git for Windows) | 2.49.0.windows.1 | version control | GNU GPL version 2 |
| curl | 8.21.0 | fetching the licence text, TAP query | curl licence (MIT/X-style permission notice) |
| Node.js | v22.23.2 | site build | Node.js licence file; it begins with an MIT-style permission notice, the rest of the file was not read |
| npm | 11.4.2 | site package install | Artistic License 2.0 |
| Visual Studio Code | not recorded | editor | not checked |
| SI coding assistant running in Visual Studio Code (it presents itself as "Roo"; model id shown by the tool: `anthropic/claude-fable-5.2`; exact product name and version to be confirmed by the team), including its built-in browser | not recorded | writing the code and documents, running the pipeline, looking at the local preview; see "Use of SI" in `README.md` | not checked |

## Hosting

| Service | Used for | Terms |
|---|---|---|
| GitHub (`https://github.com/FearmessOp/blackhole-spherex`) | public source repository | not checked |
| Vercel (`https://blackhole-spherex.vercel.app`) | static hosting of `site/`, deployed on every push to `main` | not checked |

## Licence text

`LICENSE` is the unmodified Apache License 2.0 text downloaded from
`https://www.apache.org/licenses/LICENSE-2.0.txt` (`logs/license_fetch.log`).