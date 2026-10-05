import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ScrollTrigger } from "@/lib/gsap";
import { Satellite } from "./Satellite";

/*
 * Scroll-scrubbed hero:
 *   - FrameScrub: full-bleed canvas scrubbing 144 Earth/satellite frames over progress 0..0.72
 *   - Video canvas fades out over 0.72..0.82
 *   - Headline + paragraph and dark gradient fade out over 0.55..0.7
 *   - Small Mumbai caption fades in 0.6..0.72 and fades out with video (0.72..0.82)
 *   - Navy glow + line-art finale (LineArtScene) fades in over 0.74..0.9
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

/** Textures hook kept for external consumers (e.g. Mission.tsx). */
export function useEarthMaps(): Maps | null {
  const [maps, setMaps] = useState<Maps | null>(null);
  useEffect(() => {
    let alive = true;
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
        /* Missing textures handled gracefully */
      });
    return () => {
      alive = false;
    };
  }, []);
  return maps;
}

/** Day/night Earth: exported for Mission.tsx. */
export function Earth({ maps, opacity }: { maps: Maps; opacity: { current: number } }) {
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

/** Atmosphere glow: exported for Mission.tsx. */
export function Atmosphere({ opacity }: { opacity: { current: number } }) {
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

/** Line-art finale: three line-art satellites, dashed beams, wireframe horizon, red packet route to KJSIT Mumbai. */
function LineArtScene({ reveal }: { reveal: { current: number } }) {
  const root = useRef<THREE.Group>(null);
  const pkt = useRef<THREE.Mesh>(null);
  const cubes = useMemo(
    () => [new THREE.Vector3(-2.75, 1.0, 0), new THREE.Vector3(0, 1.8, -0.4), new THREE.Vector3(2.75, 1.0, 0)],
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
        out.push([c.clone().add(new THREE.Vector3(0, -0.3, 0)), new THREE.Vector3(x, horizon.surfaceY(x) + 0.02, -0.6)]);
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
      if (m.userData.base === undefined) m.userData.base = (o.userData.baseOpacity as number | undefined) ?? m.opacity;
      m.transparent = true;
      m.opacity = (m.userData.base as number) * k;
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
        <group key={i} position={c} rotation={[0.12, i === 1 ? 0 : i === 0 ? 0.35 : -0.35, i === 1 ? 0 : i === 0 ? 0.08 : -0.08]}>
          <Satellite lineArt scale={0.3} />
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

/** Scene containing only the line-art finale. */
function Scene({ progress, glowRef }: { progress: { current: number }; glowRef: React.RefObject<HTMLDivElement | null> }) {
  const { camera } = useThree();
  const lineReveal = useRef(0);
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0.6, 0), []);

  useFrame(() => {
    const p = progress.current;
    camera.position.set(0, 0.55, 6.4);
    camera.lookAt(lookTarget);

    const revealVal = smooth(0.74, 0.9, p);
    lineReveal.current = revealVal;

    if (glowRef.current) {
      glowRef.current.style.opacity = String(revealVal);
    }
  });

  return <LineArtScene reveal={lineReveal} />;
}

const getFrameUrl = (frameNum: number, isMobile: boolean) => {
  const prefix = isMobile ? "m" : "f";
  return `${import.meta.env.BASE_URL}assets/hero/${prefix}_${String(frameNum).padStart(3, "0")}.webp`;
};

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih || !cw || !ch) return;

  const canvasAspect = cw / ch;
  const imgAspect = iw / ih;

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (canvasAspect > imgAspect) {
    sh = iw / canvasAspect;
    sy = (ih - sh) / 2;
  } else {
    sw = ih * canvasAspect;
    sx = (iw - sw) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

function loadHeroImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
    if ("decode" in img && typeof img.decode === "function") {
      img.decode()
        .then(() => resolve(img))
        .catch(() => {
          if (img.complete && img.naturalWidth > 0) {
            resolve(img);
          }
        });
    }
  });
}

