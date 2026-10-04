-- [Exp 5 & 6 - aggregates, set ops, nested queries, joins, views; CO2/CO3]
-- SomaiyaNet views: every dashboard read is a view so the viva can point at
-- SQL, not Python. One row per satellite / station / mode bucket.

-- v_constellation_status: multi-way JOIN demo. One row per satellite with its
-- pod, latest telemetry (LATERAL), next downlink (LATERAL) and queued bytes.
CREATE OR REPLACE VIEW v_constellation_status AS
SELECT n.node_id AS sat_id,
       n.display_name,
       n.callsign,
       s.state,
       s.plane,
       s.slot,
       s.pod_id,
       p.status AS pod_status,
       s.battery_v,
       s.last_seen,
       lt.ts AS latest_telemetry_ts,
       lt.temp_c AS latest_temp_c,
       nx.to_node AS next_station,
       nx.start_ts AS next_downlink_start,
       nx.link_score AS next_downlink_score,
       COALESCE(q.queued_bytes, 0)::BIGINT AS queued_bytes,
       COALESCE(q.queued_packets, 0)::BIGINT AS queued_packets
FROM network_node AS n
JOIN satellite AS s ON s.node_id = n.node_id
JOIN deployer_pod AS p ON p.pod_id = s.pod_id
LEFT JOIN LATERAL (
    SELECT t.ts, t.battery_v, t.temp_c
    FROM telemetry AS t
    WHERE t.sat_id = s.node_id
    ORDER BY t.ts DESC
    LIMIT 1
) AS lt ON TRUE
LEFT JOIN LATERAL (
    SELECT c.to_node, c.start_ts, c.link_score
    FROM contact AS c
    WHERE c.kind = 'DOWNLINK' AND c.from_node = s.node_id AND c.end_ts > now()
    ORDER BY c.start_ts
    LIMIT 1
) AS nx ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(pk.size_bytes)::BIGINT AS queued_bytes,
           COUNT(*)::BIGINT AS queued_packets
    FROM packet AS pk
    WHERE pk.origin_sat = s.node_id AND pk.status = 'QUEUED'
) AS q ON TRUE
ORDER BY s.plane, s.slot;

-- v_station_workload: GROUP BY demo. DOWNLINK contacts in the next 24 h per
-- station; LEFT JOIN so idle stations still appear. security_invoker keeps RLS.
CREATE OR REPLACE VIEW v_station_workload
WITH (security_invoker = TRUE) AS
SELECT g.node_id AS station_id,
       g.city,
       g.is_primary,
       COUNT(c.contact_id)::BIGINT AS contacts_24h,
       COALESCE(SUM(c.duration_s), 0)::BIGINT AS total_duration_s,
       ROUND(AVG(c.link_score), 1) AS avg_link_score
FROM ground_station AS g
LEFT JOIN contact AS c
  ON c.to_node = g.node_id
 AND c.kind = 'DOWNLINK'
 AND c.start_ts BETWEEN now() AND now() + INTERVAL '24 hours'
GROUP BY g.node_id, g.city, g.is_primary
ORDER BY total_duration_s DESC;

-- v_low_power: GROUP BY + HAVING demo. Sats whose 24 h average battery is low.
CREATE OR REPLACE VIEW v_low_power AS
SELECT t.sat_id,
       ROUND(AVG(t.battery_v), 2) AS avg_battery_24h,
       MIN(t.battery_v) AS min_battery_24h,
       COUNT(*)::BIGINT AS rows_24h
FROM telemetry AS t
WHERE t.ts >= now() - INTERVAL '24 hours'
GROUP BY t.sat_id
HAVING AVG(t.battery_v) < 7.0
ORDER BY avg_battery_24h;

-- v_queue_by_mode: GROUP BY over the packet queue per satellite / mode / status.
CREATE OR REPLACE VIEW v_queue_by_mode AS
SELECT pk.origin_sat AS sat_id,
       pk.mode,
       pk.status,
       COUNT(*)::BIGINT AS packets,
       SUM(pk.size_bytes)::BIGINT AS bytes
FROM packet AS pk
GROUP BY pk.origin_sat, pk.mode, pk.status
ORDER BY pk.origin_sat, pk.mode, pk.status;

-- v_heard_by_bom_not_hel: EXCEPT demo. Sats heard by GS-BOM but not GS-HEL in
-- the window [now - 24 h, now + 24 h] over DOWNLINK contacts.
CREATE OR REPLACE VIEW v_heard_by_bom_not_hel AS
SELECT DISTINCT c.from_node AS sat_id
FROM contact AS c
WHERE c.kind = 'DOWNLINK' AND c.to_node = 'GS-BOM'
  AND c.start_ts BETWEEN now() - INTERVAL '24 hours' AND now() + INTERVAL '24 hours'
EXCEPT
SELECT DISTINCT c.from_node
FROM contact AS c
WHERE c.kind = 'DOWNLINK' AND c.to_node = 'GS-HEL'
  AND c.start_ts BETWEEN now() - INTERVAL '24 hours' AND now() + INTERVAL '24 hours';

-- v_heard_by_both: INTERSECT demo over the same window.
CREATE OR REPLACE VIEW v_heard_by_both AS
SELECT DISTINCT c.from_node AS sat_id
FROM contact AS c
WHERE c.kind = 'DOWNLINK' AND c.to_node = 'GS-BOM'
  AND c.start_ts BETWEEN now() - INTERVAL '24 hours' AND now() + INTERVAL '24 hours'
