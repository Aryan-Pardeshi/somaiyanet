import * as THREE from "three";
import * as satellite from "satellite.js";
import { propagateSat } from "@/features/ops/orbit";
import { EARTH_R } from "./Earth";

const DEG_TO_RAD = Math.PI / 180;

/** Satellites are drawn at their true altitude (about 525 km, 8% of the radius). */
export const ALT_SCALE = 1;

/**
 * 3D position on or above the Earth sphere.
 * Three.js SphereGeometry UV mapping convention:
 * x = r * cos(lat) * cos(lng)
 * y = r * sin(lat)
 * z = -r * cos(lat) * sin(lng)
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  r: number,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const phi = lat * DEG_TO_RAD;
  const theta = lng * DEG_TO_RAD;
  const cosLat = Math.cos(phi);
  out.set(
    r * cosLat * Math.cos(theta),
    r * Math.sin(phi),
    -r * cosLat * Math.sin(theta)
  );
  return out;
}

/**
 * Get 3D position of a satellite at whenMs using its SatRec.
 * r = EARTH_R * (1 + alt * ALT_SCALE)
 */
export function getSatVector3(
  rec: satellite.SatRec,
  whenMs: number,
  out = new THREE.Vector3()
): THREE.Vector3 | null {
  const p = propagateSat(rec, whenMs);
  if (!p) return null;
  const r = EARTH_R * (1 + p.alt * ALT_SCALE);
  return latLngToVector3(p.lat, p.lng, r, out);
}

/**
 * Station 3D position on the surface: r = EARTH_R * 1.002
 */
export function getStationVector3(
  lat: number,
  lng: number,
  out = new THREE.Vector3()
): THREE.Vector3 {
  return latLngToVector3(lat, lng, EARTH_R * 1.002, out);
}

/**
 * Compute packet position during transfer:
 * - isDownlink: moves along an arc descending to the station
 * - ISL: moves along the straight segment between two satellites
 */
export function interpolatePacketPos(
  fromPos: THREE.Vector3,
  toPos: THREE.Vector3,
  progress: number,
  isDownlink: boolean,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const p = Math.max(0, Math.min(1, progress));
  if (isDownlink) {
    const dir = fromPos.clone().normalize().lerp(toPos.clone().normalize(), p).normalize();
    const r = THREE.MathUtils.lerp(fromPos.length(), toPos.length(), p);
    out.copy(dir.multiplyScalar(r));
  } else {
    out.copy(fromPos).lerp(toPos, p);
  }
  return out;
}

/**
 * Format local time of an ISO timestamp or epoch ms as "HH:MM" (e.g. "18:42")
 */
export function formatLocalTime(ts: string | number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Format plan end date as e.g. "6 Oct, 23:44"
 */
export function formatPlanEndDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month}, ${time}`;
}
