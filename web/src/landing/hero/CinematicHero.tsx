import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ScrollTrigger } from "@/lib/gsap";
import { Satellite } from "./Satellite";
import { RouteDiagram } from "./RouteDiagram";
import { CursorReadout } from "./CursorReadout";

/*
 * Scroll-scrubbed hero, one canvas, one progress value (0..1):
 *   A 0.00-0.28  textured Earth wrapped in a constellation of orbit dots
 *   B 0.28-0.46  dive: camera rushes in through warp streaks
 *   C 0.46-0.66  a SomaiyaSat PocketQube hangs above the Earth's limb
 *   D 0.66-1.00  Earth fades to black + navy glow; RouteDiagram overlay:
 *                four lanes, contact windows, and PKT#0412 routed via
 *                PostgreSQL cgr_routes() to KJSIT Mumbai
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

export function useEarthMaps(): Maps | null {
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
export function Earth({ maps, opacity }: { maps: Maps; opacity: React.MutableRefObject<number> }) {
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

export function Atmosphere({ opacity }: { opacity: React.MutableRefObject<number> }) {
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

/** One SomaiyaNet plane (inc 97.5 deg, RAAN 75 deg) with 3 bright flying sats spaced 12 deg apart. */
function OurPlanes({ opacity }: { opacity: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const base = useMemo(
    () =>
      new THREE.Matrix4()
        .makeRotationY(THREE.MathUtils.degToRad(75))
        .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(97.5))),
    [],
  );
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
          .multiplyScalar(EARTH_R * 1.12)
          .applyMatrix4(base),
      );
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [base]);
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
      const a = t + i * THREE.MathUtils.degToRad(12);
      c.position.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(EARTH_R * 1.12).applyMatrix4(base);
    });
  });
  return (
    <>
      <lineLoop geometry={ring} material={ringMat} />
      <group ref={group}>
        {Array.from({ length: 3 }).map((_, i) => (
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

function Scene({
  progress,
  mobile,
  glowRef,
  headlineRef,
}: {
  progress: React.MutableRefObject<number>;
  mobile: boolean;
  glowRef: React.RefObject<HTMLDivElement | null>;
  headlineRef: React.RefObject<HTMLDivElement | null>;
}) {
  const maps = useEarthMaps();
  const { camera, gl, scene } = useThree();
  // studio reflections for the metal and cover-glass of the satellite
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
  const earth = useRef<THREE.Group>(null);
  const sat = useRef<THREE.Group>(null);
  const earthOpacity = useRef(1);
  const constOpacity = useRef(1);
  const warpAmount = useRef(0);
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
    warpAmount.current = smooth(0.29, 0.36, p) * (1 - smooth(0.42, 0.5, p));

    if (sat.current) {
      const show = smooth(0.44, 0.52, p) * (1 - smooth(0.66, 0.74, p));
      sat.current.visible = show > 0.01;
      sat.current.position.set(0.28, lerp(0.36, 0.44, c), 0.85);
      const tt = performance.now() / 1000;
      sat.current.rotation.set(0.18, -0.5 + Math.sin(tt * 0.3) * 0.3, 0.32);
      sat.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const list = Array.isArray(m) ? m : m ? [m] : [];
        list.forEach((mm) => {
          mm.transparent = true;
          mm.opacity = show;
        });
      });
    }
    if (glowRef.current) {
      glowRef.current.style.opacity = String(smooth(0.66, 0.84, p));
    }
    if (headlineRef.current) {
      headlineRef.current.style.opacity = String(1 - smooth(0.6, 0.68, p));
    }
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
        <OurPlanes opacity={constOpacity} />
      </group>
      <Warp amount={warpAmount} mobile={mobile} />
      <group ref={sat} visible={false}>
        <Satellite scale={0.2} />
      </group>
    </>
  );
}

export function CinematicHero() {
  const outer = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  useEffect(() => {
    if (reduced) {
      progress.current = 1;
      if (headlineRef.current) {
        headlineRef.current.style.opacity = "0";
      }
      return;
    }
    const st = ScrollTrigger.create({
      trigger: outer.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        progress.current = self.progress;
        if (headlineRef.current) {
          headlineRef.current.style.opacity = String(1 - smooth(0.6, 0.68, self.progress));
        }
      },
    });
    return () => st.kill();
  }, [reduced]);

  return (
    <section ref={outer} id="hero" style={{ height: reduced ? "100vh" : "420vh", background: "#000" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* neutral background behind the transparent canvas */}
        <div
          ref={glowRef}
          id="hero-navy-glow"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{
            opacity: reduced ? 1 : 0,
          }}
        />
        <Canvas
          className="!absolute inset-0"
          dpr={mobile ? [1, 1.5] : [1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [0.9, 0.35, 5.6], fov: 45, near: 0.05, far: 200 }}
          aria-label="Interactive 3D simulation of SomaiyaNet PocketQube constellation and orbital passes around Earth"
        >
          <Scene progress={progress} mobile={mobile} glowRef={glowRef} headlineRef={headlineRef} />
        </Canvas>
        <RouteDiagram progress={progress} reduced={reduced} mobile={mobile} />
        <div
          id="hero-loader"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black transition-opacity duration-700"
        >
          <div className="h-px w-40 bg-white/60" />
        </div>
        <div
          ref={headlineRef}
          className="pointer-events-none absolute bottom-10 left-6 z-10 max-w-[min(92vw,1100px)] md:bottom-14 md:left-12"
          style={{ opacity: reduced ? 0 : 1 }}
        >
          <h1 className="sx-display">
            <span className="block md:whitespace-nowrap">Satellites that</span>
            <span className="block md:whitespace-nowrap">route themselves.</span>
          </h1>
          <p className="sx-lead mt-5">
            SomaiyaNet is a four-satellite PocketQube constellation (three flying, one waiting in its deployer) whose routing graphs, decision trees, and access permissions all live in PostgreSQL. Developed under specification KJS-SRS-01.
          </p>
          <Link to="/console" className="sx-btn mt-8 pointer-events-auto">
            Take the console
          </Link>
        </div>
      </div>
      <CursorReadout targetRef={outer} />
    </section>
  );
}
