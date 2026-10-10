# Brief 31c: match the reference's design language exactly

The owner looked at the plan and said: follow the design language of `31-reference.webp`, "same
thing". This overrides the colour and type rules in `31-common.md` and `docs/design/DESIGN.md`
for the landing page only (the console keeps its own system).

## Tokens (put them on `.lx-root`, the landing's root element, in `landing.css`)
- `--lx-space: #05080f`: page background (deep navy-black, like the reference), also the 3D
  clear colour.
- `--lx-accent: #9be15d`: lime green. Replaces red everywhere on the landing: the orbit arc, the
  downlink beam, the hero sub line, the small section labels, the active nav item.
- `--lx-text: #ffffff`, `--lx-text-2: rgba(226, 232, 240, 0.72)`, `--lx-line: rgba(255, 255, 255, 0.16)`.

## Type
- Headlines: Barlow Condensed 300, Title Case (as now).
- Body, sub line, buttons: Lexend (`@fontsource/lexend` 300/400/600, installed).
- Small labels (nav, rail, section labels): Barlow Condensed 500, 11 to 12 px, uppercase,
  letter-spacing 0.2em.

## Pieces, as in the reference
- Header: brand left, nav centred (uppercase tracked labels, active one lime), "Open Console" as a
  ghost pill right (1 px white border, Lexend 600 13 px, 40 px tall).
- Hero: centred headline on one line on wide screens, the sub line under it in lime (Lexend 300,
  20 px), a ghost pill below ("See How It Works", Lexend 600 14 px, 44 px tall, 1.5 px border).
- Sections 2 to 4: a small lime uppercase label above each heading:
  `satellites` "Meet The Fleet", `downlink` "How Data Gets Home", `database` "Under The Hood".
- `downlink`: above its label, a DOM vertical beam like the reference: a 2 px lime line about 26vh
  tall that fades in from transparent at the top, ending in a 14 px white ring dot (2 px border,
  dark centre). It draws downward (scaleY 0 to 1, 900 ms) when the section enters.
- Rail: thin vertical line, small ring dots, the active section's uppercase label sits above its
  dot (as in the reference), active dot filled.
- Ghost pills everywhere (the "Open Console" in `database` may be filled white).

## Also fix
- Hero sub line: centre it under the headline (it currently drifts left), max 60ch, and change
  its copy to one short lime line: "{n} PocketQubes, {m} ground stations, one PostgreSQL
  database planning every downlink." (counts as words up to ten; fallback without counts:
  "A fleet of PocketQubes and the one PostgreSQL database that plans every downlink.").
- `Landing.tsx`: root gets `className="lx-root"` and `background: var(--lx-space)`; the footer
  wrapper uses the same background.

## Files you may edit
`web/src/landing/landing.css`, `web/src/pages/Landing.tsx`, `web/src/landing/SiteHeader.tsx`,
`web/src/landing/SectionRail.tsx`, `web/src/landing/Reveal.tsx`,
`web/src/landing/sections/*.tsx`. Import Lexend (`@fontsource/lexend/300.css`, `400.css`,
`600.css`) and Barlow Condensed 500 (`@fontsource/barlow-condensed/500.css`) in `Landing.tsx`.
Do not touch `web/src/landing/space/` (someone else is editing it).
