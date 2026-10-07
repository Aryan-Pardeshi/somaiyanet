import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as satellite from "satellite.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  getNetwork,
  getRoutes,
  formatLatency,
  type PublicContact,
  type PublicNetwork,
  type PublicRoute,
  type PublicRoutes,
  type PublicStation,
  type SqlRecord,
} from "@/landing/publicApi";
import { propagateSat } from "@/features/ops/orbit";
import { Atmosphere, Earth, EARTH_R, SUN_DIR, useEarthMaps } from "./earth/Earth";
import {
  formatLocalTime,
  formatPlanEndDate,
  getSatVector3,
  getStationVector3,
  latLngToVector3,
  ALT_SCALE,
} from "./earth/geo";

interface HopTimeline {
  hopIndex: number;
  fromNode: string;
  toNode: string;
  contactId: number;
  departMs: number;
  arriveMs: number;
  kind: "ISL" | "DOWNLINK";
}

/** "52 min" or "1 h 05 min" for carry times. */
function formatCarry(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * The route in plain words, one sentence per radio hop, e.g.
 * "SS-1 carried it for 52 min, then sent it down to Tokyo (1,604 km). Arrives 22:43."
 * Distances are measured between the drawn positions, which are at true scale.
 */
function routeStory(
  t0: number,
  hops: HopTimeline[],
  satrecs: Map<string, satellite.SatRec>,
  stationsMap: Map<string, PublicStation>,
  arrivalTs: string
): string {
  const where = (node: string, ms: number): THREE.Vector3 | null => {
    const rec = satrecs.get(node);
    if (rec) return getSatVector3(rec, ms);
    const st = stationsMap.get(node);
    return st ? getStationVector3(st.lat, st.lng) : null;
  };
  const sentences: string[] = [];
  let prev = t0;
  for (const h of hops) {
    const a = where(h.fromNode, h.departMs);
    const b = where(h.toNode, h.departMs);
    const km = a && b ? Math.round((a.distanceTo(b) / EARTH_R) * 6371) : null;
    const st = stationsMap.get(h.toNode);
    const send = st
      ? `sent it down to ${st.city || st.name}`
      : `sent it to ${h.toNode} by radio`;
    const dist = km !== null ? ` (${km.toLocaleString()} km)` : "";
    const wait = h.departMs - prev;
    sentences.push(
      wait >= 60_000
        ? `${h.fromNode} carried it for ${formatCarry(wait)}, then ${send}${dist}.`
        : `${h.fromNode} ${send}${dist}.`
    );
    prev = h.arriveMs;
  }
  sentences.push(`Arrives ${formatLocalTime(arrivalTs)}.`);
  return sentences.join(" ");
}

const TURN_MS = 900;
const ARC_SAMPLES = 64;

/**
 * A "flight route" arc from a to b: it follows the great circle between the two points and
 * rises above them by an amount that grows with the length of the hop.
 */
function arcPoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const ra = a.length();
  const rb = b.length();
  const ua = a.clone().normalize();
  const ub = b.clone().normalize();
  const angle = ua.angleTo(ub);
  const lift = EARTH_R * Math.min(0.18, 0.03 + angle * 0.12);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const t = i / ARC_SAMPLES;
    const dir =
      angle < 1e-6
        ? ua.clone()
        : ua
            .clone()
            .multiplyScalar(Math.sin((1 - t) * angle) / Math.sin(angle))
            .add(ub.clone().multiplyScalar(Math.sin(t * angle) / Math.sin(angle)));
    const r = ra + (rb - ra) * t + lift * Math.sin(Math.PI * t);
    out.push(dir.normalize().multiplyScalar(r));
  }
  return out;
}

/** The selected route, laid out once: where each node is drawn and the arc of each hop. */
interface RoutePlan {
  /** path nodes in order; a satellite sits where it hands the packet on. */
  nodes: Array<{ id: string; pos: THREE.Vector3 }>;
  arcs: THREE.Vector3[][];
  hops: HopTimeline[];
  story: string;
  missingContactId: number | null;
}

