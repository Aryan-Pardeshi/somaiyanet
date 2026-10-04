-- [CO3 - normalization: UNF -> 1NF -> 2NF -> 3NF -> BCNF]
-- Flight-log normalization lab in its own schema so mission tables are
-- never touched. UNF carries a repeating group (modes_sent) plus repeated
-- sat/pod/station/operator facts; each stage removes one kind of anomaly.
-- Every decomposition below is lossless (see norm.lossless_check).

CREATE SCHEMA IF NOT EXISTS norm;

-- ------------------------------------------------------------- UNF ---
-- UNF: one row per pass, but modes_sent packs 'MODE:bytes;...' (repeating
-- group) and sat/pod/station/operator facts repeat on every row.
CREATE TABLE norm.flight_log_unf (
    log_no           INT         NOT NULL PRIMARY KEY,
    sat_name         TEXT        NOT NULL,
    sat_plane        TEXT        NOT NULL,
    pod_serial       TEXT        NOT NULL,
    pod_mechanism    TEXT        NOT NULL,
    station_city     TEXT        NOT NULL,
    station_callsign TEXT        NOT NULL,
    pass_date        DATE        NOT NULL,
    modes_sent       TEXT        NOT NULL,
    operator_name    TEXT        NOT NULL,
    operator_phone   TEXT        NOT NULL
);
COMMENT ON TABLE norm.flight_log_unf IS 'UNF flight log: repeating group modes_sent plus repeated sat/pod/station/operator facts.';

INSERT INTO norm.flight_log_unf
    (log_no, sat_name, sat_plane, pod_serial, pod_mechanism, station_city, station_callsign, pass_date, modes_sent, operator_name, operator_phone)
VALUES
    (1,  'SAT-A1', 'A', 'SPOD-2026-001', 'SPRING_PUSHER', 'Mumbai',    'VU2KJS', CURRENT_DATE - 6, 'TTC:512;SSTV:40960;M17:8000',   'Aarav Shah',  '+91-98200-00001'),
    (2,  'SAT-A1', 'A', 'SPOD-2026-001', 'SPRING_PUSHER', 'Espoo',     'OH2SOM', CURRENT_DATE - 6, 'TTC:256;M17:4000',              'Aino Virtanen', '+358-40-000002'),
    (3,  'SAT-A2', 'A', 'SPOD-2026-002', 'BURN_WIRE',     'Mumbai',    'VU2KJS', CURRENT_DATE - 5, 'TTC:512;CODEC2:3000',           'Aarav Shah',  '+91-98200-00001'),
    (4,  'SAT-A2', 'A', 'SPOD-2026-002', 'BURN_WIRE',     'Bengaluru', 'VU2BLR', CURRENT_DATE - 5, 'TTC:128;SSTV:61440',           'Diya Nair',   '+91-98450-00003'),
    (5,  'SAT-A3', 'A', 'SPOD-2026-003', 'SPRING_PUSHER', 'Mumbai',    'VU2KJS', CURRENT_DATE - 4, 'TTC:512;SSTV:30720;M17:8000',  'Aarav Shah',  '+91-98200-00001'),
    (6,  'SAT-A4', 'A', 'SPOD-2026-004', 'BURN_WIRE',     'Tokyo',     'JA1SOM', CURRENT_DATE - 4, 'TTC:256',                     'Ren Sato',    '+81-90-000004'),
    (7,  'SAT-B1', 'B', 'SPOD-2026-005', 'SPRING_PUSHER', 'Mumbai',    'VU2KJS', CURRENT_DATE - 3, 'TTC:512;M17:12000;CODEC2:2000','Aarav Shah',  '+91-98200-00001'),
    (8,  'SAT-B1', 'B', 'SPOD-2026-005', 'SPRING_PUSHER', 'Cape Town', 'ZS1SOM', CURRENT_DATE - 3, 'TTC:256;SSTV:51200',           'Lena Botha',  '+27-82-000005'),
    (9,  'SAT-B2', 'B', 'SPOD-2026-006', 'BURN_WIRE',     'Espoo',     'OH2SOM', CURRENT_DATE - 2, 'TTC:512;CODEC2:8000',          'Aino Virtanen', '+358-40-000002'),
    (10, 'SAT-B3', 'B', 'SPOD-2026-007', 'SPRING_PUSHER', 'Longyearbyen','LA0SOM', CURRENT_DATE - 2, 'TTC:128;M17:6000',           'Ole Hansen',  '+47-90-000006'),
    (11, 'SAT-A1', 'A', 'SPOD-2026-001', 'SPRING_PUSHER', 'Mumbai',    'VU2KJS', CURRENT_DATE - 1, 'TTC:512;SSTV:40960',          'Aarav Shah',  '+91-98200-00001'),
    (12, 'SAT-B2', 'B', 'SPOD-2026-006', 'BURN_WIRE',     'Mumbai',    'VU2KJS', CURRENT_DATE - 1, 'TTC:256;SSTV:20480;M17:4000;CODEC2:1000', 'Aarav Shah', '+91-98200-00001');

-- ------------------------------------------------------------- 1NF ---
-- 1NF: one row per (pass, mode); the repeating group becomes atomic rows.
CREATE TABLE norm.flight_log_1nf (
    log_no           INT  NOT NULL,
    mode             TEXT NOT NULL,
    bytes            INT  NOT NULL CHECK (bytes > 0),
    sat_name         TEXT NOT NULL,
    sat_plane        TEXT NOT NULL,
    pod_serial       TEXT NOT NULL,
    pod_mechanism    TEXT NOT NULL,
    station_city     TEXT NOT NULL,
    station_callsign TEXT NOT NULL,
    pass_date        DATE NOT NULL,
    operator_name    TEXT NOT NULL,
    operator_phone   TEXT NOT NULL,
    PRIMARY KEY (log_no, mode)
);
COMMENT ON TABLE norm.flight_log_1nf IS '1NF: repeating group split into one row per (log_no, mode) with atomic bytes.';

INSERT INTO norm.flight_log_1nf
    (log_no, mode, bytes, sat_name, sat_plane, pod_serial, pod_mechanism,
     station_city, station_callsign, pass_date, operator_name, operator_phone)
SELECT u.log_no,
       split_part(part, ':', 1) AS mode,
       split_part(part, ':', 2)::INT AS bytes,
       u.sat_name, u.sat_plane, u.pod_serial, u.pod_mechanism,
       u.station_city, u.station_callsign, u.pass_date,
       u.operator_name, u.operator_phone
FROM norm.flight_log_unf AS u,
     LATERAL regexp_split_to_table(u.modes_sent, ';') AS part;

-- ------------------------------------------------------------- 2NF ---
-- 2NF: partial dependencies on log_no alone (sat/station/operator facts do
-- not need mode) move to pass_log; the mode bytes stay in pass_mode.
CREATE TABLE norm.pass_log (
    log_no           INT  NOT NULL PRIMARY KEY,
    sat_name         TEXT NOT NULL,
    sat_plane        TEXT NOT NULL,
    pod_serial       TEXT NOT NULL,
    pod_mechanism    TEXT NOT NULL,
    station_city     TEXT NOT NULL,
    station_callsign TEXT NOT NULL,
    pass_date        DATE NOT NULL,
    operator_name    TEXT NOT NULL,
    operator_phone   TEXT NOT NULL
);
COMMENT ON TABLE norm.pass_log IS '2NF header: facts depending on the whole pass (log_no), free of the repeating mode.';

CREATE TABLE norm.pass_mode (
    log_no INT  NOT NULL REFERENCES norm.pass_log ON DELETE CASCADE,
    mode   TEXT NOT NULL,
    bytes  INT  NOT NULL CHECK (bytes > 0),
    PRIMARY KEY (log_no, mode)
);
COMMENT ON TABLE norm.pass_mode IS '2NF line items: bytes per (pass, mode); full key needed.';

