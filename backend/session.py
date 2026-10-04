"""Cookie session: sn_role holds role|hmac_sha256(SESSION_SECRET, role)."""
from __future__ import annotations

import hashlib
import hmac
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import Cookie, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import _db  # noqa: E402

from . import db as dbmod

COOKIE = "sn_role"

VALID_ROLES = (
    "mission_director",
    "station_operator_bom",
    "station_operator_hel",
    "student_analyst",
    "ai_router",
)


def _secret() -> str:
    _db.load_env()
    return os.environ.get("SESSION_SECRET", "dev-only-change-me")


def sign(role: str) -> str:
    return hmac.new(_secret().encode(), role.encode(), hashlib.sha256).hexdigest()


def make_cookie(role: str) -> str:
    return f"{role}|{sign(role)}"


def parse_cookie(value: Optional[str]) -> Optional[str]:
    if not value or "|" not in value:
        return None
    role, sig = value.split("|", 1)
    if role not in VALID_ROLES:
        return None
    if not hmac.compare_digest(sig, sign(role)):
        return None
    return role


def no_profile() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"error": {"code": "NO_PROFILE"}, "sql": [], "role": None},
    )


def current_role(request: Request) -> Optional[str]:
    return parse_cookie(request.cookies.get(COOKIE))


def require_role(request: Request) -> str | JSONResponse:
    role = current_role(request)
    if role is None:
        return no_profile()  # caller checks isinstance
    return role
