# Brief 26a: hero (SpaceX x Apple restyle)

First read `docs/briefs/26-common.md`, then `docs/design/DESIGN.md` and `web/src/styles/sx.css`.

Files you may edit (only these):
- `web/src/landing/hero/CinematicHero.tsx`
- `web/src/landing/hero/RouteDiagram.tsx`
- `web/src/landing/hero/CursorReadout.tsx`

## CinematicHero.tsx
- Keep the 3D Earth, warp and satellite stages and all timing exactly as they are.
- Headline block (bottom-left): make it SpaceX. `h1` uses `.sx-display` (uppercase DIN, bold,
  +0.02em tracking, line-height 0.95); keep the two lines "Satellites that" / "route themselves."
  each on one line on md+. The paragraph under it uses `.sx-lead`. Add one ghost pill CTA under the
  paragraph: `<Link to="/console" className="sx-btn mt-8 pointer-events-auto">Take the console</Link>`
  (react-router `Link`; the headline container is `pointer-events-none`, so the CTA needs
  `pointer-events-auto`). It must fade with the headline exactly like the text does.
- Any loading indicator: a thin white line, no pulse glow.
- Remove navy radial glows / tinted gradient overlays behind stages (pure black). If a dark
  gradient exists only to keep text legible over the Earth, keep it but make it neutral black.

## RouteDiagram.tsx (the hero finale; the user's main complaint)
The satellite nodes currently are big: a white core + a ring + a blue glow circle (r 22), with
boxed state chips ("healthy", "low battery", "safe mode") and red/blue glowing links. Make it
minimal and SpaceX-like:
- Satellite node = one solid white circle, r 3.5 (in the 720-wide viewBox). No ring, no glow,
  no halo circle, no blue fill. Optional: a hairline white ring r 9 at 20% opacity ONLY while the
  packet is waiting on that node (it replaces the countdown ring; the countdown can be this thin
  ring's stroke-dashoffset, 1px, white at 60%).
- Label under each node: "SS-1" etc. in DIN caps (`font-family: var(--font-display)`, 11-12px,
  +0.1em tracking, white 75%). Status under the label as plain text with a 5px dot (healthy: green
  `#30d158`, low battery / safe mode: orange `#ff9f0a`), words in white 55%, 11px, no box or border.
- Links: idle = 1px white at 18%, dashed 2 4; live = 1px solid white at 70%; quality label "q 91"
  tiny DIN caps white 50%. No blue anywhere.
- The packet: solid `#ff453a` dot r 3.5, no glow; its trail and the completed-route line are 1.5px
  `#ff453a` solid, no glow filter. Nothing else in the diagram is red.
- Earth limb: one thin white arc (1px, 30%); remove the navy radial gradient fill, atmospheric glow
  and longitude curves (or keep longitude curves at 6% white if they help). Ground station: a small
  white dish glyph or a 3px white square + label "KJSIT MUMBAI" in DIN caps.
- Mission clock at top: `.sx-num` style DIN figures, white; progress bar = 1px white at 15% track,
  white fill. Remove "PACKET #412 · 41 KB" style glowing badges; if kept, plain `.sx-eyebrow` text.
- route_hop table card: Apple inset-grouped look: `--sx-surface` background (`#111113`),
  radius 14px, no border, no blur, no glow. Title `route_hop` in mono 13px white plus a plain
  `.sx-eyebrow` "PostgreSQL" (no chip). Header row in `.sx-eyebrow` style; data rows in mono 12px
  white 85%, hairline (`rgba(255,255,255,0.08)`) between rows. The "newest row" highlight is a
  brief `#1c1c1e` background, not blue.
- Query chip: `.sx-code` look (mono 13px, `#0a0a0a`, radius 10). Caption: system font 15px white
  62%, sentence case.
- Remove every `filter`, `feGaussianBlur`, glow circle, blue gradient and `drop-shadow`.
- Keep the whole timeline, the progress mapping, reverse scrubbing, the rAF loop, reduced-motion and
  mobile behaviour exactly as is. Delete any SVG defs that become unused.

## CursorReadout.tsx
Keep the behaviour. Restyle to minimal: the ring is a 1px white circle at 35%, the dot a 3px solid
white dot with no shadow/glow, the LAT/LON labels in DIN caps white 45% and values in `.sx-num`
white 80%, 10-11px. No blue.
