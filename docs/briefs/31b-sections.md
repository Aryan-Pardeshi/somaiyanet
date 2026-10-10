# Brief 31b: the page over the scene (sections, rail, header)

Read `31-common.md` first, then `web/src/landing/space/scroll.ts`,
`web/src/landing/publicApi.ts`, `web/src/styles/sx.css` and the current
`web/src/landing/SiteHeader.tsx` and `web/src/landing/Footer.tsx`.

## Files you create or edit (only these)
- `web/src/pages/Landing.tsx` (rewrite)
- `web/src/landing/SiteHeader.tsx` (edit the nav)
- `web/src/landing/SectionRail.tsx` (new)
- `web/src/landing/sections/HeroSection.tsx`, `FleetSection.tsx`, `DownlinkSection.tsx`,
  `DatabaseSection.tsx` (new)
- `web/src/landing/landing.css` (new; import it from `Landing.tsx`)
- `web/src/landing/Reveal.tsx` (new, the heading reveal described below)

`SpaceScene` (brief 31a, written in parallel by someone else) lives at
`web/src/landing/space/SpaceScene.tsx` and has this signature; import and render it, do not
create or edit it:
```ts
export function SpaceScene(props: { network: PublicNetwork | null }): JSX.Element;
```

## Landing.tsx
- Fetch `getNetwork()` and `getSchema()` once on mount (ignore failures, keep `null`).
- Structure: a root `div` with black background; `<SpaceScene network={network} />` (it is
  fixed and behind everything); `<SiteHeader />`; `<SectionRail />`; a `<main className="relative
  z-10">` with the four sections in `SCENES` order; `<Footer />` wrapped so it sits above the
  canvas (relative, z-10, black background).
- Import `@fontsource/barlow-condensed/300.css` and `@fontsource/barlow-condensed/400.css`.
- Remove everything else the old page used (LiveHero, SchemaMap, RoleLens, PageIndex). Do not
  delete those files.

## landing.css
- `.lx-display`: Barlow Condensed 300, Title Case as written, `font-size: clamp(42px, 6.2vw,
  88px)`, `line-height: 1.02`, `letter-spacing: 0.005em`, white.
- `.lx-h2`: Barlow Condensed 300, `clamp(34px, 3.6vw, 54px)`, `line-height: 1.06`.
- `.lx-sub`: the sans, 18 px (16 px on phones), `--sx-text-2`, max 46ch.
- `.lx-body`: the sans, 15 px, line-height 1.6, `--sx-text-2`, max 34ch.
- Each section: `position: relative; min-height: 100svh;` transparent background, and a positioned
  text block placed with the fractions from the table in `31-common.md` (use `top`/`left`/`width`
  in `%` or `vh`/`vw` inside the section, or a CSS grid; on wide screens `@media (min-width:
  1024px) and (min-aspect-ratio: 6/5)` matches `isWideViewport()`). Narrow layout puts the text
  block at y 0.56 to 0.95 of the section with 16 px gutters.
- Text over the Earth must stay readable: in the narrow layout give the text block a soft dark
  backdrop that fades to transparent at its top (a CSS gradient is fine here, black 0% to 72%,
  only behind text, no visible box edges).

## Reveal.tsx
`<Reveal as="h1"|"h2"|"p"|"div" delay={ms}>`: when it first enters the viewport
(IntersectionObserver, threshold 0.35), its content rises 18 px and fades in over 900 ms with
`--sx-ease-out`, once. Headings reveal line by line by splitting on `\n` (each line in an
`overflow: hidden` wrapper, the inner span slides up from 100%). Reduced motion: no animation,
show it at once.

## The sections (exact copy; numbers in braces come from the API, fallbacks in brackets)

**`network` (HeroSection).** Centred text block (wide y 0.16 to 0.45).
- `h1.lx-display` (two lines): "Getting Satellite Data\nDown To Earth"
- `p.lx-sub`: "SomaiyaNet plans every pass, hop and downlink for {n} PocketQube satellites and {m}
  ground stations, all inside one PostgreSQL database." [fallback: "for a fleet of PocketQube
  satellites and its ground stations"]
- Ghost pill `.sx-btn`: "See How It Works", a link to `#satellites`.

**`satellites` (FleetSection).** Wide: right half.
- `h2.lx-h2`: "Four PocketQubes\nIn Low Earth Orbit" (if the API says a different count, write
  the number as a word up to ten).
- Two short columns side by side on wide (stacked on narrow), `p.lx-body` each:
  1. "Each satellite is a stack of 5 cm cubes that stores what it collects until it can pass it on."
  2. "When two satellites are in range they hand packets to each other, so data hops to whichever
     one meets a ground station first."
- Live status line, one entry per satellite from `network.satellites`, inline and wrapping: the
  id in white then a `.sx-status` with tone from the state (NOMINAL ok "Nominal", SAFE warn "Safe
  mode", STOWED neutral "Stowed", anything else neutral in Title Case). No boxes or chips. Hide
  the line if the network failed.
- Ghost pill: "Watch Them Live", a `Link` to `/ops`.

**`downlink` (DownlinkSection).** Wide: left column.
- `h2.lx-h2`: "Data Comes Down\nIn Short Windows"
- `p.lx-body` (max 40ch here): "A satellite can only talk to a ground station for a few minutes
  as it passes overhead. The database computes every one of these windows from the orbits, then
  finds the earliest way to get each packet home."
- Station line from `network.stations`: their `name`s joined with commas, the primary one
  followed by " (primary)", in `--sx-text-3` 13 px. Hide if the network failed.
- Ghost pill: "Plan A Route", a `Link` to `/routing`.

**`database` (DatabaseSection).** Wide: centred, low.
- `h2.lx-h2` centred: "One Database\nRuns The Whole Mission"
- `p.lx-body` centred (max 52ch): "{tables} tables, {functions} functions, {triggers} triggers and
  row-level security decide who can see and change what. Every screen in the console shows the
  SQL behind it." [fallback: "Tables, functions, triggers and row-level security decide …"]
  Use `schema.tables.length` and `schema.counts`.
- Filled pill `.sx-btn.sx-btn--filled` (the only one on the page): "Open Console", a `Link` to
  `/console`.
- Make this section tall enough (and the footer below it) that its top can reach the viewport
  top, so the scene reaches its last keyframe.

## SectionRail.tsx
Desktop only (hidden below 1024 px). Fixed to the right edge (right 28 px), vertically centred,
z-20. A 1 px vertical hairline (white 16%) about 38vh tall with four dots spaced along it, one per
`SCENES` entry. Each dot is a 9 px ring (1 px white 40%); the active one (`useActiveScene()`) is a
filled white dot with a soft scale-up (250 ms). The active section's label sits to the left of its
dot (12 px, Title Case, `--sx-text-2`, Barlow Condensed 400, letter-spacing 0.04em); other labels
appear on hover/focus. Each dot is a button (44 px hit area, `aria-label` "Go to {label}",
`aria-current` on the active one) that scrolls to its section with `scrollIntoView({ behavior:
"smooth" })` (instant when reduced motion).

## SiteHeader.tsx
Change only the nav: four links `#network` Network, `#satellites` Satellites, `#downlink`
Downlink, `#database` Database; the active one (`useActiveScene()`) is white, others
`--sx-text-2`. Keep the rest (brand, scrolled backdrop, ghost "Open Console").
