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
from .routers import ai, console, deploy, labs_index, labs_norm, labs_schema, labs_security, labs_tx, mission, profiles, routing, stream, telecommand

ROOT = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
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
