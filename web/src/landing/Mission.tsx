import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Earth, useEarthMaps } from "./hero/CinematicHero";

/** SpaceX band: left-aligned mission statement with the Earth to the right. */
export function Mission() {
  return (
    <section id="mission" className="sx-section" style={{ background: "#000" }}>
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 text-left">
          <p className="sx-eyebrow">The mission</p>
          <h2 className="sx-h2 mt-4">
            Send what matters first, and prove every decision.
          </h2>
          <p className="sx-lead mt-6">
            SomaiyaNet is a four-satellite PocketQube constellation (three flying, one waiting in its
            deployer) released by the SomaiyaPod deployer, developed in collaboration with ReOrbit,
            Finland, for the amateur radio community. Critical health telemetry transmits first,
            followed by SSTV imagery, and finally digital voice.
          </p>
        </div>
        <div className="mx-auto h-[260px] w-[260px] md:h-[360px] md:w-[360px]" aria-hidden="true">
          <Canvas dpr={[1, 2]} camera={{ position: [0, 0.35, 4.1], fov: 40 }} gl={{ alpha: true, antialias: true }}>
            <MiniEarth />
          </Canvas>
        </div>
      </div>
    </section>
  );
}

function MiniEarth() {
  const maps = useEarthMaps();
  const spin = useRef<THREE.Group>(null);
  const dots = useRef<THREE.Group>(null);
  const one = useRef(1);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // an inclined orbit drawn as a thin ellipse that passes in front and behind
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  useFrame((s, d) => {
    if (reducedMotion) return;
    if (spin.current) spin.current.rotation.y += d * 0.12;
    dots.current?.children.forEach((c, i) => {
      const a = s.clock.elapsedTime * 0.35 + i * 0.32;
      c.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
    });
  });
  return (
    <>
      <ambientLight intensity={0.4} />
      <group scale={0.62}>
        <group ref={spin} rotation={[0.35, 0, 0]}>
          {maps && <Earth maps={maps} opacity={one} />}
        </group>
      </group>
      <group rotation={[0.18, 0, -0.32]}>
        <lineLoop geometry={ring}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </lineLoop>
        <group ref={dots}>
          {Array.from({ length: 4 }).map((_, i) => (
            <mesh key={i}>
              <sphereGeometry args={[i === 0 ? 0.05 : 0.028, 12, 12]} />
              <meshBasicMaterial color={i === 0 ? "#ff453a" : "#ffffff"} />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}