/** Full-bleed video frame canvas with Apple-style scroll-scrubbing. */
function FrameScrub({
  progress,
  mobile,
  reduced,
}: {
  progress: { current: number };
  mobile: boolean;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let cancelled = false;
    let lastDrawnIndex = -1;
    let lastOpacity = -1;

    const dismissLoader = () => {
      document.getElementById("hero-loader")?.style.setProperty("opacity", "0");
    };

    const resize = (imgToRedraw?: HTMLImageElement | null) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (imgToRedraw) {
        drawImageCover(ctx, imgToRedraw, canvas.width, canvas.height);
      }
    };

    resize();

    // Failsafe timer (2.5s)
    const failsafe = window.setTimeout(dismissLoader, 2500);

    if (reduced) {
      let staticImg: HTMLImageElement | null = null;
      canvas.style.opacity = "1";

      const onResize = () => resize(staticImg);
      window.addEventListener("resize", onResize, { passive: true });

      loadHeroImage(getFrameUrl(144, mobile))
        .then((img) => {
          if (cancelled) return;
          staticImg = img;
          resize(img);
          dismissLoader();
        })
        .catch(() => {
          dismissLoader();
        });

      return () => {
        cancelled = true;
        window.clearTimeout(failsafe);
        window.removeEventListener("resize", onResize);
      };
    }

    const images: (HTMLImageElement | null)[] = new Array(144).fill(null);

    const drawFrameByIndex = (idx: number) => {
      const img = images[idx];
      if (!img) return;
      drawImageCover(ctx, img, canvas.width, canvas.height);
      lastDrawnIndex = idx;
    };

    const onResize = () => {
      resize(lastDrawnIndex >= 0 ? images[lastDrawnIndex] : null);
    };
    window.addEventListener("resize", onResize, { passive: true });

    // Preload frame 1 first and draw it immediately
    loadHeroImage(getFrameUrl(1, mobile))
      .then((firstImg) => {
        if (cancelled) return;
        images[0] = firstImg;
        drawFrameByIndex(0);
        dismissLoader();

        // Load the rest in order with new Image() + decode()
        (async () => {
          for (let i = 1; i < 144; i++) {
            if (cancelled) break;
            try {
              const nextImg = await loadHeroImage(getFrameUrl(i + 1, mobile));
              if (cancelled) break;
              images[i] = nextImg;
            } catch {
              // Ignore failure for individual frame
            }
          }
        })();
      })
      .catch(() => {
        dismissLoader();
      });

    let rafId = 0;
    const tick = () => {
      const p = progress.current;

      // Video canvas fades out over progress 0.72 -> 0.82
      const op = 1 - smooth(0.72, 0.82, p);
      if (Math.abs(op - lastOpacity) > 0.001) {
        canvas.style.opacity = String(op);
        lastOpacity = op;
      }

      if (op > 0.001) {
        // Frame index = Math.round(lerp(0, 143, smooth(0, 0.72, progress)))
        const targetIdx = Math.round(lerp(0, 143, smooth(0, 0.72, p)));

        // If the wanted frame is not loaded yet, draw the nearest loaded frame below it
        let bestIdx = targetIdx;
        while (bestIdx > 0 && !images[bestIdx]) {
          bestIdx--;
        }

        if (images[bestIdx] && bestIdx !== lastDrawnIndex) {
          drawFrameByIndex(bestIdx);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [mobile, reduced, progress]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 1 }}
    />
  );
}

export function CinematicHero() {
  const outer = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  useEffect(() => {
    if (reduced) {
      progress.current = 0;
      return;
    }

    const updateOverlays = (p: number) => {
      const headOp = 1 - smooth(0.55, 0.7, p);
      if (headlineRef.current) headlineRef.current.style.opacity = String(headOp);
      if (gradientRef.current) gradientRef.current.style.opacity = String(headOp);

      const capOp = p < 0.72 ? smooth(0.6, 0.72, p) : 1 - smooth(0.72, 0.82, p);
      if (captionRef.current) captionRef.current.style.opacity = String(capOp);

      const glowOp = smooth(0.74, 0.9, p);
      if (glowRef.current) glowRef.current.style.opacity = String(glowOp);
    };

    const st = ScrollTrigger.create({
      trigger: outer.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        progress.current = self.progress;
        updateOverlays(self.progress);
      },
    });

    progress.current = st.progress;
    updateOverlays(st.progress);

    return () => st.kill();
  }, [reduced]);

  return (
    <section ref={outer} id="hero" style={{ height: reduced ? "100vh" : "420vh", background: "#000" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Navy glow sits BEHIND the transparent canvas and frame canvas */}
        <div
          ref={glowRef}
          id="hero-navy-glow"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 90% 70% at 50% -10%, #0b1f6b 0%, #050b26 45%, #000 80%)",
            opacity: 0,
          }}
        />

        {/* Video frame scrub canvas */}
        <FrameScrub progress={progress} mobile={mobile} reduced={reduced} />

        {/* Dark gradient behind headline */}
        <div
          ref={gradientRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(to top right, rgba(0,0,0,0.75), transparent 55%)",
            opacity: 1,
          }}
        />

        {/* Line-art finale: transparent R3F Canvas layered ABOVE frame canvas */}
        {!reduced && (
          <Canvas
            className="!absolute inset-0 pointer-events-none"
            dpr={mobile ? [1, 1.5] : [1, 2]}
            gl={{ antialias: true, alpha: true }}
            camera={{ position: [0, 0.55, 6.4], fov: 45, near: 0.05, far: 200 }}
            aria-label="Interactive 3D simulation of SomaiyaNet PocketQube constellation"
          >
            <Scene progress={progress} glowRef={glowRef} />
          </Canvas>
        )}

        {/* Hero loader */}
        <div
          id="hero-loader"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black transition-opacity duration-700"
        >
          <div className="h-px w-40 animate-pulse bg-white/60" />
        </div>

        {/* Headline + paragraph overlay */}
        <div
          ref={headlineRef}
          className="pointer-events-none absolute bottom-10 left-6 z-10 max-w-[760px] md:bottom-14 md:left-12"
          style={{ opacity: 1 }}
        >
          <h1
            className="break-words text-white"
            style={{ fontSize: "clamp(40px, 7vw, 112px)", lineHeight: 0.98, letterSpacing: "-0.035em", fontWeight: 300 }}
          >
            Satellites that
            <br />
            route themselves.
          </h1>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-[#9aa3b8]">
            SomaiyaNet is a four-satellite PocketQube constellation (three flying, one waiting in its deployer) whose routing graphs, decision trees, and access permissions all live in PostgreSQL. Developed under specification KJS-SRS-01.
          </p>
        </div>

        {/* Small caption over Mumbai */}
        <div
          ref={captionRef}
          className="pointer-events-none absolute bottom-20 right-6 z-10 max-w-[340px] text-right md:bottom-24 md:right-12"
          style={{
            fontSize: "13px",
            color: "#dfe6f5",
            opacity: 0,
          }}
        >
          Over Mumbai, where KJSIT's ground station listens.
        </div>
      </div>
    </section>
  );
}
