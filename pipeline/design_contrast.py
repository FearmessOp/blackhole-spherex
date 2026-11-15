"""Contrast ratios (WCAG 2 formula) of the text / background colour pairs of the site.

The colours are read from the :root block of site/src/styles.css; nothing is typed here
except which pairs the style sheet uses. A pair below 4.5 : 1 is marked FAIL.
Text drawn on the sky images (compass, scale bar, labels) sits on changing pixels; it
has a black outline, so it is checked against black only, and this is said in the log.

Usage: .venv/Scripts/python.exe pipeline/design_contrast.py > logs/design_contrast.log 2>&1
"""
import re
import sys

CSS = "site/src/styles.css"
LIMIT = 4.5

# (text colour, background colour, where it is used)
PAIRS = [
    ("text", "bg", "body text, tables, guide text"),
    ("text", "panel", "buttons, cards, top bar title, warnings, flicker note, help text"),
    ("muted", "bg", "notes, details, captions, table headings, group headings, tagline on narrow pages"),
    ("muted", "panel", "tagline, guide-start subtitle, search placeholder, '?' button, group headings in controls"),
    ("dim", "bg", "disabled buttons inside the controls"),
    ("dim", "panel", "disabled buttons elsewhere"),
    ("accent", "bg", "selected buttons in controls, epoch caption, links, amber table cells, click badge"),
    ("accent", "panel", "selected buttons and tabs, guide-start title, quick-look banner title, numbers in the flicker note"),
    # --accent-soft is rgba(255, 176, 0, 0.1); the hex values are that colour blended over panel / bg
    ("accent", "#292c31", "selected buttons and tabs: accent-soft over panel"),
    ("accent", "#232422", "selected buttons in controls: accent-soft over bg"),
    ("text", "#16244a", "target card under the mouse (hover background)"),
    ("text", "#000000", "labels on the images (outlined in black)"),
    ("muted", "#000000", "compass and scale bar on the images (outlined in black)"),
    ("accent", "#000000", "marker and arrow labels on the images (outlined in black)")]

def channel(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def luminance(hexcol):
    h = hexcol.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

def ratio(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

css = open(CSS, encoding="utf-8").read()
root = re.search(r":root\s*\{(.*?)\}", css, re.S).group(1)
colours = dict(re.findall(r"--(\w+):\s*(#[0-9a-fA-F]{6})\b", root))
print(f"colours read from {CSS}: {colours}")
print(f"opacity rules in the style sheet: {re.findall(r'opacity:\s*[0-9.]+', css)}")
print(f"limit: {LIMIT} : 1")

fails = 0
for fg, bg, where in PAIRS:
    f = colours.get(fg, fg)
    b = colours.get(bg, bg)
    r = ratio(f, b)
    ok = r >= LIMIT
    fails += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {r:5.2f} : 1  {fg} {f} on {bg} {b}  ({where})")
print(f"pairs: {len(PAIRS)}, below {LIMIT}: {fails}")
print("not covered: text on the sky images over bright pixels (it has a black outline; "
      "the pixel values change from frame to frame)")
sys.exit(1 if fails else 0)