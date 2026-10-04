"""Two-session transaction lab (Exp 9, CO4)."""
from __future__ import annotations

import sys
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
import _db  # noqa: E402

from .. import db as dbmod
from .. import session as sess
from .. import sqlbook

router = APIRouter()

_lock = threading.Lock()
_labs: dict[str, dict] = {}
EXEC_TIMEOUT_S = 1.5
IDLE_EXPIRY_S = 600


def _role_or_401(request: Request):
    role = sess.current_role(request)
    if role is None:
        return None, sess.no_profile()
    sqlbook.begin_log()
    return role, None


def _purge_expired():
    now = time.time()
    dead = [lid for lid, lab in _labs.items() if now - lab.get("last_used", now) > IDLE_EXPIRY_S]
    for lid in dead:
        _close_lab(lid)


def _close_lab(lab_id: str):
    lab = _labs.pop(lab_id, None)
    if not lab:
        return
    for key in ("A", "B"):
        st = lab.get(key)
        if not st:
            continue
        th = st.get("thread")
        # Do not join a blocked thread; just close under it (psycopg close
        # unblocks the waiter with an error, which the thread records).
        try:
            st["conn"].close()
        except Exception:
            pass


def _new_session(role: str, lab_id: str, tag: str):
    import psycopg

    cfg = _db.settings()
    import os as _os

    dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    conn = psycopg.connect(host=cfg["host"], port=cfg["port"], dbname=dbname,
                           user=role, password=_db.role_password(role),
                           autocommit=False,
                           application_name=f"somaiyanet:lab:{lab_id}:{tag}")
    with conn.cursor() as cur:
        cur.execute("SELECT pg_backend_pid()")
        pid = cur.fetchone()[0]
    # Roll back the implicit txn opened by the SELECT above.
    conn.rollback()
    return {"conn": conn, "pid": pid, "thread": None, "result": None, "started": None}


def _run_statement(st: dict, sql: str):
    """Thread target: run one statement, record done/error result."""
    import psycopg

    try:
        with st["conn"].cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql)
            rows = None
            if cur.description is not None:
                try:
                    rows = cur.fetchmany(200)
                except Exception:
                    rows = []
            notice = None
            st["result"] = {"status": "done",
                            "rows": [sqlbook.convert_row(r) for r in (rows or [])],
                            "rowcount": cur.rowcount, "notice": notice}
    except Exception as exc:  # noqa: BLE001
        st["result"] = {"status": "error",
                        "error": {"sqlstate": getattr(exc, "sqlstate", None),
                                  "message": str(exc)[:1000]}}
    finally:
        st["thread"] = None


