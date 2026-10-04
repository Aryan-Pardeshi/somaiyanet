"""Security (§8) and views."""
import psycopg
import pytest


def test_student_cannot_insert_telemetry(role_conn_factory):
    c = role_conn_factory("student_analyst")
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege) as e:
            c.execute("INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma)"
                      " VALUES (now(), 'SAT-T1', 7.5, 20.0, 100)")
        assert e.value.sqlstate == "42501"
        c.rollback()
    finally:
        c.close()


def test_ai_router_telemetry_write_only(role_conn_factory):
    c = role_conn_factory("ai_router")
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege) as e:
            c.execute("SELECT count(*) FROM telemetry")
        assert e.value.sqlstate == "42501"
        c.rollback()
        c.execute("INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma)"
                  " VALUES (now(), 'SAT-T1', 7.5, 20.0, 100)")
        c.rollback()  # keep fixture clean; INSERT itself succeeded
    finally:
        c.close()


def test_bom_station_key_columns(role_conn_factory):
    c = role_conn_factory("station_operator_bom")
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege) as e:
            c.execute("SELECT secret FROM station_key LIMIT 1").fetchall()
        assert e.value.sqlstate == "42501"
        c.rollback()
        rows = c.execute("SELECT key_id FROM station_key WHERE station_id='GS-BOM'").fetchall()
        assert rows
    finally:
        c.close()


def test_rls_bom_sees_own_downlinks_and_telecommands(role_conn_factory, conn):
    bom = role_conn_factory("station_operator_bom")
    try:
        downs = bom.execute(
            "SELECT DISTINCT to_node FROM contact WHERE kind='DOWNLINK'").fetchall()
        assert {r[0] for r in downs} == {"GS-BOM"}
        # seed one telecommand per station as director, then check visibility
        sig_bom = conn.execute("SELECT sign_telecommand('GS-BOM','SAT-T1','PING','{}',910001)").fetchone()[0]
        conn.execute("INSERT INTO telecommand (station_id,sat_id,opcode,args,nonce,hmac)"
                     " VALUES ('GS-BOM','SAT-T1','PING','{}',910001,%s)", (sig_bom,))
        sig_hel = conn.execute("SELECT sign_telecommand('GS-HEL','SAT-T1','PING','{}',910002)").fetchone()[0]
        conn.execute("INSERT INTO telecommand (station_id,sat_id,opcode,args,nonce,hmac)"
                     " VALUES ('GS-HEL','SAT-T1','PING','{}',910002,%s)", (sig_hel,))
        conn.commit()
        seen = {r[0] for r in bom.execute("SELECT DISTINCT station_id FROM telecommand").fetchall()}
        assert seen == {"GS-BOM"}
        # cannot insert for another station
        sig = bom.execute("SELECT sign_telecommand('GS-BOM','SAT-T1','PING','{}',910003)").fetchone()[0]
        with pytest.raises(psycopg.errors.Error):
            bom.execute("INSERT INTO telecommand (station_id,sat_id,opcode,args,nonce,hmac)"
                        " VALUES ('GS-HEL','SAT-T1','PING','{}',910003,%s)", (bytes(sig),))
        bom.rollback()
    finally:
        bom.close()
        conn.execute("DELETE FROM telecommand WHERE nonce IN (910001, 910002)")
        conn.commit()


def test_director_sees_everything(role_conn_factory):
    c = role_conn_factory("mission_director")
    try:
        downs = {r[0] for r in c.execute("SELECT DISTINCT to_node FROM contact WHERE kind='DOWNLINK'").fetchall()}
        assert "GS-BOM" in downs and "GS-HEL" in downs
    finally:
        c.close()


def test_views_low_power_mv_and_setops(conn):
    low = {r[0] for r in conn.execute("SELECT sat_id FROM v_low_power").fetchall()}
    assert "SAT-T3" in low
    conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis")
    assert conn.execute("SELECT sats_total FROM mv_kpis").fetchone()[0] >= 4
    both = {r[0] for r in conn.execute("SELECT sat_id FROM v_heard_by_both").fetchall()}
    bom_only = {r[0] for r in conn.execute("SELECT sat_id FROM v_heard_by_bom_not_hel").fetchall()}
    assert "SAT-T1" in both
    assert "SAT-T3" in bom_only
    assert "SAT-T1" not in bom_only
