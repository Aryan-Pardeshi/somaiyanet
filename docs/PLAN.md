# SomaiyaNet — Constellation Mission DB (DBMS mini project, use case KJS-SRS-01)

## Context

The DBMS mini project has to be built around AI use case **KJS-SRS-01**: the SomaiyaSat PocketQube, the SomaiyaPod deployer, and an *AI-based inter-satellite data router* that handles M17, Codec2, SSTV and TT&C traffic. It is graded on Problem Definition (5) and Output/Presentation (5), and it has to cover Experiments 1–9 and CO1–CO4.

A friend's project (`lakshyamody/dbmsproj`) already sets a high bar. It has PostgreSQL, a Streamlit dashboard, a React/R3F scroll landing page, a globe.gl mission globe, a rule-based `plan_pass()`, TCL commit/rollback/savepoint, 3 roles and B-tree index benchmarks.

**What his project is missing, and what ours is built around:**
- **Inter-satellite routing.** It is in the PDF's title and he skipped it.
- **An actual AI model.** He has rule-based logic only.
- **Concurrency control.** Isolation levels, locking, deadlock and MVCC are all in Exp 9 / CO4, and he only does COMMIT, ROLLBACK and SAVEPOINT.
- **Triggers.**
- **Row-Level Security** and column privileges.
- **Normalization.** It is in CO3 and he has none.
- **EER specialization.**
- **Index types beyond B-tree,** plus partitioning.

**Decisions made with you:**
- Stack: React (Vite) + FastAPI + PostgreSQL 18 (already at `C:\Program Files\PostgreSQL\18`). Node 24, Python 3.14 and Docker are present.
- Reuse his globe, satellite and landing code, then extend it.
- Look: his black + electric blue `#3d6bff`, plus Somaiya red, used sparingly.
- Include an AI model stored inside the DB.
- Team: you + me. Deadline: within 1 week.
- Deliverables: app + project report + presentation deck + demo script & viva Q&A.

**Integrity note:** credit the friend's repo in the README and the report acknowledgement for the reused globe and landing code. It is safer for viva, and our DB layer is original anyway.

## Architecture

```
DBMS/somaiyanet/            (git init)
├── db/          01_types_schema 02_seed 03_views 04_functions 05_triggers
│                06_security 07_indexes(bench) 08_normalization  (+ 00_reset)
├── scripts/     setup_db.py  build_constellation.py  compute_contacts.py
│                generate_telemetry.py  train_router.py  fetch_tles.py(reuse)
├── backend/     FastAPI: main.py, db.py (per-role psycopg3 pools), routers/
│                auth, mission, routing, ai, deploy, labs_{tx,security,index,norm,sql}, stream(SSE)
├── web/         Vite React TS + Tailwind v4 + shadcn + R3F + GSAP + globe.gl
│                /  landing   /login   /ops   /routing   /brain   /deploy
│                /labs/{schema,normalization,transactions,security,indexing,sql}
├── tests/       pytest against throwaway DB somaiyanet_test
├── reference/   friend repo clone (gitignored, copy-from only)
└── docs/        report, deck, demo-script.md, viva-qa.md
```

- `run.py` builds the web app, then serves both the API and `web/dist` from FastAPI on **:8000**. One port instead of his two.
- **Live data:** a simulator task inserts telemetry *as the `ai_router` role*. A trigger runs `pg_notify`, the backend `LISTEN`s, and the UI receives it over SSE. The DB itself pushes events.
- Every page has a **"SQL under the hood" drawer** showing the exact SQL that ran, tagged with its Exp/CO. This is the presentation hook.

## Database design (EER → relational)

- **Generalization (disjoint, total).**
  - `network_node(node_id, node_type)` is the supertype of `satellite` and `ground_station`. Both use the shared PK as an FK, i.e. class-table mapping.
  - `packet` is the supertype of `ttc_frame`, `sstv_image(bytea)` and `voice_frame(codec M17|CODEC2)`.
- **Weak entities.**
  - `deployment_event(pod_id, seq)` records the separation-switch, timer and beacon signals.
  - `dt_node(model_id, node_id)` holds the decision-tree nodes.
