# Brief 16b: Routing, AI router (Brain) and Deploy pages

Read docs/briefs/16-console-style.md first (shared style + rules).

Files you may edit: `web/src/pages/Routing.tsx`, `web/src/pages/Brain.tsx`,
`web/src/pages/Deploy.tsx`, `web/src/features/routing/**`, `web/src/features/brain/**`,
`web/src/features/deploy/**`. You may create new files under those feature folders.

## Routing
Console layout: left control panel (origin satellite picker as a list of chamfered chips/cards
with the SatIcon look from /ops - you may copy `web/src/features/ops/cc/SatIcon.tsx` into
`features/routing/` - time picker, max hops, "Find routes" primary button), centre/right results:
ranked routes as Panels (rank, arrival time big light number, hops, bottleneck link score as a
segmented bar), selected route as a hop timeline (node -> node with ISL/DOWNLINK badges, depart/arrive
in mono). If the page shows a globe or map, keep it, framed by a Panel with HUD corner labels.

## AI router (Brain)
Decision tree view in a large Panel with a HUD label "DECISION TREE / MODEL vN / 93 NODES";
tree nodes as small chamfered boxes, chosen inference path in royal blue, leaves labelled.
Feature inputs as a Panel of mono key/value rows with thin bars. AI vs rule vs final decision as
three Panels side by side; an override shows amber "WATCHDOG OVERRIDE" badge + amber glow.
Model versions / metrics as a table in the shared table style; accuracy as a big light number.

## Deploy
SomaiyaPod sequence as a vertical console timeline: each step a Panel with step number in mono,
state badge, and the transaction outcome (COMMIT ok green, ROLLBACK amber, SAVEPOINT blue).
State-machine rejections (illegal transition) show red critical badge + the exact Postgres error.
Diff cards (DiffCard.tsx) restyled as Panels with before/after columns in mono.