INSERT INTO norm.pass_log
    (log_no, sat_name, sat_plane, pod_serial, pod_mechanism, station_city,
     station_callsign, pass_date, operator_name, operator_phone)
SELECT DISTINCT log_no, sat_name, sat_plane, pod_serial, pod_mechanism,
       station_city, station_callsign, pass_date, operator_name, operator_phone
FROM norm.flight_log_1nf;

INSERT INTO norm.pass_mode (log_no, mode, bytes)
SELECT log_no, mode, bytes FROM norm.flight_log_1nf;

-- ------------------------------------------------------------- 3NF ---
-- 3NF: transitive dependencies leave pass_log for their own entities:
-- sat_name -> sat_plane, pod_serial; pod_serial -> pod_mechanism;
-- station_callsign -> station_city; operator_name -> operator_phone.
CREATE TABLE norm.sat (
    sat_name   TEXT NOT NULL PRIMARY KEY,
    sat_plane  TEXT NOT NULL,
    pod_serial TEXT NOT NULL
);
COMMENT ON TABLE norm.sat IS '3NF: sat_name determines plane and pod (transitive via pass).';

CREATE TABLE norm.pod (
    pod_serial    TEXT NOT NULL PRIMARY KEY,
    pod_mechanism TEXT NOT NULL
);
COMMENT ON TABLE norm.pod IS '3NF: pod_serial determines the release mechanism.';

CREATE TABLE norm.station (
    station_callsign TEXT NOT NULL PRIMARY KEY,
    station_city     TEXT NOT NULL
);
COMMENT ON TABLE norm.station IS '3NF: station callsign determines the city.';

CREATE TABLE norm.operator (
    operator_name  TEXT NOT NULL PRIMARY KEY,
    operator_phone TEXT NOT NULL
);
COMMENT ON TABLE norm.operator IS '3NF: operator name determines the phone number.';

-- Residual 3NF fact: the pass itself, now referencing the entities.
CREATE TABLE norm.pass_core (
    log_no           INT  NOT NULL PRIMARY KEY,
    sat_name         TEXT NOT NULL REFERENCES norm.sat,
    station_callsign TEXT NOT NULL REFERENCES norm.station,
    pass_date        DATE NOT NULL,
    operator_name    TEXT NOT NULL REFERENCES norm.operator
);
COMMENT ON TABLE norm.pass_core IS '3NF residual fact: a pass links sat, station, date and duty operator.';

INSERT INTO norm.sat (sat_name, sat_plane, pod_serial)
SELECT DISTINCT sat_name, sat_plane, pod_serial FROM norm.pass_log;

INSERT INTO norm.pod (pod_serial, pod_mechanism)
SELECT DISTINCT pod_serial, pod_mechanism FROM norm.pass_log;

INSERT INTO norm.station (station_callsign, station_city)
SELECT DISTINCT station_callsign, station_city FROM norm.pass_log;

INSERT INTO norm.operator (operator_name, operator_phone)
SELECT DISTINCT operator_name, operator_phone FROM norm.pass_log;

INSERT INTO norm.pass_core (log_no, sat_name, station_callsign, pass_date, operator_name)
SELECT log_no, sat_name, station_callsign, pass_date, operator_name FROM norm.pass_log;

-- ------------------------------------------------------------ BCNF ---
-- BCNF case: duty roster rule "each operator works exactly one station; a
-- station may have several operators; for a (station, pass_date) the duty
-- operator is unique". FDs: {station_callsign, pass_date} -> operator_name
-- and operator_name -> station_callsign. The second FD's left side is not a
-- superkey, so duty is in 3NF but not BCNF; split off operator_station.
CREATE TABLE norm.duty (
    station_callsign TEXT NOT NULL,
    pass_date        DATE NOT NULL,
    operator_name    TEXT NOT NULL,
    PRIMARY KEY (station_callsign, pass_date)
);
COMMENT ON TABLE norm.duty IS '3NF-but-not-BCNF roster: operator_name -> station_callsign breaks BCNF.';

