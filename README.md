# SomaiyaNet

A DBMS mini project built around use case **KJS-SRS-01**: the SomaiyaSat PocketQube, the SomaiyaPod
deployer, and an AI-based router that decides what each satellite sends (TT&C telemetry, SSTV images,
M17 and Codec2 voice) and how it hops between satellites to reach a ground station.

The point of the project is the database. Routing, the AI model, safety rules, permissions and the
audit trail all live in PostgreSQL; the web app shows each piece and the exact SQL behind it.

- 4 satellites: SomaiyaSat-1 to -3 in one sun-synchronous orbit (525 km), SomaiyaSat-4 still in its pod
- 6 ground stations, KJSIT Mumbai being ours
- 5 database roles you can switch between, each seeing only what PostgreSQL allows

## What it covers (Experiments 1 to 9, CO1 to CO4)

| Exp | Where to see it |
|---|---|
| 1 ER / EER | Two generalizations (`network_node` to `satellite` / `ground_station`, `packet` to `ttc_frame` / `sstv_image` / `voice_frame`), weak entities (`deployment_event`, `dt_node`, `route_hop`). Schema lab draws the model from the catalog. |
| 2 Mapping | Class-table inheritance with composite FKs and a deferred totality check, weak-entity composite keys, M:N through `contact` and `route_hop`. |
| 3 DDL | Domains (`voltage`, `score_0_100`, `callsign`), enums, CHECK, UNIQUE, `EXCLUDE USING gist` on overlapping contacts, generated columns, telemetry range-partitioned by day. |
| 4 DML | Seed data, the simulator's live inserts, presets in the SQL console. |
| 5 Aggregates and set operations | `v_station_workload` (GROUP BY / HAVING), `v_low_power`, UNION / INTERSECT / EXCEPT views ("heard by Mumbai but not Helsinki"). |
| 6 Nested queries, views, joins | Multi-join `v_constellation_status`, correlated subqueries, materialized `mv_kpis`, the recursive CTE `cgr_routes()` (Contact Graph Routing with a CYCLE clause). |
| 7 DCL | Group and login roles, column privileges (`station_key.secret`), row-level security per station, SECURITY DEFINER functions; the app shows real `42501` denials. |
| 8 Indexing | B-tree, composite, BRIN, GIN on JSONB, partial, covering (INCLUDE) and hash indexes with EXPLAIN ANALYZE, plus partition pruning. |
| 9 TCL, ACID, concurrency | Deployment as one transaction with COMMIT / ROLLBACK, SAVEPOINT during a pass, and a two-session lab: lost update, non-repeatable read, write skew (`40001`), deadlock (`40P01`), SKIP LOCKED, MVCC (`xmin` / `xmax`), WAL positions. |
| CO3 Normalization | A flight-log sheet taken from UNF to 1NF, 2NF, 3NF and BCNF, with the anomalies and a lossless-join check. |

The AI router is a scikit-learn decision tree (93 nodes, 88.7% test accuracy) stored as rows in
`dt_node` and evaluated by a recursive SQL query (`ai_decide`). A watchdog (`watchdog_violation`)
checks safety rules and overrides the model when needed, and every decision is logged.

## Stack

PostgreSQL 18, FastAPI (Python 3.12+, psycopg 3), React 19 + TypeScript + Vite + Tailwind,
three.js / react-three-fiber, globe.gl and satellite.js for the live globe.

## Run it

Prerequisites: PostgreSQL 18 running locally, Python 3.12 or newer, Node 20 or newer.

1. Configure the database connection:
   ```
   copy .env.example .env
   ```
   then set `PGPASSWORD` to your `postgres` password in `.env` (the file is gitignored).

2. Install dependencies:
   ```
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   npm --prefix web install
   ```

3. Build the database (drops and recreates `somaiyanet`, about one minute):
   ```
   .venv\Scripts\python scripts/setup_db.py
   ```
   It runs `db/01_schema.sql` to `db/09_normalization.sql`, then generates the orbits, contacts,
   a week of telemetry and packets, and trains the AI router.

4. Start everything on one port:
   ```
   .venv\Scripts\python run.py
   ```
   This builds the web app and serves it with the API at http://127.0.0.1:8000. Open it, scroll the
   landing page, then press **Take the console** and pick a role.

For development, run the API (`uvicorn backend.main:app --port 8000`) and the web dev server
(`npm --prefix web run dev`) separately.

## Roles

| Role | Lands on | Can |
|---|---|---|
| Mission director | Command center | everything: deploy, telecommands, alerts, all labs |
| Mumbai / Espoo station operator | Command center (own station) | only their station's passes and telecommands (row-level security) |
| Student analyst | SQL console | read only; locked buttons can still be tried to show the real `42501` |
| AI router | AI router | read its own model and log decisions; can write telemetry but not read it |

## Tests

```
.venv\Scripts\python -m pytest tests -q
.venv\Scripts\python -m pytest backend/tests -q
```
19 SQL tests (constraints, triggers, permissions, routing, transactions) and 22 API tests.

## Layout

```
db/        SQL files 01 to 09 (schema, seed, views, functions, AI, triggers, security, index lab, normalization)
scripts/   setup_db.py and the data generators (constellation, contacts, telemetry, packets, router training)
backend/   FastAPI app: one router per page or lab, a live telemetry simulator, SSE stream
web/       React app: landing page, command center, routing, AI router, deploy, six labs
tests/     SQL-level tests
docs/      plan, spec and design notes
```

## Credits

- Ideas for the globe, the Earth textures and the scroll-driven landing page were adapted from
  [lakshyamody/dbmsproj](https://github.com/lakshyamody/dbmsproj). The database design, routing,
  AI router, security model and labs are our own.
- Use case KJS-SRS-01 by Dr. Umesh Shinde (KJSIT) and Dr. Shailesh Nikam (KJSSE), in collaboration
  with ReOrbit, Finland.
