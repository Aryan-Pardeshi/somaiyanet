# Brief 16a: app shell + shared UI primitives

Read docs/briefs/16-console-style.md first (shared style + rules).

Files you may edit: `web/src/app/AppShell.tsx`, `web/src/app/SqlDrawer.tsx`,
`web/src/components/ui/{card,badge,button,progress,separator,sheet,tooltip}.tsx`,
`web/src/pages/Placeholder.tsx`, and append-only additions to `web/src/styles/tokens.css`.

## Sidebar + top bar (AppShell.tsx)
- Sidebar pure black, 1px right border white/8, width ~220px.
- Brand "SomaiyaNet" with the red dot at top.
- Group labels ("MISSION", "DATABASE LABS") in mono uppercase 10px muted, letter-spacing 0.14em.
- Nav items: no rounded navy pills. Item = icon 16px + label 13px; inactive muted; hover white;
  active = white text, a 2px royal-blue bar on the left edge, and a very faint blue fill
  (rgba(61,91,255,0.08)) with a chamfered right edge (clip-path) - console feel.
- Profile switcher at the bottom: a `Panel` (from `@/components/cc/Panel`) with role name + login
  role in mono; keep its existing behaviour (switch profile / back to /console).
- Top bar: transparent black, 1px bottom border white/8, page title left in mono uppercase,
  UTC clock + SQL drawer button right; the SQL button = chamfered mono button with the count badge
  in royal blue.

## SQL drawer (SqlDrawer.tsx)
Black panel sliding from the right, 1px left border white/10, header in mono uppercase, each
query entry as a chamfered `Panel` with experiment/CO tag badges (mono, blue outline), SQL in the
code-block style, timing in mono muted. Keep all behaviour.

## shadcn primitives
Restyle `card` (square/chamfer-free but square corners, black/glass fill, white/9 border),
`badge` (mono uppercase square), `button` (variants per the shared brief: default=royal fill,
outline, ghost, destructive=red outline), `progress` (thin bar, royal fill) so any page still
using them already looks right. Keep their exported APIs and variant names identical.

## Placeholder.tsx
Match the style.
