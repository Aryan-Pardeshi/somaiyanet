# Brief 27a: app shell, profile picker, role chrome, shared UI

First read `docs/briefs/27-common.md` and the files it lists.

Files you may edit (only these):
- `web/src/app/AppShell.tsx`
- `web/src/app/access.tsx` (only the visual parts of `RoleHeader` and `Locked`; do not change
  `ROLE_ACCESS`, types or logic)
- `web/src/app/SqlDrawer.tsx`
- `web/src/app/sql.tsx`
- `web/src/pages/Console.tsx`
- `web/src/pages/Placeholder.tsx`
- `web/src/components/ui/button.tsx`, `web/src/components/ui/badge.tsx`, `web/src/components/ui/card.tsx`

## AppShell (Apple sidebar + SpaceX restraint)
- Sidebar: pure black, no border glow, a hairline (`--sx-hairline`) on its right edge. Logo at top
  (`<Brand />`). Group headings ("Mission", "Database labs") in `.sx-eyebrow`. Items in the system
  font 14px, white 70%, 36-40px tall, radius 8px; hover white; the active item has
  `--sx-surface-2` background and white text (no blue bar, no glow). Icons lucide 16px stroke 1.5.
- Top area of the content: role/profile switcher as a quiet `.sx-btn--quiet`/`.sx-btn--sm`, not a
  coloured chip. The redirect strip ("That page is not available to ...") and the offline/no-profile
  states: plain `.sx-body` text on `--sx-surface` with radius 14px, one `.sx-btn--sm` action.
- Mobile: keep the existing mobile nav behaviour, restyled the same way.

## access.tsx visuals
- `RoleHeader`: the role name as `.sx-eyebrow`, the "who"/"can" text as `.sx-body`; the collapsible
  "Postgres grants" toggle as `.sx-btn--quiet`; the grants list in mono 12px inside an `.sx-group`.
- `Locked`: a small lock icon (lucide `Lock`, 14px, white 50%) + the reason in `.sx-caption`, and
  "Try anyway" as `.sx-btn .sx-btn--sm` (ghost, not red). The denial result (`42501 ...`) shows in
  mono 12px `--sx-red`. Keep the wrapped children visible but at 40% opacity when locked.

## Console.tsx (profile picker)
SpaceX: `.sx-h1` "Choose a profile" (or the existing heading), `.sx-lead` line, then the profiles as
an Apple inset-grouped list (`.sx-group` + rows 64px: name `.sx-h3`-ish 16px DIN caps left, one-line
description `.sx-caption`, chevron right). Selected/hover row `--sx-surface-2`. One
`.sx-btn--filled` "Continue" if a continue button exists. No cards with borders or glows.

## SqlDrawer / sql.tsx
The drawer that shows the SQL behind a page: Apple sheet: `--sx-surface` background, radius 16px on
the open edge, a short grabber bar (36x5px white 25%) at the top if it slides up, title `.sx-h3`,
SQL in `.sx-code`, copy button `.sx-btn--quiet`. No blue syntax highlighting: keywords white,
identifiers white 80%, strings `#ff9f0a` at 90%, comments white 40%.

## ui/button, badge, card (shadcn)
Map variants to the system: default = white filled pill (`.sx-btn--filled` look), outline/secondary
= ghost pill, ghost/link = quiet; sizes keep 36/44/48px heights; radius full. Badge = `.sx-status`
look or plain DIN caps 11px white 70% on `--sx-surface-2` radius 999px, no coloured fills except the
data tones. Card = `--sx-surface`, radius 14px, no border, no shadow.
