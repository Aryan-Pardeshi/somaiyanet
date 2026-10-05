# Brief 26c: ground network, database rows and footer (SpaceX x Apple restyle)

First read `docs/briefs/26-common.md`, then `docs/design/DESIGN.md` and `web/src/styles/sx.css`.

Files you may edit (only these):
- `web/src/landing/GroundNetwork.tsx`
- `web/src/landing/DatabaseRows.tsx`
- `web/src/landing/Footer.tsx`

## GroundNetwork.tsx (map of the 6 ground stations)
Keep the map image, the station data, pass counts and the phone list. Restyle:
- Section: `.sx-section`, `.sx-eyebrow` + `.sx-h2` title + `.sx-lead`, left-aligned in a centred
  1200px column.
- Station markers: minimal. A solid white dot (r ~2.5-3.5 scaled by passes is fine) with NO bloom,
  no glow, no radial gradient. Optionally one hairline ring (1px white 25%) whose radius encodes
  passes per day. KJSIT Mumbai (ours) is the only one with a `#ff453a` dot.
- Callouts: station name in DIN caps 12px white, "22 passes a day" in system font 13px white 60%.
  Thin 1px white 30% leader lines. No boxes with borders or blur.
- Map image: keep it, but grade it neutral (e.g. `filter: grayscale(1) brightness(0.7)` or lower
  opacity) so it reads black and white like SpaceX photography. Remove blue tints.
- Phone list: `.sx-group` + `.sx-row` (name left, passes right `.sx-num`).

## DatabaseRows.tsx
SpaceX/Apple: `.sx-h2` + `.sx-lead`; any table or list of rows becomes an Apple inset-grouped
list (`.sx-group`, `.sx-row`), mono only for table/column names and values that are SQL. No blue,
no glow, no bordered cards. Any CTA is one `.sx-btn`.

## Footer.tsx (make it SpaceX-short)
SpaceX footer: pure black, compact (about 240-320px tall on desktop), `--sx-hairline` top line.
- Remove the navy nebula clouds (the drifting blurred gradients) and the shooting stars. Keep a
  quiet star field (the canvas twinkling stars) but make it subtle: small white points, low
  opacity, slow twinkle, no colour, and stop animating when reduced motion is on. Remove the
  satellite-pass arc with the blinking packet unless it can be a single 1px white 15% arc with a
  small `#ff453a` dot and no glow; prefer removing it.
- Content: logo (`<Brand />`) on the left; link columns "Mission" and "Database labs" in DIN caps
  `.sx-eyebrow` headings with links in system font 14px white 70% (white on hover, no underline
  animation gimmick); the live UTC clock as `.sx-num` 12px white 50%; bottom row in `.sx-caption`
  with the credits line to lakshyamody/dbmsproj (keep the link) and the year.
- Keep all existing link targets.
- Remove the now-unused CSS class names from the JSX (do not edit index.css; leftover keyframes
  there are fine).
