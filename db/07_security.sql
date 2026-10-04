-- [Exp 7 - DCL: roles, GRANT/REVOKE, column privileges, RLS; CO2/CO3]
-- SomaiyaNet ground-segment security. Five login roles inherit from four
-- NOLOGIN groups; every denial in the viva comes from GRANTs or RLS here,
-- never from the app. SECURITY DEFINER functions (04/05/06) are owned by the
-- superuser that runs setup, so they bypass RLS by design.

-- ------------------------------------------------- drop safely (cluster) ---
-- Roles are cluster-global, so drop/recreate must tolerate previous runs and
-- sibling databases owned by parallel workers. Each drop is attempted in its
-- own sub-block: when a role still owns or is referenced by objects in
-- another database the drop is skipped and the existing role is reused below.
DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['mission_director','station_operator_bom','station_operator_hel',
                             'student_analyst','ai_router',
                             'grp_director','grp_station_operator','grp_analyst','grp_router']
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                EXECUTE format('DROP OWNED BY %I', r);
                EXECUTE format('DROP ROLE %I', r);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- e.g. dependent objects in a sibling database; reuse the role.
            RAISE NOTICE 'keeping existing role % (%)', r, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- ------------------------------------------------------- deny by default ---
REVOKE ALL ON DATABASE __DB__ FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL PROCEDURES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------- logins ---
-- CREATE when missing, otherwise just reset the password (reused cluster role).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grp_director') THEN
        CREATE ROLE grp_director NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grp_station_operator') THEN
        CREATE ROLE grp_station_operator NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grp_analyst') THEN
        CREATE ROLE grp_analyst NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grp_router') THEN
        CREATE ROLE grp_router NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mission_director') THEN
        CREATE ROLE mission_director LOGIN PASSWORD __MISSION_DIRECTOR_PASSWORD__ IN ROLE grp_director;
    ELSE
        ALTER ROLE mission_director WITH LOGIN PASSWORD __MISSION_DIRECTOR_PASSWORD__;
        GRANT grp_director TO mission_director;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'station_operator_bom') THEN
        CREATE ROLE station_operator_bom LOGIN PASSWORD __STATION_BOM_PASSWORD__ IN ROLE grp_station_operator;
    ELSE
        ALTER ROLE station_operator_bom WITH LOGIN PASSWORD __STATION_BOM_PASSWORD__;
        GRANT grp_station_operator TO station_operator_bom;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'station_operator_hel') THEN
        CREATE ROLE station_operator_hel LOGIN PASSWORD __STATION_HEL_PASSWORD__ IN ROLE grp_station_operator;
    ELSE
        ALTER ROLE station_operator_hel WITH LOGIN PASSWORD __STATION_HEL_PASSWORD__;
        GRANT grp_station_operator TO station_operator_hel;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'student_analyst') THEN
        CREATE ROLE student_analyst LOGIN PASSWORD __STUDENT_ANALYST_PASSWORD__ IN ROLE grp_analyst;
    ELSE
        ALTER ROLE student_analyst WITH LOGIN PASSWORD __STUDENT_ANALYST_PASSWORD__;
        GRANT grp_analyst TO student_analyst;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_router') THEN
        CREATE ROLE ai_router LOGIN PASSWORD __AI_ROUTER_PASSWORD__ IN ROLE grp_router;
    ELSE
        ALTER ROLE ai_router WITH LOGIN PASSWORD __AI_ROUTER_PASSWORD__;
        GRANT grp_router TO ai_router;
    END IF;
END;
$$;

GRANT CONNECT ON DATABASE __DB__ TO grp_director, grp_station_operator, grp_analyst, grp_router;
GRANT USAGE ON SCHEMA public TO grp_director, grp_station_operator, grp_analyst, grp_router;

-- ----------------------------------------------- mission_director (all) ---
-- The director owns the demo: full DML + EXECUTE, and a GRANT-chain demo via
-- WITH GRANT OPTION on SELECT telemetry.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO grp_director;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO grp_director;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO grp_director;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO grp_director;
GRANT SELECT ON telemetry TO mission_director WITH GRANT OPTION;

-- --------------------------------------- station operators (GS-BOM/HEL) ---
-- Read the mission tables and views, INSERT own-station telecommands (RLS
-- enforces "own"), acknowledge alerts, and see station_key minus secret.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grp_station_operator;
-- Pull secret back: operators get everything except the HMAC secret column.
REVOKE SELECT ON station_key FROM grp_station_operator;
GRANT SELECT (station_id, key_id, rotated_at) ON station_key TO grp_station_operator;
GRANT INSERT ON telecommand TO grp_station_operator;
GRANT UPDATE (acknowledged) ON alert TO grp_station_operator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO grp_station_operator;

-- ------------------------------------------- student_analyst (read-only) ---
GRANT SELECT ON telemetry TO grp_analyst;
GRANT SELECT ON packet, ttc_frame, sstv_image, voice_frame TO grp_analyst;
GRANT SELECT ON contact, route, route_hop TO grp_analyst;
GRANT SELECT ON ai_model, dt_node, ai_model_metric, routing_decision TO grp_analyst;
GRANT SELECT ON network_node, satellite, ground_station, deployer_pod,
    deployment_event, payload_mode, sat_state_transition, alert,
    satellite_tle TO grp_analyst;
GRANT SELECT ON v_constellation_status, v_station_workload, v_low_power,
    v_queue_by_mode, v_heard_by_bom_not_hel, v_heard_by_both, v_mode_mix,
    v_weak_isl, v_callsign_search, v_ai_overrides, v_route_detail TO grp_analyst;
GRANT SELECT ON mv_kpis TO grp_analyst;

