-- [Exp 1-3: EER -> relational mapping + DDL, CO1/CO2]
-- SomaiyaNet full schema: EER supertypes/subtypes, weak entities, partitioned
-- telemetry, contact graph with exclusion constraint, in-DB AI router tables,
-- and ground-segment security objects. Uppercase keywords, snake_case names.

-- Extensions: pgcrypto for key generation, btree_gist so the contact
-- EXCLUDE constraint can use scalar = on (from_node, to_node).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------- domains ---
-- voltage bounds the 1S..3S Li-ion bus (max ~12 V); score_0_100 keeps link
-- quality on a uniform 0..100 scale; callsign enforces amateur-radio format.
CREATE DOMAIN voltage AS NUMERIC(4,2)
    CHECK (VALUE BETWEEN 0 AND 12);
CREATE DOMAIN score_0_100 AS SMALLINT
    CHECK (VALUE BETWEEN 0 AND 100);
CREATE DOMAIN callsign AS VARCHAR(12)
    CHECK (VALUE ~ '^[A-Z0-9]{3,8}(-[0-9]{1,2})?$');

-- ------------------------------------------------------------------ enums ---
CREATE TYPE node_kind AS ENUM ('SAT', 'GROUND');
CREATE TYPE sat_state AS ENUM ('STOWED', 'DEPLOYED', 'COMMISSIONING', 'NOMINAL', 'SAFE', 'DECOMMISSIONED');
CREATE TYPE pod_status AS ENUM ('INTEGRATED', 'ARMED', 'RELEASED', 'CONFIRMED', 'FAILED');
CREATE TYPE deploy_signal AS ENUM ('SEPARATION_SWITCH', 'RELEASE_TIMER', 'RF_BEACON');
CREATE TYPE contact_kind AS ENUM ('ISL', 'DOWNLINK');
CREATE TYPE packet_status AS ENUM ('QUEUED', 'CLAIMED', 'SENT', 'DELIVERED', 'DROPPED');
CREATE TYPE router_action AS ENUM ('SAFE_TTC_ONLY', 'TTC_VOICE', 'FULL_DOWNLINK', 'RELAY_VIA_ISL', 'HOLD');

-- ------------------------------------------------- EER supertype: node ---
-- network_node is the supertype of the disjoint/total generalization
-- network_node -> satellite | ground_station. Subtypes FK to (node_id, kind)
-- with a fixed-kind CHECK (disjoint); a deferred trigger (06) enforces total.
CREATE TABLE network_node (
    node_id      VARCHAR(12) NOT NULL PRIMARY KEY,
    kind         node_kind   NOT NULL,
    display_name VARCHAR(60) NOT NULL UNIQUE,
    callsign     callsign    UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (node_id, kind)
);
COMMENT ON TABLE network_node IS 'EER supertype of the node generalization; every satellite and ground station is exactly one network_node.';

