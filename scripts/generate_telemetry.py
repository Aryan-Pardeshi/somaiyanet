"""Generate 7 days of 1-row/min telemetry per operational sat.

Battery is a sinusoid over the orbit period plus noise with eclipse
dips; B2 drifts down over the last 24 h; the latest row per sat is
pinned to the spec story values. Inserts run as ai_router (proving the
INSERT grant), falling back to superuser before the security brief lands.
"""
from __future__ import annotations

import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _db  # noqa: E402

# Pinned latest battery per sat (spec section 4); B4/STOWED gets no rows.
PINNED_BATTERY = {
    "SAT-A1": 7.90, "SAT-A2": 7.60, "SAT-A3": 7.40, "SAT-A4": 7.10,
    "SAT-B1": 7.80, "SAT-B2": 6.95, "SAT-B3": 6.60,
}
BASE_MEAN = {
    "SAT-A1": 7.75, "SAT-A2": 7.55, "SAT-A3": 7.45, "SAT-A4": 7.30,
    "SAT-B1": 7.65, "SAT-B2": 7.05, "SAT-B3": 7.35,
}
MODES = ["TTC", "TTC", "TTC", "TTC", "SSTV", "M17", "M17", "CODEC2", "TTC", "M17"]
ADCS = ["DETUMBLED", "SUN_POINT", "NADIR", "TRACKING"]


def _router_conn(conn_factory):
    try:
        conn = conn_factory(user="ai_router", password=_db.role_password("ai_router"))
        # Probe the role: fails before db/07_security.sql creates it.
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return conn, True
    except Exception:
        print("WARNING: ai_router role missing, falling back to superuser")
        return conn_factory(), False


def run(conn_factory) -> None:
    rng = random.Random(7)
    # Partitions first, as superuser (ai_router must not own DDL).
    with conn_factory() as admin:
        with admin.transaction():
            admin.execute("SELECT ensure_telemetry_partitions(CURRENT_DATE - 8, CURRENT_DATE + 2)")

    with conn_factory() as admin:
        sats = admin.execute(
            "SELECT node_id, period_min FROM satellite WHERE state <> 'STOWED' ORDER BY node_id"
        ).fetchall()
    periods = {node: float(period) for node, period in sats}
    sat_ids = [node for node, _ in sats]

    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    per_sat = 7 * 24 * 60  # 10080 rows per sat
    start = end - timedelta(minutes=per_sat - 1)

    # Build all series in memory, enforce the 24 h average story, then COPY.
    series: dict[str, list[tuple]] = {}
    for sat in sat_ids:
        period = periods[sat]
        base = BASE_MEAN[sat]
        rows: list[tuple] = []
        for k in range(per_sat):
            ts = start + timedelta(minutes=k)
            phase = ((k % period) / period)
            sunlit = 1 if phase < 0.65 else 0
            batt = base + 0.25 * math.sin(2 * math.pi * phase) + rng.gauss(0, 0.04)
            batt += 0.10 if sunlit else -0.18
            if sat == "SAT-B2":  # drift down over the last 24 h
                mins_ago = per_sat - 1 - k
                if mins_ago <= 1440:
                    batt -= 0.9 * (1440 - mins_ago) / 1440.0
            batt = round(max(6.0, min(8.4, batt)), 2)
            temp = round((22.0 if sunlit else 8.0) + rng.gauss(0, 1.5), 2)
            solar = int(rng.gauss(480, 60)) if sunlit else rng.randint(0, 20)
            solar = max(0, solar)
            rssi = round(rng.uniform(-120, -90), 1)
            mode = rng.choice(MODES)
            hk = {
                "sunlit": bool(sunlit),
                "cpu_temp_c": round(temp + rng.uniform(2, 6), 2),
                "free_heap_kb": rng.randint(800, 4000),
                "uptime_s": k * 60,
                "reset_count": rng.randint(0, 2),
                "eclipse_in_s": 0 if sunlit else int((phase - 0.65) * period * 60),
                "adcs_mode": rng.choice(ADCS),
            }
            rows.append([ts, batt, temp, solar, rssi, mode, hk])
        # Enforce averages over the last 24 h (last 1440 rows, excl. latest).
        tail = [r[1] for r in rows[-1441:-1]]
        avg = sum(tail) / len(tail)
        if sat == "SAT-B2":
            if avg >= 7.0:
                shift = round(avg - 6.82, 2)
                for r in rows[:-1]:
                    r[1] = round(max(6.0, r[1] - shift), 2)
        elif avg < 7.0:
            shift = round(7.32 - avg, 2)
            for r in rows[:-1]:
                r[1] = round(min(8.4, r[1] + shift), 2)
        # Pin the latest row exactly.
        rows[-1][0] = end
        rows[-1][1] = PINNED_BATTERY[sat]
        series[sat] = rows

    conn, as_router = _router_conn(conn_factory)
    with conn:
        with conn.transaction():
            with conn.cursor().copy(
                "COPY telemetry (ts, sat_id, battery_v, temp_c, solar_ma,"
                " rssi_dbm, mode_active, housekeeping) FROM STDIN"
            ) as cp:
                for sat in sat_ids:
                    for ts, batt, temp, solar, rssi, mode, hk in series[sat]:
                        cp.write_row((ts, sat, batt, temp, solar, rssi, mode,
                                      json.dumps(hk)))
        # trg_telemetry_ingest keeps satellite.battery_v/last_seen current.
        # Only the superuser fallback (no roles/triggers yet) backfills by hand;
        # ai_router is deliberately not allowed to UPDATE satellite.
        if not as_router:
            with conn.transaction():
                for sat in sat_ids:
                    conn.execute(
                        "UPDATE satellite SET battery_v = %s, last_seen = %s"
                        " WHERE node_id = %s",
                        (PINNED_BATTERY[sat], end, sat),
                    )
    conn.close()

    total = per_sat * len(sat_ids)
    print(f"telemetry rows: {total} ({per_sat}/sat x {len(sat_ids)} sats)"
          f" as {'ai_router' if as_router else 'superuser fallback'}")
    print(f"latest ts: {end.isoformat()}")


if __name__ == "__main__":
    run(_db.connect)
