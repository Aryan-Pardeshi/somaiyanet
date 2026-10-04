"""Triggers (§6)."""
import json

import psycopg
import pytest


def test_illegal_state_transition_raises(conn):
    with pytest.raises(psycopg.errors.CheckViolation) as e:
        conn.execute("UPDATE satellite SET state='STOWED' WHERE node_id='SAT-T1'")
    assert e.value.sqlstate == "23514"
    conn.rollback()
    assert "illegal state transition" in str(e.value)
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute("UPDATE satellite SET state='DEPLOYED' WHERE node_id='SAT-T1'")
    conn.rollback()


def test_audit_log_and_secret_stripped(conn):
    conn.execute("UPDATE deployer_pod SET temperature_c=21.5 WHERE pod_id='POD-T1'")
    row = conn.execute(
        "SELECT new_row FROM audit_log WHERE table_name='deployer_pod' ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert row is not None
    conn.rollback()
    conn.execute("UPDATE station_key SET rotated_at=now() WHERE station_id='GS-BOM'")
    row = conn.execute(
        "SELECT new_row FROM audit_log WHERE table_name='station_key' ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert row is not None and "secret" not in (row[0] or {})
    conn.rollback()


def test_telemetry_critical_alert_and_battery(conn):
    conn.execute(
        "INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma) VALUES (now(), 'SAT-T1', 6.50, 20.0, 100)")
    batt = conn.execute("SELECT battery_v FROM satellite WHERE node_id='SAT-T1'").fetchone()[0]
    assert float(batt) == 6.50
    sev = conn.execute(
        "SELECT severity FROM alert WHERE sat_id='SAT-T1' ORDER BY alert_id DESC LIMIT 1").fetchone()[0]
    assert sev == "CRITICAL"
    conn.rollback()


def test_telecommand_hmac_rejected_and_accepted(conn):
    # forged HMAC
    with pytest.raises(psycopg.errors.InvalidAuthorizationSpecification):
        conn.execute(
            "INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac)"
            " VALUES ('GS-BOM', 'SAT-T1', 'PING', '{}', 900001, '\\x00')")
    conn.rollback()
    # valid signature via the HSM function
    sig = conn.execute("SELECT sign_telecommand('GS-BOM', 'SAT-T1', 'PING', '{}', 900002)").fetchone()[0]
    conn.execute(
        "INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac)"
        " VALUES ('GS-BOM', 'SAT-T1', 'PING', '{}', 900002, %s)", (sig,))
    ver = conn.execute("SELECT verified FROM telecommand WHERE station_id='GS-BOM' AND nonce=900002").fetchone()[0]
    assert ver is True
    conn.rollback()


def test_downlink_ground_to_sat_rejected(conn):
    with pytest.raises(psycopg.errors.CheckViolation):
        conn.execute(
            "INSERT INTO contact (kind, from_node, to_node, start_ts, end_ts, rate_bps, link_score, min_range_km)"
            " VALUES ('DOWNLINK', 'GS-BOM', 'SAT-T1', now()+INTERVAL '1 hour', now()+INTERVAL '2 hours', 9600, 50, 700.0)")
    conn.rollback()


def test_node_totality_fails_at_commit(role_conn_factory):
    c = role_conn_factory("mission_director")
    c.autocommit = False
    try:
        c.execute("INSERT INTO network_node (node_id, kind, display_name) VALUES ('ORPHAN-1', 'SAT', 'Orphan Sat')")
        with pytest.raises(Exception):
            c.commit()
        c.rollback()
    finally:
        c.close()
