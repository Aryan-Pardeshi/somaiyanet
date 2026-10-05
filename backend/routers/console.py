"""SQL console: read-only transaction + presets."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import db as dbmod
from .. import session as sess
from .. import sqlbook

router = APIRouter()


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


def _has_semicolon_outside_quotes(q: str) -> bool:
    s = q.strip()
    # Allow one trailing semicolon.
    if s.endswith(";"):
        s = s[:-1]
    in_single = False
    in_double = False
    i = 0
    while i < len(s):
        c = s[i]
        if in_single:
            if c == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    i += 2
                    continue
                in_single = False
        elif in_double:
            if c == '"':
                if i + 1 < len(s) and s[i + 1] == '"':
                    i += 2
                    continue
                in_double = False
        else:
            if c == "'":
                in_single = True
            elif c == '"':
                in_double = True
            elif c == ";":
                return True
        i += 1
    return False


@router.post("/api/console")
def console(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    query = (body or {}).get("query", "")
    explain = bool((body or {}).get("explain", False))
    if not query or not query.strip():
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "query required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    if _has_semicolon_outside_quotes(query):
        sqlbook.get_log().append({"label": "console reject multi-statement", "sql": query[:500], "exp": None, "co": None, "elapsed_ms": 0, "rowcount": 0})
        return JSONResponse(status_code=422, content={"error": {"sqlstate": "42601", "message": "multiple statements rejected", "detail": None, "hint": "Send one statement at a time."}, "sql": sqlbook.get_log(), "role": role})
    sql_text = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}" if explain else query
    pool = dbmod.pool_for(role)
    try:
        with pool.connection() as conn:
            conn.execute("BEGIN READ ONLY")
            try:
                conn.execute("SET LOCAL statement_timeout = '5s'")
                with conn.cursor() as cur:
                    cur.execute(sql_text)
                    cols = [d[0] for d in cur.description] if cur.description else []
                    fetched = cur.fetchall() if cur.description else []
                    rowcount = cur.rowcount
                conn.execute("ROLLBACK")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise
        # Convert rows (tuples) to dicts.
        import datetime as _dt
        import decimal as _dec

        def _conv(v):
            if isinstance(v, _dec.Decimal):
                return float(v)
            if isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
                return v.isoformat()
            if isinstance(v, _dt.timedelta):
                return v.total_seconds()
            if isinstance(v, memoryview):
                return bytes(v).hex()
            if isinstance(v, (bytes, bytearray)):
                return bytes(v).hex()
            return v

        rows = [dict(zip(cols, [_conv(v) for v in r])) for r in fetched[:500]]
        plan = None
        if explain and rows:
            first_key = cols[0] if cols else None
            plan = rows[0].get(first_key) if first_key else None
        sqlbook.get_log().append({"label": "console query", "sql": sql_text[:2000], "exp": "Exp 4-9", "co": "CO1-3", "elapsed_ms": 0, "rowcount": rowcount if rowcount and rowcount >= 0 else len(rows)})
        return sqlbook.envelope({"columns": cols, "rows": rows, "rowcount": rowcount, "plan": plan}, role)
    except Exception as exc:
        sqlbook.get_log().append({"label": "console query (failed)", "sql": sql_text[:2000], "exp": "Exp 4-9", "co": "CO1-3", "elapsed_ms": 0, "rowcount": 0})
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


PRESETS = [
    {"group": "Exp 4 - DML", "name": "Queued packets by sat", "sql": "SELECT origin_sat, mode, status, COUNT(*) FROM packet GROUP BY origin_sat, mode, status ORDER BY origin_sat LIMIT 50"},
    {"group": "Exp 4 - DML", "name": "Recent telemetry", "sql": "SELECT sat_id, ts, battery_v, temp_c FROM telemetry ORDER BY ts DESC LIMIT 50"},
    {"group": "Exp 5 - Aggregates", "name": "Low power sats (HAVING)", "sql": "SELECT * FROM v_low_power"},
    {"group": "Exp 5 - Aggregates", "name": "Station workload", "sql": "SELECT * FROM v_station_workload"},
    {"group": "Exp 5 - Aggregates", "name": "Queue by mode", "sql": "SELECT * FROM v_queue_by_mode LIMIT 50"},
    {"group": "Exp 5 - Link budget fn", "name": "Downlink scores", "sql": "SELECT link_score_downlink(25, 900), link_score_downlink(8, 2200)"},
    {"group": "Exp 5 - Link budget fn", "name": "ISL scores", "sql": "SELECT link_score_isl(300), link_score_isl(1500)"},
    {"group": "Exp 6 - Joins/Views", "name": "Constellation status", "sql": "SELECT * FROM v_constellation_status"},
    {"group": "Exp 6 - Joins/Views", "name": "Route detail", "sql": "SELECT * FROM v_route_detail LIMIT 50"},
    {"group": "Exp 6 - CGR", "name": "CGR from SS-1", "sql": "SELECT * FROM cgr_routes('SS-1', now())"},
    {"group": "Exp 6 - Set ops", "name": "Heard by BOM not HEL", "sql": "SELECT * FROM v_heard_by_bom_not_hel"},
    {"group": "Exp 6 - Set ops", "name": "Heard by both", "sql": "SELECT * FROM v_heard_by_both"},
    {"group": "Exp 6 - Set ops", "name": "Mode mix UNION ALL", "sql": "SELECT * FROM v_mode_mix"},
    {"group": "Exp 6 - Nested", "name": "Weak ISL legs", "sql": "SELECT * FROM v_weak_isl LIMIT 50"},
    {"group": "Exp 6 - LIKE", "name": "Callsign search", "sql": "SELECT * FROM v_callsign_search"},
    {"group": "Exp 6 - Window", "name": "Battery running avg", "sql": "SELECT sat_id, ts, battery_v, AVG(battery_v) OVER (PARTITION BY sat_id ORDER BY ts ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS running_avg FROM telemetry ORDER BY ts DESC LIMIT 50"},
    {"group": "Exp 7 - DCL", "name": "Privilege matrix", "sql": "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('mission_director','station_operator_bom','student_analyst','ai_router') ORDER BY grantee, table_name LIMIT 50"},
    {"group": "Exp 7 - DCL", "name": "pg_stat_activity", "sql": "SELECT usename, application_name, state FROM pg_stat_activity ORDER BY backend_start DESC LIMIT 20"},
    {"group": "Exp 8 - MVCC", "name": "Tuple headers", "sql": "SELECT xmin, xmax, ctid, * FROM deployer_pod LIMIT 20"},
    {"group": "Exp 9 - AI", "name": "AI overrides", "sql": "SELECT * FROM v_ai_overrides LIMIT 50"},
    {"group": "Exp 9 - AI", "name": "Recent decisions", "sql": "SELECT decision_id, sat_id, ai_action, rule_action, final_action, overridden FROM routing_decision ORDER BY decided_at DESC LIMIT 50"},
]


@router.get("/api/console/presets")
def presets(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    sqlbook.get_log().append({"label": "console presets", "sql": "-- presets (no DB hit)", "exp": "Exp 4-9", "co": None, "elapsed_ms": 0, "rowcount": len(PRESETS)})
    return sqlbook.envelope(PRESETS, role)
