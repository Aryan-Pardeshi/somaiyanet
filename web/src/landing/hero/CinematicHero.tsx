import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ScrollTrigger } from "@/lib/gsap";
import { PocketQube } from "./PocketQube";

/*
 * Scroll-scrubbed hero, one canvas, one progress value (0..1):
 *   A 0.00-0.28  textured Earth wrapped in a constellation of orbit dots
 *   B 0.28-0.46  dive: camera rushes in through warp streaks
 *   C 0.46-0.66  a SomaiyaSat PocketQube hangs above the Earth's limb
 *   D 0.66-1.00  Earth fades to black + navy glow; scene becomes white line art:
 *                three outline PocketQubes, dashed beams, wireframe horizon,
 *                and the red packet hopping cube -> cube -> KJSIT Mumbai
 */

const TEX = (n: string) => `${import.meta.env.BASE_URL}assets/textures/${n}`;
const EARTH_R = 1.6;
const SUN_DIR = new THREE.Vector3(0.55, 0.3, 0.78).normalize();

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Maps = { day: THREE.Texture; night: THREE.Texture; clouds: THREE.Texture };

function useEarthMaps(): Maps | null {
  const [maps, setMaps] = useState<Maps | null>(null);
  useEffect(() => {
    let alive = true;
    // Never hold the page behind the loader for long on a cold cache.
    const failsafe = window.setTimeout(() => document.getElementById("hero-loader")?.style.setProperty("opacity", "0"), 2500);
    const loader = new THREE.TextureLoader();
    const load = (n: string) =>
      new Promise<THREE.Texture>((res, rej) => loader.load(TEX(n), res, undefined, rej));
    Promise.all([load("earth_day.jpg"), load("earth_night.jpg"), load("earth_clouds.jpg")])
      .then(([day, night, clouds]) => {
        if (!alive) return;
        day.colorSpace = THREE.SRGBColorSpace;
        night.colorSpace = THREE.SRGBColorSpace;
        for (const t of [day, night, clouds]) t.anisotropy = 8;
        setMaps({ day, night, clouds });
      })
      .catch(() => {
        /* Missing textures: the constellation and line art still render. */
      })
      .finally(() => document.getElementById("hero-loader")?.style.setProperty("opacity", "0"));
    return () => {
      alive = false;
      window.clearTimeout(failsafe);
    };
  }, []);
  return maps;
}

