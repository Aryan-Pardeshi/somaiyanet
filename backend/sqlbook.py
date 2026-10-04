"""sqlbook: run SQL as a role, return dicts, record display SQL per request."""
from __future__ import annotations

import contextvars
import datetime
import decimal
import time
from typing import Any

import psycopg
from psycopg import errors as pg_errors

from . import db as dbmod

_current_log: contextvars.ContextVar[list | None] = contextvars.ContextVar(
    "sn_sql_log", default=None
)


def begin_log() -> list:
    log: list = []
    _current_log.set(log)
    return log


def get_log() -> list:
    log = _current_log.get()
    return log if log is not None else []


def _literal(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, decimal.Decimal):
        return str(float(v))
    if isinstance(v, (datetime.datetime, datetime.date)):
        return f"'{v.isoformat()}'"
    if isinstance(v, (bytes, bytearray, memoryview)):
        b = bytes(v)
        return f"'\\x{b.hex()}'"
    if isinstance(v, (list, dict)):
        import json as _json

        s = _json.dumps(v).replace("'", "''")
        return f"'{s}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def display_sql(sql: str, params: tuple | list = ()) -> str:
    """Inline %s params for display only (never executed)."""
    if not params:
        return sql
    out = sql
    for p in params:
        out = out.replace("%s", _literal(p), 1)
    return out


def convert(value: Any) -> Any:
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        iso = value.isoformat()
        return iso
    if isinstance(value, datetime.timedelta):
        return value.total_seconds()
    if isinstance(value, memoryview):
        return bytes(value).hex()
    if isinstance(value, (bytes, bytearray)):
        try:
            return bytes(value).hex()
        except Exception:
            return str(value)
    if isinstance(value, list):
        return [convert(v) for v in value]
    if isinstance(value, tuple):
        return [convert(v) for v in value]
    return value


def convert_row(row: dict) -> dict:
    return {k: convert(v) for k, v in row.items()}


def error_payload(exc: Exception) -> dict:
    sqlstate = getattr(exc, "sqlstate", None)
    msg = str(getattr(exc, "diag", None) and exc.diag.message_primary or exc).strip()
    diag = getattr(exc, "diag", None)
    return {
        "sqlstate": sqlstate,
        "message": msg[:2000],
        "detail": (diag.message_detail if diag else None),
        "hint": (diag.message_hint if diag else None),
    }


def status_for(exc: Exception) -> int:
    sqlstate = getattr(exc, "sqlstate", None) or ""
    if sqlstate == "42501":
        return 403
    if sqlstate.startswith("23"):
        return 409
    if sqlstate in ("P0001",) or sqlstate.startswith("28"):
        return 422
    if sqlstate in ("40001", "40P01"):
        return 409
    return 400


def run(
    role: str,
    label: str,
    sql: str,
    params: tuple | list = (),
    exp: str | None = None,
    co: str | None = None,
    many: bool = True,
    superuser: bool = False,
):
    """Execute as role (or superuser), return rows as dicts, log display SQL."""
    t0 = time.perf_counter()
    pool = dbmod.super_pool() if superuser else dbmod.pool_for(role)
    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute(sql, params)
                rows = None
                rowcount = cur.rowcount
                if cur.description is not None:
                    rows = cur.fetchall() if many else cur.fetchone()
                    if rows is None:
                        rows = [] if many else None
                conn.commit()
    except Exception:
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        log = _current_log.get()
        if log is not None:
            log.append(
                {
                    "label": label,
                    "sql": display_sql(sql, params),
                    "exp": exp,
                    "co": co,
                    "elapsed_ms": elapsed_ms,
                    "rowcount": 0,
                }
            )
        raise
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    if many:
        n = len(rows) if rows else 0
    else:
        n = 1 if rows else 0
    log = _current_log.get()
    if log is not None:
        log.append(
            {
                "label": label,
                "sql": display_sql(sql, params),
                "exp": exp,
                "co": co,
                "elapsed_ms": elapsed_ms,
                "rowcount": rowcount if rowcount is not None and rowcount >= 0 else n,
            }
        )
    if many:
        return [convert_row(r) for r in (rows or [])]
    if rows is None:
        return None
    return convert_row(rows)


def run_one(role, label, sql, params=(), exp=None, co=None, superuser=False):
    return run(role, label, sql, params, exp, co, many=False, superuser=superuser)


def envelope(data: Any, role: str | None) -> dict:
    return {"data": data, "sql": get_log(), "role": role}
