-- [Exp 4 - DML, CO2]
-- SomaiyaNet seed: payload modes, state machine, ground stations + keys,
-- deployer pods and their signal evidence. Satellites are NOT seeded here;
-- build_constellation.py inserts them from computed TLEs.

-- Payload modes in the PDF downlink order: TTC first, SSTV power-hungry,
-- then M17 and Codec2 voice. Priority drives dispatch order.
INSERT INTO payload_mode (mode, priority, bitrate_bps, tx_power_mw, description) VALUES
    ('TTC',    1, 9600,  500, 'Telemetry, tracking & command / housekeeping'),
    ('SSTV',   2, 4800, 1500, 'Slow-scan TV image (power hungry)'),
    ('M17',    3, 9600, 1000, 'M17 digital voice/data'),
    ('CODEC2', 4, 1300,  800, 'Codec2 low-bitrate voice');

-- Legal satellite state transitions; the trigger rejects anything unlisted.
INSERT INTO sat_state_transition (from_state, to_state) VALUES
    ('STOWED', 'DEPLOYED'),
    ('DEPLOYED', 'COMMISSIONING'),
    ('COMMISSIONING', 'NOMINAL'),
    ('COMMISSIONING', 'SAFE'),
    ('NOMINAL', 'SAFE'),
    ('SAFE', 'NOMINAL'),
    ('NOMINAL', 'DECOMMISSIONED'),
    ('SAFE', 'DECOMMISSIONED');

-- Ground stations: supertype row first (totality trigger needs both halves
-- by commit), then the subtype row. GS-BOM is the single primary station.
INSERT INTO network_node (node_id, kind, display_name, callsign) VALUES
    ('GS-BOM', 'GROUND', 'KJSIT Mumbai', 'VU2KJS'),
    ('GS-HEL', 'GROUND', 'ReOrbit Espoo', 'OH2SOM'),
    ('GS-BLR', 'GROUND', 'Bengaluru Relay', 'VU2BLR'),
    ('GS-TYO', 'GROUND', 'Tokyo Amateur', 'JA1SOM'),
    ('GS-SVB', 'GROUND', 'Svalbard Polar', 'LA0SOM'),
    ('GS-CPT', 'GROUND', 'Cape Town', 'ZS1SOM');

INSERT INTO ground_station (node_id, city, country, latitude, longitude, altitude_m, min_elevation_deg, is_primary, operator_role) VALUES
    ('GS-BOM', 'Mumbai',      'IN',  19.0728,   72.8826,   14, 10, TRUE,  'station_operator_bom'),
    ('GS-HEL', 'Espoo',       'FI',  60.2055,   24.6559,   30, 10, FALSE, 'station_operator_hel'),
    ('GS-BLR', 'Bengaluru',   'IN',  12.9716,   77.5946,  920, 10, FALSE, 'mission_director'),
    ('GS-TYO', 'Tokyo',       'JP',  35.6762,  139.6503,   40, 10, FALSE, 'mission_director'),
    ('GS-SVB', 'Longyearbyen','NO',  78.2232,   15.6267,  450,  5, FALSE, 'mission_director'),
    ('GS-CPT', 'Cape Town',   'ZA', -33.9249,   18.4241,   20, 10, FALSE, 'mission_director');

-- One HMAC key per station; secrets are random 32-byte blobs only the
-- director may read (column privileges in 07).
INSERT INTO station_key (station_id, key_id, secret)
SELECT node_id, 'K-' || node_id || '-1', gen_random_bytes(32)
FROM ground_station;

-- Eight SomaiyaPod deployers. Mechanism alternates SPRING_PUSHER/BURN_WIRE
-- down the slot order; every pod is CONFIRMED ~95 min after launch except
-- POD-B4, which stays ARMED for the deployment demo.
INSERT INTO deployer_pod (pod_id, serial_no, release_mechanism, status, launch_date, release_ts) VALUES
    ('POD-A1', 'SPOD-2026-001', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-A2', 'SPOD-2026-002', 'BURN_WIRE',     'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-A3', 'SPOD-2026-003', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-A4', 'SPOD-2026-004', 'BURN_WIRE',     'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-B1', 'SPOD-2026-005', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-B2', 'SPOD-2026-006', 'BURN_WIRE',     'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-B3', 'SPOD-2026-007', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, (CURRENT_DATE - 21)::TIMESTAMPTZ + INTERVAL '95 minutes'),
    ('POD-B4', 'SPOD-2026-008', 'BURN_WIRE',     'ARMED',     CURRENT_DATE - 21, NULL);

-- Signal evidence for each CONFIRMED pod: all three deploy signals, ok, at
-- release + 0 s / 2 s / 40 s. POD-B4 has no events until the demo fires.
INSERT INTO deployment_event (pod_id, seq, signal, ok, value, observed_at)
SELECT p.pod_id, s.seq, s.signal, TRUE, s.value, p.release_ts + s.delta
FROM deployer_pod AS p
CROSS JOIN (VALUES
    (1, 'SEPARATION_SWITCH'::deploy_signal, INTERVAL '0 seconds',  'separation switch closed'),
    (2, 'RELEASE_TIMER'::deploy_signal,     INTERVAL '2 seconds',  'release timer elapsed'),
    (3, 'RF_BEACON'::deploy_signal,        INTERVAL '40 seconds', 'first RF beacon heard')
) AS s (seq, signal, delta, value)
WHERE p.status = 'CONFIRMED';
