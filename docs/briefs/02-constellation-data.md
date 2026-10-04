# Brief 02: Constellation, contact graph, telemetry, packets (data scripts)

Read `docs/spec.md` first. Follow §0 ground rules and implement the §4 contract. `db/01_schema.sql`, `db/02_seed.sql`, `db/04_functions.sql` (the link-score functions), `scripts/_db.py` and `scripts/setup_db.py` already exist. Read them, and do **not** modify them unless something is genuinely broken. If you do change one, say so in your report.

## Goal
`python scripts/setup_db.py` builds a database that holds a realistic 8-satellite SomaiyaSat constellation:
- real SGP4 orbits
- a time-varying inter-satellite + downlink **contact graph**
- 7 days of telemetry
- a packet queue

## Files to create
1. `scripts/_orbit.py`. Adapt it from `reference/scripts/_orbit.py`, which is MIT-style friend code. Keep a one-line credit comment at the top. It needs:
   - TLE parse
   - `gmst_rad`
   - TEME→ECEF/geodetic
   - geodetic→ECEF
   - `look_angles(st_lat, st_lon, st_alt_km, sat_ecef) -> (az, el, range_km)`
   - a **vectorised** helper `propagate_many(satrecs, times_utc: list[datetime]) -> np.ndarray [n_sat, n_time, 3]` in TEME km. Use `sgp4.api.SatrecArray` + `jday`.
   - a TEME→ECEF rotation that works on arrays.
2. `scripts/build_constellation.py`, exposing `run(conn_factory)`.
   - Build 8 orbits per spec §4 with `Satrec.sgp4init` (WGS72, epoch = today 00:00 UTC), and export them with `sgp4.exporter.export_tle`. Each line must be exactly 69 chars and round-trip through `Satrec.twoline2rv`.
   - Insert `network_node` (kind SAT, display_name, callsign) and `satellite` rows in **one transaction**: norad_id, plane, slot, pod_id, state, tle lines, epoch_utc, inclination_deg, mean_motion and mass_g ≈ 250. Use the pinned states from §4. A deferred totality trigger may exist, so insert the node and the subtype row in the same transaction.
   - Print a table of sat, state, period_min.
3. `scripts/compute_contacts.py`, exposing `run(conn_factory)`.
   - Use the §4 horizon, 30 s sampling, and the operational sats only (state ≠ STOWED).
   - **ISL:** for every unordered sat pair, compute the range and find the windows where it is ≤ 2000 km and longer than 60 s. Insert **both** directions.
   - **Downlink:** for every operational sat × ground station, find the windows where elevation ≥ the station's `min_elevation_deg` (read from the DB). Record `max_elevation_deg` and the range at max.
   - Link scores **must be computed by the SQL functions**. COPY the raw windows into a TEMP table, then `INSERT INTO contact (...) SELECT ..., link_score_isl(min_range_km) / link_score_downlink(max_elevation_deg, range_at_max)`.
   - Truncate `contact` first, cascading to the route tables, so the script is re-runnable.
   - Print the counts: ISL windows, cross-plane ISL windows, downlinks per station.
   - Sanity-assert: at least 1 cross-plane window, and every operational sat has ≥ 1 downlink in the next 24 h.
4. `scripts/generate_telemetry.py`, exposing `run(conn_factory)`.
   - As superuser, call `ensure_telemetry_partitions(current_date - 8, current_date + 2)`.
   - Then connect **as `ai_router`**, with the password via `_db.role_password('ai_router')`. If that role does not exist yet (security file not written yet), fall back to the superuser and print a clear warning.
   - Write 7 days × 1 row/min per operational sat with COPY. Battery follows the orbit:
     - sunlit charge
     - eclipse discharge, using `housekeeping.sunlit` and `eclipse_in_s`
     - plus noise
   - Temperature tracks sunlit. RSSI is random -120..-90. `mode_active` is random weighted.
   - The other housekeeping keys come from spec §2.
   - B2's last 24 h must average **< 7.0 V**, and every other operational sat's last 24 h must average **≥ 7.0 V**.
   - The **latest** row of every sat must equal its pinned battery in §4 exactly, at `ts = date_trunc('minute', now())`.
   - Rows must land in the daily partitions, not in the default partition.
5. `scripts/generate_packets.py`, exposing `run(conn_factory)`.
   - Per §4: about 60 QUEUED packets per operational sat, each with its subtype row, plus about 300 DELIVERED historical packets. Fixed `random.seed(17)` for reproducibility.
   - Callsigns must match the `callsign` domain regex.

Each script must also run standalone (`if __name__ == "__main__":`) against the default DB, using `_db.connect`.

## Do not touch
`db/*` (unless broken, and then report it), `docs/`, `reference/`, `.env*`, `web/`, `backend/`.

## Acceptance (run these and paste the outputs)
```bash
.venv/Scripts/python scripts/setup_db.py
```
Then, with psql (PGPASSWORD exported from `.env`, never echoed), run against db `somaiyanet`:
```sql
SELECT node_id, state, period_min, length(tle_line1), length(tle_line2) FROM satellite ORDER BY 1;
SELECT kind, count(*), min(duration_s), max(duration_s), round(avg(link_score)) FROM contact GROUP BY kind;
SELECT to_node, count(*) FROM contact WHERE kind='DOWNLINK' GROUP BY 1 ORDER BY 1;
SELECT tableoid::regclass, count(*) FROM telemetry GROUP BY 1 ORDER BY 1;
SELECT sat_id, round(avg(battery_v),3) FROM telemetry WHERE ts > now()-interval '24 hours' GROUP BY 1 ORDER BY 1;
SELECT DISTINCT ON (sat_id) sat_id, ts, battery_v FROM telemetry ORDER BY sat_id, ts DESC;
SELECT mode, status, count(*) FROM packet GROUP BY 1,2 ORDER BY 1,2;
```
Expected:
- 8 sats with TLE length 69/69
- both contact kinds present
- every station has downlinks (Svalbard the most)
- `telemetry_default` count = 0
- B2 avg < 7.0 and the others ≥ 7.0
- latest batteries match §4
- QUEUED + DELIVERED packets present

Running `setup_db.py` a second time must also succeed.
