"""Public, read-only endpoints for the landing page (no session needed).

Every query here is fixed text with bound parameters. Routes run as the
read-only login role student_analyst; the role demo runs each query as the
real login role inside a rolled-back transaction; the rest reads catalog or
reference rows only.
"""
from __future__ import annotations

import re

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import sqlbook
from .labs_security import _as_role

router = APIRouter()

PUBLIC_ROLE = "student_analyst"
ORIGIN_RE = re.compile(r"^SS-[1-4]$")
DEMO_ROLES = ["mission_director", "station_operator_bom", "station_operator_hel", "student_analyst"]
ROLE_QUERIES = [
    {
        "id": "passes",
        "sql": "SELECT to_node AS station, count(*)::int AS passes FROM contact "
               "WHERE kind = 'DOWNLINK' GROUP BY to_node ORDER BY to_node",
    },
    {
        "id": "telecommands",
        "sql": "SELECT count(*)::int AS telecommands FROM telecommand",
    },
]


def _fail(exc: Exception, role: str | None):
    return JSONResponse(
        status_code=sqlbook.status_for(exc),
        content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
    )


@router.get("/api/public/network")
def network():
    sqlbook.begin_log()
    try:
        satellites = sqlbook.run(
            "mission_director", "public satellites",
            "SELECT n.node_id AS id, n.display_name AS name, s.state, s.battery_v, "
            "s.tle_line1, s.tle_line2 "
            "FROM satellite s JOIN network_node n ON n.node_id = s.node_id ORDER BY n.node_id",
            superuser=True,
        )
        stations = sqlbook.run(
            "mission_director", "public stations",
            "SELECT g.node_id AS id, n.display_name AS name, g.city, g.country, "
            "g.latitude AS lat, g.longitude AS lng, g.is_primary AS primary "
            "FROM ground_station g JOIN network_node n ON n.node_id = g.node_id ORDER BY g.node_id",
            superuser=True,
        )
        plan = sqlbook.run_one(
            "mission_director", "public contact plan",
            "SELECT min(start_ts) AS starts, max(end_ts) AS ends, count(*)::int AS contacts FROM contact",
            superuser=True,
        )
        return sqlbook.envelope({"satellites": satellites, "stations": stations, "plan": plan}, None)
    except Exception as exc:  # noqa: BLE001
        return _fail(exc, None)


@router.get("/api/public/routes")
def routes(origin: str = "SS-1"):
    sqlbook.begin_log()
    if not ORIGIN_RE.match(origin):
        return JSONResponse(
            status_code=400,
            content={"error": {"sqlstate": None, "message": "origin must be SS-1 to SS-4", "detail": None, "hint": None},
                     "sql": [], "role": PUBLIC_ROLE},
        )
    try:
        rows = sqlbook.run(
            PUBLIC_ROLE, "earliest route to every station",
            "SELECT * FROM cgr_routes(%s, now(), 41216, 4, 10)",
            (origin,),
        )
        ids = sorted({cid for r in rows for cid in (r.get("path_contacts") or [])})
        contacts = []
        if ids:
            contacts = sqlbook.run(
                PUBLIC_ROLE, "contacts used by those routes",
                "SELECT contact_id, kind, from_node, to_node, start_ts, end_ts, link_score "
                "FROM contact WHERE contact_id = ANY(%s) ORDER BY start_ts",
                (ids,),
            )
        return sqlbook.envelope({"origin": origin, "routes": rows, "contacts": contacts}, PUBLIC_ROLE)
    except Exception as exc:  # noqa: BLE001
        return _fail(exc, PUBLIC_ROLE)


@router.get("/api/public/roles")
def roles():
    out = []
    for role in DEMO_ROLES:
        results = []
        for q in ROLE_QUERIES:
            ok, payload = _as_role(role, q["sql"])
            results.append({"id": q["id"], "ok": ok, "rows": payload if ok else None, "error": None if ok else payload})
        out.append({"role": role, "results": results})
    return {"data": {"queries": ROLE_QUERIES, "roles": out}, "sql": [], "role": None}


@router.get("/api/public/schema")
def schema():
    sqlbook.begin_log()
    try:
        tables = sqlbook.run(
            "mission_director", "tables and views",
            "SELECT c.relname AS name, "
            "CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' "
            "WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' END AS kind, "
            "(CASE WHEN c.relkind = 'p' THEN (SELECT COALESCE(sum(s2.n_live_tup), 0) FROM pg_inherits i "
            "JOIN pg_stat_user_tables s2 ON s2.relid = i.inhrelid WHERE i.inhparent = c.oid) "
            "ELSE COALESCE(s.n_live_tup, 0) END)::bigint AS approx_rows, "
            "obj_description(c.oid, 'pg_class') AS comment "
            "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND NOT c.relispartition "
            "ORDER BY c.relname",
            superuser=True,
        )
        columns = sqlbook.run(
            "mission_director", "columns",
            "SELECT c.relname AS table_name, a.attname AS name, "
            "format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable "
            "FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition "
            "AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum",
            superuser=True,
        )
        edges = sqlbook.run(
            "mission_director", "foreign keys",
            "SELECT DISTINCT conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table "
            "FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace "
            "AND conparentid = 0 ORDER BY 1, 2",
            superuser=True,
        )
        counts = sqlbook.run_one(
            "mission_director", "object counts",
            "SELECT "
            "(SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace "
            " AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'))::int AS functions, "
            "(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
            " WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal AND t.tgparentid = 0)::int AS triggers, "
            "(SELECT count(*) FROM pg_policies WHERE schemaname = 'public')::int AS policies, "
            "(SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relispartition)::int AS partitions",
            superuser=True,
        )
        return sqlbook.envelope({"tables": tables, "columns": columns, "edges": edges, "counts": counts}, None)
    except Exception as exc:  # noqa: BLE001
        return _fail(exc, None)
