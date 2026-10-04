# Brief 16 (shared): command-center style for every app page

The /ops page (`web/src/pages/Ops.tsx`, `web/src/features/ops/cc/*`) was rebuilt as a satellite
command center. The rest of the app (sidebar shell, Routing, AI router, Deploy, the six labs)
still uses the old navy, rounded-card look and must now match /ops. READ `web/src/pages/Ops.tsx`,
`web/src/features/ops/cc/LeftRail.tsx` and `web/src/features/ops/cc/RightRail.tsx` first and copy
their visual language exactly.

## Visual language (from /ops)
- Page background pure black `#000`. No navy page fills, no gradients.
- Containers are chamfered glass panels: use `Panel` from `@/components/cc/Panel`
  (props: `cut` (default 8px), `selected`, `borderColor`, `backgroundColor`, `glowColor`,
  `innerClassName`). Do NOT use rounded cards (`rounded-xl`, shadcn `Card`) for containers any more.
- Section/panel headings: Geist Mono, 10-11px, uppercase, letter-spacing 0.14em, colour `#8b96b0`,
  inside the panel at the top-left (as "BATTERY VOLTAGE", "MISSION FILTER" on /ops).
- Big values / page titles: Geist Sans weight 300 (light), white, tight tracking.
  Page title row: light 28-34px title + a one-line muted description; no icons in headings.
- Body text 13-14px `#dfe6f5`; muted `#8b96b0`; faint `#5f6f93`.
- Accent royal blue `#3d5bff` for active/selected states, primary buttons, chart bars, links.
- Status colours: ok `#7ee2b8`, warn/amber `#f5a524`, critical `#ff3b4f` (red ONLY for critical
  errors, permission denials, deadlocks/aborts and the routed packet dot).
- Badges: small mono uppercase, 1px border in the status colour at ~40% alpha, text in status
  colour, square corners (copy the NOMINAL badge from /ops).
- Buttons: square-cornered or chamfered, mono uppercase 11px, tracking 0.1em.
  Primary = `#3d5bff` fill white text; secondary = transparent with 1px white/15 border;
  danger = red outline. Hover brightens border. Visible focus ring (`outline: 1px solid #3d5bff`).
- Tables: no zebra fills; rows separated by 1px `rgba(255,255,255,0.06)`; header row mono
  uppercase 10px muted; numbers right-aligned in Geist Mono.
- Code / SQL blocks: `#05070d` fill, 1px white/10 border, Geist Mono 12.5px, square corners.
- Progress bars: the dashed/segmented bars used in /ops fleet cards.
- Spacing: 16px gutters, 12-16px panel padding. Dense like a console, not airy like a landing page.
- Motion: only to answer user actions; respect `prefers-reduced-motion`.

## Rules for every worker
- Change styling and layout only. Keep every data fetch, API call, prop, behaviour and piece of
  text content working exactly as today (the labs are graded: every button that runs SQL
  must still run it and still show the result + SQL).
- Strict TypeScript, no `any`, no unused locals/imports. No new npm packages
  (lucide-react available). Use the `@/` alias.
- Edit ONLY the files listed in your own brief. Never edit `web/src/components/cc/Panel.tsx`,
  `web/src/pages/Ops.tsx`, `web/src/features/ops/**`, `web/src/landing/**`, or backend files.
- You cannot run shell commands in this session; do not try. Only read and edit files.
  Do NOT run git, do NOT start servers.
