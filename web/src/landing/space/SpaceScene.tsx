import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { PublicNetwork } from "@/landing/publicApi";
import { Atmosphere, Earth, EARTH_R, SUN_DIR, useEarthMaps } from "@/landing/earth/Earth";
import { isWideViewport, SCENES, scenePosition } from "./scroll";
import {
  getEarthScale,
  getSatelliteWorldSpan,
  getVisibleFrustumHeight,
  interpolateKeyframes,
  screenToWorld,
} from "./keyframes";
import { Satellite } from "@/landing/hero/Satellite";
import {
  FleetOrbits,
  type FleetOrbitsHandle,
  OrbitArc,
  type OrbitArcHandle,
  OrbitShells,
  type OrbitShellsHandle,
  Starfield,
  type StarfieldHandle,
} from "./effects";

/** Deep navy-black space, as in the reference. Matches --lx-space in landing.css. */
const SPACE_COLOR = "#05080f";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function EnvironmentSetup() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv);
    scene.environment = envTarget.texture;

    return () => {
      scene.environment = null;
      envTarget.dispose();
      roomEnv.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function CameraParallax({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree();
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) return;
    const onPointerMove = (e: PointerEvent) => {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      pointerRef.current.x = (e.clientX - halfW) / (halfW || 1);
      pointerRef.current.y = -(e.clientY - halfH) / (halfH || 1);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [reducedMotion]);

  const parallax = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    // Past the last scene the page keeps scrolling (to the footer): slide the view so the Earth
    // leaves with the text instead of staying pinned behind it.
    const last = document.getElementById(SCENES[SCENES.length - 1].id);
    const overflowPx = last ? Math.max(0, -last.getBoundingClientRect().top) : 0;
    const scrollY = (overflowPx * getVisibleFrustumHeight(35, 10)) / (window.innerHeight || 1);

    const par = parallax.current;
    if (reducedMotion) {
      par.x = 0;
      par.y = 0;
    } else {
      par.x = THREE.MathUtils.damp(par.x, pointerRef.current.x * 0.12, 3.5, delta);
      par.y = THREE.MathUtils.damp(par.y, pointerRef.current.y * 0.12, 3.5, delta);
    }
    camera.position.set(par.x, par.y - scrollY, 10);
    camera.lookAt(0, -scrollY, 0);
  });

  return null;
}

/** The SomaiyaSat model, measured once so the scene can size it in screen pixels. */
function HeroSatellite({
  tumbleRef,
  spanRef,
}: {
  tumbleRef: React.RefObject<THREE.Group | null>;
  spanRef: React.MutableRefObject<number>;
}) {
  const inner = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!inner.current) return;
    const size = new THREE.Box3().setFromObject(inner.current).getSize(new THREE.Vector3());
    spanRef.current = Math.max(size.x, size.y, size.z) || 1;
  }, [spanRef]);
  return (
    <group ref={tumbleRef}>
      <group ref={inner}>
        <Satellite />
      </group>
    </group>
  );
}

interface SceneContentProps {
  network: PublicNetwork | null;
  reducedMotion: boolean;
}

