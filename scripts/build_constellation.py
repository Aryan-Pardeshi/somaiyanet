"""Build the 4-satellite SomaiyaSat constellation with real SGP4 orbits.

Circular SSO at ~525 km, inclination 97.5 deg, single plane A RAAN 75 deg,
12-deg in-plane spacing. Inserts network_node + satellite rows in one
transaction per the spec pinned states.
"""
from __future__ import annotations

import math
import sys
from datetime import datetime, timezone
from pathlib import Path

from sgp4.api import WGS72, Satrec, jday
from sgp4.exporter import export_tle

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _db  # noqa: E402

# Pinned demo story: state per sat (latest battery pinned by telemetry step).
PINNED = {
    "SS-1": ("A", 1, "NOMINAL", 99901),
    "SS-2": ("A", 2, "NOMINAL", 99902),
    "SS-3": ("A", 3, "SAFE", 99903),
    "SS-4": ("A", 4, "STOWED", 99904),
}

RAAN = {"A": 75.0}
M0 = 0.0  # mean anomaly of slot 1; slot k gets M0 + (k-1)*12 deg
ALT_KM = 525.0
INCL_DEG = 97.5
ECC = 0.0001
MU = 398600.4418  # km^3/s^2
EARTH_R_KM = 6378.137


def mean_motion_rev_day(alt_km: float = ALT_KM) -> float:
    """Rev/day for a circular orbit at alt_km (Kepler's third law)."""
    a = EARTH_R_KM + alt_km
    return 86400.0 / (2 * math.pi) * math.sqrt(MU / a**3)


def build_tles(epoch_utc: datetime) -> dict[str, tuple[str, str, float, float]]:
    """Return node_id -> (line1, line2, incl_deg, mean_motion)."""
    jd, fr = jday(epoch_utc.year, epoch_utc.month, epoch_utc.day,
                  epoch_utc.hour, epoch_utc.minute, epoch_utc.second)
    epoch = jd + fr - 2433281.5
    n_rev_day = mean_motion_rev_day()
    n_rad_min = n_rev_day * 2 * math.pi / 1440.0
    out: dict[str, tuple[str, str, float, float]] = {}
    for node_id, (plane, slot, _state, norad) in PINNED.items():
        m_deg = M0 + (slot - 1) * 12.0
        sat = Satrec()
        sat.sgp4init(
            WGS72, "i", norad, epoch,
            0.0, 0.0, 0.0,  # bstar, ndot, nddot: clean two-line derivation
            ECC, 0.0,  # arg perigee 0 for near-circular
            math.radians(INCL_DEG), math.radians(m_deg),
            n_rad_min, math.radians(RAAN[plane]),
        )
        line1, line2 = export_tle(sat)
        assert len(line1) == 69 and len(line2) == 69, f"bad TLE length for {node_id}"
        # Round-trip check: lines must parse back through SGP4.
        Satrec.twoline2rv(line1, line2)
        out[node_id] = (line1, line2, INCL_DEG, n_rev_day)
    return out


def run(conn_factory) -> None:
    now = datetime.now(timezone.utc)
    epoch_utc = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tles = build_tles(epoch_utc)
    with conn_factory() as conn:
        with conn.transaction():
            for node_id, (plane, slot, state, norad) in PINNED.items():
                line1, line2, incl, mm = tles[node_id]
                pod_id = f"POD-{slot}"
                display = f"SomaiyaSat-{slot}"
                # Callsign like VU2SS1: SS-1 -> VU2SS1, SS-4 -> VU2SS4.
                callsign = f"VU2SS{slot}"
                conn.execute(
                    "INSERT INTO network_node (node_id, kind, display_name, callsign)"
                    " VALUES (%s, 'SAT', %s, %s)"
                    " ON CONFLICT (node_id) DO UPDATE SET display_name = EXCLUDED.display_name,"
                    " callsign = EXCLUDED.callsign, kind = 'SAT'",
                    (node_id, display, callsign),
                )
                conn.execute(
                    "INSERT INTO satellite (node_id, kind, norad_id, plane, slot, pod_id,"
                    " state, tle_line1, tle_line2, epoch_utc, inclination_deg,"
                    " mean_motion, mass_g)"
                    " VALUES (%s, 'SAT', %s, %s, %s, %s, %s::sat_state,"
                    " %s, %s, %s, %s, %s, 250.0)"
                    " ON CONFLICT (node_id) DO UPDATE SET norad_id = EXCLUDED.norad_id,"
                    " plane = EXCLUDED.plane, slot = EXCLUDED.slot, pod_id = EXCLUDED.pod_id,"
                    " state = EXCLUDED.state, tle_line1 = EXCLUDED.tle_line1,"
                    " tle_line2 = EXCLUDED.tle_line2, epoch_utc = EXCLUDED.epoch_utc,"
                    " inclination_deg = EXCLUDED.inclination_deg,"
                    " mean_motion = EXCLUDED.mean_motion",
                    (node_id, norad, plane, slot, pod_id, state,
                     line1, line2, epoch_utc, incl, mm),
                )
        rows = conn.execute(
            "SELECT node_id, state, period_min FROM satellite ORDER BY node_id"
        ).fetchall()
    print(f"{'sat':8} {'state':14} {'period_min':>10}")
    for node_id, state, period in rows:
        print(f"{node_id:8} {state:14} {float(period):10.3f}")


if __name__ == "__main__":
    run(_db.connect)
