"""FastAPI app: lifespan simulator + listener, routers, static SPA fallback."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db as dbmod
from . import sqlbook
from .routers import ai, console, deploy, labs_index, labs_norm, labs_schema, labs_security, labs_tx, mission, profiles, public, routing, stream, telecommand

ROOT = Path(__file__).resolve().parent.parent


def _refresh_contacts_if_stale() -> None:
    """Recompute the contact plan (now - 6 h .. now + 30 h) when it ends within 8 hours."""
    import _db  # scripts/ is on sys.path via backend.db
    import compute_contacts

    with _db.connect() as conn:
        ends = conn.execute("SELECT max(end_ts) > now() + interval '8 hours' FROM contact").fetchone()
    if ends and ends[0]:
        return
    compute_contacts.run(
        lambda user=None, password=None, autocommit=False: _db.connect(
            user=user, password=password, autocommit=autocommit
        )
    )


async def _contact_refresher() -> None:
    """Keeps a deployed site's contact plan current: checks at start-up, then every 3 hours."""
    while True:
        try:
            await asyncio.to_thread(_refresh_contacts_if_stale)
        except Exception as exc:  # noqa: BLE001
            print(f"contact refresh failed: {exc}")
        await asyncio.sleep(3 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    import _db  # noqa: PLC0415  (scripts/ is on sys.path via backend.db)

    _db.load_env()  # pick up the secret file before reading the flag below
    # Off by default: a local database is refreshed by hand (scripts/compute_contacts.py).
    refresher = (
        asyncio.create_task(_contact_refresher()) if os.environ.get("CONTACT_REFRESH") == "1" else None
    )
    if os.environ.get("SIMULATOR", "1") != "0":
        from . import simulator

        task = asyncio.create_task(simulator.loop())
    # Start the LISTEN thread lazily (needs a running loop for fan-out).
    try:
        loop = asyncio.get_running_loop()
        stream.ensure_listener(loop)
    except RuntimeError:
        pass
    yield
    if refresher is not None:
        refresher.cancel()
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    dbmod.close_all()


app = FastAPI(title="SomaiyaNet", lifespan=lifespan)

# The React app is a separate Render Static Site in production. Set
# CORS_ORIGINS to the exact frontend origin (comma-separated for multiple
# origins); leave unset for local same-origin/Vite-proxy development.
cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    import psycopg

    if isinstance(exc, psycopg.Error):
        role = None
        try:
            role = request.cookies.get("sn_role", "").split("|")[0] or None
        except Exception:
            pass
        return JSONResponse(
            status_code=sqlbook.status_for(exc),
            content={"error": sqlbook.error_payload(exc), "sql": sqlbook.get_log(), "role": role},
        )


app.include_router(profiles.router)
app.include_router(public.router)
app.include_router(mission.router)
app.include_router(routing.router)
app.include_router(ai.router)
app.include_router(deploy.router)
app.include_router(telecommand.router)
app.include_router(console.router)
app.include_router(stream.router)
app.include_router(labs_tx.router)
app.include_router(labs_security.router)
app.include_router(labs_index.router)
app.include_router(labs_norm.router)
app.include_router(labs_schema.router)

DIST = ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND"}})
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        index = DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND"}})
