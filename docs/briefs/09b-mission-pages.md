# Brief 09b: Mission pages /routing, /brain, /deploy

Read `docs/spec.md` §5, §9 (REVISED) and §10, plus `docs/briefs/05-backend.md` (the exact endpoints and shapes). Reuse the app plumbing that already exists:
- `web/src/app/api.ts` (`apiFetch`, `ApiError`)
- `web/src/app/SqlDrawer.tsx` (records are pushed automatically by `apiFetch`)
- `web/src/app/sql.tsx`
- `web/src/app/AppShell.tsx`
- the story components in `web/src/components/story/` (PacketTag, HopRail, RowCard, SqlRibbon, ChapterLabel)
- `web/src/features/ops/OpsGlobe.tsx` (it exposes a `playRoute(hops)` imperative handle)
- the tokens in `web/src/styles/tokens.css`

**Parallel-work rules.**
- Work only in `web/src/pages/{Routing,Brain,Deploy}.tsx` and new files under `web/src/features/{routing,brain,deploy}/`.
- The only change allowed in `web/src/App.tsx` is swapping the Placeholder for these 3 routes.
- Do not edit `features/ops`, `app/`, `landing/` or `components/story` except to import from them. If you really need a small export added to OpsGlobe, say so in the report rather than refactoring it.
- The backend may be offline while you work. `apiFetch` already shows an offline card, so make sure every page degrades to that card cleanly.

## /routing: Contact Graph Routing explorer (Exp 6, CO3)
- **Controls:**
  - origin satellite (a select fed by `GET /api/constellation`, operational sats only)
  - time t0 (a "now" button plus a datetime input)
  - packet size (a slider from 256 B to 120 KB; show bytes and the implied transmit seconds at 9600 bps)
  - max hops (1–5)
  - **Find routes**, which calls `GET /api/routing/routes`
- **Results list:** for each route, show its rank, destination station, arrival time (UTC mono), latency (formatted like `1h 02m`), hops, the bottleneck score as a small bar, and the explanation string. Selecting a route calls `POST /api/routing/plan` to persist it and get its hops.
  - Render a `HopRail` for those hops: SAT circles, station squares, each segment labelled `ISL 78` or `DOWNLINK 64`, depart/arrive times shown under each node.
  - Embed an `OpsGlobe` (around 55% width on desktop, stacked on mobile) and call `playRoute(hops)` so the packet animates along the route. Add a **Replay** button.
- **"Why this route?" panel:** explain earliest arrival with hops as the tiebreak, and that STOWED sats (B4) are never relays. Show a static abbreviated recursive CTE with `SqlRibbon`, and point to the drawer for the real call.
- **Queue panel:** `GET /api/routing/queue?sat=<origin>` reads `v_queue_by_mode`, shown as stacked bars per mode with the priority order TTC → SSTV → M17 → CODEC2.

## /brain: the AI router (the use case's heart)
- **Model card:**
  - `GET /api/ai/models` lists the versions (v1 active at about 0.887 accuracy, v2 weak at about 0.59), with an accuracy bar each.
  - Show the confusion matrix as a heatmap grid (ink→Somaiya-red scale with amber numbers) and per-class precision/recall in a small table.
- **Tree view:** `GET /api/ai/models/{id}/tree` returns the `dt_node` rows. Render the tree as an SVG with a top-down tidy layout; compute positions yourself.
  - With 93 nodes the tree is large, so support zoom/pan (wheel and drag) and collapse anything below the current path by default.
  - Leaves are coloured by action. The legend uses the 5 `router_action` values.
- **Inference panel:** pick a sat, then `GET /api/ai/preview/{sat}`.
  - Show the feature vector as labelled chips and **highlight the path** through the tree in Somaiya red, step by step with a short stagger animation. List the path strings.
  - Show three result cards side by side: **AI action**, **Rule action** (with the `rule_reason` sentence), and **Final action**. If they are overridden, show a red OVERRIDE stamp with the reason.
  - **Record decision** calls `POST /api/ai/decide/{sat}`. It works for director, operators and ai_router; for the analyst it must show the red "PostgreSQL refused" card, which comes from the drawer/error UI. Make sure the button stays enabled for the analyst so the refusal can be demonstrated.
- **What-if sliders:** battery_v (6.0–8.4), link_score, contact_s, queue sizes, sunlit, isl_available. Changes are debounced 250 ms and call `POST /api/ai/whatif`, which re-highlights the path and the result cards live.
  - Add a preset button, **"Force a watchdog override"**, that sets battery 6.95, link 85, contact_s 300, large SSTV queue, sunlit 0, isl 1. This should make the AI pick FULL_DOWNLINK and the watchdog override it. If the active model does not produce an override for those values, try nearby values from the whatif results and keep the one that does.
- **Decision log:** `GET /api/ai/decisions?limit=50` in a table (time, sat, ai, rule, final, overridden, source), with overridden rows tinted red. It live-updates from the SSE `decision` events on `/api/stream` via EventSource.

## /deploy: SomaiyaPod deployment and transactions (Exp 9, CO4)
- **Pod selector:** POD-B4 is the demo pod and is selected by default. `GET /api/deploy/{pod}` returns the pod, its events, the sat state and the log.
- **Deployer illustration:** an SVG of the pod with its spring plate, with the PocketQube inside or ejected depending on state. Use the real dimensions 127.4 × 57.9 × 57.2 mm (draw it your own way; you may adapt `ReleasedChapter`'s drawing).
- **Signals:** three lamp buttons, SEPARATION_SWITCH, RELEASE_TIMER and RF_BEACON. Each records the signal via `POST /api/deploy/{pod}/signal` with ok true/false toggles. Show a "N of 3 confirmed (need 2)" counter.
- **Actions:**
  - **Confirm deployment** calls `POST .../confirm {simulate_failure:false}`.
  - **Simulate failure** calls `POST .../confirm {simulate_failure:true}`.
  - **Reset demo** calls `POST /api/deploy/reset`.
- **Before/after:** after each action, show the pod and satellite rows side by side as `RowCard`s with the changed fields highlighted. For the failure, show them as identical with a "ROLLED BACK" stamp and the new `deployment_log` row (outcome ROLLED_BACK) inserting. Explain in 2 lines why the log row survives (a separate transaction, no FKs).
- **State machine diagram:** STOWED→DEPLOYED→COMMISSIONING→NOMINAL/SAFE, with the current state lit. Add a **Try illegal jump** button that calls `POST /api/console`. It doesn't need to write; instead use a small helper that shows the trigger rejection, e.g. explain it with a static example and link to `/labs/transactions`. Keep that simple.
- **Pass execution (SAVEPOINT):**
  - Pick an operational sat and one of its contacts (from `GET /api/contacts`, DOWNLINK only).
  - **Execute pass** and **Execute with stage-2 failure** call `POST /api/pass/execute`.
  - Show the returned stages as a vertical timeline: stage 1 COMMITTED, stage 2 ROLLED BACK TO SAVEPOINT. Show the before/after queue counts by mode as small bars.

## General
- Every page starts with a `ChapterLabel`-style header (`ROUTING / CONTACT GRAPH`), a one-line explanation, and Exp/CO chips.
- Handle all errors through `ApiError`. The 403/422 refusals are part of the demo and must look intentional.
- No horizontal scroll at 375 px.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
```
- Zero TypeScript errors.
- List your files.
- Explain how `/routing` drives `playRoute`.
- Do not leave a dev server running.
