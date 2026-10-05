# Brief 22: /ops side columns as real liquid glass, fewer cards, scrollable

Files you may edit: `web/src/pages/Ops.tsx`, `web/src/features/ops/cc/*` (you may add new files in
that folder, e.g. `Glass.tsx`). Do NOT edit `web/src/components/cc/Panel.tsx` (other pages use it),
`web/src/app/**`, `web/src/landing/**`, or `features/ops/api.ts` / `OpsGlobe.tsx` logic.

## Problems (user screenshots)
1. The left and right columns over the globe cannot be scrolled: cards at the bottom (fleet list,
   Warning panel) are cut off. (The global smooth-scroll wheel capture is already fixed; you must
   make the columns themselves proper scroll containers.)
2. Too many cards. 3. The chamfered dark cards are not "liquid glass".

## Card diet (keep every piece of data, fewer boxes)
LEFT column, top to bottom:
- Role strip: one compact glass pill row: role title (e.g. "Mumbai station operator") + a
  "What can I do?" toggle that expands the existing `RoleHeader` content inline. Collapsed by default.
- ONE "Satellites (4)" card containing: the coloured state bar, the legend line ("2 healthy · 1 in
  safe mode · 1 not yet deployed", fix the stray comma placement), and the four filter chips
  (All / Healthy / Safe mode / Not deployed) directly under it. (Merges today's two cards.)
- Fleet list: one row per satellite (icon, name, state badge, next ground pass countdown, link
  quality + battery thin bars). Rows sit inside ONE glass card separated by hairlines, not one
  card per satellite. Selected row: brighter + blue left edge.
RIGHT column, top to bottom (Overview tab):
- ONE "Selected satellite" card: name, state badge, sub line, then battery value + change over
  10 min + the bar chart, then a 2-column stat row: Temperature and Signal received (RSSI) as plain
  numbers with units (drop the flat sparkline boxes; the old separate "Health" card goes away).
- Warning card (only when there is an unacknowledged alert), with Acknowledge (Locked logic as now)
  and Open AI router.
- "Today" KPIs card (2x2 numbers).
Other tabs (Satellites / Upcoming passes / Live data) keep their content but use the same glass card.

## Liquid glass look (only on /ops; panels float over the globe so the Earth shows through)
Make one reusable `<Glass>` component in `features/ops/cc/Glass.tsx`:
- radius 20px (rounded, NOT chamfered); padding 16px.
- background: `linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))`.
- `backdrop-filter: blur(22px) saturate(170%)` (+ `-webkit-backdrop-filter`).
- border: 1px solid rgba(255,255,255,0.12); inner top highlight
  `box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.45)`.
- a soft specular sheen: a pseudo/overlay div with
  `radial-gradient(120% 60% at 20% 0%, rgba(255,255,255,0.10), transparent 60%)`, pointer-events none.
- variants: `tone="default" | "warn" | "critical"` (warn: amber-tinted border + faint amber
  glow; critical: red-tinted), and `selected` for rows.
- Pills/buttons/chips on /ops (tabs, dock buttons, filter chips): rounded-full glass pills in the
  same recipe; active = royal blue `#3d5bff` fill at 85% with white text.
- Keep text colours: white / #dfe6f5 / muted #8b96b0; status green #7ee2b8, amber #f5a524, red #ff3b4f.
- Fallback when `backdrop-filter` is unsupported: background rgba(10,14,28,0.85).

## Scrolling
- The page must not scroll; each column is `h-full min-h-0 overflow-y-auto overscroll-contain`
  with the attribute `data-lenis-prevent`, thin dark scrollbar (scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.2) transparent), and a soft fade mask at the bottom
  (`mask-image: linear-gradient(to bottom, black 92%, transparent)`).
- Make sure the parent flex chain has `min-h-0` so the columns get a bounded height, and the bottom
  dock does not cover the last card (add bottom padding equal to the dock height).
- Phones (< 1024px): columns stack under the globe and the page scrolls normally.

Keep all behaviour: selection, filters, tabs, camera dock, acknowledge, locked actions, role
awareness, plain-language labels. Strict TypeScript, no `any`, no unused locals. You cannot run
shell commands: only read and edit files. Do not run git or servers.
