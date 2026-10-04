import { useMemo } from "react";
import * as THREE from "three";

/** Solar-cell face: dark blue cells separated by thin silver grid lines. */
function useSolarTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#9aa3b8";
    g.fillRect(0, 0, 512, 128);
    // 5 cells along the 127.4 mm length, 2 across the 57.9 mm width
    const cw = 512 / 5;
    const ch = 128 / 2;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 2; j++) {
        const grad = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
        grad.addColorStop(0, "#0d1c4f");
        grad.addColorStop(1, "#06102e");
        g.fillStyle = grad;
        g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
        g.strokeStyle = "rgba(120,150,220,0.35)";
        g.lineWidth = 1;
        for (let k = 1; k < 6; k++) {
          g.beginPath();
          g.moveTo(i * cw + 3 + (k * (cw - 6)) / 6, j * ch + 3);
          g.lineTo(i * cw + 3 + (k * (cw - 6)) / 6, (j + 1) * ch - 3);
          g.stroke();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
}

/**
 * Procedural SomaiyaSat PocketQube in true proportions
 * (127.4 x 57.9 x 57.2 mm -> 1.274 x 0.579 x 0.572 units before `scale`).
 * Solar cells on the four long faces, anodised end caps, PCB stack edges and
 * a whip antenna. `lineArt` renders white edges only for the line-art stage.
 */
export function PocketQube({
  lineArt = false,
  scale = 1,
  opacity = 1,
}: {
  lineArt?: boolean;
  scale?: number;
  opacity?: number;
}) {
  const solar = useSolarTexture();
  const geo = useMemo(() => new THREE.BoxGeometry(1.274, 0.579, 0.572), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  const mats = useMemo(() => {
    const solarMat = new THREE.MeshStandardMaterial({
      map: solar,
      metalness: 0.55,
      roughness: 0.35,
      transparent: true,
    });
    const cap = new THREE.MeshStandardMaterial({
      color: "#c9ced8",
      metalness: 0.85,
      roughness: 0.3,
      transparent: true,
    });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    return [cap, cap, solarMat, solarMat, solarMat, solarMat];
  }, [solar]);

  if (lineArt) {
    return (
      <group scale={scale}>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.9 * opacity} />
        </lineSegments>
        {/* PCB stack seams, like the drawing in the use-case PDF (Fig. 2) */}
        {[-0.38, 0, 0.38].map((x) => (
          <lineSegments key={x} position={[x, 0, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(0.004, 0.579, 0.572)]} />
            <lineBasicMaterial color="#ffffff" transparent opacity={0.45 * opacity} />
          </lineSegments>
        ))}
        <line>
          <bufferGeometry
            attach="geometry"
            onUpdate={(g) =>
              g.setFromPoints([new THREE.Vector3(0.637, 0.2, 0), new THREE.Vector3(1.05, 0.42, 0)])
            }
          />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.7 * opacity} />
        </line>
      </group>
    );
  }
  return (
    <group scale={scale}>
      <mesh geometry={geo} material={mats} />
      {/* PCB edges peeking out of the stack */}
      {[-0.38, 0, 0.38].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.016, 0.6, 0.59]} />
          <meshStandardMaterial color="#1f6b45" roughness={0.6} />
        </mesh>
      ))}
      {/* whip antenna */}
      <mesh position={[0.84, 0.31, 0]} rotation={[0, 0, -1.1]}>
        <cylinderGeometry args={[0.006, 0.006, 0.5, 6]} />
        <meshBasicMaterial color="#e6ecf8" />
      </mesh>
    </group>
  );
}
