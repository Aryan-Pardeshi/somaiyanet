-- [Triggers, integrity beyond CHECK, CO1/CO3]
-- SomaiyaNet triggers: state machine, audit, telemetry ingest, telecommand
-- HMAC verify, contact-kind check, node totality, and decision notify.

-- --------------------------------------------- satellite state machine ---
-- trg_satellite_state enforces the data-driven state machine in
-- sat_state_transition. Bypass with SET LOCAL somaiyanet.bypass_state_machine.
CREATE OR REPLACE FUNCTION check_satellite_state()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_pod_status pod_status;
BEGIN
    IF current_setting('somaiyanet.bypass_state_machine', TRUE) = 'on' THEN
        RETURN NEW;
    END IF;
    SELECT status INTO v_pod_status FROM deployer_pod WHERE pod_id = NEW.pod_id;
    IF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'STOWED' AND COALESCE(v_pod_status, 'INTEGRATED') <> 'CONFIRMED' THEN
            RAISE EXCEPTION 'illegal state transition % -> % for %', 'NONE', NEW.state, NEW.node_id
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state THEN
        IF NOT EXISTS (SELECT 1 FROM sat_state_transition
                       WHERE from_state = OLD.state AND to_state = NEW.state) THEN
            RAISE EXCEPTION 'illegal state transition % -> % for %', OLD.state, NEW.state, NEW.node_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.state = 'STOWED'
           AND COALESCE(v_pod_status, 'INTEGRATED') NOT IN ('RELEASED', 'CONFIRMED') THEN
            RAISE EXCEPTION 'illegal state transition % -> % for %', OLD.state, NEW.state, NEW.node_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_satellite_state ON satellite;
CREATE TRIGGER trg_satellite_state
BEFORE INSERT OR UPDATE OF state ON satellite
FOR EACH ROW EXECUTE FUNCTION check_satellite_state();

-- ---------------------------------------------------------- audit log ---
-- audit_row is the generic audit writer; it strips any key named secret so
-- station_key secrets never land in the log.
CREATE OR REPLACE FUNCTION audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_pk  TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - 'secret';
    ELSIF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW) - 'secret';
    ELSE
        v_old := to_jsonb(OLD) - 'secret';
        v_new := to_jsonb(NEW) - 'secret';
    END IF;
    v_pk := COALESCE(v_new ->> TG_ARGV[0], v_old ->> TG_ARGV[0], NULL);
    INSERT INTO audit_log (table_name, op, row_pk, old_row, new_row)
    VALUES (TG_TABLE_NAME, substring(TG_OP, 1, 1), v_pk, v_old, v_new);
    RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_pod ON deployer_pod;
CREATE TRIGGER trg_audit_pod AFTER INSERT OR UPDATE OR DELETE ON deployer_pod
FOR EACH ROW EXECUTE FUNCTION audit_row('pod_id');
DROP TRIGGER IF EXISTS trg_audit_telecommand ON telecommand;
CREATE TRIGGER trg_audit_telecommand AFTER INSERT OR UPDATE OR DELETE ON telecommand
FOR EACH ROW EXECUTE FUNCTION audit_row('cmd_id');
DROP TRIGGER IF EXISTS trg_audit_decision ON routing_decision;
CREATE TRIGGER trg_audit_decision AFTER INSERT OR UPDATE OR DELETE ON routing_decision
FOR EACH ROW EXECUTE FUNCTION audit_row('decision_id');
DROP TRIGGER IF EXISTS trg_audit_station ON ground_station;
CREATE TRIGGER trg_audit_station AFTER INSERT OR UPDATE OR DELETE ON ground_station
FOR EACH ROW EXECUTE FUNCTION audit_row('node_id');
DROP TRIGGER IF EXISTS trg_audit_station_key ON station_key;
CREATE TRIGGER trg_audit_station_key AFTER INSERT OR UPDATE OR DELETE ON station_key
FOR EACH ROW EXECUTE FUNCTION audit_row('station_id');
DROP TRIGGER IF EXISTS trg_audit_satellite ON satellite;
CREATE TRIGGER trg_audit_satellite
AFTER INSERT OR DELETE OR UPDATE OF state, pod_id, tle_line1, tle_line2 ON satellite
FOR EACH ROW EXECUTE FUNCTION audit_row('node_id');

