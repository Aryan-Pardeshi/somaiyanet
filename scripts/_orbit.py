# Adapted from reference/scripts/_orbit.py (friend's MIT-style physics layer).
"""SGP4 orbit helpers for SomaiyaNet: TLE parsing, propagation, look angles."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
from sgp4.api import Satrec, SatrecArray, jday

# WGS-84 ellipsoid used by the TLE/SGP4 world.
WGS84_A = 6378.137
WGS84_F = 1 / 298.257223563
WGS84_E2 = WGS84_F * (2 - WGS84_F)


# ---------------------------------------------------------------- TLE parse ---
def parse_tle_text(text: str) -> list[tuple[str, str, str]]:
    """Split a 3-line-per-object TLE file into (name, line1, line2)."""
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    out: list[tuple[str, str, str]] = []
    i = 0
    while i + 2 < len(lines):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            out.append((name.strip(), l1, l2))
            i += 3
        else:
            i += 1
    return out


def tle_epoch(line1: str) -> datetime:
    """Element-set epoch from columns 19-32 of line 1 (YYDDD.DDDDDDDD)."""
    from datetime import timedelta

    raw = line1[18:32].strip()
    yy = int(raw[:2])
    year = 2000 + yy if yy < 57 else 1900 + yy
    doy = float(raw[2:])
    return datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy - 1)


def tle_elements(line2: str) -> dict[str, float]:
    """Inclination, eccentricity, mean motion from fixed line-2 columns."""
    inclination = float(line2[8:16])
    eccentricity = float("0." + line2[26:33].strip())
    mean_motion = float(line2[52:63])
    return {
        "inclination_deg": inclination,
        "eccentricity": eccentricity,
        "mean_motion": mean_motion,
        "period_min": 1440.0 / mean_motion if mean_motion else 0.0,
    }


def norad_id(line1: str) -> int:
    """Catalogue number from columns 3-7 of line 1."""
    return int(line1[2:7])


# ------------------------------------------------------------------ rotation ---
def gmst_rad(jd: float, fr: float) -> float:
    """Greenwich mean sidereal time in radians (how far Earth has turned)."""
    d = jd + fr - 2451545.0
    t = d / 36525.0
    deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t
    return math.radians(deg % 360.0)


def gmst_rad_array(jd: np.ndarray, fr: np.ndarray) -> np.ndarray:
    """Vectorised GMST over whole time arrays."""
    d = np.asarray(jd, dtype=float) + np.asarray(fr, dtype=float) - 2451545.0
    t = d / 36525.0
    deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t
    return np.radians(np.mod(deg, 360.0))


def teme_to_ecef(r_teme: tuple[float, float, float], jd: float, fr: float) -> tuple[float, float, float]:
    """Single TEME position (km) -> ECEF (km) by GMST rotation about Z."""
    theta = gmst_rad(jd, fr)
    c, s = math.cos(theta), math.sin(theta)
    x, y, z = r_teme
    return (x * c + y * s, -x * s + y * c, z)


def teme_to_ecef_array(r_teme: np.ndarray, jd: np.ndarray, fr: np.ndarray) -> np.ndarray:
    """Array TEME (..., 3) -> ECEF (..., 3); jd/fr broadcast over time axis."""
    theta = gmst_rad_array(np.asarray(jd), np.asarray(fr))
    c = np.cos(theta)
    s = np.sin(theta)
    x = r_teme[..., 0] * c + r_teme[..., 1] * s
    y = -r_teme[..., 0] * s + r_teme[..., 1] * c
    z = r_teme[..., 2]
    return np.stack([x, y, z], axis=-1)


def teme_to_geodetic(r_km: tuple[float, float, float], jd: float, fr: float) -> tuple[float, float, float]:
    """TEME position -> (lat deg, lon deg, alt km) via ECEF + ellipsoid iteration."""
    ex, ey, ez = teme_to_ecef(r_km, jd, fr)
    lon = (math.degrees(math.atan2(ey, ex)) + 540.0) % 360.0 - 180.0
    p = math.hypot(ex, ey)
    lat = math.atan2(ez, p)
    for _ in range(8):  # converges in three or four
        n = WGS84_A / math.sqrt(1 - WGS84_E2 * math.sin(lat) ** 2)
        lat = math.atan2(ez + n * WGS84_E2 * math.sin(lat), p)
    n = WGS84_A / math.sqrt(1 - WGS84_E2 * math.sin(lat) ** 2)
    alt = p / math.cos(lat) - n if abs(math.cos(lat)) > 1e-9 else abs(ez) - n
    return math.degrees(lat), lon, alt


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_km: float) -> tuple[float, float, float]:
    """Lat/lon/alt -> Earth-centred Earth-fixed XYZ in km."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    n = WGS84_A / math.sqrt(1 - WGS84_E2 * math.sin(la) ** 2)
    return (
        (n + alt_km) * math.cos(la) * math.cos(lo),
        (n + alt_km) * math.cos(la) * math.sin(lo),
        (n * (1 - WGS84_E2) + alt_km) * math.sin(la),
    )


