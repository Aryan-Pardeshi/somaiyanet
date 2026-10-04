# Brief 10a: DBMS labs, SQL + backend (transactions, security, indexing, normalization, schema)

Read `docs/spec.md` (all sections, especially §0, §2, §8) and `docs/briefs/05-backend.md`. Then read the backend that already exists, `backend/` (`db.py`, `sqlbook.py`, `session.py`, `main.py` and its routers), and follow its patterns exactly: the `{data, sql, role}` envelope, the error mapping, and per-role pools.

These labs are where the **Exp 7, 8, 9 and CO3 normalization** marks come from. They must be correct, deterministic and explainable.

**Parallel-work rules.** A web worker is in `web/`, so don't touch it. Use your own DB: `export PGPORT=55433; .venv/Scripts/python scripts/setup_db.py --db somaiyanet_w10`.

## SQL files
1. **`db/08_bench.sql`** `[Exp 8 - indexing, CO3]`. It does not create the bench indexes at setup. Instead it defines SECURITY DEFINER functions, with EXECUTE granted to grp_director and grp_analyst (add the grants at the end of *this* file):
   - `bench_index_catalog()` returns `TABLE(key TEXT, kind TEXT, ddl TEXT, purpose TEXT)` with 6 entries:
     - `btree_cube_ts`: `CREATE INDEX ix_bench_tel_sat_ts ON telemetry (sat_id, ts)`
     - `brin_ts`: `... USING brin (ts) WITH (pages_per_range=16)`
     - `gin_housekeeping`: `... USING gin (housekeeping jsonb_path_ops)`
     - `partial_queued`: `ON packet (origin_sat, created_at) WHERE status='QUEUED'`
     - `covering_contact`: `ON contact (to_node, start_ts) INCLUDE (link_score, duration_s)`
     - `hash_callsign`: `ON network_node USING hash (callsign)`
   - `bench_apply(p_key TEXT)` / `bench_drop(p_key TEXT)` / `bench_drop_all()`, each followed by `ANALYZE` of the table.
   - `bench_index_sizes()` returns the name, table, kind and `pg_size_pretty(pg_relation_size)` of the bench indexes plus the table sizes.
   - `bench_bulk_telemetry(p_rows INT DEFAULT 500000)` inserts synthetic rows spread over the existing partitions (`generate_series`). It needs the superuser, which SECURITY DEFINER provides, and is guarded to director only via `pg_has_role`.
   - `bench_queries()` returns `TABLE(key TEXT, title TEXT, sql TEXT, best_index TEXT)`. There is one query per index plus a **partition-pruning** query: `SELECT count(*) FROM telemetry WHERE ts >= now()-interval '6 hours'`, whose plan should show only 1–2 partitions scanned.
2. **`db/09_normalization.sql`** `[CO3 - normalization: UNF → 1NF → 2NF → 3NF → BCNF]`, in a **separate schema `norm`** so it never touches mission tables.
   - **UNF** `norm.flight_log_unf`:

     | column | type |
     |---|---|
     | log_no | INT PK |
     | sat_name | TEXT |
     | sat_plane | TEXT |
     | pod_serial | TEXT |
     | pod_mechanism | TEXT |
     | station_city | TEXT |
     | station_callsign | TEXT |
     | pass_date | DATE |
     | modes_sent | TEXT, e.g. `'TTC:512;SSTV:40960;M17:8000'` (a repeating group) |
     | operator_name | TEXT |
     | operator_phone | TEXT |

     Seed it with about 12 realistic rows derived from our sats and stations. Some rows repeat the sat/pod/station facts, so the anomalies are visible.
   - **1NF** `norm.flight_log_1nf` splits the repeating group into one row per mode, with PK `(log_no, mode)` and columns `bytes`, etc.
   - **2NF:** remove partial dependencies on `log_no` alone into `norm.pass_log(log_no PK, sat_name, station_callsign, pass_date, operator_name, operator_phone)`, with `norm.pass_mode(log_no, mode, bytes)`.
   - **3NF:** remove the transitive dependencies:
     - `sat_name → sat_plane, pod_serial` into `norm.sat`
     - `pod_serial → pod_mechanism` into `norm.pod`
     - `station_callsign → station_city` into `norm.station`
     - `operator_name → operator_phone` into `norm.operator`
   - **BCNF:** add a realistic case. Assume the rule "each operator works exactly one station and a station may have several operators; for a (station, pass_date) the duty operator is unique". Write a table `norm.duty(station_callsign, pass_date, operator_name)` with FDs `{station_callsign, pass_date} → operator_name` and `operator_name → station_callsign`. It is in 3NF but not BCNF, so decompose it into `norm.operator_station(operator_name PK, station_callsign)` and `norm.duty_bcnf(operator_name, pass_date)`.
   - `norm.fd_catalog(stage TEXT, fd TEXT, violates TEXT, fix TEXT)` lists every FD and which normal form it violates.
   - **Anomaly demo functions:** `norm.demo_update_anomaly()`, `norm.demo_insert_anomaly()` and `norm.demo_delete_anomaly()`. Each runs inside a subtransaction that is rolled back (`BEGIN … EXCEPTION … END`, or simply return computed text) and returns `TABLE(stage TEXT, before TEXT, after TEXT, explanation TEXT)`. For example: updating one sat's plane in UNF leaves the other rows inconsistent, which shows the inconsistent count. Keep them read-only in effect.
   - `norm.lossless_check()` returns, per decomposition step, `(stage, rows_original, rows_rejoined, missing, spurious)`. It uses `NATURAL JOIN` of the decomposed tables and `EXCEPT` both ways against the previous stage. Every step must report 0 missing and 0 spurious.
   - `GRANT USAGE ON SCHEMA norm` and SELECT/EXECUTE to every grp_* role.
