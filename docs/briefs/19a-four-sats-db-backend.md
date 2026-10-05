# Brief 19a: four satellites in the database, scripts and backend

Read docs/briefs/19-four-satellites.md first (mapping table). Also read docs/spec.md §0 rules.

Files you may edit: `db/*.sql`, `scripts/*.py`, `backend/**` (including `backend/tests/**`),
`tests/**`, `docs/spec.md` (update the constellation description and IDs).
Do NOT edit anything under `web/`.

## Work
1. Replace every old satellite / pod / callsign ID per the mapping (grep for `SAT-[AB][1-4]`,
   `POD-[AB][1-4]`, `VU2SA`), including: `db/02_seed.sql`, `db/04_functions.sql`,
   `db/08_bench.sql`, `db/09_normalization.sql` (flight-log sample rows: keep the same number of
   rows and the same anomalies, only change the satellite values), `scripts/build_constellation.py`
   (one plane, 4 slots, SS-4 STOWED), `scripts/generate_telemetry.py` (battery profiles: SS-1
   healthy, SS-2 weak ~6.9 V, SS-3 below 6.8 V; SS-4 stowed = no telemetry),
   `scripts/generate_packets.py`, `backend/simulator.py`, `backend/routers/{labs_tx,labs_security,
   routing,console}.py` (example SQL / defaults / presets), and the tests.
2. Keep every DBMS feature working: generalization, weak entities, CGR multi-hop (there must still
   be at least one 2-hop relay route in the next 24 h), the watchdog override for SS-2/SS-3, the
   state-machine demo (SS-4 STOWED -> DEPLOYED via the Deploy procedure), RLS per station,
   all 7 transaction scenarios, normalization lossless check, index bench.
3. Packet and telemetry volumes: scale them so tables are still big enough for the index bench
   (BRIN / partition pruning need many telemetry rows; keep about 10 080 rows per active sat per
   day x 7 days, i.e. ~30 000 rows) and the KPIs are non-trivial.

## Verify (you may run these; use the scratch cluster, never pg_ctl / initdb)
```
PGPORT=55433 .venv/Scripts/python scripts/setup_db.py --db somaiyanet_w19
PGPORT=55433 .venv/Scripts/python -m pytest tests -q
PGPORT=55433 SOMAIYANET_DB=somaiyanet_w19 .venv/Scripts/python -m pytest backend/tests -q
PGPORT=55433 psql -U postgres -d somaiyanet_w19 -c "SELECT node_id, display_name, state FROM satellite ORDER BY 1"
PGPORT=55433 psql -U postgres -d somaiyanet_w19 -c "SELECT * FROM cgr_routes('SS-1', now(), 41216) LIMIT 5"
```
(psql is at "C:/Program Files/PostgreSQL/18/bin/psql".) All tests must pass. Do not start servers
in the foreground. Do not run git.

At the end print: the satellite table, the top CGR routes from SS-1, the number of watchdog
overrides in routing_decision, and the per-station passes/day for the 6 ground stations
(`SELECT to_node, count(*) FROM contact WHERE kind='DOWNLINK' GROUP BY 1`), because the web
team needs those numbers.