def geodetic_to_ecef_array(lat_deg: np.ndarray, lon_deg: np.ndarray, alt_km: np.ndarray | float):
    """Vectorised geodetic -> ECEF; inputs broadcast, output (..., 3)."""
    la = np.radians(np.asarray(lat_deg, dtype=float))
    lo = np.radians(np.asarray(lon_deg, dtype=float))
    alt = np.asarray(alt_km, dtype=float)
    n = WGS84_A / np.sqrt(1 - WGS84_E2 * np.sin(la) ** 2)
    return np.stack(
        [
            (n + alt) * np.cos(la) * np.cos(lo),
            (n + alt) * np.cos(la) * np.sin(lo),
            (n * (1 - WGS84_E2) + alt) * np.sin(la),
        ],
        axis=-1,
    )


def look_angles(
    st_lat: float, st_lon: float, st_alt_km: float, sat_ecef: tuple[float, float, float]
) -> tuple[float, float, float]:
    """(az deg, el deg, range km) of an ECEF satellite from a ground station."""
    gx, gy, gz = geodetic_to_ecef(st_lat, st_lon, st_alt_km)
    dx, dy, dz = sat_ecef[0] - gx, sat_ecef[1] - gy, sat_ecef[2] - gz
    rng = math.sqrt(dx * dx + dy * dy + dz * dz)
    if rng == 0:
        return 0.0, 90.0, 0.0
    la, lo = math.radians(st_lat), math.radians(st_lon)
    # ENU unit vectors at the station.
    e = (-math.sin(lo), math.cos(lo), 0.0)
    n = (-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la))
    u = (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    de = dx * e[0] + dy * e[1] + dz * e[2]
    dn = dx * n[0] + dy * n[1] + dz * n[2]
    du = dx * u[0] + dy * u[1] + dz * u[2]
    el = math.degrees(math.asin(max(-1.0, min(1.0, du / rng))))
    az = (math.degrees(math.atan2(de, dn)) + 360.0) % 360.0
    return az, el, rng


def look_angles_array(
    st_lat: float, st_lon: float, st_alt_km: float, sat_ecef: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Vectorised (az, el, range) for sat_ecef (..., 3)."""
    gx, gy, gz = geodetic_to_ecef(st_lat, st_lon, st_alt_km)
    d = sat_ecef - np.array([gx, gy, gz], dtype=float)
    rng = np.linalg.norm(d, axis=-1)
    la, lo = math.radians(st_lat), math.radians(st_lon)
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    de = d @ e
    dn = d @ n
    du = d @ u
    with np.errstate(invalid="ignore", divide="ignore"):
        el = np.degrees(np.arcsin(np.clip(np.where(rng > 0, du / np.maximum(rng, 1e-12), 0.0), -1.0, 1.0)))
    az = (np.degrees(np.arctan2(de, dn)) + 360.0) % 360.0
    return az, el, rng


# --------------------------------------------------------------- propagation ---
def _as_utc_list(times_utc) -> list[datetime]:
    out: list[datetime] = []
    for t in times_utc:
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        out.append(t.astimezone(timezone.utc))
    return out


def propagate_many(satrecs: list[Satrec], times_utc: list[datetime]) -> np.ndarray:
    """Propagate every sat at every time -> [n_sat, n_time, 3] TEME km.

    Uses SatrecArray + jday so one C++ call covers the whole grid.
    """
    times = _as_utc_list(list(times_utc))
    n_sat, n_time = len(satrecs), len(times)
    out = np.zeros((n_sat, n_time, 3), dtype=float)
    if n_sat == 0 or n_time == 0:
        return out
    jd = np.empty(n_time, dtype=float)
    fr = np.empty(n_time, dtype=float)
    for j, t in enumerate(times):
        a, b = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond / 1e6)
        jd[j], fr[j] = a, b
    arr = SatrecArray(satrecs)
    err, r, _v = arr.sgp4(jd, fr)
    return np.asarray(r, dtype=float)
