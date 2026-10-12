"""Labs acceptance (brief 10a). SOMAIYANET_DB=somaiyanet_w10, SIMULATOR=0."""
from __future__ import annotations

import os

os.environ.setdefault("SOMAIYANET_DB", "somaiyanet_w10")
os.environ["SIMULATOR"] = "0"

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def _login(role: str):
    r = client.post("/api/session", json={"role": role})
    assert r.status_code == 200, r.text
    return r


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
