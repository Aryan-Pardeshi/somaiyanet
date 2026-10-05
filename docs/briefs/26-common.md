# Brief 26 (common rules for 26a, 26b, 26c): SpaceX x Apple restyle of the landing page

Before editing, read these two files fully:
1. `docs/design/DESIGN.md` (the rules; follow them exactly)
2. `web/src/styles/sx.css` (the classes and `--sx-*` tokens you must use)

The goal: the landing page should look like SpaceX's site (pure black, white, uppercase DIN display
type with wide tracking, ghost outlined pill buttons, full-bleed imagery, no decoration) and behave
with Apple's calm (clear hierarchy by size and weight, generous spacing, no gimmicks, nothing
glowing, nothing neon). When something feels unnecessary, remove it.

Hard rules for every file you touch:
- Replace all royal blue / navy / ice accents (`#3d5bff`, `#7fb2ff`, `#9fb2ff`, `#9fc2ff`, `#2442ff`,
  `#0b1a4a`, navy gradients, `var(--cc-royal)`, `var(--ice)`) with white, white at an opacity, or the
  `--sx-*` greys. The only colours allowed are the data colours in DESIGN.md (`--sx-red` for the
  packet/route, `--sx-orange` warning, `--sx-green` ok), used sparingly.
- Remove glows: no `drop-shadow`, `box-shadow` glows, `text-shadow`, blurred coloured strokes,
  SVG `filter` glows, radial "atmosphere" gradients, pulsing halos.
- Headings: use `.sx-display` / `.sx-h1` / `.sx-h2` / `.sx-h3` (uppercase DIN). Body paragraphs:
  `.sx-lead` / `.sx-body` / `.sx-caption` (system font, sentence case). Remove `font-light`,
  negative letter-spacing and hard-coded `#9aa3b8`-style greys on text you restyle.
- Small labels: `.sx-eyebrow`. Monospace only for SQL / table names / code.
- Buttons and CTAs: `.sx-btn` (ghost pill), at most one `.sx-btn--filled` on the whole page.
- Status chips become `.sx-status` with `data-tone="ok" | "warn" | "critical"` (a dot + words).
- Keep every existing behaviour: scroll choreography, `progress` refs, rAF loops, reduced-motion
  handling, mobile layouts, links and routes, accessibility attributes, data and numbers. This is a
  visual restyle, not a rewrite. Do not change copy meaning; you may shorten copy and remove jargon.
- Strict TypeScript (no `any`, no unused locals or imports). React 19. No new npm packages.
- Work only on the files listed in your brief. Do not edit `index.css`, `sx.css`, `tokens.css`,
  `DESIGN.md` or any other file. If you need a class that does not exist, use Tailwind utilities
  with the `--sx-*` variables (for example `text-[color:var(--sx-text-2)]`).
- You cannot run shell commands; only read and edit files. Do not run git, npm or servers.
- When done, list each file you changed with a one-line summary.
