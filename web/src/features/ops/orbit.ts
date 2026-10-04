// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Pure orbital math + geo helpers shared by the ops globe and its mock data.
// No React here, so both can import it cheaply.

import * as satellite from "satellite.js";

export const EARTH_R_KM = 6371;
export const DEG = Math.PI / 180;

export interface LatLngAlt {
  lat: number;
  lng: number;
  /** Altitude in globe radii (globe.gl convention). */
  alt: number;
}

/** Propagate a satrec to an absolute UTC instant. Null when not evaluable. */
export function propagateSat(
  rec: satellite.SatRec,
  whenMs: number,
): LatLngAlt | null {
  const d = new Date(whenMs);
  let pv: unknown;
  try {
    pv = satellite.propagate(rec, d);
  } catch {
    return null;
  }
  if (!pv || typeof pv !== "object") return null;
  const pos = (pv as { position?: unknown }).position;
  if (!pos) return null;
  const gmst = satellite.gstime(d);
  const gd = satellite.eciToGeodetic(
    pos as satellite.EciVec3<number>,
    gmst,
  );
  const lat = satellite.degreesLat(gd.latitude);
  const lng = satellite.degreesLong(gd.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, alt: gd.height / EARTH_R_KM };
}

/**
 * Sub-solar point for a given instant, so the terminator matches the UTC
 * clock instead of being decorative. Port of updateSun's astronomy half.
 */
export function subSolarLatLng(whenMs: number): { lat: number; lng: number } {
  const now = new Date(whenMs);
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = Math.floor((now.getTime() - start) / 86400000);
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const lng = 180 - (mins / 1440) * 360;
  return { lat, lng };
}

/** Unwrap a longitude sequence so trails never leap across the antimeridian. */
export function unwrapLng<T extends { lng: number }>(points: T[]): T[] {
  for (let i = 1; i < points.length; i++) {
    const d = points[i].lng - points[i - 1].lng;
    if (d > 180) points[i].lng -= 360;
    else if (d < -180) points[i].lng += 360;
  }
  return points;
}

const WGS84_A = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

function ecef(
  latDeg: number,
  lngDeg: number,
  altKm: number,
): [number, number, number] {
  const la = latDeg * DEG;
  const lo = lngDeg * DEG;
  const n =
    WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(la) * Math.sin(la));
  return [
    (n + altKm) * Math.cos(la) * Math.cos(lo),
    (n + altKm) * Math.cos(la) * Math.sin(lo),
    (n * (1 - WGS84_E2) + altKm) * Math.sin(la),
  ];
}

export interface StationGeo {
  lat: number;
  lng: number;
  altM?: number;
}

/**
 * Elevation + slant range of a satellite as seen from a ground station.
 * JS twin of look_angles() in scripts/_orbit.py (same WGS-84 ellipsoid).
 */
export function lookAnglesEl(
  station: StationGeo,
  sat: { lat: number; lng: number; alt: number },
  minElevDeg = 10,
): { el: number; range: number; visible: boolean } {
  const g = ecef(station.lat, station.lng, (station.altM ?? 0) / 1000);
  const s = ecef(sat.lat, sat.lng, sat.alt * EARTH_R_KM);
  const dx = s[0] - g[0];
  const dy = s[1] - g[1];
  const dz = s[2] - g[2];
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (range === 0) return { el: 90, range: 0, visible: true };
  const la = station.lat * DEG;
  const lo = station.lng * DEG;
  const ux = Math.cos(la) * Math.cos(lo);
  const uy = Math.cos(la) * Math.sin(lo);
  const uz = Math.sin(la);
  const sinEl = Math.max(-1, Math.min(1, (dx * ux + dy * uy + dz * uz) / range));
  const el = Math.asin(sinEl) / DEG;
  return { el, range, visible: el >= minElevDeg };
}

/** Great-circle distance between two subpoints, km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * DEG) *
      Math.cos(b.lat * DEG) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Link-score colour: ok good / warn fair / danger poor. */
export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "#5f6f93";
  if (score >= 70) return "#3ecf8e";
  if (score >= 40) return "#f5b142";
  return "#e5484d";
}

/** ISL line colour: ice gradient driven by link_score. */
export function islColor(score: number): string {
  const a = (0.3 + (0.7 * Math.max(0, Math.min(100, score))) / 100).toFixed(2);
  return `rgba(127,178,255,${a})`;
}

export function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function wrapLng(lng: number): number {
  return ((((lng % 360) + 540) % 360) - 180) as number;
}