CREATE TABLE norm.operator_station (
    operator_name    TEXT NOT NULL PRIMARY KEY,
    station_callsign TEXT NOT NULL
);
COMMENT ON TABLE norm.operator_station IS 'BCNF split: each operator works exactly one station.';

CREATE TABLE norm.duty_bcnf (
    operator_name TEXT NOT NULL REFERENCES norm.operator_station,
    pass_date     DATE NOT NULL,
    PRIMARY KEY (operator_name, pass_date)
);
COMMENT ON TABLE norm.duty_bcnf IS 'BCNF split: duty roster keyed by (operator, date).';

INSERT INTO norm.duty (station_callsign, pass_date, operator_name)
SELECT DISTINCT station_callsign, pass_date, operator_name FROM norm.pass_log;

INSERT INTO norm.operator_station (operator_name, station_callsign)
SELECT DISTINCT operator_name, station_callsign FROM norm.pass_log;

INSERT INTO norm.duty_bcnf (operator_name, pass_date)
SELECT DISTINCT operator_name, pass_date FROM norm.pass_log
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------ FD catalog ---
CREATE OR REPLACE FUNCTION norm.fd_catalog()
RETURNS TABLE (stage TEXT, fd TEXT, violates TEXT, fix TEXT)
LANGUAGE sql IMMUTABLE AS $$
    SELECT * FROM (VALUES
        ('UNF',  'log_no -> sat_name, station_callsign, pass_date, operator_name', 'none (key FD)', 'keep as pass key'),
        ('UNF',  'repeating group modes_sent contains (mode, bytes)', '1NF: non-atomic value', 'split into norm.flight_log_1nf(log_no, mode)'),
        ('1NF',  'log_no -> sat_name, sat_plane, pod_serial, station_city, operator_phone (independent of mode)', '2NF: partial dependency on part of key', 'move to norm.pass_log; keep norm.pass_mode(log_no, mode, bytes)'),
        ('2NF',  'sat_name -> sat_plane, pod_serial', '3NF: transitive via log_no', 'split into norm.sat'),
        ('2NF',  'pod_serial -> pod_mechanism', '3NF: transitive via log_no', 'split into norm.pod'),
        ('2NF',  'station_callsign -> station_city', '3NF: transitive via log_no', 'split into norm.station'),
        ('2NF',  'operator_name -> operator_phone', '3NF: transitive via log_no', 'split into norm.operator'),
        ('3NF',  '{station_callsign, pass_date} -> operator_name', 'none (superkey FD)', 'keep in norm.duty_bcnf via operator'),
        ('3NF',  'operator_name -> station_callsign (each operator one station)', 'BCNF: left side not a superkey of duty', 'split norm.duty into norm.operator_station + norm.duty_bcnf')
    ) AS v(stage, fd, violates, fix);
$$;
COMMENT ON FUNCTION norm.fd_catalog() IS 'Every functional dependency, which normal form it violates, and the fix.';

-- -------------------------------------------------- anomaly demos ---
-- Each demo is read-only in effect: it only reads counts and returns
-- explanatory text, so no rollback is needed.

