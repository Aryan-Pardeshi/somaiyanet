import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import * as satellite from "satellite.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
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
  interpolatePacketPos,
  latLngToVector3,
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

const TRANSFER_ANIM_MS = 900;

/**
 * Replay clock. Real time t0..lastArrive is mapped piecewise onto screen time: every
 * transfer (34 s in reality) gets a fixed 0.9 s, and the waits, while a satellite carries the
 * packet, share the rest in proportion to their real length. Returns matching breakpoints.
 */
function replayKeyframes(t0: number, hops: HopTimeline[]): { anim: number[]; real: number[] } {
  const real = [t0];
  for (const h of hops) real.push(h.departMs, h.arriveMs);
  let rideTotal = 0;
  for (let k = 0; k < hops.length; k++) rideTotal += Math.max(0, real[2 * k + 1] - real[2 * k]);
  const rideAnimTotal = Math.max(2000, 6500 - hops.length * TRANSFER_ANIM_MS);
  const anim = [0];
  for (let k = 0; k < hops.length; k++) {
    const ride = Math.max(0, real[2 * k + 1] - real[2 * k]);
    anim.push(anim[anim.length - 1] + (rideTotal > 0 ? (rideAnimTotal * ride) / rideTotal : 0));
    anim.push(anim[anim.length - 1] + TRANSFER_ANIM_MS);
  }
  return { anim, real };
}

function animToReal(animMs: number, kf: { anim: number[]; real: number[] }): number {
  const { anim, real } = kf;
  for (let i = 0; i < anim.length - 1; i++) {
    if (animMs < anim[i + 1] && anim[i + 1] > anim[i]) {
      const f = Math.max(0, (animMs - anim[i]) / (anim[i + 1] - anim[i]));
      return real[i] + (real[i + 1] - real[i]) * f;
    }
  }
  return real[real.length - 1];
}

function computePacketState(
  timeMs: number,
  t0: number,
  hops: HopTimeline[],
  missingContactId: number | null,
  satrecs: Map<string, satellite.SatRec>,
  stationsMap: Map<string, PublicStation>,
  originSatId: string,
  destStationId: string
): { pos: THREE.Vector3; caption: string } {
  if (missingContactId !== null && hops.length === 0) {
    const rec = satrecs.get(originSatId);
    const pos = (rec && getSatVector3(rec, timeMs)) || new THREE.Vector3(0, 0, 0);
    return { pos, caption: `Contact ${missingContactId} missing from the response` };
  }

  if (hops.length === 0) {
    const st = stationsMap.get(destStationId);
    const pos = st ? getStationVector3(st.lat, st.lng) : new THREE.Vector3(0, 0, 0);
    return { pos, caption: "" };
  }

  const lastHop = hops[hops.length - 1];

  // Before first departure
  if (timeMs < hops[0].departMs) {
    const rec = satrecs.get(hops[0].fromNode);
    const pos = (rec && getSatVector3(rec, timeMs)) || new THREE.Vector3(0, 0, 0);
    const tMin = Math.max(0, Math.round((timeMs - t0) / 60000));
    return { pos, caption: `Packet on ${hops[0].fromNode}, T+${tMin} min` };
  }

  // After last arrival
  if (timeMs >= lastHop.arriveMs) {
    const st = stationsMap.get(lastHop.toNode);
    let pos: THREE.Vector3;
    if (st) {
      pos = getStationVector3(st.lat, st.lng);
    } else {
      const rec = satrecs.get(lastHop.toNode);
      pos = (rec && getSatVector3(rec, lastHop.arriveMs)) || new THREE.Vector3(0, 0, 0);
    }
    const destName = st?.city || st?.name || destStationId;
    return {
      pos,
      caption: `Delivered to ${destName} at ${formatLocalTime(lastHop.arriveMs)}`,
    };
  }

  // Inside hops or waiting between hops
  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    // During hop transfer
    if (timeMs >= hop.departMs && timeMs < hop.arriveMs) {
      const p = (timeMs - hop.departMs) / (hop.arriveMs - hop.departMs);
      const posFrom = new THREE.Vector3();
      const recFrom = satrecs.get(hop.fromNode);
      if (recFrom) {
        const v = getSatVector3(recFrom, timeMs);
        if (v) posFrom.copy(v);
      } else {
        const stFrom = stationsMap.get(hop.fromNode);
        if (stFrom) posFrom.copy(getStationVector3(stFrom.lat, stFrom.lng));
      }

      const posTo = new THREE.Vector3();
      const recTo = satrecs.get(hop.toNode);
      if (recTo) {
        const v = getSatVector3(recTo, timeMs);
        if (v) posTo.copy(v);
      } else {
        const stTo = stationsMap.get(hop.toNode);
        if (stTo) posTo.copy(getStationVector3(stTo.lat, stTo.lng));
      }

      const isDownlink = hop.kind === "DOWNLINK" || stationsMap.has(hop.toNode);
      const pos = interpolatePacketPos(posFrom, posTo, p, isDownlink);
      return { pos, caption: `Packet moving ${hop.fromNode} to ${hop.toNode}` };
    }

    // Between this hop and next hop
    if (i < hops.length - 1 && timeMs >= hop.arriveMs && timeMs < hops[i + 1].departMs) {
      let pos = new THREE.Vector3();
      const rec = satrecs.get(hop.toNode);
      if (rec) {
        const v = getSatVector3(rec, timeMs);
        if (v) pos = v;
      } else {
        const st = stationsMap.get(hop.toNode);
        if (st) pos = getStationVector3(st.lat, st.lng);
      }
      const tMin = Math.max(0, Math.round((timeMs - t0) / 60000));
      return { pos, caption: `Packet on ${hop.toNode}, T+${tMin} min` };
    }
  }

  return { pos: new THREE.Vector3(0, 0, 0), caption: "" };
}

