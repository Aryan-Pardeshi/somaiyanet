"""Mission reads: constellation, stations, contacts, kpis, alerts."""
from __future__ import annotations

import datetime

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


@router.get("/api/constellation")
def constellation(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(
            role,
            "constellation status",
            "SELECT vc.*, s.tle_line1, s.tle_line2 "
            "FROM v_constellation_status vc JOIN satellite s ON s.node_id = vc.sat_id "
            "ORDER BY vc.sat_id",
            exp="Exp 6 - views",
            co="CO3",
        )
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.get("/api/stations")
def stations(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(
            role,
            "stations",
            "SELECT g.*, n.display_name, n.callsign, n.kind, n.created_at "
            "FROM ground_station g JOIN network_node n ON n.node_id = g.node_id "
            "ORDER BY g.node_id",
        )
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.get("/api/contacts")
def contacts(
    request: Request,
    at: str | None = None,
    window_min: int = 90,
):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        at_dt = datetime.datetime.fromisoformat(at) if at else datetime.datetime.now(datetime.timezone.utc)
        if at_dt.tzinfo is None:
            at_dt = at_dt.replace(tzinfo=datetime.timezone.utc)
    except Exception as exc:
        sqlbook.begin_log()
        return JSONResponse(
            status_code=400,
            content={"error": {"sqlstate": None, "message": f"bad at: {exc}", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role},
        )
    try:
        rows = sqlbook.run(
            role,
            "contacts window",
            "SELECT contact_id, kind, from_node, to_node, start_ts, end_ts, duration_s, "
            "rate_bps, link_score, min_range_km, max_elevation_deg FROM contact "
            "WHERE start_ts <= %s::timestamptz + make_interval(mins => %s::int) "
            "AND end_ts >= %s::timestamptz - INTERVAL '5 minutes' ORDER BY start_ts LIMIT 500",
            (at_dt.isoformat(), int(window_min), at_dt.isoformat()),
        )
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.get("/api/kpis")
def kpis(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        row = sqlbook.run(role, "read mv_kpis", "SELECT * FROM mv_kpis", many=False)
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.post("/api/kpis/refresh")
def kpis_refresh(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        sqlbook.run(role, "refresh mv_kpis concurrently", "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis")
        row = sqlbook.run(role, "read mv_kpis", "SELECT * FROM mv_kpis", many=False)
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.get("/api/alerts")
def alerts(request: Request, limit: int = Query(50, le=200)):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(
            role, "list alerts", "SELECT * FROM alert ORDER BY raised_at DESC LIMIT %s", (limit,)
        )
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


@router.post("/api/alerts/{alert_id}/ack")
def ack_alert(request: Request, alert_id: int):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        row = sqlbook.run(
            role,
            "ack alert",
            "UPDATE alert SET acknowledged = TRUE WHERE alert_id = %s RETURNING *",
            (alert_id,),
            many=False,
        )
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )
