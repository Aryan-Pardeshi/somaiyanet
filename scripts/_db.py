"""Shared psycopg 3 connection helper for SomaiyaNet scripts.

Reads every secret from .env via python-dotenv; never hard-codes passwords
except the throwaway .env.example defaults used when a var is unset.
"""
from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Throwaway local-only defaults, mirroring .env.example.
_DEFAULTS = {
    "MISSION_DIRECTOR_PASSWORD": "director123",
    "STATION_BOM_PASSWORD": "bom123",
    "STATION_HEL_PASSWORD": "hel123",
    "STUDENT_ANALYST_PASSWORD": "student123",
    "AI_ROUTER_PASSWORD": "router123",
}

_ROLE_TO_ENV = {
    "mission_director": "MISSION_DIRECTOR_PASSWORD",
    "station_operator_bom": "STATION_BOM_PASSWORD",
    "station_operator_hel": "STATION_HEL_PASSWORD",
    "student_analyst": "STUDENT_ANALYST_PASSWORD",
    "ai_router": "AI_ROUTER_PASSWORD",
}


def repo_root() -> Path:
    """Repo root is the parent of this script's directory (scripts/)."""
    return Path(__file__).resolve().parent.parent


def load_env() -> None:
    """Load .env from the repo root (or Render's secret file); existing environment wins."""
    load_dotenv(repo_root() / ".env", override=False)
    load_dotenv("/etc/secrets/.env", override=False)


def settings() -> dict:
    """Connection settings from PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE."""
    load_env()
    return {
        "host": os.environ.get("PGHOST", "localhost"),
        "port": int(os.environ.get("PGPORT", "5432")),
        "user": os.environ.get("PGUSER", "postgres"),
        "password": os.environ.get("PGPASSWORD", ""),
        "dbname": os.environ.get("PGDATABASE", "somaiyanet"),
    }


def role_password(role_name: str) -> str:
    """Map a login role to its password env var (with throwaway default)."""
    load_env()
    try:
        env_var = _ROLE_TO_ENV[role_name]
    except KeyError:
        raise KeyError(f"unknown role: {role_name}") from None
    return os.environ.get(env_var, _DEFAULTS[env_var])


def connect(
    dbname: str | None = None,
    user: str | None = None,
    password: str | None = None,
    autocommit: bool = False,
) -> psycopg.Connection:
    """Connect to the target DB (SOMAIYANET_DB override, else PGDATABASE)."""
    cfg = settings()
    return psycopg.connect(
        host=cfg["host"],
        port=cfg["port"],
        dbname=dbname or os.environ.get("SOMAIYANET_DB") or cfg["dbname"],
        user=user or cfg["user"],
        password=password if password is not None else cfg["password"],
        autocommit=autocommit,
    )
