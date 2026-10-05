// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Mission-ops globe: live TLE propagation, real terminator, ISL lines,
// downlink beams, dotted orbit paths, and an imperative handle for route playback + flyTo.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Globe from "globe.gl";
import * as satellite from "satellite.js";
import type { ConstellationSat, Contact, Station } from "./api";
import type { GlobeView } from "./cc/types";
import {
  EARTH_R_KM,
  propagateSat,
  subSolarLatLng,
  unwrapLng,
  type LatLngAlt,
} from "./orbit";

export interface RoutePlaybackCallbacks {
  onHop?: (hopIndex: number) => void;
  onDone?: () => void;
}

export interface RouteHop {
  from_node: string;
  to_node: string;
  depart_ts?: string;
  arrive_ts?: string;
  kind: "ISL" | "DOWNLINK";
  link_score?: number | null;
}

export interface OpsGlobeHandle {
  playRoute: (hops: RouteHop[], callbacks?: RoutePlaybackCallbacks) => void;
  clearRoute: () => void;
  flyTo: (view: GlobeView) => void;
}

interface OpsGlobeProps {
  sats: ConstellationSat[];
  stations: Station[];
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  histories: Record<string, number[]>;
  highlightIds?: string[];
  defaultView?: GlobeView;
  myStation?: "GS-BOM" | "GS-HEL";
}

type World = InstanceType<typeof Globe>;

interface SatDatum {
  uid: string;
  label: string;
  lat: number;
  lng: number;
  alt: number;
  ok: boolean;
  el: HTMLDivElement;
}

interface StationDatum {
  uid: string;
  lat: number;
  lng: number;
  alt: number;
  el: HTMLDivElement;
}

interface PathDatum {
  pts: Array<[number, number, number]>;
  colors: string | [string, string];
  stroke: number;
  dashLength?: number;
  dashGap?: number;
  dashAnimateTime?: number;
}

const TRAIL_N = 70;
const MODEL_ALT = 525 / EARTH_R_KM;
// Display altitude: 525 km hugs the surface at this zoom, so markers, orbits
// and links are drawn on a raised shell (about 0.2 Earth radii) for legibility.
const VIS_ALT = 0.2;

interface PlaybackState {
  hops: RouteHop[];
  callbacks?: RoutePlaybackCallbacks;
  phase: "camera" | "travel" | "wait" | "done";
  phaseStartReal: number;
  hopIdx: number;
  completedHops: number;
}

function computeRouteFraming(
  nodeNames: string[],
  nodePosFn: (name: string) => LatLngAlt | null,
): { lat: number; lng: number; altitude: number } {
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let count = 0;
  const positions: Array<{ lat: number; lng: number; alt: number; x: number; y: number; z: number }> = [];

  for (const name of nodeNames) {
    const p = nodePosFn(name);
    if (!p) continue;
    const la = (p.lat * Math.PI) / 180;
    const lo = (p.lng * Math.PI) / 180;
    const x = Math.cos(la) * Math.cos(lo);
    const y = Math.sin(la);
    const z = Math.cos(la) * Math.sin(lo);
    positions.push({ ...p, x, y, z });
    sumX += x;
    sumY += y;
    sumZ += z;
    count++;
  }

  if (count === 0) {
    return { lat: 19.07, lng: 72.9, altitude: 2.2 };
  }

  const avgX = sumX / count;
  const avgY = sumY / count;
  const avgZ = sumZ / count;
  const len = Math.sqrt(avgX * avgX + avgY * avgY + avgZ * avgZ);

  let midLat = 19.07;
  let midLng = 72.9;
  if (len > 1e-4) {
    const unitY = avgY / len;
    midLat = Math.asin(Math.max(-1, Math.min(1, unitY))) * (180 / Math.PI);
    midLng = Math.atan2(avgZ, avgX) * (180 / Math.PI);
  }

  const mla = (midLat * Math.PI) / 180;
  const mlo = (midLng * Math.PI) / 180;
  const midX = Math.cos(mla) * Math.cos(mlo);
  const midY = Math.sin(mla);
  const midZ = Math.cos(mla) * Math.sin(mlo);

  let maxAngleRad = 0.2;
  for (const pos of positions) {
    const dot = Math.max(-1, Math.min(1, midX * pos.x + midY * pos.y + midZ * pos.z));
    const ang = Math.acos(dot);
    if (ang > maxAngleRad) maxAngleRad = ang;
  }

  const altitude = Math.min(2.8, Math.max(2.3, 1.7 + maxAngleRad * 1.0));
  // Aim a little south of the route so it sits in the upper half of the view,
  // clear of the route card docked at the bottom.
  return { lat: Math.max(-80, midLat - 9 * altitude), lng: midLng, altitude };
}

