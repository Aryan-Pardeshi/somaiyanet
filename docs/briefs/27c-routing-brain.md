# Brief 27c: Routing and AI router pages

First read `docs/briefs/27-common.md` and the files it lists.

Files you may edit (only these):
- `web/src/pages/Routing.tsx`
- `web/src/features/routing/DashedBar.tsx`, `web/src/features/routing/SatIcon.tsx`
- `web/src/components/story/HopRail.tsx`, `SqlRibbon.tsx`, `RowCard.tsx`, `ChapterLabel.tsx`, `LineArtBox.tsx`
- `web/src/pages/Brain.tsx`
- `web/src/features/brain/TreeSvg.tsx`

## Routing
- Page title `.sx-h1` "Routing", `.sx-lead` one line on what the page shows (a packet's route found
  by the recursive `cgr_routes()` query).
- Route diagrams (HopRail, satellites, links): same visual language as the landing finale:
  satellites are solid white dots r 3-4 with DIN caps labels and a `.sx-status` line, no rings/halos/
  glows; links 1px white 20% idle / 70% live; the chosen route and packet `#ff453a`; nothing else red.
- Route options / alternatives: an Apple inset-grouped list, each row: route summary left (`.sx-body`),
  arrival time `.sx-num` right; the chosen one has `--sx-surface-2` and a small `.sx-status`
  data-tone="ok" "Chosen". No bordered cards.
- `SqlRibbon`: the query in `.sx-code`, label `.sx-eyebrow`, a quiet copy/show button.
- `RowCard`: an `.sx-group` row style, mono only for column values from SQL.

## Brain (AI router)
- Title `.sx-h1` "AI router", `.sx-lead`.
- Decision tree (`TreeSvg`): white 1px edges at 25%, nodes as small white dots or minimal rounded
  rectangles (`#111113` fill, no border, radius 8px) with DIN caps 11px labels; the active decision
  path in white 100% with 1.5px edges; the final leaf/decision text white. The watchdog override is
  shown with `#ff9f0a` (warning) only on the overriding node. No blue, no glows.
- Feature inputs and the decision log: inset-grouped lists, values `.sx-num`, SQL in `.sx-code`.
- Keep `Locked` wrappers, API calls and all behaviour.
