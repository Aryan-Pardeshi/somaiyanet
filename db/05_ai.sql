-- [AI use case: model-as-data, recursive CTE inference, watchdog; CO3]
-- SomaiyaNet onboard AI router, stored in the database. The trained
-- decision tree lives in ai_model/dt_node (model-as-data), ai_decide walks
-- it with a recursive CTE, rule_action is the explainable fallback, and
-- watchdog_violation keeps the tree from doing anything unsafe.
-- SECURITY DEFINER functions below are owned by the setup superuser, so
-- they bypass RLS on purpose (documented in 07).

-- rule_action is the explainable fallback. Rules fire in fixed order:
-- R1 battery < 6.8 -> SAFE_TTC_ONLY; R2 no contact -> RELAY or HOLD;
-- R3 weak link -> RELAY or SAFE_TTC_ONLY; R4 battery < 7.2 -> TTC_VOICE;
-- R5 otherwise FULL_DOWNLINK.
CREATE OR REPLACE FUNCTION rule_action(f JSONB)
RETURNS router_action
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_batt    DOUBLE PRECISION := COALESCE((f->>'battery_v')::DOUBLE PRECISION, 0);
    v_link    DOUBLE PRECISION := COALESCE((f->>'link_score')::DOUBLE PRECISION, 0);
    v_contact DOUBLE PRECISION := COALESCE((f->>'contact_s')::DOUBLE PRECISION, 0);
    v_isl     DOUBLE PRECISION := COALESCE((f->>'isl_available')::DOUBLE PRECISION, 0);
BEGIN
    IF v_batt < 6.8 THEN
        RETURN 'SAFE_TTC_ONLY'::router_action;
    END IF;
    IF v_contact = 0 THEN
        IF v_isl = 1 THEN
            RETURN 'RELAY_VIA_ISL'::router_action;
        ELSE
            RETURN 'HOLD'::router_action;
        END IF;
    END IF;
    IF v_link < 40 THEN
        IF v_isl = 1 THEN
            RETURN 'RELAY_VIA_ISL'::router_action;
        ELSE
            RETURN 'SAFE_TTC_ONLY'::router_action;
        END IF;
    END IF;
    IF v_batt < 7.2 THEN
        RETURN 'TTC_VOICE'::router_action;
    END IF;
    RETURN 'FULL_DOWNLINK'::router_action;
END;
$$;
COMMENT ON FUNCTION rule_action(JSONB) IS 'Explainable fallback router: ordered R1..R5 rules over battery, contact, link and ISL availability.';

-- rule_reason gives the one-sentence reason for whichever rule fired.
CREATE OR REPLACE FUNCTION rule_reason(f JSONB)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_batt    DOUBLE PRECISION := COALESCE((f->>'battery_v')::DOUBLE PRECISION, 0);
    v_link    DOUBLE PRECISION := COALESCE((f->>'link_score')::DOUBLE PRECISION, 0);
    v_contact DOUBLE PRECISION := COALESCE((f->>'contact_s')::DOUBLE PRECISION, 0);
    v_isl     DOUBLE PRECISION := COALESCE((f->>'isl_available')::DOUBLE PRECISION, 0);
BEGIN
    IF v_batt < 6.8 THEN
        RETURN format('R1: battery %s V below 6.8 V, only safe TTC allowed', ROUND(v_batt::NUMERIC, 2));
    END IF;
    IF v_contact = 0 THEN
        IF v_isl = 1 THEN
            RETURN 'R2: no contact window, relaying via ISL';
        ELSE
            RETURN 'R2: no contact window and no ISL neighbour, holding';
        END IF;
    END IF;
    IF v_link < 40 THEN
        IF v_isl = 1 THEN
            RETURN format('R3: link score %s below 40, relaying via ISL', (f->>'link_score'));
        ELSE
            RETURN format('R3: link score %s below 40 with no ISL, falling back to safe TTC only', (f->>'link_score'));
        END IF;
    END IF;
    IF v_batt < 7.2 THEN
        RETURN format('R4: battery %s V below 7.2 V, SSTV is the most power-hungry mode', ROUND(v_batt::NUMERIC, 2));
    END IF;
    RETURN 'R5: power and link healthy, full downlink';
