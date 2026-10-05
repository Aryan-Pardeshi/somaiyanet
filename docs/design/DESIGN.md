# SomaiyaNet design system

SpaceX austerity (see `spacex-reference.md`, from `npx getdesign@latest add spacex`) with Apple's
calm product rules. Every screen should feel like a first-party product: obvious, quiet, confident.
When unsure, remove.

The implementation lives in `web/src/styles/sx.css` (classes and `--sx-*` tokens). Use those
classes instead of inventing new styles.

## Colour
- Canvas pure black `#000`. Bands that need separation use `--sx-night` `#0a0a0a`.
- Grouped containers use `--sx-surface` `#111113`; hover/selected `--sx-surface-2` `#1c1c1e`.
- Text: white, `--sx-text-2` (62% white) secondary, `--sx-text-3` (38%) tertiary. Hierarchy comes
  from size and weight, not colour.
- Hairlines `--sx-hairline` (8% white). Prefer spacing over lines; never both spacing and a line
  to separate the same thing.
- **No accent colour on chrome.** No royal blue, no navy, no gradients, no glows, no neon, no
  coloured borders, no drop shadows, no text-shadow.
- Colour only inside data, used sparingly:
  - `--sx-red` `#ff453a`: the packet and its route, critical alerts.
  - `--sx-orange` `#ff9f0a`: warning, low battery, safe mode.
  - `--sx-green` `#30d158`: healthy / ok.
  - `--sx-blue` `#0a84ff`: one selected data item (a picked satellite on the globe). Nothing else.
  - Status is a 6px dot + plain words (`.sx-status[data-tone]`), never a filled or outlined chip.

## Type
- Display (`--font-display`, Barlow, a DIN-style grotesk standing in for SpaceX's D-DIN):
  **uppercase, bold, +0.02em tracking, tight leading**. Classes `.sx-display` (hero, up to 80px),
  `.sx-h1` (60px), `.sx-h2` (44px), `.sx-h3` (19px).
- Eyebrows / nav / button labels: `.sx-eyebrow` (12px uppercase, +0.1em). At most one eyebrow per
  block. Do not put an eyebrow on top of every heading.
- Body (`--font-sans`, the system UI font: SF Pro on Apple, Segoe UI on Windows): sentence case.
  `.sx-lead` 17px for the one paragraph under a section heading, `.sx-body` 15px, `.sx-caption` 13px.
- Changing numbers (volts, counts, clocks): `.sx-num` (DIN, tabular figures).
- Monospace (`--font-mono`) only for SQL, table/column names and code (`.sx-code`). Never for labels,
  chips, nav or headings.
- Copy: plain words a first-year student understands. No "//", no fake telemetry, no made-up
  version numbers, no jargon without a reason.

## Components
- Buttons (`.sx-btn`): ghost outlined white pill, uppercase label, 48px tall; hover fills white
  with black text. One filled primary (`.sx-btn--filled`) per screen at most. Tertiary actions:
  `.sx-btn--quiet`. Compact: `.sx-btn--sm`. Never coloured buttons. Marketing bands: one CTA per band.
- Links: `.sx-link` (white, underline at 35%, solid on hover).
- Lists and tables: Apple inset-grouped (`.sx-group` + `.sx-row`), 52px rows, hairline between rows,
  no outer border. Table headers are `.sx-eyebrow`.
- Panels over the globe or imagery: `.sx-material` (translucent blur, 16px radius, faint hairline).
  Nowhere else use blur.
- Radii: 999px buttons, 14px groups, 16px floating materials, 8-10px small things. Nothing chamfered.
- Icons: lucide at 1.5 stroke, 16-20px, white or `--sx-text-2`. No decorative icons.

## Layout
- Marketing (landing): each section is a full-width band. A centred column max 1200px. Section
  rhythm `.sx-section`. Left-aligned text by default; centre only a single short statement.
- App pages: standard top navigation, a large uppercase title (`.sx-h1` or `.sx-h2`) with one
  `.sx-lead` line, then content in grouped lists. Vertical scroll is the primary navigation.
- Touch targets at least 44px. Works at 375px wide with a 16px gutter and no horizontal scroll.

## Motion
- Ease `--sx-ease` / `--sx-ease-out`, 200-400ms. Fade, slide a few px, subtle scale. No bounce, no
  pulsing glows, no endless decorative loops. Motion explains a change or the scroll story; it is
  never ornament. Respect `prefers-reduced-motion` (show the final state).

## Diagrams and maps
- Satellites are minimal: a solid white dot (3-4px radius in a ~720-wide viewBox), no halo, no
  ring, no glow. Label under it in `.sx-eyebrow` style (DIN caps, white 70%), status as a 6px dot
  + words underneath, no chip box.
- Links between nodes: 1px white hairlines at 25% (idle) / 70% (live). The chosen route and the
  packet are `--sx-red`; nothing else is red.
- Earth limb: a single thin white arc at 30% over black, no gradients or atmospheric glow.