- **Core tables:**
  - `deployer_pod` (1:1 with satellite)
  - `payload_mode` (lookup: priority, bitrate, power)
  - `telemetry`: **range-partitioned by day**, with a JSONB housekeeping column
  - `contact(from_node, to_node, start_ts, end_ts, kind ISL|DOWNLINK, rate_bps, link_score)`: `EXCLUDE USING gist` forbids overlapping windows for the same pair
  - `route` + `route_hop`
  - `ai_model`, `ai_model_metric`
  - `routing_decision`: AI action, rule action, final action, override flag, explanation
  - `telecommand`: HMAC-signed with pgcrypto
  - `station_key`: secret column, hidden by column privileges
  - `audit_log`: JSONB old/new
  - `satellite_tle` (real amateur sats, UPSERT, reused idea)
- **DDL showcase:** `CREATE DOMAIN voltage`, enums, CHECK, UNIQUE, generated columns, EXCLUDE, partitions.

### Constellation and inter-satellite routing (headline feature)

- `build_constellation.py` creates 8 SomaiyaSats in 2 SSO planes as a "string of pearls" spaced about 4° apart. That keeps in-plane ISLs always up, and cross-plane links appear near the poles.
- The sats get synthetic TLEs via `sgp4init` and `export_tle`. The globe propagates the same TLEs with satellite.js, so the DB and the globe agree.
- There are 6 ground stations: KJSIT Mumbai (primary), Espoo/Helsinki (ReOrbit), Bengaluru, Tokyo, Svalbard and Cape Town.
- `compute_contacts.py` steps every 30 s over 24 h:
  - ISL when range is under 1500 km and Earth is not occluding the link
  - Downlink when elevation is above the station mask
  - It merges the samples into `contact` rows. `link_score_from_pass()` is an SQL function using the friend's FSPL + elevation idea.
- **Contact Graph Routing in SQL** (real DTN technique, used by NASA ION). `cgr_routes(origin, t0, max_hops)` is a recursive CTE that chains time-ordered contacts. Each next contact must end after the previous arrival.
  - It uses PG14+ `CYCLE … SET is_cycle USING path` and a hop limit.
  - It returns earliest-arrival routes to any ground node, ranked by arrival time, then hops, then the bottleneck link score.
  - Routes are persisted to `route_hop` and animated hop-by-hop on the globe.

### AI router stored in the DB

- `train_router.py` simulates about 20k pass scenarios. Features: battery_v, link_score, contact_s, queue bytes per mode, sunlit, isl_available.
- An oracle utility labels each scenario with one of these actions:
  - `SAFE_TTC_ONLY`
  - `TTC_VOICE`
  - `FULL_DOWNLINK`
  - `RELAY_VIA_ISL`
  - `HOLD`
- An sklearn `DecisionTreeClassifier(max_depth≈5)` is trained, then exported as `dt_node` rows. Accuracy and the confusion matrix go to `ai_model_metric`, with versioned models.
- `ai_decide(model, features jsonb)` runs inference with a recursive CTE that walks the tree. It returns the action and the human-readable path, which covers the PDF's Responsible AI requirement.
- `final_decision()` is a **watchdog** that checks the safety invariants:
  - TT&C always goes first
  - battery under 6.8 V means safe mode
  - link score under 40 means no SSTV

  If the AI output breaks an invariant, the watchdog overrides it with the rule fallback and logs the override (AI Security High). Ground `telecommand OVERRIDE_MODE` enables human-in-the-loop control.
- `dispatch(sat)` claims packets with `FOR UPDATE SKIP LOCKED`, so multiple router workers can run safely. This ties into the concurrency lab.

### Triggers

- **Satellite state machine** (STOWED→DEPLOYED→COMMISSIONING→NOMINAL/SAFE): an illegal transition raises.
- **Generic audit trigger:** writes `to_jsonb(OLD/NEW)` to `audit_log`.
- **Telemetry insert:** updates the sat's `last_seen`/battery, raises a low-power alert and runs `pg_notify`.
- **Telecommand insert:** verifies the HMAC and rejects forgeries.

### Security (DCL)

- Group roles (NOLOGIN), with login roles inheriting from them:
  - `mission_director`
  - `station_operator_bom` and `station_operator_hel`
  - `student_analyst`
  - `ai_router`
- GRANT/REVOKE, including `WITH GRANT OPTION`.
- Column privileges: nobody except the director can read `station_key.secret`.
- **RLS:** each station operator sees and commands only their own station's contacts and telecommands.
- `SECURITY DEFINER` functions: the analyst can plan but not execute.

## Feature → Experiment / CO map (goes in the report and the UI drawers)

