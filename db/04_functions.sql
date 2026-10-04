-- [Exp 5 - link budget functions, CO3]
-- [Exp 6 - recursive CTE + window fns, CO3] (CGR below)
-- [Exp 9 - TCL, CO4] (deploy/execute below)
-- SomaiyaNet link scoring plus Contact Graph Routing and the transaction demos.

-- link_score_downlink maps elevation + range to 0..100. Path loss grows with
-- 20*log10(range/500) and low elevations pay 10*log10(1/sin(elev)); the raw
-- loss is scaled so ~30 dB spans the full 100 points, then clamped.
CREATE OR REPLACE FUNCTION link_score_downlink(p_elev_deg NUMERIC, p_range_km NUMERIC)
RETURNS SMALLINT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_elev NUMERIC := GREATEST(p_elev_deg, 1);
    v_loss DOUBLE PRECISION;
BEGIN
    -- p_range_km is a slant range in km and always positive.
    v_loss := 20 * LOG10((p_range_km / 500.0)::DOUBLE PRECISION)
            + 10 * LOG10(1 / SIN(RADIANS(v_elev::DOUBLE PRECISION)));
    RETURN GREATEST(0, LEAST(100, ROUND((100 - v_loss * 100.0 / 30))::INT))::SMALLINT;
END;
$$;

-- link_score_isl scores an inter-satellite leg by range only: 20*log10 over
-- a 300 km reference, with ~24 dB spanning the full 100 points, clamped.
CREATE OR REPLACE FUNCTION link_score_isl(p_range_km NUMERIC)
RETURNS SMALLINT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_loss DOUBLE PRECISION;
BEGIN
    -- p_range_km is an inter-satellite range in km and always positive.
    v_loss := 20 * LOG10((p_range_km / 300.0)::DOUBLE PRECISION);
    RETURN GREATEST(0, LEAST(100, ROUND((100 - v_loss * 100.0 / 24))::INT))::SMALLINT;
END;
$$;

