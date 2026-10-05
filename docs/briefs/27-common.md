# Brief 27 (common rules for 27a-27e): SpaceX x Apple restyle of the app pages

Before editing, read fully:
1. `docs/design/DESIGN.md` (the rules; follow them exactly)
2. `web/src/styles/sx.css` (the classes and `--sx-*` tokens you must use)
3. `web/src/components/cc/Panel.tsx` (already restyled: a rounded `#111113` surface, no chamfer,
   no glow; `selected` = `#1c1c1e`). Keep using `Panel` where it is used.

The landing page has already been restyled this way. The app pages must now match: pure black,
white, uppercase DIN headings (Barlow via `--font-display`), the system font for body text, Apple
inset-grouped lists, ghost pill buttons, calm and obvious. When something is unnecessary, remove it.

Hard rules for every file you touch:
- Replace all royal blue / navy / ice accents (`#3d5bff`, `#7fb2ff`, `#9fb2ff`, `#a9caff`,
  `#2442ff`, `#04122e`, navy rgba like `rgba(6,11,23,..)` or `rgba(14,23,44,..)`, `var(--cc-royal)`,
  `var(--ice)`, `text-ice`, `bg-ice`, `border-ice`) with white, white at an opacity, or the `--sx-*`
  greys. Data colours only where the meaning is data: `--sx-red` packet/route/critical/denied,
  `--sx-orange` warning/low battery/safe mode, `--sx-green` ok/healthy/committed, `--sx-blue` only
  for one selected data item on a map or chart. Replace `--cc-ok`, `--cc-warn`, `--cc-critical`
  hex values with these.
- Remove glows: no glow `box-shadow`, `drop-shadow`, `text-shadow`, SVG blur filters, pulsing halos,
  coloured rims, gradient decoration, chamfered clip-paths.
- Page title: `.sx-h1` (or `.sx-h2` on dense pages) uppercase DIN, one `.sx-lead` line under it.
  Section/panel titles: `.sx-h3` or `.sx-eyebrow` (not both). Body: `.sx-body`, captions:
  `.sx-caption`. Remove `font-mono` from every label, chip, heading, nav item and button; keep mono
  only for SQL, code, table/column names, ids like `SS-1` inside SQL results, and query output.
- Numbers that change (volts, counts, latencies, clocks): `.sx-num`.
- Buttons: `.sx-btn` ghost pill; `.sx-btn--sm` in dense UI; `.sx-btn--quiet` for tertiary;
  at most one `.sx-btn--filled` per screen (the main action). No coloured buttons. A destructive or
  "Try anyway" action is a ghost pill whose resulting error text is `--sx-red`, not a red button.
- Lists/tables: `.sx-group` with `.sx-row` rows, or a `<table>` styled the same way (header row in
  `.sx-eyebrow`, 48-52px rows, hairline between rows, no outer borders, no zebra stripes).
- Status chips become `.sx-status` with `data-tone="ok" | "warn" | "critical"`.
- Inputs/selects: `#111113` background, no border (or 1px `--sx-hairline`), radius 10px, 44px tall,
  white text, focus ring 2px white.
- SQL/code blocks: `.sx-code` look (mono 13px, `#0a0a0a`, radius 10px).
- Keep every behaviour, API call, role/permission logic (`Locked`, `RoleHeader`, `canVisit`),
  data, routes, keyboard handling and accessibility. This is a visual restyle, not a rewrite.
  Shorten copy and remove jargon if it helps; never invent numbers or fake labels.
- Phones (375px): no horizontal page scroll; 16px gutters; touch targets at least 44px.
- Strict TypeScript (no `any`, no unused locals or imports). React 19. No new npm packages.
- Edit only the files listed in your brief. Do not edit `index.css`, `sx.css`, `tokens.css`,
  `Panel.tsx`, `DESIGN.md` or files of other briefs.
- You cannot run shell commands; only read and edit files. Do not run git, npm or servers.
- When done, list each file you changed with a one-line summary.
