# Brief 07: Mission Ops globe (`/ops`)

Read `docs/spec.md` §9–§10. The friend's mission globe at `reference/app/components/globe_template.html` (about 1100 lines: globe.gl + satellite.js) is the **visual and logic source**. The user loves it, so port it faithfully into React and then extend it. Keep a credit comment on every ported file: `// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)`.

**Parallel-work rules.** Another worker is editing `web/src/sections`, `web/src/hooks`, `web/index.html` and `web/public/data`, and a third is writing `backend/`.
- **Create only new files** under `web/src/features/ops/` and `web/src/pages/Ops.tsx`.
- Do **not** edit `App.tsx`, `main.tsx`, `index.css`, `package.json` or anything else. The orchestrator wires the route.
- `globe.gl` and `satellite.js@6` are already dependencies. If you truly need another package, stop and say so in your report instead of installing it.

## The data contract
The backend is being built in parallel, so code against this contract and ship a mock fixture. Every response is `{data, sql, role}` (spec §10, brief 05).
- `GET /api/constellation`: `data` is a list of objects: `{node_id, display_name, plane, slot, state, battery_v, last_seen, tle_line1, tle_line2, next_downlink_station?, next_downlink_start?, queued_bytes?}`
- `GET /api/stations`: `data` is a list of objects: `{node_id, display_name, city, country, latitude, longitude, min_elevation_deg, is_primary}`
- `GET /api/contacts?at=ISO&window_min=90`: `data` is a list of objects: `{contact_id, kind:'ISL'|'DOWNLINK', from_node, to_node, start_ts, end_ts, link_score, min_range_km}`
- `GET /api/kpis`: `data` is `[{sats_total, sats_operational, packets_queued, packets_delivered_24h, bytes_delivered_24h, contacts_next_24h, isl_contacts_next_24h, ai_overrides_24h, refreshed_at}]`
- `GET /api/alerts?limit=20`: `data` is a list of objects: `{alert_id, sat_id, severity, message, raised_at, acknowledged}`
- SSE `GET /api/stream`: events `telemetry` (`{sat_id, ts, battery_v, temp_c, rssi_dbm, mode_active}`) and `decision` (`{sat_id, final_action, overridden}`)
- An error response is `{error:{sqlstate,message}}` with HTTP 401 (no profile) or 403 (Postgres refused).

**Build `web/src/features/ops/api.ts`:**
- Typed fetchers, plus a `useOpsData()` hook that polls the contacts and KPIs every 30 s and subscribes to SSE.
- **Mock fallback.** If a fetch fails with a network error or 404, use `web/src/features/ops/mock.ts`. In it, generate 8 TLEs in the browser that match the backend's constellation:
  - SSO, inclination 97.5°, about 525 km
  - plane A RAAN 75° and plane B RAAN 105°
  - mean anomaly spacing 12°
  - satellite.js `twoline2satrec` needs real TLE strings, so hard-code 8 valid TLE line pairs computed offline, or build them with satellite.js's json/`sgp4init` path.
  - mock stations from `db/02_seed.sql`
  - contacts derived in the browser: an ISL is any sat pair within 2000 km; a downlink is any station with elevation ≥ 10°
- Show a small "MOCK DATA" chip when you are on the mock.
- On a 401, show a centered card: "Pick a console profile first" with a link to `/console`.

## The globe (`OpsGlobe.tsx`), porting the friend's behaviour
Port these from the template:
- the Blue Marble day texture, night city lights on the unlit side, the bump/topology map and the clouds (assets are in `web/public/assets/textures/`)
- the **real sub-solar terminator** from the current UTC time (his `updateSun`)
- the top bar with the UTC clock
- satellites as glowing markers propagated **live from their TLEs** with satellite.js every animation tick
- an orbit trail (ground track) for the selected sat
- pulsing ground stations
- the click-to-select satellite side panel with a sparkline
- the speed control (1×, 10×, 60× simulated time)
- the legend
- the boot overlay "Acquiring orbit…"

Then **extend it** (this is what makes ours better):
1. **Live ISL lines.** Draw straight 3D lines *at orbital altitude* between sats that currently have an active ISL contact, colored by link_score (blue gradient). Use `customLayerData` with three.js lines, or `pathsData` with altitude; straight chords, not ground arcs.
2. **Downlink beams.** Draw a line from each sat to every station it is currently in contact with, in **green**.
3. **Plane colouring.** Plane A sats use `#3d6bff` and plane B sats `#8fa8ff`. A SAFE sat gets a **Somaiya red** (`#d7263d`) pulsing ring. A STOWED sat (B4) is not drawn and is listed in the panel as "in SomaiyaPod".
4. **Route playback API.** Export a `playRoute(hops)` imperative handle, where each hop is `{from_node, to_node, depart_ts, arrive_ts, kind}`. It animates a bright packet dot travelling hop by hop along those lines, jumping the simulated clock to each `depart_ts`. The `/routing` page will use this later; build it now and demo it from a dev-only button that plays a fake 3-hop route.
5. **Side rail (right)** with these panels:
   - KPI tiles from `/api/kpis`
   - an alerts list (CRITICAL in red, WARN in amber)
   - a **live telemetry ticker** from SSE showing the last 20 events (sat, battery, mode), with a flash on every update
   - a decision feed with the overridden ones highlighted red
6. **Selected-sat panel.** It shows the state, battery (a sparkline built from the SSE values so far), the next downlink, the queued bytes, and the plane/slot.

Also create `web/src/pages/Ops.tsx`: a full-viewport layout with the globe on the left and the rail on the right. On mobile (under 768 px) the rail stacks below a 60 vh globe. Use the black + `#3d6bff` palette, Inter/JetBrains Mono, and the `[ SECTION ]` labels.

Performance: target 60 fps on a laptop. Throttle React state updates (refs for per-frame positions) and never set state per animation frame.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit 2>&1 | tail -20 && npm run build && npm run lint
```
- Zero TypeScript errors.
- List your files.
- Explain in 5 lines how `playRoute` works and how the mock fallback is triggered.
- Do not leave a dev server running.
- The orchestrator will wire `/ops` in `App.tsx` and test it in a browser.
