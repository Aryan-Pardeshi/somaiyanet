"""Labs acceptance (brief 10a). SOMAIYANET_DB=somaiyanet_w10, SIMULATOR=0."""
from __future__ import annotations

import os
import time

os.environ.setdefault("SOMAIYANET_DB", "somaiyanet_w10")
os.environ["SIMULATOR"] = "0"

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def _login(role: str):
    r = client.post("/api/session", json={"role": role})
    assert r.status_code == 200, r.text
    return r


def _open_lab():
    _login("mission_director")
    r = client.post("/api/labs/tx/session")
    assert r.status_code == 200, r.text
    return r.json()["data"]["lab_id"]


def _exec(lab: str, session: str, sql: str, timeout_s: float = 8.0):
    """POST exec; follow 'waiting' via state until the thread finishes."""
    r = client.post(f"/api/labs/tx/{lab}/exec", json={"session": session, "sql": sql})
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    if body.get("status") != "waiting":
        return body
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(0.3)
        s = client.get(f"/api/labs/tx/{lab}/state")
        assert s.status_code == 200, s.text
        res = s.json()["data"][session]["result"]
        if res.get("status") not in ("running", "waiting"):
            return {**res, "session": session}
    return {"status": "waiting", "session": session}


def _reset(lab: str):
    r = client.post(f"/api/labs/tx/{lab}/reset")
    assert r.status_code == 200, r.text