-- ------------------------------------------------- subtype: station ---
-- ground_station carries the operator_role login used later by RLS, plus a
-- partial unique index so only one primary station exists.
CREATE TABLE ground_station (
    node_id            VARCHAR(12) NOT NULL PRIMARY KEY,
    kind               node_kind   NOT NULL DEFAULT 'GROUND' CHECK (kind = 'GROUND'),
    city               VARCHAR(60) NOT NULL,
    country            CHAR(2)     NOT NULL,
    latitude           NUMERIC(8,5) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude          NUMERIC(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    altitude_m         INT         NOT NULL DEFAULT 0,
    min_elevation_deg  NUMERIC(4,1) NOT NULL DEFAULT 10 CHECK (min_elevation_deg BETWEEN 0 AND 45),
    is_primary         BOOLEAN     NOT NULL DEFAULT FALSE,
    operator_role      NAME        NOT NULL,
    FOREIGN KEY (node_id, kind) REFERENCES network_node (node_id, kind) ON DELETE CASCADE
);
COMMENT ON TABLE ground_station IS 'EER subtype of network_node (kind fixed to GROUND); operator_role ties each station to its DB login for RLS.';
CREATE UNIQUE INDEX one_primary_station ON ground_station (is_primary) WHERE is_primary;

-- ------------------------------------------------------------ pod ---
-- deployer_pod owns the release story; status RELEASED/CONFIRMED exactly
-- matches release_ts being set, so a half-released pod cannot exist.
CREATE TABLE deployer_pod (
    pod_id             VARCHAR(10) NOT NULL PRIMARY KEY,
    serial_no          VARCHAR(20) NOT NULL UNIQUE,
    release_mechanism  VARCHAR(20) NOT NULL CHECK (release_mechanism IN ('BURN_WIRE', 'SPRING_PUSHER', 'NON_PYRO_ACTUATOR')),
    status             pod_status  NOT NULL DEFAULT 'INTEGRATED',
    launch_date        DATE,
    release_ts         TIMESTAMPTZ,
    temperature_c      NUMERIC(5,2),
    CHECK ((status IN ('RELEASED', 'CONFIRMED')) = (release_ts IS NOT NULL))
);

-- ------------------------------------------------------- subtype: sat ---
-- satellite FKs (node_id, kind) with kind fixed to SAT (disjoint half).
-- period_min is derived so the orbit period can never drift from mean_motion.
CREATE TABLE satellite (
    node_id         VARCHAR(12) NOT NULL PRIMARY KEY,
    kind            node_kind   NOT NULL DEFAULT 'SAT' CHECK (kind = 'SAT'),
    norad_id        INT         NOT NULL UNIQUE,
    plane           CHAR(1)     NOT NULL CHECK (plane IN ('A', 'B')),
    slot            SMALLINT    NOT NULL CHECK (slot BETWEEN 1 AND 8),
    pod_id          VARCHAR(10) NOT NULL UNIQUE REFERENCES deployer_pod ON DELETE RESTRICT,
    state           sat_state   NOT NULL DEFAULT 'STOWED',
    tle_line1       CHAR(69)    NOT NULL CHECK (tle_line1 LIKE '1 %'),
    tle_line2       CHAR(69)    NOT NULL CHECK (tle_line2 LIKE '2 %'),
    epoch_utc       TIMESTAMPTZ NOT NULL,
    inclination_deg NUMERIC(7,4) NOT NULL,
    mean_motion     NUMERIC(11,8) NOT NULL CHECK (mean_motion > 0),
    period_min      NUMERIC GENERATED ALWAYS AS (round(1440.0 / mean_motion, 3)) STORED,
    mass_g          NUMERIC(6,1) CHECK (mass_g <= 750),
    battery_v       voltage,
    last_seen       TIMESTAMPTZ,
    UNIQUE (plane, slot),
    FOREIGN KEY (node_id, kind) REFERENCES network_node (node_id, kind) ON DELETE CASCADE
);
COMMENT ON TABLE satellite IS 'EER subtype of network_node (kind fixed to SAT); 1:1 with deployer_pod; battery_v/last_seen maintained by the telemetry trigger.';

-- --------------------------------------- state machine lookup ---
-- sat_state_transition makes the state machine data: the trigger only allows
-- pairs listed here, so new missions evolve without code changes.
CREATE TABLE sat_state_transition (
    from_state sat_state NOT NULL,
    to_state   sat_state NOT NULL,
    PRIMARY KEY (from_state, to_state)
);

-- --------------------------------------- weak entity: deploy event ---
-- deployment_event is weak on deployer_pod: seq numbers one pod's signals
-- and rows die with their pod.
CREATE TABLE deployment_event (
    pod_id      VARCHAR(10)  NOT NULL REFERENCES deployer_pod ON DELETE CASCADE,
    seq         SMALLINT     NOT NULL,
    signal      deploy_signal NOT NULL,
    ok          BOOLEAN      NOT NULL,
    value       TEXT,
    observed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (pod_id, seq)
);
COMMENT ON TABLE deployment_event IS 'Weak entity of deployer_pod; the ordered evidence trail (one row per deploy signal) behind confirm_deployment.';

-- --------------------------------------- audit: deploy log ---
-- deployment_log deliberately has NO foreign keys: the record of a failed
-- deploy attempt must survive the rollback of its own transaction.
CREATE TABLE deployment_log (
    log_id    BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pod_id    VARCHAR(10),
    sat_id    VARCHAR(12),
    action    TEXT        NOT NULL,
    outcome   TEXT        NOT NULL CHECK (outcome IN ('COMMITTED', 'ROLLED_BACK', 'REJECTED')),
    detail    TEXT,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ------------------------------------------------- lookup: modes ---
-- payload_mode fixes the PDF downlink order TTC > SSTV > M17 > CODEC2 as
-- priority 1..4, so dispatch order is data, not application logic.
CREATE TABLE payload_mode (
    mode        VARCHAR(8) NOT NULL PRIMARY KEY CHECK (mode IN ('TTC', 'SSTV', 'M17', 'CODEC2')),
    priority    SMALLINT   NOT NULL UNIQUE,
    bitrate_bps INT        NOT NULL CHECK (bitrate_bps > 0),
    tx_power_mw INT        NOT NULL CHECK (tx_power_mw > 0),
    description TEXT       NOT NULL
);

-- ------------------------------------------- EER supertype: packet ---
-- packet is the supertype of the mode-disjoint generalization
-- packet -> ttc_frame | sstv_image | voice_frame. Subtypes FK to
-- (packet_id, mode) with a fixed-mode CHECK, giving disjointness by mode.
CREATE TABLE packet (
    packet_id    BIGINT         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origin_sat   VARCHAR(12)    NOT NULL REFERENCES satellite,
    mode         VARCHAR(8)     NOT NULL REFERENCES payload_mode,
    size_bytes   INT            NOT NULL CHECK (size_bytes BETWEEN 16 AND 2000000),
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    status       packet_status  NOT NULL DEFAULT 'QUEUED',
    claimed_by   TEXT,
    delivered_to VARCHAR(12)    REFERENCES ground_station,
    delivered_at TIMESTAMPTZ,
    route_id     BIGINT,
    UNIQUE (packet_id, mode),
    CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL))
);
COMMENT ON TABLE packet IS 'EER supertype of the packet generalization; subtypes split by mode so TTC/SSTV/voice payloads keep their own columns.';