| Exp | Where |
|---|---|
| 1 ER/EER | Generalization ×2, weak entities ×2; live `/labs/schema` diagram built from the catalog |
| 2 Mapping | Class-table inheritance, weak-entity composite PKs, M:N via `contact`/`route_hop`; explained in `/labs/schema` and the report |
| 3 DDL | Domains, enums, CHECK, UNIQUE, EXCLUDE, generated columns, partitioning |
| 4 DML | Seed, simulator inserts, TLE UPSERT `ON CONFLICT … WHERE`, SQL console presets |
| 5 Aggregates / sets | `v_station_workload` (GROUP BY/HAVING), `v_low_power`, LIKE on callsigns, UNION/INTERSECT/EXCEPT ("sats heard by Mumbai EXCEPT Helsinki") |
| 6 Nested / views / joins | Multi-join `v_constellation_status`, correlated subqueries, materialized `mv_kpis` (REFRESH CONCURRENTLY), recursive CTE, window functions |
| 7 DCL | Role hierarchy, column privileges, RLS, SECURITY DEFINER; live privilege matrix via `has_table_privilege` |
| 8 Indexing | B-tree/composite, **BRIN** on telemetry ts, **GIN** on JSONB, partial (unsent packets), covering INCLUDE, hash; index sizes + EXPLAIN ANALYZE + partition pruning |
| 9 TCL / ACID / concurrency | Deployment procedure COMMIT/ROLLBACK (2-of-3 signal rule), SAVEPOINT pass execution, **two-session isolation lab** (lost update, non-repeatable read, write skew under SERIALIZABLE, deadlock 40P01, SKIP LOCKED), MVCC `xmin/xmax/ctid`, WAL LSN per transaction |
| CO3 Normalization | `/labs/normalization`: UNF flight-log sheet → 1NF → 2NF → 3NF → BCNF, with FDs, live insert/update/delete anomalies, and a lossless-join check (`EXCEPT` = ∅) |

## UI

- **Visual identity:** his black + `#3d6bff`, Inter and JetBrains Mono. **Somaiya red** (`#d7263d`-ish) appears only on the brand mark, critical alerts, AI overrides and permission denials.
- **Landing:** port his IntroGate, Hero R3F scenes, TopBar, Footer and sections, with new copy. Add 2 new sections:
  - "The Constellation Routes Itself": an animated ISL hop chain
  - "The Database Is Mission Control": a grid of DB concepts linking to the labs
- **/ops:** port `globe_template.html` logic into a React `OpsGlobe` component. Reused functions: `subpoint`, `lookAngles`, `updateSun`, `makeMarker`, `tick`, `sparkline`. On top of his globe it adds:
  - the constellation
  - live ISL lines between sats
  - active downlink arcs
  - real ham sats behind a toggle
  - a KPI rail (`mv_kpis`)
  - a live telemetry ticker over SSE
  - alerts
- **/routing:** pick an origin sat and a time, see the CGR routes, then a hop table, an animated route on the globe, and the SQL.
- **/brain:** a rendered decision tree with the inference path highlighted, AI vs rule vs final decision, the override log and model versions.
- **/deploy:** the SomaiyaPod sequence with commit/rollback/savepoint and the state-machine trigger rejecting illegal moves.
- **/labs/\*:** as in the table above. `/labs/sql` is a console that runs as the chosen role inside a READ ONLY transaction with `statement_timeout`. It has an EXPLAIN plan-tree visualizer and per-experiment preset queries.

## Build order (1 week, each day leaves something demoable)

1. **D1 Foundation:**
   - clone the friend repo to `reference/` and scaffold the monorepo
   - write `db/01–02`, `setup_db.py` (reads `.env`; you set `PGPASSWORD` for postgres yourself), `build_constellation.py` and `compute_contacts.py`
   - stand up the FastAPI skeleton with role login (server-side session, httponly cookie)
2. **D2 SQL core:**
   - views, `cgr_routes`, triggers, security + RLS
   - `train_router.py`, `ai_decide` and the watchdog
   - pytest invariants
