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
  islColor,
  propagateSat,
  rgba,
  subSolarLatLng,
  unwrapLng,
  type LatLngAlt,
} from "./orbit";

export interface RouteHop {
  from_node: string;
  to_node: string;
  depart_ts: string;
  arrive_ts: string;
  kind: "ISL" | "DOWNLINK";
}

export interface OpsGlobeHandle {
  playRoute: (hops: RouteHop[]) => void;
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
  color: string;
  lat: number;
  lng: number;
  alt: number;
  ok: boolean;
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

const NOMINAL_COLOR = "#7ee2b8";
const SAFE_COLOR = "#f5a524";
const CRITICAL_COLOR = "#ff3b4f";
const STOWED_COLOR = "#4a5a8a";
const DOWNLINK_GREEN = "#3ecf8e";
const TRAIL_N = 70;
const MODEL_ALT = 525 / EARTH_R_KM;
// Display altitude: 525 km hugs the surface at this zoom, so markers, orbits
// and links are drawn on a raised shell (about 0.2 Earth radii) for legibility.
const VIS_ALT = 0.2;

function satStatusColor(s: ConstellationSat): string {
  if (s.state === "NOMINAL") return NOMINAL_COLOR;
  if (s.state === "SAFE") return SAFE_COLOR;
  if (s.state === "CRITICAL") return CRITICAL_COLOR;
  return STOWED_COLOR;
}

export const OpsGlobe = forwardRef<OpsGlobeHandle, OpsGlobeProps>(
  function OpsGlobe(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<World | null>(null);
    const sunRef = useRef<{ lastMin: number; lights: unknown[] | null }>({
      lastMin: -1,
      lights: null,
    });
    const cloudsRef = useRef<{ obj: unknown } | null>(null);
    const simRef = useRef({ simMs: 0, lastReal: 0, speed: 1 });
    const recsRef = useRef(new Map<string, satellite.SatRec>());
    const satsRef = useRef<SatDatum[]>([]);
    const playRef = useRef<{
      hops: RouteHop[];
      idx: number;
      t0: number;
      dur: number;
      from: LatLngAlt;
      to: LatLngAlt;
    } | null>(null);
    const liveRef = useRef(props);
    liveRef.current = props;

    const [booted, setBooted] = useState(false);

    const nodePos = (name: string, tMs: number): LatLngAlt | null => {
      const rec = recsRef.current.get(name);
      if (rec) return propagateSat(rec, tMs);
      const st = liveRef.current.stations.find((s) => s.node_id === name);
      if (st) return { lat: st.latitude, lng: st.longitude, alt: 0.004 };
      return null;
    };

    const playRouteHops = (hops: RouteHop[]): void => {
      if (hops.length === 0) return;
      const t0 = Date.parse(hops[0].depart_ts);
      if (Number.isFinite(t0)) simRef.current.simMs = t0;
      const from = nodePos(hops[0].from_node, simRef.current.simMs);
      const to = nodePos(hops[0].to_node, simRef.current.simMs);
      if (!from || !to) return;
      playRef.current = {
        hops,
        idx: 0,
        t0: performance.now(),
        dur: 1400,
        from,
        to,
      };
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
      flyTo: flyToView,
    }));

    // ---- globe construction (once) ---------------------------------------
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      simRef.current.simMs = Date.now();
      simRef.current.lastReal = Date.now();
      const texBase = `${import.meta.env.BASE_URL}assets/textures`;

      const world: World = new Globe(el)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(`${texBase}/earth_night.jpg`)
        .bumpImageUrl(`${texBase}/earth_topology.jpg`)
        .showAtmosphere(true)
        .atmosphereColor("#cfd8ff")
        .atmosphereAltitude(0.18)
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

