# SomaiyaNet — Technical Spec (source of truth for every task brief)

DBMS mini project built around AI use case **KJS-SRS-01**: the SomaiyaSat PocketQube, released by the SomaiyaPod deployer, with an onboard AI router that decides what to downlink (TT&C, then SSTV, then M17/Codec2) and an **inter-satellite data routing** network. **The database is the project.** Every rule, permission, routing decision, and audit trail lives in PostgreSQL. Python and React only call SQL and render the results.

If a brief and this spec disagree, the **spec wins** unless the brief explicitly says it overrides a section.

---

## 0. Ground rules for every worker

- **Paths.** The repo root is `somaiyanet/`. Use only the paths named in your brief, and do not touch `reference/`, which is a read-only copy of a friend's project.
- **Commits.** Do not run `git commit`, `git push`, or create branches. The orchestrator commits.
- **Database.** The target is PostgreSQL 18 on localhost:5432. psql lives at `"C:\Program Files\PostgreSQL\18\bin\psql.exe"` and is not on PATH.
- **Testing database (IMPORTANT).** A scratch PostgreSQL 18 cluster is already running on **port 55433** with trust auth (user `postgres`, any password). Run every acceptance command with `export PGPORT=55433` (bash) so `.env`'s PGPORT is overridden; `_db.py` respects env vars that are already set. **Never** start, stop, or init a Postgres server yourself (no `pg_ctl`, no `initdb`, no `postgres.exe`). Those calls hang this shell. If the cluster is down, stop and report.
- **Long-running processes (IMPORTANT).** Never start a server (uvicorn, vite dev, etc.) in the foreground, because it hangs your shell forever. Prefer FastAPI's `TestClient` / pytest. If you must curl a live server, start it like `(timeout 60 .venv/Scripts/python -m uvicorn backend.main:app --port 8011 > /tmp/srv.log 2>&1 &)`, wait with `for i in $(seq 1 20); do curl -s localhost:8011/api/health && break; sleep 1; done`, then kill it.
- **Python.** Python 3.14 with the venv at `.venv/`. Run things with `.venv/Scripts/python`. Installed: psycopg 3.3 (`psycopg`, `psycopg_pool`), python-dotenv, sgp4, numpy, scikit-learn, fastapi, uvicorn, pytest, httpx. Use **psycopg 3**, never psycopg2. Add a package only if your brief allows it, and add it to `requirements.txt` when you do.
- **Shell.** The OS is Windows 11 and both bash (Git Bash) and PowerShell are available. Use `pathlib` in Python and never hard-code `/` vs `\`.
- **Secrets.** Read every secret from `.env` through `python-dotenv`. Never print passwords, and never hard-code them except for the throwaway defaults that `.env.example` already shows.
- **SQL style.** Uppercase keywords and snake_case identifiers. Every SQL file starts with a header comment naming the experiment/CO it demonstrates, e.g. `-- [Exp 3 - DDL, CO2]`, and each non-trivial object gets a 1–3 line comment saying *why*. These files are read aloud at viva, so clarity beats cleverness.
- **Timestamps.** Every timestamp is `TIMESTAMPTZ` stored as UTC.
- **Idempotency.** `setup_db.py` drops and recreates the database, so SQL files do not need `IF NOT EXISTS` guarding. Roles are cluster-global, though, and `07_security.sql` must drop and recreate them safely.
- **Done means done.** When finished, print a short report: the files created/changed, the acceptance commands you ran with their output, and anything you could not finish. Do not claim success without running the acceptance commands.

## 1. Repo layout

```
somaiyanet/
├── .env / .env.example      connection + role passwords (see .env.example)
├── requirements.txt
├── run.py                   build web, start API + simulator on :8000
├── db/
│   ├── 01_schema.sql        extensions, domains, enums, all tables, partitions fn
│   ├── 02_seed.sql          lookup data, ground stations, keys, pods, transitions
│   ├── 03_views.sql         views + materialized view
│   ├── 04_functions.sql     link_score, CGR routing, deploy procs, dispatch, execute_pass
│   ├── 05_ai.sql            rule_action, ai_decide, watchdog, features, decide_for_satellite
│   ├── 06_triggers.sql      state machine, audit, telemetry, telecommand, contact kind, totality
│   ├── 07_security.sql      roles, GRANT/REVOKE, column privs, RLS (passwords substituted)
│   ├── 08_bench.sql         index-lab functions (indexes created at runtime, not here)
│   └── 09_normalization.sql normalization-lab tables + functions
├── scripts/
│   ├── _db.py               connect(dbname=None, user=None, password=None) helper (psycopg 3)
│   ├── _orbit.py            TLE/SGP4/look-angle helpers (adapted from reference/scripts/_orbit.py)
│   ├── setup_db.py          recreate DB, run db/01..09, run data steps, refresh MV, ANALYZE
│   ├── build_constellation.py   8 SomaiyaSat TLEs + pods -> satellite rows
│   ├── compute_contacts.py      SGP4 sampling -> contact rows (ISL + DOWNLINK)
│   ├── generate_telemetry.py    7 days history, inserted AS ai_router
│   ├── generate_packets.py      packet queue + subtypes + some delivered history
│   └── train_router.py          sklearn tree -> ai_model / dt_node / ai_model_metric
├── backend/                 FastAPI app (later brief)
├── web/                     Vite React app (later brief)
├── tests/                   pytest; conftest builds somaiyanet_test via setup_db
└── docs/                    PLAN.md, spec.md, briefs/, report, deck, demo script
```

`setup_db.py` CLI: `python scripts/setup_db.py [--db NAME] [--test] [--sql-only]`.
- `--test` targets `TEST_PGDATABASE`.
- `--sql-only` skips the data steps.
- The data steps run in order: `build_constellation`, `compute_contacts`, `generate_telemetry`, `generate_packets`, `train_router`. Each is imported as a module exposing `run(conn_factory) -> None`. A module that does not exist yet is **skipped with a warning**, so the pipeline works while later tasks are pending.
- After the data steps: `REFRESH MATERIALIZED VIEW mv_kpis` if it exists, then `ANALYZE`.
- Role passwords and the database name are substituted into `07_security.sql` from placeholder tokens: `__DB__`, `__MISSION_DIRECTOR_PASSWORD__`, `__STATION_BOM_PASSWORD__`, `__STATION_HEL_PASSWORD__`, `__STUDENT_ANALYST_PASSWORD__`, `__AI_ROUTER_PASSWORD__`.

## 2. Schema contract (db/01_schema.sql)

Extensions: `pgcrypto`, `btree_gist`.

### Domains and enums
```
DOMAIN voltage      NUMERIC(4,2) CHECK (VALUE BETWEEN 0 AND 12)
DOMAIN score_0_100  SMALLINT     CHECK (VALUE BETWEEN 0 AND 100)
DOMAIN callsign     VARCHAR(12)  CHECK (VALUE ~ '^[A-Z0-9]{3,8}(-[0-9]{1,2})?$')
ENUM node_kind      ('SAT','GROUND')
ENUM sat_state      ('STOWED','DEPLOYED','COMMISSIONING','NOMINAL','SAFE','DECOMMISSIONED')
ENUM pod_status     ('INTEGRATED','ARMED','RELEASED','CONFIRMED','FAILED')
ENUM deploy_signal  ('SEPARATION_SWITCH','RELEASE_TIMER','RF_BEACON')
ENUM contact_kind   ('ISL','DOWNLINK')
ENUM packet_status  ('QUEUED','CLAIMED','SENT','DELIVERED','DROPPED')
ENUM router_action  ('SAFE_TTC_ONLY','TTC_VOICE','FULL_DOWNLINK','RELAY_VIA_ISL','HOLD')
```

### EER generalization 1: network_node → satellite | ground_station (disjoint, total)
Disjointness is enforced with a composite FK on `(node_id, kind)` plus a fixed-kind CHECK in each subtype. Totality is enforced by a deferred constraint trigger (see §6).

**network_node**

| column | type | constraints |
|---|---|---|
| node_id | VARCHAR(12) | PK |
| kind | node_kind | NOT NULL |
| display_name | VARCHAR(60) | NOT NULL UNIQUE |
| callsign | callsign | UNIQUE (nullable) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Plus `UNIQUE (node_id, kind)`, which is the target of the subtype FKs.

**ground_station**

| column | type | constraints |
|---|---|---|
| node_id | VARCHAR(12) | PK |
| kind | node_kind | NOT NULL DEFAULT 'GROUND' CHECK (kind = 'GROUND') |
| city | VARCHAR(60) | NOT NULL |
| country | CHAR(2) | NOT NULL |
| latitude | NUMERIC(8,5) | NOT NULL CHECK -90..90 |
| longitude | NUMERIC(8,5) | NOT NULL CHECK -180..180 |
| altitude_m | INT | NOT NULL DEFAULT 0 |
| min_elevation_deg | NUMERIC(4,1) | NOT NULL DEFAULT 10 CHECK 0..45 |
| is_primary | BOOLEAN | NOT NULL DEFAULT FALSE |
| operator_role | NAME | NOT NULL (the DB login role that operates it; used by RLS) |

FK `(node_id, kind)` → `network_node (node_id, kind)` ON DELETE CASCADE. Partial unique index `one_primary_station ON ground_station (is_primary) WHERE is_primary`.

**deployer_pod**

| column | type | constraints |
|---|---|---|
| pod_id | VARCHAR(10) | PK, e.g. 'POD-1' |
| serial_no | VARCHAR(20) | NOT NULL UNIQUE |
| release_mechanism | VARCHAR(20) | NOT NULL CHECK IN ('BURN_WIRE','SPRING_PUSHER','NON_PYRO_ACTUATOR') |
| status | pod_status | NOT NULL DEFAULT 'INTEGRATED' |
| launch_date | DATE | |
| release_ts | TIMESTAMPTZ | |
| temperature_c | NUMERIC(5,2) | |

Plus `CHECK ((status IN ('RELEASED','CONFIRMED')) = (release_ts IS NOT NULL))`.

**satellite**

| column | type | constraints |
|---|---|---|
| node_id | VARCHAR(12) | PK |
| kind | node_kind | NOT NULL DEFAULT 'SAT' CHECK (kind = 'SAT') |
| norad_id | INT | NOT NULL UNIQUE (synthetic 99901..99904) |
| plane | CHAR(1) | NOT NULL CHECK IN ('A','B') |
| slot | SMALLINT | NOT NULL CHECK 1..8 |
| pod_id | VARCHAR(10) | NOT NULL UNIQUE REFERENCES deployer_pod ON DELETE RESTRICT (1:1) |
| state | sat_state | NOT NULL DEFAULT 'STOWED' |
| tle_line1 | CHAR(69) | NOT NULL CHECK (tle_line1 LIKE '1 %') |
| tle_line2 | CHAR(69) | NOT NULL CHECK (tle_line2 LIKE '2 %') |
| epoch_utc | TIMESTAMPTZ | NOT NULL |
| inclination_deg | NUMERIC(7,4) | NOT NULL |
| mean_motion | NUMERIC(11,8) | NOT NULL CHECK > 0 (rev/day) |
| period_min | NUMERIC | GENERATED ALWAYS AS (round(1440.0 / mean_motion, 3)) STORED |
| mass_g | NUMERIC(6,1) | CHECK (mass_g <= 750) |
| battery_v | voltage | maintained by the telemetry trigger |
| last_seen | TIMESTAMPTZ | maintained by the telemetry trigger |

Plus `UNIQUE (plane, slot)` and FK `(node_id, kind)` → `network_node (node_id, kind)` ON DELETE CASCADE.

**sat_state_transition** is a data-driven state machine read by the trigger.

| column | type | constraints |
|---|---|---|
| from_state | sat_state | |
| to_state | sat_state | |

PK `(from_state, to_state)`.

**deployment_event** is a WEAK entity of deployer_pod.

| column | type | constraints |
|---|---|---|
| pod_id | VARCHAR(10) | REFERENCES deployer_pod ON DELETE CASCADE |
| seq | SMALLINT | |
| signal | deploy_signal | NOT NULL |
| ok | BOOLEAN | NOT NULL |
| value | TEXT | |
| observed_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

PK `(pod_id, seq)`.

**deployment_log** is a deliberate audit table with no FKs, so the record of a failed attempt survives a rollback (it is written in a separate transaction).

| column | type | constraints |
|---|---|---|
| log_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| pod_id | VARCHAR(10) | |
| sat_id | VARCHAR(12) | |
| action | TEXT | NOT NULL |
| outcome | TEXT | NOT NULL CHECK IN ('COMMITTED','ROLLED_BACK','REJECTED') |
| detail | TEXT | |
| logged_at | TIMESTAMPTZ | NOT NULL DEFAULT clock_timestamp() |

**payload_mode** (lookup)

| column | type | constraints |
|---|---|---|
| mode | VARCHAR(8) | PK CHECK IN ('TTC','SSTV','M17','CODEC2') |
| priority | SMALLINT | NOT NULL UNIQUE (1 = TTC, 2 = SSTV, 3 = M17, 4 = CODEC2 — the PDF's order) |
| bitrate_bps | INT | NOT NULL CHECK > 0 |
| tx_power_mw | INT | NOT NULL CHECK > 0 |
| description | TEXT | NOT NULL |

### EER generalization 2: packet → ttc_frame | sstv_image | voice_frame (disjoint by mode)

**packet**

| column | type | constraints |
|---|---|---|
| packet_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| origin_sat | VARCHAR(12) | NOT NULL REFERENCES satellite |
| mode | VARCHAR(8) | NOT NULL REFERENCES payload_mode |
| size_bytes | INT | NOT NULL CHECK (size_bytes BETWEEN 16 AND 2000000) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| status | packet_status | NOT NULL DEFAULT 'QUEUED' |
| claimed_by | TEXT | |
| delivered_to | VARCHAR(12) | REFERENCES ground_station |
| delivered_at | TIMESTAMPTZ | |
| route_id | BIGINT | FK → route, added with ALTER after route exists |

Plus `UNIQUE (packet_id, mode)` and `CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL))`.

The subtypes are identified by `packet_id` and enforce disjointness with FK `(packet_id, mode)` → `packet (packet_id, mode)` ON DELETE CASCADE:

- **ttc_frame**

  | column | type | constraints |
  |---|---|---|
  | packet_id | BIGINT | PK |
  | mode | VARCHAR(8) | NOT NULL DEFAULT 'TTC' CHECK (mode = 'TTC') |
  | battery_v | voltage | NOT NULL |
  | temp_c | NUMERIC(5,2) | NOT NULL |
  | solar_ma | INT | NOT NULL CHECK >= 0 |
  | flags | JSONB | NOT NULL DEFAULT '{}' |

- **sstv_image**

  | column | type | constraints |
  |---|---|---|
  | packet_id | BIGINT | PK |
  | mode | VARCHAR(8) | NOT NULL DEFAULT 'SSTV' CHECK (mode = 'SSTV') |
  | sstv_mode | VARCHAR(12) | NOT NULL CHECK IN ('Robot36','Martin1','Scottie1','PD120') |
  | width | SMALLINT | NOT NULL |
  | height | SMALLINT | NOT NULL |
  | caption | TEXT | |
  | image | BYTEA | nullable |

- **voice_frame**

  | column | type | constraints |
  |---|---|---|
  | packet_id | BIGINT | PK |
  | mode | VARCHAR(8) | NOT NULL CHECK IN ('M17','CODEC2') |
  | duration_ms | INT | NOT NULL CHECK > 0 |
  | src_callsign | callsign | NOT NULL |
  | dst_callsign | callsign | |

### Telemetry (declarative RANGE partitioning by day)

**telemetry** is `PARTITION BY RANGE (ts)`.

| column | type | constraints |
|---|---|---|
| ts | TIMESTAMPTZ | NOT NULL |
| sat_id | VARCHAR(12) | NOT NULL REFERENCES satellite |
| battery_v | voltage | NOT NULL |
| temp_c | NUMERIC(5,2) | NOT NULL |
| solar_ma | INT | NOT NULL CHECK >= 0 |
| rssi_dbm | NUMERIC(5,1) | |
| mode_active | VARCHAR(8) | REFERENCES payload_mode |
| housekeeping | JSONB | NOT NULL DEFAULT '{}' |

PK `(sat_id, ts)`. The housekeeping keys are `sunlit` (bool), `cpu_temp_c`, `free_heap_kb`, `uptime_s`, `reset_count`, `eclipse_in_s`, and `adcs_mode` (text).

The function `ensure_telemetry_partitions(p_from DATE, p_to DATE) RETURNS INT` lives in 01. It creates daily partitions `telemetry_YYYYMMDD` for each day in `[p_from, p_to]` if they are missing, and returns the number created. Also create `telemetry_default` as the DEFAULT partition. At the end of 01, call `ensure_telemetry_partitions(current_date - 8, current_date + 2)`.

### Inter-satellite contact graph

**contact** is directed: an ISL is stored as two rows, one per direction, and a DOWNLINK always runs sat → ground.

| column | type | constraints |
|---|---|---|
| contact_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| kind | contact_kind | NOT NULL |
| from_node | VARCHAR(12) | NOT NULL REFERENCES network_node |
| to_node | VARCHAR(12) | NOT NULL REFERENCES network_node |
| start_ts | TIMESTAMPTZ | NOT NULL |
| end_ts | TIMESTAMPTZ | NOT NULL |
| duration_s | INT | GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_ts - start_ts))::int) STORED |
| span | TSTZRANGE | GENERATED ALWAYS AS (tstzrange(start_ts, end_ts)) STORED |
| rate_bps | INT | NOT NULL CHECK > 0 |
| link_score | score_0_100 | NOT NULL |
| min_range_km | NUMERIC(8,1) | NOT NULL |
| max_elevation_deg | NUMERIC(5,2) | NULL for ISL |

Constraints:
- `CHECK (end_ts > start_ts)`
- `CHECK (from_node <> to_node)`
- `EXCLUDE USING gist (from_node WITH =, to_node WITH =, span WITH &&)`, so no two overlapping windows exist for the same directed pair

Indexes: `(from_node, start_ts)` and `(to_node, start_ts)`. These are core indexes and stay out of the bench lab.

**route**

| column | type | constraints |
|---|---|---|
| route_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| packet_id | BIGINT | REFERENCES packet ON DELETE SET NULL |
| origin_sat | VARCHAR(12) | NOT NULL REFERENCES satellite |
| requested_at | TIMESTAMPTZ | NOT NULL |
| size_bytes | INT | NOT NULL |
| destination | VARCHAR(12) | REFERENCES ground_station |
| arrival_ts | TIMESTAMPTZ | |
| hops | SMALLINT | |
| bottleneck_score | SMALLINT | |
| latency_s | INT | GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (arrival_ts - requested_at))::int) STORED |
| computed_by | NAME | NOT NULL DEFAULT current_user |
| computed_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**route_hop** is a WEAK entity of route and the M:N bridge between route and contact.

| column | type | constraints |
|---|---|---|
| route_id | BIGINT | REFERENCES route ON DELETE CASCADE |
| hop_no | SMALLINT | |
| contact_id | BIGINT | NOT NULL REFERENCES contact |
| depart_ts | TIMESTAMPTZ | NOT NULL |
| arrive_ts | TIMESTAMPTZ | NOT NULL |

PK `(route_id, hop_no)` and `CHECK (arrive_ts >= depart_ts)`.

Then `ALTER TABLE packet ADD FOREIGN KEY (route_id) REFERENCES route ON DELETE SET NULL`.

### AI router stored in the database

**ai_model**

| column | type | constraints |
|---|---|---|
| model_id | INT | GENERATED ALWAYS AS IDENTITY PK |
| name | VARCHAR(40) | NOT NULL |
| version | SMALLINT | NOT NULL |
| algorithm | VARCHAR(40) | NOT NULL DEFAULT 'DecisionTreeClassifier' |
| features | TEXT[] | NOT NULL |
| classes | router_action[] | NOT NULL |
| max_depth | SMALLINT | |
| train_rows | INT | |
| test_accuracy | NUMERIC(5,4) | CHECK 0..1 |
| confusion | JSONB | {"labels": [...], "matrix": [[...]]} |
| is_active | BOOLEAN | NOT NULL DEFAULT FALSE |
| trained_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Plus `UNIQUE (name, version)` and the partial unique index `one_active_model ON ai_model (is_active) WHERE is_active`.

**dt_node** is a WEAK entity of ai_model and represents the tree.

| column | type | constraints |
|---|---|---|
| model_id | INT | REFERENCES ai_model ON DELETE CASCADE |
| node_id | INT | |
| depth | SMALLINT | NOT NULL |
| feature | TEXT | NULL at a leaf |
| threshold | DOUBLE PRECISION | NULL at a leaf |
| left_child | INT | |
| right_child | INT | |
| leaf_action | router_action | NOT NULL only at a leaf |
| samples | INT | NOT NULL |
| gini | NUMERIC(6,5) | NOT NULL |
| class_counts | JSONB | NOT NULL, e.g. {"FULL_DOWNLINK": 120, ...} |

Constraints:
- PK `(model_id, node_id)`
- `CHECK ((feature IS NULL) = (leaf_action IS NOT NULL))`
- self-FKs `(model_id, left_child)` and `(model_id, right_child)` → `dt_node (model_id, node_id)`, both DEFERRABLE INITIALLY DEFERRED

Semantics follow sklearn: go to `left_child` when `features->>feature <= threshold`, otherwise to `right_child`. The root is node 0.

**ai_model_metric**

| column | type | constraints |
|---|---|---|
| model_id | INT | REFERENCES ai_model ON DELETE CASCADE |
| class_label | TEXT | |
| precision_ | NUMERIC(5,4) | |
| recall | NUMERIC(5,4) | |
| f1 | NUMERIC(5,4) | |
| support | INT | |

PK `(model_id, class_label)`.

**routing_decision**

| column | type | constraints |
|---|---|---|
| decision_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| sat_id | VARCHAR(12) | NOT NULL REFERENCES satellite |
| contact_id | BIGINT | REFERENCES contact (the downlink window used, nullable) |
| model_id | INT | REFERENCES ai_model |
| features | JSONB | NOT NULL |
| ai_action | router_action | |
| ai_path | TEXT[] | human-readable steps, e.g. 'battery_v = 6.95 <= 7.05 -> left' |
| rule_action | router_action | NOT NULL |
| final_action | router_action | NOT NULL |
| overridden | BOOLEAN | GENERATED ALWAYS AS (ai_action IS DISTINCT FROM final_action) STORED |
| override_reason | TEXT | |
| source | VARCHAR(12) | NOT NULL DEFAULT 'AUTO' CHECK IN ('AUTO','TELECOMMAND') |
| decided_by | NAME | NOT NULL DEFAULT current_user |
| decided_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

### Ground segment security objects

**station_key** carries column privileges: no one but the director may read `secret`.

| column | type | constraints |
|---|---|---|
| station_id | VARCHAR(12) | PK REFERENCES ground_station ON DELETE CASCADE |
| key_id | VARCHAR(16) | NOT NULL |
| secret | BYTEA | NOT NULL |
| rotated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**telecommand**

| column | type | constraints |
|---|---|---|
| cmd_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| station_id | VARCHAR(12) | NOT NULL REFERENCES ground_station |
| sat_id | VARCHAR(12) | NOT NULL REFERENCES satellite |
| opcode | VARCHAR(20) | NOT NULL CHECK IN ('PING','SET_MODE','OVERRIDE_ACTION','SAFE_MODE','REBOOT','DOWNLINK_NOW') |
| args | JSONB | NOT NULL DEFAULT '{}' |
| nonce | BIGINT | NOT NULL |
| hmac | BYTEA | NOT NULL |
| verified | BOOLEAN | NOT NULL DEFAULT FALSE |
| issued_by | NAME | NOT NULL DEFAULT current_user |
| issued_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| expires_at | TIMESTAMPTZ | NOT NULL DEFAULT now() + interval '30 minutes' |

Plus `UNIQUE (station_id, nonce)`, which provides replay protection.

The canonical signed message is:
`convert_to(station_id || '|' || sat_id || '|' || opcode || '|' || args::text || '|' || nonce::text, 'UTF8')`.
The signature is `hmac(message, secret, 'sha256')`.

**alert**

| column | type | constraints |
|---|---|---|
| alert_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| sat_id | VARCHAR(12) | REFERENCES satellite |
| severity | VARCHAR(8) | NOT NULL CHECK IN ('INFO','WARN','CRITICAL') |
| message | TEXT | NOT NULL |
| raised_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| acknowledged | BOOLEAN | NOT NULL DEFAULT FALSE |

**audit_log**

| column | type | constraints |
|---|---|---|
| audit_id | BIGINT | GENERATED ALWAYS AS IDENTITY PK |
| table_name | TEXT | NOT NULL |
| op | CHAR(1) | NOT NULL CHECK IN ('I','U','D') |
| row_pk | TEXT | |
| old_row | JSONB | |
| new_row | JSONB | |
| changed_by | NAME | NOT NULL DEFAULT session_user |
| changed_at | TIMESTAMPTZ | NOT NULL DEFAULT clock_timestamp() |
| txid | BIGINT | NOT NULL DEFAULT txid_current() |

### Real amateur satellites (ground-segment validation, optional feature)

**satellite_tle**

| column | type | constraints |
|---|---|---|
| norad_id | INT | PK |
| object_name | VARCHAR(40) | NOT NULL |
| tle_line1 | CHAR(69) | NOT NULL CHECK LIKE '1 %' |
| tle_line2 | CHAR(69) | NOT NULL CHECK LIKE '2 %' |
| epoch_utc | TIMESTAMPTZ | NOT NULL |
| payload_modes | VARCHAR(60) | |
| relevance | TEXT | |
| fetched_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

## 3. Seed contract (db/02_seed.sql)

- **payload_mode:**

  | mode | priority | bitrate_bps | tx_power_mw | description |
  |---|---|---|---|---|
  | TTC | 1 | 9600 | 500 | Telemetry, tracking & command / housekeeping |
  | SSTV | 2 | 4800 | 1500 | Slow-scan TV image (power hungry) |
  | M17 | 3 | 9600 | 1000 | M17 digital voice/data |
  | CODEC2 | 4 | 1300 | 800 | Codec2 low-bitrate voice |

- **sat_state_transition:** STOWED→DEPLOYED, DEPLOYED→COMMISSIONING, COMMISSIONING→NOMINAL, COMMISSIONING→SAFE, NOMINAL→SAFE, SAFE→NOMINAL, NOMINAL→DECOMMISSIONED, SAFE→DECOMMISSIONED.
- **Ground stations.** Each one needs a network_node row (kind GROUND) and a ground_station row.

  | node_id | display_name | callsign | city, cc | lat, lon | alt_m | min_elev | primary | operator_role |
  |---|---|---|---|---|---|---|---|---|
  | GS-BOM | KJSIT Mumbai | VU2KJS | Mumbai, IN | 19.0728, 72.8826 | 14 | 10 | TRUE | station_operator_bom |
  | GS-HEL | ReOrbit Espoo | OH2SOM | Espoo, FI | 60.2055, 24.6559 | 30 | 10 | FALSE | station_operator_hel |
  | GS-BLR | Bengaluru Relay | VU2BLR | Bengaluru, IN | 12.9716, 77.5946 | 920 | 10 | FALSE | mission_director |
  | GS-TYO | Tokyo Amateur | JA1SOM | Tokyo, JP | 35.6762, 139.6503 | 40 | 10 | FALSE | mission_director |
  | GS-SVB | Svalbard Polar | LA0SOM | Longyearbyen, NO | 78.2232, 15.6267 | 450 | 5 | FALSE | mission_director |
  | GS-CPT | Cape Town | ZS1SOM | Cape Town, ZA | -33.9249, 18.4241 | 20 | 10 | FALSE | mission_director |

- **station_key:** one row per station, with `key_id = 'K-' || node_id || '-1'` and `secret = gen_random_bytes(32)`.
- **deployer_pod:** POD-1..POD-4.
  - serial_no is `'SPOD-2026-' || lpad(n, 3, '0')` (001..004).
  - release_mechanism alternates SPRING_PUSHER and BURN_WIRE.
  - launch_date is `current_date - 21`.
  - Every pod is CONFIRMED with `release_ts = launch_date + ~95 min`, **except POD-4**, which is ARMED with `release_ts NULL`. It is used by the deployment demo.
- **deployment_event:** for each CONFIRMED pod, 3 ok events (all three signals) at `release_ts + 0 s / 2 s / 40 s`. For POD-4, none.
- **Satellites are NOT seeded here.** `build_constellation.py` inserts them (network_node + satellite), because their TLEs are computed at build time.

## 4. Constellation contract (scripts)

- **Satellites:** 4 of them, `SS-1..SS-4`. Each has `display_name = 'SomaiyaSat-' || slot`, a callsign like `VU2SS1`, norad_id 99901..99904, and `pod_id = 'POD-' || slot`.
- **Orbits:** circular SSO with altitude ≈ 525 km, inclination 97.5°, eccentricity ≈ 0.0001, epoch = today 00:00 UTC. ONE plane: RAAN 75°.
  - In-plane mean-anomaly spacing is 12°: slot k gets M = M0 + (k-1)·12°, so SS-1/SS-2/SS-3 inter-satellite links stay up and a packet can go SS-1 -> SS-2 -> SS-3 -> ground (two relay hops).
  - Build each orbit with `sgp4.api.Satrec.sgp4init` and export the TLE with `sgp4.exporter.export_tle`. The lines must round-trip through `Satrec.twoline2rv`.
- **States and pinned latest battery** (the demo story depends on these):

  | sat | display_name | callsign | pod | state | latest battery_v | decision story |
  |---|---|---|---|---|---|---|
  | SS-1 | SomaiyaSat-1 | VU2SS1 | POD-1 (SPOD-2026-001) | NOMINAL | 7.90 | healthy workhorse, full downlink |
  | SS-2 | SomaiyaSat-2 | VU2SS2 | POD-2 (SPOD-2026-002) | NOMINAL | 6.95 | weak battery, low-power WARN + watchdog overrides |
  | SS-3 | SomaiyaSat-3 | VU2SS3 | POD-3 (SPOD-2026-003) | SAFE | 6.60 | battery below 6.8 V, CRITICAL, safe mode |
  | SS-4 | SomaiyaSat-4 | VU2SS4 | POD-4 (SPOD-2026-004) | STOWED | (no telemetry) | still in POD-4, used by the Deploy demo |

  The satellite rows are inserted in the final state directly. The state-machine trigger allows a non-STOWED INSERT only when the pod is CONFIRMED (see §6).
- **Contacts** (`compute_contacts.py`):
  - Horizon: `now() - 6 h` to `now() + 30 h`, sampled every 30 s with SGP4. Exclude STOWED sats.
  - ISL: an ISL exists when the range is ≤ 2000 km. Write both directions with `rate_bps = 9600`, `link_score = link_score_isl(min_range_km)`, and `max_elevation_deg = NULL`.
  - DOWNLINK: a DOWNLINK exists when elevation ≥ the station's `min_elevation_deg`. Use `rate_bps = 9600`, `link_score = link_score_downlink(max_elevation_deg, range_at_max_km)` computed **by calling the SQL function**, and fill in `max_elevation_deg` and `min_range_km`.
  - Merge consecutive in-range samples into one window. Windows shorter than 60 s are dropped.
  - Insert with `executemany` or `COPY`.
  - Expected volume: in-plane ISLs mostly continuous (adjacent slots ~12 deg / ~1450 km apart, so SS-1 <-> SS-2 <-> SS-3 stay up), and about 3–6 downlinks per sat per station per day. Print the counts.
- **Telemetry** (`generate_telemetry.py`):
  - Connect **as `ai_router`** using its password from `.env`, which proves the INSERT grant.
  - Cover the last 7 days, one row per 60 s per active sat (SS-1/SS-2/SS-3; SS-4 STOWED gets none): about 10 080 rows per active sat per day, ~30 000 rows total, so BRIN / partition pruning and the KPIs stay non-trivial.
  - Call `ensure_telemetry_partitions` first, as the superuser.
  - Battery is a sinusoid over the orbit period plus noise, with eclipse dips (`housekeeping.sunlit` follows the orbit).
  - SS-2 drifts down over the last 24 h so that AVG < 7.0.
  - The **latest** row per sat equals the pinned battery above.
  - Insert with COPY for speed.
- **Packets** (`generate_packets.py`, run as superuser):
  - About 60 QUEUED packets per active sat with a realistic mode mix, each with a matching subtype row.
    - TTC: 128–512 bytes
    - SSTV: 30–120 KB
    - M17: 2–20 KB
    - CODEC2: 1–8 KB
  - About 300 historical DELIVERED packets spread over the last 48 h to random stations.
  - SSTV `image` may be NULL. Small generated PNGs are a bonus, not required.

## 5. Function contract (db/04_functions.sql, db/05_ai.sql)

### db/04_functions.sql

- **`link_score_downlink(p_elev_deg NUMERIC, p_range_km NUMERIC) RETURNS SMALLINT`**, IMMUTABLE.
  - Loss is `20·log10(range/500) + 10·log10(1/sin(elev))` dB.
  - Score is `round(100 - loss·100/30)`, clamped to 0..100.
  - Clamp elev to at least 1°.
- **`link_score_isl(p_range_km NUMERIC) RETURNS SMALLINT`**, IMMUTABLE. It is `round(100 - 20·log10(range/300)·100/24)`, clamped to 0..100.
- **`cgr_routes(p_origin VARCHAR, p_t0 TIMESTAMPTZ, p_size_bytes INT DEFAULT 4096, p_max_hops INT DEFAULT 4, p_limit INT DEFAULT 5)`** is Contact Graph Routing as a **recursive CTE**. It returns
  `TABLE(rank INT, destination VARCHAR, arrival_ts TIMESTAMPTZ, hops INT, bottleneck_score INT, latency_s INT, path_nodes VARCHAR[], path_contacts BIGINT[], explanation TEXT)`.
  - Anchor: the origin node at `p_t0`.
  - Recursive step: from the current node (only SAT nodes expand; GROUND nodes are terminal), take via `LATERAL (SELECT DISTINCT ON (c.to_node) … ORDER BY c.to_node, c.start_ts)` the **earliest usable** contact to each neighbour. A contact is usable when:
    - `c.from_node = cur.node`
    - `c.end_ts > cur.arrival + tx`
    - `c.start_ts < p_t0 + interval '30 hours'`
    - for an ISL, the neighbour satellite's state is IN ('NOMINAL', 'SAFE', 'COMMISSIONING')
  - Arrival is `greatest(c.start_ts, cur.arrival) + tx`, where `tx = make_interval(secs => p_size_bytes*8.0/c.rate_bps)`.
  - Use `CYCLE node SET is_cycle USING visited` and a hop limit.
  - Final select: rows whose node is GROUND, ordered by arrival, hops, then bottleneck DESC, keeping the best row per destination and then `LIMIT p_limit`.
  - `explanation` reads like `SS-1 -ISL(78)-> SS-2 -DOWNLINK(64)-> GS-HEL, arrives 14:20:05Z`.
  - STABLE and SECURITY DEFINER, so it sees all contacts despite RLS.
- **`route_packet(p_packet_id BIGINT) RETURNS BIGINT`** takes the rank-1 route from `cgr_routes(origin, now(), size)`, inserts `route` plus `route_hop` rows (depart/arrive per hop), sets `packet.route_id`, and returns route_id. It returns NULL when no route exists.
- **`plan_route(p_origin VARCHAR, p_t0 TIMESTAMPTZ, p_size_bytes INT DEFAULT 4096) RETURNS BIGINT`** does the same with no packet.
- **`record_deploy_signal(p_pod VARCHAR, p_signal deploy_signal, p_ok BOOLEAN, p_value TEXT DEFAULT NULL) RETURNS SMALLINT`** returns the new seq.
- **`PROCEDURE confirm_deployment(p_pod VARCHAR, p_simulate_failure BOOLEAN DEFAULT FALSE)`** is the TCL demo.
  - Rule: at least 2 *distinct* signals with ok = TRUE. Otherwise write a REJECTED log entry, COMMIT, and RAISE.
  - Otherwise update the pod to RELEASED then CONFIRMED with release_ts, then move its satellite STOWED→DEPLOYED→COMMISSIONING (two UPDATEs, both checked by the trigger).
  - If `p_simulate_failure`, RAISE after the updates. The caller sees the rollback, and the procedure's EXCEPTION handler is **not** used for this.
  - On success, COMMIT and write a COMMITTED log entry.
  - Rolled-back attempts are logged by the caller (the backend) in a separate transaction with outcome ROLLED_BACK. Mirror the friend's pattern in `reference/sql/04_functions.sql`.
- **`PROCEDURE reset_deploy_demo()`** puts POD-4 back to ARMED and SS-4 back to STOWED (bypassing the state machine with `SET LOCAL somaiyanet.bypass_state_machine = 'on'`, which the trigger honours), and deletes POD-4's events.
- **`dispatch_packets(p_sat VARCHAR, p_worker TEXT, p_budget_bytes INT)`** returns `TABLE(packet_id BIGINT, mode VARCHAR, size_bytes INT, running_bytes BIGINT)`.
  - A CTE locks candidates with `SELECT … FROM packet WHERE origin_sat = p_sat AND status = 'QUEUED' ORDER BY (priority from payload_mode), created_at FOR UPDATE SKIP LOCKED LIMIT 200`.
  - The outer query computes `SUM(size_bytes) OVER (ORDER BY priority, created_at)` and keeps rows within budget.
  - The UPDATE sets those rows to `status = 'CLAIMED', claimed_by = p_worker`.
  - It returns the claimed rows. Two concurrent callers must claim **disjoint** sets.
- **`execute_pass(p_sat VARCHAR, p_contact_id BIGINT, p_fail_stage2 BOOLEAN DEFAULT FALSE)`** returns `TABLE(stage TEXT, status TEXT, packets INT, bytes BIGINT)` and is the SAVEPOINT demo.
  - Stage 1 marks the queued TTC packets SENT.
  - Stage 2, inside a `BEGIN … EXCEPTION` block (an implicit savepoint), marks SSTV/M17/CODEC2 within the contact's byte budget (`duration_s * rate_bps / 8`) as DELIVERED to the contact's to_node.
  - If `p_fail_stage2`, stage 2 raises after its update, and the result reports `'ROLLED BACK TO SAVEPOINT'`.

### db/05_ai.sql

- **`rule_action(f JSONB) RETURNS router_action`**, IMMUTABLE. This is the explainable fallback. Rules apply in this order:
  1. `battery_v < 6.8` → SAFE_TTC_ONLY
  2. `contact_s = 0` → RELAY_VIA_ISL if `isl_available = 1`, otherwise HOLD
  3. `link_score < 40` → RELAY_VIA_ISL if `isl_available = 1`, otherwise SAFE_TTC_ONLY
  4. `battery_v < 7.2` → TTC_VOICE
  5. otherwise → FULL_DOWNLINK
- **`rule_reason(f JSONB) RETURNS TEXT`** gives a one-sentence reason for the rule that fired, e.g. `'R4: battery 6.95 V below 7.2 V, SSTV is the most power-hungry mode'`.
- **Feature vector.** Keys, all numeric:
  - `battery_v`
  - `link_score` (0 if no contact)
  - `contact_s` (remaining seconds of the current downlink, 0 if none)
  - `queue_ttc_kb`
  - `queue_sstv_kb`
  - `queue_voice_kb`
  - `sunlit` (0/1)
  - `isl_available` (0/1: an ISL contact is active now to an operational sat)
- **`features_for_satellite(p_sat VARCHAR, p_at TIMESTAMPTZ DEFAULT now()) RETURNS JSONB`** builds the vector from the DB: the latest telemetry, the active downlink at p_at (the best link_score if several), the queued bytes per mode, and the active ISL. STABLE, SECURITY DEFINER.
- **`ai_decide(p_features JSONB, p_model_id INT DEFAULT NULL)`** returns `TABLE(action router_action, path TEXT[], leaf_node INT, model_id INT)`. It walks `dt_node` from node 0 with a **recursive CTE**, using the active model when p_model_id is NULL. Each path step looks like `'battery_v = 6.95 ≤ 7.05 → left'`. STABLE.
- **`watchdog_violation(f JSONB, a router_action) RETURNS TEXT`** returns NULL when the action is safe, or the reason when it is not. The invariants:
  - `battery_v < 6.8` AND `a <> SAFE_TTC_ONLY`
  - `contact_s = 0` AND `a IN (FULL_DOWNLINK, TTC_VOICE)`
  - `link_score < 40` AND `a = FULL_DOWNLINK`
  - `battery_v < 7.2` AND `a = FULL_DOWNLINK` (SSTV power)
  - `a = RELAY_VIA_ISL` AND `isl_available = 0`
- **`decide_for_satellite(p_sat VARCHAR, p_at TIMESTAMPTZ DEFAULT now()) RETURNS routing_decision`**, SECURITY DEFINER, VOLATILE.
  1. Build the features.
  2. If an unexpired, verified `telecommand OVERRIDE_ACTION` exists for the sat, the final action is `args->>'action'` with source TELECOMMAND, which is the human in the loop. The watchdog still runs: if the override violates the battery < 6.8 rule, the final action is SAFE_TTC_ONLY.
  3. Otherwise run `ai_decide`. If `watchdog_violation` is not NULL, the final action is `rule_action` and `override_reason` is set to the violation. Otherwise the final action is the AI action.
  4. Insert and return the routing_decision row.
- **`preview_decision(p_sat VARCHAR)`** returns the same fields as a TABLE without inserting anything. SECURITY DEFINER, so the analyst can preview but not record.

## 6. Trigger contract (db/06_triggers.sql)

- **`trg_satellite_state`**, BEFORE INSERT OR UPDATE OF state ON satellite.
  - On INSERT with state ≠ STOWED, require the pod to be CONFIRMED.
  - On UPDATE where the state changes, require that the `(OLD.state, NEW.state)` pair exists in `sat_state_transition`, and that moving off STOWED requires the pod to be RELEASED or CONFIRMED.
  - Otherwise `RAISE EXCEPTION 'illegal state transition % -> % for %'` USING ERRCODE `'check_violation'`.
  - Skipped when `current_setting('somaiyanet.bypass_state_machine', true) = 'on'`.
- **`audit_row()`** is a generic SECURITY DEFINER trigger function writing to audit_log. It strips any key named `secret` from the JSONB.
  - Attached AFTER I/U/D on deployer_pod, telecommand, routing_decision, ground_station, and station_key.
  - On satellite it is AFTER INSERT OR DELETE OR UPDATE OF state, pod_id, tle_line1, tle_line2, so telemetry-driven battery updates do not spam the log.
- **`trg_telemetry_ingest`**, AFTER INSERT ON telemetry FOR EACH ROW, through a SECURITY DEFINER function.
  - Updates `satellite.battery_v` and `last_seen` only when `NEW.ts >= last_seen`.
  - Inserts an alert: CRITICAL below 6.8, WARN below 7.0. It is skipped when an unacknowledged alert of the same severity for that sat already exists from the last 15 minutes.
  - Calls `pg_notify('telemetry', json_build_object(sat_id, ts, battery_v, temp_c, rssi_dbm, mode_active)::text)`.
- **`trg_telecommand_verify`**, BEFORE INSERT ON telecommand, SECURITY DEFINER.
  - Recompute the HMAC from station_key.secret. On a mismatch, `RAISE 'telecommand rejected: bad HMAC signature'` USING ERRCODE `'invalid_authorization_specification'`.
  - On success set `verified = TRUE`.
  - When the opcode is SAFE_MODE, an AFTER trigger moves the satellite to SAFE through the state machine.
  - **`sign_telecommand(p_station VARCHAR, p_sat VARCHAR, p_opcode VARCHAR, p_args JSONB, p_nonce BIGINT) RETURNS BYTEA`** is SECURITY DEFINER. It simulates the station's signing HSM. It is allowed only when the caller is the director or the station's `operator_role` (check `pg_has_role(session_user, …)`), and raises `insufficient_privilege` otherwise.
- **`trg_contact_kind`**, BEFORE INSERT OR UPDATE ON contact. An ISL requires both ends to be SAT, and a DOWNLINK requires a SAT → GROUND direction. It uses network_node.kind.
- **`trg_node_totality`** is a CONSTRAINT TRIGGER, AFTER INSERT ON network_node, DEFERRABLE INITIALLY DEFERRED. At commit it requires exactly one subtype row matching the node's kind (total specialization).
- **`trg_decision_notify`**, AFTER INSERT ON routing_decision, calls `pg_notify('decision', json_build_object(...)::text)`.

## 7. Views contract (db/03_views.sql)

| view | demonstrates |
|---|---|
| `v_constellation_status` | multi-way JOIN: node + satellite + pod + LATERAL latest telemetry + LATERAL next downlink + queued bytes; one row per sat |
| `v_station_workload` | `ground_station LEFT JOIN contact` (DOWNLINK, next 24 h) with GROUP BY, COUNT, SUM(duration_s), AVG(link_score); created `WITH (security_invoker = true)` so RLS applies through it |
| `v_low_power` | GROUP BY sat HAVING AVG(battery_v) < 7.0 over the last 24 h |
| `v_queue_by_mode` | GROUP BY origin_sat, mode, status with COUNT and SUM(size_bytes) |
| `v_heard_by_bom_not_hel` / `v_heard_by_both` | EXCEPT / INTERSECT over DOWNLINK contacts in the last 24 h + next 24 h |
| `v_mode_mix` | UNION ALL of per-subtype counts (ttc_frame / sstv_image / voice_frame) |
| `v_weak_isl` | nested scalar subquery: ISLs with link_score below the average ISL score |
| `v_callsign_search` | LIKE / ILIKE example over network_node callsigns and display names |
| `v_ai_overrides` | routing_decision WHERE overridden, joined to ai_model |
| `v_route_detail` | route ⨝ route_hop ⨝ contact ⨝ network_node, ordered by hop |
| `mv_kpis` | MATERIALIZED, one row with `kpi_id = 1` and a UNIQUE index (so REFRESH … CONCURRENTLY works): sats_total, sats_operational, packets_queued, packets_delivered_24h, bytes_delivered_24h, contacts_next_24h, isl_contacts_next_24h, avg_route_latency_s, ai_overrides_24h, refreshed_at |

## 8. Security contract (db/07_security.sql)

Group roles are NOLOGIN: `grp_director`, `grp_station_operator`, `grp_analyst`, `grp_router`. Login roles inherit from them:

| login role | member of | can |
|---|---|---|
| mission_director | grp_director | everything; WITH GRANT OPTION on SELECT telemetry (GRANT-chain demo) |
| station_operator_bom | grp_station_operator | read the mission tables and views; INSERT telecommand (own station only, via RLS); UPDATE (acknowledged) ON alert (column privilege); SELECT (station_id, key_id, rotated_at) ON station_key (column privilege; `secret` is denied); EXECUTE sign_telecommand, cgr_routes, plan_route, decide_for_satellite, preview_decision |
| station_operator_hel | grp_station_operator | same, for GS-HEL |
| student_analyst | grp_analyst | read-only: SELECT the views, telemetry, packet + subtypes, contact, route, route_hop, ai_model, dt_node, ai_model_metric, routing_decision; EXECUTE cgr_routes, ai_decide, rule_action, rule_reason, features_for_satellite, preview_decision, link_score_*. **No** telecommand, station_key, or audit_log. |
| ai_router | grp_router | INSERT telemetry, packet + subtypes; SELECT payload_mode, contact; SELECT (node_id, state) ON satellite; EXECUTE decide_for_satellite, dispatch_packets, route_packet. **Cannot SELECT telemetry** (write-only sensor). |

- Start with `REVOKE ALL` from PUBLIC on the database, the schema, all tables, all functions, and all procedures.
- RLS, ENABLED and FORCED:
  - `telecommand` and `station_key`: visible and writable only when the caller is in grp_director, or the row's station has `operator_role = current_user`.
  - `contact`: kind = 'ISL' rows are visible to all; DOWNLINK rows are visible to grp_director, grp_analyst, and grp_router, or to the station operator whose station is `to_node`.
  - Use `pg_has_role(current_user, 'grp_director', 'MEMBER')`-style checks.
- SECURITY DEFINER functions are owned by the superuser that runs setup, so they bypass RLS. That is intentional and documented in comments.
- End the file with a verification `SELECT` over `information_schema.role_table_grants` for the five login roles.

## 9. Design language (REVISED: our own identity, not the friend's)

The friend's site is pure black + electric blue + Inter. **Ours must not look like it.** Nothing from `reference/landing/src/sections` or its layout components may be reused; only generic helpers (GSAP/Lenis setup, the land-mask loader) and the Earth textures may be.

- **Palette tokens** (CSS variables in `web/src/styles/tokens.css`, the single source):
  - `--ink` `#0b1020` (page background, deep ink navy), `--ink-2` `#111833` (panels), `--ink-3` `#1a2346` (raised), `--rule` `#26305a` (hairlines)
  - `--cream` `#f3ead8` (primary text), `--cream-dim` `#b9b09e` (secondary), `--mute` `#7d7a73`
  - **`--somaiya` `#d7263d` (PRIMARY accent: CTAs, the active hop, highlights, the brand)**, `--somaiya-soft` `#d7263d22`
  - `--amber` `#ffb020` (data values, warnings), `--signal` `#4cc38a` (success/downlink), `--sky` `#6ea8ff` (used *small*: ISL lines, links only)