-- ------------------------------------------------- subtype: TTC ---
CREATE TABLE ttc_frame (
    packet_id BIGINT      NOT NULL PRIMARY KEY,
    mode      VARCHAR(8)  NOT NULL DEFAULT 'TTC' CHECK (mode = 'TTC'),
    battery_v voltage     NOT NULL,
    temp_c    NUMERIC(5,2) NOT NULL,
    solar_ma  INT         NOT NULL CHECK (solar_ma >= 0),
    flags     JSONB       NOT NULL DEFAULT '{}',
    FOREIGN KEY (packet_id, mode) REFERENCES packet (packet_id, mode) ON DELETE CASCADE
);
COMMENT ON TABLE ttc_frame IS 'EER subtype of packet for housekeeping frames; fixed mode TTC keeps the generalization disjoint.';

-- ------------------------------------------------- subtype: SSTV ---
CREATE TABLE sstv_image (
    packet_id BIGINT      NOT NULL PRIMARY KEY,
    mode      VARCHAR(8)  NOT NULL DEFAULT 'SSTV' CHECK (mode = 'SSTV'),
    sstv_mode VARCHAR(12) NOT NULL CHECK (sstv_mode IN ('Robot36', 'Martin1', 'Scottie1', 'PD120')),
    width     SMALLINT    NOT NULL,
    height    SMALLINT    NOT NULL,
    caption   TEXT,
    image     BYTEA,
    FOREIGN KEY (packet_id, mode) REFERENCES packet (packet_id, mode) ON DELETE CASCADE
);
COMMENT ON TABLE sstv_image IS 'EER subtype of packet for slow-scan TV images; fixed mode SSTV keeps the generalization disjoint.';

-- ------------------------------------------------- subtype: voice ---
CREATE TABLE voice_frame (
    packet_id    BIGINT      NOT NULL PRIMARY KEY,
    mode         VARCHAR(8)  NOT NULL CHECK (mode IN ('M17', 'CODEC2')),
    duration_ms  INT         NOT NULL CHECK (duration_ms > 0),
    src_callsign callsign    NOT NULL,
    dst_callsign callsign,
    FOREIGN KEY (packet_id, mode) REFERENCES packet (packet_id, mode) ON DELETE CASCADE
);
COMMENT ON TABLE voice_frame IS 'EER subtype of packet for M17/Codec2 voice; the mode CHECK admits exactly the two voice modes.';

-- ----------------------------------- telemetry (range partitioned) ---
-- telemetry is partitioned by day so 7-day history (~70k rows) drops in bulk
-- and time-range scans prune partitions; PK must include the partition key.
CREATE TABLE telemetry (
    ts           TIMESTAMPTZ  NOT NULL,
    sat_id       VARCHAR(12)  NOT NULL REFERENCES satellite,
    battery_v    voltage      NOT NULL,
    temp_c       NUMERIC(5,2) NOT NULL,
    solar_ma     INT          NOT NULL CHECK (solar_ma >= 0),
    rssi_dbm     NUMERIC(5,1),
    mode_active  VARCHAR(8)   REFERENCES payload_mode,
    housekeeping JSONB        NOT NULL DEFAULT '{}',
    PRIMARY KEY (sat_id, ts)
) PARTITION BY RANGE (ts);

-- ensure_telemetry_partitions pre-creates one daily partition per day in the
-- range and returns how many it made; reruns are no-ops for existing days.
CREATE FUNCTION ensure_telemetry_partitions(p_from DATE, p_to DATE)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    d        DATE;
    made     INT := 0;
    part     TEXT;
BEGIN
    d := p_from;
    WHILE d <= p_to LOOP
        part := 'telemetry_' || to_char(d, 'YYYYMMDD');
        IF to_regclass('public.' || part) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF telemetry FOR VALUES FROM (%L) TO (%L)',
                part, d::TIMESTAMPTZ, (d + 1)::TIMESTAMPTZ);
            made := made + 1;
        END IF;
        d := d + 1;
    END LOOP;
    RETURN made;
END;
$$;

-- Catch-all for out-of-range timestamps so a stray insert never fails.
CREATE TABLE telemetry_default PARTITION OF telemetry DEFAULT;

SELECT ensure_telemetry_partitions(CURRENT_DATE - 8, CURRENT_DATE + 2);

-- ------------------------------------------- contact graph ---
-- contact is directed (ISL stored both ways, DOWNLINK sat->ground).
-- duration_s/span are derived so windows stay consistent; the EXCLUDE stops
-- double-booking the same directed pair in overlapping windows.
CREATE TABLE contact (
    contact_id         BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind               contact_kind    NOT NULL,
    from_node          VARCHAR(12)     NOT NULL REFERENCES network_node,
    to_node            VARCHAR(12)     NOT NULL REFERENCES network_node,
    start_ts           TIMESTAMPTZ     NOT NULL,
    end_ts             TIMESTAMPTZ     NOT NULL,
    duration_s         INT GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_ts - start_ts))::INT) STORED,
    span               TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_ts, end_ts)) STORED,
    rate_bps           INT             NOT NULL CHECK (rate_bps > 0),
    link_score         score_0_100     NOT NULL,
    min_range_km       NUMERIC(8,1)    NOT NULL,
    max_elevation_deg  NUMERIC(5,2),
    CHECK (end_ts > start_ts),
    CHECK (from_node <> to_node),
    EXCLUDE USING gist (from_node WITH =, to_node WITH =, span WITH &&)
);
-- Core routing indexes; kept out of the bench lab on purpose.
CREATE INDEX ix_contact_from_start ON contact (from_node, start_ts);
CREATE INDEX ix_contact_to_start ON contact (to_node, start_ts);