-- ------------------------------------------------- ai_router (spacecraft) ---
-- Write-only sensor for telemetry plus queue/dispatch rights. It cannot
-- SELECT telemetry (proven in the viva), only INSERT it.
GRANT INSERT ON telemetry TO grp_router;
GRANT INSERT ON packet, ttc_frame, sstv_image, voice_frame TO grp_router;
GRANT SELECT ON payload_mode TO grp_router;
GRANT SELECT ON contact TO grp_router;
GRANT SELECT (node_id, state) ON satellite TO grp_router;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO grp_router;

-- ---------------------------------------------------------------- EXECUTE ---
-- Concrete EXECUTE grants for routines that exist now.
GRANT EXECUTE ON FUNCTION link_score_downlink(NUMERIC, NUMERIC) TO grp_analyst, grp_station_operator;
GRANT EXECUTE ON FUNCTION link_score_isl(NUMERIC) TO grp_analyst, grp_station_operator;
GRANT EXECUTE ON FUNCTION cgr_routes(VARCHAR, TIMESTAMPTZ, INT, INT, INT) TO grp_director, grp_station_operator, grp_analyst;
GRANT EXECUTE ON FUNCTION plan_route(VARCHAR, TIMESTAMPTZ, INT) TO grp_director, grp_station_operator;
GRANT EXECUTE ON FUNCTION sign_telecommand(VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT) TO grp_director, grp_station_operator;
GRANT EXECUTE ON FUNCTION dispatch_packets(VARCHAR, TEXT, INT) TO grp_director, grp_router;
GRANT EXECUTE ON FUNCTION route_packet(BIGINT) TO grp_director, grp_router;
GRANT EXECUTE ON FUNCTION execute_pass(VARCHAR, BIGINT, BOOLEAN) TO grp_director, grp_station_operator;
GRANT EXECUTE ON FUNCTION record_deploy_signal(VARCHAR, deploy_signal, BOOLEAN, TEXT) TO grp_director, grp_station_operator;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO grp_director;

-- AI-router functions live in 05_ai.sql, which a later task writes. Grant
-- them only when they exist so this file runs before and after 05 exists.
DO $$
BEGIN
    IF to_regprocedure('rule_action(JSONB)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION rule_action(JSONB) TO grp_analyst';
    END IF;
    IF to_regprocedure('rule_reason(JSONB)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION rule_reason(JSONB) TO grp_analyst';
    END IF;
    IF to_regprocedure('ai_decide(JSONB, INT)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION ai_decide(JSONB, INT) TO grp_analyst';
    END IF;
    IF to_regprocedure('features_for_satellite(VARCHAR, TIMESTAMPTZ)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION features_for_satellite(VARCHAR, TIMESTAMPTZ) TO grp_analyst';
    END IF;
    IF to_regprocedure('preview_decision(VARCHAR)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION preview_decision(VARCHAR) TO grp_director, grp_station_operator, grp_analyst';
    END IF;
    IF to_regprocedure('watchdog_violation(JSONB, router_action)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION watchdog_violation(JSONB, router_action) TO grp_analyst';
    END IF;
    IF to_regprocedure('decide_for_satellite(VARCHAR, TIMESTAMPTZ)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION decide_for_satellite(VARCHAR, TIMESTAMPTZ) TO grp_director, grp_station_operator, grp_router';
    END IF;
END;
$$;

-- --------------------------------------------------------------------- RLS ---
ALTER TABLE telecommand ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecommand FORCE ROW LEVEL SECURITY;
ALTER TABLE station_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_key FORCE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_telecommand ON telecommand;
CREATE POLICY p_telecommand ON telecommand FOR ALL
USING (
    pg_has_role(current_user, 'grp_director', 'MEMBER')
    OR EXISTS (SELECT 1 FROM ground_station AS g
               WHERE g.node_id = telecommand.station_id
                 AND g.operator_role::TEXT = current_user)
)
WITH CHECK (
    pg_has_role(current_user, 'grp_director', 'MEMBER')
    OR EXISTS (SELECT 1 FROM ground_station AS g
               WHERE g.node_id = telecommand.station_id
                 AND g.operator_role::TEXT = current_user)
);

DROP POLICY IF EXISTS p_station_key ON station_key;
CREATE POLICY p_station_key ON station_key FOR ALL
USING (
    pg_has_role(current_user, 'grp_director', 'MEMBER')
    OR EXISTS (SELECT 1 FROM ground_station AS g
               WHERE g.node_id = station_key.station_id
                 AND g.operator_role::TEXT = current_user)
)
WITH CHECK (
    pg_has_role(current_user, 'grp_director', 'MEMBER')
    OR EXISTS (SELECT 1 FROM ground_station AS g
               WHERE g.node_id = station_key.station_id
                 AND g.operator_role::TEXT = current_user)
);

DROP POLICY IF EXISTS p_contact ON contact;
CREATE POLICY p_contact ON contact FOR SELECT
USING (
    kind = 'ISL'
    OR pg_has_role(current_user, 'grp_director', 'MEMBER')
    OR pg_has_role(current_user, 'grp_analyst', 'MEMBER')
    OR pg_has_role(current_user, 'grp_router', 'MEMBER')
    OR EXISTS (SELECT 1 FROM ground_station AS g
               WHERE g.node_id = contact.to_node
                 AND g.operator_role::TEXT = current_user)
);

-- ---------------------------------------------------------- verification ---
-- Read aloud at viva: the five login roles and their table grants.
SELECT grantee, table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee IN ('mission_director','station_operator_bom','station_operator_hel',
                  'student_analyst','ai_router')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;
