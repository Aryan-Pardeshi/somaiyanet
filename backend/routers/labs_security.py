"""Security lab (Exp 7): privilege matrix, canned try-actions, audit log."""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
import _db  # noqa: E402

from .. import session as sess
from .. import sqlbook

router = APIRouter()

ROLES = ["mission_director", "station_operator_bom", "station_operator_hel", "student_analyst", "ai_router"]

OBJECTS = [
    "telemetry", "packet", "ttc_frame", "sstv_image", "voice_frame", "contact",
    "route", "route_hop", "satellite", "ground_station", "network_node",
    "deployer_pod", "telecommand", "station_key", "alert", "audit_log",
    "ai_model", "dt_node", "ai_model_metric", "routing_decision",
    "mv_kpis", "lab_account",
]

FUNCS = [
    "cgr_routes(VARCHAR, TIMESTAMPTZ, INT, INT, INT)",
    "plan_route(VARCHAR, TIMESTAMPTZ, INT)",
    "dispatch_packets(VARCHAR, TEXT, INT)",
    "route_packet(BIGINT)",
    "decide_for_satellite(VARCHAR, TIMESTAMPTZ)",
    "preview_decision(VARCHAR)",
    "sign_telecommand(VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT)",
    "ai_decide(JSONB, INT)",
    "rule_action(JSONB)",
    "bench_apply(TEXT)",
]


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


def _as_role(role: str, sql: str, params=()):
    """Run one statement as `role` in a rolled-back txn; return (ok, payload)."""
    import psycopg

    cfg = _db.settings()
    import os as _os

    dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    try:
        with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname,
                             user=role, password=_db.role_password(role),
                             autocommit=False, application_name=f"somaiyanet:lab:{role}") as conn:
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute(sql, params)
                rows = None
                if cur.description is not None:
                    rows = cur.fetchall()
                # Roll back on purpose: try-actions must not change data.
                conn.rollback()
        return True, [sqlbook.convert_row(r) for r in (rows or [])]
    except Exception as exc:  # noqa: BLE001
        return False, {"sqlstate": getattr(exc, "sqlstate", None), "message": str(exc)[:1000]}


