"""Index lab (Exp 8): catalog, bulk load, before/after EXPLAIN."""
from __future__ import annotations

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


def _node_types(plan: dict) -> list[str]:
    out: list[str] = []

    def _walk(node: dict):
        if not isinstance(node, dict):
            return
        t = node.get("Node Type")
        if t and t not in out:
            out.append(t)
        for child in node.get("Plans", []) or []:
            _walk(child)

    _walk((plan or {}).get("Plan", plan or {}))
    return out[:8]


@router.get("/api/labs/index/catalog")
def catalog(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        cat = sqlbook.run(role, "bench catalog", "SELECT * FROM bench_index_catalog() ORDER BY key")
        sizes = sqlbook.run(role, "bench sizes", "SELECT * FROM bench_index_sizes()")
        queries = sqlbook.run(role, "bench queries", "SELECT * FROM bench_queries() ORDER BY key")
        return sqlbook.envelope({"catalog": cat, "sizes": sizes, "queries": queries}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/labs/index/bulk")
def bulk(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    rows = int((body or {}).get("rows", 500000))
    try:
        # SECURITY DEFINER + director guard live in SQL; run as the cookie role.
        row = sqlbook.run(role, "bench bulk telemetry", "SELECT bench_bulk_telemetry(%s) AS inserted", (rows,), many=False)
        return sqlbook.envelope(row, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/labs/index/run")
def run_query(request: Request, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    query_key = (body or {}).get("query_key")
    index_key = (body or {}).get("index_key")
    if not query_key or not index_key:
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "query_key and index_key required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        q = sqlbook.run(role, "bench query text", "SELECT * FROM bench_queries() WHERE key = %s", (query_key,), many=False)
        if not q:
            return JSONResponse(status_code=404, content={"error": {"sqlstate": None, "message": f"unknown query {query_key}", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
        sql_text = q["sql"]
        # 1. drop all, 2. EXPLAIN before (planner left honest: no enable_seqscan tweak).
        sqlbook.run("mission_director", "bench drop all", "SELECT bench_drop_all()", superuser=True)
        before = sqlbook.run("mission_director", f"explain before {query_key}", f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql_text}", superuser=True)
        # 3. apply index, 4. EXPLAIN after.
        sqlbook.run("mission_director", f"bench apply {index_key}", "SELECT bench_apply(%s)", (index_key,), superuser=True)
        after = sqlbook.run("mission_director", f"explain after {query_key}", f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql_text}", superuser=True)
        plan_before = (before[0].get("QUERY PLAN") if before else [{}])[0] if before else {}
        plan_after = (after[0].get("QUERY PLAN") if after else [{}])[0] if after else {}
        sizes = sqlbook.run("mission_director", "bench sizes after", "SELECT * FROM bench_index_sizes()", superuser=True)
        return sqlbook.envelope(
            {
                "query": q,
                "plan_before": plan_before,
                "plan_after": plan_after,
                "ms_before": (plan_before or {}).get("Execution Time"),
                "ms_after": (plan_after or {}).get("Execution Time"),
                "nodes_before": _node_types(plan_before or {}),
                "nodes_after": _node_types(plan_after or {}),
                "sizes": sizes,
            },
            role,
        )
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})
