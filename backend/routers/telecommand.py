"""Telecommands: sign (or forge) then INSERT; RLS + HMAC enforced by Postgres."""
from __future__ import annotations

import json
import os
import time

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


@router.get("/api/telecommand")
def list_tc(request: Request, limit: int = Query(50, le=200)):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        rows = sqlbook.run(role, "list telecommands", "SELECT * FROM telecommand ORDER BY issued_at DESC LIMIT %s", (limit,))
        return sqlbook.envelope(rows, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/telecommand")
def post_tc(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    station = (body or {}).get("station")
    sat = (body or {}).get("sat")
    opcode = (body or {}).get("opcode")
    args = (body or {}).get("args") or {}
    forge = bool((body or {}).get("forge", False))
    if not station or not sat or not opcode:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "station, sat, opcode required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    nonce = int(time.time() * 1000)
    args_json = json.dumps(args, separators=(",", ":"), sort_keys=False)
    # args::text must match exactly what the trigger recomputes: args::text of the JSONB value.
    # json.dumps with default formatting matches Postgres jsonb text for simple dicts.
    try:
        if forge:
            hmac_hex = os.urandom(32).hex()
            sqlbook.get_log().append({"label": "forge hmac", "sql": "-- forged random hmac (no sign_telecommand call)", "exp": "Exp 7 - DCL", "co": "CO2", "elapsed_ms": 0, "rowcount": 0})
            sig_bytes_hex = hmac_hex
            use_decode = True
        else:
            sig = sqlbook.run(role, "sign telecommand", "SELECT sign_telecommand(%s, %s, %s, %s::jsonb, %s) AS sig", (station, sat, opcode, args_json, nonce), many=False, exp="Exp 7 - DCL", co="CO2")
            sig_bytes_hex = sig["sig"] if sig else None
            use_decode = False
        if use_decode:
            row = sqlbook.run(
                role, "insert telecommand",
                "INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac) "
                "VALUES (%s, %s, %s, %s::jsonb, %s, decode(%s, 'hex')) RETURNING *, encode(hmac, 'hex') AS hmac_hex",
                (station, sat, opcode, args_json, nonce, sig_bytes_hex),
                many=False,
            )
        else:
            # sign_telecommand returns BYTEA hex via convert(); insert it directly.
            row = sqlbook.run(
                role, "insert telecommand",
                "INSERT INTO telecommand (station_id, sat_id, opcode, args, nonce, hmac) "
                "VALUES (%s, %s, %s, %s::jsonb, %s, decode(%s, 'hex')) RETURNING *, encode(hmac, 'hex') AS hmac_hex",
                (station, sat, opcode, args_json, nonce, sig_bytes_hex),
                many=False,
            )
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
