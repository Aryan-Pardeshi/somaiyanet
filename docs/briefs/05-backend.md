# Brief 05: FastAPI backend, live simulator, SSE, run.py

Read `docs/spec.md`, especially §0, §5–§8 and **§10 (role picker, no login form)**. Before writing any SQL call, read these files, which already work:
- `db/03_views.sql`
- `db/04_functions.sql`
- `db/05_ai.sql`
- `db/06_triggers.sql`
- `db/07_security.sql`
- `scripts/_db.py`

The database is complete and tested. **Never re-implement in Python any logic that SQL already provides.** The backend only opens connections as the right role, calls SQL, and returns JSON.

**Parallel-work rules.** Another worker is editing `web/`. Do not touch `web/`, `db/`, `scripts/` (except reading them) or `tests/`. Use **your own DB**:
```bash
export PGPORT=55433
.venv/Scripts/python scripts/setup_db.py --db somaiyanet_w5
```
Then run the backend with `SOMAIYANET_DB=somaiyanet_w5`.

## Files to create
`backend/__init__.py`, `backend/main.py`, `backend/db.py`, `backend/session.py`, `backend/sqlbook.py`, `backend/simulator.py`, `backend/routers/{profiles,mission,routing,ai,deploy,telecommand,console,stream}.py`, `backend/tests/test_api.py`, `run.py` (repo root).

## Core design
- **`db.py`**
  - Keep one lazily created `psycopg_pool.ConnectionPool` per **login role** (min 0, max 4). Each pool connects to `SOMAIYANET_DB` (default `PGDATABASE`) on PGHOST/PGPORT with the role's password from `scripts/_db.py:role_password()`.
  - Also keep a superuser pool, used only for public `/api/stats`, LISTEN, and the profile privilege matrix.
  - Every connection sets `application_name='somaiyanet:<role>'`.
- **`session.py`**
  - The cookie `sn_role` holds `role|hmac_sha256(SESSION_SECRET, role)`. It is httpOnly and SameSite=Lax.
  - Valid roles are exactly the 5 in spec §10.
  - A FastAPI dependency `current_role()` returns 401 `{error:{code:'NO_PROFILE'}}` if the cookie is missing or invalid.
- **`sqlbook.py`**
  - Provide a helper `run(role, label, sql, params=(), exp=None, co=None, many=True)`. It executes as that role and returns rows as dicts. It also records `{label, sql (the text with %s params inlined via psycopg's `sql.Literal` for display only), exp, co, elapsed_ms, rowcount}` into a per-request list.
  - **Every** endpoint response is `{"data": ..., "sql": [ ...those records... ], "role": "<role>"}`. This feeds the UI's "SQL under the hood" drawer.
- **Errors**
  - Map `psycopg.Error` to JSON `{"error": {"sqlstate", "message", "detail", "hint"}, "sql": [...], "role"}`.
  - Status codes: `42501` gives 403, class `23` gives 409, `P0001`/`28000` give 422, `40001`/`40P01` give 409, and anything else gives 400.
  - **Never** turn a DB permission error into a generic 500. The UI shows it in red as "PostgreSQL refused".
- **Datetimes** are ISO-8601 UTC. NUMERIC values are converted to float.

## Endpoints
Public, needing no profile:
- `GET /api/health` returns `{ok, db, server_version}`.
- `GET /api/profiles` returns the 5 profiles: `{role, title, subtitle, accent, can:[short strings]}`. `can` is computed live through the superuser pool with `has_table_privilege(role, tbl, priv)` over the key tables (telemetry, telecommand, station_key, packet, contact, satellite) and `has_function_privilege` for `decide_for_satellite`, `confirm_deployment`, `sign_telecommand`.
- `POST /api/session {role}` sets the cookie after verifying it can actually connect as that role, then returns the profile. `GET /api/session` returns the current profile or 401. `DELETE /api/session` clears it.
- `GET /api/stats`: landing-page stats from `mv_kpis` + `v_constellation_status` + `payload_mode` counts + station list. Mirror the shape of `web/public/data/stats.json` (read it) but with our real numbers, and add `"source": "database"`. If the DB is unreachable, return that file's contents with `"source": "mock"`.

