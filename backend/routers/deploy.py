"""Deploy demo: snapshots, signals, confirm with ROLLED_BACK logging."""
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


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


def _snapshot(role: str, pod: str) -> dict:
    pod_row = sqlbook.run(role, "deploy pod before/after", "SELECT * FROM deployer_pod WHERE pod_id = %s", (pod,), many=False)
    sat_row = sqlbook.run(role, "deploy sat before/after", "SELECT node_id, state, pod_id FROM satellite WHERE pod_id = %s", (pod,), many=False)
    return {"pod": pod_row, "sat": sat_row}


@router.get("/api/deploy/{pod}")
def get_deploy(request: Request, pod: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        pod_row = sqlbook.run(role, "deploy pod", "SELECT * FROM deployer_pod WHERE pod_id = %s", (pod,), many=False)
        events = sqlbook.run(role, "deploy events", "SELECT * FROM deployment_event WHERE pod_id = %s ORDER BY seq", (pod,))
        sat = sqlbook.run(role, "deploy sat", "SELECT node_id, state, pod_id FROM satellite WHERE pod_id = %s", (pod,), many=False)
        logs = sqlbook.run(role, "deploy log", "SELECT * FROM deployment_log WHERE pod_id = %s ORDER BY log_id DESC LIMIT 10", (pod,))
        return sqlbook.envelope({"pod": pod_row, "events": events, "satellite": sat, "log": logs}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/deploy/{pod}/signal")
def post_signal(request: Request, pod: str, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    signal = (body or {}).get("signal")
    ok = (body or {}).get("ok", True)
    value = (body or {}).get("value")
    if not signal:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "signal required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        rows = sqlbook.run(role, "record deploy signal", "SELECT record_deploy_signal(%s, %s::deploy_signal, %s, %s) AS seq", (pod, signal, bool(ok), value))
        return sqlbook.envelope(rows[0] if rows else {"seq": None}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/deploy/{pod}/confirm")
def post_confirm(request: Request, pod: str, body: dict | None = None):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    simulate = bool((body or {}).get("simulate_failure", False))
    try:
        before = _snapshot(role, pod)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
    # CALL on an autocommit connection as the role (procedures COMMIT internally).
    import psycopg

    cfg = _db.settings()
    import os as _os

    dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    try:
        with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname, user=role, password=_db.role_password(role), autocommit=True, application_name=f"somaiyanet:{role}") as conn:
            with conn.cursor() as cur:
                cur.execute("CALL confirm_deployment(%s, %s)", (pod, simulate))
        sqlbook.get_log().append({"label": "confirm deployment", "sql": sqlbook.display_sql("CALL confirm_deployment(%s, %s)", (pod, simulate)), "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
    except Exception as exc:
        # Separate transaction for the ROLLED_BACK audit row (survives rollback).
        try:
            sqlbook.run("mission_director", "log rolled back", "INSERT INTO deployment_log (pod_id, action, outcome, detail) VALUES (%s, 'CONFIRM_DEPLOYMENT', 'ROLLED_BACK', %s)", (pod, str(exc)[:500]), superuser=True)
        except Exception:
            pass
        try:
            after = _snapshot(role, pod)
        except Exception:
            after = None
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role, "data": {"before": before, "after": after}},
        )
    try:
        after = _snapshot(role, pod)
        log = sqlbook.run(role, "deploy log latest", "SELECT * FROM deployment_log WHERE pod_id = %s ORDER BY log_id DESC LIMIT 1", (pod,), many=False)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
    return sqlbook.envelope({"before": before, "after": after, "log": log}, role)


@router.post("/api/deploy/reset")
def post_reset(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    import psycopg

    cfg = _db.settings()
    import os as _os

    dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    try:
        with psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname, user=role, password=_db.role_password(role), autocommit=True, application_name=f"somaiyanet:{role}") as conn:
            with conn.cursor() as cur:
                cur.execute("CALL reset_deploy_demo()")
        sqlbook.get_log().append({"label": "reset deploy demo", "sql": "CALL reset_deploy_demo()", "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
        return sqlbook.envelope({"ok": True}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
