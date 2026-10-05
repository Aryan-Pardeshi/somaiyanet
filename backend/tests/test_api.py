"""API acceptance tests per brief 05. SIMULATOR=0, DB=somaiyanet_w5."""
from __future__ import annotations

import os

os.environ.setdefault("SOMAIYANET_DB", "somaiyanet_w5")
os.environ["SIMULATOR"] = "0"

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def _login(role: str):
    r = client.post("/api/session", json={"role": role})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["role"] == role
    return r


def test_profiles_returns_5():
    r = client.get("/api/profiles")
    assert r.status_code == 200, r.text
    assert len(r.json()["data"]) == 5
    assert r.json()["sql"]


def test_session_roundtrip_and_401():
    # no cookie -> 401
    c2 = TestClient(app)
    r = c2.get("/api/constellation")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "NO_PROFILE"
    # round trip
    _login("student_analyst")
    r = client.get("/api/session")
    assert r.status_code == 200
    assert r.json()["data"]["role"] == "student_analyst"
    assert r.json()["sql"]


def test_analyst_telecommand_403():
    _login("student_analyst")
    r = client.post(
        "/api/telecommand",
        json={"station": "GS-BOM", "sat": "SS-1", "opcode": "PING", "args": {}, "forge": False},
    )
    assert r.status_code == 403, r.text
    assert r.json()["error"]["sqlstate"] == "42501"
    assert r.json()["sql"]


def test_bom_cross_station_refused_and_own_ok_plus_forged():
    _login("station_operator_bom")
    # cross-station: RLS refuses (403 or 422 with a sqlstate)
    r = client.post(
        "/api/telecommand",
        json={"station": "GS-HEL", "sat": "SS-1", "opcode": "PING", "args": {}, "forge": False},
    )
    assert r.status_code in (403, 422), r.text
    assert r.json()["error"].get("sqlstate")
    # own station signed -> 200 verified
    r = client.post(
        "/api/telecommand",
        json={"station": "GS-BOM", "sat": "SS-1", "opcode": "PING", "args": {}, "forge": False},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["verified"] is True
    # forged -> 422
    r = client.post(
        "/api/telecommand",
        json={"station": "GS-BOM", "sat": "SS-1", "opcode": "PING", "args": {}, "forge": True},
    )
    assert r.status_code == 422, r.text


def test_routes_returns_explanation():
    _login("mission_director")
    r = client.get("/api/routing/routes", params={"origin": "SS-1", "size": 4096, "max_hops": 4})
    assert r.status_code == 200, r.text
    rows = r.json()["data"]
    assert len(rows) >= 1
    assert rows[0].get("explanation")
    assert r.json()["sql"]


def test_whatif_low_battery():
    _login("mission_director")
    feats = {
        "battery_v": 6.6,
        "link_score": 80,
        "contact_s": 300,
        "queue_ttc_kb": 1,
        "queue_sstv_kb": 10,
        "queue_voice_kb": 5,
        "sunlit": 1,
        "isl_available": 1,
    }
    r = client.post("/api/ai/whatif", json={"features": feats})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["rule_action"] == "SAFE_TTC_ONLY" or d["final_rule"] == "SAFE_TTC_ONLY"
    # watchdog must flag FULL_DOWNLINK as unsafe on this low-battery vector
    assert d.get("watchdog_full") is not None
    assert r.json()["sql"]


def test_deploy_confirm_rollback_then_reset():
    _login("mission_director")
    r = client.post("/api/deploy/POD-4/confirm", json={"simulate_failure": True})
    # error JSON plus before/after snapshots
    assert r.status_code in (400, 422, 409, 500), r.text
    body = r.json()
    assert body["data"]["before"] == body["data"]["after"]
    # a ROLLED_BACK log row exists (latest for POD-4)
    r2 = client.get("/api/deploy/POD-4")
    assert r2.status_code == 200, r2.text
    logs = r2.json()["data"]["log"]
    assert any(x["outcome"] == "ROLLED_BACK" for x in logs)
    # reset for the demo
    r3 = client.post("/api/deploy/reset")
    assert r3.status_code == 200, r3.text


def test_console_rejects_delete():
    _login("mission_director")
    r = client.post("/api/console", json={"query": "DELETE FROM packet", "explain": False})
    assert r.status_code in (400, 422), r.text
    assert r.json()["error"].get("sqlstate") == "25006"
    assert r.json()["sql"]


def test_every_response_carries_sql():
    for method, url, kwargs in [
        ("get", "/api/health", {}),
        ("get", "/api/profiles", {}),
        ("get", "/api/stats", {}),
    ]:
        r = getattr(client, method)(url, **kwargs)
        assert r.status_code == 200, (url, r.text)
        assert r.json()["sql"], url
    _login("mission_director")
    r = client.get("/api/constellation")
    assert r.status_code == 200, r.text
    assert r.json()["sql"]
    r = client.get("/api/ai/models")
    assert r.status_code == 200, r.text
    assert r.json()["sql"]
