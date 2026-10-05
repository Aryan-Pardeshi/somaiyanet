"""Compute the ISL + downlink contact graph with SGP4 sampling.

Horizon now()-6h .. now()+30h at 30 s steps; operational sats only.
Raw windows go through COPY into a TEMP table, then link scores come
from the SQL functions link_score_isl / link_score_downlink.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sgp4.api import Satrec, jday

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _db  # noqa: E402
import _orbit  # noqa: E402

STEP_S = 30
ISL_MAX_KM = 2000.0
RATE_BPS = 9600


def _windows(mask: np.ndarray) -> list[tuple[int, int]]:
    """Contiguous True runs as inclusive (i0, i1) index pairs."""
    out: list[tuple[int, int]] = []
    i, n = 0, len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and mask[j + 1]:
            j += 1
        out.append((i, j))
        i = j + 1
    return out


def run(conn_factory) -> None:
    now = datetime.now(timezone.utc)
    t_start = now - timedelta(hours=6)
    t_end = now + timedelta(hours=30)
    n_steps = int((t_end - t_start).total_seconds() // STEP_S) + 1
    times = [t_start + timedelta(seconds=STEP_S * k) for k in range(n_steps)]

    with conn_factory() as conn:
        sats = conn.execute(
            "SELECT node_id, plane, tle_line1, tle_line2 FROM satellite"
            " WHERE state <> 'STOWED' ORDER BY node_id"
        ).fetchall()
        stations = conn.execute(
            "SELECT node_id, latitude, longitude, altitude_m,"
            " min_elevation_deg FROM ground_station ORDER BY node_id"
        ).fetchall()

    sat_ids = [r[0] for r in sats]
    planes = {r[0]: r[1] for r in sats}
    satrecs = [Satrec.twoline2rv(r[2], r[3]) for r in sats]

    teme = _orbit.propagate_many(satrecs, times)  # [n_sat, n_time, 3]
    jd = np.empty(len(times))
    fr = np.empty(len(times))
    for j, t in enumerate(times):
        a, b = jday(t.year, t.month, t.day, t.hour, t.minute,
                    t.second + t.microsecond / 1e6)
        jd[j], fr[j] = a, b
    ecef = _orbit.teme_to_ecef_array(teme, jd, fr)  # [n_sat, n_time, 3]

    # Raw windows: (kind, from, to, start, end, min_range, max_el)
    raw: list[tuple] = []

    # --- ISL: every unordered pair, range <= 2000 km, both directions ---
    # Single plane A: neighbours sit ~12 deg (~1450 km) apart so adjacent
    # ISLs stay up; SS-1 -> SS-2 -> SS-3 gives the 2-hop relay demo.
    n_isl_windows = 0
    n_inplane = 0
    n_sat = len(sat_ids)
    for i in range(n_sat):
        for j in range(i + 1, n_sat):
            diff = ecef[i] - ecef[j]
            rng = np.linalg.norm(diff, axis=1)
            for i0, i1 in _windows(rng <= ISL_MAX_KM):
                start = times[i0]
                end = times[i1] + timedelta(seconds=STEP_S)
                if (end - start).total_seconds() < 60:
                    continue
                min_r = round(float(rng[i0:i1 + 1].min()), 1)
                a, b = sat_ids[i], sat_ids[j]
                raw.append(("ISL", a, b, start, end, min_r, None))
                raw.append(("ISL", b, a, start, end, min_r, None))
                n_isl_windows += 1
                if planes[a] == planes[b]:
                    n_inplane += 1

    # --- DOWNLINK: sat x station, el >= station mask ---
    dl_per_station: dict[str, int] = {}
    for si, sat_id in enumerate(sat_ids):
        for (gs, lat, lon, alt_m, min_el) in stations:
            _az, el, rng = _orbit.look_angles_array(
                float(lat), float(lon), float(alt_m) / 1000.0, ecef[si])
            mask = el >= float(min_el)
            for i0, i1 in _windows(mask):
                start = times[i0]
                end = times[i1] + timedelta(seconds=STEP_S)
                if (end - start).total_seconds() < 60:
                    continue
                seg = slice(i0, i1 + 1)
                k = int(np.argmax(el[seg])) + i0
                max_el = round(float(el[k]), 2)
                r_at_max = round(float(rng[k]), 1)
                raw.append(("DOWNLINK", sat_id, gs, start, end, r_at_max, max_el))
                dl_per_station[gs] = dl_per_station.get(gs, 0) + 1

    with conn_factory() as conn:
        with conn.transaction():
            conn.execute("TRUNCATE contact CASCADE")
            conn.execute(
                "CREATE TEMP TABLE tmp_windows (kind TEXT, from_node VARCHAR(12),"
                " to_node VARCHAR(12), start_ts TIMESTAMPTZ, end_ts TIMESTAMPTZ,"
                " rate_bps INT, min_range_km NUMERIC, max_el NUMERIC) ON COMMIT DROP"
            )
            with conn.cursor().copy(
                "COPY tmp_windows (kind, from_node, to_node, start_ts, end_ts,"
                " rate_bps, min_range_km, max_el) FROM STDIN"
            ) as cp:
                for row in raw:
                    kind, fn, tn, st, en, minr, maxel = row
                    cp.write_row((kind, fn, tn, st, en, RATE_BPS, minr, maxel))
            conn.execute(
                "INSERT INTO contact (kind, from_node, to_node, start_ts, end_ts,"
                " rate_bps, link_score, min_range_km, max_elevation_deg)"
                " SELECT kind::contact_kind, from_node, to_node, start_ts, end_ts,"
                " rate_bps,"
                " CASE WHEN kind = 'ISL'"
                " THEN link_score_isl(min_range_km)"
                " ELSE link_score_downlink(max_el, min_range_km) END,"
                " min_range_km, max_el FROM tmp_windows"
            )

    print(f"ISL windows (undirected pairs): {n_isl_windows}")
    print(f"in-plane ISL windows: {n_inplane}")
    print("downlinks per station:")
    for gs in sorted(dl_per_station):
        print(f"  {gs}: {dl_per_station[gs]}")

    assert n_inplane >= 1, "need at least 1 in-plane ISL window"
    # Every operational sat needs a downlink in the next 24 h.
    with conn_factory() as conn:
        rows = conn.execute(
            "SELECT DISTINCT from_node FROM contact WHERE kind = 'DOWNLINK'"
            " AND start_ts < now() + interval '24 hours'"
            " AND end_ts > now()"
        ).fetchall()
    have = {r[0] for r in rows}
    missing = [s for s in sat_ids if s not in have]
    assert not missing, f"sats with no downlink in next 24h: {missing}"
    print(f"all {len(sat_ids)} operational sats have a downlink in the next 24h")


if __name__ == "__main__":
    run(_db.connect)