@router.post("/api/labs/tx/session")
def create_session(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    try:
        with _lock:
            _purge_expired()
            lab_id = uuid.uuid4().hex[:8]
            lab = {"role": role, "created": time.time(), "last_used": time.time()}
            lab["A"] = _new_session(role, lab_id, "A")
            lab["B"] = _new_session(role, lab_id, "B")
            _labs[lab_id] = lab
            sqlbook.get_log().append({"label": f"lab {lab_id} open A+B", "sql": f"-- two sessions as {role}",
                                      "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
            return sqlbook.envelope({"lab_id": lab_id, "pid_a": lab["A"]["pid"], "pid_b": lab["B"]["pid"]}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


def _get_lab(lab_id: str):
    with _lock:
        lab = _labs.get(lab_id)
        if lab is not None:
            if time.time() - lab.get("last_used", 0) > IDLE_EXPIRY_S:
                _close_lab(lab_id)
                return None
            lab["last_used"] = time.time()
        return lab


@router.post("/api/labs/tx/{lab_id}/exec")
def lab_exec(request: Request, lab_id: str, body: dict):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    tag = (body or {}).get("session")
    sql = (body or {}).get("sql", "")
    lab = _get_lab(lab_id)
    if lab is None:
        return JSONResponse(status_code=404, content={"error": {"sqlstate": None, "message": "unknown lab", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    if tag not in ("A", "B") or not sql or not sql.strip():
        return JSONResponse(status_code=400, content={"error": {"sqlstate": None, "message": "session A|B and sql required", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    st = lab[tag]
    try:
        with _lock:
            if st.get("thread") is not None and st["thread"].is_alive():
                sqlbook.get_log().append({"label": f"lab {lab_id}:{tag} busy", "sql": sql[:500],
                                          "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
                return sqlbook.envelope({"status": "waiting", "session": tag}, role)
            st["result"] = None
            th = threading.Thread(target=_run_statement, args=(st, sql), daemon=True)
            st["thread"] = th
            st["started"] = time.time()
            th.start()
        th.join(EXEC_TIMEOUT_S)
        sqlbook.get_log().append({"label": f"lab {lab_id}:{tag} exec", "sql": sql[:2000],
                                  "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
        if th.is_alive():
            return sqlbook.envelope({"status": "waiting", "session": tag}, role)
        return sqlbook.envelope({**st["result"], "session": tag}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.get("/api/labs/tx/{lab_id}/state")
def lab_state(request: Request, lab_id: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    lab = _get_lab(lab_id)
    if lab is None:
        return JSONResponse(status_code=404, content={"error": {"sqlstate": None, "message": "unknown lab", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        pids = [lab["A"]["pid"], lab["B"]["pid"]]
        activity = sqlbook.run("mission_director", f"lab {lab_id} activity",
                               "SELECT pid, usename, application_name, state, wait_event_type, wait_event, "
                               "query, backend_xid, backend_xmin, pg_blocking_pids(pid) AS blocked_by "
                               "FROM pg_stat_activity WHERE pid = ANY(%s)", (pids,), superuser=True)
        locks = sqlbook.run("mission_director", f"lab {lab_id} locks",
                            "SELECT pid, locktype, mode, granted, relation::regclass::text AS rel "
                            "FROM pg_locks WHERE pid = ANY(%s) ORDER BY pid", (pids,), superuser=True)

        def _sess(tag: str):
            st = lab[tag]
            th = st.get("thread")
            running = th is not None and th.is_alive()
            res = {"status": "running"} if running else (st.get("result") or {"status": "idle"})
            act = next((a for a in activity if a["pid"] == st["pid"]), None)
            xact = "idle"
            if act:
                s = (act.get("state") or "")
                if "aborted" in s or "error" in s:
                    xact = "in error"
                elif "transaction" in s:
                    xact = "in transaction"
                elif s == "active":
                    xact = "active"
                else:
                    xact = s or "idle"
            return {"session": tag, "pid": st["pid"], "result": res,
                    "activity": act, "locks": [lk for lk in locks if lk["pid"] == st["pid"]],
                    "xact": xact}

        return sqlbook.envelope({"lab_id": lab_id, "A": _sess("A"), "B": _sess("B"),
                                 "role": lab.get("role")}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.post("/api/labs/tx/{lab_id}/reset")
def lab_reset(request: Request, lab_id: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    lab = _get_lab(lab_id)
    if lab is None:
        return JSONResponse(status_code=404, content={"error": {"sqlstate": None, "message": "unknown lab", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
    try:
        for tag in ("A", "B"):
            st = lab[tag]
            th = st.get("thread")
            if th is not None and th.is_alive():
                try:
                    st["conn"].close()
                except Exception:
                    pass
                lab[tag] = _new_session(lab["role"], lab_id, tag)
            else:
                try:
                    st["conn"].rollback()
                except Exception:
                    lab[tag] = _new_session(lab["role"], lab_id, tag)
            lab[tag]["result"] = None
            lab[tag]["thread"] = None
        sqlbook.run("mission_director", f"lab {lab_id} reset table",
                    "UPDATE lab_account SET power_credits = 100 WHERE id IN (1, 2)", superuser=True)
        # If a scenario left a stray uncommitted change from a killed conn, force reset.
        sqlbook.run("mission_director", f"lab {lab_id} reset check",
                    "INSERT INTO lab_account (id, sat_id, power_credits) VALUES (1, 'SAT-A1', 100), (2, 'SAT-A2', 100) "
                    "ON CONFLICT (id) DO UPDATE SET power_credits = 100", superuser=True)
        return sqlbook.envelope({"lab_id": lab_id, "reset": True}, role)
    except Exception as exc:
        return JSONResponse(status_code=sqlbook.status_for(exc), content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role})


@router.delete("/api/labs/tx/{lab_id}")
def lab_delete(request: Request, lab_id: str):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    with _lock:
        if lab_id not in _labs:
            return JSONResponse(status_code=404, content={"error": {"sqlstate": None, "message": "unknown lab", "detail": None, "hint": None}, "sql": sqlbook.get_log(), "role": role})
        _close_lab(lab_id)
    sqlbook.get_log().append({"label": f"lab {lab_id} closed", "sql": "-- close A+B",
                              "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": 0})
    return sqlbook.envelope({"lab_id": lab_id, "closed": True}, role)


SCENARIOS = {
    "lost_update": {
        "title": "Lost update (READ COMMITTED) + SELECT FOR UPDATE fix",
        "steps": [
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "A reads 100."},
            {"session": "B", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "B reads the same 100 (no lock)."},
            {"session": "A", "sql": "UPDATE lab_account SET power_credits = 90 WHERE id = 1", "expect": "ok", "explain": "A writes 90 and commits."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "A commits first."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = 80 WHERE id = 1", "expect": "ok", "explain": "B overwrites with 80 based on the stale read."},
            {"session": "B", "sql": "COMMIT", "expect": "ok", "explain": "Final value 80: A's update is lost."},
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "Confirm 80."},
        ],
    },
    "non_repeatable_read": {
        "title": "Non-repeatable read (READ COMMITTED) vs stable (REPEATABLE READ)",
        "steps": [
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "A reads 100."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = 70 WHERE id = 1", "expect": "ok", "explain": "B changes the row."},
            {"session": "B", "sql": "COMMIT", "expect": "ok", "explain": "B commits between A's reads."},
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "A sees 70: non-repeatable under READ COMMITTED."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "End first txn."},
            {"session": "A", "sql": "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", "expect": "ok", "explain": "Repeatable snapshot for A."},
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "A snapshots 70."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = 60 WHERE id = 1", "expect": "ok", "explain": "B changes it again."},
            {"session": "B", "sql": "COMMIT", "expect": "ok", "explain": "B commits."},
            {"session": "A", "sql": "SELECT power_credits FROM lab_account WHERE id = 1", "expect": "ok", "explain": "A still sees 70: stable snapshot."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "End snapshot txn."},
        ],
    },
    "phantom_or_write_skew": {
        "title": "Write skew under SERIALIZABLE (one commit fails 40001)",
        "steps": [
            {"session": "A", "sql": "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", "expect": "ok", "explain": "Serializable snapshot for A."},
            {"session": "B", "sql": "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", "expect": "ok", "explain": "Serializable snapshot for B."},
            {"session": "A", "sql": "SELECT sum(power_credits) AS total FROM lab_account", "expect": "ok", "explain": "Both see 200."},
            {"session": "B", "sql": "SELECT sum(power_credits) AS total FROM lab_account", "expect": "ok", "explain": "Both see 200."},
            {"session": "A", "sql": "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 1", "expect": "ok", "explain": "A debits row 1."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 2", "expect": "ok", "explain": "B debits row 2 (no overlap, both succeed)."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "First committer wins."},
            {"session": "B", "sql": "COMMIT", "expect": "error:40001", "explain": "Second committer gets 40001 serialization_failure."},
        ],
    },
    "deadlock": {
        "title": "Deadlock (one session gets 40P01)",
        "steps": [
            {"session": "A", "sql": "UPDATE lab_account SET power_credits = power_credits WHERE id = 1", "expect": "ok", "explain": "A locks row 1."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = power_credits WHERE id = 2", "expect": "ok", "explain": "B locks row 2."},
            {"session": "A", "sql": "UPDATE lab_account SET power_credits = power_credits WHERE id = 2", "expect": "waits", "explain": "A waits for B's row-2 lock."},
            {"session": "B", "sql": "UPDATE lab_account SET power_credits = power_credits WHERE id = 1", "expect": "error:40P01", "explain": "Cycle: Postgres aborts one side with 40P01 after deadlock_timeout."},
        ],
    },
    "skip_locked": {
        "title": "SKIP LOCKED: two router workers claim disjoint packets",
        "steps": [
            {"session": "A", "sql": "SELECT * FROM dispatch_packets('SAT-A1', 'worker-A', 20000)", "expect": "ok", "explain": "Worker A claims within budget."},
            {"session": "B", "sql": "SELECT * FROM dispatch_packets('SAT-A1', 'worker-B', 20000)", "expect": "ok", "explain": "Worker B skips A's locked rows, claims disjoint ids."},
        ],
    },
    "mvcc": {
        "title": "MVCC versions: xmin/xmax/ctid across sessions",
        "steps": [
            {"session": "A", "sql": "UPDATE deployer_pod SET temperature_c = COALESCE(temperature_c, 20) + 1 WHERE pod_id = 'POD-A1'", "expect": "ok", "explain": "A writes a new version, uncommitted."},
            {"session": "A", "sql": "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1'", "expect": "ok", "explain": "A sees its own new version."},
            {"session": "B", "sql": "SELECT xmin, xmax, ctid, temperature_c, txid_current() AS txid FROM deployer_pod WHERE pod_id = 'POD-A1'", "expect": "ok", "explain": "B still sees the old committed version."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "A commits the new version."},
            {"session": "B", "sql": "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1'", "expect": "ok", "explain": "B now sees the new version with a new ctid."},
            {"session": "B", "sql": "COMMIT", "expect": "ok", "explain": "End B's snapshot."},
        ],
    },
    "wal": {
        "title": "WAL: LSN moves as 1000 telemetry rows are written",
        "steps": [
            {"session": "A", "sql": "SELECT pg_current_wal_lsn() AS lsn_before", "expect": "ok", "explain": "LSN before the write txn."},
            {"session": "A", "sql": "INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma) SELECT now() + (g || ' microseconds')::interval, 'SAT-A1', 7.50, 20.0, 300 FROM generate_series(1, 1000) AS g", "expect": "ok", "explain": "1000-row write transaction."},
            {"session": "A", "sql": "COMMIT", "expect": "ok", "explain": "Commit forces WAL flush (durability)."},
            {"session": "A", "sql": "SELECT pg_current_wal_lsn() AS lsn_after", "expect": "ok", "explain": "LSN after; pg_wal_lsn_diff shows bytes written."},
        ],
    },
}


@router.get("/api/labs/tx/scenarios")
def scenarios(request: Request):
    role, err = _role_or_401(request)
    if err is not None:
        return err
    sqlbook.get_log().append({"label": "lab scenarios", "sql": "-- scripted tx scenarios (no DB hit)",
                              "exp": "Exp 9 - TCL", "co": "CO4", "elapsed_ms": 0, "rowcount": len(SCENARIOS)})
    return sqlbook.envelope({k: v for k, v in SCENARIOS.items()}, role)