3. Make sure `scripts/setup_db.py` runs 08 and 09. It already globs `db/0*.sql` in order, so just verify this. The new files must apply cleanly **after** `07_security.sql`, because they contain their own grants.

## Backend: new router files, registered in `backend/main.py`
1. **`backend/routers/labs_tx.py`: two-session transaction lab (Exp 9, CO4).** This is the trickiest part, so read it carefully.
   - `POST /api/labs/tx/session` creates a lab id and opens **two dedicated psycopg connections, A and B**, as the current role (normally the director). Use `autocommit=False` and `application_name` `somaiyanet:lab:<id>:A` (and `:B`). Store them in an in-memory dict with a 10-minute idle expiry. It returns `{lab_id, pid_a, pid_b}`.
   - `POST /api/labs/tx/{lab_id}/exec {session:'A'|'B', sql}` runs one statement on that session **in a worker thread**. If it finishes within 1.5 s, it returns `{status:'done', rows, rowcount, notice}`. If it blocks (lock wait), it returns `{status:'waiting'}` immediately while the thread keeps running.
   - `GET /api/labs/tx/{lab_id}/state` returns, for each session:
     - its pending or finished result
     - its `pg_stat_activity` row (`state`, `wait_event_type`, `wait_event`, `query`, `backend_xid`, `backend_xmin`) and `pg_blocking_pids(pid)`, read through the superuser pool
     - the `pg_locks` rows of both pids joined to `relation::regclass`
     - the current transaction status (idle / in transaction / in error)
   - `POST /api/labs/tx/{lab_id}/reset` rolls back both sessions and resets the lab table.
   - `DELETE /api/labs/tx/{lab_id}` closes everything.
   - **Scenarios.** `GET /api/labs/tx/scenarios` returns scripted steps, an ordered list of `{session, sql, expect, explain}`. They use a dedicated lab table `lab_account(id INT PK, sat_id TEXT, power_credits INT)` created in `db/08_bench.sql` (put it there, with seed rows for SAT-A1 and SAT-A2 each holding 100 credits, and grant DML to grp_director):
     1. `lost_update`: under READ COMMITTED, A reads 100, B reads 100, A writes 90 and commits, B writes 80 and commits. The final value is 80, and A's update is lost. Then the fix with `SELECT … FOR UPDATE`, where B **waits** until A commits.
     2. `non_repeatable_read`: under READ COMMITTED, A reads twice and B commits a change in between, so A sees different values. The same under REPEATABLE READ gives a stable value.
     3. `phantom_or_write_skew`: under SERIALIZABLE, A and B each read the sum of both rows and each updates a different row, so one gets **`40001` serialization_failure** on commit.
     4. `deadlock`: A locks row 1, B locks row 2, A tries row 2 (waits), B tries row 1. Postgres detects the deadlock after `deadlock_timeout` (1 s) and one session gets **`40P01`**.
     5. `skip_locked`: two router workers call `dispatch_packets('SAT-A1', 'worker-A', 20000)` and `('SAT-A1', 'worker-B', 20000)` in open transactions and claim **disjoint** packet ids. Show both id lists.
     6. `mvcc`: A runs `UPDATE deployer_pod SET temperature_c = temperature_c + 1 WHERE pod_id='POD-A1'` without committing. Then `SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id='POD-A1'` in A and in B shows the different versions, and `txid_current()`. After the commit, B sees the new version with a new ctid.
     7. `wal`: `SELECT pg_current_wal_lsn()`, then a transaction inserting 1000 telemetry rows, then the LSN again and `pg_wal_lsn_diff` in bytes. This demonstrates write-ahead logging as the recovery mechanism.
   - Each step's `expect` is `'ok' | 'waits' | 'error:40001' | 'error:40P01'`. The backend tests must run every scenario end to end and assert those expectations.
