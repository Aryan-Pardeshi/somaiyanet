// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Mission-ops globe: live TLE propagation, real terminator, ISL lines,
// downlink beams, plane colouring, and an imperative route-playback handle.
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
import {
  EARTH_R_KM,
  islColor,
  propagateSat,
  rgba,
  scoreColor,
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
}

interface OpsGlobeProps {
  sats: ConstellationSat[];
  stations: Station[];
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  histories: Record<string, number[]>;
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
}

const PLANE_A = "#3d6bff";
const PLANE_B = "#8fa8ff";
const SAFE_RED = "#d7263d";
const DOWNLINK_GREEN = "#3ddc97";
const TRAIL_N = 70;
const MODEL_ALT = 525 / EARTH_R_KM;

function satColor(s: ConstellationSat): string {
  if (s.state === "SAFE") return SAFE_RED;
  return s.plane === "A" ? PLANE_A : PLANE_B;
}

function two(n: number): string {
  return (n < 10 ? "0" : "") + String(n);
}

function countdownText(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "not scheduled";
  const delta = Math.floor((new Date(iso).getTime() - nowMs) / 1000);
  if (delta <= 0) return "PASS WINDOW OPEN";
  return `T- ${two(Math.floor(delta / 3600))}:${two(Math.floor((delta % 3600) / 60))}:${two(delta % 60)}`;
}

