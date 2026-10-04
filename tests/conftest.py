"""Pytest session fixture: build somaiyanet_test_w3 and load a small graph."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import _db  # noqa: E402

TEST_DB = "somaiyanet_test_w3"

TLE1 = "1 " + "0" * 67
TLE2 = "2 " + "0" * 67
assert len(TLE1) == 69 and len(TLE2) == 69


def _setup_sql() -> str:
    return """
    -- fixture pods + nodes + sats (one txn so the deferred totality trigger passes)
    INSERT INTO deployer_pod (pod_id, serial_no, release_mechanism, status, launch_date, release_ts) VALUES
        ('POD-T1', 'SPOD-T-001', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, now() - INTERVAL '20 days'),
        ('POD-T2', 'SPOD-T-002', 'BURN_WIRE', 'CONFIRMED', CURRENT_DATE - 21, now() - INTERVAL '20 days'),
        ('POD-T3', 'SPOD-T-003', 'SPRING_PUSHER', 'CONFIRMED', CURRENT_DATE - 21, now() - INTERVAL '20 days'),
        ('POD-T4', 'SPOD-T-004', 'BURN_WIRE', 'ARMED', CURRENT_DATE - 21, NULL),
        ('POD-X1', 'SPOD-X-001', 'SPRING_PUSHER', 'ARMED', CURRENT_DATE - 21, NULL),
        ('POD-X2', 'SPOD-X-002', 'BURN_WIRE', 'ARMED', CURRENT_DATE - 21, NULL),
        ('POD-X3', 'SPOD-X-003', 'SPRING_PUSHER', 'ARMED', CURRENT_DATE - 21, NULL);

    INSERT INTO network_node (node_id, kind, display_name, callsign) VALUES
        ('SAT-T1', 'SAT', 'FixtureSat-T1', 'VU2T01'),
        ('SAT-T2', 'SAT', 'FixtureSat-T2', 'VU2T02'),
        ('SAT-T3', 'SAT', 'FixtureSat-T3', 'VU2T03'),
        ('SAT-T4', 'SAT', 'FixtureSat-T4', 'VU2T04'),
        ('SAT-X2', 'SAT', 'FixtureSat-X2', 'VU2X02'),
        ('SAT-X3', 'SAT', 'FixtureSat-X3', 'VU2X03');

    INSERT INTO satellite (node_id, kind, norad_id, plane, slot, pod_id, state,
        tle_line1, tle_line2, epoch_utc, inclination_deg, mean_motion) VALUES
        ('SAT-T1', 'SAT', 99101, 'A', 5, 'POD-T1', 'NOMINAL', '{t1}', '{t2}', now(), 97.5, 15.0),
        ('SAT-T2', 'SAT', 99102, 'A', 6, 'POD-T2', 'NOMINAL', '{t1}', '{t2}', now(), 97.5, 15.0),
        ('SAT-T3', 'SAT', 99103, 'A', 7, 'POD-T3', 'NOMINAL', '{t1}', '{t2}', now(), 97.5, 15.0),
        ('SAT-T4', 'SAT', 99104, 'A', 8, 'POD-T4', 'STOWED',  '{t1}', '{t2}', now(), 97.5, 15.0),
        ('SAT-X2', 'SAT', 99105, 'B', 5, 'POD-X2', 'STOWED',  '{t1}', '{t2}', now(), 97.5, 15.0),
        ('SAT-X3', 'SAT', 99106, 'B', 6, 'POD-X3', 'STOWED',  '{t1}', '{t2}', now(), 97.5, 15.0);

    -- contacts: CGR relay via SVB beats the late direct downlink; BOM/HEL set-op pair
    INSERT INTO contact (kind, from_node, to_node, start_ts, end_ts, rate_bps, link_score, min_range_km, max_elevation_deg) VALUES
        ('ISL', 'SAT-T1', 'SAT-T2', now() + INTERVAL '10 minutes', now() + INTERVAL '20 minutes', 9600, 80, 500.0, NULL),
        ('ISL', 'SAT-T2', 'SAT-T1', now() + INTERVAL '10 minutes', now() + INTERVAL '20 minutes', 9600, 80, 500.0, NULL),
        ('ISL', 'SAT-T1', 'SAT-T4', now() + INTERVAL '11 minutes', now() + INTERVAL '19 minutes', 9600, 95, 300.0, NULL),
        ('DOWNLINK', 'SAT-T2', 'GS-SVB', now() + INTERVAL '25 minutes', now() + INTERVAL '35 minutes', 9600, 70, 800.0, 45.0),
        ('DOWNLINK', 'SAT-T1', 'GS-BOM', now() + INTERVAL '5 hours', now() + INTERVAL '5 hours 10 minutes', 9600, 90, 700.0, 50.0),
        ('DOWNLINK', 'SAT-T1', 'GS-HEL', now() + INTERVAL '5 hours 15 minutes', now() + INTERVAL '5 hours 25 minutes', 9600, 75, 750.0, 40.0),
        ('DOWNLINK', 'SAT-T3', 'GS-BOM', now() + INTERVAL '6 hours', now() + INTERVAL '6 hours 10 minutes', 9600, 65, 900.0, 35.0);

    -- telemetry: T3 low (avg < 7.0), others healthy
    INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma) VALUES
        (now() - INTERVAL '2 hours', 'SAT-T1', 7.90, 20.0, 300),
        (now() - INTERVAL '1 hour',  'SAT-T1', 7.90, 21.0, 310),
        (now() - INTERVAL '2 hours', 'SAT-T2', 7.60, 20.0, 300),
        (now() - INTERVAL '1 hour',  'SAT-T2', 7.60, 21.0, 300),
        (now() - INTERVAL '2 hours', 'SAT-T3', 6.60, 22.0, 200),
        (now() - INTERVAL '1 hour',  'SAT-T3', 6.60, 22.5, 200);

    -- deploy-demo signals: X1 has 1 distinct ok signal, X2/X3 have 2
    INSERT INTO deployment_event (pod_id, seq, signal, ok, value) VALUES
        ('POD-X1', 1, 'SEPARATION_SWITCH', TRUE, 'x1'),
        ('POD-X2', 1, 'SEPARATION_SWITCH', TRUE, 'x2a'),
        ('POD-X2', 2, 'RELEASE_TIMER', TRUE, 'x2b'),
        ('POD-X3', 1, 'SEPARATION_SWITCH', TRUE, 'x3a'),
        ('POD-X3', 2, 'RF_BEACON', TRUE, 'x3b');
    """.format(t1=TLE1, t2=TLE2)


def _packet_sql() -> str:
    return """
    -- queued packets for dispatch (SAT-T2) and execute_pass (SAT-T1)
    INSERT INTO packet (origin_sat, mode, size_bytes, status) VALUES
        ('SAT-T2', 'TTC', 200, 'QUEUED'),
        ('SAT-T2', 'TTC', 200, 'QUEUED'),
        ('SAT-T2', 'TTC', 200, 'QUEUED'),
        ('SAT-T2', 'TTC', 200, 'QUEUED'),
        ('SAT-T2', 'SSTV', 1000, 'QUEUED'),
        ('SAT-T2', 'SSTV', 1000, 'QUEUED'),
        ('SAT-T2', 'M17', 800, 'QUEUED'),
        ('SAT-T2', 'M17', 800, 'QUEUED'),
        ('SAT-T2', 'CODEC2', 500, 'QUEUED'),
        ('SAT-T2', 'CODEC2', 500, 'QUEUED'),
        ('SAT-T1', 'TTC', 200, 'QUEUED'),
        ('SAT-T1', 'TTC', 200, 'QUEUED'),
        ('SAT-T1', 'SSTV', 1000, 'QUEUED'),
        ('SAT-T1', 'M17', 800, 'QUEUED'),
        ('SAT-T1', 'CODEC2', 500, 'QUEUED');
    INSERT INTO ttc_frame (packet_id, battery_v, temp_c, solar_ma)
        SELECT packet_id, 7.5, 20.0, 300 FROM packet WHERE origin_sat IN ('SAT-T1','SAT-T2') AND mode = 'TTC';
    INSERT INTO sstv_image (packet_id, sstv_mode, width, height)
        SELECT packet_id, 'Robot36', 320, 240 FROM packet WHERE origin_sat IN ('SAT-T1','SAT-T2') AND mode = 'SSTV';
    INSERT INTO voice_frame (packet_id, mode, duration_ms, src_callsign)
        SELECT packet_id, mode, 1000, 'VU2T01' FROM packet WHERE origin_sat IN ('SAT-T1','SAT-T2') AND mode IN ('M17','CODEC2');
    """


def _build_db() -> None:
    env = dict(os.environ)
    env.setdefault("PGPORT", "55433")
    env["PGPORT"] = os.environ.get("PGPORT", "55433")
    cmd = [sys.executable, "scripts/setup_db.py", "--db", TEST_DB, "--sql-only"]
    subprocess.run(cmd, cwd=str(REPO_ROOT), env=env, check=True)
    import psycopg  # noqa: E402

    cfg = _db.settings()
    with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=TEST_DB,
                         user=cfg["user"], password=cfg["password"]) as conn:
        conn.execute(_setup_sql())
        conn.execute(_packet_sql())
        conn.commit()
        try:
            conn.execute("REFRESH MATERIALIZED VIEW mv_kpis")
        except Exception:
            pass


def _role_conn(role: str):
    cfg = _db.settings()
    import psycopg  # noqa: E402

    return psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=os.environ.get("SOMAIYANET_DB", TEST_DB),
                           user=role, password=_db.role_password(role))


@pytest.fixture(scope="session", autouse=True)
def _database():
    if not os.environ.get("PGPORT"):
        os.environ["PGPORT"] = "55433"
    _build_db()
    os.environ["SOMAIYANET_DB"] = TEST_DB
    yield


@pytest.fixture()
def conn():
    cfg = _db.settings()
    import psycopg  # noqa: E402

    with psycopg.connect(host=cfg["host"], port=cfg["port"],
                         dbname=os.environ.get("SOMAIYANET_DB", TEST_DB),
                         user=cfg["user"], password=cfg["password"]) as c:
        yield c


@pytest.fixture()
def role_conn_factory():
    return _role_conn
