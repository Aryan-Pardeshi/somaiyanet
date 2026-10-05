# Brief 26b: header, logo and upper landing sections (SpaceX x Apple restyle)

First read `docs/briefs/26-common.md`, then `docs/design/DESIGN.md` and `web/src/styles/sx.css`.

Files you may edit (only these):
- `web/src/landing/SiteHeader.tsx`
- `web/src/components/story/Brand.tsx`
- `web/src/landing/Mission.tsx`
- `web/src/landing/Constraints.tsx`
- `web/src/landing/PacketStepper.tsx`
- `web/src/landing/Spacecraft.tsx`

## SiteHeader.tsx (SpaceX nav-bar-overlay)
Keep the show-after-hero behaviour. Look: transparent over black with a very subtle
`.sx-material`-like blur only once scrolled (or plain black at 80% with blur 20px), no border glow.
Logo left. Nav items as `.sx-eyebrow`-style DIN caps links (white 75%, white on hover), 24px 32px
padding. The CTA "Take the console" is a `.sx-btn .sx-btn--sm` ghost pill (not filled, not blue).
Phones: keep it simple, no horizontal overflow.

## Brand.tsx (logo)
Keep the wordmark structure ("SOMAIYA" + "NET", Michroma, uppercase, the swoosh). Make it SpaceX
austere: "SOMAIYA" and "NET" both white (NET may be white 70%), the swoosh a flat white path (no
blue gradient), the dot `#ff453a` flat with no glow/box-shadow. `BrandMark` the same.

## Mission.tsx
SpaceX band: left-aligned inside a centred 1200px column, `.sx-section` padding. An `.sx-eyebrow`
("The mission"), the sentence as `.sx-h2` (shorten if needed so it is 2-3 lines), then `.sx-lead`
paragraph. The mini 3D Earth can sit to the right on md+ (larger, ~360px) and below on phones.
The orbit ring and dots: white; the lead dot `#ff453a`. No borders on the section (remove
`border-t`).

## Constraints.tsx
Three constraints. SpaceX/Apple: `.sx-h2` section title ("Built for three hard limits" or the
existing one), then three columns on md+ (one column on phones), each with a minimal white line icon
(1.5 stroke, no blue), the title in `.sx-h3`, description in `.sx-body`. The "01 / 02 / 03" numbers
may stay only as `.sx-eyebrow` (it is a list of three). No boxes, no borders around items; spacing
does the grouping.

## PacketStepper.tsx
Keep the pinned/scrubbed step mechanism and step content. Restyle: step titles `.sx-h2`, step body
`.sx-lead`, step counter `.sx-num`/`.sx-eyebrow` ("Step 2 of 5"). Progress indicator: a 1px white
track at 15% with a white fill; dots are plain white (active) / white 25% (inactive), no glow. Any
images/visuals: keep them; remove blue tints, glows and coloured frames; if a visual has a frame,
use radius 14px and `--sx-surface`. Any SQL shown: `.sx-code`. Any chips: `.sx-status` or plain text.

## Spacecraft.tsx
SpaceX product band: big `.sx-h1` title, `.sx-lead`, the spec list as an Apple inset-grouped list
(`.sx-group` with `.sx-row`: label left in `.sx-body`, value right in `.sx-num` white). No cards with
borders, no blue.
