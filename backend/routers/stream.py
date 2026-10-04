"""SSE fan-out for telemetry + decision notifies. No profile required."""
from __future__ import annotations

import asyncio
import json
import queue
import threading

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

_subscribers: set[asyncio.Queue] = set()
_thread_started = False
_loop: asyncio.AbstractEventLoop | None = None


def _broadcast(event: str, payload: str) -> None:
    global _loop
    if _loop is None:
        return
    for q in list(_subscribers):
        try:
            _loop.call_soon_threadsafe(q.put_nowait, (event, payload))
        except Exception:
            pass


def _listen_thread() -> None:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
    import _db  # noqa: E402
    import psycopg

    cfg = _db.settings()
    import os as _os

    dbname = _os.environ.get("SOMAIYANET_DB") or cfg["dbname"]
    try:
        conn = psycopg.connect(
            host=cfg["host"], port=cfg["port"], dbname=dbname,
            user=cfg["user"], password=cfg["password"], autocommit=True,
            application_name="somaiyanet:listen",
        )
    except Exception:
        return
    try:
        conn.execute("LISTEN telemetry")
        conn.execute("LISTEN decision")
        while True:
            try:
                for notify in conn.notifies(timeout=10):
                    try:
                        _broadcast(notify.channel, notify.payload)
                    except Exception:
                        pass
            except Exception:
                # Reconnect on failure.
                try:
                    conn.execute("LISTEN telemetry")
                    conn.execute("LISTEN decision")
                except Exception:
                    import time as _t

                    _t.sleep(5)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def ensure_listener(loop: asyncio.AbstractEventLoop) -> None:
    global _thread_started, _loop
    _loop = loop
    if _thread_started:
        return
    _thread_started = True
    t = threading.Thread(target=_listen_thread, daemon=True)
    t.start()


@router.get("/api/stream")
async def stream():
    global _loop
    try:
        _loop = asyncio.get_running_loop()
    except RuntimeError:
        pass
    ensure_listener(_loop)
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                try:
                    event, payload = await asyncio.wait_for(q.get(), timeout=15)
                    # payload is already JSON text from pg_notify.
                    yield f"event: {event}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            _subscribers.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream")