def test_tx_lost_update_and_for_update_fix():
    lab = _open_lab()
    try:
        _reset(lab)
        assert _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "SELECT power_credits FROM lab_account WHERE id = 1")["status"] == "done"
        assert _exec(lab, "A", "UPDATE lab_account SET power_credits = 90 WHERE id = 1")["status"] == "done"
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        assert _exec(lab, "B", "UPDATE lab_account SET power_credits = 80 WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "COMMIT")["status"] == "done"
        fin = _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")
        assert fin["status"] == "done" and fin["rows"][0]["power_credits"] == 80
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        # Fix: SELECT FOR UPDATE makes B wait until A commits.
        _reset(lab)
        assert _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1 FOR UPDATE")["status"] == "done"
        r = client.post(f"/api/labs/tx/{lab}/exec",
                        json={"session": "B", "sql": "SELECT power_credits FROM lab_account WHERE id = 1 FOR UPDATE"})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "waiting"
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        done = _exec(lab, "B", "SELECT 1")
        assert done["status"] == "done"
        _reset(lab)
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def test_tx_non_repeatable_read():
    lab = _open_lab()
    try:
        _reset(lab)
        assert _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "UPDATE lab_account SET power_credits = 70 WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "COMMIT")["status"] == "done"
        second = _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")
        assert second["status"] == "done" and second["rows"][0]["power_credits"] == 70
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        # REPEATABLE READ: stable snapshot.
        _reset(lab)
        assert _exec(lab, "A", "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")["status"] == "done"
        first = _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")
        assert first["status"] == "done"
        v0 = first["rows"][0]["power_credits"]
        assert _exec(lab, "B", "UPDATE lab_account SET power_credits = 60 WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "COMMIT")["status"] == "done"
        again = _exec(lab, "A", "SELECT power_credits FROM lab_account WHERE id = 1")
        assert again["status"] == "done" and again["rows"][0]["power_credits"] == v0
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        _reset(lab)
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def test_tx_write_skew_serializable_40001():
    lab = _open_lab()
    try:
        _reset(lab)
        assert _exec(lab, "A", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")["status"] == "done"
        assert _exec(lab, "B", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")["status"] == "done"
        assert _exec(lab, "A", "SELECT sum(power_credits) FROM lab_account")["status"] == "done"
        assert _exec(lab, "B", "SELECT sum(power_credits) FROM lab_account")["status"] == "done"
        assert _exec(lab, "A", "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 2")["status"] == "done"
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        b_commit = _exec(lab, "B", "COMMIT")
        assert b_commit["status"] == "error", b_commit
        assert b_commit["error"]["sqlstate"] == "40001", b_commit
        _reset(lab)
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def test_tx_deadlock_40P01():
    lab = _open_lab()
    try:
        _reset(lab)
        assert _exec(lab, "A", "UPDATE lab_account SET power_credits = power_credits WHERE id = 1")["status"] == "done"
        assert _exec(lab, "B", "UPDATE lab_account SET power_credits = power_credits WHERE id = 2")["status"] == "done"
        r = client.post(f"/api/labs/tx/{lab}/exec",
                        json={"session": "A", "sql": "UPDATE lab_account SET power_credits = power_credits WHERE id = 2"})
        assert r.status_code == 200 and r.json()["data"]["status"] == "waiting"
        # B runs into the cycle: one side must die with 40P01.
        b = _exec(lab, "B", "UPDATE lab_account SET power_credits = power_credits WHERE id = 1", timeout_s=12.0)
        states = [b]
        # Poll A too; whichever reports 40P01 satisfies the scenario.
        deadline = time.time() + 10
        a_final = None
        while time.time() < deadline:
            s = client.get(f"/api/labs/tx/{lab}/state")
            a_final = s.json()["data"]["A"]["result"]
            if a_final.get("status") not in ("running", "waiting"):
                break
            time.sleep(0.3)
        states.append({** (a_final or {}), "session": "A"})
        assert any(x.get("status") == "error" and x.get("error", {}).get("sqlstate") == "40P01" for x in states), states
        _reset(lab)
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def _ensure_queued_packets(n: int = 300):
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path("scripts").resolve()))
    import _db

    cfg = _db.settings()
    import psycopg

    dbname = os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname,
                         user=cfg["user"], password=cfg["password"], autocommit=True) as conn:
        with conn.cursor() as cur:
            # Park every big QUEUED packet so the 20000-byte budget splits
            # over small rows (dispatch stops at the first over-budget row).
            cur.execute("UPDATE packet SET status = 'DELIVERED', delivered_to = 'GS-BOM', delivered_at = now() "
                        "WHERE origin_sat = 'SS-1' AND status = 'QUEUED' AND size_bytes > 500")
            cur.execute("SELECT count(*) FROM packet WHERE origin_sat = 'SS-1' AND status = 'QUEUED' AND size_bytes <= 500")
            have = cur.fetchone()[0]
            need = max(0, n - have)
            for _ in range(need):
                cur.execute("INSERT INTO packet (origin_sat, mode, size_bytes, status) VALUES ('SS-1', 'TTC', 200, 'QUEUED') RETURNING packet_id")
                pid = cur.fetchone()[0]
                cur.execute("INSERT INTO ttc_frame (packet_id, battery_v, temp_c, solar_ma) VALUES (%s, 7.5, 20.0, 300)", (pid,))


def test_tx_skip_locked_disjoint():
    _login("mission_director")
    _ensure_queued_packets(300)
    lab = _open_lab()
    try:
        _reset(lab)
        a = _exec(lab, "A", "SELECT * FROM dispatch_packets('SS-1', 'worker-A', 20000)")
        b = _exec(lab, "B", "SELECT * FROM dispatch_packets('SS-1', 'worker-B', 20000)")
        assert a["status"] == "done" and b["status"] == "done", (a, b)
        ids_a = {r["packet_id"] for r in a["rows"]}
        ids_b = {r["packet_id"] for r in b["rows"]}
        assert ids_a and ids_b, (a, b)
        assert ids_a.isdisjoint(ids_b), (ids_a, ids_b)
        _reset(lab)
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def test_tx_mvcc_and_wal():
    lab = _open_lab()
    try:
        _reset(lab)
        assert _exec(lab, "A", "UPDATE deployer_pod SET temperature_c = COALESCE(temperature_c, 20) + 1 WHERE pod_id = 'POD-1'")["status"] == "done"
        a = _exec(lab, "A", "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-1'")
        b = _exec(lab, "B", "SELECT xmin, xmax, ctid, temperature_c, txid_current() AS txid FROM deployer_pod WHERE pod_id = 'POD-1'")
        assert a["status"] == "done" and b["status"] == "done"
        assert a["rows"][0]["temperature_c"] != b["rows"][0]["temperature_c"]
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        b2 = _exec(lab, "B", "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-1'")
        assert b2["status"] == "done"
        assert _exec(lab, "B", "COMMIT")["status"] == "done"
        # WAL: LSN advances across a 1000-row telemetry transaction.
        before = _exec(lab, "A", "SELECT pg_current_wal_lsn() AS lsn_before")
        assert before["status"] == "done"
        ins = _exec(lab, "A", "INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma) SELECT now() + (g || ' microseconds')::interval, 'SS-1', 7.50, 20.0, 300 FROM generate_series(1, 1000) AS g")
        assert ins["status"] == "done" and ins["rowcount"] == 1000, ins
        assert _exec(lab, "A", "COMMIT")["status"] == "done"
        after = _exec(lab, "A", "SELECT pg_current_wal_lsn() AS lsn_after, pg_wal_lsn_diff(pg_current_wal_lsn(), '%s') AS bytes_diff" % before["rows"][0]["lsn_before"])
        assert after["status"] == "done" and after["rows"][0]["bytes_diff"] > 0
    finally:
        client.delete(f"/api/labs/tx/{lab}")


def test_tx_scenarios_endpoint():
    _login("mission_director")
    r = client.get("/api/labs/tx/scenarios")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    for name in ("lost_update", "non_repeatable_read", "phantom_or_write_skew", "deadlock", "skip_locked", "mvcc", "wal"):
        assert name in data and data[name]["steps"], name


def test_security_matrix_privs():
    _login("mission_director")
    r = client.get("/api/labs/security/matrix")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    cells = {(c["role"], c["object"], c["priv"]): c["has"] for c in data["cells"]}
    assert cells[("student_analyst", "telemetry", "INSERT")] is False
    assert data["columns"]["station_key.secret:bom"] is False
    assert data["columns"]["station_key.key_id:bom"] is True
    assert data["policies"], "expected RLS pg_policies rows"
    assert data["members"], "expected pg_auth_members rows"
    assert r.json()["sql"]


def _try(role: str, action: str):
    _login("mission_director")
    r = client.post("/api/labs/security/try", json={"role": role, "action_key": action})
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_security_try_actions():
    assert _try("mission_director", "read_telemetry")["allowed"] is True
    assert _try("student_analyst", "read_telemetry")["allowed"] is True
    assert _try("ai_router", "read_telemetry")["allowed"] is False
    assert _try("ai_router", "insert_telemetry")["allowed"] is True
    assert _try("mission_director", "insert_telemetry")["allowed"] is True
    assert _try("student_analyst", "insert_telemetry")["allowed"] is False
    assert _try("mission_director", "read_station_secret")["allowed"] is True
    assert _try("station_operator_bom", "read_station_secret")["allowed"] is False
    assert _try("station_operator_bom", "read_station_keyid")["allowed"] is True
    assert _try("student_analyst", "read_station_keyid")["allowed"] is False
    assert _try("mission_director", "read_downlinks")["allowed"] is True
    assert _try("station_operator_bom", "read_downlinks")["allowed"] is True
    assert _try("station_operator_bom", "insert_telecommand_own")["allowed"] is True
    assert _try("station_operator_bom", "insert_telecommand_other")["allowed"] is False
    assert _try("student_analyst", "insert_telecommand_own")["allowed"] is False
    assert _try("mission_director", "execute_decide")["allowed"] is True
    assert _try("student_analyst", "execute_decide")["allowed"] is True
    assert _try("station_operator_bom", "ack_alert")["allowed"] is True
    assert _try("student_analyst", "ack_alert")["allowed"] is False
    assert _try("student_analyst", "update_alert_message")["allowed"] is False
    assert _try("mission_director", "refresh_kpis")["allowed"] is True
    assert _try("student_analyst", "refresh_kpis")["allowed"] is False
    assert _try("mission_director", "grant_chain")["allowed"] is True
    assert _try("student_analyst", "grant_chain")["allowed"] is False


def test_security_audit_director_only():
    _login("mission_director")
    r = client.get("/api/labs/security/audit?limit=5")
    assert r.status_code == 200, r.text
    _login("student_analyst")
    r = client.get("/api/labs/security/audit?limit=5")
    assert r.status_code == 403, r.text


def _plan_nodes(plan: dict) -> list[str]:
    out: list[str] = []

    def _walk(node: dict):
        if not isinstance(node, dict):
            return
        if node.get("Node Type"):
            out.append(node["Node Type"])
        for c in node.get("Plans", []) or []:
            _walk(c)

    _walk((plan or {}).get("Plan", plan or {}))
    return out


def _plan_relations(plan: dict, only_with_rows: bool = False) -> list[str]:
    out: list[str] = []

    def _walk(node: dict):
        if not isinstance(node, dict):
            return
        rel = node.get("Relation Name", "")
        if rel and (not only_with_rows or (node.get("Actual Rows", 0) or 0) > 0):
            out.append(rel)
        for c in node.get("Plans", []) or []:
            _walk(c)

    _walk((plan or {}).get("Plan", plan or {}))
    return out


def test_index_run_and_pruning():
    _login("mission_director")
    r = client.post("/api/labs/index/bulk", json={"rows": 200000})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["inserted"] >= 100000, r.text
    r = client.post("/api/labs/index/run", json={"query_key": "q_brin_range", "index_key": "brin_ts"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    nodes_after = _plan_nodes(data["plan_after"])
    assert any(n in ("Bitmap Heap Scan", "Bitmap Index Scan", "Index Scan", "Index Only Scan") for n in nodes_after), nodes_after
    # btree case: record the outcome (a 7-day range may still seqscan; that is fine).
    r = client.post("/api/labs/index/run", json={"query_key": "q_btree_range", "index_key": "btree_cube_ts"})
    assert r.status_code == 200, r.text
    # Partition pruning: the open-ended 6 h probe can only hold rows in
    # 1-2 daily partitions (future partitions stay empty); count the ones
    # that actually returned rows.
    r = client.post("/api/labs/index/run", json={"query_key": "q_partition_pruning", "index_key": "brin_ts"})
    assert r.status_code == 200, r.text
    rels = [x for x in _plan_relations(r.json()["data"]["plan_after"], only_with_rows=True) if x.startswith("telemetry_")]
    assert len(set(rels)) <= 2, rels
    assert r.json()["sql"]


def test_norm_lossless_anomalies():
    _login("student_analyst")
    r = client.get("/api/labs/norm/lossless")
    assert r.status_code == 200, r.text
    for row in r.json()["data"]:
        assert row["missing"] == 0 and row["spurious"] == 0, row
    r = client.get("/api/labs/norm/anomalies")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["update"] and d["insert"] and d["delete"]
    r = client.get("/api/labs/norm/stages")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["fds"]
    assert r.json()["sql"]


def test_schema_tags():
    _login("mission_director")
    r = client.get("/api/labs/schema")
    assert r.status_code == 200, r.text
    tables = {t["table_name"]: t for t in r.json()["data"]["tables"]}
    assert "supertype" in tables["network_node"]["tags"]
    assert "subtype" in tables["satellite"]["tags"]
    assert "weak" in tables["dt_node"]["tags"]
    assert "partitioned" in tables["telemetry"]["tags"]
    assert r.json()["data"]["mapping_notes"]
    assert r.json()["sql"]