2. **`backend/routers/labs_security.py` (Exp 7):**
   - `GET /api/labs/security/matrix` returns `{roles:[5 login roles], objects:[...], cells:[{role, object, privs:[SELECT,INSERT,UPDATE,DELETE,EXECUTE]}]}` via `has_table_privilege` / `has_function_privilege` / `has_column_privilege` (include the `station_key.secret` vs `station_key.key_id` columns), read through the superuser pool. It also returns the role membership (`pg_auth_members`) and the RLS policies (`pg_policies`).
   - `POST /api/labs/security/try {role, action_key}` runs a canned action **as the given role**, not the cookie role, because the lab compares roles side by side. Return the result or the error. Actions:
     - `read_telemetry`
     - `insert_telemetry`
     - `read_station_secret`
     - `read_station_keyid`
     - `read_downlinks` (RLS: shows the row count per to_node)
     - `insert_telecommand_own`
     - `insert_telecommand_other`
     - `execute_decide`
     - `ack_alert`
     - `update_alert_message` (the column privilege is denied)
     - `refresh_kpis`
     - `grant_chain` (the director grants SELECT ON telemetry TO student_analyst WITH GRANT OPTION…, demonstrated and then revoked)
   - `GET /api/labs/security/audit?limit=50` reads `audit_log` newest first, director only (others get a 403 from Postgres).
3. **`backend/routers/labs_index.py` (Exp 8):**
   - `GET /api/labs/index/catalog` returns the catalog + sizes + queries.
   - `POST /api/labs/index/bulk {rows}` calls `bench_bulk_telemetry`.
   - `POST /api/labs/index/run {query_key, index_key}`:
     1. `bench_drop_all()`
     2. run the query's `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` → plan_before
     3. `bench_apply(index_key)`
     4. EXPLAIN again → plan_after
     5. return both plans + the total ms + the top node types + the index size
   
   Run it with `SET LOCAL enable_seqscan` left **unchanged**, so the planner chooses honestly.
4. **`backend/routers/labs_norm.py`:** `GET /api/labs/norm/stages` returns each stage's table rows (limit 50) + its FDs. `GET /api/labs/norm/anomalies` returns all 3 demo functions' output. `GET /api/labs/norm/lossless` returns the lossless check.
5. **`backend/routers/labs_schema.py` (Exp 1–2):** `GET /api/labs/schema` reads the catalog:
   - tables, with `obj_description` comments
   - columns with type/nullability/default/generated
   - PKs, FKs (including composite FKs and the `(node_id, kind)` subtype FKs)
   - CHECK and EXCLUDE constraints
   - partitions (`pg_inherits`)
   - views

   It returns JSON suitable for drawing an ER diagram, and it **tags** each table:
   - supertype: network_node, packet
   - subtype: satellite, ground_station, ttc_frame, sstv_image, voice_frame
   - weak: deployment_event, dt_node, route_hop
   - bridge/M:N: contact, route_hop
   - lookup: payload_mode, sat_state_transition
   - partitioned: telemetry
   - audit: audit_log, deployment_log
   
   Include `"mapping_notes"` that explain each EER→relational mapping rule used.

## Tests: `backend/tests/test_labs.py`
- Every tx scenario reaches its expected outcome, including 40001 and 40P01.
- The skip_locked id sets are disjoint.
- The security matrix shows the analyst has no INSERT on telemetry and that `station_key.secret` is denied to operators.
- Each security `try` action gives the expected allowed/denied result per role.
- Index run: the after-plan for `brin_ts`/`btree_cube_ts` uses an index or bitmap scan once ≥ 200k rows are bulk-loaded. For the 7-day range, the btree may still seqscan; that is fine, just record it.
- The partition-pruning plan scans ≤ 2 partitions.
- The lossless check has all zeros.
- Each anomaly function returns rows.
- The schema tags are correct for network_node, satellite, dt_node and telemetry.

## Acceptance (run these and paste the output)
```bash
export PGPORT=55433 SOMAIYANET_DB=somaiyanet_w10 SIMULATOR=0
.venv/Scripts/python scripts/setup_db.py --db somaiyanet_w10
.venv/Scripts/python -m pytest backend/tests -q
.venv/Scripts/python -m pytest tests -q
```
Every test must pass, both the old ones and the new ones. Do not leave servers or lab connections open.
