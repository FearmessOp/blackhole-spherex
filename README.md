# Blackhole 102 — SPHEREx motion viewer

Entry for the NASA Space Apps Challenge 2026, challenge "Planet X and SPHEREx".

A public web tool that shows SPHEREx images of a patch of sky in time order, so
that moving and variable objects are easy to spot.

**Status:** work in progress (hackathon weekend, 14–15 November 2026).
See [PROGRESS.md](PROGRESS.md) for what is done and verified so far.

## Live site

Not deployed yet.

## Test targets

Barnard's Star, Epsilon Indi B, WISE 0855-0714, RW Aurigae, R Draconis.

## Repository layout

| Path | Content |
|---|---|
| `pipeline/` | Python data pipeline (target resolution, archive query, cutout download, inspection, epoch stacking) |
| `data/` | Small derived inputs: resolved target list, raw archive query responses |
| `site/` | Vite + React + TypeScript site; reads static PNG + JSON from `site/public/data/` |
| `logs/` | Log files; every number reported by this project is traceable to one of them |
| `cache/` | Downloaded cutouts (not in git, re-creatable) |

## Running the pipeline

Requires [uv](https://docs.astral.sh/uv/) and Python 3.13.

```
uv venv .venv --python 3.13
uv pip install --python .venv/Scripts/python.exe astropy numpy scipy pyvo requests pillow

.venv/Scripts/python.exe pipeline/resolve_targets.py  > logs/resolve_targets.log 2>&1
.venv/Scripts/python.exe pipeline/sia_query.py        > logs/sia_query.log 2>&1
.venv/Scripts/python.exe pipeline/download_cutouts.py
.venv/Scripts/python.exe pipeline/stack_epochs.py barnard > logs/stack_barnard.log 2>&1
```

The download step is resumable: files already in `cache/` are skipped.
So far the stacking step has only been run for Barnard's Star.

## Running the site locally

Requires Node.js 22.

```
cd site
npm install
npm run build
npx vite preview
```

## Data and sources

All data, libraries and tools used are listed with their licenses in
[SOURCES.md](SOURCES.md).

## Use of SI

## License

Apache License 2.0, see [LICENSE](LICENSE).