- **Type** (local via @fontsource, no CDN):
  - **Space Grotesk** for display and headings: big, tight tracking, weights 500/700
  - **IBM Plex Sans** for body text
  - **IBM Plex Mono** for data, SQL, labels and numbers
- **Signature motifs** (use them consistently, so the site reads as one system):
  - **Packet tag:** a small pill like `PKT#0412 · SSTV · 41.2 KB` in Plex Mono on a `--somaiya-soft` background. The story follows this one packet.
  - **SQL ribbon:** a strip of real SQL in mono, typed out with a caret, with keywords in `--amber` and identifiers in cream.
  - **Hop rail:** a horizontal or vertical rail of nodes (circles for SATs, squares for stations) connected by dashed segments, where the active hop glows Somaiya red.
  - **Grid paper:** a faint 24 px grid (`--rule` at 35% opacity) behind the sections, like mission-planning paper.
  - Section labels are written `01 / CAPTURED` (number, slash, word) in Plex Mono, **not** `[ SECTION ]` brackets.
- The globe on `/ops` reuses the orbit math and textures but is re-themed to these tokens: Somaiya-red selection, amber satellites, sky ISL chords, signal-green downlinks, and ink panels.
- Every data page has a collapsible **"SQL under the hood"** drawer showing the exact SQL that ran, with Exp/CO chips.

## 10. Role picker instead of a login form (user decision)

There is **no username/password login screen**. `/login` is replaced by a Netflix-style **"Who's on console?"** profile picker at `/console`. It shows one large tile per DB login role, each with an avatar/icon, a name, and a one-line "can do" summary:

| tile | DB role | accent |
|---|---|---|
| Mission Director | mission_director | Somaiya red ring |
| Mumbai Station (GS-BOM) | station_operator_bom | blue |
| Espoo Station (GS-HEL) | station_operator_hel | blue |
| Student Analyst | student_analyst | muted |
| AI Router (spacecraft) | ai_router | green |

- **Picking a tile.** Clicking a tile calls `POST /api/session {role}`. The backend reads that role's password from `.env` (server side only, never sent to the browser), opens a pooled connection **as that real Postgres role**, and sets an httpOnly session cookie. Every query after that runs as that role, so permission denials and RLS still come from PostgreSQL, not from the app. This is the whole point of the demo.
- **Switching roles.** The top bar always shows the current profile chip. Clicking it switches profile instantly (Netflix "switch profile"), which makes the denial demo fast, e.g. switch Analyst to Director to Analyst.
- **Hover detail.** Hovering a tile shows the role's privileges, read live from `has_table_privilege` / `information_schema`.