interface HeroSceneProps {
  network: PublicNetwork | null;
  selectedSatId: string;
  selectedRoute: PublicRoute | null;
  contactsMap: Map<number, PublicContact>;
  stationsMap: Map<string, PublicStation>;
  satrecs: Map<string, satellite.SatRec>;
  replayCaptionRef: React.RefObject<HTMLSpanElement | null>;
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

  const packetGeo = useMemo(() => new THREE.SphereGeometry(0.02 * EARTH_R, 16, 16), []);
  const packetMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff453a" }), []);

  // 2px red trail line
  const MAX_TRAIL = 1200;
  const trailPositions = useMemo(() => new Float32Array(MAX_TRAIL * 3), []);
  // Line2 so the trail is a real 2 px line (WebGL ignores linewidth on THREE.Line).
  const trailGeometry = useMemo(() => new LineGeometry(), []);
  const trailMaterial = useMemo(
    () => new LineMaterial({ color: 0xff453a, linewidth: 2, worldUnits: false }),
    []
  );
  const trailLine = useMemo(() => {
    const line = new Line2(trailGeometry, trailMaterial);
    line.frustumCulled = false;
    line.visible = false;
    return line;
  }, [trailGeometry, trailMaterial]);
  const { size } = useThree();
  useEffect(() => {
    trailMaterial.resolution.set(size.width, size.height);
  }, [size, trailMaterial]);
  const syncTrail = useCallback(
    (count: number) => {
      if (count < 2) {
        trailLine.visible = false;
        return;
      }
      // A fresh geometry per update: re-filling a rendered LineGeometry does not redraw.
      const next = new LineGeometry();
      next.setPositions(trailPositions.subarray(0, count * 3));
      const prev = trailLine.geometry;
      trailLine.geometry = next;
      if (prev !== trailGeometry) prev.dispose();
      trailLine.visible = true;
    },
    [trailGeometry, trailLine, trailPositions]
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
      if (trailLine.geometry !== trailGeometry) trailLine.geometry.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
    };
  }, [
    satDotGeo,
    satDotWhiteMat,
    satDotBlueMat,
    stationDotGeo,
    stationDotMat,
    packetGeo,
    packetMat,
    trailGeometry,
    trailMaterial,
    trailLine,
  ]);

  // Replay control state inside refs
  const followRef = useRef(false);
  const replayState = useRef({
    t0: 0,
    lastArrive: 0,
    durationMs: 4000,
    hops: [] as HopTimeline[],
    missingContactId: null as number | null,
    isReplayActive: false,
    replayStartTime: 0,
    trailCount: 0,
    isTurning: false,
    turnStartTime: 0,
    startRotY: 0,
    startRotX: 0,
    targetRotY: 0,
    targetRotX: 0,
    lastCaption: "",
  });

  // Track selection changes to re-trigger replay
  useEffect(() => {
    if (!selectedRoute) {
      replayState.current.isReplayActive = false;
      replayState.current.isTurning = false;
      replayState.current.trailCount = 0;
      syncTrail(0);
      if (packetMeshRef.current) packetMeshRef.current.visible = false;
      if (replayCaptionRef.current) replayCaptionRef.current.textContent = "";
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
      const arrive = depart + 34_000;
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

    const lastArrive = hops.length > 0 ? hops[hops.length - 1].arriveMs : t0;
    const numHops = Math.max(1, hops.length);
    const durationMs = Math.min(8000, Math.max(4000, numHops * 1500));

    // Midpoint orientation
    const recOrigin = satrecs.get(selectedSatId);
    const posOrigin = recOrigin ? getSatVector3(recOrigin, t0) : new THREE.Vector3(1, 0, 0);
    const destStation = stationsMap.get(selectedRoute.destination);
    const posDest = destStation
      ? getStationVector3(destStation.lat, destStation.lng)
      : new THREE.Vector3(1, 0, 0);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Animated: start facing the origin, then the Earth follows the packet.
    // Reduced motion: face the destination, where the packet ends.
    const mid = (reduced ? posDest : posOrigin ?? posDest).clone().normalize();

    const currentRotY = earthGroup.current ? earthGroup.current.rotation.y : 0;
    const currentRotX = earthGroup.current ? earthGroup.current.rotation.x : 0;

    const targetRotYRaw = -Math.atan2(mid.x, mid.z);
    const targetRotXRaw = THREE.MathUtils.clamp(
      Math.atan2(mid.y, Math.sqrt(mid.x * mid.x + mid.z * mid.z)) * 0.4,
      -0.4,
      0.4
    );

    let diffY = (targetRotYRaw - currentRotY) % (2 * Math.PI);
    if (diffY > Math.PI) diffY -= 2 * Math.PI;
    if (diffY < -Math.PI) diffY += 2 * Math.PI;
    const targetRotY = currentRotY + diffY;
    const targetRotX = targetRotXRaw;

    if (reduced) {
      if (earthGroup.current) {
        earthGroup.current.rotation.y = targetRotY;
        earthGroup.current.rotation.x = targetRotX;
      }
      // Sample 240 points for trail
      for (let i = 0; i < 240; i++) {
        const t = t0 + (i / 239) * (lastArrive - t0);
        const st = computePacketState(
          t,
          t0,
          hops,
          missingContactId,
          satrecs,
          stationsMap,
          selectedSatId,
          selectedRoute.destination
        );
        trailPositions[i * 3] = st.pos.x;
        trailPositions[i * 3 + 1] = st.pos.y;
        trailPositions[i * 3 + 2] = st.pos.z;
      }
      syncTrail(240);

      if (packetMeshRef.current) {
        packetMeshRef.current.position.copy(posDest);
        packetMeshRef.current.visible = true;
      }

      const destName = destStation?.city || destStation?.name || selectedRoute.destination;
      const finalCap = `Delivered to ${destName} at ${formatLocalTime(selectedRoute.arrival_ts)}`;
      if (replayCaptionRef.current) replayCaptionRef.current.textContent = finalCap;

      replayState.current = {
        t0,
        lastArrive,
        durationMs,
        hops,
        missingContactId,
        isReplayActive: false,
        replayStartTime: 0,
        trailCount: 240,
        isTurning: false,
        turnStartTime: 0,
        startRotY: targetRotY,
        startRotX: targetRotX,
        targetRotY,
        targetRotX,
        lastCaption: finalCap,
      };
    } else {
      // Animated replay
      followRef.current = true;
      replayState.current = {
        t0,
        lastArrive,
        durationMs,
        hops,
        missingContactId,
        isReplayActive: true,
        replayStartTime: performance.now() + 900,
        trailCount: 0,
        isTurning: true,
        turnStartTime: performance.now(),
        startRotY: currentRotY,
        startRotX: currentRotX,
        targetRotY,
        targetRotX,
        lastCaption: `Packet on ${selectedSatId}, T+0 min`,
      };
      syncTrail(0);
      if (replayCaptionRef.current) {
        replayCaptionRef.current.textContent = `Packet on ${selectedSatId}, T+0 min`;
      }
    }
  }, [
    selectedRoute,
    selectedSatId,
    contactsMap,
    stationsMap,
    satrecs,
    syncTrail,
    trailPositions,
    replayCaptionRef,
  ]);

  useFrame((_, dt) => {
    if (!isVisible || !earthGroup.current) return;
    const now = performance.now();
    const s = replayState.current;

    // 1. Earth rotation
    if (userDragDelta.current.x !== 0 || userDragDelta.current.y !== 0) {
      followRef.current = false;
      earthGroup.current.rotation.y += userDragDelta.current.x;
      earthGroup.current.rotation.x = THREE.MathUtils.clamp(
        earthGroup.current.rotation.x + userDragDelta.current.y,
        -0.6,
        0.6
      );
      userDragDelta.current.x = 0;
      userDragDelta.current.y = 0;
    } else if (selectedRoute && s.isTurning) {
      const elapsedTurn = now - s.turnStartTime;
      const tTurn = Math.min(1, elapsedTurn / 900);
      const ease = 1 - Math.pow(1 - tTurn, 3);
      earthGroup.current.rotation.y = THREE.MathUtils.lerp(s.startRotY, s.targetRotY, ease);
      earthGroup.current.rotation.x = THREE.MathUtils.lerp(s.startRotX, s.targetRotX, ease);
      if (tTurn >= 1) {
        s.isTurning = false;
      }
    } else if (!selectedRoute) {
      // Idle slow turn: about 0.02 rad/s
      earthGroup.current.rotation.y += dt * 0.02;
    }

    // 2. Simulation display time & packet state
    let displayMs = Date.now();
    let currentPktPos: THREE.Vector3 | null = null;
    let currentCaption = "";
    let finishReplay = false;

    if (selectedRoute) {
      if (s.isReplayActive) {
        const kf = replayKeyframes(s.t0, s.hops);
        const total = kf.anim[kf.anim.length - 1] || 1;
        const animElapsed = Math.max(0, now - s.replayStartTime);
        const animProgress = Math.min(1, animElapsed / total);
        displayMs = animToReal(Math.min(animElapsed, total), kf);

        const st = computePacketState(
          displayMs,
          s.t0,
          s.hops,
          s.missingContactId,
          satrecs,
          stationsMap,
          selectedSatId,
          selectedRoute.destination
        );
        currentPktPos = st.pos;
        currentCaption = st.caption;

        finishReplay = animProgress >= 1;
      } else {
        displayMs = s.lastArrive;
        const st = computePacketState(
          s.lastArrive,
          s.t0,
          s.hops,
          s.missingContactId,
          satrecs,
          stationsMap,
          selectedSatId,
          selectedRoute.destination
        );
        currentPktPos = st.pos;
        currentCaption = st.caption;
      }
    }

    // 3. Propagate satellites once per frame
    for (const [satId, rec] of satrecs.entries()) {
      const mesh = satMeshesRef.current.get(satId);
      if (!mesh) continue;
      const p = propagateSat(rec, displayMs);
      if (p) {
        const r = EARTH_R * (1 + p.alt * 1.5);
        latLngToVector3(p.lat, p.lng, r, mesh.position);
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    }

    // 4. Update packet mesh & append to trail
    if (currentPktPos && packetMeshRef.current) {
      packetMeshRef.current.position.copy(currentPktPos);
      packetMeshRef.current.visible = true;

      if (s.isReplayActive && s.trailCount < MAX_TRAIL) {
        const lastX = s.trailCount > 0 ? trailPositions[(s.trailCount - 1) * 3] : Infinity;
        const lastY = s.trailCount > 0 ? trailPositions[(s.trailCount - 1) * 3 + 1] : Infinity;
        const lastZ = s.trailCount > 0 ? trailPositions[(s.trailCount - 1) * 3 + 2] : Infinity;
        const dx = currentPktPos.x - lastX;
        const dy = currentPktPos.y - lastY;
        const dz = currentPktPos.z - lastZ;
        if (dx * dx + dy * dy + dz * dz > 0.0001 || s.trailCount === 0) {
          trailPositions[s.trailCount * 3] = currentPktPos.x;
          trailPositions[s.trailCount * 3 + 1] = currentPktPos.y;
          trailPositions[s.trailCount * 3 + 2] = currentPktPos.z;
          s.trailCount++;
              syncTrail(s.trailCount);
        }
      }
    } else if (packetMeshRef.current) {
      packetMeshRef.current.visible = false;
    }
    if (finishReplay) s.isReplayActive = false;

    // 5. Keep the packet on the visible face: the Earth turns under it while it travels,
    //    then settles with the destination facing the viewer.
    if (selectedRoute && currentPktPos && followRef.current && !s.isTurning) {
      const p = currentPktPos;
      const g = earthGroup.current;
      const ty = -Math.atan2(p.x, p.z);
      const tx = THREE.MathUtils.clamp(Math.atan2(p.y, Math.hypot(p.x, p.z)) * 0.6, -0.5, 0.5);
      let dy = (ty - g.rotation.y) % (2 * Math.PI);
      if (dy > Math.PI) dy -= 2 * Math.PI;
      if (dy < -Math.PI) dy += 2 * Math.PI;
      const k = 1 - Math.exp(-dt * 2.5);
      g.rotation.y += dy * k;
      g.rotation.x += (tx - g.rotation.x) * k;
      if (!s.isReplayActive && Math.abs(dy) < 0.002) followRef.current = false;
    }

    // 6. Update caption without React state changes
    if (currentCaption && currentCaption !== s.lastCaption) {
      s.lastCaption = currentCaption;
      if (replayCaptionRef.current) {
        replayCaptionRef.current.textContent = currentCaption;
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

      {/* Earth group carrying rotation, stations, satellites, and packet */}
      <group ref={earthGroup}>
        {maps && <Earth maps={maps} />}
        <Atmosphere />

        {/* Stations */}
        {stationList.map((st) => {
          const isDest = selectedRoute?.destination === st.id;
          const pos = getStationVector3(st.lat, st.lng);
          return (
            <group key={st.id} position={pos}>
              <mesh geometry={stationDotGeo} material={stationDotMat} />
              {isDest && (
                <Html
                  position={[0, 0, 0]}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                  center={false}
                >
                  <span
                    className="text-[12px] text-white whitespace-nowrap pl-2 block font-sans"
                    style={{
                      fontFamily: "var(--font-sans)",
                      textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                    }}
                  >
                    {st.name}
                  </span>
                </Html>
              )}
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

        {/* Packet: 8px-ish solid red dot */}
        <mesh ref={packetMeshRef} geometry={packetGeo} material={packetMat} visible={false} />

        {/* Packet Trail: 2px red line */}
        <primitive object={trailLine} />
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
      className="relative min-h-[100svh] bg-black text-white pt-16 lg:pt-20 overflow-x-clip flex flex-col justify-center"
    >
      <div className="mx-auto max-w-[1200px] w-full px-4 md:px-8 py-8 lg:py-12 flex-1 flex flex-col justify-center">
        <div className="flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center">
          {/* Earth Canvas: Phones on top (order-1, ~52svh), Desktop on right (order-2, col-span-7, bleed-off) */}
          <div
            className="order-1 lg:order-2 lg:col-span-7 w-full h-[52svh] lg:h-[680px] xl:h-[760px] relative lg:-mr-16 xl:-mr-32 overflow-visible select-none cursor-grab active:cursor-grabbing"
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
                userDragDelta={userDragDelta}
                isVisible={isVisible}
              />
            </Canvas>
          </div>

          {/* Left Column: Copy & Route Finder */}
          <div className="order-2 lg:order-1 lg:col-span-5 z-10 mt-6 lg:mt-0">
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