function generateIslPath(
  from: LatLngAlt,
  to: LatLngAlt,
  steps = 16,
): Array<[number, number, number]> {
  const getCart = (p: LatLngAlt) => {
    const R = 1 + p.alt;
    const latRad = p.lat * (Math.PI / 180);
    const lngRad = p.lng * (Math.PI / 180);
    return {
      x: R * Math.cos(latRad) * Math.sin(lngRad),
      y: R * Math.sin(latRad),
      z: R * Math.cos(latRad) * Math.cos(lngRad),
    };
  };
  const c1 = getCart(from);
  const c2 = getCart(to);
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * c1.x + t * c2.x;
    const y = (1 - t) * c1.y + t * c2.y;
    const z = (1 - t) * c1.z + t * c2.z;
    const r = Math.sqrt(x * x + y * y + z * z);
    const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * (180 / Math.PI);
    const lng = Math.atan2(x, z) * (180 / Math.PI);
    const alt = Math.max(0.004, r - 1.0);
    pts.push([lat, lng, alt]);
  }
  return pts;
}

function generateDownlinkPath(
  from: LatLngAlt,
  to: LatLngAlt,
  steps = 20,
): Array<[number, number, number]> {
  let dLng = to.lng - from.lng;
  if (dLng > 180) dLng -= 360;
  else if (dLng < -180) dLng += 360;

  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    let lng = from.lng + dLng * t;
    if (lng > 180) lng -= 360;
    else if (lng < -180) lng += 360;

    const easeDown = t * t * (3 - 2 * t);
    const alt = from.alt + (to.alt - from.alt) * easeDown;
    pts.push([lat, lng, alt]);
  }
  return pts;
}

function interpolateHopPos(
  from: LatLngAlt,
  to: LatLngAlt,
  kind: "ISL" | "DOWNLINK",
  k: number,
): LatLngAlt {
  if (kind === "ISL") {
    const R1 = 1 + from.alt;
    const lat1 = from.lat * (Math.PI / 180);
    const lng1 = from.lng * (Math.PI / 180);
    const x1 = R1 * Math.cos(lat1) * Math.sin(lng1);
    const y1 = R1 * Math.sin(lat1);
    const z1 = R1 * Math.cos(lat1) * Math.cos(lng1);

    const R2 = 1 + to.alt;
    const lat2 = to.lat * (Math.PI / 180);
    const lng2 = to.lng * (Math.PI / 180);
    const x2 = R2 * Math.cos(lat2) * Math.sin(lng2);
    const y2 = R2 * Math.sin(lat2);
    const z2 = R2 * Math.cos(lat2) * Math.cos(lng2);

    const x = (1 - k) * x1 + k * x2;
    const y = (1 - k) * y1 + k * y2;
    const z = (1 - k) * z1 + k * z2;
    const r = Math.sqrt(x * x + y * y + z * z);
    const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * (180 / Math.PI);
    const lng = Math.atan2(x, z) * (180 / Math.PI);
    const alt = Math.max(0.004, r - 1.0);
    return { lat, lng, alt };
  } else {
    let dLng = to.lng - from.lng;
    if (dLng > 180) dLng -= 360;
    else if (dLng < -180) dLng += 360;

    const lat = from.lat + (to.lat - from.lat) * k;
    let lng = from.lng + dLng * k;
    if (lng > 180) lng -= 360;
    else if (lng < -180) lng += 360;

    const easeDown = k * k * (3 - 2 * k);
    const alt = from.alt + (to.alt - from.alt) * easeDown;
    return { lat, lng, alt };
  }
}

