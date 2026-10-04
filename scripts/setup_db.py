"""Recreate the SomaiyaNet database and load SQL + generated data.

Usage:
    python scripts/setup_db.py [--db NAME] [--test] [--sql-only]
"""
from __future__ import annotations

import argparse
import importlib
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import _db  # noqa: E402

# SQL files, in load order; missing files are skipped with a note.
SQL_FILES = [f"0{i}_*.sql" for i in range(1, 10)]

# Generated-data steps, in order; missing modules are skipped with a warning.
DATA_STEPS = [
    "build_constellation",
    "compute_contacts",
    "generate_telemetry",
    "generate_packets",
    "train_router",
]

# Placeholder tokens in db/07_security.sql and where their values come from.
_PASSWORD_DEFAULTS = {
    "MISSION_DIRECTOR_PASSWORD": "director123",
    "STATION_BOM_PASSWORD": "bom123",
    "STATION_HEL_PASSWORD": "hel123",
    "STUDENT_ANALYST_PASSWORD": "student123",
    "AI_ROUTER_PASSWORD": "router123",
}

COUNT_TABLES = [
    "network_node",
    "ground_station",
    "deployer_pod",
    "satellite",
    "deployment_event",
    "packet",
    "contact",
]


def target_db(args: argparse.Namespace) -> str:
    _db.load_env()
    if args.test:
        return os.environ.get("TEST_PGDATABASE", "somaiyanet_test")
    if args.db:
        return args.db
    return os.environ.get("PGDATABASE", "somaiyanet")


def recreate_database(target: str) -> None:
    cfg = _db.settings()
    with psycopg.connect(
        host=cfg["host"],
        port=cfg["port"],
        dbname="postgres",
        user=cfg["user"],
        password=cfg["password"],
        autocommit=True,
    ) as conn:
        conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (target,),
        )
        conn.execute(
            sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(target))
        )
        conn.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target))
        )


def sql_files_in_order() -> list[Path]:
    found: list[Path] = []
    for pattern in SQL_FILES:
        matches = sorted((REPO_ROOT / "db").glob(pattern))
        if not matches:
            print(f"NOTE: no file matching db/{pattern} yet, skipping")
        found.extend(matches)
    return found


def substitute_security_tokens(text: str, target: str) -> str:
    _db.load_env()
    mapping = {"__DB__": target}
    for var, default in _PASSWORD_DEFAULTS.items():
        # Quote as a SQL string literal; passwords are controlled, but never
        # interpolate raw.
        value = os.environ.get(var, default).replace("'", "''")
        mapping[f"__{var}__"] = f"'{value}'"
    for token, replacement in mapping.items():
        text = text.replace(token, replacement)
    return text


def run_sql_files(files: list[Path], target: str) -> None:
    with _db.connect(dbname=target, autocommit=True) as conn:
        for path in files:
            text = path.read_text(encoding="utf-8")
            if path.name.startswith("07_"):
                text = substitute_security_tokens(text, target)
            try:
                conn.execute(text)
            except Exception as exc:  # noqa: BLE001
                print(f"ERROR in {path.name}: {exc}")
                sys.exit(1)
            print(f"ran {path.name}")


def run_data_steps(target: str) -> None:
    def conn_factory(
        user: str | None = None,
        password: str | None = None,
        autocommit: bool = False,
    ) -> psycopg.Connection:
        return _db.connect(
            dbname=target, user=user, password=password, autocommit=autocommit
        )

    for name in DATA_STEPS:
        try:
            module = importlib.import_module(name)
        except ImportError:
            print(f"WARNING: scripts/{name}.py not present yet, skipping")
            continue
        module.run(conn_factory)
        print(f"ran data step {name}")


def refresh_and_summarize(target: str) -> None:
    with _db.connect(dbname=target, autocommit=True) as conn:
        mv = conn.execute(
            "SELECT to_regclass('public.mv_kpis')"
        ).fetchone()[0]
        if mv is not None:
            conn.execute("REFRESH MATERIALIZED VIEW mv_kpis")
            print("refreshed mv_kpis")
        else:
            print("NOTE: mv_kpis does not exist yet, skipping refresh")
        conn.execute("ANALYZE")
        print("--- row counts ---")
        for table in COUNT_TABLES:
            exists = conn.execute(
                "SELECT to_regclass(%s)", (f"public.{table}",)
            ).fetchone()[0]
            if exists is None:
                print(f"{table}: (no such table yet)")
                continue
            n = conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
            ).fetchone()[0]
            print(f"{table}: {n}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Recreate and load SomaiyaNet")
    parser.add_argument("--db", default=None, help="target database name")
    parser.add_argument("--test", action="store_true", help="use TEST_PGDATABASE")
    parser.add_argument("--sql-only", action="store_true", help="skip data steps")
    args = parser.parse_args()

    target = target_db(args)
    # Visible to data steps via _db.connect()'s default.
    os.environ["SOMAIYANET_DB"] = target

    recreate_database(target)
    print(f"recreated database {target}")
    run_sql_files(sql_files_in_order(), target)
    if not args.sql_only:
        run_data_steps(target)
    refresh_and_summarize(target)
    print(f"setup complete: {target}")


if __name__ == "__main__":
    main()
