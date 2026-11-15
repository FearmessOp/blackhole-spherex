# Design check after the redesign

Round 1 is the local preview (`npx vite preview`, port 4173). Round 2 is the live site; it is added below after the push.
Screenshots are in `cache/design/` (not in git). The defects of the old design are in `logs/design_before.md`.

## Round 1: local preview

| Run | Build | Log | Images |
|---|---|---|---|
| local1 | `logs/build_design_5.log` | `logs/design_shots_local1.log` | `cache/design/local1/` (104 files) |
| local2 | `logs/build_design_6.log` | `logs/design_shots_local2.log` | `cache/design/local2/` (104 files) |

Both runs cover 60 page states (15 pages, 1400 px and 390 px, English and Turkish).
In both logs: no page overflow, no 4xx, no console error.

Page heights (from the two logs; before: `logs/design_shots_before.log`):

| Page | Before | After |
|---|---|---|
| All pages, 1400 px | 3061 to 4056 px | home 1170, Epsilon Indi B tabs 1170 / 900 / 1805, WISE 0855 2051, guide steps 900 |
| All pages, 390 px | 5050 to 7014 px | home 1881, WISE 0855 3357, guide steps 844 to 1044 |

### Defects found by eye and fixed

1. **390 px, Measurement tab: the SIMBAD column was cut off at the right edge**
   (`cache/design/local1/eps_tab2_390_tr_full.png`). The overflow check did not catch it, because the table
   scrolled inside its section and the page itself did not overflow.
   Fix: on narrow screens the table is one block per row with one labelled line per method
   (`site/src/ResultsPanel.tsx`, `site/src/styles.css`). No number changed.
   Checked in `cache/design/local2/eps_tab2_390_en_full.png` and `eps_tab2_390_tr_full.png`; the desktop table
   (`eps_tab2_1400_en_top.png`) looks as before. The page is now 1872 px high instead of 1480 px.
2. **An open "?" explanation on an image panel pushed that image down, so the two images were no longer level**
   (seen in the browser at 900 px width).
   Fix: the explanation of an image panel opens over the top edge of the image (`site/src/styles.css`,
   `logs/build_design_7.log`). Checked in the browser at 900 px width only.
   Left as it is: while the explanation is open it covers the "N up, E left" label of that panel.

### Not testable in the local preview

- **Quick look.** `/api/lookup` runs only on Vercel, so the quick-look pages of both runs show
  "The lookup service did not answer". Quick look is checked in round 2.

### What was looked at by eye

- local1: home (1400 en, 1400 tr, 390 en), Epsilon Indi B Measurement (1400 en, 390 tr) and Validation (1400 tr),
  WISE 0855 full page (1400 en), LP 651-7 (1400 en), guide step 1 (1400 en, 390 en, 390 tr feedback),
  guide step 3 feedback (1400 tr), guide end (1400 en), quick look error (1400 en, 390 tr).
- local2: Epsilon Indi B Measurement (390 en, 390 tr, 1400 en).
- Browser, 900 px width: "How to read this page" in English and Turkish; the "?" of the stack panel.

Not looked at by eye in round 1: the other screenshots of the two runs (among them RW Aurigae, R Draconis,
guide step 2, the Images tab at 390 px below the first screen), the difference view, the "?" buttons other than
the one on the stack panel, and "How to read this page" at 390 px and 1400 px.

### Seen, not changed

- At 1400x900 the epoch line under the images is at the bottom edge of the first screen; the detail line under it
  needs scrolling.
- At 900 px width the top bar takes two lines and the fast-mover list takes its own row.

## Changes of content and placement (to disclose)

- Validation moved to its own tab. The English validation note now ends "see the fast movers below" instead of
  "see the targets above".
- The second line of the target cards (type, exposures, epochs) is shown only as a tooltip.
- The flicker note moved from the image view to the Measurement tab.
- The quick-look banner moves beside the image once the image is shown (same text).
- The "1 pixel = 6.15 arcsec" label in the header was removed. The scale is in "How to read this page" and on the
  30 arcsec scale bar.
- One table footnote stays English in Turkish mode: the reason why a field star was not fitted comes from the data
  file (`val.nf.row`).

## Contrast

`logs/design_contrast.log` (from `pipeline/design_contrast.py`, rerun after the last style change): 11 text and
background pairs, none below 4.5 : 1, lowest 6.84 : 1 (disabled buttons on a panel). Text over bright sky pixels is
not covered; it has a black outline.

## Round 2: live site

Not done yet. To be added after the push: 1400 px and 390 px in both languages, quick look for a star that is not
prepared, the three guide steps, all 15 targets, `?target=` and `?ra=&dec=` links.