      // Rings: pulsing ground stations
      world
        .ringsData([])
        .ringLat((d: object) => (d as { lat: number }).lat)
        .ringLng((d: object) => (d as { lng: number }).lng)
        .ringColor((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) {
            return (t: number): string => `rgba(245,165,36,${((1 - t) * 0.98).toFixed(3)})`;
          }
          const primary = item.primary;
          const c = primary ? "127,178,255" : "207,216,255";
          return (t: number): string => `rgba(${c},${((1 - t) * 0.95).toFixed(3)})`;
        })
        .ringMaxRadius((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) return 5.8;
          return item.primary ? 4.4 : 3.0;
        })
        .ringPropagationSpeed((d: object) =>
          (d as { isMine?: boolean }).isMine ? 2.0 : 1.5,
        )
        .ringRepeatPeriod((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) return 900;
          return item.primary ? 1100 : 1700;
        })
        .ringAltitude(0.004);

      // Station labels
      world
        .labelsData([])
        .labelLat((d: object) => (d as { lat: number }).lat)
        .labelLng((d: object) => (d as { lng: number }).lng)
        .labelText((d: object) => (d as { name: string }).name)
        .labelSize((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) return 0.95;
          return item.primary ? 0.75 : 0.6;
        })
        .labelDotRadius((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) return 0.45;
          return item.primary ? 0.3 : 0.22;
        })
        .labelColor((d: object) => {
          const item = d as { primary: boolean; isMine?: boolean };
          if (item.isMine) return "rgba(245,165,36,1)";
          return item.primary
            ? "rgba(223,230,245,1)"
            : "rgba(139,150,176,0.9)";
        })
        .labelResolution(2)
        .labelAltitude(0.006);

      // Paths layer for:
      // 1. Thin dotted white orbit paths
      // 2. Selected satellite orbit trail
      // 3. ISL lines & Downlink beams
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

      // HTML Elements for Satellites
      world
        .htmlElementsData([])
        .htmlLat((d: object) => (d as SatDatum).lat)
        .htmlLng((d: object) => (d as SatDatum).lng)
        .htmlAltitude((d: object) => (d as SatDatum).alt)
        .htmlTransitionDuration(0)
        .htmlElement((d: object) => (d as SatDatum).el);

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

        // Packet-dot playback for demo route
        const play = playRef.current;
        const dot = dotRef.current;
        if (play && dot) {
          const k = Math.min(1, (real - play.t0) / play.dur);
          let dLng = play.to.lng - play.from.lng;
          if (dLng > 180) dLng -= 360;
          else if (dLng < -180) dLng += 360;
          const lat = play.from.lat + (play.to.lat - play.from.lat) * k;
          const lng = play.from.lng + dLng * k;
          const alt = play.from.alt + (play.to.alt - play.from.alt) * k;
          try {
            const xy = world.getScreenCoords(lat, lng, alt) as {
              x: number;
              y: number;
            };
            dot.style.display = "block";
            dot.style.transform = `translate(${xy.x.toFixed(1)}px, ${xy.y.toFixed(1)}px) translate(-50%,-50%)`;
          } catch {
            dot.style.display = "none";
          }
          if (k >= 1) {
            const next = play.idx + 1;
            if (next >= play.hops.length) {
              playRef.current = null;
              dot.style.display = "none";
            } else {
              const hop = play.hops[next];
              const t = Date.parse(hop.depart_ts);
              if (Number.isFinite(t)) simRef.current.simMs = t;
              const from =
                nodePos(hop.from_node, simRef.current.simMs) ?? play.to;
              const to = nodePos(hop.to_node, simRef.current.simMs) ?? play.to;
              playRef.current = {
                ...play,
                idx: next,
                t0: real,
                from,
                to,
              };
            }
          }
        }

        // Layer refresh throttled
        if (real - lastLayer > 180) {
          lastLayer = real;
          const visible = satsRef.current.filter((s) => s.ok);
          world.htmlElementsData(visible as unknown as object[]);

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

        if (real - lastPath > 600) {
          lastPath = real;
          const paths: PathDatum[] = [];
          const { selectedId, contacts, stations, sats } = liveRef.current;

          // 1. Thin dotted white orbit path for each active satellite
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
                colors: "rgba(223, 230, 245, 0.42)",
                stroke: 0.9,
                dashLength: 0.012,
                dashGap: 0.012,
              });
            }
          }

          // 2. Brighter trail for the selected sat
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
                  colors: [rgba("#3d5bff", 0), rgba("#3d5bff", 1)],
                  stroke: 2.2,
                });
              }
            }
          }

          // 3. Live ISL chords + Downlink beams
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
                colors: islColor(c.link_score),
                stroke: 1.2,
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
                colors: DOWNLINK_GREEN,
                stroke: 1.0,
              });
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
        const color = satStatusColor(s);
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
            <div class="ops-marker-ring">
              <div class="ops-marker-dot"></div>
            </div>
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
            color,
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
        datum.color = color;
        datum.el.style.setProperty("--sat-color", color);
        datum.el.classList.toggle("ops-selected", isSelected);
        datum.el.classList.toggle("ops-dimmed", isDimmed);
        datum.el.classList.toggle("ops-safe", s.state === "SAFE");

        next.push(datum);
      }
      satsRef.current = next;

      // Stations
      const rings = props.stations.map((st) => ({
        lat: st.latitude,
        lng: st.longitude,
        primary: st.is_primary,
        isMine: st.node_id === props.myStation,
      }));
      const labels = props.stations.map((st) => ({
        lat: st.latitude,
        lng: st.longitude,
        primary: st.is_primary,
        name:
          st.node_id === props.myStation
            ? `${st.node_id} (Your station)`
            : st.node_id,
        isMine: st.node_id === props.myStation,
      }));
      world.ringsData(rings as unknown as object[]);
      world.labelsData(labels as unknown as object[]);
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
            transform: translate(-7px, -7px);
            transition: opacity 0.25s ease;
          }
          .ops-marker.ops-dimmed {
            opacity: 0.18 !important;
            pointer-events: none !important;
          }
          .ops-marker-ring {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 1.5px solid var(--sat-color, #7ee2b8);
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(6, 11, 23, 0.4);
            box-shadow: 0 0 6px var(--sat-color, #7ee2b8);
            transition: all 0.2s ease;
          }
          .ops-marker-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--sat-color, #7ee2b8);
          }
          .ops-marker-tag {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            font-family: 'Geist Mono', ui-monospace, monospace;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
            color: #dfe6f5;
            background: rgba(6, 13, 31, 0.88);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 3px;
            padding: 1px 5px;
            backdrop-filter: blur(8px);
            pointer-events: none;
            transition: opacity 0.2s ease, border-color 0.2s ease;
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
          .ops-marker:hover .ops-marker-ring {
            transform: scale(1.2);
            border-color: #3d5bff;
          }
          .ops-marker:hover .ops-marker-tag {
            border-color: #3d5bff;
            color: #ffffff;
          }
          .ops-marker.ops-selected .ops-marker-ring {
            width: 22px;
            height: 22px;
            margin: -4px 0 0 -4px;
            border: 2px solid #3d5bff;
            box-shadow: 0 0 12px #3d5bff, inset 0 0 6px #3d5bff;
          }
          .ops-marker.ops-selected .ops-marker-dot {
            width: 6px;
            height: 6px;
            background: #ffffff;
            box-shadow: 0 0 6px #ffffff;
          }
          .ops-marker.ops-selected .ops-marker-tag {
            left: 22px;
            border-color: #3d5bff;
            background: rgba(61, 91, 255, 0.25);
            color: #ffffff;
            font-weight: 600;
          }
          .ops-marker.ops-safe .ops-marker-ring {
            animation: ops-marker-pulse 1.2s ease-in-out infinite;
          }
          @keyframes ops-marker-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.6; }
          }
        `}</style>
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={dotRef}
          className="pointer-events-none absolute left-0 top-0 z-30 hidden h-3 w-3 rounded-full bg-[#ff3b4f]"
          style={{
            boxShadow: "0 0 14px 4px rgba(255,59,79,.95)",
            display: "none",
          }}
        />

        {!booted && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
            <p className="animate-pulse font-mono text-[12px] tracking-widest uppercase text-[#8b96b0]">
              Acquiring Constellation Orbit…
            </p>
          </div>
        )}
      </div>
    );
  },
);