-- ------------------------------------------------- route ---
-- route stores one CGR answer: arrival/hops/bottleneck plus a generated
-- latency, so routing history is queryable without recomputation.
CREATE TABLE route (
    route_id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    packet_id        BIGINT       REFERENCES packet ON DELETE SET NULL,
    origin_sat       VARCHAR(12)  NOT NULL REFERENCES satellite,
    requested_at     TIMESTAMPTZ  NOT NULL,
    size_bytes       INT          NOT NULL,
    destination      VARCHAR(12)  REFERENCES ground_station,
    arrival_ts       TIMESTAMPTZ,
    hops             SMALLINT,
    bottleneck_score SMALLINT,
    latency_s        INT GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (arrival_ts - requested_at))::INT) STORED,
    computed_by      NAME         NOT NULL DEFAULT current_user,
    computed_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------- weak entity: route hop ---
-- route_hop is weak on route and the M:N bridge route<->contact: hop_no
-- orders the legs and rows die with their route.
CREATE TABLE route_hop (
    route_id   BIGINT      NOT NULL REFERENCES route ON DELETE CASCADE,
    hop_no     SMALLINT    NOT NULL,
    contact_id BIGINT      NOT NULL REFERENCES contact,
    depart_ts  TIMESTAMPTZ NOT NULL,
    arrive_ts  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (route_id, hop_no),
    CHECK (arrive_ts >= depart_ts)
);
COMMENT ON TABLE route_hop IS 'Weak entity of route and M:N bridge to contact; hop_no orders the legs of one computed path.';

-- Packet points at the route chosen for it; added after route exists.
ALTER TABLE packet
    ADD CONSTRAINT fk_packet_route FOREIGN KEY (route_id) REFERENCES route ON DELETE SET NULL;

-- ------------------------------------------- AI router tables ---
-- ai_model versions the trained router; the partial unique index keeps
-- exactly one active model so ai_decide never has to guess.
CREATE TABLE ai_model (
    model_id      INT            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(40)    NOT NULL,
    version       SMALLINT       NOT NULL,
    algorithm     VARCHAR(40)    NOT NULL DEFAULT 'DecisionTreeClassifier',
    features      TEXT[]         NOT NULL,
    classes       router_action[] NOT NULL,
    max_depth     SMALLINT,
    train_rows    INT,
    test_accuracy NUMERIC(5,4)   CHECK (test_accuracy BETWEEN 0 AND 1),
    confusion     JSONB,
    is_active     BOOLEAN        NOT NULL DEFAULT FALSE,
    trained_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);
CREATE UNIQUE INDEX one_active_model ON ai_model (is_active) WHERE is_active;

-- dt_node is weak on ai_model: the decision tree itself, walked in SQL by
-- ai_decide. Self-FKs are deferrable so a whole tree inserts in any order.
CREATE TABLE dt_node (
    model_id    INT              NOT NULL REFERENCES ai_model ON DELETE CASCADE,
    node_id     INT              NOT NULL,
    depth       SMALLINT         NOT NULL,
    feature     TEXT,
    threshold   DOUBLE PRECISION,
    left_child  INT,
    right_child INT,
    leaf_action router_action,
    samples     INT              NOT NULL,
    gini        NUMERIC(6,5)     NOT NULL,
    class_counts JSONB           NOT NULL,
    PRIMARY KEY (model_id, node_id),
    CHECK ((feature IS NULL) = (leaf_action IS NOT NULL)),
    FOREIGN KEY (model_id, left_child) REFERENCES dt_node (model_id, node_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (model_id, right_child) REFERENCES dt_node (model_id, node_id) DEFERRABLE INITIALLY DEFERRED
);
COMMENT ON TABLE dt_node IS 'Weak entity of ai_model holding the decision tree; ai_decide walks it with a recursive CTE using sklearn left/right semantics.';

-- Per-class scores for the viva confusion-matrix slide.
CREATE TABLE ai_model_metric (
    model_id    INT          NOT NULL REFERENCES ai_model ON DELETE CASCADE,
    class_label TEXT         NOT NULL,
    precision_  NUMERIC(5,4),
    recall      NUMERIC(5,4),
    f1          NUMERIC(5,4),
    support     INT,
    PRIMARY KEY (model_id, class_label)
);

-- routing_decision is the audit trail: features in, AI action, rule action,
-- final action out; overridden is generated so override counts never lie.
CREATE TABLE routing_decision (
    decision_id    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sat_id         VARCHAR(12)   NOT NULL REFERENCES satellite,
    contact_id     BIGINT        REFERENCES contact,
    model_id       INT           REFERENCES ai_model,
    features       JSONB         NOT NULL,
    ai_action      router_action,
    ai_path        TEXT[],
    rule_action    router_action NOT NULL,
    final_action   router_action NOT NULL,
    overridden     BOOLEAN GENERATED ALWAYS AS (ai_action IS DISTINCT FROM final_action) STORED,
    override_reason TEXT,
    source         VARCHAR(12)   NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'TELECOMMAND')),
    decided_by     NAME          NOT NULL DEFAULT current_user,
    decided_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ------------------------------------------- ground security ---
