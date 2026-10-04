import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { SectionLabel } from "./SectionLabel";

/** Centered mission sentence + tiny rotating Earth with orbit ring + dot. */
export function Mission() {
  return (
    <section className="bg-black py-28" style={{ background: "#000" }}>
      <div className="mx-auto flex max-w-[820px] flex-col items-center px-6 text-center">
        <SectionLabel>MISSION</SectionLabel>
        <p
          className="mt-6 font-light text-white"
          style={{ fontSize: "clamp(32px, 4vw, 40px)", lineHeight: 1.25 }}
        >
          Give a tiny satellite the judgement to send what matters first —
          and prove every decision in a database.
        </p>
        <div className="mt-8 h-44 w-44">
          <Canvas camera={{ position: [0, 0.6, 3.4], fov: 45 }}>
            <Suspense fallback={null}>
              <ambientLight intensity={0.8} />
              <directionalLight position={[4, 2, 3]} intensity={1.4} />
              <MiniEarth />
            </Suspense>
          </Canvas>
        </div>
        <p className="mt-6 max-w-[62ch] text-[15px] leading-relaxed" style={{ color: "#9aa3b8" }}>
          SomaiyaSat is a PocketQube released by the SomaiyaPod deployer.
          Built with ReOrbit, Finland, and the HAM community — TT&amp;C
          first, then SSTV, then M17/Codec2 voice.
        </p>
      </div>
    </section>
  );
}

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function MiniEarth() {
  const g = useRef<THREE.Group>(null);
  const dot = useRef<THREE.Mesh>(null);
  const tex = useMemoTex();
  useFrame((s, d) => {
    if (g.current) g.current.rotation.y += d * 0.3;
    if (dot.current) {
      const a = s.clock.elapsedTime * 0.6;
      dot.current.position.set(Math.cos(a) * 1.25, 0.15, Math.sin(a) * 1.25);
    }
  });
  return (
    <group ref={g}>
      <mesh>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.25, 0.006, 8, 80]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
      <mesh ref={dot}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshBasicMaterial color="#d7263d" />
      </mesh>
    </group>
  );
}

import { useState, useEffect } from "react";
function useMemoTex(): THREE.Texture | undefined {
  const [t, setT] = useState<THREE.Texture | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}assets/textures/earth_day.jpg`,
      (tex) => {
        if (alive) {
          tex.colorSpace = THREE.SRGBColorSpace;
          setT(tex);
        }
      }
    );
    return () => {
      alive = false;
    };
  }, []);
  return t;
}
