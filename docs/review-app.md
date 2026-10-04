# App pages UI review — fixes

Scope: `web/src/app/**` (except `access.tsx`), `web/src/pages/**` (except
`Landing.tsx`), `web/src/features/**`, `web/src/components/**`.
Type-check: `npx --prefix web tsc -p web/tsconfig.app.json --noEmit` passes.

## Fixed

- `web/src/components/cc/Panel.tsx:86` — clickable Panel renders `role="button"` with keyboard activation (Enter/Space)
- `web/src/components/cc/Panel.tsx:87` — clickable Panel is focusable via `tabIndex={0}`
- `web/src/components/cc/Panel.tsx:89` — clickable Panel shows a visible focus ring; `transition-all` narrowed to explicit properties
- `web/src/app/AppShell.tsx:54` — page title `LAB // X` reworded to plain `Lab X`
- `web/src/app/AppShell.tsx:57` — fallback lab title `LAB // X` reworded to plain `Lab X`
- `web/src/app/AppShell.tsx:443` — offline dot pulse gated with `motion-safe:`
- `web/src/app/AppShell.tsx:452` — main padding `p-6` → `p-4 sm:p-6` so 375px keeps content width
- `web/src/app/SqlDrawer.tsx:104` — closed drawer uses `visibility:hidden` so its buttons are not focusable when shut
- `web/src/app/SqlDrawer.tsx:293` — `CONNECTION LOST // BACKEND OFFLINE` reworded without `//`
- `web/src/pages/Placeholder.tsx:27` — `SYSTEM STATUS //` reworded to plain `System status`
- `web/src/pages/Placeholder.tsx:43` — `CHANNEL:` reworded to plain `Page:`
- `web/src/pages/Placeholder.tsx:44` — `AWAITING TELECOMMAND` reworded to plain `Coming soon`
- `web/src/pages/Brain.tsx:108` — what-if sliders expose their value via `aria-label`
- `web/src/pages/Brain.tsx:241` — page bleed margins track the shell padding at 375px (`-m-4 p-4 sm:-m-6 sm:p-6`)
- `web/src/pages/Brain.tsx:259` — `SQL INFERENCE ENGINE` badge reworded to `Decision tree in SQL`
- `web/src/features/brain/TreeSvg.tsx:101` — wheel zoom uses a non-passive native listener so the page does not scroll while zooming
- `web/src/features/brain/TreeSvg.tsx:111` — canvas pans with arrow keys and zooms with `+`/`-`
- `web/src/features/brain/TreeSvg.tsx:167` — reset-zoom button names its action (`Reset zoom`)
- `web/src/features/brain/TreeSvg.tsx:186` — canvas is focusable with a visible focus ring
- `web/src/features/brain/TreeSvg.tsx:187` — canvas exposes an accessible name and role
- `web/src/features/brain/TreeSvg.tsx:207` — canvas pans with single-finger touch
- `web/src/features/brain/TreeSvg.tsx:222` — `PATH INFERENCE ENGINE // ...` reworded to `Active path highlighted`
- `web/src/features/brain/TreeSvg.tsx:225` — corner hint reworded to plain `Scroll to zoom · Drag to move`
- `web/src/features/brain/TreeSvg.tsx:228` — corner label reworded to plain `Decision tree from dt_node rows` (table name kept)
- `web/src/features/brain/TreeSvg.tsx:231` — `DIM:` reworded to plain `Size:`
- `web/src/pages/Routing.tsx:123` — globe reload no longer re-runs on every satellite pick (stable loader, functional `setOrigin`)
- `web/src/pages/Routing.tsx:211` — page bleed margins track the shell padding at 375px
- `web/src/pages/Routing.tsx:280` — safe-satellite pulse gated with `motion-safe:`
- `web/src/pages/Routing.tsx:322` — start-time input gets an associated `label`
- `web/src/pages/Routing.tsx:360` — data-size slider gets `aria-label`
- `web/src/pages/Routing.tsx:380` — max-hops slider gets `aria-label`
- `web/src/pages/Routing.tsx:539` — arrival timestamp wraps instead of overflowing narrow screens
- `web/src/pages/Routing.tsx:595` — saving indicator pulse gated with `motion-safe:`
- `web/src/pages/Deploy.tsx:83` — pod jiggle animation skipped under reduced motion
- `web/src/pages/Deploy.tsx:189` — state diagram exposes its label via `role="img"`
- `web/src/pages/Deploy.tsx:387` — page bleed margins track the shell padding at 375px
- `web/src/pages/Deploy.tsx:471` — pod picker `label` associated with its `select`
- `web/src/pages/Deploy.tsx:878` — satellite picker text converted to an associated `label`
- `web/src/pages/Deploy.tsx:899` — ground-contact picker text converted to an associated `label`
- `web/src/pages/Ops.tsx:125` — bleed margin tracks the shell padding at 375px (`-m-4 sm:-m-6`)
- `web/src/pages/Lab.tsx:1` — lab query params read via `useSearchParams` so tab/preset stay in sync with navigation
- `web/src/pages/Console.tsx:84` — profile-pick navigation timer tracked in a ref and cleared/replaced per pick
- `web/src/pages/Console.tsx:88` — pending navigation timer cleared on unmount
- `web/src/features/ops/cc/TopBar.tsx:66` — live-dot pulse gated with `motion-safe:`
- `web/src/features/ops/cc/TopBar.tsx:81` — tab bar wraps and stays within the viewport at 375px
- `web/src/features/ops/cc/LeftRail.tsx:265` — safe-satellite pulse gated with `motion-safe:`
- `web/src/features/ops/cc/RightRail.tsx:416` — streaming dot pulse gated with `motion-safe:`
- `web/src/features/ops/cc/RightRail.tsx:511` — selected-satellite heading wraps instead of overflowing (`break-words`, no `nowrap`)
- `web/src/features/ops/cc/HelpHint.tsx:4` — hint glyph is keyboard-focusable with a visible focus ring
- `web/src/features/ops/OpsGlobe.tsx:848` — safe-halo pulse disabled under reduced motion
- `web/src/features/ops/OpsGlobe.tsx:866` — loading pulse gated with `motion-safe:`
- `web/src/components/story/HopRail.tsx:29` — hop pulse moved to a class with a reduced-motion off-switch
- `web/src/components/story/SqlRibbon.tsx:107` — typing caret pulse gated with `motion-safe:`
- `web/src/features/labs/TxLab.tsx:519` — waiting badge pulse gated with `motion-safe:`
- `web/src/features/labs/SqlLab.tsx:174` — role chips expose toggle state via `aria-pressed`

## Seen but not fixed

- `web/src/features/ops/SideRail.tsx` — dead file with old navy `rounded-[14px]` styling; no importer, renders nothing, left untouched
- `web/src/components/story/SqlRibbon.tsx:100` — `rounded-xl` container shared with the landing story; changing it would alter landing visuals, left as-is
- `web/src/features/labs/SqlLab.tsx:80` — role switch posts to `/api/profile` while shell/console use `/api/session`; backend contract unverified, left as-is
- `web/src/features/ops/cc/RightRail.tsx` — decision rows key on index because `DecisionEvent` carries no stable id; prepending re-mounts rows, unavoidable without a backend id
- `transition-all` remains on small buttons/cards without transform use; only the central `Panel` was narrowed to explicit properties
- `Exp … / CO…` chips and SQL/table names (`cgr_routes()`, `dt_node`, `v_queue_by_mode`, `has_*_privilege`) kept as course/SQL vocabulary per brief
