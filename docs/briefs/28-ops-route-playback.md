# Brief 28: Ops "Show Packet Route" playback (real route, clear story)

First read `docs/briefs/27-common.md`, `docs/design/DESIGN.md` and `web/src/styles/sx.css`.

Files you may edit or create (only these):
- `web/src/pages/Ops.tsx`
- `web/src/features/ops/OpsGlobe.tsx`
- `web/src/features/ops/cc/BottomDock.tsx`
- new: `web/src/features/ops/cc/RouteCard.tsx`

## Problem today
`handleDemoRoute` in `Ops.tsx` plays a hard-coded 2-hop route (SS-1 to SS-2 to GS-BOM). In
`OpsGlobe.tsx` a red dot slides in a straight lat/lng line for ~1.4 s per hop, only the current hop
line is drawn, and everything disappears at the end. `simRef.current.simMs` is also jumped to the
hop times, which teleports the satellites. Nothing tells the viewer what they are watching.

## What it must become
A short, calm, explainable playback of the **real earliest route** that PostgreSQL computes.

### Data (real, from the database)
- On click, call `findRoutes(origin, new Date().toISOString(), 41216, 4)` from
  `web/src/features/routing/api.ts` (it runs `SELECT * FROM cgr_routes(...)`). Each result has
  `rank, destination, arrival_ts, hops, bottleneck_score, latency_s, path_nodes[], path_contacts[],
  explanation`. Take the earliest arrival (rank 1).
- `origin` = the selected satellite if it is flying (`SS-1`..`SS-3`, state not STOWED), else `SS-1`.
- Per-hop times: for hop i, look up `path_contacts[i]` in the Ops `contacts` data (`Contact` has
  `start_ts`, `end_ts`, `kind`, `link_score`); depart = max(previous arrival, contact start),
  arrive = depart (store-and-forward, transfer time ~0). If a contact is not in the loaded list,
  still show the hop with `link_score` unknown ("q n/a") and no time.
- Errors: if the request fails (offline, mock data, or a permission error), fall back to a sample
  route built from the loaded contacts (or the old SS-1 to SS-2 to GS-BOM sample) and label the card
  "Sample route (database offline)". If the error has a SQLSTATE (for example `42501`), show it in
  the card in mono 12px `--sx-red` with the message. Never invent numbers.

### Globe choreography (`OpsGlobe.tsx`)
Extend the imperative handle (keep `flyTo`); replace `playRoute` with something like
`playRoute(hops, { onHop, onDone })` and add `clearRoute()`.
1. Camera eases (1.2 s) to frame the whole route: point of view at the midpoint of all node
   positions, altitude chosen so every node is visible (about 1.6 to 2.4).
2. The whole route appears first as a faint preview: each hop drawn 1px `#ff453a` at 30% (dashed if
   the path layer supports it).
3. The packet travels hop by hop: a solid `#ff453a` dot, 8px, no glow, moving with ease-in-out over
   about 1.6 s per hop. Satellite-to-satellite hops travel along a straight 3D segment between the two
   satellites at their altitude; downlink hops travel along a smooth arc that descends from the
   satellite to the station (interpolate altitude with an ease, or use globe.gl's arc helpers).
   Endpoints follow the satellites' live positions each frame (use `nodePos(name, simMs)` every
   frame, do not freeze positions at hop start).
4. Between hops the packet waits 0.6 s on the node (store-and-forward): one thin 1px white ring that
   expands once around the node (single run, no loop).
5. Each completed hop becomes a solid 2px `#ff453a` line and stays. On arrival, one thin ring expands
   once at the destination station.
6. The final state stays on screen (full route solid red, packet resting at the station) until the
   user presses Close or plays again.
- **Do not change `simRef.current.simMs`** during playback (no teleporting satellites).
- `prefers-reduced-motion`: skip the travel; draw the full route solid immediately and show the card.
- Nothing else on the globe turns red.

### Route card (`RouteCard.tsx`, shown by `Ops.tsx`)
An Apple-style card in `.sx-material` (radius 16px), anchored bottom-centre just above the
`BottomDock` on desktop (max width ~560px), full width with 16px gutters on phones. It must not cover
the left/right rails on desktop.
- Header row: title "Packet Route" (`.sx-h3`) and a quiet close button (lucide `X`, 16px,
  aria-label "Close route").
- One line under it (`.sx-body`): "SS-1 to Tokyo, earliest arrival in 25m 27s" (use the station's
  display name if available, `formatLatency` from `features/routing/api.ts`).
- Hops as an inset-grouped list (`.sx-row`), one row per hop: "1", "SS-1 to SS-2", "Satellite link"
  or "Downlink", "q 43", and the depart time as "T+06 min" relative to the start (or "now" for 0).
  The current hop row has `--sx-surface-2` background and a small red dot; completed rows show white
  text; upcoming rows white 45%.
- Footer: "Weakest link q 43" as `.sx-caption`; the query as one `.sx-code` line, small (12px):
  `SELECT * FROM cgr_routes('SS-1', now(), 41216, 4);` (use the real origin); actions: "Replay" as
  `.sx-btn .sx-btn--sm` and "Close" as `.sx-btn--quiet`.
- While loading: the card shows "Finding the earliest route…" with no spinner gimmicks.
- Esc closes the card and clears the route. Opening a new playback replaces the old one.
- Motion: the card fades and slides up 8px (250 ms, `--sx-ease-out`); rows update without jumping.

### BottomDock
Rename the button to "Show Packet Route". While a route is playing or shown, the button reads
"Replay Route".

Keep every existing behaviour of Ops (views, selection, LiquidOverlay, `Locked`, SSE data, rails).
Title Case for headings, labels and buttons; no ALL CAPS. Strict TypeScript (no `any`, no unused
locals), React 19, no new npm packages. You cannot run shell commands; only read and edit files.
Do not run git, npm or servers. When done, list each file you changed with a one-line summary.
