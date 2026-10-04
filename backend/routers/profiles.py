"""Public endpoints: health, profiles, session, stats."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from .. import db as dbmod
from .. import session as sess
from .. import sqlbook

router = APIRouter()

META = {
    "mission_director": {
        "title": "Mission Director",
        "subtitle": "Full control of the mission",
        "accent": "red",
    },
    "station_operator_bom": {
        "title": "Mumbai Station (GS-BOM)",
        "subtitle": "Operate KJSIT Mumbai pass",
        "accent": "blue",
    },
    "station_operator_hel": {
        "title": "Espoo Station (GS-HEL)",
        "subtitle": "Operate ReOrbit Espoo pass",
        "accent": "blue",
    },
    "student_analyst": {
        "title": "Student Analyst",
        "subtitle": "Read-only analysis",
        "accent": "muted",
    },
    "ai_router": {
        "title": "AI Router (spacecraft)",
        "subtitle": "Onboard sensor + router",
        "accent": "green",
    },
}

TABLE_PRIVS = [
    ("telemetry", "SELECT"),
    ("telecommand", "INSERT"),
    ("station_key", "SELECT"),
    ("packet", "SELECT"),
    ("contact", "SELECT"),
    ("satellite", "SELECT"),
]
FUNC_PRIVS = [
    "decide_for_satellite(VARCHAR, TIMESTAMPTZ)",
    "confirm_deployment(VARCHAR, BOOLEAN)",
    "sign_telecommand(VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT)",
]


def _priv_matrix() -> dict:
    out: dict[str, dict] = {}
    for role in sess.VALID_ROLES:
        tbls: dict[str, bool] = {}
        for tbl, priv in TABLE_PRIVS:
            try:
                rows = sqlbook.run(
                    "mission_director",
                    f"profile priv {role} {tbl}",
                    "SELECT has_table_privilege(%s, %s, %s)",
                    (role, tbl, priv),
                    exp="Exp 7 - DCL",
                    co="CO2",
                    superuser=True,
                )
                tbls[f"{tbl}:{priv}"] = bool(rows[0]["has_table_privilege"]) if rows else False
            except Exception:
                tbls[f"{tbl}:{priv}"] = False
        funcs: dict[str, bool] = {}
        for fn in FUNC_PRIVS:
            try:
                rows = sqlbook.run(
                    "mission_director",
                    f"profile func {role} {fn}",
                    "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                    (role, fn),
                    superuser=True,
                )
                funcs[fn] = bool(rows[0]["has_function_privilege"]) if rows else False
            except Exception:
                funcs[fn] = False
        out[role] = {"tables": tbls, "funcs": funcs}
    return out


def _can_list(role: str, matrix: dict) -> list[str]:
    m = matrix.get(role, {"tables": {}, "funcs": {}})
    t = m["tables"]
    f = m["funcs"]
    can: list[str] = []
    if t.get("telemetry:SELECT") and role == "mission_director":
        can.append("everything + GRANT telemetry")
    elif t.get("telemetry:SELECT"):
        can.append("read telemetry")
    if role == "ai_router":
        can.append("INSERT telemetry (write-only sensor)")
    if t.get("telecommand:INSERT"):
        can.append("send telecommands (own station)")
    if t.get("station_key:SELECT"):
        can.append("read station keys (minus secret)")
    elif role == "mission_director":
        can.append("read station secrets")
    if role == "student_analyst":
        can.append("read views, packets, contacts, routes, AI tables")
    if f.get("decide_for_satellite(VARCHAR, TIMESTAMPTZ)"):
        can.append("run AI router decisions")
    if f.get("sign_telecommand(VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT)"):
        can.append("sign telecommands")
    if f.get("confirm_deployment(VARCHAR, BOOLEAN)"):
        can.append("confirm deployments")
    if role == "station_operator_bom":
        can.append("operate GS-BOM")
    if role == "station_operator_hel":
        can.append("operate GS-HEL")
    if not can:
        can = ["limited access"]
    return can


@router.get("/api/health")
def health():
    sqlbook.begin_log()
    try:
        rows = sqlbook.run(
            "mission_director",
            "health version",
            "SELECT version() AS server_version, current_database() AS db",
            superuser=True,
            many=False,
        )
        data = {"ok": True, "db": rows["db"], "server_version": rows["server_version"]}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "error": sqlbook.error_payload(exc),
                "sql": sqlbook.get_log(),
                "role": None,
            },
        )
    return {"data": data, "sql": sqlbook.get_log(), "role": None}


@router.get("/api/profiles")
def profiles():
    sqlbook.begin_log()
    try:
        matrix = _priv_matrix()
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "error": sqlbook.error_payload(exc),
                "sql": sqlbook.get_log(),
                "role": None,
            },
        )
    data = [
        {
            "role": r,
            "title": META[r]["title"],
            "subtitle": META[r]["subtitle"],
            "accent": META[r]["accent"],
            "can": _can_list(r, matrix),
        }
        for r in sess.VALID_ROLES
    ]
    return {"data": data, "sql": sqlbook.get_log(), "role": None}


@router.post("/api/session")
def post_session(body: dict, response: Response):
    sqlbook.begin_log()
    role = (body or {}).get("role")
    if role not in sess.VALID_ROLES:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "NO_PROFILE"}, "sql": sqlbook.get_log(), "role": None},
        )
    # Verify it can actually connect as that role.
    try:
        pool = dbmod.pool_for(role)
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_user")
            conn.commit()
        sqlbook.get_log().append(
            {
                "label": f"session connect as {role}",
                "sql": f"CONNECT AS {role} (SELECT current_user)",
                "exp": "Exp 7 - DCL",
                "co": "CO2",
                "elapsed_ms": 0,
                "rowcount": 1,
            }
        )
    except Exception as exc:
        return JSONResponse(
            status_code=401,
            content={
                "error": sqlbook.error_payload(exc),
                "sql": sqlbook.get_log(),
                "role": None,
            },
        )
    response.set_cookie(
        sess.COOKIE, sess.make_cookie(role), httponly=True, samesite="lax", path="/"
    )
    m = META[role]
    return {
        "data": {"role": role, "title": m["title"], "subtitle": m["subtitle"], "accent": m["accent"]},
        "sql": sqlbook.get_log(),
        "role": role,
    }


@router.get("/api/session")
def get_session(request: Request):
    sqlbook.begin_log()
    sqlbook.get_log().append(
        {"label": "read session cookie", "sql": "-- cookie sn_role", "exp": None, "co": None, "elapsed_ms": 0, "rowcount": 0}
    )
    role = sess.current_role(request)
    if role is None:
        return sess.no_profile()
    m = META[role]
    return {
        "data": {"role": role, "title": m["title"], "subtitle": m["subtitle"], "accent": m["accent"]},
        "sql": sqlbook.get_log(),
        "role": role,
    }


@router.delete("/api/session")
def delete_session(response: Response):
    sqlbook.begin_log()
    sqlbook.get_log().append(
        {"label": "clear session", "sql": "-- clear cookie sn_role", "exp": None, "co": None, "elapsed_ms": 0, "rowcount": 0}
    )
    response.delete_cookie(sess.COOKIE, path="/")
    return {"data": {"ok": True}, "sql": sqlbook.get_log(), "role": None}


@router.get("/api/stats")
def stats():
    sqlbook.begin_log()
    try:
        kpis = sqlbook.run(
            "mission_director", "stats mv_kpis", "SELECT * FROM mv_kpis", superuser=True, many=False,
            exp="Exp 6 - views", co="CO3",
        )
        constellation = sqlbook.run(
            "mission_director", "stats constellation",
            "SELECT * FROM v_constellation_status", superuser=True,
            exp="Exp 6 - views", co="CO3",
        )
        payload_modes = sqlbook.run(
            "mission_director", "stats payload modes",
            "SELECT pm.mode, pm.priority, pm.bitrate_bps, pm.tx_power_mw, pm.description, "
            "COUNT(p.packet_id)::int AS packets "
            "FROM payload_mode pm LEFT JOIN packet p ON p.mode = pm.mode GROUP BY pm.mode, pm.priority, pm.bitrate_bps, pm.tx_power_mw, pm.description ORDER BY pm.priority",
            superuser=True,
        )
        stations = sqlbook.run(
            "mission_director", "stats stations",
            "SELECT g.node_id AS id, n.display_name AS name, g.city, g.country, "
            "g.latitude AS lat, g.longitude AS lng, g.altitude_m, g.min_elevation_deg, g.is_primary AS primary "
            "FROM ground_station g JOIN network_node n ON n.node_id = g.node_id ORDER BY g.node_id",
            superuser=True,
        )
        passes = sqlbook.run(
            "mission_director", "stats passes",
            "SELECT contact_id AS pass_id, from_node AS sat_id, to_node AS station_id, "
            "start_ts, end_ts, link_score, duration_s FROM contact "
            "WHERE kind='DOWNLINK' AND start_ts BETWEEN now() AND now() + INTERVAL '24 hours' "
            "ORDER BY start_ts LIMIT 50",
            superuser=True,
        )
        data = {
            "source": "database",
            "kpis": kpis,
            "satellites": constellation,
            "payload_modes": payload_modes,
            "stations": stations,
            "passes": passes,
            "totals": {
                "sats_total": (kpis or {}).get("sats_total"),
                "packets_queued": (kpis or {}).get("packets_queued"),
                "contacts_next_24h": (kpis or {}).get("contacts_next_24h"),
            },
        }
        return {"data": data, "sql": sqlbook.get_log(), "role": None}
    except Exception:
        # Fall back to the mock file with source mock.
        try:
            p = Path(__file__).resolve().parent.parent.parent / "web" / "public" / "data" / "stats.json"
            doc = json.loads(p.read_text(encoding="utf-8"))
            doc["source"] = "mock"
            return {"data": doc, "sql": sqlbook.get_log(), "role": None}
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": None},
            )