export const OpsGlobe = forwardRef<OpsGlobeHandle, OpsGlobeProps>(
  function OpsGlobe(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<World | null>(null);
    const sunRef = useRef<{ lastMin: number; lights: unknown[] | null }>({
      lastMin: -1,
      lights: null,
    });
    const cloudsRef = useRef<{ obj: unknown } | null>(null);
    const simRef = useRef({ simMs: 0, lastReal: 0, speed: 1 });
    const recsRef = useRef(new Map<string, satellite.SatRec>());
    const satsRef = useRef<SatDatum[]>([]);
    const stationsRef = useRef<StationDatum[]>([]);
    const playRef = useRef<PlaybackState | null>(null);
    const liveRef = useRef(props);
    liveRef.current = props;

    const [booted, setBooted] = useState(false);

    const nodePos = (name: string, tMs: number): LatLngAlt | null => {
      const rec = recsRef.current.get(name);
      if (rec) {
        const p = propagateSat(rec, tMs);
        if (p) return { lat: p.lat, lng: p.lng, alt: VIS_ALT };
        return null;
      }
      const st = liveRef.current.stations.find((s) => s.node_id === name);
      if (st) return { lat: st.latitude, lng: st.longitude, alt: 0.004 };
      return null;
    };

    const playRouteHops = (
      hops: RouteHop[],
      callbacks?: RoutePlaybackCallbacks,
    ): void => {
      if (hops.length === 0) return;
      const world = worldRef.current;
      if (!world) return;

      const allNodes = Array.from(
        new Set(hops.flatMap((h) => [h.from_node, h.to_node])),
      );

      const framing = computeRouteFraming(allNodes, (name) =>
        nodePos(name, simRef.current.simMs),
      );

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) {
        world.pointOfView(framing, 0);
        playRef.current = {
          hops,
          callbacks,
          phase: "done",
          phaseStartReal: performance.now(),
          hopIdx: hops.length - 1,
          completedHops: hops.length,
        };
        const lastHop = hops[hops.length - 1];
        const dest = nodePos(lastHop.to_node, simRef.current.simMs);
        if (dest && dotRef.current) {
          try {
            const xy = world.getScreenCoords(dest.lat, dest.lng, dest.alt) as {
              x: number;
              y: number;
            };
            dotRef.current.style.display = "block";
            dotRef.current.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
          } catch {
            dotRef.current.style.display = "none";
          }
        }
        callbacks?.onHop?.(hops.length - 1);
        callbacks?.onDone?.();
        return;
      }

      // Step 1: Camera eases (1.2 s) to frame the whole route
      world.pointOfView(framing, 1200);

      // Step 2: The whole route appears first as a faint preview
      playRef.current = {
        hops,
        callbacks,
        phase: "camera",
        phaseStartReal: performance.now(),
        hopIdx: 0,
        completedHops: 0,
      };

      const startNode = nodePos(hops[0].from_node, simRef.current.simMs);
      if (startNode && dotRef.current) {
        try {
          const xy = world.getScreenCoords(
            startNode.lat,
            startNode.lng,
            startNode.alt,
          ) as { x: number; y: number };
          dotRef.current.style.display = "block";
          dotRef.current.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
        } catch {
          dotRef.current.style.display = "none";
        }
      }

      callbacks?.onHop?.(0);
    };

    const clearRoute = (): void => {
      playRef.current = null;
      if (dotRef.current) dotRef.current.style.display = "none";
      if (ringRef.current) ringRef.current.style.display = "none";
    };

    const flyToView = (view: GlobeView): void => {
      const world = worldRef.current;
      if (!world) return;
      if (view === "globe") {
        world.pointOfView({ lat: 19.07, lng: 72.9, altitude: 2.45 }, 1200);
      } else if (view === "mumbai") {
        const bom = liveRef.current.stations.find((s) => s.node_id === "GS-BOM");
        const lat = bom ? bom.latitude : 19.076;
        const lng = bom ? bom.longitude : 72.877;
        world.pointOfView({ lat, lng, altitude: 1.45 }, 1200);
      } else if (view === "espoo") {
        const hel = liveRef.current.stations.find((s) => s.node_id === "GS-HEL");
        const lat = hel ? hel.latitude : 60.2055;
        const lng = hel ? hel.longitude : 24.6559;
        world.pointOfView({ lat, lng, altitude: 1.45 }, 1200);
      } else if (view === "fleet") {
        const selId = liveRef.current.selectedId;
        const target =
          (selId ? satsRef.current.find((s) => s.uid === selId && s.ok) : null) ??
          satsRef.current.find((s) => s.ok);
        if (target) {
          world.pointOfView(
            { lat: target.lat, lng: target.lng, altitude: 1.75 },
            1200,
          );
        } else {
          world.pointOfView({ lat: 19.07, lng: 72.9, altitude: 2.2 }, 1200);
        }
      }
    };

    useImperativeHandle(ref, () => ({
      playRoute: playRouteHops,
      clearRoute,
      flyTo: flyToView,
    }));

    // ---- globe construction (once) ---------------------------------------
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      simRef.current.simMs = Date.now();
      simRef.current.lastReal = Date.now();
      const texBase = `${import.meta.env.BASE_URL}assets/textures`;

      const world: World = new Globe(el, {
        // The liquid-glass overlay copies this canvas each tick (see LiquidOverlay).
        rendererConfig: { preserveDrawingBuffer: true },
      })
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(`${texBase}/earth_night.jpg`)
        .bumpImageUrl(`${texBase}/earth_topology.jpg`)
        .showAtmosphere(true)
        .atmosphereColor("rgba(255, 255, 255, 0.12)")
        .atmosphereAltitude(0.04)
        .width(el.clientWidth)
        .height(el.clientHeight);
      worldRef.current = world;
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.28;
      world.controls().enableZoom = true;
      world.controls().minDistance = 160;
      world.controls().maxDistance = 700;
      if (liveRef.current.defaultView === "espoo") {
        world.pointOfView({ lat: 60.2055, lng: 24.6559, altitude: 1.45 }, 0);
      } else if (liveRef.current.defaultView === "mumbai") {
        world.pointOfView({ lat: 19.076, lng: 72.877, altitude: 1.45 }, 0);
      } else {
        world.pointOfView({ lat: 19.07, lng: 72.9, altitude: 2.45 }, 0);
      }
      world.onGlobeClick(() => liveRef.current.onSelect(null));

      // Ground station rings and default labels are cleared in favor of minimal HTML markers
      world.ringsData([]);
      world.labelsData([]);

      // Paths layer for:
      // 1. Thin white orbit paths
      // 2. Selected satellite orbit trail
      // 3. Contact lines & active route
      world
        .pathsData([])
        .pathPoints((d: object) => (d as PathDatum).pts)
        .pathPointLat((p: object) => (p as [number, number, number])[0])
        .pathPointLng((p: object) => (p as [number, number, number])[1])
        .pathPointAlt((p: object) => (p as [number, number, number])[2])
        .pathColor((d: object) => (d as PathDatum).colors)
        .pathStroke((d: object) => (d as PathDatum).stroke)
        .pathDashLength((d: object) => (d as PathDatum).dashLength ?? 0)
        .pathDashGap((d: object) => (d as PathDatum).dashGap ?? 0)
        .pathDashAnimateTime((d: object) => (d as PathDatum).dashAnimateTime ?? 0)
        .pathTransitionDuration(0);

      // HTML Elements for Satellites and Ground Stations
      world
        .htmlElementsData([])
        .htmlLat((d: object) => (d as { lat: number }).lat)
        .htmlLng((d: object) => (d as { lng: number }).lng)
        .htmlAltitude((d: object) => (d as { alt: number }).alt)
        .htmlTransitionDuration(0)
        .htmlElement((d: object) => (d as { el: HTMLDivElement }).el);


      // Sun and specular lighting
      try {
        const lights = world.lights() as unknown[];
        if (lights && lights.length >= 2) {
          sunRef.current.lights = lights;
          const amb = lights[0] as { intensity: number };
          const dir = lights[1] as { intensity: number };
          amb.intensity = Math.PI * 0.45;
          dir.intensity = Math.PI * 0.95;
          world.lights(lights as never);
        }
      } catch {
        // Headless fallback
      }

      const mat = world.globeMaterial() as unknown as Record<string, unknown>;
      if (mat) {
        mat["bumpScale"] = 3.2;
        const map = mat["map"] as {
          constructor: new (img: HTMLImageElement) => unknown;
          colorSpace: unknown;
          wrapS: unknown;
          wrapT: unknown;
          minFilter: unknown;
          magFilter: unknown;
        } | null;

        const loadTexture = (
          url: string,
          cb: (tex: Record<string, unknown>) => void,
        ): void => {
          if (!map) return;
          const TextureCtor = map.constructor;
          const img = new Image();
          img.onload = (): void => {
            const tex = new TextureCtor(img) as Record<string, unknown>;
            tex["colorSpace"] = map.colorSpace;
            tex["wrapS"] = map.wrapS;
            tex["wrapT"] = map.wrapT;
            tex["minFilter"] = map.minFilter;
            tex["magFilter"] = map.magFilter;
            tex["needsUpdate"] = true;
            cb(tex);
          };
          img.src = url;
        };

        loadTexture(`${texBase}/earth_specular.jpg`, (tex) => {
          mat["specularMap"] = tex;
          const sp = mat["specular"] as {
            setRGB?: (r: number, g: number, b: number) => void;
          } | null;
          if (sp?.setRGB) sp.setRGB(0.4, 0.5, 0.65);
          mat["shininess"] = 24;
          mat["needsUpdate"] = true;
        });

        loadTexture(`${texBase}/earth_clouds.jpg`, (tex) => {
          const holder: { mesh: unknown } = { mesh: null };
          try {
            const scene = world.scene() as {
              traverse: (cb: (o: unknown) => void) => void;
            };
            scene.traverse((o) => {
              const mesh = o as {
                isMesh?: boolean;
                material?: unknown;
                geometry?: {
                  parameters?: { radius?: number };
                  constructor: new (r: number, w: number, h: number) => unknown;
                };
                constructor: new (g: unknown, m: unknown) => unknown;
                add: (c: unknown) => void;
              };
              if (!holder.mesh && mesh.isMesh && mesh.material === mat) {
                const r = mesh.geometry?.parameters?.radius;
                if (!r || !mesh.geometry) return;
                const MatCtor = (
                  mat as { constructor: new (p: unknown) => unknown }
                ).constructor;
                const cloudMat = new MatCtor({
                  map: tex,
                  alphaMap: tex,
                  transparent: true,
                  opacity: 0.35,
                  depthWrite: false,
                });
                const clouds = new mesh.constructor(
                  new mesh.geometry.constructor(r * 1.012, 72, 48),
                  cloudMat,
                );
                (clouds as { renderOrder: number }).renderOrder = 1;
                mesh.add(clouds);
                holder.mesh = clouds;
                cloudsRef.current = { obj: clouds };
              }
            });
          } catch {
            // Cloud shell failure ignore
          }
        });
      }

      const updateSun = (whenMs: number): void => {
        const entry = sunRef.current;
        const dir = (entry.lights?.[1] ?? null) as {
          position: { set: (x: number, y: number, z: number) => void };
        } | null;
        if (!dir) return;
        const d = new Date(whenMs);
        const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (mins === entry.lastMin) return;
        entry.lastMin = mins;
        const { lat, lng } = subSolarLatLng(whenMs);
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((90 - lng) * Math.PI) / 180;
        const D = 800;
        dir.position.set(
          D * Math.sin(phi) * Math.cos(theta),
          D * Math.cos(phi),
          D * Math.sin(phi) * Math.sin(theta),
        );
      };

      let raf = 0;
      let lastLayer = 0;
      let lastPath = 0;

      const tick = (): void => {
        raf = requestAnimationFrame(tick);
        const real = Date.now();
        const S = simRef.current;
        if (S.speed === 1) S.simMs = real;
        else S.simMs += (real - S.lastReal) * S.speed;
        S.lastReal = real;
        const simMs = S.simMs;

        const clouds = cloudsRef.current?.obj as {
          rotation?: { y: number };
        } | null;
        if (clouds?.rotation) clouds.rotation.y += 0.0001;
        updateSun(simMs);

        // Propagate every sat from its TLE
        for (const s of satsRef.current) {
          const rec = recsRef.current.get(s.uid);
          if (!rec) {
            s.ok = false;
            continue;
          }
          const p = propagateSat(rec, simMs);
          if (p) {
            s.lat = p.lat;
            s.lng = p.lng;
            s.alt = VIS_ALT;
            s.ok = true;
          } else {
            s.ok = false;
          }
        }

        // Packet-dot & ring playback for packet route
        const play = playRef.current;
        const dot = dotRef.current;
        const ring = ringRef.current;

        if (play && dot) {
          if (play.phase === "camera") {
            const startNode = nodePos(play.hops[0].from_node, simMs);
            if (startNode) {
              try {
                const xy = world.getScreenCoords(
                  startNode.lat,
                  startNode.lng,
                  startNode.alt,
                ) as { x: number; y: number };
                dot.style.display = "block";
                dot.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
              } catch {
                dot.style.display = "none";
              }
            }
            if (real - play.phaseStartReal >= 1200) {
              play.phase = "travel";
              play.phaseStartReal = real;
              play.hopIdx = 0;
            }
          } else if (play.phase === "travel") {
            const hop = play.hops[play.hopIdx];
            const hopElapsed = real - play.phaseStartReal;
            const progress = Math.min(1, hopElapsed / 1600);
            const k = (1 - Math.cos(progress * Math.PI)) / 2;

            const from = nodePos(hop.from_node, simMs);
            const to = nodePos(hop.to_node, simMs);
            if (from && to) {
              const packetPos = interpolateHopPos(from, to, hop.kind, k);
              try {
                const xy = world.getScreenCoords(
                  packetPos.lat,
                  packetPos.lng,
                  packetPos.alt,
                ) as { x: number; y: number };
                dot.style.display = "block";
                dot.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
              } catch {
                dot.style.display = "none";
              }
            }

            if (progress >= 1) {
              play.completedHops = play.hopIdx + 1;
              play.phase = "wait";
              play.phaseStartReal = real;
            }
          } else if (play.phase === "wait") {
            const waitElapsed = real - play.phaseStartReal;
            const waitProgress = Math.min(1, waitElapsed / 600);
            const currNodeName = play.hops[play.hopIdx].to_node;
            const currNode = nodePos(currNodeName, simMs);

            if (currNode) {
              try {
                const xy = world.getScreenCoords(
                  currNode.lat,
                  currNode.lng,
                  currNode.alt,
                ) as { x: number; y: number };
                dot.style.display = "block";
                dot.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;

                if (ring && waitProgress < 1) {
                  const size = 8 + waitProgress * 30;
                  const alpha = Math.max(0, 1 - waitProgress);
                  ring.style.display = "block";
                  ring.style.width = `${size.toFixed(1)}px`;
                  ring.style.height = `${size.toFixed(1)}px`;
                  ring.style.borderColor = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
                  ring.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
                }
              } catch {
                dot.style.display = "none";
                if (ring) ring.style.display = "none";
              }
            }

            if (waitProgress >= 1) {
              if (ring) ring.style.display = "none";
              if (play.hopIdx + 1 < play.hops.length) {
                play.hopIdx += 1;
                play.phase = "travel";
                play.phaseStartReal = real;
                play.callbacks?.onHop?.(play.hopIdx);
              } else {
                play.phase = "done";
                play.callbacks?.onDone?.();
              }
            }
          } else if (play.phase === "done") {
            const destNodeName = play.hops[play.hops.length - 1].to_node;
            const destNode = nodePos(destNodeName, simMs);
            if (destNode) {
              try {
                const xy = world.getScreenCoords(
                  destNode.lat,
                  destNode.lng,
                  destNode.alt,
                ) as { x: number; y: number };
                dot.style.display = "block";
                dot.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
              } catch {
                dot.style.display = "none";
              }
            }
            if (ring) ring.style.display = "none";
          }
        } else {
          if (dot && dot.style.display !== "none") dot.style.display = "none";
          if (ring && ring.style.display !== "none") ring.style.display = "none";
        }

        // Layer refresh throttled
        if (real - lastLayer > 180) {
          lastLayer = real;
          const visible = satsRef.current.filter((s) => s.ok);
          world.htmlElementsData([...visible, ...stationsRef.current] as unknown as object[]);

          // Check screen distance to avoid label overlap when satellites bunch up:
          // For markers closer than about 28px on screen, hide the label of the non-selected ones
          // and show it on hover; the selected satellite always shows its label.
          const selId = liveRef.current.selectedId;
          const coords: Array<{ sat: SatDatum; x: number; y: number }> = [];
          for (const s of visible) {
            try {
              const xy = world.getScreenCoords(s.lat, s.lng, s.alt) as
                | { x: number; y: number }
                | undefined;
              if (xy && Number.isFinite(xy.x) && Number.isFinite(xy.y)) {
                coords.push({ sat: s, x: xy.x, y: xy.y });
              }
            } catch {
              // ignore
            }
          }

          for (let i = 0; i < coords.length; i++) {
            const a = coords[i];
            let isClustered = false;
            for (let j = 0; j < coords.length; j++) {
              if (i === j) continue;
              const b = coords[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              if (dx * dx + dy * dy < 28 * 28) {
                isClustered = true;
                break;
              }
            }
            const shouldHide = isClustered && a.sat.uid !== selId;
            a.sat.el.classList.toggle("ops-hide-tag", shouldHide);
          }
        }

        const pathInterval = playRef.current ? 80 : 600;
        if (real - lastPath > pathInterval) {
          lastPath = real;
          const paths: PathDatum[] = [];
          const { selectedId, contacts, stations, sats } = liveRef.current;

          // 1. Thin white orbit path for each active satellite (1px white at 25%)
          const periodMs = 95.1 * 60 * 1000;
          for (const s of sats) {
            if (s.state === "STOWED") continue;
            const rec = recsRef.current.get(s.node_id);
            if (!rec) continue;
            const orbitPts: LatLngAlt[] = [];
            const steps = 64;
            for (let i = 0; i <= steps; i++) {
              const q = propagateSat(rec, simMs + (i / steps) * periodMs);
              if (q) orbitPts.push(q);
            }
            if (orbitPts.length >= 2) {
              unwrapLng(orbitPts);
              paths.push({
                pts: orbitPts.map(
                  (q) => [q.lat, q.lng, VIS_ALT] as [number, number, number],
                ),
                colors: "rgba(255, 255, 255, 0.25)",
                stroke: 1.0,
                dashLength: 0.012,
                dashGap: 0.012,
              });
            }
          }

          // 2. Selected satellite orbit trail (white at 15-35%)
          if (selectedId) {
            const rec = recsRef.current.get(selectedId);
            const datum = satsRef.current.find((s) => s.uid === selectedId);
            if (rec && datum) {
              const span = periodMs * 0.35;
              const seq: LatLngAlt[] = [];
              for (let i = TRAIL_N; i >= 0; i--) {
                const q = propagateSat(rec, simMs - span * (i / TRAIL_N));
                if (q) seq.push(q);
              }
              if (seq.length >= 2) {
                unwrapLng(seq);
                paths.push({
                  pts: seq.map(
                    (q) => [q.lat, q.lng, VIS_ALT] as [number, number, number],
                  ),
                  colors: ["rgba(255, 255, 255, 0.15)", "rgba(255, 255, 255, 0.35)"],
                  stroke: 1.5,
                });
              }
            }
          }

          // 3. Contact/link lines (white at 60%)
          const pos = new Map<string, LatLngAlt>();
          for (const s of satsRef.current)
            if (s.ok) pos.set(s.uid, { lat: s.lat, lng: s.lng, alt: s.alt });
          const seen = new Set<string>();
          for (const c of contacts) {
            const t0 = Date.parse(c.start_ts);
            const t1 = Date.parse(c.end_ts);
            if (!(t0 <= simMs && simMs <= t1)) continue;
            const key = `${c.kind}:${c.from_node}:${c.to_node}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (c.kind === "ISL") {
              const a = pos.get(c.from_node);
              const b = pos.get(c.to_node);
              if (!a || !b) continue;
              paths.push({
                pts: [
                  [a.lat, a.lng, a.alt],
                  [b.lat, b.lng, b.alt],
                ],
                colors: "rgba(255, 255, 255, 0.60)",
                stroke: 1.0,
              });
            } else {
              const a = pos.get(c.from_node);
              const st = stations.find((s) => s.node_id === c.to_node);
              if (!a || !st) continue;
              paths.push({
                pts: [
                  [st.latitude, st.longitude, 0.004],
                  [a.lat, a.lng, a.alt],
                ],
                colors: "rgba(255, 255, 255, 0.60)",
                stroke: 1.0,
              });
            }
          }

          // 4. Packet route lines (#ff453a)
          if (playRef.current) {
            const p = playRef.current;
            for (let i = 0; i < p.hops.length; i++) {
              const hop = p.hops[i];
              const from = nodePos(hop.from_node, simMs);
              const to = nodePos(hop.to_node, simMs);
              if (!from || !to) continue;

              const pts =
                hop.kind === "ISL"
                  ? generateIslPath(from, to)
                  : generateDownlinkPath(from, to);

              if (i < p.completedHops) {
                // Completed hop becomes solid 2px #ff453a and stays
                paths.push({
                  pts,
                  colors: "#ff453a",
                  stroke: 2.0,
                  dashLength: 0,
                  dashGap: 0,
                });
              } else {
                // Faint preview: each hop drawn 1px #ff453a at 30% (dashed)
                paths.push({
                  pts,
                  colors: "rgba(255, 69, 58, 0.30)",
                  stroke: 1.0,
                  dashLength: 0.015,
                  dashGap: 0.015,
                });
              }
            }
          }

          world.pathsData(paths as unknown as object[]);
        }
      };
      raf = requestAnimationFrame(tick);

      const bootTimer = window.setTimeout(() => setBooted(true), 900);
      const onResize = (): void => {
        world.width(el.clientWidth).height(el.clientHeight);
      };
      window.addEventListener("resize", onResize);

      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(bootTimer);
        window.removeEventListener("resize", onResize);
        try {
          world._destructor();
        } catch {
          // ignore
        }
        worldRef.current = null;
      };
    }, []);

    // ---- data sync: TLEs -> satrecs + HTML ring markers -------------------
    useEffect(() => {
      const world = worldRef.current;
      for (const s of props.sats) {
        if (!recsRef.current.has(s.node_id)) {
          try {
            recsRef.current.set(
              s.node_id,
              satellite.twoline2satrec(s.tle_line1, s.tle_line2),
            );
          } catch {
            // invalid TLE
          }
        }
      }
      if (!world) return;

      const byUid = new Map(satsRef.current.map((s) => [s.uid, s]));
      const next: SatDatum[] = [];
      const { highlightIds, selectedId } = props;

      for (const s of props.sats) {
        if (s.state === "STOWED") continue; // Stowed sats don't orbit
        const isSelected = selectedId === s.node_id;
        const isDimmed =
          highlightIds !== undefined &&
          highlightIds.length > 0 &&
          !highlightIds.includes(s.node_id);

        let datum = byUid.get(s.node_id);
        if (!datum) {
          const div = document.createElement("div");
          div.className = "ops-marker";
          div.innerHTML = `
            <div class="ops-marker-dot"></div>
            <div class="ops-marker-tag">${s.node_id.replace("SAT-", "")}</div>
          `;
          div.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const cur = liveRef.current;
            cur.onSelect(cur.selectedId === s.node_id ? null : s.node_id);
          });
          datum = {
            uid: s.node_id,
            label: s.display_name || s.node_id,
            lat: 0,
            lng: 0,
            alt: MODEL_ALT,
            ok: true,
            el: div,
          };
          const p = recsRef.current.get(s.node_id);
          const here = p ? propagateSat(p, Date.now()) : null;
          if (here) {
            datum.lat = here.lat;
            datum.lng = here.lng;
            datum.alt = VIS_ALT;
          }
        }

        // Apply dynamic styles & classes
        datum.el.classList.toggle("ops-selected", isSelected);
        datum.el.classList.toggle("ops-dimmed", isDimmed);

        next.push(datum);
      }
      satsRef.current = next;

      // Stations
      const stationByUid = new Map(stationsRef.current.map((st) => [st.uid, st]));
      const nextStations: StationDatum[] = [];
      for (const st of props.stations) {
        const isMumbai = st.node_id === "GS-BOM";
        const isMine = st.node_id === props.myStation;
        let datum = stationByUid.get(st.node_id);
        if (!datum) {
          const div = document.createElement("div");
          div.className = "ops-station-marker";
          div.innerHTML = `
            <div class="ops-station-sq ${isMumbai ? "ops-mumbai" : ""}"></div>
            <div class="ops-station-tag">${st.node_id}${isMine ? " (Your station)" : ""}</div>
          `;
          datum = {
            uid: st.node_id,
            lat: st.latitude,
            lng: st.longitude,
            alt: 0.004,
            el: div,
          };
        } else {
          datum.lat = st.latitude;
          datum.lng = st.longitude;
          const tag = datum.el.querySelector(".ops-station-tag");
          if (tag) tag.textContent = `${st.node_id}${isMine ? " (Your station)" : ""}`;
        }
        nextStations.push(datum);
      }
      stationsRef.current = nextStations;
    }, [props.sats, props.stations, props.selectedId, props.highlightIds, props.myStation]);

    return (
      <div className="relative h-full w-full overflow-hidden bg-black select-none">
        <style>{`
 .ops-marker {
 position: relative;
 cursor: pointer;
 pointer-events: auto;
 user-select: none;
 display: flex;
 align-items: center;
 transform: translate(-3px, -3px);
 transition: opacity 0.2s ease;
 }
 .ops-marker.ops-dimmed {
 opacity: 0.18 !important;
 pointer-events: none !important;
 }
 .ops-marker-dot {
 width: 6px;
 height: 6px;
 border-radius: 50%;
 background: #ffffff;
 flex-shrink: 0;
 transition: background-color 0.2s ease;
 }
 .ops-marker.ops-selected .ops-marker-dot {
 background: #0a84ff;
 width: 7px;
 height: 7px;
 }
 .ops-marker-tag {
 position: absolute;
 left: 10px;
 top: 50%;
 transform: translateY(-50%);
 font-family: var(--font-display, "Barlow", sans-serif);
 font-size: 11px;
 font-weight: 600;
 letter-spacing: 0.04em;
 text-transform: capitalize;
 white-space: nowrap;
 color: rgba(255, 255, 255, 0.8);
 pointer-events: none;
 transition: opacity 0.2s ease;
 }
 .ops-marker.ops-selected .ops-marker-tag {
 left: 11px;
 color: #ffffff;
 }
 .ops-marker.ops-hide-tag:not(.ops-selected) .ops-marker-tag {
 opacity: 0;
 pointer-events: none;
 }
 .ops-marker.ops-hide-tag:not(.ops-selected):hover .ops-marker-tag,
 .ops-marker:hover .ops-marker-tag {
 opacity: 1;
 pointer-events: auto;
 }

 .ops-station-marker {
 position: relative;
 display: flex;
 align-items: center;
 pointer-events: none;
 user-select: none;
 transform: translate(-3px, -3px);
 }
 .ops-station-sq {
 width: 6px;
 height: 6px;
 background: #ffffff;
 flex-shrink: 0;
 }
 .ops-station-tag {
 position: absolute;
 left: 10px;
 top: 50%;
 transform: translateY(-50%);
 font-family: var(--font-display, "Barlow", sans-serif);
 font-size: 11px;
 font-weight: 500;
 letter-spacing: 0.04em;
 text-transform: capitalize;
 white-space: nowrap;
 color: rgba(255, 255, 255, 0.7);
 }
 `}</style>
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={dotRef}
          className="pointer-events-none absolute left-0 top-0 z-30 hidden rounded-full bg-[#ff453a]"
          style={{
            width: "8px",
            height: "8px",
            display: "none",
          }}
        />
        <div
          ref={ringRef}
          className="pointer-events-none absolute left-0 top-0 z-30 hidden rounded-full border border-white"
          style={{
            display: "none",
          }}
        />

        {!booted && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
            <p className="font-[family-name:var(--font-display)] text-[12px] capitalize text-[var(--sx-text-3)]">
              Acquiring Constellation Orbit…
            </p>
          </div>
        )}
      </div>
    );
  },
);
