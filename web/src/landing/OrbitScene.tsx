import { useMemo, useRef } from "react"
import type { RefObject } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

/**
 * The story's wireframe Earth: a lat/long line sphere in rule/cream-dim
 * (never points, never textured), two tilted SSO-feel orbit rings, 8 amber
 * satellite dots and one Somaiya-red packet dot riding SAT-A3.
 *
 * All motion runs in useFrame against refs — no React state per frame.
 */

const R = 1.5
const SAT_COLOR = "#ffb020"
const PACKET_COLOR = "#d7263d"
const RING_A_TILT = THREE.MathUtils.degToRad(22.5)
const RING_B_TILT = THREE.MathUtils.degToRad(-22.5)

function ringPoint(
  tilt: number,
  angle: number,
  out: THREE.Vector3
): THREE.Vector3 {
  out.set(Math.cos(angle) * R, 0, Math.sin(angle) * R)
  out.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
  return out
}

function Swarm({
  mode,
  progressRef,
}: {
  mode: "hero" | "route"
  progressRef?: RefObject<number>
}) {
  const group = useRef<THREE.Group>(null)
  const satRefs = useRef<Array<THREE.Mesh | null>>([])
  const packetRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const chords = useMemo(() => {
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    ringPoint(RING_A_TILT, 0.7, a)
    ringPoint(RING_A_TILT, 0.7 + 0.52, b)
    ringPoint(RING_B_TILT, 2.1, c)
    const gs = new THREE.Vector3(0.35, -0.75, 0.62).normalize().multiplyScalar(1.0)
    return { a, b, c, gs }
  }, [])
  const chordGeom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      chords.a,
      chords.b,
      chords.b,
      chords.c,
      chords.c,
      chords.gs,
    ])
    return g
  }, [chords])
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.12
    for (let i = 0; i < 8; i++) {
      const m = satRefs.current[i]
      if (!m) continue
      const ring = i < 4 ? 0 : 1
      const tilt = ring === 0 ? RING_A_TILT : RING_B_TILT
      const angle = t + (i % 4) * ((Math.PI * 2) / 4) + ring * 0.4
      ringPoint(tilt, angle, tmp)
      m.position.copy(tmp)
    }
    const p = packetRef.current
    const h = haloRef.current
    if (p && h) {
      if (mode === "hero") {
        ringPoint(RING_A_TILT, t + 2 * ((Math.PI * 2) / 4), tmp)
      } else {
        const k = progressRef?.current ?? 0
        const segs = [chords.a, chords.b, chords.c, chords.gs]
        const total = segs.length - 1
        const f = Math.min(total - 1e-4, Math.max(0, k * total))
        const si = Math.floor(f)
        const fr = f - si
        tmp.lerpVectors(segs[si], segs[si + 1], fr)
      }
      p.position.copy(tmp)
      h.position.copy(tmp)
      const s = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.15
      h.scale.setScalar(s)
    }
    if (group.current && mode === "hero") {
      group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.05) * 0.25
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            satRefs.current[i] = m
          }}
        >
          <sphereGeometry args={[0.032, 12, 12]} />
          <meshBasicMaterial color={SAT_COLOR} />
        </mesh>
      ))}
      {mode === "route" && (
        <lineSegments geometry={chordGeom}>
          <lineBasicMaterial color="#6ea8ff" transparent opacity={0.85} />
        </lineSegments>
      )}
      {mode === "route" && (
        <mesh position={chords.gs}>
          <boxGeometry args={[0.09, 0.09, 0.09]} />
          <meshBasicMaterial color="#4cc38a" />
        </mesh>
      )}
      <mesh ref={packetRef}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color={PACKET_COLOR} />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color={PACKET_COLOR} transparent opacity={0.28} />
      </mesh>
    </group>
  )
}

function Rig({ mode }: { mode: "hero" | "route" }) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime()
    if (mode === "hero") {
      camera.position.x = Math.sin(t * 0.07) * 0.35
      camera.position.y = 0.55 + Math.sin(t * 0.05) * 0.12
      camera.lookAt(0, 0, 0)
    } else {
      camera.position.set(0.4, 0.35, 2.1)
      camera.lookAt(0.3, -0.2, 0)
    }
  })
  return null
}

export function OrbitScene({
  mode,
  progressRef,
  height = 520,
}: {
  mode: "hero" | "route"
  progressRef?: RefObject<number>
  height?: number
}) {
  return (
    <div style={{ height, width: "100%" }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.55, 3.3], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Rig mode={mode} />
        {/* wireframe Earth: line sphere, rule + cream-dim */}
        <mesh>
          <sphereGeometry args={[1, 28, 20]} />
          <meshBasicMaterial color="#26305a" wireframe transparent opacity={0.9} />
        </mesh>
        <mesh scale={1.002}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#b9b09e" wireframe transparent opacity={0.16} />
        </mesh>
        {/* orbit rings, planes A/B with an SSO feel */}
        <mesh rotation={[Math.PI / 2, 0, RING_A_TILT]}>
          <torusGeometry args={[R, 0.004, 8, 180]} />
          <meshBasicMaterial color="#26305a" transparent opacity={0.95} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, RING_B_TILT]}>
          <torusGeometry args={[R, 0.004, 8, 180]} />
          <meshBasicMaterial color="#26305a" transparent opacity={0.95} />
        </mesh>
        <Swarm mode={mode} progressRef={progressRef} />
      </Canvas>
    </div>
  )
}
