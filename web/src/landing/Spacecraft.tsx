import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Satellite } from "./hero/Satellite";

const SPECS: Array<[string, string]> = [
  ["Form factor", "127.4 × 57.9 × 57.2 mm"],
  ["Fleet size", "4 PocketQubes (3 flying, 1 in deployer)"],
  ["Deployer mechanism", "SomaiyaPod orbital deployer"],
  ["Target orbit", "525 km sun-synchronous orbit (Plane A)"],
  ["Payload communication", "Digital Voice (M17, Codec2) · SSTV Imagery · TT&C"],
  ["Inter-satellite range", "Up to 2,000 km line-of-sight"],
  ["Autonomous routing engine", "93-node decision tree in PostgreSQL"],
];

/**
 * SpaceX product band: big title, lead line, the model, and specs as an
 * Apple inset-grouped list.
 */
export function Spacecraft() {
  return (
    <section id="spacecraft" className="sx-section" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="sx-h1 max-w-[16ch]">
          Small enough to fit in your hand.
        </h2>
        <p className="sx-lead mt-6">
          A PocketQube that makes its own routing decisions and records every one of them.
        </p>

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div
            className="relative aspect-[4/3] w-full overflow-hidden"
            style={{ background: "var(--sx-surface)", borderRadius: 14 }}
          >
            <Canvas
              className="!absolute inset-0"
              dpr={[1, 2]}
              camera={{ position: [0, 0.25, 6.2], fov: 32 }}
              gl={{ alpha: true, antialias: true }}
              aria-label="3D model of SomaiyaSat PocketQube satellite"
            >
              <Blueprint />
            </Canvas>
            <div className="sx-eyebrow pointer-events-none absolute bottom-3 left-4">
              SomaiyaSat · Not to scale
            </div>
          </div>

          <dl className="sx-group">
            {SPECS.map(([k, v]) => (
              <div key={k} className="sx-row">
                <dt className="sx-body">{k}</dt>
                <dd className="sx-num text-right text-[13px] text-white">{v}</dd>
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
      <directionalLight position={[-4, -1, 2]} intensity={0.6} color="#ffffff" />
      {/* the outline drawing behind, front view */}
      <group position={[-0.15, 0.3, -2.4]} scale={0.95}>
        <Satellite lineArt lineColor="#ffffff" />
      </group>
      {/* the rendered spacecraft in front, three-quarter view */}
      <group ref={model} position={[0.45, -0.35, 1.0]} rotation={[0.25, -0.55, 0.12]} scale={0.78}>
        <Satellite />
      </group>
    </>
  );
}
