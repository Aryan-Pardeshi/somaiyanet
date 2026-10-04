-- [Exp 8 - indexing, CO3]
-- Index-lab helpers: the 6 bench indexes are created at runtime (never at
-- setup) so the viva can show before/after plans. All helpers are
-- SECURITY DEFINER (owned by the setup superuser) so the analyst can run
-- EXPLAIN without owning the tables. Also hosts the Exp 9 tx-lab table.

-- lab_account is the dedicated two-session transaction-lab table: two rows
-- of power credits that concurrent sessions fight over (lost update,
-- write-skew, deadlock demos). sat_id is plain TEXT so the table works
-- even on a --sql-only fixture without constellation rows.
CREATE TABLE IF NOT EXISTS lab_account (
    id            INT         NOT NULL PRIMARY KEY,
    sat_id        TEXT        NOT NULL,
    power_credits INT         NOT NULL CHECK (power_credits >= 0)
);
COMMENT ON TABLE lab_account IS 'Tx-lab ledger (Exp 9): two credit rows used by the lost-update / write-skew / deadlock scenarios.';
INSERT INTO lab_account (id, sat_id, power_credits) VALUES
    (1, 'SAT-A1', 100),
    (2, 'SAT-A2', 100)
ON CONFLICT (id) DO UPDATE SET sat_id = EXCLUDED.sat_id, power_credits = 100;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_account TO grp_director;

-- bench_index_catalog lists the 6 candidate indexes with their exact DDL.
-- Names are fixed so bench_apply/drop can map key -> index name.
CREATE OR REPLACE FUNCTION bench_index_catalog()
RETURNS TABLE (key TEXT, kind TEXT, ddl TEXT, purpose TEXT)
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM (VALUES
        ('btree_cube_ts',
         'btree',
         'CREATE INDEX ix_bench_tel_sat_ts ON telemetry (sat_id, ts)',
         'Cube-style point/range scan: one sat over a time window (ORDER BY ts).'),
        ('brin_ts',
         'brin',
         'CREATE INDEX ix_bench_tel_brin ON telemetry USING brin (ts) WITH (pages_per_range=16)',
         'Tiny summary index over append-only time order; best for wide ts ranges.'),
        ('gin_housekeeping',
         'gin',
         'CREATE INDEX ix_bench_tel_gin ON telemetry USING gin (housekeeping jsonb_path_ops)',
         'JSONB containment on housekeeping, e.g. sunlit filter.'),
        ('partial_queued',
         'btree-partial',
         'CREATE INDEX ix_bench_pkt_queued ON packet (origin_sat, created_at) WHERE status = ''QUEUED''',
         'Small hot-set index: only QUEUED packets for dispatch.'),
        ('covering_contact',
         'btree-covering',
         'CREATE INDEX ix_bench_contact_cover ON contact (to_node, start_ts) INCLUDE (link_score, duration_s)',
         'Index-only scan of a station''s upcoming downlinks.'),
        ('hash_callsign',
         'hash',
         'CREATE INDEX ix_bench_node_callsign ON network_node USING hash (callsign)',
         'Equality lookup on callsign (no ordering needed).')
    ) AS v(key, kind, ddl, purpose);
$$;
COMMENT ON FUNCTION bench_index_catalog() IS 'Catalog of the 6 bench indexes (Exp 8); DDL applied at runtime by bench_apply.';

