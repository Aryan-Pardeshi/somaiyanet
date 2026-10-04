# Brief 01: Schema, seed, setup pipeline

You are implementing the database foundation of SomaiyaNet. Read `docs/spec.md` first; it is the source of truth. Follow §0 (ground rules) exactly.

## Goal
Get a fresh PostgreSQL database `somaiyanet` built from SQL files by one idempotent Python command.

## Files to create (and nothing else)
1. `db/01_schema.sql`. Implement **every** object in spec §2, in dependency order:
   - extensions
   - domains, enums
   - network_node, ground_station, deployer_pod, satellite, sat_state_transition, deployment_event, deployment_log, payload_mode
   - packet + its subtypes
   - telemetry (partitioned) + `ensure_telemetry_partitions()` + the default partition + the initial call
   - contact (with EXCLUDE + generated columns + 2 indexes)
   - route, route_hop, then the `ALTER TABLE packet` FK
   - ai_model, dt_node, ai_model_metric, routing_decision
   - station_key, telecommand, alert, audit_log, satellite_tle

   Use the exact names, types and constraints from spec §2. Every table gets a 1–3 line comment explaining the design choice. Also add `COMMENT ON TABLE` for the EER-relevant tables (supertypes, subtypes, weak entities), because the schema-explorer page reads these comments. Header: `-- [Exp 1-3: EER -> relational mapping + DDL, CO1/CO2]`.
2. `db/02_seed.sql`. Implement spec §3 exactly: payload_mode, sat_state_transition, 6 ground stations (network_node + ground_station), station_key, 8 deployer pods, and the deployment_event rows. Do **not** seed satellites. Header `-- [Exp 4 - DML, CO2]`.
3. `db/04_functions.sql`. For now it contains **only** `link_score_downlink` and `link_score_isl` from spec §5, with a header comment and a note that more functions are appended by a later task. The next task needs these functions.
4. `scripts/_db.py`. psycopg 3 helper with:
   - `load_env()` (dotenv from repo root)
   - `settings()`, which returns a dict from PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
   - `connect(dbname=None, user=None, password=None, autocommit=False) -> psycopg.Connection`
   - `role_password(role_name) -> str`, which maps `mission_director -> MISSION_DIRECTOR_PASSWORD`, `station_operator_bom -> STATION_BOM_PASSWORD`, `station_operator_hel -> STATION_HEL_PASSWORD`, `student_analyst -> STUDENT_ANALYST_PASSWORD` and `ai_router -> AI_ROUTER_PASSWORD`, using the `.env.example` defaults if they are unset.
   
   The target db name comes from an env override that setup_db sets (see below).
5. `scripts/setup_db.py`, per spec §1:
   - CLI `--db NAME`, `--test` (uses TEST_PGDATABASE), `--sql-only`.
   - Steps:
     1. Terminate other backends on the target DB, `DROP DATABASE IF EXISTS`, then `CREATE DATABASE`. This runs from the `postgres` maintenance DB with autocommit.
     2. Run `db/01..09_*.sql` in filename order as the superuser. Skip any file that does not exist yet, and print a note when you do. For `07_security.sql`, substitute the `__DB__` and `__*_PASSWORD__` tokens first. Run each file in a single `conn.execute(sql_text)` with autocommit so procedures with COMMIT are fine. On error, print the file name and the Postgres error message, then exit 1.
     3. Unless `--sql-only`, run the data steps `build_constellation, compute_contacts, generate_telemetry, generate_packets, train_router`. Import each from `scripts/` and call `run(conn_factory)`, where `conn_factory(user=None, password=None, autocommit=False)` returns a psycopg connection to the target DB. Skip a missing module with a warning.
     4. `REFRESH MATERIALIZED VIEW mv_kpis` if it exists, then `ANALYZE`, then print a summary of the row counts of the main tables.
   - The target DB name must be visible to the data steps. Set `os.environ['SOMAIYANET_DB']` and make `_db.connect()` default to it.
6. `requirements.txt` listing: `psycopg[binary,pool]`, `python-dotenv`, `sgp4`, `numpy`, `scikit-learn`, `fastapi`, `uvicorn[standard]`, `pytest`, `httpx`.

## Do not touch
`docs/`, `reference/`, `.env`, `.env.example`, `.gitignore`, and anything not listed above.

## Acceptance (run these and paste the output in your final report)
```bash
.venv/Scripts/python scripts/setup_db.py --sql-only
.venv/Scripts/python scripts/setup_db.py --test --sql-only
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d somaiyanet -c "\dt" -c "SELECT count(*) FROM ground_station" -c "SELECT link_score_downlink(10, 1500), link_score_downlink(80, 530), link_score_isl(1440)"
```
(psql needs `PGPASSWORD`. Export it from `.env` in the same shell line, and do not echo it.)

Then run these negative checks in psql. **Each must fail** with a constraint error, and you should show the error lines:
- Insert into `ground_station` with kind 'SAT'.
- Insert two overlapping contacts for the same pair. To do this, create 2 throwaway SAT nodes inside a transaction, then ROLLBACK.
- Insert a packet with `size_bytes = 5`.
- Insert a second `is_primary = TRUE` station.

If the target `.env` still has `PGPASSWORD=change_me`, stop and report that the user must set the real postgres password. Do not guess passwords.
