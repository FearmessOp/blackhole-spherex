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

Live site: `https://blackhole-spherex.vercel.app`. Two pushes: `f7c8a9d` (redesign, `logs/commit_design.log`) and
`b1efa30` (language fix, `logs/commit_lang.log`).

| Run | Commit on the live site | Log | Images |
|---|---|---|---|
| live1 screenshots | `f7c8a9d` | `logs/design_shots_live1.log` | `cache/design/live1/` (104 files) |
| live1 links | `f7c8a9d` | `logs/design_links_live1.log` | none |
| live2 links | `b1efa30` | `logs/design_links_live2.log` | none |

### Screenshots (`logs/design_shots_live1.log`)

60 page states, as in round 1. No page overflow, no 4xx, no console error.

- **Quick look, a star that is not prepared (Ross 128).** It loads at 1400 px and 390 px in both languages:
  341 exposures listed in 3 epochs, 18 read in 2.4 s (5.1 MB in 36 requests).
  Page heights: 1447 px (1400 px), 2435 px (390 px, English), 2504 px (390 px, Turkish).
- **Guide.** Looked at by eye at 1400 px (steps 2 and 3) and at 390 px (steps 2 and 3, end). No defect seen.

### Targets and links (`pipeline/design_links.py`)

- **15 targets by `?target=`, two widths.** 28 of 30 loads print "ok" in both logs. The 2 CHECK lines are
  WISE 0855 at both widths with `views=4`. The script expects 2 image panels; WISE 0855 has 2 more in its
  short and long wavelength comparison. This is the criterion of the script, not a defect of the site.
- **Position link `?ra=164.0924&dec=6.9952`.** `state=shown`, 3 canvases, no overflow, no 4xx, no console error
  (both logs).
- **Language.** Default is English. `?lang=tr` gives Turkish and stays in the address when another card is chosen.
  A click on TR or EN is stored in localStorage.

### Defect found and fixed

- **A link without `lang`, opened after Turkish had been chosen, showed Turkish but kept the address without
  `lang=tr`** (`logs/design_links_live1.log`: the address stayed `?target=barnard`). Copying that address would
  have shared the English page.
  Fix in `site/src/i18n.ts`: when Turkish comes from localStorage, `lang=tr` is added to the address
  (`logs/build_design_9.log`). Checked locally (`logs/design_links_local1.log`) and on the live site
  (`logs/design_links_live2.log`: the address becomes `?target=barnard&lang=tr`; a click on EN removes it).

### Seen, not changed

- **Ross 128 quick look, rough motion table: the east component has the opposite sign to the catalogue
  prediction** (read from the live page, arcsec, east / north):

  | Epochs | Predicted | Measured |
  |---|---|---|
  | 1 to 2 | +0.87 / −0.95 | −1.68 ± 0.75 / −1.07 ± 0.43 |
  | 1 to 3 | +0.60 / −1.24 | −1.20 ± 0.79 / −1.57 ± 0.48 |
  | 2 to 3 | −0.26 / −0.29 | +0.47 ± 0.44 / −0.50 ± 0.39 |

  The north component agrees in sign in all three rows. The cause was not looked into; the measurement code was
  not touched in the design block. These numbers are from the page, not from a log in the repo.
- In the quick look at 1400 px the lower half of the column to the right of the image is empty.

### Not looked at by eye in round 2

The difference view, the "?" buttons other than the one on the stack panel, "How to read this page" at 390 px and
1400 px, the RW Aurigae and R Draconis pages, guide step 1 on the live site, and most of the 104 screenshots of
the live1 run. The live2 run made no screenshots; the pages of `b1efa30` were checked by script only.