CREATE OR REPLACE FUNCTION norm.demo_update_anomaly()
RETURNS TABLE (stage TEXT, before TEXT, after TEXT, explanation TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_sat   TEXT := 'SAT-A1';
    v_planes INT;
    v_rows   INT;
BEGIN
    SELECT COUNT(DISTINCT sat_plane) INTO v_planes
    FROM norm.flight_log_unf WHERE sat_name = v_sat;
    SELECT COUNT(*) INTO v_rows FROM norm.flight_log_unf WHERE sat_name = v_sat;
    stage := 'UNF'; before := v_sat || ' flies plane A in ' || v_rows || ' rows';
    after := 'updating 1 of ' || v_rows || ' rows leaves ' || (v_rows - 1)
             || ' rows claiming the old plane (' || v_planes || ' distinct values -> 2)';
    explanation := 'Update anomaly: the fact "SAT-A1 is plane A" repeats, so a single-row UPDATE makes the table contradict itself.';
    RETURN NEXT;
    stage := '3NF'; before := 'norm.sat holds 1 row for SAT-A1';
    after := 'UPDATE norm.sat SET sat_plane = ... WHERE sat_name = ''SAT-A1'' changes all passes at once';
    explanation := 'Fixed: the plane fact lives once, so one UPDATE is automatically consistent.';
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION norm.demo_insert_anomaly()
RETURNS TABLE (stage TEXT, before TEXT, after TEXT, explanation TEXT)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    stage := 'UNF';
    before := 'to roster a new operator you must invent a fake pass (log_no, modes_sent, ...)';
    after := 'or store NULLs for the pass columns, breaking the PK';
    explanation := 'Insert anomaly: operator facts cannot exist without a pass row in UNF.';
    RETURN NEXT;
    stage := '3NF';
    before := 'norm.operator holds duty staff independently of passes';
    after := 'INSERT INTO norm.operator (operator_name, operator_phone) adds staff with no pass needed';
    explanation := 'Fixed: INSERT into norm.operator records the fact once, no dummy pass.';
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION norm.demo_delete_anomaly()
RETURNS TABLE (stage TEXT, before TEXT, after TEXT, explanation TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_only TEXT;
BEGIN
    SELECT station_callsign INTO v_only
    FROM norm.flight_log_unf
    GROUP BY station_callsign HAVING COUNT(*) = 1
    ORDER BY station_callsign LIMIT 1;
    IF v_only IS NULL THEN v_only := 'JA1SOM'; END IF;
    stage := 'UNF';
    before := 'station ' || v_only || ' appears on only one pass row';
    after := 'deleting that pass erases the station city and operator facts too';
    explanation := 'Delete anomaly: facts about the station vanish with the last pass that mentions it.';
    RETURN NEXT;
    stage := '3NF';
    before := 'norm.station keeps ' || v_only || ' independently of passes';
    after := 'deleting the pass leaves norm.station untouched';
    explanation := 'Fixed: DELETE FROM norm.pass_core removes the event, not the entity.';
    RETURN NEXT;
END;
$$;

-- -------------------------------------------------- lossless check ---
-- Rejoins each decomposition with NATURAL JOIN and EXCEPTs both ways
-- against the previous stage; every step must show 0 missing/spurious.
CREATE OR REPLACE FUNCTION norm.lossless_check()
RETURNS TABLE (stage TEXT, rows_original BIGINT, rows_rejoined BIGINT, missing BIGINT, spurious BIGINT)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    -- UNF -> 1NF: compare the unnested (log_no, mode, bytes) projection.
    stage := 'unf->1nf';
    WITH unf_nested AS (
        SELECT u.log_no, split_part(part, ':', 1) AS mode,
               split_part(part, ':', 2)::INT AS bytes
        FROM norm.flight_log_unf AS u,
             LATERAL regexp_split_to_table(u.modes_sent, ';') AS part
    ),
    one AS (SELECT log_no, mode, bytes FROM norm.flight_log_1nf),
    m AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM unf_nested EXCEPT SELECT * FROM one)) AS t),
    s AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM one EXCEPT SELECT * FROM unf_nested)) AS t),
    co AS (SELECT COUNT(*)::BIGINT AS c FROM unf_nested),
    cr AS (SELECT COUNT(*)::BIGINT AS c FROM one)
    SELECT co.c, cr.c, m.c, s.c INTO rows_original, rows_rejoined, missing, spurious
    FROM co, cr, m, s;
    RETURN NEXT;

    -- 1NF -> 2NF: pass_log JOIN pass_mode must equal 1NF (same column order).
    stage := '1nf->2nf';
    WITH prev AS (SELECT log_no, mode, bytes, sat_name, sat_plane, pod_serial, pod_mechanism,
                         station_city, station_callsign, pass_date, operator_name, operator_phone
                  FROM norm.flight_log_1nf),
    rejoined AS (SELECT p.log_no, m.mode, m.bytes, p.sat_name, p.sat_plane, p.pod_serial, p.pod_mechanism,
                        p.station_city, p.station_callsign, p.pass_date, p.operator_name, p.operator_phone
                 FROM norm.pass_log AS p JOIN norm.pass_mode AS m USING (log_no)),
    m AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM prev EXCEPT SELECT * FROM rejoined)) AS t),
    s AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM rejoined EXCEPT SELECT * FROM prev)) AS t),
    co AS (SELECT COUNT(*)::BIGINT AS c FROM prev),
    cr AS (SELECT COUNT(*)::BIGINT AS c FROM rejoined)
    SELECT co.c, cr.c, m.c, s.c INTO rows_original, rows_rejoined, missing, spurious
    FROM co, cr, m, s;
    RETURN NEXT;

    -- 2NF -> 3NF: sat/pod/station/operator/pass_core rejoin must equal pass_log.
    stage := '2nf->3nf';
    WITH prev AS (SELECT log_no, sat_name, sat_plane, pod_serial, pod_mechanism,
                         station_city, station_callsign, pass_date, operator_name, operator_phone
                  FROM norm.pass_log),
    rejoined AS (
        SELECT p.log_no, s.sat_name, s.sat_plane, s.pod_serial, d.pod_mechanism,
               st.station_city, p.station_callsign, p.pass_date,
               p.operator_name, o.operator_phone
        FROM norm.pass_core AS p
        JOIN norm.sat AS s USING (sat_name)
        JOIN norm.pod AS d USING (pod_serial)
        JOIN norm.station AS st USING (station_callsign)
        JOIN norm.operator AS o USING (operator_name)
    ),
    m AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM prev EXCEPT SELECT * FROM rejoined)) AS t),
    s AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM rejoined EXCEPT SELECT * FROM prev)) AS t),
    co AS (SELECT COUNT(*)::BIGINT AS c FROM prev),
    cr AS (SELECT COUNT(*)::BIGINT AS c FROM rejoined)
    SELECT co.c, cr.c, m.c, s.c INTO rows_original, rows_rejoined, missing, spurious
    FROM co, cr, m, s;
    RETURN NEXT;

    -- 3NF -> BCNF: operator_station NATURAL JOIN duty_bcnf must equal duty.
    stage := 'bcnf';
    WITH prev AS (SELECT station_callsign, pass_date, operator_name FROM norm.duty),
    rejoined AS (
        SELECT station_callsign, pass_date, operator_name
        FROM norm.operator_station NATURAL JOIN norm.duty_bcnf
    ),
    m AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM prev EXCEPT SELECT * FROM rejoined)) AS t),
    s AS (SELECT COUNT(*)::BIGINT AS c FROM ((SELECT * FROM rejoined EXCEPT SELECT * FROM prev)) AS t),
    co AS (SELECT COUNT(*)::BIGINT AS c FROM prev),
    cr AS (SELECT COUNT(*)::BIGINT AS c FROM rejoined)
    SELECT co.c, cr.c, m.c, s.c INTO rows_original, rows_rejoined, missing, spurious
    FROM co, cr, m, s;
    RETURN NEXT;
END;
$$;
COMMENT ON FUNCTION norm.lossless_check() IS 'Lossless-join check per decomposition step via NATURAL JOIN + EXCEPT both ways.';

-- Lab readers: every group role may read the schema and run the demos.
GRANT USAGE ON SCHEMA norm TO grp_director, grp_station_operator, grp_analyst, grp_router;
GRANT SELECT ON ALL TABLES IN SCHEMA norm TO grp_director, grp_station_operator, grp_analyst, grp_router;
ALTER DEFAULT PRIVILEGES IN SCHEMA norm GRANT SELECT ON TABLES TO grp_director, grp_station_operator, grp_analyst, grp_router;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA norm TO grp_director, grp_station_operator, grp_analyst, grp_router;
ALTER DEFAULT PRIVILEGES IN SCHEMA norm GRANT EXECUTE ON FUNCTIONS TO grp_director, grp_station_operator, grp_analyst, grp_router;
