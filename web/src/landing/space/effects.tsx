import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import * as satellite from "satellite.js";
import type { PublicNetwork, PublicSatellite, PublicStation } from "@/landing/publicApi";
import { EARTH_R } from "@/landing/earth/Earth";
import { getSatVector3, getStationVector3 } from "@/landing/earth/geo";

/** The one accent on the landing (lime, as in the reference): the orbit arc and the downlink. */
export const ACCENT = new THREE.Color("#9be15d");

// ---------------------------------------------------------------------------
// 1. STARFIELD
// ---------------------------------------------------------------------------

export interface StarfieldHandle {
  update: (scrollPos: number, time: number, reducedMotion: boolean) => void;
}

export interface StarfieldProps {
  scrollPos?: number;
  time?: number;
  reducedMotion?: boolean;
}

export const Starfield = forwardRef<StarfieldHandle, StarfieldProps>(function Starfield(
  { scrollPos = 0, time = 0, reducedMotion = false },
  ref
) {
  const countPerLayer = 1200;
  const nearGroupRef = useRef<THREE.Points>(null);
  const farGroupRef = useRef<THREE.Points>(null);

  const nearData = useMemo(() => {
    const positions = new Float32Array(countPerLayer * 3);
    const phases = new Float32Array(countPerLayer);
    const sizes = new Float32Array(countPerLayer);

    for (let i = 0; i < countPerLayer; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 50 + Math.random() * 8;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.8 + Math.random() * 1.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [countPerLayer]);

  const farData = useMemo(() => {
    const positions = new Float32Array(countPerLayer * 3);
    const phases = new Float32Array(countPerLayer);
    const sizes = new Float32Array(countPerLayer);

    for (let i = 0; i < countPerLayer; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 60 + Math.random() * 8;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.6 + Math.random() * 0.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [countPerLayer]);

  const starMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: typeof window !== "undefined" ? window.devicePixelRatio : 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vTwinkle;

        void main() {
          vTwinkle = 0.7 + 0.3 * sin(uTime * 2.2 + aPhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (60.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vTwinkle;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, dist) * vTwinkle;
          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
      `,
    });
  }, []);

  useEffect(() => {
    return () => {
      nearData.dispose();
      farData.dispose();
      starMaterial.dispose();
    };
  }, [nearData, farData, starMaterial]);

  useImperativeHandle(
    ref,
    () => ({
      update: (sp: number, t: number, rm: boolean) => {
        if (nearGroupRef.current) nearGroupRef.current.position.y = sp * 1.6;
        if (farGroupRef.current) farGroupRef.current.position.y = sp * 0.8;
        starMaterial.uniforms.uTime.value = rm ? 0 : t;
      },
    }),
    [starMaterial]
  );

  // Initial props update
  starMaterial.uniforms.uTime.value = reducedMotion ? 0 : time;
  const initialNearY = -scrollPos * 1.6;
  const initialFarY = -scrollPos * 0.8;

  return (
    <group>
      <points ref={nearGroupRef} geometry={nearData} material={starMaterial} position={[0, initialNearY, 0]} />
      <points ref={farGroupRef} geometry={farData} material={starMaterial} position={[0, initialFarY, 0]} />
    </group>
  );
});

// ---------------------------------------------------------------------------
// 2. ORBIT ARC (network)
// ---------------------------------------------------------------------------

/** Angular length of the visible arc, behind the satellite. */
const ARC_SPAN = 1.25;

export interface OrbitArcHandle {
  /**
   * Places the unit arc: its circle's centre, an orientation whose local z faces the camera and
   * whose local x points at the satellite (the arc's head), and the circle's radius.
   */
  update: (
    opacity: number,
    drawProgress: number,
    centre: THREE.Vector3,
    orientation: THREE.Quaternion,
    radius: number
  ) => void;
}

export const OrbitArc = forwardRef<OrbitArcHandle>(function OrbitArc(_props, ref) {
  const groupRef = useRef<THREE.Group>(null);

  // Unit circle arc from angle -ARC_SPAN (tail, uv.x = 0) to 0 (head, uv.x = 1).
  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = -ARC_SPAN + (i / 64) * ARC_SPAN;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, []);
  const coreGeo = useMemo(() => new THREE.TubeGeometry(curve, 128, 0.0016, 8, false), [curve]);
  const glowGeo = useMemo(() => new THREE.TubeGeometry(curve, 128, 0.007, 8, false), [curve]);

  const makeMat = (core: boolean): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uDrawProgress: { value: 1.0 },
        uOpacity: { value: 1.0 },
        uColor: { value: ACCENT.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: core
        ? /* glsl */ `
        uniform float uDrawProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          if (vUv.x < 1.0 - uDrawProgress) discard;
          float tail = smoothstep(0.0, 0.8, vUv.x);
          vec3 col = mix(uColor, vec3(1.0), smoothstep(0.85, 1.0, vUv.x) * 0.6);
          gl_FragColor = vec4(col, tail * uOpacity);
          #include <colorspace_fragment>
        }
      `
        : /* glsl */ `
        uniform float uDrawProgress;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          if (vUv.x < 1.0 - uDrawProgress) discard;
          float tail = smoothstep(0.0, 0.9, vUv.x);
          gl_FragColor = vec4(uColor, tail * uOpacity * 0.28);
          #include <colorspace_fragment>
        }
      `,
    });

  const coreMat = useMemo(() => makeMat(true), []);
  const glowMat = useMemo(() => makeMat(false), []);

  useEffect(() => {
    return () => {
      coreGeo.dispose();
      glowGeo.dispose();
      coreMat.dispose();
      glowMat.dispose();
    };
  }, [coreGeo, glowGeo, coreMat, glowMat]);

  useImperativeHandle(
    ref,
    () => ({
      update: (op, dp, centre, orientation, radius) => {
        coreMat.uniforms.uOpacity.value = op;
        coreMat.uniforms.uDrawProgress.value = dp;
        glowMat.uniforms.uOpacity.value = op;
        glowMat.uniforms.uDrawProgress.value = dp;
        const g = groupRef.current;
        if (!g) return;
        g.visible = op > 0.001;
        g.position.copy(centre);
        g.quaternion.copy(orientation);
        g.scale.set(radius, radius, radius);
      },
    }),
    [coreMat, glowMat]
  );

  return (
    <group ref={groupRef}>
      <mesh geometry={coreGeo} material={coreMat} />
      <mesh geometry={glowGeo} material={glowMat} />
    </group>
  );
});

// ---------------------------------------------------------------------------
// 3. ORBIT SHELLS (satellites)
// ---------------------------------------------------------------------------

export interface OrbitShellsHandle {
  update: (opacity: number, time: number, reducedMotion: boolean) => void;
}

export interface OrbitShellsProps {
  opacity?: number;
  time?: number;
  reducedMotion?: boolean;
}

export const OrbitShells = forwardRef<OrbitShellsHandle, OrbitShellsProps>(function OrbitShells(
  { opacity = 0.0, time = 0, reducedMotion = false },
  ref
) {
  const groupRef = useRef<THREE.Group>(null);
  const dotMeshesRef = useRef<Array<{ mesh: THREE.Mesh | null; baseAngle: number; speed: number; r: number }>>([]);

  const shells = useMemo(() => {
    return [
      { r: 1.18 * EARTH_R, baseOpacity: 0.12, speed: 0.12, dotCount: 3 },
      { r: 1.38 * EARTH_R, baseOpacity: 0.08, speed: 0.08, dotCount: 4 },
      { r: 1.62 * EARTH_R, baseOpacity: 0.05, speed: 0.05, dotCount: 3 },
    ];
  }, []);

  const materials = useMemo(() => {
    return shells.map((s) => ({
      ring: new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: s.baseOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      dot: new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: s.baseOpacity * 4.0,
        depthWrite: false,
      }),
    }));
  }, [shells]);

  useEffect(() => {
    return () => {
      materials.forEach((m) => {
        m.ring.dispose();
        m.dot.dispose();
      });
    };
  }, [materials]);

  useImperativeHandle(
    ref,
    () => ({
      update: (op: number, t: number, rm: boolean) => {
        if (!groupRef.current) return;
        groupRef.current.visible = op > 0.001;
        const scaleVal = THREE.MathUtils.lerp(0.92, 1.0, op);
        groupRef.current.scale.setScalar(scaleVal);

        shells.forEach((s, idx) => {
          materials[idx].ring.opacity = s.baseOpacity * op;
          materials[idx].dot.opacity = Math.min(1.0, s.baseOpacity * op * 4.5);
        });

        dotMeshesRef.current.forEach(({ mesh, baseAngle, speed, r }) => {
          if (!mesh) return;
          const angle = rm ? baseAngle : baseAngle + t * speed;
          mesh.position.set(r * Math.cos(angle), r * Math.sin(angle), 0.01);
        });
      },
    }),
    [materials, shells]
  );

  const scale = THREE.MathUtils.lerp(0.92, 1.0, opacity);
  let dotCounter = 0;

  return (
    <group ref={groupRef} scale={scale} visible={opacity > 0.001}>
      {shells.map((s, idx) => {
        const delta = 0.004 * EARTH_R;
        return (
          <group key={idx}>
            <mesh>
              <ringGeometry args={[s.r - delta, s.r + delta, 96]} />
              <primitive object={materials[idx].ring} attach="material" />
            </mesh>

            {Array.from({ length: s.dotCount }).map((_, dotIdx) => {
              const baseAngle = (dotIdx * 2 * Math.PI) / s.dotCount + idx * 1.1;
              const angle = reducedMotion ? baseAngle : baseAngle + time * s.speed;
              const x = s.r * Math.cos(angle);
              const y = s.r * Math.sin(angle);
              const curIndex = dotCounter++;

              return (
                <mesh
                  key={dotIdx}
                  position={[x, y, 0.01]}
                  ref={(el) => {
                    dotMeshesRef.current[curIndex] = {
                      mesh: el,
                      baseAngle,
                      speed: s.speed,
                      r: s.r,
                    };
                  }}
                >
                  <circleGeometry args={[0.006 * EARTH_R, 16]} />
                  <primitive object={materials[idx].dot} attach="material" />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
});

// ---------------------------------------------------------------------------
// 5. FLEET ORBITS (database)
// ---------------------------------------------------------------------------

export interface FleetOrbitsHandle {
  update: (opacity: number) => THREE.Vector3 | null;
}

export interface FleetOrbitsProps {
  network: PublicNetwork | null;
  opacity?: number;
  onSS1Position?: (pos: THREE.Vector3) => void;
}

export const FleetOrbits = forwardRef<FleetOrbitsHandle, FleetOrbitsProps>(function FleetOrbits(
  { network, opacity = 0.0, onSS1Position },
  ref
) {
  const groupRef = useRef<THREE.Group>(null);
  const satMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const scratchPos = useRef(new THREE.Vector3());
  const ss1Scratch = useRef(new THREE.Vector3());

  const satRecs = useMemo(() => {
    if (!network?.satellites) return [];
    return network.satellites
      .map((sat) => {
        try {
          const rec = satellite.twoline2satrec(sat.tle_line1, sat.tle_line2);
          return { sat, rec };
        } catch {
          return null;
        }
      })
      .filter((item): item is { sat: PublicSatellite; rec: satellite.SatRec } => item !== null);
  }, [network?.satellites]);

  const orbitGeometries = useMemo(() => {
    if (!satRecs.length) return [];
    const now = Date.now();
    const periodMs = 95 * 60 * 1000;
    const samples = 96;

    return satRecs.map(({ rec }) => {
      const pts: THREE.Vector3[] = [];
      const scratch = new THREE.Vector3();
      for (let i = 0; i <= samples; i++) {
        const t = now + (i / samples) * periodMs;
        const v = getSatVector3(rec, t, scratch);
        if (v) pts.push(v.clone());
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    });
  }, [satRecs]);

  const orbitMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    []
  );

  const orbitLines = useMemo(
    () => orbitGeometries.map((geo) => new THREE.Line(geo, orbitMaterial)),
    [orbitGeometries, orbitMaterial]
  );

  const satDotMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    []
  );

  const stationDotMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    []
  );

  const stationPositions = useMemo(() => {
    if (!network?.stations) return [];
    return network.stations.map((st: PublicStation) => {
      return getStationVector3(st.lat, st.lng);
    });
  }, [network?.stations]);

  useEffect(() => {
    return () => {
      orbitGeometries.forEach((g) => g.dispose());
      orbitMaterial.dispose();
      satDotMaterial.dispose();
      stationDotMaterial.dispose();
    };
  }, [orbitGeometries, orbitMaterial, satDotMaterial, stationDotMaterial]);

  useImperativeHandle(
    ref,
    () => ({
      update: (op: number) => {
        if (!groupRef.current) return null;
        groupRef.current.visible = op > 0.001 && !!network;
        orbitMaterial.opacity = 0.18 * op;
        satDotMaterial.opacity = 0.9 * op;
        stationDotMaterial.opacity = 0.8 * op;

        if (op <= 0.001 || !satRecs.length) return null;

        const now = Date.now();
        let ss1Pos: THREE.Vector3 | null = null;

        satRecs.forEach(({ sat, rec }, idx) => {
          const v = getSatVector3(rec, now, scratchPos.current);
          if (v) {
            const mesh = satMeshRefs.current[idx];
            if (mesh) mesh.position.copy(v);
            if (sat.id === "SS-1") {
              ss1Pos = ss1Scratch.current.copy(v);
            }
          }
        });

        if (ss1Pos && onSS1Position) {
          onSS1Position(ss1Pos);
        }
        return ss1Pos;
      },
    }),
    [network, satRecs, onSS1Position, orbitMaterial, satDotMaterial, stationDotMaterial]
  );

  if (!network || !satRecs.length) return null;

  return (
    <group ref={groupRef} visible={opacity > 0.001}>
      {orbitLines.map((line, idx) => (
        <primitive key={idx} object={line} />
      ))}

      {satRecs.map((item, idx) => (
        <mesh
          key={item.sat.id}
          ref={(el) => {
            satMeshRefs.current[idx] = el;
          }}
          material={satDotMaterial}
        >
          <sphereGeometry args={[0.012 * EARTH_R, 12, 12]} />
        </mesh>
      ))}

      {stationPositions.map((pos, idx) => (
        <mesh key={idx} position={pos} material={stationDotMaterial}>
          <sphereGeometry args={[0.008 * EARTH_R, 8, 8]} />
        </mesh>
      ))}
    </group>
  );
});