-- ------------------------------------------------- telemetry ingest ---
-- trg_telemetry_ingest keeps satellite.battery_v/last_seen fresh, raises
-- WARN/CRITICAL alerts with 15-minute dedup, and notifies LISTENers.
CREATE OR REPLACE FUNCTION telemetry_ingest()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_last TIMESTAMPTZ;
    v_sev  VARCHAR(8);
BEGIN
    SELECT last_seen INTO v_last FROM satellite WHERE node_id = NEW.sat_id;
    IF v_last IS NULL OR NEW.ts >= v_last THEN
        UPDATE satellite SET battery_v = NEW.battery_v, last_seen = NEW.ts
        WHERE node_id = NEW.sat_id;
    END IF;
    IF NEW.battery_v < 6.8 THEN
        v_sev := 'CRITICAL';
    ELSIF NEW.battery_v < 7.0 THEN
        v_sev := 'WARN';
    END IF;
    IF v_sev IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM alert
                       WHERE sat_id = NEW.sat_id AND severity = v_sev
                         AND NOT acknowledged
                         AND raised_at >= now() - INTERVAL '15 minutes') THEN
            INSERT INTO alert (sat_id, severity, message)
            VALUES (NEW.sat_id, v_sev,
                    format('%s: battery %s V on %s', v_sev, NEW.battery_v, NEW.sat_id));
        END IF;
    END IF;
    PERFORM pg_notify('telemetry', json_build_object(
        'sat_id', NEW.sat_id, 'ts', NEW.ts, 'battery_v', NEW.battery_v,
        'temp_c', NEW.temp_c, 'rssi_dbm', NEW.rssi_dbm,
        'mode_active', NEW.mode_active)::TEXT);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_telemetry_ingest ON telemetry;
CREATE TRIGGER trg_telemetry_ingest
AFTER INSERT ON telemetry
FOR EACH ROW EXECUTE FUNCTION telemetry_ingest();

-- ------------------------------------- telecommand signing + verify ---
-- sign_telecommand simulates the station HSM: only the director or the
-- station's own operator_role may mint a signature for that station.
CREATE OR REPLACE FUNCTION sign_telecommand(
    p_station VARCHAR,
    p_sat VARCHAR,
    p_opcode VARCHAR,
    p_args JSONB,
    p_nonce BIGINT
)
RETURNS BYTEA
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_secret BYTEA;
    v_role   NAME;
    v_msg    BYTEA;
BEGIN
    SELECT operator_role INTO v_role FROM ground_station WHERE node_id = p_station;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown station %', p_station USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT (pg_has_role(session_user, 'grp_director', 'MEMBER')
            OR pg_has_role(session_user, v_role, 'MEMBER')
            OR session_user = v_role::TEXT
            OR session_user = 'postgres'
            OR pg_has_role(session_user, 'mission_director', 'MEMBER')) THEN
        RAISE EXCEPTION 'not allowed to sign for station %', p_station
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT secret INTO v_secret FROM station_key WHERE station_id = p_station;
    v_msg := convert_to(p_station || '|' || p_sat || '|' || p_opcode || '|' || (p_args::TEXT) || '|' || p_nonce::TEXT, 'UTF8');
    RETURN hmac(v_msg, v_secret, 'sha256');
END;
$$;

-- trg_telecommand_verify recomputes the HMAC before the row lands; a forged
-- signature is rejected and a good one is marked verified.
CREATE OR REPLACE FUNCTION telecommand_verify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_secret BYTEA;
    v_msg    BYTEA;
    v_good   BYTEA;
