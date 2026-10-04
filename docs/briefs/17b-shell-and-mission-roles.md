# Brief 17b: shell routing by role + Routing / AI router / Deploy role-aware

Read docs/briefs/17-roles-common.md first.
Files you may edit: `web/src/app/AppShell.tsx`, `web/src/app/profiles.tsx`,
`web/src/pages/Console.tsx`, `web/src/App.tsx`, `web/src/pages/Placeholder.tsx`,
`web/src/pages/Routing.tsx`, `web/src/pages/Brain.tsx`, `web/src/pages/Deploy.tsx`,
`web/src/features/routing/**`, `web/src/features/brain/**`, `web/src/features/deploy/**`.

## Shell (AppShell.tsx)
- Wrap the page `children` in `<RoleProvider role={profile?.role ?? null}>`.
- Sidebar: show only nav items where `canVisit(role, item.to)` (lab items too).
- Redirect: after the session check, if `!canVisit(role, location.pathname)`, navigate (replace)
  to `homeFor(role)` and show a dismissible strip at the top of the content: "That page is not
  available to <profile title>, so you were sent to your home page."
- Profile switcher: after switching, go to the new role's `homeFor(role)` if the current page is
  not allowed for it; otherwise stay and reload data as today.
- Show the role's `who` line under the profile name in the sidebar footer (truncate).

## Console (Console.tsx) + profiles.tsx
- After picking a profile, navigate to `next` only if `canVisit(role, next)`, else `homeFor(role)`.
- In the fixed-height detail panel, show `ROLE_ACCESS[role].can` and the home page
  ("Opens: Command center" for /ops, "SQL console" for /labs/sql, "AI router" for /brain).
  Keep the tiles fixed-size (no layout shift on hover/focus).
- profiles.tsx: keep exports; make `FALLBACK_PROFILES[].can` come from ROLE_ACCESS so they match.

## Routing page
`<RoleHeader note="Routes are computed live by the recursive query cgr_routes()." />`.
Any "save / plan this route" action becomes `<Locked action="plan_route">` with Try anyway.

## AI router page (Brain)
`<RoleHeader note="..." />`. The "decide now" style action (calls decide_for_satellite / POST
/api/ai/decide/{sat}) becomes `<Locked action="decide">` with Try anyway (analyst gets 42501).
Preview stays open to all roles.

## Deploy page
`<RoleHeader />`. Signal buttons become `<Locked action="deploy_signal">`; Confirm deployment,
Simulate failure and Reset become `<Locked action="deploy_confirm" reason="Only the mission
director may release a satellite (EXECUTE on procedure confirm_deployment).">` with Try anyway.

## Plain language
Apply the plain-language rule to every heading/label on these three pages, e.g.
"Contact Graph Routing explorer" -> "Route finder: how a packet hops between satellites to reach
the ground"; "Deployment & transactions" -> "Releasing a satellite from its deployer";
"ORIGIN SATELLITE" -> "Start from"; "BUNDLE SIZE" -> "Data to send"; "MAX HOPS" -> "Most hops
allowed"; "RANKED ROUTES // EARLIEST ARRIVAL WINS" -> "Routes, earliest arrival first";
"BOTTLENECK LINK SCORE" -> "Weakest link on the route". Keep SQL and table names.