interface HeroSceneProps {
  network: PublicNetwork | null;
  selectedSatId: string;
  selectedRoute: PublicRoute | null;
  contactsMap: Map<number, PublicContact>;
  stationsMap: Map<string, PublicStation>;
  satrecs: Map<string, satellite.SatRec>;
  replayCaptionRef: React.RefObject<HTMLSpanElement | null>;
  /** Plain DOM labels over the canvas, placed by projecting each satellite every frame. */
  satLabelRefs: React.RefObject<Map<string, HTMLSpanElement>>;
  destLabelRef: React.RefObject<HTMLSpanElement | null>;
  /** 0..1, how far the page has scrolled through the hero; it draws the route. */
  scrollProgress: React.RefObject<number>;
  userDragDelta: React.MutableRefObject<{ x: number; y: number }>;
  isVisible: boolean;
}

function HeroScene({
  network,
  selectedSatId,
  selectedRoute,
  contactsMap,
  stationsMap,
  satrecs,
  replayCaptionRef,
  satLabelRefs,
  destLabelRef,
  scrollProgress,
  userDragDelta,
  isVisible,
}: HeroSceneProps) {
  const maps = useEarthMaps();
  const earthGroup = useRef<THREE.Group>(null);
  const packetMeshRef = useRef<THREE.Mesh>(null);
  const satMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

  // Sparse stars point field
  const stars = useMemo(() => {
    const n = 500;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 30);
      a.set([v.x, v.y, v.z], i * 3);
    }
    return a;
  }, []);

  // Shared geometries & materials
  const satDotGeo = useMemo(() => new THREE.SphereGeometry(0.016 * EARTH_R, 12, 12), []);
  const satDotWhiteMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);
  const satDotBlueMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#0a84ff" }), []);
  const stationDotGeo = useMemo(() => new THREE.SphereGeometry(0.012 * EARTH_R, 12, 12), []);
  const stationDotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);
  const packetGeo = useMemo(() => new THREE.SphereGeometry(0.018 * EARTH_R, 16, 16), []);
  const packetMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff453a" }), []);

  // The route: one red 2.5 px line made of segments (LineSegments2 gives real pixel widths;
  // WebGL ignores linewidth on THREE.Line).
  const routeMaterial = useMemo(
    () => new LineMaterial({ color: 0xff453a, linewidth: 2.5, worldUnits: false }),
    []
  );
  const routeLine = useMemo(() => {
    const line = new LineSegments2(new LineSegmentsGeometry(), routeMaterial);
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }, [routeMaterial]);
  const { size, camera } = useThree();
  useEffect(() => {
    routeMaterial.resolution.set(size.width, size.height);
  }, [size, routeMaterial]);

  /** Draw the arcs up to `hopsDone` whole hops plus `frac` of the next. Returns the head. */
  const drawRoute = useCallback(
    (plan: RoutePlan, hopsDone: number, frac: number): THREE.Vector3 | null => {
      const pts: number[] = [];
      let head: THREE.Vector3 | null = null;
      plan.arcs.forEach((arc, k) => {
        if (k > hopsDone) return;
        const last = k < hopsDone ? arc.length - 1 : Math.floor(frac * (arc.length - 1));
        for (let i = 1; i <= last; i++) {
          const a = arc[i - 1];
          const b = arc[i];
          pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
        head = arc[Math.max(0, last)];
      });
      // A fresh geometry per update: re-filling a rendered geometry does not redraw.
      const prev = routeLine.geometry;
      if (pts.length === 0) {
        routeLine.visible = false;
      } else {
        const next = new LineSegmentsGeometry();
        next.setPositions(pts);
        routeLine.geometry = next;
        routeLine.visible = true;
      }
      if (routeLine.geometry !== prev) prev.dispose();
      return head;
    },
    [routeLine]
  );

  useEffect(() => {
    return () => {
      satDotGeo.dispose();
      satDotWhiteMat.dispose();
      satDotBlueMat.dispose();
      stationDotGeo.dispose();
      stationDotMat.dispose();
      packetGeo.dispose();
      packetMat.dispose();
      routeLine.geometry.dispose();
      routeMaterial.dispose();
    };
  }, [
    satDotGeo,
    satDotWhiteMat,
    satDotBlueMat,
    stationDotGeo,
    stationDotMat,
    packetGeo,
    packetMat,
    routeLine,
    routeMaterial,
  ]);

  const tmpWorld = useMemo(() => new THREE.Vector3(), []);
  const planRef = useRef<RoutePlan | null>(null);
  const anim = useRef({
    turnStart: 0,
    startRotY: 0,
    startRotX: 0,
    targetRotY: 0,
    targetRotX: 0,
    startCamZ: 5,
    targetCamZ: 5,
    turning: false,
    /** How much of the route is drawn (0..1); eases towards the scroll progress. */
    shown: 0,
    lastDrawn: -1,
    reduced: false,
    lastCaption: "",
  });

  const setCaption = useCallback(
    (text: string) => {
      if (anim.current.lastCaption === text) return;
      anim.current.lastCaption = text;
      if (replayCaptionRef.current) replayCaptionRef.current.textContent = text;
    },
    [replayCaptionRef]
  );

  // Lay out the selected route and start drawing it.
  useEffect(() => {
    if (!selectedRoute) {
      planRef.current = null;
      drawRoute({ nodes: [], arcs: [], hops: [], story: "", missingContactId: null }, 0, 0);
      if (packetMeshRef.current) packetMeshRef.current.visible = false;
      setCaption("");
      return;
    }

    const t0 = Date.now();
    const hops: HopTimeline[] = [];
    let prevArrive = t0;
    let missingContactId: number | null = null;
    for (let i = 0; i < selectedRoute.path_contacts.length; i++) {
      const cId = selectedRoute.path_contacts[i];
      const contact = contactsMap.get(cId);
      if (!contact) {
        missingContactId = cId;
        break;
      }
      const cStart = new Date(contact.start_ts).getTime();
      const depart = Math.max(prevArrive, Number.isFinite(cStart) ? cStart : prevArrive);
      const arrive = depart + 34_000; // 41216 bytes at 9600 bit/s
      hops.push({
        hopIndex: i,
        fromNode: selectedRoute.path_nodes[i] ?? contact.from_node,
        toNode: selectedRoute.path_nodes[i + 1] ?? contact.to_node,
        contactId: cId,
        departMs: depart,
        arriveMs: arrive,
        kind: contact.kind,
      });
      prevArrive = arrive;
    }

    // Each satellite is drawn where it hands the packet on; the station where it is.
    const where = (id: string, ms: number): THREE.Vector3 => {
      const rec = satrecs.get(id);
      if (rec) return getSatVector3(rec, ms) ?? new THREE.Vector3(EARTH_R, 0, 0);
      const st = stationsMap.get(id);
      return st ? getStationVector3(st.lat, st.lng) : new THREE.Vector3(EARTH_R, 0, 0);
    };
    const nodes: RoutePlan["nodes"] = hops.map((h) => ({ id: h.fromNode, pos: where(h.fromNode, h.departMs) }));
    if (hops.length > 0) {
      const last = hops[hops.length - 1];
      nodes.push({ id: last.toNode, pos: where(last.toNode, last.departMs) });
    } else {
      nodes.push({ id: selectedSatId, pos: where(selectedSatId, t0) });
    }
    const arcs = hops.map((_, k) => arcPoints(nodes[k].pos, nodes[k + 1].pos));
    const story =
      missingContactId === null
        ? routeStory(t0, hops, satrecs, stationsMap, selectedRoute.arrival_ts)
        : `Contact ${missingContactId} missing from the response`;
    const plan: RoutePlan = { nodes, arcs, hops, story, missingContactId };
    planRef.current = plan;

    // Face the middle of the route.
    const mid = new THREE.Vector3();
    for (const n of nodes) mid.add(n.pos.clone().normalize());
    if (mid.lengthSq() < 1e-6) mid.copy(nodes[0].pos);
    mid.normalize();
    const g = earthGroup.current;
    const curY = g ? g.rotation.y : 0;
    const curX = g ? g.rotation.x : 0;
    let dy = (-Math.atan2(mid.x, mid.z) - curY) % (2 * Math.PI);
    if (dy > Math.PI) dy -= 2 * Math.PI;
    if (dy < -Math.PI) dy += 2 * Math.PI;
    const targetRotY = curY + dy;
    const targetRotX = THREE.MathUtils.clamp(
      Math.atan2(mid.y, Math.hypot(mid.x, mid.z)) * 0.85,
      -1.0,
      1.0
    );

    // Pull the camera back when the route spans a wide part of the globe.
    let span = 0;
    for (const p of nodes) for (const q of nodes) span = Math.max(span, p.pos.angleTo(q.pos));
    const targetCamZ = 5 + THREE.MathUtils.clamp((span - Math.PI / 3) / (Math.PI / 2), 0, 1) * 2.4;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    anim.current = {
      ...anim.current,
      startCamZ: camera.position.z,
      targetCamZ,
      turnStart: now,
      startRotY: curY,
      startRotX: curX,
      targetRotY,
      targetRotX,
      turning: !reduced,
      shown: reduced ? 1 : 0,
      lastDrawn: -1,
      reduced,
    };
    if (reduced) {
      if (g) {
        g.rotation.y = targetRotY;
        g.rotation.x = targetRotX;
      }
      camera.position.z = targetCamZ;
    }
    drawRoute(plan, 0, 0);
    if (packetMeshRef.current) {
      packetMeshRef.current.position.copy(nodes[0].pos);
      packetMeshRef.current.visible = true;
    }
    if (hops.length === 0) setCaption(story);
  }, [selectedRoute, selectedSatId, contactsMap, stationsMap, satrecs, drawRoute, setCaption, camera]);

  useFrame((state, dt) => {
    if (!isVisible || !earthGroup.current) return;
    const now = performance.now();
    const a = anim.current;
    const plan = planRef.current;
    const g = earthGroup.current;

    // 1. Earth rotation: drag, the turn towards a new route, or a slow idle spin.
    if (userDragDelta.current.x !== 0 || userDragDelta.current.y !== 0) {
      a.turning = false;
      g.rotation.y += userDragDelta.current.x;
      g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + userDragDelta.current.y, -1.0, 1.0);
      userDragDelta.current.x = 0;
      userDragDelta.current.y = 0;
    } else if (plan && a.turning) {
      const t = Math.min(1, (now - a.turnStart) / TURN_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      g.rotation.y = THREE.MathUtils.lerp(a.startRotY, a.targetRotY, ease);
      g.rotation.x = THREE.MathUtils.lerp(a.startRotX, a.targetRotX, ease);
      state.camera.position.z = THREE.MathUtils.lerp(a.startCamZ, a.targetCamZ, ease);
      if (t >= 1) a.turning = false;
    } else if (!plan) {
      g.rotation.y += dt * 0.02;
    }

    // 2. Scrolling draws the route hop by hop (scrolling back rewinds it), the packet
    //    riding the head of the line. The drawn amount eases towards the scroll position,
    //    so a newly picked route also catches up smoothly.
    if (plan && plan.hops.length > 0) {
      const target = a.reduced ? 1 : THREE.MathUtils.clamp(scrollProgress.current ?? 0, 0, 1);
      a.shown += (target - a.shown) * (1 - Math.exp(-dt * 6));
      if (Math.abs(target - a.shown) < 0.002) a.shown = target;
      if (a.shown !== a.lastDrawn) {
        a.lastDrawn = a.shown;
        const n = plan.hops.length;
        if (a.shown >= 0.998) {
          drawRoute(plan, n, 0);
          packetMeshRef.current?.position.copy(plan.nodes[plan.nodes.length - 1].pos);
          setCaption(plan.story);
        } else {
          const total = a.shown * n;
          const k = Math.min(n - 1, Math.floor(total));
          const head = drawRoute(plan, k, total - k);
          packetMeshRef.current?.position.copy(head ?? plan.nodes[0].pos);
          if (a.shown < 0.01) {
            setCaption("Scroll to send the packet.");
          } else {
            const h = plan.hops[k];
            const to = stationsMap.get(h.toNode);
            setCaption(
              `Hop ${k + 1} of ${n}: ${h.fromNode} to ${to ? to.city || to.name : h.toNode}`
            );
          }
        }
      }
    }

    // 3. Satellites: live positions when idle; with a route, only the route's satellites,
    //    each where it handed the packet on.
    const routeSats = new Map<string, THREE.Vector3>();
    if (plan) for (const n of plan.nodes) if (satrecs.has(n.id)) routeSats.set(n.id, n.pos);
    const nowMs = Date.now();
    for (const [satId, rec] of satrecs.entries()) {
      const mesh = satMeshesRef.current.get(satId);
      if (!mesh) continue;
      if (plan) {
        const pos = routeSats.get(satId);
        mesh.visible = pos !== undefined;
        if (pos) mesh.position.copy(pos);
      } else {
        const p = propagateSat(rec, nowMs);
        mesh.visible = p !== null;
        if (p) latLngToVector3(p.lat, p.lng, EARTH_R * (1 + p.alt * ALT_SCALE), mesh.position);
      }
      // Label next to the dot; hidden while the satellite is behind the Earth.
      const label = satLabelRefs.current.get(satId);
      if (label) {
        mesh.getWorldPosition(tmpWorld);
        const inFront = tmpWorld.dot(state.camera.position) > EARTH_R * EARTH_R;
        tmpWorld.project(state.camera);
        const x = ((tmpWorld.x + 1) / 2) * state.size.width;
        const y = ((1 - tmpWorld.y) / 2) * state.size.height;
        label.style.transform = `translate(${Math.round(x + 7)}px, ${Math.round(y - 8)}px)`;
        label.style.opacity = mesh.visible && inFront ? "1" : "0";
      }
    }

    // Destination station label.
    const dest = destLabelRef.current;
    if (dest) {
      const end = plan?.nodes[plan.nodes.length - 1];
      if (end && !satrecs.has(end.id)) {
        tmpWorld.copy(end.pos).applyMatrix4(g.matrixWorld);
        const inFront = tmpWorld.dot(state.camera.position) > EARTH_R * EARTH_R;
        tmpWorld.project(state.camera);
        const x = ((tmpWorld.x + 1) / 2) * state.size.width;
        const y = ((1 - tmpWorld.y) / 2) * state.size.height;
        dest.style.transform = `translate(${Math.round(x + 9)}px, ${Math.round(y + 2)}px)`;
        dest.style.opacity = inFront ? "1" : "0";
      } else {
        dest.style.opacity = "0";
      }
    }
  });

  const activeSats = useMemo(() => {
    if (!network?.satellites) return [];
    return network.satellites.filter((s) => s.state !== "STOWED");
  }, [network?.satellites]);

  const stationList = useMemo(() => {
    return network?.stations ?? [];
  }, [network?.stations]);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(10)} intensity={2.2} />

      {/* Sparse static stars */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#8fa3cc"
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>

      {/* Earth group carrying rotation, stations, satellites, route and packet */}
      <group ref={earthGroup}>
        {maps && <Earth maps={maps} />}
        <Atmosphere />

        {/* Stations */}
        {stationList.map((st) => {
          const pos = getStationVector3(st.lat, st.lng);
          return (
            <group key={st.id} position={pos}>
              <mesh geometry={stationDotGeo} material={stationDotMat} />
            </group>
          );
        })}

        {/* Satellites */}
        {activeSats.map((sat) => (
          <mesh
            key={sat.id}
            ref={(el) => {
              if (el) satMeshesRef.current.set(sat.id, el);
              else satMeshesRef.current.delete(sat.id);
            }}
            geometry={satDotGeo}
            material={sat.id === selectedSatId ? satDotBlueMat : satDotWhiteMat}
          />
        ))}

        {/* The route and the packet */}
        <primitive object={routeLine} />
        <mesh ref={packetMeshRef} geometry={packetGeo} material={packetMat} visible={false} />
      </group>
    </>
  );
}

