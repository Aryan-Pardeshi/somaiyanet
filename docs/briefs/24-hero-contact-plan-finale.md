# Brief 24: replace the hero finale with an animated contact plan (our own idea)

File you may edit: `web/src/landing/hero/CinematicHero.tsx` only (you may add a new file
`web/src/landing/hero/ContactPlan.tsx` for the new component). Do not edit anything else.

## Why
The hero's last stage (`LineArtScene`: three line-art satellites with dashed beam cones over a
wireframe horizon) looks like a friend's project. Replace it with something only SomaiyaNet has:
the **contact plan** that our PostgreSQL function `cgr_routes()` (Contact Graph Routing, a recursive
CTE) routes over. Keep everything before it (the Earth, warp, satellite close-up stages and their
timing) unchanged.

## The new finale: `ContactPlan` (2D SVG overlay, not three.js)
Shown over progress ~0.66 -> 1 (it takes over the time window of the old `LineArtScene` and the
navy glow; the R3F Earth fades out as now). Pure black background with the existing navy glow.
White hairline art, royal blue `#3d5bff` for contact windows, red `#ff3b4f` only for the packet.
Geist Mono labels (small, uppercase allowed for lane labels), Geist Sans light for the caption.

Layout (SVG `viewBox="0 0 1200 600"`, `preserveAspectRatio="xMidYMid meet"`, centred, max width
~1100px, placed in the upper/middle area so it never overlaps the headline):
- A time axis along the bottom: ticks every "10 min" with mono labels `T+0`, `T+10`, ... `T+60`.
- Four horizontal lanes (thin white lines, 1px, 35% opacity), labelled on the left:
  `SS-1`, `SS-2`, `SS-3`, and `KJSIT MUMBAI` (the ground lane, drawn slightly thicker, with a tiny dish icon).
- Contact windows: rounded blue bars spanning a time range, drawn as a vertical "bridge" between
  two lanes (a thin vertical band from lane A to lane B, 30% blue fill, blue 1px border) with a
  tiny mono label of its link quality ("q 43"). About 7 windows, e.g.
  SS-1<->SS-2 at T+4..T+14, SS-2<->SS-3 at T+18..T+30, SS-1<->GROUND at T+52..T+58 (late, slow
  option), SS-3<->GROUND at T+34..T+42, SS-2<->GROUND at T+46..T+50, SS-1<->SS-2 again at
  T+40..T+48, SS-3<->SS-2 at T+50..T+55.
- The packet: a red dot (with a soft glow) that starts on lane SS-1 at T+0, travels right along
  the lane (store-and-forward: waiting = moving along its lane), jumps down/up through the first
  usable window to SS-2 (T+6), continues along SS-2, jumps to SS-3 in the SS-2<->SS-3 window
  (T+20), rides SS-3 and finally drops to KJSIT MUMBAI through the SS-3<->GROUND window (T+36).
  The travelled path is drawn behind it as a solid red-tinted white line (the chosen route);
  the late SS-1<->GROUND window stays dim with a tiny strike label "arrives T+52, slower".
- Scroll choreography (driven by the existing `progress` ref, no React re-render per frame;
  update SVG attributes / CSS variables in a rAF loop or through refs):
  0.66-0.72 lanes and axis draw in (stroke-dashoffset), 0.72-0.78 contact windows fade/scale in
  one by one, 0.78-0.92 the packet travels the route (position interpolated along a precomputed
  polyline by progress), 0.92-1 a caption + query appear under the plan:
  caption "Earliest arrival: T+36 via SS-2 and SS-3. Found by a recursive SQL query." and a
  one-line mono code chip `SELECT * FROM cgr_routes('SS-1', now(), 41216);` that types itself
  (reveal characters by progress).
- Responsive: on phones (< 768px) use a simplified version (3 lanes + ground, fewer windows,
  larger labels) or scale the SVG; no horizontal overflow.
- `prefers-reduced-motion`: render the final state statically.

Remove `LineArtScene` and its helpers (`DashedLine`, `SolidLine`, any now-unused imports or
materials) so there are no unused locals. Keep exporting `useEarthMaps`, `Earth`, `Atmosphere`
(used by `web/src/landing/Mission.tsx`).

## Headline fix
The headline block (`h1` "Satellites that / route themselves." + paragraph) must never clip or
wrap badly: container `max-w-[min(92vw,1100px)]`, each of the two headline lines kept on one line
on md+ (`whitespace-nowrap` per line span, with the clamp font size reduced so it fits:
`clamp(40px, 6.2vw, 104px)`). Fade the headline block out over progress 0.6 -> 0.68 so it never
sits on top of the contact plan, and fade it back in when scrolling back up (it is driven by
progress, so this is automatic).

Strict TypeScript, no `any`, no unused locals. No new npm packages. You cannot run shell commands:
only read and edit files. Do not run git or servers.
