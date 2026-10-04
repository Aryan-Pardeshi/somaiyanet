# Brief 03: Views, routing and TCL functions, triggers, security, and the pytest suite

Read `docs/spec.md` first, especially §0, §5 (the 04_functions part only), §6, §7, and §8. The schema (`db/01_schema.sql`) and seed (`db/02_seed.sql`) already exist and pass their checks. Read both before you start.

**Parallel-work rules.** Another worker is writing `scripts/build_constellation.py`, `compute_contacts.py`, `generate_telemetry.py`, and `generate_packets.py` right now. Do not touch those files. You must also use **your own database**, because setup drops and recreates whatever DB it targets. Always run:
`export PGPORT=55433; .venv/Scripts/python scripts/setup_db.py --db somaiyanet_w3 --sql-only`
Never run setup without `--db somaiyanet_w3`.

## Files to create or change
1. `db/03_views.sql`: every view in spec §7, plus `mv_kpis` and its unique index. Header: `-- [Exp 5 & 6 - aggregates, set ops, nested queries, joins, views; CO2/CO3]`. Give each view a comment naming its concept.
2. `db/04_functions.sql`: **append** to the existing file and keep the two link_score functions. Add `cgr_routes`, `route_packet`, `plan_route`, `record_deploy_signal`, `confirm_deployment` (PROCEDURE), `reset_deploy_demo` (PROCEDURE), `dispatch_packets`, and `execute_pass`, each exactly as specified in spec §5. Section headers name the experiment: CGR is `[Exp 6 - recursive CTE + window fns, CO3]`, and the deploy/execute functions are `[Exp 9 - TCL, CO4]`.
   - `cgr_routes` must use `WITH RECURSIVE` and the `CYCLE … SET … USING` clause, with LATERAL `DISTINCT ON` for the earliest contact per neighbour. Read the CGR bullet in spec §5 carefully.
   - `dispatch_packets` must work when two sessions call it at the same time. Use `FOR UPDATE SKIP LOCKED`.
3. `db/06_triggers.sql`: every trigger in spec §6, plus `sign_telecommand`. Header `-- [Triggers, integrity beyond CHECK, CO1/CO3]`.
4. `db/07_security.sql`: spec §8 in full.
   - Drop and recreate the roles safely. They are cluster-global, so use `DROP OWNED BY` inside a DO block that loops over existing roles, then `DROP ROLE IF EXISTS`.
   - Use the password placeholder tokens from spec §1.
   - `db/05_ai.sql` does not exist yet; a later task writes it. Grant EXECUTE on its functions (`rule_action`, `rule_reason`, `ai_decide`, `features_for_satellite`, `decide_for_satellite`, `preview_decision`, `watchdog_violation`) inside a DO block that grants only when `to_regprocedure(...)` is not NULL, so the file works both before and after `05_ai.sql` exists.
   - Header `-- [Exp 7 - DCL: roles, GRANT/REVOKE, column privileges, RLS; CO2/CO3]`.
5. `tests/conftest.py` and `tests/test_*.py`, run with pytest. In `conftest.py`:
   - Set `PGPORT` to 55433 if it is unset.
   - Build the DB **`somaiyanet_test_w3`** once per session by running `setup_db.py --db somaiyanet_test_w3 --sql-only`.
   - Insert a **small synthetic fixture graph** directly in SQL rather than relying on generated data. That means 3 operational sats plus 1 STOWED sat (pods CONFIRMED except the stowed one's), a handful of ISL and DOWNLINK contacts with known times, a few telemetry rows, and queued packets of each mode.
   - Provide helpers to connect as each role, with passwords from `_db.role_password`.

   Then add these tests. The spec section each one checks is in brackets.
   - **CGR (§5):**
     - The best route arrives at the expected station, by the expected path, at the expected time.
     - Every hop departs at or after the previous hop arrived.
     - There are no cycles.
     - A STOWED sat is never used as a relay.
     - The 2-hop relay beats waiting for a direct downlink.
   - **route_packet:** persists the route and its hops, and sets `packet.route_id`.
   - **dispatch_packets:** two connections run it in overlapping transactions and claim **disjoint** packet sets, in priority order (TTC first).
   - **confirm_deployment (§5):**
     - It rejects a pod with fewer than 2 distinct ok signals.
     - It succeeds with 2 signals.
     - With `p_simulate_failure` it leaves the pod and the sat unchanged.
   - **execute_pass:** with `p_fail_stage2`, TTC is SENT but the others stay QUEUED.
   - **Triggers (§6):**
     - An illegal state transition raises.
     - The audit log gets rows, and `station_key` audit rows contain no `secret` key.
     - A telemetry insert below 6.8 V creates a CRITICAL alert and updates `satellite.battery_v`.
     - A forged HMAC is rejected.
     - A valid signed telecommand, built with `sign_telecommand`, is accepted and marked verified.
     - A DOWNLINK from GROUND to SAT is rejected.
     - A network_node with no subtype row fails at COMMIT.
   - **Security (§8):**
     - `student_analyst` INSERT telemetry → SQLSTATE `42501`.
     - `ai_router` SELECT telemetry → `42501`.
     - `ai_router` INSERT telemetry → OK.
     - `station_operator_bom` SELECT `secret` from station_key → `42501`, but SELECT `key_id` → OK.
     - RLS: the BOM operator sees only GS-BOM DOWNLINK contacts and only GS-BOM telecommands, and cannot insert a telecommand for GS-HEL.
     - The director sees everything.
   - **Views:** `v_low_power` lists the fixture sat that is below 7.0 V average, `mv_kpis` refreshes CONCURRENTLY, and the EXCEPT/INTERSECT views return the expected sats.

## Do not touch
`scripts/*` (except reading them), `db/01_schema.sql` and `db/02_seed.sql` (if you find a real bug there, fix it minimally and report it), `docs/`, `reference/`, `.env*`, `web/`, `backend/`.

## Acceptance (run these and paste the output)
```bash
export PGPORT=55433
.venv/Scripts/python scripts/setup_db.py --db somaiyanet_w3 --sql-only
.venv/Scripts/python -m pytest tests -q
```
Every test must pass. Do not skip or xfail tests to make the run green. If something cannot work, explain why in your report.
