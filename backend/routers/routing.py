"""Routing: CGR routes, plan, packet routing, queue, pass execution."""
from __future__ import annotations

import datetime

from fastapi import APIRouter, Request
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


@router.get("/api/routing/routes")
def routes(request: Request, origin: str = "SAT-A1", t0: str | None = None, size: int = 4096, max_hops: int = 4):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        t0_dt = datetime.datetime.fromisoformat(t0) if t0 else datetime.datetime.now(datetime.timezone.utc)
        if t0_dt.tzinfo is None:
            t0_dt = t0_dt.replace(tzinfo=datetime.timezone.utc)
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": f"bad t0: {exc}", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        rows = sqlbook.run(
            role, "cgr routes",
            "SELECT * FROM cgr_routes(%s, %s, %s, %s)",
            (origin, t0_dt.isoformat(), size, max_hops),
            exp="Exp 6 - CGR", co="CO3",
        )
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


def _route_bundle(role: str, route_id: int) -> dict:
    route = sqlbook.run(role, "read route", "SELECT * FROM route WHERE route_id = %s", (route_id,), many=False)
    hops = sqlbook.run(
        role, "route detail",
        "SELECT h.route_id, h.hop_no, h.contact_id, h.depart_ts, h.arrive_ts, "
        "c.kind AS contact_kind, c.from_node, c.to_node, c.link_score, "
        "gf.latitude AS from_lat, gf.longitude AS from_lon, "
        "gt.latitude AS to_lat, gt.longitude AS to_lon "
        "FROM route_hop h JOIN contact c ON c.contact_id = h.contact_id "
        "LEFT JOIN ground_station gf ON gf.node_id = c.from_node "
        "LEFT JOIN ground_station gt ON gt.node_id = c.to_node "
        "WHERE h.route_id = %s ORDER BY h.hop_no",
        (route_id,),
    )
    return {"route": route, "hops": hops}


@router.post("/api/routing/plan")
def plan(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    origin = (body or {}).get("origin", "SAT-A1")
    t0 = (body or {}).get("t0")
    size = int((body or {}).get("size", 4096))
    try:
        t0_dt = datetime.datetime.fromisoformat(t0) if t0 else datetime.datetime.now(datetime.timezone.utc)
        if t0_dt.tzinfo is None:
            t0_dt = t0_dt.replace(tzinfo=datetime.timezone.utc)
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": f"bad t0: {exc}", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        rows = sqlbook.run(role, "plan route", "SELECT plan_route(%s, %s, %s) AS route_id", (origin, t0_dt.isoformat(), size))
        rid = rows[0]["route_id"] if rows else None
        if rid is None:
            return sqlbook.envelope({"route": None, "hops": []}, role)
        return sqlbook.envelope(_route_bundle(role, int(rid)), role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/routing/packet/{packet_id}")
def route_packet(request: Request, packet_id: int):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(role, "route packet", "SELECT route_packet(%s) AS route_id", (packet_id,))
        rid = rows[0]["route_id"] if rows else None
        if rid is None:
            return sqlbook.envelope({"route": None, "hops": []}, role)
        return sqlbook.envelope(_route_bundle(role, int(rid)), role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/routing/queue")
def queue(request: Request, sat: str | None = None):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        if sat:
            rows = sqlbook.run(role, "queue by mode", "SELECT * FROM v_queue_by_mode WHERE sat_id = %s", (sat,))
        else:
            rows = sqlbook.run(role, "queue by mode", "SELECT * FROM v_queue_by_mode")
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/pass/execute")
def execute_pass(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    sat = (body or {}).get("sat")
    contact_id = (body or {}).get("contact_id")
    fail = bool((body or {}).get("fail_stage2", False))
    if not sat or contact_id is None:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "sat and contact_id required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        before = sqlbook.run(role, "queue before pass", "SELECT mode, COUNT(*)::int AS packets, COALESCE(SUM(size_bytes),0)::int AS bytes FROM packet WHERE origin_sat = %s AND status = 'QUEUED' GROUP BY mode ORDER BY mode", (sat,))
        stages = sqlbook.run(role, "execute pass", "SELECT * FROM execute_pass(%s, %s, %s)", (sat, int(contact_id), fail), exp="Exp 9 - TCL", co="CO4")
        after = sqlbook.run(role, "queue after pass", "SELECT mode, COUNT(*)::int AS packets, COALESCE(SUM(size_bytes),0)::int AS bytes FROM packet WHERE origin_sat = %s AND status = 'QUEUED' GROUP BY mode ORDER BY mode", (sat,))
        return sqlbook.envelope({"stages": stages, "before": before, "after": after}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
