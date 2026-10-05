"""Live simulator: telemetry ticks, round-robin decisions, KPI refresh."""
from __future__ import annotations

import asyncio
import datetime
import os
import random

from . import db as dbmod
from . import sqlbook


async def _telemetry_tick() -> None:
    # One row per operational sat, continuing from last battery with drift.
    try:
        sats = sqlbook.run(
            "mission_director",
            "simulator sats",
            "SELECT node_id, COALESCE(battery_v, 7.5)::float8 AS bv, state "
            "FROM satellite WHERE state IN ('NOMINAL','SAFE','COMMISSIONING')",
            superuser=True,
        )
    except Exception:
        return
    now = datetime.datetime.now(datetime.timezone.utc)
    for s in sats:
        sat = s["node_id"]
        try:
            bv = float(s.get("bv") or 7.5)
        except Exception:
            bv = 7.5
        # Keep demo story: SS-3 stays critical, SS-2 hovers 6.9-7.0.
        if sat == "SS-3":
            bv = min(bv + random.uniform(-0.03, 0.01), 6.65)
        elif sat == "SS-2":
            bv = 6.95 + random.uniform(-0.05, 0.05)
        else:
            bv = max(6.5, min(8.2, bv + random.uniform(-0.04, 0.04)))
        bv = round(bv, 2)
        temp = round(20 + random.uniform(-3, 8), 2)
        solar = random.randint(150, 420)
        try:
            sqlbook.run(
                "ai_router",
                f"simulator telemetry {sat}",
                "INSERT INTO telemetry (ts, sat_id, battery_v, temp_c, solar_ma, housekeeping) "
                "VALUES (%s, %s, %s, %s, %s, %s::jsonb)",
                (now.isoformat(), sat, bv, temp, solar, '{"sunlit": true}'),
            )
        except Exception:
            continue


async def _decide_tick(state: dict) -> None:
    try:
        sats = sqlbook.run(
            "mission_director",
            "simulator decide sats",
            "SELECT node_id FROM satellite WHERE state IN ('NOMINAL','SAFE','COMMISSIONING') ORDER BY node_id",
            superuser=True,
        )
    except Exception:
        return
    if not sats:
        return
    idx = state.get("idx", 0) % len(sats)
    sat = sats[idx]["node_id"]
    state["idx"] = idx + 1
    try:
        sqlbook.run(
            "ai_router",
            f"simulator decide {sat}",
            "SELECT (decide_for_satellite(%s)).*",
            (sat,),
            many=False,
        )
    except Exception:
        pass


async def _kpi_tick() -> None:
    try:
        sqlbook.run(
            "mission_director",
            "simulator refresh mv_kpis",
            "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpis",
            superuser=True,
        )
    except Exception:
        pass


async def _ensure_partitions_tick() -> None:
    try:
        sqlbook.run(
            "mission_director",
            "simulator ensure partitions",
            "SELECT ensure_telemetry_partitions(CURRENT_DATE - 1, CURRENT_DATE + 2)",
            superuser=True,
        )
    except Exception:
        pass


async def loop() -> None:
    if os.environ.get("SIMULATOR", "1") == "0":
        return
    state: dict = {"idx": 0}
    t5 = 0.0
    t30 = 0.0
    t60 = 0.0
    import time as _time

    last_part = 0.0
    while True:
        now = _time.monotonic()
        try:
            if now - t5 >= 5:
                t5 = now
                await _telemetry_tick()
            if now - t30 >= 30:
                t30 = now
                await _decide_tick(state)
            if now - t60 >= 60:
                t60 = now
                await _kpi_tick()
            if now - last_part >= 86400:
                last_part = now
                await _ensure_partitions_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(1)
