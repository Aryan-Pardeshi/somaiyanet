import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const TEX = (n: string) => `${import.meta.env.BASE_URL}assets/textures/${n}`;
export const EARTH_R = 1.6;
/** Sun from the upper left, slightly in front: the day side faces the text, city lights show on the right limb. */
export const SUN_DIR = new THREE.Vector3(-0.5, 0.38, 0.78).normalize();

export type Maps = { day: THREE.Texture; night: THREE.Texture; clouds: THREE.Texture };

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
        /* Missing textures */
      });
    return () => {
      alive = false;
    };
  }, []);
  return maps;
}

const defaultOpacity = { current: 1 };

/** Day/night Earth: day map lit by the sun, city lights on the night side. */
export function Earth({
  maps,
  opacity = defaultOpacity,
}: {
  maps: Maps;
  opacity?: React.MutableRefObject<number> | { current: number };
}) {
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
          varying vec2 vUv; varying vec3 vN; varying vec3 vViewN;
          void main() {
            vUv = uv;
            vN = normalize(mat3(modelMatrix) * normal);
            vViewN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D dayMap; uniform sampler2D nightMap;
          uniform vec3 sunDir; uniform float uOpacity;
          varying vec2 vUv; varying vec3 vN; varying vec3 vViewN;
          void main() {
            float l = dot(normalize(vN), sunDir);
            vec3 day = texture2D(dayMap, vUv).rgb * (0.14 + 1.0 * max(l, 0.0));
            vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.35, 1.15, 0.9);
            vec3 c = mix(night, day, smoothstep(-0.18, 0.22, l));
            // Blue haze toward the limb on the lit side, as seen from orbit.
            float rim = pow(1.0 - max(dot(normalize(vViewN), vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
            c += vec3(0.32, 0.55, 1.0) * rim * 0.55 * smoothstep(-0.25, 0.4, l);
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

export function Atmosphere({
  opacity = defaultOpacity,
  scale = 1.06,
}: {
  opacity?: React.MutableRefObject<number> | { current: number };
  /** Outer radius of the halo, in Earth radii. */
  scale?: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          c: { value: new THREE.Color("#5f9bff") },
          o: { value: 1 },
          inner: { value: Math.sqrt(1 - 1 / (scale * scale)) },
        },
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        // Back faces: -dot runs from 0 at the halo's outer edge to "inner" at the Earth's limb.
        fragmentShader: `uniform vec3 c; uniform float o; uniform float inner; varying vec3 vN; void main(){ float f = clamp(-dot(vN, vec3(0.0,0.0,1.0)) / inner, 0.0, 1.0); gl_FragColor = vec4(c, pow(f, 2.6) * 0.75 * o); }`,
      }),
    [scale],
  );
  useFrame(() => {
    mat.uniforms.o.value = opacity.current;
  });
  return (
    <mesh material={mat} scale={scale}>
      <sphereGeometry args={[EARTH_R, 64, 64]} />
    </mesh>
  );
}