function sparklineSvg(series: number[], color: string): string {
  const pts = series.filter((v) => v !== null && v !== undefined).map(Number);
  if (pts.length < 2) return "";
  const w = 260;
  const h = 44;
  const pad = 3;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi - lo < 0.05) {
    hi += 0.05;
    lo -= 0.05;
  }
  const step = (w - pad * 2) / (pts.length - 1);
  const coords = pts.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo));
    return [x, y] as [number, number];
  });
  const line = coords
    .map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)} ${c[1].toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const area = `${line} L${last[0].toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return (
    `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;height:44px">` +
    `<path d="${area}" fill="${rgba(color, 0.12)}"/>` +
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" fill="${color}"/></svg>`
  );
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

    const [clock, setClock] = useState(() => new Date());
    const [speed, setSpeed] = useState(1);
    const [booted, setBooted] = useState(false);
    const [playing, setPlaying] = useState(false);

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
      setPlaying(true);
    };

    useImperativeHandle(ref, () => ({
      playRoute: playRouteHops,
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
        .globeImageUrl(`${texBase}/earth_day.jpg`)
        .bumpImageUrl(`${texBase}/earth_topology.jpg`)
        .showAtmosphere(true)
        .atmosphereColor("#8fb2ff")
        .atmosphereAltitude(0.25)
        .width(el.clientWidth)
        .height(el.clientHeight);
      worldRef.current = world;
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.32;
      world.controls().enableZoom = true;
      world.controls().minDistance = 160;
      world.controls().maxDistance = 700;
      world.pointOfView({ lat: 19.07, lng: 72.9, altitude: 2.45 }, 0);
      world.onGlobeClick(() => liveRef.current.onSelect(null));

      // Rings: pulsing ground stations. Labels: station names.
      world
        .ringsData([])
        .ringLat((d: object) => (d as { lat: number }).lat)
        .ringLng((d: object) => (d as { lng: number }).lng)
        .ringColor((d: object) => {
          const primary = (d as { primary: boolean }).primary;
          const c = primary ? "120,160,255" : "235,238,245";
          return (t: number): string => `rgba(${c},${((1 - t) * 0.95).toFixed(3)})`;
        })
        .ringMaxRadius((d: object) =>
          (d as { primary: boolean }).primary ? 4.4 : 3.0,
        )
        .ringPropagationSpeed(1.5)
        .ringRepeatPeriod((d: object) =>
          (d as { primary: boolean }).primary ? 1100 : 1700,
        )
        .ringAltitude(0.004);
      world
        .labelsData([])
        .labelLat((d: object) => (d as { lat: number }).lat)
        .labelLng((d: object) => (d as { lng: number }).lng)
        .labelText((d: object) => (d as { name: string }).name)
        .labelSize((d: object) => ((d as { primary: boolean }).primary ? 0.8 : 0.62))
        .labelDotRadius((d: object) =>
          (d as { primary: boolean }).primary ? 0.3 : 0.22,
        )
        .labelColor((d: object) =>
          (d as { primary: boolean }).primary
            ? "rgba(255,255,255,1)"
            : "rgba(226,230,238,.96)",
        )
        .labelResolution(2)
        .labelAltitude(0.006);

      // One paths layer carries the selected-sat trail plus ISL and
      // downlink chords (2-point paths render as straight chords).
      world
        .pathsData([])
        .pathPoints((d: object) => (d as PathDatum).pts)
        .pathPointLat((p: object) => (p as [number, number, number])[0])
        .pathPointLng((p: object) => (p as [number, number, number])[1])
        .pathPointAlt((p: object) => (p as [number, number, number])[2])
        .pathColor((d: object) => (d as PathDatum).colors)
        .pathStroke((d: object) => (d as PathDatum).stroke)
        .pathTransitionDuration(0);

      world
        .htmlElementsData([])
        .htmlLat((d: object) => (d as SatDatum).lat)
        .htmlLng((d: object) => (d as SatDatum).lng)
        .htmlAltitude((d: object) => (d as SatDatum).alt)
        .htmlTransitionDuration(0)
        .htmlElement((d: object) => (d as SatDatum).el);

      // Sun + night lights + specular oceans + cloud shell, without a
      // THREE import: constructors are reached through live objects.
      try {
        const lights = world.lights() as unknown[];
        if (lights && lights.length >= 2) {
          sunRef.current.lights = lights;
          const amb = lights[0] as { intensity: number };
          const dir = lights[1] as { intensity: number };
          amb.intensity = Math.PI * 0.62;
          dir.intensity = Math.PI * 0.95;
          world.lights(lights as never);
        }
      } catch {
        // Headless/test renderers may not expose lights; globe still works.
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
        loadTexture(`${texBase}/earth_night.jpg`, (tex) => {
          mat["emissiveMap"] = tex;
          const em = mat["emissive"] as {
            setRGB?: (r: number, g: number, b: number) => void;
          } | null;
          if (em?.setRGB) em.setRGB(1, 1, 1);
          mat["emissiveIntensity"] = 0.9;
          mat["needsUpdate"] = true;
        });
        loadTexture(`${texBase}/earth_specular.jpg`, (tex) => {
          mat["specularMap"] = tex;
          const sp = mat["specular"] as {
            setRGB?: (r: number, g: number, b: number) => void;
          } | null;
          if (sp?.setRGB) sp.setRGB(0.42, 0.52, 0.68);
          mat["shininess"] = 26;
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
                  opacity: 0.62,
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
            // Cloud shell is decoration; ignore failures.
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
        if (clouds?.rotation) clouds.rotation.y += 0.00012;
        updateSun(simMs);

        // Propagate every sat from its TLE (refs only, no React state).
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
            s.alt = p.alt;
            s.ok = true;
          } else {
            s.ok = false;
          }
        }

        // Packet-dot playback, every frame for smooth motion.
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
              setPlaying(false);
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

        // Layer refresh, throttled: markers often, paths less often.
        if (real - lastLayer > 180) {
          lastLayer = real;
          const visible = satsRef.current.filter((s) => s.ok);
          world.htmlElementsData(visible as unknown as object[]);
        }
        if (real - lastPath > 500) {
          lastPath = real;
          const paths: PathDatum[] = [];
          const { selectedId, contacts, stations } = liveRef.current;
          // Orbit trail for the selected sat.
          if (selectedId) {
            const rec = recsRef.current.get(selectedId);
            const datum = satsRef.current.find((s) => s.uid === selectedId);
            if (rec && datum) {
              const periodMs = 95 * 60 * 1000;
              const span = periodMs * 0.3;
              const seq: LatLngAlt[] = [];
              for (let i = TRAIL_N; i >= 0; i--) {
                const q = propagateSat(rec, simMs - span * (i / TRAIL_N));
                if (q) seq.push(q);
              }
              if (seq.length >= 2) {
                unwrapLng(seq);
                paths.push({
                  pts: seq.map(
                    (q) =>
                      [q.lat, q.lng, q.alt] as [number, number, number],
                  ),
                  colors: [rgba(datum.color, 0), rgba(datum.color, 1)],
                  stroke: 2,
                });
              }
            }
          }
          // Live ISL chords (blue gradient) + downlink beams (green).
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
                stroke: 1.1,
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
                stroke: 0.9,
              });
            }
          }
          world.pathsData(paths as unknown as object[]);
        }
      };
      raf = requestAnimationFrame(tick);

      const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
      const bootTimer = window.setTimeout(() => setBooted(true), 900);
      const onResize = (): void => {
        world.width(el.clientWidth).height(el.clientHeight);
      };
      window.addEventListener("resize", onResize);

      return () => {
        cancelAnimationFrame(raf);
        window.clearInterval(clockTimer);
        window.clearTimeout(bootTimer);
        window.removeEventListener("resize", onResize);
        try {
          world._destructor();
        } catch {
          // Already torn down; ignore.
        }
        worldRef.current = null;
      };
    }, []);

    // ---- data sync: TLEs -> satrecs + markers, stations -> rings ---------
    useEffect(() => {
      const world = worldRef.current;
      // Satrecs are usable before the globe exists; markers need the world.
      for (const s of props.sats) {
        if (!recsRef.current.has(s.node_id)) {
          try {
            recsRef.current.set(
              s.node_id,
              satellite.twoline2satrec(s.tle_line1, s.tle_line2),
            );
          } catch {
            // Unusable element set: skip, never plot a bogus point.
          }
        }
      }
      if (!world) return;
      const byUid = new Map(satsRef.current.map((s) => [s.uid, s]));
      const next: SatDatum[] = [];
      for (const s of props.sats) {
        if (s.state === "STOWED") continue; // listed in panel, not drawn
        const color = satColor(s);
        let datum = byUid.get(s.node_id);
        if (!datum) {
          const div = document.createElement("div");
          div.className = "ops-sat";
          div.style.color = color;
          div.innerHTML =
            `<div class="ops-halo"></div><div class="ops-body"></div>` +
            `<div class="ops-tag">${s.node_id}</div>`;
          div.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const cur = liveRef.current;
            cur.onSelect(cur.selectedId === s.node_id ? null : s.node_id);
          });
          datum = { uid: s.node_id, label: s.node_id, color, lat: 0, lng: 0, alt: MODEL_ALT, ok: true, el: div };
          const p = recsRef.current.get(s.node_id);
          const here = p ? propagateSat(p, Date.now()) : null;
          if (here) {
            datum.lat = here.lat;
            datum.lng = here.lng;
            datum.alt = here.alt;
          }
        } else {
          datum.color = color;
          datum.el.style.color = color;
        }
        datum.el.classList.toggle("ops-safe", s.state === "SAFE");
        datum.el.classList.toggle(
          "ops-selected",
          props.selectedId === s.node_id,
        );
        next.push(datum);
      }
      satsRef.current = next;

      const rings = props.stations.map((st) => ({
        lat: st.latitude,
        lng: st.longitude,
        primary: st.is_primary,
      }));
      const labels = props.stations.map((st) => ({
        lat: st.latitude,
        lng: st.longitude,
        primary: st.is_primary,
        name: st.node_id,
      }));
      world.ringsData(rings as unknown as object[]);
      world.labelsData(labels as unknown as object[]);
    }, [props.sats, props.stations, props.selectedId]);

    const setSpeedBoth = (v: number): void => {
      simRef.current.speed = v;
      simRef.current.lastReal = Date.now();
      if (v === 1) simRef.current.simMs = Date.now();
      setSpeed(v);
    };

    const selected = props.selectedId
      ? (props.sats.find((s) => s.node_id === props.selectedId) ?? null)
      : null;
    const hist = selected
      ? [...(props.histories[selected.node_id] ?? [])]
      : [];
    if (selected && selected.battery_v !== null && selected.battery_v !== undefined) {
      const last = hist[hist.length - 1];
      if (last === undefined || Math.abs(last - selected.battery_v) > 1e-9)
        hist.push(selected.battery_v);
    }
    const spark = selected ? sparklineSvg(hist.slice(-48), satColor(selected)) : "";
    const stowed = props.sats.filter((s) => s.state === "STOWED");

    const demoRoute = (): void => {
      const now = Date.now();
      const iso = (ms: number): string => new Date(ms).toISOString();
      const hops: RouteHop[] = [
        { from_node: "SAT-A1", to_node: "SAT-A2", depart_ts: iso(now), arrive_ts: iso(now + 4000), kind: "ISL" },
        { from_node: "SAT-A2", to_node: "SAT-A3", depart_ts: iso(now + 4000), arrive_ts: iso(now + 8000), kind: "ISL" },
        { from_node: "SAT-A3", to_node: "GS-BOM", depart_ts: iso(now + 8000), arrive_ts: iso(now + 12000), kind: "DOWNLINK" },
      ];
      worldRef.current?.pointOfView({ lat: 20, lng: 70, altitude: 1.6 }, 800);
      // Route through the same imperative path /routing will use.
      playRouteHops(hops);
    };

    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        <style>{`
          .ops-sat{position:relative;width:46px;height:46px;margin:-23px 0 0 -23px;cursor:pointer;pointer-events:auto;user-select:none}
          .ops-sat .ops-halo{position:absolute;inset:7px;border-radius:50%;border:1px solid currentColor;opacity:.34;animation:ops-sonar 2.6s ease-out infinite}
          @keyframes ops-sonar{0%{transform:scale(.55);opacity:.55}100%{transform:scale(1.5);opacity:0}}
          .ops-sat .ops-body{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:11px;height:11px;border-radius:3px;background:currentColor;box-shadow:0 0 10px currentColor}
          .ops-sat .ops-tag{position:absolute;left:28px;top:12px;font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.1em;white-space:nowrap;color:#fff;background:rgba(0,0,0,.55);border:1px solid #1f1f24;border-radius:6px;padding:1px 5px}
          .ops-sat:hover .ops-tag,.ops-sat.ops-selected .ops-tag{border-color:currentColor}
          .ops-sat.ops-safe .ops-body{animation:ops-blink 1.1s ease-in-out infinite}
          @keyframes ops-blink{0%,100%{opacity:1}50%{opacity:.35}}
          .ops-flash{animation:ops-flash .8s ease-out}
          @keyframes ops-flash{0%{background:rgba(61,107,255,.35)}100%{background:transparent}}
        `}</style>
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={dotRef}
          className="pointer-events-none absolute left-0 top-0 z-20 hidden h-3 w-3 rounded-full bg-white"
          style={{ boxShadow: "0 0 12px 3px rgba(255,255,255,.9)", display: "none" }}
        />

        {/* top bar with UTC clock */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 px-4"
          style={{ background: "linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,0))" }}
        >
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
            SomaiyaSat <span className="font-mono text-[11px] font-normal tracking-[0.16em] text-[#8a8a93]">OPS</span>
          </span>
          {playing && (
            <span className="mono-label rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[#ffb020]">
              playing route
            </span>
          )}
          <div className="flex-1" />
          <div className="font-mono text-[13px] tracking-[0.06em] text-white">
            {`${two(clock.getUTCHours())}:${two(clock.getUTCMinutes())}:${two(clock.getUTCSeconds())} `}
            <span className="text-[#8a8a93]">UTC</span>
          </div>
        </div>

        {/* selected-sat side panel */}
        {selected && (
          <aside className="absolute left-4 top-16 z-30 w-[300px] max-w-[calc(100%-2rem)] rounded-xl border border-white/10 bg-[#0a0a0c]/90 p-4 backdrop-blur-xl">
            <div className="flex items-start gap-2">
              <div>
                <p className="font-mono text-[15px] tracking-[0.04em] text-white">{selected.node_id}</p>
                <span
                  className="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: selected.state === "SAFE" ? SAFE_RED : "#3ddc97", borderColor: "currentColor" }}
                >
                  {selected.state}
                </span>
              </div>
              <button
                onClick={() => props.onSelect(null)}
                aria-label="Close panel"
                className="ml-auto rounded-md border border-white/10 px-2 py-0.5 text-[#8a8a93] hover:border-[#3d6bff]/60 hover:text-white"
              >
                ×
              </button>
            </div>
            {selected.state === "STOWED" ? (
              <p className="mt-3 font-mono text-xs leading-relaxed text-[#8a8a93]">
                in SomaiyaPod — awaiting deployment. No orbit track yet.
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="mono-label text-[#8a8a93]">battery</p>
                    <p className="mt-1 font-mono text-[15px] text-white">
                      {selected.battery_v === null || selected.battery_v === undefined ? "—" : `${selected.battery_v.toFixed(2)} V`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="mono-label text-[#8a8a93]">plane / slot</p>
                    <p className="mt-1 font-mono text-[15px] text-white">{selected.plane} / {selected.slot}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="mono-label text-[#8a8a93]">queued</p>
                    <p className="mt-1 font-mono text-[15px] text-white">
                      {selected.queued_bytes === undefined ? "—" : `${(selected.queued_bytes / 1024).toFixed(1)} KB`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="mono-label text-[#8a8a93]">next downlink</p>
                    <p className="mt-1 font-mono text-[15px] text-white">{selected.next_downlink_station ?? "—"}</p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-white">
                  {countdownText(selected.next_downlink_start, clock.getTime())}
                </p>
                <div className="mt-2">
                  <p className="mono-label text-[#8a8a93]">[ battery · live spark ]</p>
                  {spark ? (
                    <div dangerouslySetInnerHTML={{ __html: spark }} />
                  ) : (
                    <p className="mt-1 font-mono text-xs text-[#8a8a93]">awaiting telemetry…</p>
                  )}
                </div>
              </>
            )}
            {stowed.length > 0 && (
              <p className="mt-3 border-t border-white/10 pt-2 font-mono text-[11px] text-[#8a8a93]">
                in SomaiyaPod: {stowed.map((s) => s.node_id).join(", ")}
              </p>
            )}
          </aside>
        )}

        {/* speed control */}
        <div className="absolute bottom-[132px] left-4 z-30 flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0a0a0c]/80 px-2 py-1.5 backdrop-blur-xl">
          <span className="mono-label px-1 text-[#8a8a93]">speed</span>
          {[1, 10, 60].map((v) => (
            <button
              key={v}
              onClick={() => setSpeedBoth(v)}
              className={`mono-label rounded-full border px-2 py-1 transition-colors ${
                speed === v
                  ? "border-[#3d6bff]/80 bg-[#3d6bff]/20 text-white"
                  : "border-white/10 text-[#8a8a93] hover:text-white"
              }`}
            >
              {v === 1 ? "live" : `${v}×`}
            </button>
          ))}
          {speed !== 1 && (
            <span className="mono-label pl-1 text-[#ffb020]">fast-forward ×{speed}</span>
          )}
        </div>

        {/* legend */}
        <div className="absolute bottom-4 left-4 z-30 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-[#0a0a0c]/80 px-3 py-2.5 backdrop-blur-xl">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-[#8a8a93]">
            <span className="h-[3px] w-4 rounded" style={{ background: DOWNLINK_GREEN }} /> downlink beam
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-[#8a8a93]">
            <span className="h-[3px] w-4 rounded" style={{ background: "#3d6bff" }} /> ISL · score→alpha
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-[#8a8a93]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: PLANE_A }} /> plane A
            <span className="ml-2 h-2 w-2 rounded-[2px]" style={{ background: PLANE_B }} /> plane B
            <span className="ml-2 h-2 w-2 rounded-[2px]" style={{ background: SAFE_RED }} /> safe
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] text-[#8a8a93]">
            <span className="font-mono" style={{ color: scoreColor(80) }}>link ≥ 70 good</span>
            <span style={{ color: scoreColor(55) }}>40–69 fair</span>
            <span style={{ color: scoreColor(10) }}>&lt; 40 poor</span>
          </div>
        </div>

        {import.meta.env.DEV && (
          <button
            onClick={demoRoute}
            className="mono-label absolute bottom-4 right-4 z-30 rounded-full border border-dashed border-white/20 bg-black/60 px-3 py-1.5 text-[#8a8a93] hover:border-[#3d6bff]/60 hover:text-white"
          >
            ▶ demo 3-hop route
          </button>
        )}

        {!booted && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
            <p className="mono-label animate-pulse text-[#8a8a93]">acquiring orbit…</p>
          </div>
        )}
      </div>
    );

  },
);