-- ------------------------------------------------- [Exp 6 - CGR routing] ---
-- cgr_routes is Contact Graph Routing as a recursive CTE: from the origin at
-- p_t0, repeatedly take the earliest usable contact to each neighbour. Only
-- SAT nodes expand (GROUND is terminal); STOWED sats are never relays.
CREATE OR REPLACE FUNCTION cgr_routes(
    p_origin VARCHAR,
    p_t0 TIMESTAMPTZ,
    p_size_bytes INT DEFAULT 4096,
    p_max_hops INT DEFAULT 4,
    p_limit INT DEFAULT 5
)
RETURNS TABLE (
    rank INT,
    destination VARCHAR,
    arrival_ts TIMESTAMPTZ,
    hops INT,
    bottleneck_score INT,
    latency_s INT,
    path_nodes VARCHAR[],
    path_contacts BIGINT[],
    explanation TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE search(node, arrival, hops, bottleneck, path_nodes, path_contacts, explanation) AS (
        SELECT p_origin::VARCHAR(12),
               p_t0,
               0,
               NULL::INT,
               ARRAY[p_origin::VARCHAR],
               ARRAY[]::BIGINT[],
               p_origin::TEXT
        UNION
        SELECT nxt.to_node,
               GREATEST(nxt.start_ts, cur.arrival)
                 + make_interval(secs => (p_size_bytes * 8.0 / nxt.rate_bps)),
               cur.hops + 1,
               CASE WHEN cur.bottleneck IS NULL THEN nxt.link_score::INT
                    ELSE LEAST(cur.bottleneck, nxt.link_score::INT) END,
               cur.path_nodes || nxt.to_node::VARCHAR,
               cur.path_contacts || nxt.contact_id,
               cur.explanation || ' -' || nxt.kind::TEXT || '(' || nxt.link_score::TEXT || ')-> ' || nxt.to_node
        FROM search AS cur
        JOIN LATERAL (
            SELECT DISTINCT ON (c.to_node) c.*
            FROM contact AS c
            WHERE c.from_node = cur.node
              AND c.end_ts > cur.arrival + make_interval(secs => (p_size_bytes * 8.0 / c.rate_bps))
              AND c.start_ts < p_t0 + INTERVAL '30 hours'
              AND (c.kind = 'DOWNLINK'
                   OR EXISTS (SELECT 1 FROM satellite AS s
                              WHERE s.node_id = c.to_node
                                AND s.state IN ('NOMINAL', 'SAFE', 'COMMISSIONING')))
            ORDER BY c.to_node, c.start_ts
        ) AS nxt ON TRUE
        WHERE cur.hops < p_max_hops
          AND EXISTS (SELECT 1 FROM satellite AS s WHERE s.node_id = cur.node)
    ) CYCLE node SET is_cycle USING visited,
    ground AS (
        SELECT s.node AS dest,
               s.arrival,
               s.hops,
               s.bottleneck,
               s.path_nodes,
               s.path_contacts,
               s.explanation || ', arrives ' || to_char(s.arrival AT TIME ZONE 'UTC', 'HH24:MI:SS') || 'Z' AS expl
        FROM search AS s
        JOIN network_node AS nn ON nn.node_id = s.node AND nn.kind = 'GROUND'
        WHERE NOT s.is_cycle
    ),
    best AS (
        SELECT DISTINCT ON (g.dest) g.*
        FROM ground AS g
        ORDER BY g.dest, g.arrival, g.hops, g.bottleneck DESC NULLS LAST
    )
    SELECT ROW_NUMBER() OVER (ORDER BY b.arrival, b.hops, b.bottleneck DESC NULLS LAST)::INT,
           b.dest,
           b.arrival,
           b.hops,
           b.bottleneck,
           (EXTRACT(EPOCH FROM (b.arrival - p_t0)))::INT,
           b.path_nodes,
           b.path_contacts,
           b.expl
    FROM best AS b
    ORDER BY b.arrival, b.hops, b.bottleneck DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- route_packet: persist the rank-1 CGR answer for one packet and link it.
CREATE OR REPLACE FUNCTION route_packet(p_packet_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_origin VARCHAR(12);
    v_size   INT;
    v_rec    RECORD;
    v_route  BIGINT;
    v_hop    INT := 0;
    v_cid    BIGINT;
    v_prev   TIMESTAMPTZ;
    v_c      RECORD;
BEGIN
    SELECT origin_sat, size_bytes INTO v_origin, v_size
    FROM packet WHERE packet_id = p_packet_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_rec FROM cgr_routes(v_origin, now(), v_size, 4, 1) LIMIT 1;
    IF NOT FOUND OR v_rec.destination IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO route (packet_id, origin_sat, requested_at, size_bytes, destination,
                       arrival_ts, hops, bottleneck_score)
    VALUES (p_packet_id, v_origin, now(), v_size, v_rec.destination,
            v_rec.arrival_ts, v_rec.hops, v_rec.bottleneck_score)
    RETURNING route_id INTO v_route;
    v_prev := now();
    FOREACH v_cid IN ARRAY v_rec.path_contacts LOOP
        v_hop := v_hop + 1;
        SELECT * INTO v_c FROM contact WHERE contact_id = v_cid;
        INSERT INTO route_hop (route_id, hop_no, contact_id, depart_ts, arrive_ts)
        VALUES (v_route, v_hop, v_cid,
                GREATEST(v_c.start_ts, v_prev),
                GREATEST(v_c.start_ts, v_prev)
                  + make_interval(secs => (v_size * 8.0 / v_c.rate_bps)));
        v_prev := GREATEST(v_c.start_ts, v_prev)
                  + make_interval(secs => (v_size * 8.0 / v_c.rate_bps));
    END LOOP;
    UPDATE packet SET route_id = v_route WHERE packet_id = p_packet_id;
    RETURN v_route;
END;
$$;

-- plan_route: same as route_packet but without a packet (ad-hoc planning).
CREATE OR REPLACE FUNCTION plan_route(
    p_origin VARCHAR,
    p_t0 TIMESTAMPTZ,
    p_size_bytes INT DEFAULT 4096
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec   RECORD;
    v_route BIGINT;
    v_hop   INT := 0;
    v_cid   BIGINT;
    v_prev  TIMESTAMPTZ;
    v_c     RECORD;
BEGIN
    SELECT * INTO v_rec FROM cgr_routes(p_origin, p_t0, p_size_bytes, 4, 1) LIMIT 1;
    IF NOT FOUND OR v_rec.destination IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO route (origin_sat, requested_at, size_bytes, destination,
                       arrival_ts, hops, bottleneck_score)
    VALUES (p_origin, p_t0, p_size_bytes, v_rec.destination,
            v_rec.arrival_ts, v_rec.hops, v_rec.bottleneck_score)
    RETURNING route_id INTO v_route;
    v_prev := p_t0;
    FOREACH v_cid IN ARRAY v_rec.path_contacts LOOP
        v_hop := v_hop + 1;
        SELECT * INTO v_c FROM contact WHERE contact_id = v_cid;
        INSERT INTO route_hop (route_id, hop_no, contact_id, depart_ts, arrive_ts)
        VALUES (v_route, v_hop, v_cid,
                GREATEST(v_c.start_ts, v_prev),
                GREATEST(v_c.start_ts, v_prev)
                  + make_interval(secs => (p_size_bytes * 8.0 / v_c.rate_bps)));
        v_prev := GREATEST(v_c.start_ts, v_prev)
                  + make_interval(secs => (p_size_bytes * 8.0 / v_c.rate_bps));
    END LOOP;
    RETURN v_route;
END;
$$;

-- ------------------------------------------------- [Exp 9 - TCL deploys] ---
-- record_deploy_signal appends one weak-entity evidence row and returns seq.
CREATE OR REPLACE FUNCTION record_deploy_signal(
    p_pod VARCHAR,
    p_signal deploy_signal,
    p_ok BOOLEAN,
    p_value TEXT DEFAULT NULL
)
RETURNS SMALLINT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seq SMALLINT;
BEGIN
    SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
    FROM deployment_event WHERE pod_id = p_pod;
    INSERT INTO deployment_event (pod_id, seq, signal, ok, value)
    VALUES (p_pod, v_seq, p_signal, p_ok, p_value);
    RETURN v_seq;
END;
$$;

-- confirm_deployment is the TCL COMMIT/ROLLBACK demo. At least 2 distinct ok
-- signals are required; success moves pod RELEASED -> CONFIRMED and sat
-- STOWED -> DEPLOYED -> COMMISSIONING, then COMMITs and logs COMMITTED.
-- A REJECTED attempt logs first, COMMITs, then raises so the log survives.
-- p_simulate_failure raises after the updates with no handler, so the caller
-- sees a full rollback (logged by the caller as ROLLED_BACK elsewhere).
CREATE OR REPLACE PROCEDURE confirm_deployment(
    p_pod VARCHAR,
    p_simulate_failure BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_sat VARCHAR(12);
    v_ok_signals INT;
BEGIN
    SELECT COUNT(DISTINCT signal) INTO v_ok_signals
    FROM deployment_event WHERE pod_id = p_pod AND ok = TRUE;
    IF v_ok_signals < 2 THEN
        INSERT INTO deployment_log (pod_id, action, outcome, detail)
        VALUES (p_pod, 'CONFIRM_DEPLOYMENT', 'REJECTED',
                'fewer than 2 distinct ok signals');
        COMMIT;
        RAISE EXCEPTION 'deployment of % rejected: need 2 distinct ok signals', p_pod
            USING ERRCODE = 'P0001';
    END IF;

    SELECT node_id INTO v_sat FROM satellite WHERE pod_id = p_pod;

    UPDATE deployer_pod
       SET status = 'RELEASED', release_ts = COALESCE(release_ts, now())
     WHERE pod_id = p_pod;
    UPDATE deployer_pod
       SET status = 'CONFIRMED', release_ts = COALESCE(release_ts, now())
     WHERE pod_id = p_pod;

    IF v_sat IS NOT NULL THEN
        UPDATE satellite SET state = 'DEPLOYED' WHERE node_id = v_sat;
        UPDATE satellite SET state = 'COMMISSIONING' WHERE node_id = v_sat;
    END IF;

    IF p_simulate_failure THEN
        RAISE EXCEPTION 'SIMULATED FAILURE: deployment of % aborted after updates', p_pod
            USING ERRCODE = 'P0001';
    END IF;

    COMMIT;
    INSERT INTO deployment_log (pod_id, sat_id, action, outcome, detail)
    VALUES (p_pod, v_sat, 'CONFIRM_DEPLOYMENT', 'COMMITTED', 'deployment confirmed');
END;
$$;

-- reset_deploy_demo restores POD-B4/SAT-B4 so the viva demo can be replayed.
CREATE OR REPLACE PROCEDURE reset_deploy_demo()
LANGUAGE plpgsql
AS $$
BEGIN
    SET LOCAL somaiyanet.bypass_state_machine = 'on';
    UPDATE deployer_pod SET status = 'ARMED', release_ts = NULL WHERE pod_id = 'POD-B4';
    UPDATE satellite SET state = 'STOWED' WHERE node_id = 'SAT-B4';
    DELETE FROM deployment_event WHERE pod_id = 'POD-B4';
END;
$$;

-- dispatch_packets claims queued packets in priority order within a byte
-- budget. FOR UPDATE SKIP LOCKED makes concurrent callers claim disjoint sets.
CREATE OR REPLACE FUNCTION dispatch_packets(
    p_sat VARCHAR,
    p_worker TEXT,
    p_budget_bytes INT
)
RETURNS TABLE (packet_id BIGINT, mode VARCHAR, size_bytes INT, running_bytes BIGINT)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH candidates AS (
        SELECT pk.packet_id AS pid, pk.mode AS pmode, pk.size_bytes AS sz,
               pm.priority AS prio, pk.created_at AS cat
        FROM packet AS pk
        JOIN payload_mode AS pm ON pm.mode = pk.mode
        WHERE pk.origin_sat = p_sat AND pk.status = 'QUEUED'
        ORDER BY pm.priority, pk.created_at, pk.packet_id
        LIMIT 200
        FOR UPDATE OF pk SKIP LOCKED
    ),
    ranked AS (
        SELECT c.pid, c.pmode, c.sz,
               SUM(c.sz) OVER (ORDER BY c.prio, c.cat, c.pid)::BIGINT AS running
        FROM candidates AS c
    ),
    to_claim AS (
        SELECT pid, pmode, sz, running FROM ranked WHERE running <= p_budget_bytes
    ),
    upd AS (
        UPDATE packet AS p
           SET status = 'CLAIMED', claimed_by = p_worker
          FROM to_claim AS t
         WHERE p.packet_id = t.pid
        RETURNING p.packet_id, p.mode, p.size_bytes
    )
    SELECT u.packet_id, u.mode, u.size_bytes, t.running
    FROM upd AS u
    JOIN to_claim AS t ON t.pid = u.packet_id
    ORDER BY t.running;
END;
$$;

-- execute_pass is the SAVEPOINT demo. Stage 1 marks TTC SENT; stage 2 runs in
-- a BEGIN/EXCEPTION block (implicit savepoint) and marks the other modes
-- DELIVERED within the contact byte budget. p_fail_stage2 rolls stage 2 back.
CREATE OR REPLACE FUNCTION execute_pass(
    p_sat VARCHAR,
    p_contact_id BIGINT,
    p_fail_stage2 BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (stage TEXT, status TEXT, packets INT, bytes BIGINT)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_to      VARCHAR(12);
    v_budget  BIGINT;
    v_count   INT;
    v_bytes   BIGINT;
BEGIN
    SELECT c.to_node, (c.duration_s::BIGINT * c.rate_bps / 8)
      INTO v_to, v_budget
    FROM contact AS c WHERE c.contact_id = p_contact_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'contact % not found', p_contact_id USING ERRCODE = 'no_data_found';
    END IF;

    -- Stage 1: TTC housekeeping, before the savepoint.
    WITH upd AS (
        UPDATE packet AS p
           SET status = 'SENT'
         WHERE p.origin_sat = p_sat AND p.mode = 'TTC' AND p.status = 'QUEUED'
        RETURNING p.size_bytes
    )
    SELECT COUNT(*)::INT, COALESCE(SUM(size_bytes), 0)::BIGINT
      INTO v_count, v_bytes FROM upd;
    stage := '1. TTC housekeeping (before SAVEPOINT)';
    status := 'COMMITTED';
    packets := v_count;
    bytes := v_bytes;
    RETURN NEXT;

    -- Stage 2: payload data, inside the savepoint.
    BEGIN
        WITH ranked AS (
            SELECT p.packet_id AS pid, p.size_bytes AS sz,
                   SUM(p.size_bytes) OVER (ORDER BY pm.priority, p.created_at, p.packet_id)::BIGINT AS running
            FROM packet AS p
            JOIN payload_mode AS pm ON pm.mode = p.mode
            WHERE p.origin_sat = p_sat AND p.mode <> 'TTC' AND p.status = 'QUEUED'
        ),
        fitting AS (
            SELECT pid FROM ranked WHERE running <= v_budget
        ),
        upd AS (
            UPDATE packet AS p
               SET status = 'DELIVERED', delivered_to = v_to, delivered_at = now()
              FROM fitting AS f
             WHERE p.packet_id = f.pid
            RETURNING p.size_bytes
        )
        SELECT COUNT(*)::INT, COALESCE(SUM(size_bytes), 0)::BIGINT
          INTO v_count, v_bytes FROM upd;

        IF p_fail_stage2 THEN
            RAISE EXCEPTION 'SIMULATED FAILURE: downlink dropped mid-pass'
                USING ERRCODE = 'P0001';
        END IF;

        stage := '2. SSTV/M17/CODEC2 (after SAVEPOINT)';
        status := 'COMMITTED';
        packets := v_count;
        bytes := v_bytes;
        RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
        stage := '2. SSTV/M17/CODEC2 (after SAVEPOINT)';
        status := 'ROLLED BACK TO SAVEPOINT';
        packets := 0;
        bytes := 0;
        RETURN NEXT;
    END;
END;
$$;
