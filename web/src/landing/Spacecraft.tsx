import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { SectionLabel } from "./SectionLabel";
import { PocketQube } from "./hero/PocketQube";

const SPECS: Array<[string, string]> = [
  ["ENVELOPE", "127.4 × 57.9 × 57.2 MM"],
  ["DEPLOYER", "SOMAIYAPOD"],
  ["ORBIT", "~525 KM SSO"],
  ["PAYLOADS", "M17 · CODEC2 · SSTV · TT&C"],
  ["ISL RANGE", "≤ 2000 KM"],
  ["ROUTER", "DECISION TREE, 93 NODES, IN POSTGRESQL"],
];

/** Blueprint block: royal-blue outline drawing + small render + mono specs. */
export function Spacecraft() {
  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionLabel>SOMAIYASAT</SectionLabel>
        <div className="mt-8 grid items-start gap-10 md:grid-cols-2">
          <div className="relative border border-white/10 p-6">
            {/* royal-blue outline technical drawing, front + side */}
            <svg viewBox="0 0 400 200" className="w-full" role="img" aria-label="PocketQube blueprint">
              <g fill="none" stroke="var(--royal)" strokeWidth="1.5">
                <rect x="30" y="60" width="170" height="80" />
                <line x1="30" y1="100" x2="200" y2="100" opacity="0.6" />
                <rect x="230" y="70" width="70" height="60" />
                <line x1="230" y1="100" x2="300" y2="100" opacity="0.6" />
                {/* dimension lines */}
                <line x1="30" y1="160" x2="200" y2="160" strokeWidth="1" />
                <line x1="30" y1="156" x2="30" y2="164" strokeWidth="1" />
                <line x1="200" y1="156" x2="200" y2="164" strokeWidth="1" />
                <line x1="14" y1="60" x2="14" y2="140" strokeWidth="1" />
                <line x1="10" y1="60" x2="18" y2="60" strokeWidth="1" />
                <line x1="10" y1="140" x2="18" y2="140" strokeWidth="1" />
              </g>
              <g fill="#9aa3b8" fontSize="10" fontFamily="Geist Mono, monospace">
                <text x="90" y="176">127.4</text>
                <text x="2" y="104">57.9</text>
                <text x="238" y="146">57.2</text>
                <text x="30" y="52">PCB 1.6 · CELL 42.25 × 22.95</text>
              </g>
            </svg>
            <div className="absolute -bottom-2 -right-2 h-36 w-44 border border-white/15 bg-black">
              <Canvas camera={{ position: [2.6, 1.4, 2.6], fov: 40 }}>
                <Suspense fallback={null}>
                  <ambientLight intensity={0.9} />
                  <directionalLight position={[4, 3, 2]} intensity={1.6} />
                  <SpinCube />
                </Suspense>
              </Canvas>
            </div>
          </div>
          <dl className="font-mono space-y-4 text-right text-[12px] uppercase" style={{ letterSpacing: "0.08em" }}>
            {SPECS.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-4 border-b border-white/10 pb-3">
                <dt style={{ color: "#9aa3b8" }}>{k}</dt>
                <dd className="text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
function SpinCube() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (g.current) g.current.rotation.y += d * 0.5;
  });
  return (
    <group ref={g}>
      <PocketQube scale={1.2} />
    </group>
  );
}