INTERSECT
SELECT DISTINCT c.from_node
FROM contact AS c
WHERE c.kind = 'DOWNLINK' AND c.to_node = 'GS-HEL'
  AND c.start_ts BETWEEN now() - INTERVAL '24 hours' AND now() + INTERVAL '24 hours';

-- v_mode_mix: UNION ALL demo stacking per-subtype packet counts.
CREATE OR REPLACE VIEW v_mode_mix AS
SELECT 'TTC'::TEXT AS bucket, COUNT(*)::BIGINT AS packets FROM ttc_frame
UNION ALL
SELECT 'SSTV'::TEXT, COUNT(*) FROM sstv_image
UNION ALL
SELECT 'VOICE'::TEXT, COUNT(*) FROM voice_frame;

-- v_weak_isl: nested scalar-subquery demo. ISL legs below the fleet ISL mean.
CREATE OR REPLACE VIEW v_weak_isl AS
SELECT c.contact_id,
       c.from_node,
       c.to_node,
       c.link_score,
       (SELECT ROUND(AVG(c2.link_score), 1) FROM contact AS c2 WHERE c2.kind = 'ISL') AS avg_isl_score
FROM contact AS c
WHERE c.kind = 'ISL'
  AND c.link_score < (SELECT AVG(c2.link_score) FROM contact AS c2 WHERE c2.kind = 'ISL')
ORDER BY c.link_score;

-- v_callsign_search: LIKE / ILIKE demo over node identity columns.
CREATE OR REPLACE VIEW v_callsign_search AS
SELECT n.node_id,
       n.kind,
       n.display_name,
       n.callsign
FROM network_node AS n
WHERE n.callsign LIKE 'VU2%'
   OR n.display_name ILIKE '%somaiya%'
   OR n.callsign ILIKE '%SOM%';

-- v_ai_overrides: routing decisions where the watchdog overruled the AI model.
CREATE OR REPLACE VIEW v_ai_overrides AS
SELECT d.decision_id,
       d.sat_id,
       d.decided_at,
       d.ai_action,
       d.rule_action,
       d.final_action,
       d.override_reason,
       d.source,
       m.name AS model_name,
       m.version AS model_version
FROM routing_decision AS d
LEFT JOIN ai_model AS m ON m.model_id = d.model_id
WHERE d.overridden
ORDER BY d.decided_at DESC;

-- v_route_detail: route JOIN route_hop JOIN contact JOIN node, ordered by hop.
CREATE OR REPLACE VIEW v_route_detail AS
SELECT r.route_id,
       r.packet_id,
       r.origin_sat,
       r.destination,
       r.requested_at,
       r.arrival_ts,
       r.hops,
       h.hop_no,
       h.depart_ts,
       h.arrive_ts,
       c.kind AS contact_kind,
       c.from_node,
       c.to_node,
       c.link_score,
       fn.display_name AS from_name,
       tn.display_name AS to_name
FROM route AS r
JOIN route_hop AS h ON h.route_id = r.route_id
JOIN contact AS c ON c.contact_id = h.contact_id
JOIN network_node AS fn ON fn.node_id = c.from_node
JOIN network_node AS tn ON tn.node_id = c.to_node
ORDER BY r.route_id, h.hop_no;

-- mv_kpis: MATERIALIZED one-row dashboard. kpi_id = 1 with a UNIQUE index so
-- REFRESH MATERIALIZED VIEW CONCURRENTLY works.
DROP MATERIALIZED VIEW IF EXISTS mv_kpis;
CREATE MATERIALIZED VIEW mv_kpis AS
SELECT 1::INT AS kpi_id,
       (SELECT COUNT(*)::INT FROM satellite) AS sats_total,
       (SELECT COUNT(*)::INT FROM satellite WHERE state IN ('NOMINAL', 'SAFE', 'COMMISSIONING')) AS sats_operational,
       (SELECT COUNT(*)::INT FROM packet WHERE status = 'QUEUED') AS packets_queued,
       (SELECT COUNT(*)::INT FROM packet WHERE status = 'DELIVERED' AND delivered_at >= now() - INTERVAL '24 hours') AS packets_delivered_24h,
       (SELECT COALESCE(SUM(size_bytes), 0)::BIGINT FROM packet WHERE status = 'DELIVERED' AND delivered_at >= now() - INTERVAL '24 hours') AS bytes_delivered_24h,
       (SELECT COUNT(*)::INT FROM contact WHERE start_ts BETWEEN now() AND now() + INTERVAL '24 hours') AS contacts_next_24h,
       (SELECT COUNT(*)::INT FROM contact WHERE kind = 'ISL' AND start_ts BETWEEN now() AND now() + INTERVAL '24 hours') AS isl_contacts_next_24h,
       (SELECT ROUND(AVG(latency_s))::INT FROM route WHERE arrival_ts IS NOT NULL) AS avg_route_latency_s,
       (SELECT COUNT(*)::INT FROM routing_decision WHERE overridden AND decided_at >= now() - INTERVAL '24 hours') AS ai_overrides_24h,
       now() AS refreshed_at;
CREATE UNIQUE INDEX uq_mv_kpis_one_row ON mv_kpis (kpi_id);