-- _bench_index_name maps a catalog key to its physical index name.
CREATE OR REPLACE FUNCTION _bench_index_name(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    CASE p_key
        WHEN 'btree_cube_ts' THEN RETURN 'ix_bench_tel_sat_ts';
        WHEN 'brin_ts' THEN RETURN 'ix_bench_tel_brin';
        WHEN 'gin_housekeeping' THEN RETURN 'ix_bench_tel_gin';
        WHEN 'partial_queued' THEN RETURN 'ix_bench_pkt_queued';
        WHEN 'covering_contact' THEN RETURN 'ix_bench_contact_cover';
        WHEN 'hash_callsign' THEN RETURN 'ix_bench_node_callsign';
        ELSE RAISE EXCEPTION 'unknown bench index key: %', p_key USING ERRCODE = 'no_data_found';
    END CASE;
END;
$$;

-- _bench_index_table maps a catalog key to its table for ANALYZE.
CREATE OR REPLACE FUNCTION _bench_index_table(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    CASE p_key
        WHEN 'btree_cube_ts' THEN RETURN 'telemetry';
        WHEN 'brin_ts' THEN RETURN 'telemetry';
        WHEN 'gin_housekeeping' THEN RETURN 'telemetry';
        WHEN 'partial_queued' THEN RETURN 'packet';
        WHEN 'covering_contact' THEN RETURN 'contact';
        WHEN 'hash_callsign' THEN RETURN 'network_node';
        ELSE RAISE EXCEPTION 'unknown bench index key: %', p_key USING ERRCODE = 'no_data_found';
    END CASE;
END;
$$;

-- bench_apply creates one bench index, then ANALYZEs its table so the
-- planner sees fresh stats immediately.
CREATE OR REPLACE FUNCTION bench_apply(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ddl TEXT;
    v_tbl TEXT;
BEGIN
    SELECT ddl INTO v_ddl FROM bench_index_catalog() WHERE key = p_key;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown bench index key: %', p_key USING ERRCODE = 'no_data_found';
    END IF;
    v_tbl := _bench_index_table(p_key);
    EXECUTE v_ddl;
    EXECUTE format('ANALYZE %I', v_tbl);
    RETURN _bench_index_name(p_key) || ' created on ' || v_tbl;
END;
$$;
COMMENT ON FUNCTION bench_apply(TEXT) IS 'Create one bench index by key, then ANALYZE its table.';

-- bench_drop drops one bench index, then ANALYZEs its table.
CREATE OR REPLACE FUNCTION bench_drop(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name TEXT := _bench_index_name(p_key);
    v_tbl  TEXT := _bench_index_table(p_key);
BEGIN
    EXECUTE format('DROP INDEX IF EXISTS %I', v_name);
    EXECUTE format('ANALYZE %I', v_tbl);
    RETURN v_name || ' dropped';
END;
$$;
COMMENT ON FUNCTION bench_drop(TEXT) IS 'Drop one bench index by key, then ANALYZE its table.';

-- bench_drop_all drops every bench index, then ANALYZEs the touched tables.
CREATE OR REPLACE FUNCTION bench_drop_all()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT key FROM bench_index_catalog() LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', _bench_index_name(r.key));
    END LOOP;
    ANALYZE telemetry;
    ANALYZE packet;
    ANALYZE contact;
    ANALYZE network_node;
    RETURN 'all bench indexes dropped';
END;
$$;
COMMENT ON FUNCTION bench_drop_all() IS 'Drop all 6 bench indexes and ANALYZE the touched tables.';

-- bench_index_sizes reports each existing bench index plus the base tables.
CREATE OR REPLACE FUNCTION bench_index_sizes()
RETURNS TABLE (name TEXT, tbl TEXT, kind TEXT, size TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT c.relname::TEXT,
           COALESCE(t.tablename::TEXT, '-') AS tbl,
           COALESCE(
               (SELECT c2.key FROM bench_index_catalog() AS c2
                WHERE _bench_index_name(c2.key) = c.relname), 'table') AS kind,
           pg_size_pretty(pg_relation_size(c.oid))::TEXT AS size
    FROM pg_class AS c
    LEFT JOIN pg_indexes AS t
      ON t.indexname = c.relname AND t.schemaname = 'public'
    WHERE c.relname IN ('ix_bench_tel_sat_ts', 'ix_bench_tel_brin',
                        'ix_bench_tel_gin', 'ix_bench_pkt_queued',
                        'ix_bench_contact_cover', 'ix_bench_node_callsign',
                        'telemetry', 'packet', 'contact', 'network_node')
      AND c.relkind IN ('i', 'r', 'p')
    ORDER BY c.relname;
$$;
COMMENT ON FUNCTION bench_index_sizes() IS 'Sizes of bench indexes (when present) plus the four base tables.';

-- bench_bulk_telemetry inserts synthetic history spread over the existing
-- daily partitions. SECURITY DEFINER supplies the superuser right to write
-- across partitions; the grp_director guard keeps students from flooding
-- the table. session_user is checked (current_user would be the owner).
CREATE OR REPLACE FUNCTION bench_bulk_telemetry(p_rows INT DEFAULT 500000)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sats TEXT[];
    v_n    INT;
BEGIN
    -- Director (or the setup superuser) only.
    IF NOT (pg_has_role(session_user, 'grp_director', 'MEMBER')
            OR session_user = 'postgres'
            OR session_user LIKE 'pg_%') THEN
        RAISE EXCEPTION 'bench_bulk_telemetry is restricted to mission_director'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_rows IS NULL OR p_rows < 1 OR p_rows > 2000000 THEN
        RAISE EXCEPTION 'p_rows must be 1..2000000 (%)', p_rows USING ERRCODE = 'check_violation';
    END IF;
    -- Make sure the last-8-days partitions exist for the synthetic span.
    PERFORM ensure_telemetry_partitions(CURRENT_DATE - 8, CURRENT_DATE + 2);
    SELECT array_agg(s.node_id ORDER BY s.node_id) INTO v_sats
    FROM satellite AS s WHERE s.state <> 'STOWED';
    IF v_sats IS NULL OR array_length(v_sats, 1) IS NULL THEN
        SELECT array_agg(n.node_id ORDER BY n.node_id) INTO v_sats
        FROM network_node AS n WHERE n.kind = 'SAT';
    END IF;
    IF v_sats IS NULL THEN
        RAISE EXCEPTION 'no satellites available for bulk telemetry' USING ERRCODE = 'no_data_found';
    END IF;
    v_n := array_length(v_sats, 1);
    -- Spread rows over 7 days with 0.05 s spacing plus a per-row microsecond
    -- term so (sat_id, ts) stays unique; ON CONFLICT keeps reruns safe.
    EXECUTE format(
        'INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma, rssi_dbm, mode_active, housekeeping) '
        || 'SELECT now() - make_interval(secs => (g %% 604800) + (g %% 1000) * 0.00002), '
        || '       ((%s)::TEXT[])[(g %% %s) + 1], '
        || '       (6.5 + ((g::BIGINT * 7919) %% 150) / 100.0)::NUMERIC(4,2), '
        || '       (15 + ((g::BIGINT * 104729) %% 200) / 10.0)::NUMERIC(5,2), '
        || '       (100 + ((g::BIGINT * 1299709) %% 400))::INT, '
        || '       (-120 + ((g::BIGINT * 31) %% 400) / 10.0)::NUMERIC(5,1), '
        || '       (ARRAY[''TTC'',''SSTV'',''M17'',''CODEC2''])[(g %% 4) + 1], '
        || '       jsonb_build_object(''sunlit'', (g %% 2 = 0), ''cpu_temp_c'', 30 + (g %% 20), '
        || '                        ''free_heap_kb'', 1000 + (g %% 5000), ''uptime_s'', g, '
        || '                        ''reset_count'', 0, ''eclipse_in_s'', (g %% 3000), '
        || '                        ''adcs_mode'', ''NOMINAL'') '
        || 'FROM generate_series(1, %s) AS g '
        || 'ON CONFLICT (sat_id, ts) DO NOTHING',
        quote_literal(v_sats), v_n, p_rows);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ANALYZE telemetry;
    RETURN v_n;
END;
$$;
COMMENT ON FUNCTION bench_bulk_telemetry(INT) IS 'Bulk-load synthetic telemetry (director only) spread over existing partitions.';

-- bench_queries returns one query per bench index plus a partition-pruning
-- probe whose plan should touch only 1-2 partitions.
CREATE OR REPLACE FUNCTION bench_queries()
RETURNS TABLE (key TEXT, title TEXT, sql TEXT, best_index TEXT)
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM (VALUES
        ('q_btree_range',
         'Time range for one sat (btree)',
         'SELECT sat_id, ts, battery_v FROM telemetry WHERE sat_id = ''SAT-A1'' AND ts >= now() - INTERVAL ''7 days'' ORDER BY ts LIMIT 1000',
         'btree_cube_ts'),
        ('q_brin_range',
         'Wide ts range count (BRIN)',
         'SELECT count(*) FROM telemetry WHERE ts >= now() - INTERVAL ''7 days''',
         'brin_ts'),
        ('q_gin_housekeeping',
         'Sunlit filter (GIN jsonb)',
         'SELECT sat_id, ts FROM telemetry WHERE housekeeping @> ''{"sunlit": true}'' AND ts >= now() - INTERVAL ''24 hours'' LIMIT 1000',
         'gin_housekeeping'),
        ('q_partial_queued',
         'Dispatch hot set (partial)',
         'SELECT packet_id, origin_sat, created_at FROM packet WHERE status = ''QUEUED'' AND origin_sat = ''SAT-A1'' ORDER BY created_at LIMIT 200',
         'partial_queued'),
        ('q_covering_contact',
         'Station downlinks index-only (covering)',
         'SELECT to_node, start_ts, link_score, duration_s FROM contact WHERE to_node = ''GS-BOM'' AND start_ts >= now() - INTERVAL ''6 hours'' ORDER BY start_ts LIMIT 100',
         'covering_contact'),
        ('q_hash_callsign',
         'Callsign equality (hash)',
         'SELECT node_id, display_name FROM network_node WHERE callsign = ''VU2SA1''',
         'hash_callsign'),
        ('q_partition_pruning',
         'Partition pruning probe (last 6 h)',
         'SELECT count(*) FROM telemetry WHERE ts >= now() - INTERVAL ''6 hours''',
         'brin_ts')
    ) AS v(key, title, sql, best_index);
$$;
COMMENT ON FUNCTION bench_queries() IS 'One demo query per bench index plus the partition-pruning probe.';

-- Grants for the lab roles (this file runs after 07_security.sql).
GRANT EXECUTE ON FUNCTION bench_index_catalog() TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_apply(TEXT) TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_drop(TEXT) TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_drop_all() TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_index_sizes() TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_bulk_telemetry(INT) TO grp_director, grp_analyst;
GRANT EXECUTE ON FUNCTION bench_queries() TO grp_director, grp_analyst;
GRANT SELECT ON lab_account TO grp_analyst;
