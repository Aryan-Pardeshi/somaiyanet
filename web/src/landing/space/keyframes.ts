import * as THREE from "three";
import { EARTH_R } from "@/landing/earth/Earth";

export interface KeyframeDef {
  earthCenter: [number, number];
  earthDiameter: number;
  satPos: [number, number];
  satSizePx: number;
  satRotation: [number, number, number]; // [pitch, yaw, roll]
  earthYawOffset: number;
  orbitArc: number;
  orbitShells: number;
  fleetOrbits: number;
}

export const WIDE_KEYFRAMES: readonly KeyframeDef[] = [
  // 0: network
  {
    earthCenter: [0.5, 1.3],
    earthDiameter: 1.5,
    satPos: [0.69, 0.58],
    satSizePx: 120,
    satRotation: [0.35, -0.65, 0.2],
    earthYawOffset: 0.1,
    orbitArc: 1.0,
    orbitShells: 0.0,
    fleetOrbits: 0.0,
  },
  // 1: satellites
  {
    earthCenter: [0.26, 0.56],
    earthDiameter: 0.84,
    satPos: [0.43, 0.2],
    satSizePx: 230,
    satRotation: [0.25, -0.4, 0.3],
    earthYawOffset: 0.45,
    orbitArc: 0.0,
    orbitShells: 1.0,
    fleetOrbits: 0.0,
  },
  // 2: downlink
  {
    earthCenter: [0.8, 1.02],
    earthDiameter: 1.25,
    satPos: [0.6, 0.14],
    satSizePx: 130,
    satRotation: [0.45, -0.8, 0.15],
    earthYawOffset: 1.1,
    orbitArc: 0.0,
    orbitShells: 0.35,
    fleetOrbits: 0.0,
  },
  // 3: database
  {
    earthCenter: [0.5, 0.31],
    earthDiameter: 0.4,
    satPos: [0.5, 0.4], // overridden by SS-1 projected pos if available
    satSizePx: 0.0,
    satRotation: [0.15, -0.5, 0.0],
    earthYawOffset: 0.4,
    orbitArc: 0.0,
    orbitShells: 0.0,
    fleetOrbits: 1.0,
  },
] as const;

export const NARROW_KEYFRAMES: readonly KeyframeDef[] = [
  // 0: network
  {
    earthCenter: [0.5, 1.12],
    earthDiameter: 0.78,
    satPos: [0.74, 0.7],
    satSizePx: 72,
    satRotation: [0.35, -0.65, 0.2],
    earthYawOffset: 0.1,
    orbitArc: 1.0,
    orbitShells: 0.0,
    fleetOrbits: 0.0,
  },
  // 1: satellites
  {
    earthCenter: [0.5, 0.3],
    earthDiameter: 0.4,
    satPos: [0.8, 0.1],
    satSizePx: 100,
    satRotation: [0.25, -0.4, 0.3],
    earthYawOffset: 0.45,
    orbitArc: 0.0,
    orbitShells: 1.0,
    fleetOrbits: 0.0,
  },
  // 2: downlink
  {
    earthCenter: [0.66, 0.36],
    earthDiameter: 0.48,
    satPos: [0.24, 0.1],
    satSizePx: 76,
    satRotation: [0.45, -0.8, 0.15],
    earthYawOffset: 1.1,
    orbitArc: 0.0,
    orbitShells: 0.35,
    fleetOrbits: 0.0,
  },
  // 3: database
  {
    earthCenter: [0.5, 0.3],
    earthDiameter: 0.38,
    satPos: [0.5, 0.3],
    satSizePx: 0.0,
    satRotation: [0.15, -0.5, 0.0],
    earthYawOffset: 0.4,
    orbitArc: 0.0,
    orbitShells: 0.0,
    fleetOrbits: 1.0,
  },
] as const;

export interface InterpolatedFrame {
  earthCenter: [number, number];
  earthDiameter: number;
  satPos: [number, number];
  satSizePx: number;
  satRotation: [number, number, number];
  earthYawOffset: number;
  orbitArc: number;
  orbitShells: number;
  fleetOrbits: number;
}

export function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

export function getVisibleFrustumHeight(fovDeg = 35, dist = 10): number {
  return 2 * dist * Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

export function screenToWorld(
  sx: number,
  sy: number,
  aspect: number,
  fovDeg = 35,
  dist = 10
): { x: number; y: number } {
  const H = getVisibleFrustumHeight(fovDeg, dist);
  const W = H * aspect;
  return {
    x: (sx - 0.5) * W,
    y: (0.5 - sy) * H,
  };
}

export function getEarthScale(diameter: number, H: number, earthR = EARTH_R): number {
  return (diameter * H) / (2 * earthR);
}

export function getSatelliteWorldSpan(
  sizePx: number,
  H: number,
  viewportHeight: number
): number {
  if (viewportHeight <= 0) return 0;
  return sizePx * (H / viewportHeight);
}

export function interpolateKeyframes(
  p: number,
  isWide: boolean
): InterpolatedFrame {
  const table = isWide ? WIDE_KEYFRAMES : NARROW_KEYFRAMES;
  const clampedP = Math.max(0, Math.min(table.length - 1, p));
  const i = Math.min(table.length - 2, Math.floor(clampedP));
  const f = clampedP - i;
  const t = smoothstep(0.18, 0.82, f);

  const k0 = table[i];
  const k1 = table[i + 1];

  return {
    earthCenter: [
      THREE.MathUtils.lerp(k0.earthCenter[0], k1.earthCenter[0], t),
      THREE.MathUtils.lerp(k0.earthCenter[1], k1.earthCenter[1], t),
    ],
    earthDiameter: THREE.MathUtils.lerp(k0.earthDiameter, k1.earthDiameter, t),
    satPos: [
      THREE.MathUtils.lerp(k0.satPos[0], k1.satPos[0], t),
      THREE.MathUtils.lerp(k0.satPos[1], k1.satPos[1], t),
    ],
    satSizePx: THREE.MathUtils.lerp(k0.satSizePx, k1.satSizePx, t),
    satRotation: [
      THREE.MathUtils.lerp(k0.satRotation[0], k1.satRotation[0], t),
      THREE.MathUtils.lerp(k0.satRotation[1], k1.satRotation[1], t),
      THREE.MathUtils.lerp(k0.satRotation[2], k1.satRotation[2], t),
    ],
    earthYawOffset: THREE.MathUtils.lerp(k0.earthYawOffset, k1.earthYawOffset, t),
    orbitArc: THREE.MathUtils.lerp(k0.orbitArc, k1.orbitArc, t),
    orbitShells: THREE.MathUtils.lerp(k0.orbitShells, k1.orbitShells, t),
    fleetOrbits: THREE.MathUtils.lerp(k0.fleetOrbits, k1.fleetOrbits, t),
  };
}