@router.get("/api/labs/security/matrix")
def matrix(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        cells = []
        for r in ROLES:
            for tbl in OBJECTS:
                for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                    row = sqlbook.run("mission_director", f"matrix {r} {tbl} {priv}",
                                      "SELECT has_table_privilege(%s, %s, %s) AS v", (r, tbl, priv),
                                      superuser=True, many=False)
                    cells.append({"role": r, "object": tbl, "priv": priv, "has": bool((row or {}).get("v"))})
        for r in ROLES:
            for fn in FUNCS:
                try:
                    row = sqlbook.run("mission_director", f"matrix fn {r} {fn}",
                                      "SELECT has_function_privilege(%s, %s, 'EXECUTE') AS v", (r, fn),
                                      superuser=True, many=False)
                    cells.append({"role": r, "object": fn, "priv": "EXECUTE", "has": bool((row or {}).get("v"))})
                except Exception:
                    cells.append({"role": r, "object": fn, "priv": "EXECUTE", "has": False})
        col_secret = sqlbook.run("mission_director", "col secret bom",
                                 "SELECT has_column_privilege(%s, %s, %s, %s) AS v",
                                 ("station_operator_bom", "station_key", "secret", "SELECT"),
                                 superuser=True, many=False)
        col_keyid = sqlbook.run("mission_director", "col keyid bom",
                                "SELECT has_column_privilege(%s, %s, %s, %s) AS v",
                                ("station_operator_bom", "station_key", "key_id", "SELECT"),
                                superuser=True, many=False)
        members = sqlbook.run("mission_director", "role members",
                              "SELECT r.rolname AS role, m.rolname AS member FROM pg_auth_members am "
                              "JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member "
                              "ORDER BY 1, 2", superuser=True)
        policies = sqlbook.run("mission_director", "rls policies",
                               "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check "
                               "FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname",
                               superuser=True)
        return sqlbook.envelope(
            {
                "roles": ROLES, "objects": OBJECTS, "funcs": FUNCS, "cells": cells,
                "columns": {
                    "station_key.secret:bom": bool((col_secret or {}).get("v")),
                    "station_key.key_id:bom": bool((col_keyid or {}).get("v")),
                },
                "members": members, "policies": policies,
            },
            role,
        )
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


ACTIONS = [
    "read_telemetry", "insert_telemetry", "read_station_secret", "read_station_keyid",
    "read_downlinks", "insert_telecommand_own", "insert_telecommand_other",
    "execute_decide", "ack_alert", "update_alert_message", "refresh_kpis", "grant_chain",
]


def _action_sql(action: str, role: str):
    own_station = "GS-BOM" if role == "station_operator_bom" else "GS-HEL" if role == "station_operator_hel" else "GS-BOM"
    if action == "read_telemetry":
        return "SELECT sat_id, ts, battery_v FROM telemetry ORDER BY ts DESC LIMIT 5", ()
    if action == "insert_telemetry":
        # Plain INSERT (no RETURNING): ai_router is write-only by design.
        return ("INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma) "
                "VALUES (now(), 'SAT-A1', 7.50, 20.0, 300)", ())
    if action == "read_station_secret":
        return "SELECT station_id, secret FROM station_key LIMIT 2", ()
    if action == "read_station_keyid":
        return "SELECT station_id, key_id, rotated_at FROM station_key LIMIT 6", ()
    if action == "read_downlinks":
        return ("SELECT to_node, count(*)::int AS legs FROM contact "
                "WHERE kind = 'DOWNLINK' GROUP BY to_node ORDER BY to_node", ())
    if action == "insert_telecommand_own":
        return ("INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac) "
                "VALUES (%s, 'SAT-A1', 'PING', '{}', 990001, '\\x00') RETURNING cmd_id",
                (own_station,))
    if action == "insert_telecommand_other":
        other = "GS-HEL" if own_station == "GS-BOM" else "GS-BOM"
        return ("INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac) "
                "VALUES (%s, 'SAT-A1', 'PING', '{}', 990002, '\\x00') RETURNING cmd_id",
                (other,))
    if action == "execute_decide":
        return "SELECT * FROM preview_decision('SAT-A1')", ()
    if action == "ack_alert":
        return ("UPDATE alert SET acknowledged = TRUE "
                "WHERE alert_id = (SELECT min(alert_id) FROM alert) RETURNING alert_id", ())
    if action == "update_alert_message":
        return ("UPDATE alert SET message = 'lab probe' "
                "WHERE alert_id = (SELECT min(alert_id) FROM alert) RETURNING alert_id", ())
    if action == "refresh_kpis":
        return "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis", ()
    if action == "grant_chain":
        return "GRANT SELECT ON telemetry TO student_analyst WITH GRANT OPTION", ()
    return None


@router.post("/api/labs/security/try")
def try_action(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    target = (body or {}).get("role")
    action = (body or {}).get("action_key")
    if target not in ROLES or action not in ACTIONS:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "role and action_key required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        if action in ("insert_telecommand_own", "insert_telecommand_other"):
            # Two-step as the role: sign via the HSM function, then INSERT.
            # A bad-signature path is never taken here; errors mean denial.
            import time as _time

            import psycopg

            cfg = _db.settings()
            import os as _os

            dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
            own = "GS-BOM" if target == "station_operator_bom" else "GS-HEL" if target == "station_operator_hel" else "GS-BOM"
            station = own if action == "insert_telecommand_own" else ("GS-HEL" if own == "GS-BOM" else "GS-BOM")
            nonce = int(_time.time() * 1000) % 2000000000 + (1 if action == "insert_telecommand_own" else 2)
            try:
                with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname,
                                     user=target, password=_db.role_password(target),
                                     autocommit=False, application_name=f"somaiyanet:lab:{target}") as conn:
                    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                        cur.execute("SELECT sign_telecommand(%s, %s, 'PING', '{}', %s) AS sig",
                                    (station, "SAT-A1", nonce))
                        sig = cur.fetchone()["sig"]
                        cur.execute("INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac) "
                                    "VALUES (%s, 'SAT-A1', 'PING', '{}', %s, %s) RETURNING cmd_id",
                                    (station, nonce, sig))
                        rows = cur.fetchall()
                    conn.rollback()
                ok, payload = True, [sqlbook.convert_row(r) for r in rows]
            except Exception as exc:  # noqa: BLE001
                ok, payload = False, {"sqlstate": getattr(exc, "sqlstate", None), "message": str(exc)[:1000]}
            sqlbook.get_log().append({"label": f"security try {target}:{action}", "sql": f"-- {target} attempts {action}",
                                      "exp": "Exp 7 - DCL", "co": "CO2", "elapsed_ms": 0, "rowcount": 0})
            return sqlbook.envelope({"role": target, "action": action, "allowed": ok, "result": payload if ok else None, "error": None if ok else payload}, role)
        if action == "grant_chain":
            # Director demonstrates GRANT ... WITH GRANT OPTION then revokes it.
            if target != "mission_director":
                # A bare GRANT can no-op when the grantor merely holds the
                # privilege, so probe the grant option instead: only a role
                # holding SELECT ... WITH GRANT OPTION may run the chain.
                ok2, res2 = _as_role(target, "SELECT EXISTS(SELECT 1 FROM information_schema.role_table_grants AS g "
                                             "WHERE g.table_name = 'telemetry' AND g.privilege_type = 'SELECT' "
                                             "AND g.is_grantable = 'YES' "
                                             "AND pg_has_role(current_user, g.grantee, 'MEMBER')) AS can_grant")
                can = bool((res2[0] or {}).get("can_grant")) if ok2 and res2 else False
                ok, payload = (True, {"grant_option": True}) if can else (
                    False, {"sqlstate": "42501", "message": "permission denied: no GRANT OPTION on telemetry"})
            else:
                import psycopg

                cfg = _db.settings()
                import os as _os

                dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
                try:
                    with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname,
                                         user=target, password=_db.role_password(target),
                                         autocommit=True) as conn:
                        with conn.cursor() as cur:
                            cur.execute("GRANT SELECT ON telemetry TO student_analyst WITH GRANT OPTION")
                            cur.execute("SELECT has_table_privilege('student_analyst', 'telemetry', 'SELECT')")
                            granted = cur.fetchone()[0]
                            cur.execute("REVOKE SELECT ON telemetry FROM student_analyst")
                    ok, payload = True, {"granted_then_revoked": True, "analyst_had_select": bool(granted)}
                except Exception as exc:  # noqa: BLE001
                    ok, payload = False, {"sqlstate": getattr(exc, "sqlstate", None), "message": str(exc)[:1000]}
        else:
            spec = _action_sql(action, target)
            assert spec is not None
            ok, payload = _as_role(target, spec[0], spec[1])
        sqlbook.get_log().append({"label": f"security try {target}:{action}", "sql": f"-- {target} attempts {action}",
                                  "exp": "Exp 7 - DCL", "co": "CO2", "elapsed_ms": 0, "rowcount": 0})
        return sqlbook.envelope({"role": target, "action": action, "allowed": ok, "result": payload if ok else None, "error": None if ok else payload}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/labs/security/audit")
def audit(request: Request, limit: int = 50):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        # As the cookie role: Postgres denies non-directors via GRANTs.
        rows = sqlbook.run(role, "audit log", "SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT %s", (min(limit, 200),))
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