BEGIN
    SELECT secret INTO v_secret FROM station_key WHERE station_id = NEW.station_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'telecommand rejected: unknown station' USING ERRCODE = 'invalid_authorization_specification';
    END IF;
    v_msg := convert_to(NEW.station_id || '|' || NEW.sat_id || '|' || NEW.opcode || '|' || (NEW.args::TEXT) || '|' || NEW.nonce::TEXT, 'UTF8');
    v_good := hmac(v_msg, v_secret, 'sha256');
    IF v_good IS DISTINCT FROM NEW.hmac THEN
        RAISE EXCEPTION 'telecommand rejected: bad HMAC signature' USING ERRCODE = 'invalid_authorization_specification';
    END IF;
    NEW.verified := TRUE;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_telecommand_verify ON telecommand;
CREATE TRIGGER trg_telecommand_verify
BEFORE INSERT ON telecommand
FOR EACH ROW EXECUTE FUNCTION telecommand_verify();

-- After a verified SAFE_MODE command, move the satellite to SAFE via the
-- state machine (NOMINAL->SAFE or COMMISSIONING->SAFE).
CREATE OR REPLACE FUNCTION telecommand_safe_mode()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.opcode = 'SAFE_MODE' AND NEW.verified THEN
        UPDATE satellite SET state = 'SAFE'
        WHERE node_id = NEW.sat_id AND state IN ('NOMINAL', 'COMMISSIONING');
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_telecommand_safe ON telecommand;
CREATE TRIGGER trg_telecommand_safe
AFTER INSERT ON telecommand
FOR EACH ROW EXECUTE FUNCTION telecommand_safe_mode();

-- ------------------------------------------------------ contact kind ---
-- trg_contact_kind keeps the directed graph honest: ISL is SAT<->SAT and
-- DOWNLINK is always SAT -> GROUND.
CREATE OR REPLACE FUNCTION check_contact_kind()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_from node_kind;
    v_to   node_kind;
BEGIN
    SELECT kind INTO v_from FROM network_node WHERE node_id = NEW.from_node;
    SELECT kind INTO v_to FROM network_node WHERE node_id = NEW.to_node;
    IF NEW.kind = 'ISL' THEN
        IF v_from <> 'SAT' OR v_to <> 'SAT' THEN
            RAISE EXCEPTION 'ISL contact must run SAT -> SAT' USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.kind = 'DOWNLINK' THEN
        IF v_from <> 'SAT' OR v_to <> 'GROUND' THEN
            RAISE EXCEPTION 'DOWNLINK contact must run SAT -> GROUND' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_contact_kind ON contact;
CREATE TRIGGER trg_contact_kind
BEFORE INSERT OR UPDATE ON contact
FOR EACH ROW EXECUTE FUNCTION check_contact_kind();

-- ---------------------------------------------- node totality (EER) ---
-- trg_node_totality is a deferred constraint trigger: at COMMIT every
-- network_node must have exactly one matching subtype row of the right kind.
CREATE OR REPLACE FUNCTION check_node_totality()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_hits INT;
BEGIN
    IF NEW.kind = 'SAT' THEN
        SELECT COUNT(*) INTO v_hits FROM satellite WHERE node_id = NEW.node_id;
    ELSE
        SELECT COUNT(*) INTO v_hits FROM ground_station WHERE node_id = NEW.node_id;
    END IF;
    IF v_hits <> 1 THEN
        RAISE EXCEPTION 'network_node % has no matching subtype row', NEW.node_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_node_totality ON network_node;
CREATE CONSTRAINT TRIGGER trg_node_totality
AFTER INSERT ON network_node
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_node_totality();

-- --------------------------------------------------- decision notify ---
CREATE OR REPLACE FUNCTION decision_notify()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('decision', json_build_object(
        'decision_id', NEW.decision_id, 'sat_id', NEW.sat_id,
        'final_action', NEW.final_action)::TEXT);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_decision_notify ON routing_decision;
CREATE TRIGGER trg_decision_notify
AFTER INSERT ON routing_decision
FOR EACH ROW EXECUTE FUNCTION decision_notify();
