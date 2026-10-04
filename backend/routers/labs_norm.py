"""Normalization lab (CO3): stages, anomalies, lossless check."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import session as sess
from .. import sqlbook

router = APIRouter()

STAGES = [
    ("unf", "norm.flight_log_unf"),
    ("1nf", "norm.flight_log_1nf"),
    ("2nf-header", "norm.pass_log"),
    ("2nf-lines", "norm.pass_mode"),
    ("3nf-sat", "norm.sat"),
    ("3nf-pod", "norm.pod"),
    ("3nf-station", "norm.station"),
    ("3nf-operator", "norm.operator"),
    ("3nf-fact", "norm.pass_core"),
    ("bcnf-duty", "norm.duty"),
    ("bcnf-operator-station", "norm.operator_station"),
    ("bcnf-duty-bcnf", "norm.duty_bcnf"),
]


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


@router.get("/api/labs/norm/stages")
def stages(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        out = []
        for stage, tbl in STAGES:
            rows = sqlbook.run(role, f"norm {stage}", f"SELECT * FROM {tbl} LIMIT 50")
            out.append({"stage": stage, "table": tbl, "rows": rows, "count": len(rows)})
        fds = sqlbook.run(role, "norm FDs", "SELECT * FROM norm.fd_catalog()")
        return sqlbook.envelope({"stages": out, "fds": fds}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/labs/norm/anomalies")
def anomalies(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        upd = sqlbook.run(role, "update anomaly", "SELECT * FROM norm.demo_update_anomaly()")
        ins = sqlbook.run(role, "insert anomaly", "SELECT * FROM norm.demo_insert_anomaly()")
        dele = sqlbook.run(role, "delete anomaly", "SELECT * FROM norm.demo_delete_anomaly()")
        return sqlbook.envelope({"update": upd, "insert": ins, "delete": dele}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/labs/norm/lossless")
def lossless(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(role, "lossless check", "SELECT * FROM norm.lossless_check()")
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