END;
$$;
COMMENT ON FUNCTION rule_reason(JSONB) IS 'Human-readable reason for the rule_action branch taken on the same feature vector.';

-- features_for_satellite builds the 8-key numeric feature vector from live
-- DB state: latest telemetry, best active downlink, queued KB per bucket,
-- and ISL availability. Missing inputs become 0 (e.g. STOWED sats).
CREATE OR REPLACE FUNCTION features_for_satellite(p_sat VARCHAR, p_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_batt    DOUBLE PRECISION := 0;
    v_sunlit  INT := 0;
    v_link    INT := 0;
    v_contact INT := 0;
    v_ttc     NUMERIC := 0;
    v_sstv    NUMERIC := 0;
    v_voice   NUMERIC := 0;
    v_isl     INT := 0;
BEGIN
    -- Latest telemetry gives battery and eclipse state.
    SELECT t.battery_v::DOUBLE PRECISION,
           CASE WHEN (t.housekeeping->>'sunlit')::BOOLEAN IS TRUE THEN 1 ELSE 0 END
      INTO v_batt, v_sunlit
      FROM telemetry t
     WHERE t.sat_id = p_sat
     ORDER BY t.ts DESC
     LIMIT 1;
    v_batt := COALESCE(v_batt, 0);
    v_sunlit := COALESCE(v_sunlit, 0);

    -- Best active DOWNLINK at p_at gives link score and seconds remaining.
    SELECT c.link_score, (EXTRACT(EPOCH FROM (c.end_ts - p_at)))::INT
      INTO v_link, v_contact
      FROM contact c
     WHERE c.kind = 'DOWNLINK'
       AND c.from_node = p_sat
       AND c.start_ts <= p_at
       AND c.end_ts >= p_at
     ORDER BY c.link_score DESC
     LIMIT 1;
    v_link := COALESCE(v_link, 0);
    v_contact := COALESCE(v_contact, 0);

    -- Queued bytes per mode bucket, in KB (voice = M17 + CODEC2).
    SELECT COALESCE(SUM(q.size_bytes) FILTER (WHERE q.mode = 'TTC'), 0) / 1024.0,
           COALESCE(SUM(q.size_bytes) FILTER (WHERE q.mode = 'SSTV'), 0) / 1024.0,
           COALESCE(SUM(q.size_bytes) FILTER (WHERE q.mode IN ('M17', 'CODEC2')), 0) / 1024.0
      INTO v_ttc, v_sstv, v_voice
      FROM packet q
     WHERE q.origin_sat = p_sat
       AND q.status = 'QUEUED';
    v_ttc := COALESCE(v_ttc, 0);
    v_sstv := COALESCE(v_sstv, 0);
    v_voice := COALESCE(v_voice, 0);

    -- An ISL is usable when a contact is active now to an operational sat.
    SELECT CASE WHEN EXISTS (
               SELECT 1
                 FROM contact c
                 JOIN satellite s ON s.node_id = c.to_node
                WHERE c.kind = 'ISL'
                  AND c.from_node = p_sat
                  AND c.start_ts <= p_at
                  AND c.end_ts >= p_at
                  AND s.state IN ('NOMINAL', 'SAFE', 'COMMISSIONING')
           ) THEN 1 ELSE 0 END
      INTO v_isl;

    RETURN jsonb_build_object(
        'battery_v', v_batt,
        'link_score', v_link,
        'contact_s', v_contact,
        'queue_ttc_kb', v_ttc,
        'queue_sstv_kb', v_sstv,
        'queue_voice_kb', v_voice,
        'sunlit', v_sunlit,
        'isl_available', v_isl);
END;
$$;
COMMENT ON FUNCTION features_for_satellite(VARCHAR, TIMESTAMPTZ) IS 'Builds the router feature vector from telemetry, active contacts and queue depths; SECURITY DEFINER so analysts can preview without raw table rights.';

-- ai_decide walks the active (or pinned) decision tree with a recursive CTE
-- from node 0, using sklearn semantics: go left when feature <= threshold.
CREATE OR REPLACE FUNCTION ai_decide(p_features JSONB, p_model_id INT DEFAULT NULL)
RETURNS TABLE(action router_action, path TEXT[], leaf_node INT, model_id INT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_model INT := COALESCE(p_model_id,
        (SELECT m.model_id FROM ai_model m WHERE m.is_active ORDER BY m.version DESC LIMIT 1));
BEGIN
    -- No active model: single NULL row so LATERAL callers still emit a row.
    IF v_model IS NULL OR NOT EXISTS (SELECT 1 FROM dt_node n WHERE n.model_id = v_model AND n.node_id = 0) THEN
        RETURN QUERY SELECT NULL::router_action, '{}'::TEXT[], NULL::INT, NULL::INT;
        RETURN;
    END IF;

    RETURN QUERY
    WITH RECURSIVE walk(node_id, feature, threshold, left_child, right_child, leaf_action, path) AS (
        SELECT n.node_id, n.feature, n.threshold, n.left_child, n.right_child, n.leaf_action,
               '{}'::TEXT[]
          FROM dt_node n
         WHERE n.model_id = v_model
           AND n.node_id = 0
        UNION ALL
        SELECT c.node_id, c.feature, c.threshold, c.left_child, c.right_child, c.leaf_action,
               walk.path || (walk.feature
                   || ' = ' || ROUND(COALESCE((p_features->>walk.feature)::FLOAT8, 0)::NUMERIC, 2)::TEXT
                   || CASE WHEN ((p_features->>walk.feature)::FLOAT8 <= walk.threshold)
                           THEN ' ≤ ' ELSE ' > ' END
                   || ROUND(walk.threshold::NUMERIC, 2)::TEXT
                   || CASE WHEN ((p_features->>walk.feature)::FLOAT8 <= walk.threshold)
                           THEN ' → left' ELSE ' → right' END)
          FROM walk
          JOIN dt_node c
            ON c.model_id = v_model
           AND c.node_id = CASE WHEN ((p_features->>walk.feature)::FLOAT8 <= walk.threshold)
                                THEN walk.left_child
                                ELSE walk.right_child END
         WHERE walk.leaf_action IS NULL
           AND walk.feature IS NOT NULL
           AND COALESCE(array_length(walk.path, 1), 0) < 100
    )
    SELECT walk.leaf_action, walk.path, walk.node_id, v_model
      FROM walk
     WHERE walk.leaf_action IS NOT NULL;
END;
$$;
COMMENT ON FUNCTION ai_decide(JSONB, INT) IS 'SQL inference: recursive-CTE walk of dt_node with sklearn left/right semantics; path steps are human-readable for the viva.';

-- watchdog_violation returns NULL when the action is safe, else the reason.
CREATE OR REPLACE FUNCTION watchdog_violation(f JSONB, a router_action)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_batt    DOUBLE PRECISION := COALESCE((f->>'battery_v')::DOUBLE PRECISION, 0);
    v_link    DOUBLE PRECISION := COALESCE((f->>'link_score')::DOUBLE PRECISION, 0);
    v_contact DOUBLE PRECISION := COALESCE((f->>'contact_s')::DOUBLE PRECISION, 0);
    v_isl     DOUBLE PRECISION := COALESCE((f->>'isl_available')::DOUBLE PRECISION, 0);
BEGIN
    IF v_batt < 6.8 AND a <> 'SAFE_TTC_ONLY' THEN
        RETURN format('watchdog: battery %s V below 6.8 V requires SAFE_TTC_ONLY (got %s)', ROUND(v_batt::NUMERIC, 2), a);
    END IF;
    IF v_contact = 0 AND a IN ('FULL_DOWNLINK', 'TTC_VOICE') THEN
        RETURN format('watchdog: no contact window, %s cannot downlink directly', a);
    END IF;
    IF v_link < 40 AND a = 'FULL_DOWNLINK' THEN
        RETURN format('watchdog: link score %s below 40, FULL_DOWNLINK would waste power', (f->>'link_score'));
    END IF;
    IF v_batt < 7.2 AND a = 'FULL_DOWNLINK' THEN
        RETURN format('watchdog: battery %s V below 7.2 V, FULL_DOWNLINK (SSTV) too power-hungry', ROUND(v_batt::NUMERIC, 2));
    END IF;
    IF a = 'RELAY_VIA_ISL' AND v_isl = 0 THEN
        RETURN 'watchdog: RELAY_VIA_ISL with no ISL neighbour available';
    END IF;
    RETURN NULL;
END;
$$;
COMMENT ON FUNCTION watchdog_violation(JSONB, router_action) IS 'Safety invariants over (features, action); non-NULL means the AI action must be overridden by the rule action.';

-- decide_for_satellite runs the full loop: features -> telecommand override
-- (human in the loop) or AI + watchdog -> audited routing_decision row.
CREATE OR REPLACE FUNCTION decide_for_satellite(p_sat VARCHAR, p_at TIMESTAMPTZ DEFAULT now())
RETURNS routing_decision
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
    v_f      JSONB;
    v_cid    BIGINT;
    v_rule   router_action;
    v_ai     router_action;
    v_path   TEXT[];
    v_leaf   INT;
    v_mid    INT;
    v_ov     TEXT;
    v_final  router_action;
    v_reason TEXT;
    v_source VARCHAR(12) := 'AUTO';
    v_w      TEXT;
    v_row    routing_decision;
BEGIN
    -- 1. Build the features.
    v_f := features_for_satellite(p_sat, p_at);
    SELECT c.contact_id
      INTO v_cid
      FROM contact c
     WHERE c.kind = 'DOWNLINK'
       AND c.from_node = p_sat
       AND c.start_ts <= p_at
       AND c.end_ts >= p_at
     ORDER BY c.link_score DESC
     LIMIT 1;

    v_rule := rule_action(v_f);

    -- AI action is always computed for the audit trail (NULL if no model).
    SELECT d.action, d.path, d.leaf_node, d.model_id
      INTO v_ai, v_path, v_leaf, v_mid
      FROM ai_decide(v_f) d
     LIMIT 1;

    -- 2. Human-in-the-loop override wins, except the battery < 6.8 rule
    -- which even a human may not waive.
    SELECT t.args->>'action'
      INTO v_ov
      FROM telecommand t
     WHERE t.sat_id = p_sat
       AND t.opcode = 'OVERRIDE_ACTION'
       AND t.verified
       AND t.expires_at > p_at
     ORDER BY t.issued_at DESC
     LIMIT 1;

    IF v_ov IS NOT NULL THEN
        v_source := 'TELECOMMAND';
        BEGIN
            v_final := v_ov::router_action;
        EXCEPTION WHEN OTHERS THEN
            v_final := v_rule;
            v_reason := 'invalid override action ' || v_ov || '; rule fallback';
        END;
        IF v_reason IS NULL
           AND (v_f->>'battery_v')::FLOAT8 < 6.8
           AND v_final <> 'SAFE_TTC_ONLY' THEN
            v_w := watchdog_violation(v_f, v_final);
            v_final := 'SAFE_TTC_ONLY'::router_action;
            v_reason := COALESCE(v_w,
                'telecommand override violates battery < 6.8 V rule; forced SAFE_TTC_ONLY');
        END IF;
    -- 3. Otherwise AI + watchdog, with rule fallback when model-less.
    ELSIF v_mid IS NULL THEN
        v_final := v_rule;
        v_reason := 'no active model: rule-based fallback';
    ELSE
        v_w := watchdog_violation(v_f, v_ai);
        IF v_w IS NOT NULL THEN
            v_final := v_rule;
            v_reason := v_w;
        ELSE
            v_final := v_ai;
            v_reason := NULL;
        END IF;
    END IF;

    -- 4. Insert and return the audit row (overridden is generated).
    INSERT INTO routing_decision
        (sat_id, contact_id, model_id, features, ai_action, ai_path,
         rule_action, final_action, override_reason, source)
    VALUES (p_sat, v_cid, v_mid, v_f, v_ai, v_path,
            v_rule, v_final, v_reason, v_source)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$;
COMMENT ON FUNCTION decide_for_satellite(VARCHAR, TIMESTAMPTZ) IS 'Full router loop: features, telecommand override, AI inference, watchdog, audit insert; SECURITY DEFINER so the spacecraft role can decide without raw table rights.';

-- preview_decision runs the same logic without inserting, so the analyst
-- role can preview but not record decisions.
CREATE OR REPLACE FUNCTION preview_decision(p_sat VARCHAR)
RETURNS TABLE(sat_id VARCHAR, contact_id BIGINT, model_id INT, features JSONB,
              ai_action router_action, ai_path TEXT[],
              rule_action router_action, final_action router_action,
              overridden BOOLEAN, override_reason TEXT, source VARCHAR)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_f      JSONB;
    v_cid    BIGINT;
    v_rule   router_action;
    v_ai     router_action;
    v_path   TEXT[];
    v_leaf   INT;
    v_mid    INT;
    v_ov     TEXT;
    v_final  router_action;
    v_reason TEXT;
    v_source VARCHAR(12) := 'AUTO';
    v_w      TEXT;
BEGIN
    v_f := features_for_satellite(p_sat, now());
    SELECT c.contact_id
      INTO v_cid
      FROM contact c
     WHERE c.kind = 'DOWNLINK'
       AND c.from_node = p_sat
       AND c.start_ts <= now()
       AND c.end_ts >= now()
     ORDER BY c.link_score DESC
     LIMIT 1;

    v_rule := rule_action(v_f);
    SELECT d.action, d.path, d.leaf_node, d.model_id
      INTO v_ai, v_path, v_leaf, v_mid
      FROM ai_decide(v_f) d
     LIMIT 1;

    SELECT t.args->>'action'
      INTO v_ov
      FROM telecommand t
     WHERE t.sat_id = p_sat
       AND t.opcode = 'OVERRIDE_ACTION'
       AND t.verified
       AND t.expires_at > now()
     ORDER BY t.issued_at DESC
     LIMIT 1;

    IF v_ov IS NOT NULL THEN
        v_source := 'TELECOMMAND';
        BEGIN
            v_final := v_ov::router_action;
        EXCEPTION WHEN OTHERS THEN
            v_final := v_rule;
            v_reason := 'invalid override action ' || v_ov || '; rule fallback';
        END;
        IF v_reason IS NULL
           AND (v_f->>'battery_v')::FLOAT8 < 6.8
           AND v_final <> 'SAFE_TTC_ONLY' THEN
            v_w := watchdog_violation(v_f, v_final);
            v_final := 'SAFE_TTC_ONLY'::router_action;
            v_reason := COALESCE(v_w,
                'telecommand override violates battery < 6.8 V rule; forced SAFE_TTC_ONLY');
        END IF;
    ELSIF v_mid IS NULL THEN
        v_final := v_rule;
        v_reason := 'no active model: rule-based fallback';
    ELSE
        v_w := watchdog_violation(v_f, v_ai);
        IF v_w IS NOT NULL THEN
            v_final := v_rule;
            v_reason := v_w;
        ELSE
            v_final := v_ai;
            v_reason := NULL;
        END IF;
    END IF;

    RETURN QUERY SELECT p_sat::VARCHAR, v_cid, v_mid, v_f, v_ai, v_path,
                        v_rule, v_final,
                        (v_ai IS DISTINCT FROM v_final),
                        v_reason, v_source::VARCHAR;
END;
$$;
COMMENT ON FUNCTION preview_decision(VARCHAR) IS 'Side-effect-free preview of decide_for_satellite for the analyst role; inserts nothing.';