3. **D3 Frontend shell:** landing port + restyle + new sections, app shell, OpsGlobe with constellation/ISL, SSE ticker.
4. **D4 Mission pages:** /routing, /brain, /deploy, plus the SQL drawers.
5. **D5 DB labs:** transactions/concurrency, security, indexing/partitioning, normalization, schema explorer, SQL console.
6. **D6 Hardening:** run the full test suite, a visual pass in the browser pane (desktop + mobile), screenshots and a `run.py` polish.
7. **D7 Docs:**
   - the report (problem definition, objectives, scope, EER, mapping, normalization, SQL per experiment, screenshots, conclusion)
   - the deck
   - `demo-script.md` and `viva-qa.md`
   - Output format is confirmed then: Word/PPTX for submission vs Claude Docs/Slides.

**Cut line if time runs short:** keep everything through D4, plus the transactions, security and indexing labs. Drop the real-ham-sat toggle first, then the schema explorer (a static EER image in the report is enough).

**No LLM in the build.** The AI is the in-DB decision tree only, and the app runs fully offline. **Future scope** (report + deck only, not built): "Ask-the-DB", an LLM that turns plain-English questions into SQL. That SQL runs as the read-only `student_analyst` role, so Postgres permissions keep it safe. This matches the PDF's Generative AI row (Low relevance, ground-segment tools only).

## Who does what

- **Me (Claude):**
  - small 1–2 line edits and short commands
  - writing every delegation brief
  - reviewing the diffs
  - running tests and the browser checks
  - the git commits
- **Big tasks go to OpenCode:**
  `opencode run --model opencode/muse-spark-1.3-contributor-free --auto --dir <somaiyanet> --title "<task>" -f docs/spec.md -f docs/briefs/NN-<task>.md "Implement the attached brief…"`. Each one runs as a background Bash job.
  - Model fallback: `opencode/mimo-v2.6-flash-free`.
  - CLI fallback: `agy -p "<same brief>" --mode accept-edits`.
  - Not used (too weak): ling/nemotron-lightning/space-bunny.
- **The workers start cold, so every brief is self-contained.** It states:
  - the goal
  - the exact files to create
  - the fixed interfaces: table/column names, function signatures, API routes and JSON shapes
  - the "do not touch" paths
  - the acceptance commands
  
  `docs/spec.md` is this design with the exact schema contracts, and it is attached to every brief. Workers never commit.
- **Gate after each task:** I run the acceptance commands, pytest, and the browser check where it applies, then review the diff. If it is good I commit. If it is broken, I fix it myself when the fix is small, or re-delegate with the failure output. At most 2 workers run in parallel, and only on separate directories (`db/`+`scripts/` vs `web/`).
- **Delegation queue:**
  1. schema + seed + `setup_db.py`
  2. constellation/contacts/telemetry scripts
  3. views/functions/triggers/security + pytest
  4. AI training + `ai_decide`/watchdog
  5. FastAPI backend
  6. landing port + restyle
  7. OpsGlobe port
  8. /routing /brain /deploy
  9. labs (one brief each)
  10. report/deck drafts, which I then fact-check against the running app

  I do D1 scaffolding myself (git init, clone `reference/`, `.env.example`, copy assets).

## Files reused from the friend's repo (`reference/` → ours)

- `landing/src/components/{three,layout,ui,brand}/*`, `lib/{gsap,lenis,landmask,palette}.ts`, `hooks/useScrollScene.ts`, `sections/*` (copy rewritten)
- `app/components/globe_template.html` → `web/src/features/ops/OpsGlobe.tsx` (logic ported; globe.gl + satellite.js from npm)
- Textures and fonts from `landing/public/assets/`
- `scripts/_orbit.py`, `scripts/fetch_tles.py`, and the formula idea behind `link_score_from_pass`

## Verification

- `python scripts/setup_db.py`: the fresh DB builds with no errors, idempotently.
- `pytest tests/`, run against `somaiyanet_test`:
  - every DDL constraint rejects bad rows
  - role denials raise 42501
  - RLS isolates stations
  - every CGR hop starts at or after the previous arrival, ends at a ground node and contains no cycles
  - the watchdog never emits a decision without TT&C, and forces SAFE below 6.8 V
  - the state-machine trigger rejects illegal transitions
  - a forged telecommand HMAC is rejected
  - the concurrency scenarios produce the expected 40001 and 40P01 errors and the SKIP LOCKED workers claim disjoint packets
- `python run.py` serves :8000. Walk every route in the built-in browser pane: globe renders, SSE ticks, routes animate, every lab completes, no console errors. Check the mobile layout too.
- Read the demo script end to end against the running app before the docs are finalized.
