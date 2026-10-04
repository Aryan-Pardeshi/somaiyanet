import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SectionLabel } from "./SectionLabel";
import { Satellite } from "./hero/Satellite";

const SPECS: Array<[string, string]> = [
  ["Form factor", "127.4 × 57.9 × 57.2 mm"],
  ["Deployer mechanism", "SomaiyaPod orbital deployer"],
  ["Target orbit", "525 km sun-synchronous orbit"],
  ["Payload communication", "Digital Voice (M17, Codec2) · SSTV Imagery · TT&C"],
  ["Inter-satellite range", "Up to 2,000 km line-of-sight"],
  ["Autonomous routing engine", "93-node decision tree in PostgreSQL"],
];

/**
 * Blueprint block: the spacecraft drawn as a blue technical outline, with the
 * rendered model floating in front of it, and the mission specs on the right.
 */
export function Spacecraft() {
  return (
    <section className="border-t border-white/10" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1180px] px-6 py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-[16ch] font-light text-white" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
            Small enough to fit in your hand.
          </h2>
          <SectionLabel>SOMAIYASAT</SectionLabel>
        </div>

        <div className="mt-12 grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative aspect-[4/3] w-full overflow-hidden border border-white/10">
            {/* faint blueprint grid */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(61,91,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(61,91,255,0.12) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <Canvas
              className="!absolute inset-0"
              dpr={[1, 2]}
              camera={{ position: [0, 0.25, 6.2], fov: 32 }}
              gl={{ alpha: true, antialias: true }}
              aria-label="3D blueprint model of SomaiyaSat PocketQube satellite"
            >
              <Blueprint />
            </Canvas>
            <div className="font-mono pointer-events-none absolute bottom-3 left-3 text-[10px] tracking-[0.1em] text-[#3d5bff]">
              DWG SN-01 · SOMAIYASAT · NOT TO SCALE
            </div>
          </div>

          <dl className="divide-y divide-white/10 border-y border-white/10">
            {SPECS.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 py-4">
                <dt className="text-[14px] text-[#9aa3b8]">{k}</dt>
                <dd className="font-mono text-right text-[13px] text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function Blueprint() {
  const { gl, scene } = useThree();
  const model = useRef<THREE.Group>(null);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useFrame((s) => {
    if (model.current && !reducedMotion) {
      model.current.rotation.y = -0.55 + Math.sin(s.clock.elapsedTime * 0.25) * 0.35;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 3, 5]} intensity={2.4} />
      <directionalLight position={[-4, -1, 2]} intensity={0.6} color="#8fa8ff" />
      {/* the outline drawing behind, front view */}
      <group position={[-0.15, 0.3, -2.4]} scale={0.95}>
        <Satellite lineArt lineColor="#3d5bff" />
      </group>
      {/* the rendered spacecraft in front, three-quarter view */}
      <group ref={model} position={[0.45, -0.35, 1.0]} rotation={[0.25, -0.55, 0.12]} scale={0.78}>
        <Satellite />
      </group>
    </>
  );
}
