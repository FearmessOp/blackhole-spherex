# Design: state before the design block

Live site at commit `2059803` (bundle `index-B6vxSKmh.js`), 15 November 2026, 04:22 local.
Screenshots: `cache/design/before/` (40 files, not in git), made by
`pipeline/design_shots.py before`; numbers below from `logs/design_shots_before.log`
and from `site/src/styles.css`.

Looked at by eye in this round: `home_1400_en_top`, `guide1a_1400_en_top`,
`guide3b_1400_en_top`, `home_390_en_top`, `guide1a_390_en_top`. Earlier this night
(full pages at 900 and 390 px): `cache/tour/eps-indi-b_390.png`,
`cache/tour/guide_step3_390.png`, `cache/tour/quick_wolf_900.png`. The other
screenshots of `cache/design/before/` were not opened.

No overflow, no 4xx and no console error on any of the 24 page states.

## Defects

### A. Page structure
1. First screen at 1400x900: no sentence that says what the tool is. The 15 target
   cards take about 330 px; the image panels start at y = 580, so only their upper
   half is on the first screen. The image is not the largest item.
2. Target selector: 10 fast-mover cards in two rows; the second row holds 3 cards and
   4 empty columns. "2MASS J02511490-0352459" wraps and makes its row taller.
3. At 390 px the first screen (844 px) is the search box and target cards only; the
   image starts below about 1000 px.
4. Both validation sections follow every target and every quick look. Page heights:
   3061 to 4056 px at 1400 px, 5050 to 7014 px at 390 px.
5. The stage is at most 1240 px wide: at 1400 px, 100 px on each side stay unused.
6. Quick look: the column next to the image holds two short paragraphs; most of it is
   empty (`cache/tour/quick_wolf_900.png`).
7. Flicker note sits between the images and the controls and pushes the controls down.

### B. Guided mode
8. Search box and all target cards stay visible above the step; the step starts at
   y = 450 (1400 px). At 390 px the step is not on the first screen at all.
9. The step image takes the left half; the right half of the row is empty. Instruction,
   feedback and buttons are above the image, not next to it.
10. The image is clickable but only the cursor (crosshair) and one grey line under the
    image say so.
11. Both validation sections are shown under the guide (page height 2697 to 2765 px).

### C. Typography and colour
12. Body text 15 px. Secondary text 12 px in: card meta, group headings, search label,
    star tables, motion-table labels.
13. Monospace is used for text that is not a number or a table: epoch caption, step
    counter, "1 pixel = 6.15 arcsec", quick-look progress line.
14. Contrast ratios were never computed (PROGRESS.md says so for `#bcc4d4`). The search
    placeholder is drawn at 75% opacity, disabled buttons at 45%.

### D. Spacing
15. Spacing values in `styles.css` do not come from one scale: 2, 4, 6, 8, 10, 12, 14,
    16, 18, 20, 24, 28, 36, 40 px are all used.

### E. Explanations and language
16. No explanation of the section headings for a visitor who does not know the terms
    (stack, epoch, detector, flicker).
17. English only.