-- station_key holds the HMAC secret; column privileges (07) hide secret from
-- everyone but the director, proving least-privilege in the viva demo.
CREATE TABLE station_key (
    station_id VARCHAR(12) NOT NULL PRIMARY KEY REFERENCES ground_station ON DELETE CASCADE,
    key_id     VARCHAR(16) NOT NULL,
    secret     BYTEA       NOT NULL,
    rotated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- telecommand carries replay protection via UNIQUE(station_id, nonce); the
-- verify trigger (06) recomputes the HMAC before verified is ever set.
CREATE TABLE telecommand (
    cmd_id     BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id VARCHAR(12)  NOT NULL REFERENCES ground_station,
    sat_id     VARCHAR(12)  NOT NULL REFERENCES satellite,
    opcode     VARCHAR(20)  NOT NULL CHECK (opcode IN ('PING', 'SET_MODE', 'OVERRIDE_ACTION', 'SAFE_MODE', 'REBOOT', 'DOWNLINK_NOW')),
    args       JSONB        NOT NULL DEFAULT '{}',
    nonce      BIGINT       NOT NULL,
    hmac       BYTEA        NOT NULL,
    verified   BOOLEAN      NOT NULL DEFAULT FALSE,
    issued_by  NAME         NOT NULL DEFAULT current_user,
    issued_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ  NOT NULL DEFAULT now() + INTERVAL '30 minutes',
    UNIQUE (station_id, nonce)
);

-- alert is the watchdog outbox: telemetry trigger raises WARN/CRITICAL here.
CREATE TABLE alert (
    alert_id     BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sat_id       VARCHAR(12) REFERENCES satellite,
    severity     VARCHAR(8)  NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
    message      TEXT        NOT NULL,
    raised_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged BOOLEAN     NOT NULL DEFAULT FALSE
);

-- audit_log is append-only by convention: generic trigger (06) snapshots
-- old/new rows as JSONB, stripping secrets, for the compliance story.
CREATE TABLE audit_log (
    audit_id   BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT        NOT NULL,
    op         CHAR(1)     NOT NULL CHECK (op IN ('I', 'U', 'D')),
    row_pk     TEXT,
    old_row    JSONB,
    new_row    JSONB,
    changed_by NAME        NOT NULL DEFAULT session_user,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    txid       BIGINT      NOT NULL DEFAULT txid_current()
);

-- ------------------------------------------- real-sat validation ---
-- satellite_tle caches real amateur-satellite TLEs so the ground segment can
-- validate against live objects without depending on an external feed.
CREATE TABLE satellite_tle (
    norad_id      INT          NOT NULL PRIMARY KEY,
    object_name   VARCHAR(40)  NOT NULL,
    tle_line1     CHAR(69)     NOT NULL CHECK (tle_line1 LIKE '1 %'),
    tle_line2     CHAR(69)     NOT NULL CHECK (tle_line2 LIKE '2 %'),
    epoch_utc     TIMESTAMPTZ  NOT NULL,
    payload_modes VARCHAR(60),
    relevance     TEXT,
    fetched_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