export function LiveHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Network & routes data
  const [network, setNetwork] = useState<PublicNetwork | null>(null);
  const [selectedSatId, setSelectedSatId] = useState<string>("SS-1");
  const [routesData, setRoutesData] = useState<PublicRoutes | null>(null);
  const [routesSql, setRoutesSql] = useState<SqlRecord | null>(null);
  const [routesRole, setRoutesRole] = useState<string>("student_analyst");
  const [selectedRoute, setSelectedRoute] = useState<PublicRoute | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(true);
  const [error, setError] = useState<{ message: string; sqlstate?: string } | null>(null);

  // Ref for caption update without React state changes
  const replayCaptionRef = useRef<HTMLSpanElement>(null);
  const satLabelRefs = useRef(new Map<string, HTMLSpanElement>());
  const destLabelRef = useRef<HTMLSpanElement>(null);
  const scrollProgressRef = useRef(0);

  // How far the page has scrolled through this section, 0..1. The globe is sticky, so
  // this is the stretch where it stays on screen while the text scrolls past.
  useEffect(() => {
    const update = (): void => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const range = Math.max(1, r.height - window.innerHeight);
      scrollProgressRef.current = Math.min(1, Math.max(0, -r.top / range));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Drag interaction
  const pointerDown = useRef(false);
  const prevPointer = useRef({ x: 0, y: 0 });
  const userDragDelta = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDown.current = true;
    prevPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerDown.current) return;
    const dx = e.clientX - prevPointer.current.x;
    const dy = e.clientY - prevPointer.current.y;
    prevPointer.current = { x: e.clientX, y: e.clientY };
    userDragDelta.current.x += dx * 0.005;
    userDragDelta.current.y += dy * 0.005;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointerDown.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  // IntersectionObserver to pause rendering when section is off-screen
  useEffect(() => {
    if (!sectionRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const reqIdRef = useRef(0);

  const fetchRoutesFor = useCallback((satId: string) => {
    setIsLoadingRoutes(true);
    setError(null);
    const reqId = ++reqIdRef.current;

    getRoutes(satId)
      .then((res) => {
        if (reqIdRef.current !== reqId) return;
        setRoutesData(res.data);
        setRoutesSql(res.sql?.[0] ?? null);
        setRoutesRole(res.role || "student_analyst");
        setIsLoadingRoutes(false);

        // Rank 1 selected by default
        if (res.data.routes && res.data.routes.length > 0) {
          setSelectedRoute(res.data.routes[0]);
        } else {
          setSelectedRoute(null);
        }
      })
      .catch((err) => {
        if (reqIdRef.current !== reqId) return;
        setError({
          message: err?.message || "The database is offline, so live routes are unavailable.",
          sqlstate: err?.sqlstate,
        });
        setRoutesData(null);
        setSelectedRoute(null);
        setIsLoadingRoutes(false);
      });
  }, []);

  // On mount: load network and initial routes for SS-1
  useEffect(() => {
    let alive = true;
    getNetwork()
      .then((res) => {
        if (!alive) return;
        setNetwork(res.data);
        const active = res.data.satellites.filter((s) => s.state !== "STOWED");
        const defaultSat = active.find((s) => s.id === "SS-1")?.id ?? active[0]?.id ?? "SS-1";
        setSelectedSatId(defaultSat);
        fetchRoutesFor(defaultSat);
      })
      .catch((err) => {
        if (!alive) return;
        setError({
          message: err?.message || "The database is offline, so live routes are unavailable.",
          sqlstate: err?.sqlstate,
        });
        setIsLoadingRoutes(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchRoutesFor]);

  const handleSelectSat = (satId: string) => {
    if (satId === selectedSatId) return;
    setSelectedSatId(satId);
    setSelectedRoute(null);
    fetchRoutesFor(satId);
  };

  const handleSelectRoute = (route: PublicRoute) => {
    setSelectedRoute(route);
  };

  const activeSatellites = useMemo(() => {
    if (!network?.satellites) return [];
    return network.satellites.filter((s) => s.state !== "STOWED");
  }, [network?.satellites]);

  const stationsMap = useMemo(() => {
    const map = new Map<string, PublicStation>();
    if (!network?.stations) return map;
    for (const st of network.stations) map.set(st.id, st);
    return map;
  }, [network?.stations]);

  const contactsMap = useMemo(() => {
    const map = new Map<number, PublicContact>();
    if (!routesData?.contacts) return map;
    for (const c of routesData.contacts) map.set(c.contact_id, c);
    return map;
  }, [routesData?.contacts]);

  const satrecs = useMemo(() => {
    const map = new Map<string, satellite.SatRec>();
    if (!network?.satellites) return map;
    for (const sat of network.satellites) {
      if (sat.state === "STOWED") continue;
      try {
        const rec = satellite.twoline2satrec(sat.tle_line1, sat.tle_line2);
        map.set(sat.id, rec);
      } catch {
        // ignore invalid TLE
      }
    }
    return map;
  }, [network?.satellites]);

  const isPlanEnded = useMemo(() => {
    if (!network?.plan?.ends) return false;
    return new Date(network.plan.ends).getTime() < Date.now();
  }, [network?.plan?.ends]);

  return (
    <section
      id="network"
      ref={sectionRef}
      className="relative bg-black text-white pt-16 lg:pt-20"
    >
      <div className="mx-auto max-w-[1200px] w-full px-4 md:px-8 pb-8 lg:pb-12">
        <div className="flex min-h-[calc(100svh+70vh)] flex-col lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
          {/* Earth Canvas: Phones on top (order-1, ~52svh), Desktop on right (order-2, col-span-7, bleed-off) */}
          <div
            className="order-1 lg:order-2 lg:col-span-7 w-full h-[46svh] lg:h-[calc(100svh-80px)] sticky top-16 lg:top-20 z-10 bg-black lg:bg-transparent lg:-mr-16 xl:-mr-32 overflow-visible select-none cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <Canvas
              className="w-full h-full"
              frameloop={isVisible ? "always" : "never"}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              camera={{ position: [0, 0, 5.0], fov: 45, near: 0.1, far: 100 }}
              aria-label="Interactive 3D simulation of SomaiyaNet Earth constellation"
            >
              <HeroScene
                network={network}
                selectedSatId={selectedSatId}
                selectedRoute={selectedRoute}
                contactsMap={contactsMap}
                stationsMap={stationsMap}
                satrecs={satrecs}
                replayCaptionRef={replayCaptionRef}
                satLabelRefs={satLabelRefs}
                destLabelRef={destLabelRef}
                scrollProgress={scrollProgressRef}
                userDragDelta={userDragDelta}
                isVisible={isVisible}
              />
            </Canvas>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              {(network?.satellites ?? [])
                .filter((sat) => sat.state !== "STOWED")
                .map((sat) => (
                  <span
                    key={sat.id}
                    ref={(el) => {
                      if (el) satLabelRefs.current.set(sat.id, el);
                      else satLabelRefs.current.delete(sat.id);
                    }}
                    className="absolute left-0 top-0 whitespace-nowrap text-[11px]"
                    style={{ opacity: 0, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-sans)" }}
                  >
                    {sat.id}
                  </span>
                ))}
              <span
                ref={destLabelRef}
                className="absolute left-0 top-0 whitespace-nowrap text-[12px] text-white"
                style={{ opacity: 0, fontFamily: "var(--font-sans)" }}
              >
                {selectedRoute
                  ? network?.stations.find((st) => st.id === selectedRoute.destination)?.name ?? ""
                  : ""}
              </span>
            </div>
          </div>

          {/* Left Column: Copy & Route Finder */}
          <div className="order-2 lg:order-1 lg:col-span-5 mt-6 lg:mt-16">
            <h1 className="sx-display">Satellites That Route Themselves</h1>
            <p className="sx-lead mt-5 mb-8">
              Pick a satellite. PostgreSQL works out the earliest way to get its data to every ground
              station, using only the contact windows stored in the database.
            </p>

            {/* Segmented control: From + pill group */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-sm font-medium text-[var(--sx-text-2)]">From</span>
              <div
                role="tablist"
                aria-label="Select satellite"
                className="inline-flex h-[44px] items-center p-1 rounded-full bg-[var(--sx-surface)] border border-[var(--sx-hairline)]"
              >
                {activeSatellites.map((sat) => {
                  const isSelected = sat.id === selectedSatId;
                  const isSafe = sat.state === "SAFE";
                  return (
                    <button
                      key={sat.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => handleSelectSat(sat.id)}
                      className={`h-full min-h-[44px] px-4 rounded-full text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[var(--sx-surface-2)] text-white shadow-sm"
                          : "text-[var(--sx-text-2)] hover:text-white"
                      }`}
                    >
                      {isSafe && (
                        <span
                          className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--sx-orange)]"
                          aria-label="Safe state"
                        />
                      )}
                      <span>{sat.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Route Results */}
            {isLoadingRoutes ? (
              <div className="sx-group min-h-[160px] flex items-center justify-center p-6">
                <div className="sx-caption">Finding routes…</div>
              </div>
            ) : error ? (
              <div className="sx-group min-h-[160px] flex items-center justify-center p-6 text-center">
                <div className="sx-caption">
                  The database is offline, so live routes are unavailable.
                  {error.sqlstate && (
                    <span className="font-mono text-[var(--sx-red)] ml-1.5">
                      [{error.sqlstate}]
                    </span>
                  )}
                </div>
              </div>
            ) : !routesData || routesData.routes.length === 0 ? (
              <div className="sx-group min-h-[160px] flex items-center justify-center p-6 text-center">
                <div className="sx-caption max-w-[420px]">
                  {isPlanEnded
                    ? `The stored contact plan ended on ${formatPlanEndDate(
                        network?.plan?.ends || ""
                      )}. Run scripts/compute_contacts.py to plan the next 30 hours.`
                    : `No ground station is reachable from ${selectedSatId} in the next 30 hours.`}
                </div>
              </div>
            ) : (
              <div className="sx-group">
                {routesData.routes.map((route) => {
                  const isSelected = selectedRoute?.destination === route.destination;
                  const st = stationsMap.get(route.destination);
                  const weakestQ =
                    route.bottleneck_score != null ? `q ${route.bottleneck_score}` : "q n/a";
                  return (
                    <div
                      key={route.destination}
                      className={isSelected ? "bg-[var(--sx-surface-2)]" : ""}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectRoute(route)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleSelectRoute(route);
                        }}
                        className="sx-row cursor-pointer transition-colors hover:bg-[var(--sx-surface-2)]/60"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isSelected && (
                            <span
                              className="w-[6px] h-[6px] rounded-full bg-[var(--sx-red)] shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {st?.name ?? route.destination}
                            </div>
                            <div className="sx-caption truncate">
                              {st?.city ?? route.destination}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="sx-num text-sm text-white">
                            in {formatLatency(route.latency_s)}
                          </div>
                          <div className="sx-caption">
                            {route.hops} {route.hops === 1 ? "hop" : "hops"}, weakest link{" "}
                            {weakestQ}
                          </div>
                        </div>
                      </div>

                      {/* Packet replay caption directly under selected row */}
                      {isSelected && (
                        <div className="px-[18px] pb-3 -mt-1">
                          <span
                            ref={replayCaptionRef}
                            className="sx-caption text-[var(--sx-text-2)] block"
                          >
                            Packet on {selectedSatId}, T+0 min
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* SQL Execution Block */}
            {routesSql && (
              <div className="mt-4">
                <div className="sx-code text-[12px] whitespace-pre-wrap break-words font-mono">
                  {routesSql.sql}
                </div>
                <div className="sx-caption mt-2">
                  Ran as {routesRole || "student_analyst"} in{" "}
                  {Math.round(routesSql.elapsed_ms ?? 0)} ms, {routesSql.rowcount ?? 0}{" "}
                  {routesSql.rowcount === 1 ? "row" : "rows"}.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