Profile required (each runs as the cookie's role):
- `GET /api/constellation` returns rows of `v_constellation_status` plus each sat's `tle_line1/2`, plane, slot, state.
  - **Note:** the analyst can SELECT the views, but check what `ai_router` can read. If the role is refused, return the 403 error **as-is**. Do not work around it.
- `GET /api/stations` returns `ground_station` joined to `network_node`.
- `GET /api/contacts?at=<iso>&window_min=90` returns contacts overlapping `[at - 5 min, at + window_min]`. RLS applies automatically because this runs as the role.
- `GET /api/kpis` reads `mv_kpis`. `POST /api/kpis/refresh` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis` (director only, enforced by Postgres; grant it if missing and report).
- `GET /api/alerts?limit=50`. `POST /api/alerts/{id}/ack` UPDATEs only `acknowledged`, which exercises the column privilege.
- `GET /api/routing/routes?origin=SAT-A1&t0=<iso default now>&size=4096&max_hops=4` calls `cgr_routes`.
- `POST /api/routing/plan {origin, t0, size}` calls `plan_route`, then returns `{route, hops}` from `route` and `v_route_detail`, each hop including the from/to node lat/lon (stations) or `null` (sats; the UI propagates TLEs).
- `POST /api/routing/packet/{packet_id}` calls `route_packet`.
- `GET /api/routing/queue?sat=` reads `v_queue_by_mode`.
- `GET /api/ai/models` returns the models with their metrics. `GET /api/ai/models/{id}/tree` returns every `dt_node` row.
- `GET /api/ai/preview/{sat}` returns `preview_decision` + `features_for_satellite` + `rule_reason(features)`.
- `POST /api/ai/whatif {features, model_id?}` returns `ai_decide(features)` + `rule_action` + `rule_reason` + `watchdog_violation(features, ai_action)` with **no insert**. It powers the interactive sliders.
- `POST /api/ai/decide/{sat}` calls `decide_for_satellite` and returns the inserted row. `GET /api/ai/decisions?limit=50` reads `routing_decision` ordered newest first.
- `GET /api/deploy/{pod}` returns the pod, its events, its satellite state, and the last 10 `deployment_log` rows for that pod.
- `POST /api/deploy/{pod}/signal {signal, ok, value}` calls `record_deploy_signal`.
- `POST /api/deploy/{pod}/confirm {simulate_failure}` takes a **before** snapshot (pod + sat), then runs `CALL confirm_deployment(...)` on an **autocommit** connection.
  - On a DB error, write a `deployment_log` row with outcome `ROLLED_BACK` in a **separate transaction** (mirror `reference/app/pages/1_Deployment_Tracker.py`), and still return the error JSON plus `before` and `after` snapshots.
  - On success, return `before`, `after` and the log.
- `POST /api/deploy/reset` calls `reset_deploy_demo()`.
- `POST /api/pass/execute {sat, contact_id, fail_stage2}` calls `execute_pass` and returns the stages plus the before/after queue counts by mode.
- `POST /api/telecommand {station, sat, opcode, args, forge}`:
  - Pick the nonce as `epoch_ms`.
  - If `forge` is false, get `sign_telecommand(...)` as the role. If true, use `gen_random_bytes(32)`.
  - INSERT the telecommand and return the row or the error. Expected errors: RLS denial for a station that isn't yours, a bad HMAC, and permission denied for the analyst.
  - `GET /api/telecommand?limit=50` lists them (filtered by RLS).
- `POST /api/console {query, explain}`: the SQL console.
  - Run `BEGIN READ ONLY; SET LOCAL statement_timeout='5s';`, then the query (or `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) <query>` when `explain`), then ROLLBACK.
  - Return the columns, at most 500 rows, the rowcount, and the plan JSON.
  - Reject multiple statements with a simple `;` check outside quotes; a read-only transaction is the real guard anyway.
- `GET /api/console/presets` returns about 20 named queries grouped by Exp 4–9, using our views, functions and set ops (e.g. `SELECT * FROM v_heard_by_bom_not_hel`, `SELECT * FROM cgr_routes('SAT-A1', now())`, a window-function query over telemetry, `SELECT … GROUP BY … HAVING`, `pg_stat_activity`, `SELECT xmin, xmax, ctid, * FROM deployer_pod`, `has_table_privilege` matrix).
- `GET /api/stream` is SSE (`text/event-stream`). One dedicated superuser connection runs `LISTEN telemetry; LISTEN decision;` in a background thread and fans out to the subscribers' asyncio queues. Event names are `telemetry` and `decision`, with the JSON payload as `data`. Send a heartbeat comment every 15 s. This endpoint needs no profile.

## Simulator (`backend/simulator.py`)
Enabled unless the env var `SIMULATOR=0` is set, and started from the FastAPI lifespan.
- Every 5 s, for each operational sat, INSERT one telemetry row **as `ai_router`**. Continue from each sat's last battery with small orbit-driven drift; keep B3 below 6.8 and B2 around 6.9–7.0. Call `ensure_telemetry_partitions` daily through the superuser pool.
- Every 30 s, call `decide_for_satellite` for one sat, round-robin, as `ai_router`.
- Every 60 s, run `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis` (superuser).

## Static files and run.py
- If `web/dist` exists, mount it at `/` with an SPA fallback: unknown non-`/api` paths serve `index.html`.
- `run.py` behaviour:
  1. Build `web` with `npm --prefix web run build` if `web/dist` is missing or older than `web/src`.
  2. Start `uvicorn backend.main:app` on 127.0.0.1:8000.
  3. Open the browser.

  Flags: `--no-build`, `--no-open`, `--no-sim`, `--port`.

## Tests (`backend/tests/test_api.py`)
Use httpx `TestClient`, with `SOMAIYANET_DB=somaiyanet_w5` and `SIMULATOR=0`. Cover:
- `/api/profiles` returns 5
- a session cookie round-trip
- 401 without a profile
- analyst `POST /api/telecommand` returns 403 with sqlstate 42501
- bom operator telecommand to GS-HEL is refused (RLS → 403 or 422; assert the sqlstate)
- bom operator signed telecommand to GS-BOM gives 200, `verified=true`
- forged gives 422
- the routes endpoint returns ≥ 1 route with an explanation
- whatif with battery 6.6 → final rule SAFE_TTC_ONLY, watchdog flags FULL_DOWNLINK
- deploy confirm with `simulate_failure` returns before == after + a ROLLED_BACK log, then reset
- the console rejects `DELETE FROM packet` (read-only, sqlstate 25006)
- every response carries a non-empty `sql` list

## Acceptance (run these and paste the output)
```bash
export PGPORT=55433 SOMAIYANET_DB=somaiyanet_w5 SIMULATOR=0
.venv/Scripts/python -m pytest backend/tests -q
```
Then start the server **in the background**, curl `/api/health`, `/api/profiles` and `/api/stats` and do a session plus `/api/routing/routes` (paste the outputs), then **kill the server**. Do not leave processes running.