/** Day/night Earth: day map lit by the sun, city lights on the night side. */
function Earth({ maps, opacity }: { maps: Maps; opacity: React.MutableRefObject<number> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          dayMap: { value: maps.day },
          nightMap: { value: maps.night },
          sunDir: { value: SUN_DIR },
          uOpacity: { value: 1 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN;
          void main() {
            vUv = uv;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D dayMap; uniform sampler2D nightMap;
          uniform vec3 sunDir; uniform float uOpacity;
          varying vec2 vUv; varying vec3 vN;
          void main() {
            float l = dot(normalize(vN), sunDir);
            vec3 day = texture2D(dayMap, vUv).rgb * (0.18 + 1.05 * max(l, 0.0));
            vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.35, 1.15, 0.9);
            vec3 c = mix(night, day, smoothstep(-0.18, 0.22, l));
            gl_FragColor = vec4(c, uOpacity);
            #include <colorspace_fragment>
          }`,
      }),
    [maps],
  );
  const cloudMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: "#ffffff",
        alphaMap: maps.clouds,
        transparent: true,
        depthWrite: false,
        opacity: 0.35,
      }),
    [maps],
  );
  useFrame(() => {
    mat.uniforms.uOpacity.value = opacity.current;
    cloudMat.opacity = 0.35 * opacity.current;
  });
  return (
    <>
      <mesh material={mat}>
        <sphereGeometry args={[EARTH_R, 96, 96]} />
      </mesh>
      <mesh material={cloudMat} scale={1.008}>
        <sphereGeometry args={[EARTH_R, 64, 64]} />
      </mesh>
    </>
  );
}

function Atmosphere({ opacity }: { opacity: React.MutableRefObject<number> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: { c: { value: new THREE.Color("#6fa0ff") }, o: { value: 1 } },
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `uniform vec3 c; uniform float o; varying vec3 vN; void main(){ float f = pow(0.74 - dot(vN, vec3(0.0,0.0,1.0)), 4.0); gl_FragColor = vec4(c, clamp(f,0.0,1.0) * 0.55 * o); }`,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.o.value = opacity.current;
  });
  return (
    <mesh material={mat} scale={1.1}>
      <sphereGeometry args={[EARTH_R, 64, 64]} />
    </mesh>
  );
}

/** Many thin orbital shells of glowing dots, like a mega-constellation map. */
function useConstellation(mobile: boolean) {
  return useMemo(() => {
    const planes = mobile ? 16 : 30;
    const perPlane = mobile ? 90 : 150;
    const pos = new Float32Array(planes * perPlane * 3);
    let k = 0;
    for (let p = 0; p < planes; p++) {
      const inc = THREE.MathUtils.degToRad(p % 3 === 0 ? 97.5 : 53 + (p % 5) * 6);
      const raan = (p / planes) * Math.PI * 2;
      const r = EARTH_R * (1.035 + (p % 4) * 0.012);
      const m = new THREE.Matrix4()
        .makeRotationY(raan)
        .multiply(new THREE.Matrix4().makeRotationX(inc));
      const phase = Math.random() * Math.PI * 2;
      for (let i = 0; i < perPlane; i++) {
        const a = phase + (i / perPlane) * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r).applyMatrix4(m);
        pos[k++] = v.x;
        pos[k++] = v.y;
        pos[k++] = v.z;
      }
    }
    return pos;
  }, [mobile]);
}

/** Two SomaiyaNet planes (97.5 deg, RAAN 75/105) with 4 bright sats each. */
function OurPlanes({ opacity }: { opacity: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const bases = useMemo(
    () =>
      [75, 105].map((raan) =>
        new THREE.Matrix4()
          .makeRotationY(THREE.MathUtils.degToRad(raan))
          .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(97.5))),
      ),
    [],
  );
  const rings = useMemo(
    () =>
      bases.map((m) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 256; i++) {
          const a = (i / 256) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(EARTH_R * 1.12).applyMatrix4(m));
        }
        return new THREE.BufferGeometry().setFromPoints(pts);
      }),
    [bases],
  );
  const ringMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#a9caff", transparent: true, opacity: 0.35 }),
    [],
  );
  const satMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.08;
    ringMat.opacity = 0.35 * opacity.current;
    satMat.opacity = opacity.current;
    group.current?.children.forEach((c, i) => {
      const m = bases[i < 4 ? 0 : 1];
      const a = t + (i % 4) * THREE.MathUtils.degToRad(12) + (i < 4 ? 0 : 0.4);
      c.position.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(EARTH_R * 1.12).applyMatrix4(m);
    });
  });
  return (
    <>
      {rings.map((g, i) => (
        <lineLoop key={i} geometry={g} material={ringMat} />
      ))}
      <group ref={group}>
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={i} material={satMat}>
            <sphereGeometry args={[0.022, 10, 10]} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Warp streaks: line segments stretched along the view axis, recycled. */
function Warp({ amount, mobile }: { amount: React.MutableRefObject<number>; mobile: boolean }) {
  const n = mobile ? 260 : 520;
  const { geo, seeds } = useMemo(() => {
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const seeds = new Float32Array(n * 3);
    const palette = [
      [0.45, 0.62, 1],
      [0.85, 0.9, 1],
      [1, 0.35, 0.4],
    ];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.25 + Math.random() * 2.4;
      seeds[i * 3] = Math.cos(ang) * rad;
      seeds[i * 3 + 1] = Math.sin(ang) * rad;
      seeds[i * 3 + 2] = Math.random() * 12;
      const c = palette[i % 9 === 0 ? 2 : i % 2];
      for (let e = 0; e < 2; e++) {
        col[i * 6 + e * 3] = c[0] * (e ? 0.15 : 1);
        col[i * 6 + e * 3 + 1] = c[1] * (e ? 0.15 : 1);
        col[i * 6 + e * 3 + 2] = c[2] * (e ? 0.15 : 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return { geo, seeds };
  }, [n]);
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const lines = useRef<THREE.LineSegments>(null);
  const { camera } = useThree();
  useFrame((_, dt) => {
    const a = amount.current;
    mat.opacity = a;
    if (!lines.current) return;
    lines.current.visible = a > 0.01;
    if (a <= 0.01) return;
    const pos = geo.attributes.position.array as Float32Array;
    const speed = 9 * dt;
    for (let i = 0; i < n; i++) {
      seeds[i * 3 + 2] -= speed;
      if (seeds[i * 3 + 2] < 0.2) seeds[i * 3 + 2] += 12;
      const z = seeds[i * 3 + 2];
      const len = 0.6 + a * 1.6;
      pos[i * 6] = seeds[i * 3];
      pos[i * 6 + 1] = seeds[i * 3 + 1];
      pos[i * 6 + 2] = -z;
      pos[i * 6 + 3] = seeds[i * 3];
      pos[i * 6 + 4] = seeds[i * 3 + 1];
      pos[i * 6 + 5] = -z - len;
    }
    geo.attributes.position.needsUpdate = true;
    lines.current.position.copy(camera.position);
    lines.current.quaternion.copy(camera.quaternion);
  });
  return <lineSegments ref={lines} geometry={geo} material={mat} visible={false} frustumCulled={false} />;
}

function DashedLine({ points, opacity = 0.8, dash = 0.05 }: { points: THREE.Vector3[]; opacity?: number; dash?: number }) {
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = new THREE.LineDashedMaterial({ color: "#ffffff", transparent: true, opacity, dashSize: dash, gapSize: dash * 0.8 });
    const l = new THREE.Line(g, m);
    l.computeLineDistances();
    l.userData.baseOpacity = opacity;
    return l;
  }, [points, opacity, dash]);
  return <primitive object={obj} />;
}

function SolidLine({ points, opacity = 0.8 }: { points: THREE.Vector3[]; opacity?: number }) {
  const obj = useMemo(() => {
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity }),
    );
    l.userData.baseOpacity = opacity;
    return l;
  }, [points, opacity]);
  return <primitive object={obj} />;
}

/** Stage D: white line-art scene in its own coordinate frame. */
function LineArtScene({ reveal }: { reveal: React.MutableRefObject<number> }) {
  const root = useRef<THREE.Group>(null);
  const pkt = useRef<THREE.Mesh>(null);
  const cubes = useMemo(
    () => [new THREE.Vector3(-2.3, 1.05, 0), new THREE.Vector3(0, 1.75, -0.4), new THREE.Vector3(2.3, 1.05, 0)],
    [],
  );
  // horizon: arcs of a huge sphere seen edge-on, plus meridians
  const horizon = useMemo(() => {
    const R = 14;
    const cy = -R - 0.9;
    const arcs: THREE.Vector3[][] = [];
    for (let i = 0; i < 5; i++) {
      const pts: THREE.Vector3[] = [];
      const depth = i * 0.9;
      const r = Math.sqrt(R * R - depth * depth);
      for (let x = -7; x <= 7; x += 0.25) {
        const y = cy + Math.sqrt(Math.max(r * r - x * x, 0));
        pts.push(new THREE.Vector3(x, y, -depth));
      }
      arcs.push(pts);
    }
    const mers: THREE.Vector3[][] = [];
    for (const x0 of [-3.2, 0, 3.2]) {
      const pts: THREE.Vector3[] = [];
      for (let d = 0; d <= 4; d += 0.2) {
        const x = x0 * (1 - d / 12);
        const r = Math.sqrt(R * R - d * d);
        pts.push(new THREE.Vector3(x, cy + Math.sqrt(Math.max(r * r - x * x, 0)), -d));
      }
      mers.push(pts);
    }
    return { arcs, mers, surfaceY: (x: number) => cy + Math.sqrt(R * R - x * x) };
  }, []);
  // dashed beams fanning down from each cube to the horizon
  const beams = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    cubes.forEach((c) => {
      for (const dx of [-1.1, -0.45, 0.2, 0.85]) {
        const x = c.x + dx;
        out.push([c.clone().add(new THREE.Vector3(0, -0.15, 0)), new THREE.Vector3(x, horizon.surfaceY(x) + 0.02, -0.6)]);
      }
    });
    return out;
  }, [cubes, horizon]);
  const station = useMemo(() => new THREE.Vector3(0.75, horizon.surfaceY(0.75) + 0.02, -0.6), [horizon]);
  const route = useMemo(() => [cubes[0], cubes[1], cubes[2], station], [cubes, station]);
  const isl = useMemo(
    () => [
      [cubes[0], cubes[1]],
      [cubes[1], cubes[2]],
    ],
    [cubes],
  );

  useFrame((state) => {
    const k = reveal.current;
    if (!root.current) return;
    root.current.visible = k > 0.01;
    root.current.traverse((o) => {
      const m = (o as THREE.Line).material as THREE.Material & { opacity?: number };
      if (!m || m.opacity === undefined || o === pkt.current) return;
      const base = (o.userData.baseOpacity as number | undefined) ?? 0.9;
      m.transparent = true;
      m.opacity = base * k;
    });
    if (pkt.current) {
      const loop = (state.clock.elapsedTime * 0.22) % 1;
      const seg = Math.min(route.length - 2, Math.floor(loop * (route.length - 1)));
      const f = loop * (route.length - 1) - seg;
      pkt.current.position.lerpVectors(route[seg], route[seg + 1], f);
      (pkt.current.material as THREE.MeshBasicMaterial).opacity = k;
    }
  });

  return (
    <group ref={root} visible={false}>
      {cubes.map((c, i) => (
        <group key={i} position={c} rotation={[0.25, i === 1 ? 0 : i === 0 ? 0.5 : -0.5, 0]}>
          <PocketQube lineArt scale={0.55} />
        </group>
      ))}
      {beams.map((b, i) => (
        <DashedLine key={`b${i}`} points={b} opacity={0.55} dash={0.07} />
      ))}
      {isl.map((b, i) => (
        <DashedLine key={`i${i}`} points={b} opacity={0.9} dash={0.1} />
      ))}
      {horizon.arcs.map((p, i) => (
        <SolidLine key={`a${i}`} points={p} opacity={i === 0 ? 0.9 : 0.45 - i * 0.06} />
      ))}
      {horizon.mers.map((p, i) => (
        <SolidLine key={`m${i}`} points={p} opacity={0.4} />
      ))}
      <mesh position={station}>
        <boxGeometry args={[0.07, 0.07, 0.07]} />
        <meshBasicMaterial color="#ffffff" transparent />
      </mesh>
      <mesh ref={pkt}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color="#ff3b4f" transparent />
      </mesh>
    </group>
  );
}

function Scene({ progress, mobile }: { progress: React.MutableRefObject<number>; mobile: boolean }) {
  const maps = useEarthMaps();
  const { camera } = useThree();
  const earth = useRef<THREE.Group>(null);
  const sat = useRef<THREE.Group>(null);
  const earthOpacity = useRef(1);
  const constOpacity = useRef(1);
  const warpAmount = useRef(0);
  const lineReveal = useRef(0);
  const constellation = useConstellation(mobile);
  const constMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#dbe7ff",
        size: mobile ? 0.04 : 0.032,
        sizeAttenuation: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [mobile],
  );
  const stars = useMemo(() => {
    const n = mobile ? 700 : 1600;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40);
      a.set([v.x, v.y, v.z], i * 3);
    }
    return a;
  }, [mobile]);
  const lineArtCam = useMemo(() => new THREE.Vector3(0, 0.55, 6.4), []);
  const lookTmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const p = progress.current;
    // camera path
    const a = smooth(0, 0.28, p);
    const b = smooth(0.28, 0.46, p);
    const c = smooth(0.46, 0.66, p);
    const d = smooth(0.66, 0.86, p);
    const pos = new THREE.Vector3(lerp(0.9, 0.55, a), lerp(0.35, 0.15, a), lerp(5.6, 4.6, a));
    pos.z = lerp(pos.z, 2.35, b);
    pos.y = lerp(pos.y, 0.35, b);
    pos.x = lerp(pos.x, 0.0, b);
    camera.position.copy(pos).lerp(lineArtCam, d);
    lookTmp.set(lerp(0.9, 0, a), lerp(0, 0.45, c), 0).lerp(new THREE.Vector3(0, 0.6, 0), d);
    camera.lookAt(lookTmp);

    // earth: rotate, sink to a limb in stage C, fade in stage D
    if (earth.current) {
      earth.current.rotation.y += dt * 0.025;
      earth.current.position.y = lerp(0, -1.75, c);
    }
    earthOpacity.current = 1 - smooth(0.68, 0.82, p);
    constOpacity.current = (1 - smooth(0.3, 0.44, p)) * 0.95;
    constMat.opacity = constOpacity.current;
    warpAmount.current = smooth(0.29, 0.36, p) * (1 - smooth(0.42, 0.5, p));
    lineReveal.current = smooth(0.74, 0.9, p);

    if (sat.current) {
      const show = smooth(0.44, 0.52, p) * (1 - smooth(0.66, 0.74, p));
      sat.current.visible = show > 0.01;
      sat.current.position.set(0.25, lerp(0.3, 0.38, c), 1.0);
      const tt = performance.now() / 1000;
      sat.current.rotation.set(0.32, 0.45 + Math.sin(tt * 0.35) * 0.35, 0.12);
      sat.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const list = Array.isArray(m) ? m : m ? [m] : [];
        list.forEach((mm) => {
          mm.transparent = true;
          mm.opacity = show;
        });
      });
    }
    const glow = document.getElementById("hero-navy-glow");
    if (glow) glow.style.opacity = String(smooth(0.66, 0.84, p));
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(10)} intensity={2.2} />
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#8fa3cc" size={0.08} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
      </points>
      <group ref={earth}>
        {maps && <Earth maps={maps} opacity={earthOpacity} />}
        <Atmosphere opacity={earthOpacity} />
        <points material={constMat}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[constellation, 3]} />
          </bufferGeometry>
        </points>
        <OurPlanes opacity={constOpacity} />
      </group>
      <Warp amount={warpAmount} mobile={mobile} />
      <group ref={sat} visible={false}>
        <PocketQube scale={0.27} />
      </group>
      <LineArtScene reveal={lineReveal} />
    </>
  );
}

export function CinematicHero() {
  const outer = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  useEffect(() => {
    if (reduced) {
      progress.current = 1;
      return;
    }
    const st = ScrollTrigger.create({
      trigger: outer.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        progress.current = self.progress;
      },
    });
    return () => st.kill();
  }, [reduced]);

  return (
    <section ref={outer} id="hero" style={{ height: reduced ? "100vh" : "420vh", background: "#000" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* navy glow sits BEHIND the transparent canvas */}
        <div
          id="hero-navy-glow"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 90% 70% at 50% -10%, #0b1f6b 0%, #050b26 45%, #000 80%)",
            opacity: reduced ? 1 : 0,
          }}
        />
        <Canvas
          className="!absolute inset-0"
          dpr={mobile ? [1, 1.5] : [1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [0.9, 0.35, 5.6], fov: 45, near: 0.05, far: 200 }}
        >
          <Scene progress={progress} mobile={mobile} />
        </Canvas>
        <div
          id="hero-loader"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black transition-opacity duration-700"
        >
          <div className="h-px w-40 animate-pulse bg-white/60" />
        </div>
        <div className="pointer-events-none absolute bottom-10 left-6 z-10 max-w-[760px] md:bottom-14 md:left-12">
          <h1
            className="text-white"
            style={{ fontSize: "clamp(52px, 7vw, 112px)", lineHeight: 0.98, letterSpacing: "-0.035em", fontWeight: 300 }}
          >
            Satellites that
            <br />
            route themselves.
          </h1>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-[#9aa3b8]">
            SomaiyaNet is a PocketQube constellation whose routing, AI decisions and permissions all live in
            PostgreSQL. Built around use case KJS-SRS-01.
          </p>
        </div>
      </div>
    </section>
  );
}
