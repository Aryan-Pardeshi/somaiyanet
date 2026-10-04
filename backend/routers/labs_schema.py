"""Schema lab (Exp 1-2): catalog reads for the ER diagram."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import session as sess
from .. import sqlbook

router = APIRouter()

TAGS: dict[str, list[str]] = {
    "network_node": ["supertype"],
    "packet": ["supertype"],
    "satellite": ["subtype"],
    "ground_station": ["subtype"],
    "ttc_frame": ["subtype"],
    "sstv_image": ["subtype"],
    "voice_frame": ["subtype"],
    "deployment_event": ["weak"],
    "dt_node": ["weak"],
    "route_hop": ["weak", "bridge/M:N"],
    "contact": ["bridge/M:N"],
    "payload_mode": ["lookup"],
    "sat_state_transition": ["lookup"],
    "telemetry": ["partitioned"],
    "audit_log": ["audit"],
    "deployment_log": ["audit"],
}

MAPPING_NOTES = [
    "EER supertype network_node -> satellite | ground_station: composite FK (node_id, kind) with fixed-kind CHECK gives disjointness; deferred trigger trg_node_totality gives totality.",
    "EER supertype packet -> ttc_frame | sstv_image | voice_frame: FK (packet_id, mode) with fixed-mode CHECK gives disjointness by mode.",
    "Weak entities (deployment_event, dt_node, route_hop): PK contains the owner key, ON DELETE CASCADE to the owner.",
    "M:N contact graph: route_hop bridges route <-> contact with (route_id, hop_no) ordering.",
    "Lookup tables (payload_mode, sat_state_transition) make dispatch order and the state machine data, not code.",
    "telemetry uses declarative RANGE partitioning by day (PARTITION BY RANGE (ts)) with a DEFAULT partition.",
    "Derived columns (period_min, duration_s, span, latency_s, overridden) are GENERATED ALWAYS AS ... STORED.",
    "Exclusion constraint on contact (from_node, to_node, span) stops double-booking a directed pair.",
]


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


@router.get("/api/labs/schema")
def schema(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        tables = sqlbook.run(
            role, "schema tables",
            "SELECT c.relname AS table_name, "
            "CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' "
            "WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS kind, "
            "obj_description(c.oid) AS comment "
            "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') "
            "AND c.relname !~ '^pg_' AND c.relname !~ '^telemetry_' "
            "ORDER BY c.relname",
        )
        columns = sqlbook.run(
            role, "schema columns",
            "SELECT c.relname AS table_name, a.attname AS column_name, "
            "format_type(a.atttypid, a.atttypmod) AS data_type, "
            "NOT a.attnotnull AS nullable, "
            "pg_get_expr(ad.adbin, ad.adrelid) AS default_expr, "
            "CASE WHEN a.attgenerated <> '' THEN 'stored generated' ELSE '' END AS generated "
            "FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') "
            "AND a.attnum > 0 AND NOT a.attisdropped "
            "AND c.relname !~ '^telemetry_' "
            "ORDER BY c.relname, a.attnum",
        )
        pks = sqlbook.run(
            role, "schema PKs",
            "SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, "
            "pg_get_constraintdef(oid) AS definition "
            "FROM pg_constraint WHERE contype = 'p' AND connamespace = 'public'::regnamespace "
            "ORDER BY table_name",
        )
        fks = sqlbook.run(
            role, "schema FKs",
            "SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, "
            "pg_get_constraintdef(oid) AS definition, confrelid::regclass::text AS ref_table "
            "FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace "
            "ORDER BY table_name, conname",
        )
        checks = sqlbook.run(
            role, "schema check/exclude",
            "SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, "
            "CASE contype WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE contype::text END AS kind, "
            "pg_get_constraintdef(oid) AS definition "
            "FROM pg_constraint WHERE contype IN ('c', 'x') AND connamespace = 'public'::regnamespace "
            "ORDER BY table_name, conname",
        )
        partitions = sqlbook.run(
            role, "schema partitions",
            "SELECT inhparent::regclass::text AS parent, inhrelid::regclass::text AS child "
            "FROM pg_inherits ORDER BY parent, child",
        )
        views = sqlbook.run(
            role, "schema views",
            "SELECT c.relname AS view_name, "
            "CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS kind, "
            "obj_description(c.oid) AS comment "
            "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') ORDER BY c.relname",
        )
        for t in tables:
            t["tags"] = TAGS.get(t["table_name"], [])
        return sqlbook.envelope(
            {
                "tables": tables, "columns": columns, "pks": pks, "fks": fks,
                "checks": checks, "partitions": partitions, "views": views,
                "mapping_notes": MAPPING_NOTES,
            },
            role,
        )
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