function SceneContent({ network, reducedMotion }: SceneContentProps) {
  const maps = useEarthMaps();

  // Three hierarchy refs
  const earthGroupRef = useRef<THREE.Group>(null);
  const earthSpinGroupRef = useRef<THREE.Group>(null);
  const satelliteGroupRef = useRef<THREE.Group>(null);

  // Sub-effect handles
  const starfieldRef = useRef<StarfieldHandle>(null);
  const orbitArcRef = useRef<OrbitArcHandle>(null);
  const orbitShellsRef = useRef<OrbitShellsHandle>(null);
  const fleetOrbitsRef = useRef<FleetOrbitsHandle>(null);
  const tumbleGroupRef = useRef<THREE.Group>(null);
  const satSpanRef = useRef(1);

  // Scratch vectors to avoid allocations inside useFrame
  const scratchSatPos = useRef(new THREE.Vector3());
  // Orbit arc frame: the Earth's silhouette circle and a basis in its plane.
  const arc = useRef({
    earth: new THREE.Vector3(),
    n: new THREE.Vector3(),
    centre: new THREE.Vector3(),
    u: new THREE.Vector3(),
    v: new THREE.Vector3(),
    point: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    spin: new THREE.Quaternion(),
    zAxis: new THREE.Vector3(0, 0, 1),
  });
  const ss1WorldPos = useRef(new THREE.Vector3());
  const hasSs1 = useRef(false);

  // Time & Intro tracking
  const timeRef = useRef(0);
  const spinRef = useRef(0);
  const tumbleRef = useRef(0);
  const introRef = useRef(reducedMotion ? 1.0 : 0.0);

  // Damped render state values
  const renderedState = useRef({
    earthCenter: [0.5, 1.3] as [number, number],
    earthDiameter: 1.5,
    satPos: [0.69, 0.58] as [number, number],
    satSizePx: 120,
    satRotation: [0.35, -0.65, 0.2] as [number, number, number],
    earthYawOffset: 0.1,
    orbitArc: 1.0,
    orbitShells: 0.0,
    fleetOrbits: 0.0,
  });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);

    // Intro progress (1.8s ease-out)
    if (!reducedMotion && introRef.current < 1.0) {
      introRef.current = Math.min(1.0, introRef.current + delta / 1.8);
    }
    const introT = introRef.current;
    const introEase = reducedMotion ? 1.0 : 1.0 - Math.pow(1.0 - introT, 3);

    if (!reducedMotion) {
      timeRef.current += dt;
      spinRef.current += dt * 0.025;
      tumbleRef.current += dt * 0.15;
    }

    const p = scenePosition();
    const isWide = isWideViewport();
    const target = interpolateKeyframes(p, isWide);

    const r = renderedState.current;
    const lambda = 5.0;

    if (reducedMotion) {
      r.earthCenter[0] = target.earthCenter[0];
      r.earthCenter[1] = target.earthCenter[1];
      r.earthDiameter = target.earthDiameter;
      r.satPos[0] = target.satPos[0];
      r.satPos[1] = target.satPos[1];
      r.satSizePx = target.satSizePx;
      r.satRotation[0] = target.satRotation[0];
      r.satRotation[1] = target.satRotation[1];
      r.satRotation[2] = target.satRotation[2];
      r.earthYawOffset = target.earthYawOffset;
      r.orbitArc = target.orbitArc;
      r.orbitShells = target.orbitShells;
      r.fleetOrbits = target.fleetOrbits;
    } else {
      r.earthCenter[0] = THREE.MathUtils.damp(r.earthCenter[0], target.earthCenter[0], lambda, dt);
      r.earthCenter[1] = THREE.MathUtils.damp(r.earthCenter[1], target.earthCenter[1], lambda, dt);
      r.earthDiameter = THREE.MathUtils.damp(r.earthDiameter, target.earthDiameter, lambda, dt);
      r.satPos[0] = THREE.MathUtils.damp(r.satPos[0], target.satPos[0], lambda, dt);
      r.satPos[1] = THREE.MathUtils.damp(r.satPos[1], target.satPos[1], lambda, dt);
      r.satSizePx = THREE.MathUtils.damp(r.satSizePx, target.satSizePx, lambda, dt);
      r.satRotation[0] = THREE.MathUtils.damp(r.satRotation[0], target.satRotation[0], lambda, dt);
      r.satRotation[1] = THREE.MathUtils.damp(r.satRotation[1], target.satRotation[1], lambda, dt);
      r.satRotation[2] = THREE.MathUtils.damp(r.satRotation[2], target.satRotation[2], lambda, dt);
      r.earthYawOffset = THREE.MathUtils.damp(r.earthYawOffset, target.earthYawOffset, lambda, dt);
      r.orbitArc = THREE.MathUtils.damp(r.orbitArc, target.orbitArc, lambda, dt);
      r.orbitShells = THREE.MathUtils.damp(r.orbitShells, target.orbitShells, lambda, dt);
      r.fleetOrbits = THREE.MathUtils.damp(r.fleetOrbits, target.fleetOrbits, lambda, dt);
    }

    // Screen to world coordinates
    const aspect = state.size.width / (state.size.height || 1);
    const H = getVisibleFrustumHeight(35, 10);
    const earthWorld = screenToWorld(r.earthCenter[0], r.earthCenter[1], aspect, 35, 10);

    // Earth rises 6% of viewport into place on intro
    const earthIntroOffsetY = (1.0 - introEase) * (-0.06 * H);
    const earthFinalY = earthWorld.y + earthIntroOffsetY;
    const earthScale = getEarthScale(r.earthDiameter, H, EARTH_R);

    if (earthGroupRef.current) {
      earthGroupRef.current.position.set(earthWorld.x, earthFinalY, 0);
      earthGroupRef.current.scale.setScalar(earthScale);
    }

    const totalYaw = spinRef.current + r.earthYawOffset;
    if (earthSpinGroupRef.current) {
      earthSpinGroupRef.current.rotation.y = totalYaw;
    }

    // Compute Satellite position & scale
    const satZ = 1.8;
    // Section 0 subtle motion along arc
    const arcShift = p < 0.2 ? p * 0.05 : 0;
    const satSx = r.satPos[0] + arcShift;
    const satSy = r.satPos[1] - arcShift * 0.4;
    const satWorld = screenToWorld(satSx, satSy, aspect, 35, 10 - satZ);

    // Orbit arc. Sight lines from the camera graze the Earth along one circle (centre a.centre,
    // radius rho, in the plane facing the camera); that circle is the limb you see. The arc is a
    // slightly larger circle in the same plane, so on screen it hugs the limb just outside it,
    // even though the near side of the Earth bulges toward the camera.
    const a = arc.current;
    const earthR = EARTH_R * earthScale;
    a.earth.set(earthWorld.x, earthFinalY, 0);
    a.n.copy(state.camera.position).sub(a.earth);
    const camDist = a.n.length();
    a.n.divideScalar(camDist);
    const ratio = Math.min(0.95, earthR / camDist);
    a.centre.copy(a.earth).addScaledVector(a.n, earthR * ratio);
    const arcR = earthR * Math.sqrt(1 - ratio * ratio) * 1.05;
    a.u.set(1, 0, 0).addScaledVector(a.n, -a.n.x).normalize();
    a.v.crossVectors(a.n, a.u);
    // The satellite rides the arc in the direction its keyframe puts it around the Earth.
    const satAt0 = screenToWorld(satSx, satSy, aspect, 35, 10);
    const sdx = satAt0.x - earthWorld.x;
    const sdy = satAt0.y - earthFinalY;
    const arcHead = Math.atan2(sdx * a.v.x + sdy * a.v.y, sdx * a.u.x + sdy * a.u.y);
    a.point
      .copy(a.centre)
      .addScaledVector(a.u, Math.cos(arcHead) * arcR)
      .addScaledVector(a.v, Math.sin(arcHead) * arcR);
    a.basis.makeBasis(a.u, a.v, a.n);
    a.quat.setFromRotationMatrix(a.basis).multiply(a.spin.setFromAxisAngle(a.zAxis, arcHead));

    scratchSatPos.current.set(satWorld.x, satWorld.y, satZ).lerp(a.point, r.orbitArc);
    if (r.fleetOrbits > 0.3 && hasSs1.current) {
      const blend = THREE.MathUtils.smoothstep(r.fleetOrbits, 0.3, 1.0);
      scratchSatPos.current.lerp(ss1WorldPos.current, blend);
    }

    const H_sat = getVisibleFrustumHeight(35, Math.max(1, state.camera.position.z - scratchSatPos.current.z));
    const satWorldSpan = getSatelliteWorldSpan(r.satSizePx, H_sat, state.size.height);
    const satModelScale = satWorldSpan / satSpanRef.current;

    if (satelliteGroupRef.current) {
      satelliteGroupRef.current.position.copy(scratchSatPos.current);
      satelliteGroupRef.current.rotation.set(r.satRotation[0], r.satRotation[1], r.satRotation[2]);
      satelliteGroupRef.current.scale.setScalar(satModelScale);
      satelliteGroupRef.current.visible = satModelScale > 0.00001;
    }

    // Synchronize sub-effects directly
    starfieldRef.current?.update(p, timeRef.current, reducedMotion);
    orbitArcRef.current?.update(r.orbitArc, introEase, a.centre, a.quat, arcR);
    orbitShellsRef.current?.update(r.orbitShells, timeRef.current, reducedMotion);

    const ss1Local = fleetOrbitsRef.current?.update(r.fleetOrbits);
    if (ss1Local && earthSpinGroupRef.current) {
      ss1WorldPos.current.copy(ss1Local).applyMatrix4(earthSpinGroupRef.current.matrixWorld);
      hasSs1.current = true;
    }

    if (tumbleGroupRef.current) tumbleGroupRef.current.rotation.y = tumbleRef.current;
  });

  return (
    <>
      {/* Background Starfield */}
      <Starfield ref={starfieldRef} reducedMotion={reducedMotion} />

      {/* Earth and concentric orbital structures */}
      <group ref={earthGroupRef}>
        {/* Soft outer halo behind Earth: faint disc + two camera-facing rings */}
        <group position={[0, 0, -0.05]}>
          <mesh>
            <circleGeometry args={[1.25 * EARTH_R, 64]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.015}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[1.246 * EARTH_R, 1.254 * EARTH_R, 96]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.04}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[1.595 * EARTH_R, 1.605 * EARTH_R, 96]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.04}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>

        {/* Orbit Shells (satellites section) */}
        <OrbitShells ref={orbitShellsRef} reducedMotion={reducedMotion} />

        {/* Tilted Earth Group (tilted ~0.32 rad on z) */}
        <group rotation={[0, 0, 0.32]}>
          <group ref={earthSpinGroupRef}>
            {maps ? (
              <Earth maps={maps} />
            ) : (
              <mesh>
                <sphereGeometry args={[EARTH_R, 64, 64]} />
                <meshStandardMaterial color="#0c1d3b" roughness={0.8} />
              </mesh>
            )}
            <Atmosphere />

            {/* Constellation Fleet & Ground Stations */}
            <FleetOrbits ref={fleetOrbitsRef} network={network} />
          </group>
        </group>
      </group>

      {/* Glowing orbit arc through the satellite (network section) */}
      <OrbitArc ref={orbitArcRef} />

      {/* Hero 3D PocketQube Satellite */}
      <group ref={satelliteGroupRef}>
        <HeroSatellite tumbleRef={tumbleGroupRef} spanRef={satSpanRef} />
      </group>

    </>
  );
}

export function SpaceScene({ network }: { network: PublicNetwork | null }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 35 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(SPACE_COLOR, 1);
        }}
      >
        <EnvironmentSetup />
        <CameraParallax reducedMotion={reducedMotion} />
        <ambientLight intensity={0.15} />
        <directionalLight
          position={[SUN_DIR.x * 20, SUN_DIR.y * 20, SUN_DIR.z * 20]}
          intensity={2.2}
        />
        <SceneContent network={network} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
