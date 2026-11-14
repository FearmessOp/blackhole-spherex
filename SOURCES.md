# Sources

Everything this project uses: data, services, libraries and tools.
License entries for Python packages are copied from the package metadata
(`logs/licenses_python.log`). Entries marked "not yet verified" have not been
checked against the provider's own terms page yet and must be before submission.

## Data and services

| Source | Used for | Access | Terms / license |
|---|---|---|---|
| SPHEREx Level-2 spectral images, collections `spherex_dr1` and `spherex_qr3`, NASA/IPAC Infrared Science Archive (IRSA) | Image cutouts for all targets | IRSA SIA2 (`https://irsa.ipac.caltech.edu/SIA`), IRSA TAP (`https://irsa.ipac.caltech.edu/TAP/sync`), cutout service on the `access_url` returned by SIA | not yet verified |
| SIMBAD astronomical database (CDS, Strasbourg), queried through the Harvard mirror `https://simbad.harvard.edu/simbad/sim-script` | Target coordinates, proper motions, parallaxes (`data/targets.json`, `logs/resolve_targets.log`) | HTTP script interface | not yet verified |
| NASA Space Apps Challenge 2026 page "Planet X and SPHEREx" | Challenge requirements and resource list | Read in a browser | not applicable (not redistributed) |

Bibliographic references returned by SIMBAD for the values in `data/targets.json`
(bibcodes as given in `logs/resolve_targets.log`):
`2020yCat.1350....0G`, `2021ApJS..253....7K`, `2007A&A...474..653V`.

## Python packages (pipeline)

Versions from `logs/setup_env.log`, licenses from `logs/licenses_python.log`.

| Package | Version | License (package metadata) | Role |
|---|---|---|---|
| astropy | 8.0.2 | BSD-3-Clause | FITS, WCS, time |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | arrays |
| scipy | 1.18.1 | BSD (classifier "BSD License") | resampling, interpolation |
| pyvo | 1.10.0 | BSD-3-Clause | installed, not used yet |
| requests | 2.34.2 | Apache-2.0 | HTTP |
| pillow | 13.0.0 | MIT-CMU | PNG output |
| astropy-iers-data | 0.2026.11.9.0.35.9 | BSD-3-Clause | dependency of astropy |
| pyerfa | 2.0.1.5 | BSD 3-Clause | dependency of astropy |
| PyYAML | 6.0.3 | MIT | dependency of astropy |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | dependency of astropy |
| certifi | 2026.10.23 | MPL-2.0 | dependency of requests |
| charset-normalizer | 3.5.2 | MIT | dependency of requests |
| idna | 3.20 | BSD-3-Clause | dependency of requests |
| urllib3 | 2.8.0 | MIT | dependency of requests |

## npm packages (site)

Versions and licenses from the installed packages' own `package.json`
(`logs/licenses_node.log`). Transitive dependencies are pinned in
`site/package-lock.json` and have not been checked one by one yet.

| Package | Version | License (package.json) | Role |
|---|---|---|---|
| react | 19.3.1 | MIT | user interface |
| react-dom | 19.3.1 | MIT | user interface |
| vite | 8.3.8 | MIT | build tool (development only) |
| @vitejs/plugin-react | 6.3.0 | MIT | build tool (development only) |
| typescript | 7.0.2 | Apache-2.0 | type checking (development only) |
| @types/react | 19.3.0 | MIT | type definitions (development only) |
| @types/react-dom | 19.3.0 | MIT | type definitions (development only) |

## Images

The PNG files under `site/public/data/` are produced by
`pipeline/stack_epochs.py` from the SPHEREx cutouts listed above. The site
contains no other images, logos or icons.

## Tools

| Tool | Version | Used for | License |
|---|---|---|---|
| Python (CPython) | 3.13.2 | pipeline runtime | not yet verified |
| uv | 0.12.5 | virtual environment and package install | not yet verified |
| git | 2.43.0 | version control | not yet verified |
| curl | system version | fetching the license text, TAP query | not yet verified |
| Node.js | v22.23.2 | site build | not yet verified |
| npm | 11.4.2 | site package install | not yet verified |

## License text

`LICENSE` is the unmodified Apache License 2.0 text downloaded from
`https://www.apache.org/licenses/LICENSE-2.0.txt` (`logs/license_fetch.log`).