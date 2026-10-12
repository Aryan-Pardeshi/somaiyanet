"""AI router endpoints."""
from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from .. import session as sess
from .. import sqlbook

router = APIRouter()


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


@router.get("/api/ai/models")
def models(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        mods = sqlbook.run(role, "ai models", "SELECT * FROM ai_model ORDER BY version DESC")
        for m in mods:
            mid = m["model_id"]
            try:
                mets = sqlbook.run(role, f"metrics {mid}", "SELECT * FROM ai_model_metric WHERE model_id = %s ORDER BY class_label", (mid,))
            except Exception:
                mets = []
            m["metrics"] = mets
        return sqlbook.envelope(mods, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/ai/models/{model_id}/tree")
def tree(request: Request, model_id: int):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(role, "dt tree", "SELECT * FROM dt_node WHERE model_id = %s ORDER BY node_id", (model_id,))
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/ai/preview/{sat}")
def preview(request: Request, sat: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        feats = sqlbook.run(role, "features", "SELECT features_for_satellite(%s) AS f", (sat,), many=False)
        f = (feats or {}).get("f")
        prev = sqlbook.run(role, "preview decision", "SELECT * FROM preview_decision(%s)", (sat,), many=False)
        reason = sqlbook.run(role, "rule reason", "SELECT rule_reason(%s::jsonb) AS reason", (json.dumps(f),), many=False)
        return sqlbook.envelope({"preview": prev, "features": f, "rule_reason": (reason or {}).get("reason")}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/ai/whatif")
def whatif(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    features = (body or {}).get("features") or {}
    model_id = (body or {}).get("model_id")
    fj = json.dumps(features)
    try:
        if model_id is None:
            ai = sqlbook.run(role, "ai decide", "SELECT * FROM ai_decide(%s::jsonb)", (fj,), many=False)
        else:
            ai = sqlbook.run(role, "ai decide", "SELECT * FROM ai_decide(%s::jsonb, %s)", (fj, int(model_id)), many=False)
        ai_action = (ai or {}).get("action")
        rule = sqlbook.run(role, "rule action", "SELECT rule_action(%s::jsonb) AS action", (fj,), many=False)
        reason = sqlbook.run(role, "rule reason", "SELECT rule_reason(%s::jsonb) AS reason", (fj,), many=False)
        viol = sqlbook.run(role, "watchdog", "SELECT watchdog_violation(%s::jsonb, %s::router_action) AS violation", (fj, ai_action), many=False)
        viol_full = sqlbook.run(role, "watchdog FULL_DOWNLINK", "SELECT watchdog_violation(%s::jsonb, 'FULL_DOWNLINK'::router_action) AS violation", (fj,), many=False)
        rule_action_val = (rule or {}).get("action")
        return sqlbook.envelope(
            {
                "ai": ai,
                "rule_action": rule_action_val,
                "final_rule": rule_action_val,
                "rule_reason": (reason or {}).get("reason"),
                "watchdog": (viol or {}).get("violation"),
                "watchdog_full": (viol_full or {}).get("violation"),
            },
            role,
        )
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/ai/decide/{sat}")
def decide(request: Request, sat: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        row = sqlbook.run(role, "decide for satellite", "SELECT * FROM decide_for_satellite(%s)", (sat,), many=False)
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/ai/decisions")
def decisions(request: Request, limit: int = Query(50, le=200)):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(role, "decisions", "SELECT * FROM routing_decision ORDER BY decided_at DESC LIMIT %s", (limit,))
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
