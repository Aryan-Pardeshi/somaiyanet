"""Per-role connection pools. Only opens connections, never implements SQL logic."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import _db  # noqa: E402
from psycopg_pool import ConnectionPool

VALID_ROLES = (
    "mission_director",
    "station_operator_bom",
    "station_operator_hel",
    "student_analyst",
    "ai_router",
)

_pools: dict[str, ConnectionPool] = {}
_super_pool: ConnectionPool | None = None


def _conninfo(user: str, password: str, role_label: str) -> str:
    cfg = _db.settings()
    dbname = os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    # application_name identifies the role in pg_stat_activity.
    safe_app = f"somaiyanet:{role_label}".replace("'", "")
    return (
        f"host={cfg['host']} port={cfg['port']} dbname={dbname} "
        f"user={user} password={password} application_name='{safe_app}' "
        f"connect_timeout=8"
    )


def pool_for(role: str) -> ConnectionPool:
    """Lazily created pool per login role (min 0, max 4)."""
    if role not in VALID_ROLES:
        raise KeyError(f"unknown role: {role}")
    pool = _pools.get(role)
    if pool is None:
        pool = ConnectionPool(
            _conninfo(role, _db.role_password(role), role),
            min_size=0,
            max_size=4,
            timeout=10,
        )
        _pools[role] = pool
    return pool


def super_pool() -> ConnectionPool:
    """Superuser pool: public /api/stats, LISTEN, profile privilege matrix."""
    global _super_pool
    if _super_pool is None:
        cfg = _db.settings()
        _super_pool = ConnectionPool(
            _conninfo(cfg["user"], cfg["password"], "superuser"),
            min_size=0,
            max_size=4,
            timeout=10,
        )
    return _super_pool


def close_all() -> None:
    for pool in list(_pools.values()):
        try:
            pool.close()
        except Exception:
            pass
    _pools.clear()
    global _super_pool
    if _super_pool is not None:
        try:
            _super_pool.close()
        except Exception:
            pass
        _super_pool = None
