# Brief 14b: redraw the "Life of a packet" line illustrations

File to edit: `web/src/landing/PacketStepper.tsx` only (you may add keyframes to
`web/src/index.css` if needed, appended at the end; do not change existing rules).

## Context
Landing page, pure black (#000), exosat.com-like style: thin white line art, royal blue
`#3d5bff` accent for the data path, and the red packet dot `#ff3b4f` is the ONLY red.
The `Art` component draws one SVG per step (viewBox 0 0 200 200) shown in a large 420px
square box (size "lg", animated) and in 5 small thumbnails (size "sm", static).

## Problems (user says they "don't look good at all")
- DELIVERED is broken: a lone rectangle "satellite", blue lines converging at a random
  point, a dish arc and a vertical line that are not connected, Earth curves floating.
- CAPTURED: a half-drawn rectangle with random lines; does not read as "satellite takes an
  SSTV image of Earth". Lots of empty space; art is small inside the box.
- DECIDED: plain circles; reads as a generic tree, no meaning.
- RELAYED: satellites are crude boxes.
- Draw-in animation bug: elements use `pathLength={1}` + `.draw-in` (stroke-dasharray:1)
  together with `vectorEffect="non-scaling-stroke"`. In Chrome non-scaling-stroke makes the
  dash pattern use screen units, so pathLength normalisation breaks and strokes can stay
  partially drawn. Remove `vectorEffect` wherever draw-in is used (use a plain strokeWidth;
  for "sm" just use a larger strokeWidth so thumbnails stay legible).

## Required design (all five, one consistent illustration language)
Shared reusable SVG pieces (write small components inside the file):
- `Sat`: a small classic satellite icon — square bus with an inner detail line, two solar
  wings (each a rectangle with 3 vertical cell dividers, joined to the bus by a short
  boom), and a tiny antenna. Props: x, y, scale, stroke colour.
- `Earth limb`: one large arc near the bottom (e.g. `M-10 178 Q100 128 210 178`) plus a
  fainter second arc 10px lower (atmosphere), spanning the full width.
- `Dish`: ground station — parabolic bowl (path), feed arm + feed point, mast, and a base
  that sits ON the Earth limb.
Composition must fill the 200×200 box (use ~85% of it), be balanced, and every line
must connect to something (no floating fragments).

1. CAPTURED: `Sat` top-left; a dashed blue field-of-view cone from the sat down to the
   Earth limb; on the right an "SSTV frame" — a 4:3 rectangle whose inside is filled by
   horizontal scan lines that draw in top-to-bottom (staggered), one of them blue; small
   mono text `SSTV · 320×256` under the frame (font-family monospace, font-size 7, fill
   `#8b96b0`). A static red packet dot sits at the sat.
2. DECIDED: decision tree with 7 nodes as small rounded rectangles (not circles) each
   with a tiny mono label: root `battery_v`, then `link_score`, `contact_s`, leaves
   `HOLD`, `TTC_VOICE`, `RELAY_VIA_ISL`, `FULL`. The chosen path is blue; a red dot travels
   the blue path root to leaf (animateMotion, lg only), and the chosen leaf has a blue
   outline + `chosen` label beneath it.
3. RELAYED: three `Sat`s across the top in a gentle arc; dashed links between them; the
   last one beams down to a `Dish` on the Earth limb on the right; red dot animateMotion
   along sat1, sat2, sat3, dish (lg only), static at sat2 in thumbnails.
4. DELIVERED: one `Sat` upper-left; a downlink beam = two thin white lines forming a
   narrow cone to the `Dish` feed point plus a dashed blue centre line; `Dish` standing
   on the Earth limb lower-right; red dot moves down the centre line (lg only); 3 short
   arcs ("signal received") next to the dish.
5. RECORDED: a table: outer rect, header row with mono text `op`, `table`, `changed_at`,
   then 4 rows with mono text e.g. `INSERT packet 12:04:31`, `UPDATE satellite 12:04:32`,
   `INSERT routing_decision 12:04:32`, `INSERT telecommand 12:04:35`; first row text blue;
   rows fade in staggered (`row-in`, lg only). Keep text ≤ font-size 7.5 so it fits.

Strokes: white `#ffffff` when active, `rgba(255,255,255,0.45)` in inactive thumbnails;
strokeWidth 1.3 for lg and 2.4 for sm (text can be hidden in sm if it gets illegible).
Respect `prefers-reduced-motion` (existing CSS override already disables .draw-in/.row-in;
animateMotion should not render when `window.matchMedia('(prefers-reduced-motion: reduce)')`
matches — show the dot static instead).

Do not change STEPS text, the pinned ScrollTrigger logic or the page layout, except you
may reduce the box inner padding from `inset-8` to `inset-6`.

## Rules
- Do NOT start dev servers or any long-running process. Do NOT run git commit.
- Verify with: `npm --prefix web run build` (must pass type-check and build).
