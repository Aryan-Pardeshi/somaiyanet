import { useMemo } from "react";
import * as THREE from "three";

/*
 * SomaiyaSat PocketQube with two deployed solar wings.
 * Local frame: the 127.4 mm long axis is vertical (y), the wings unfold left
 * and right along x, and the cell side faces +z (the camera). Body dimensions
 * are the true 57.9 x 127.4 x 57.2 mm, as 0.579 x 1.274 x 0.572 units.
 */
const BW = 0.579; // body width  (x)
const BL = 1.274; // body length (y)
const BD = 0.572; // body depth  (z)
const WING_L = 1.35; // each wing's span along x
const WING_H = 0.56; // wing height along y
const WING_COLS = 5;
const WING_ROWS = 2;

/** Dark-blue triple-junction cells, silver busbars, thin substrate gaps. */
function useCellTexture(cols: number, rows: number): THREE.CanvasTexture {
  return useMemo(() => {
    const W = 1024;
    const H = Math.round((W * rows) / cols);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c3c8d2";
    g.fillRect(0, 0, W, H);
    const cw = W / cols;
    const ch = H / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * cw + 5;
        const y = j * ch + 5;
        const w = cw - 10;
        const h = ch - 10;
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, "#1d3a8a");
        grad.addColorStop(0.5, "#0c1a4d");
        grad.addColorStop(1, "#070f2e");
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
        g.fillStyle = "rgba(205,212,228,0.6)";
        g.fillRect(x + w * 0.33, y, 2, h);
        g.fillRect(x + w * 0.66, y, 2, h);
        g.fillStyle = "rgba(160,180,220,0.1)";
        for (let k = 7; k < h; k += 8) g.fillRect(x, y + k, w, 1);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [cols, rows]);
}

function LineBox({ size, position, o }: { size: [number, number, number]; position?: [number, number, number]; o: number }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <lineSegments geometry={geo} position={position}>
      <lineBasicMaterial color="#ffffff" transparent opacity={o} />
    </lineSegments>
  );
}

function Segments({ pts, o }: { pts: number[]; o: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [pts]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#ffffff" transparent opacity={o} />
    </lineSegments>
  );
}

/** Interior cell-grid lines for one wing (in wing-local coords). */
function wingGrid(): number[] {
  const p: number[] = [];
  for (let i = 1; i < WING_COLS; i++) {
    const x = -WING_L / 2 + (i * WING_L) / WING_COLS;
    p.push(x, -WING_H / 2, 0, x, WING_H / 2, 0);
  }
  for (let j = 1; j < WING_ROWS; j++) {
    const y = -WING_H / 2 + (j * WING_H) / WING_ROWS;
    p.push(-WING_L / 2, y, 0, WING_L / 2, y, 0);
  }
  return p;
}

export function PocketQube({
  lineArt = false,
  scale = 1,
  opacity = 1,
}: {
  lineArt?: boolean;
  scale?: number;
  opacity?: number;
}) {
  const bodyCells = useCellTexture(2, 5);
  const wingCells = useCellTexture(WING_COLS, WING_ROWS);
  const grid = useMemo(() => wingGrid(), []);
  const wingX = BW / 2 + 0.06 + WING_L / 2; // wing centre offset from bus
  const wingY = BL * 0.12;

  const m = useMemo(() => {
    const physical = (map: THREE.Texture) =>
      new THREE.MeshPhysicalMaterial({
        map,
        metalness: 0.35,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        transparent: true,
      });
    return {
      cell: physical(bodyCells),
      wing: physical(wingCells),
      back: new THREE.MeshStandardMaterial({ color: "#3a3f49", metalness: 0.7, roughness: 0.45, transparent: true }),
      alu: new THREE.MeshStandardMaterial({ color: "#dfe3ea", metalness: 1, roughness: 0.25, transparent: true }),
      plate: new THREE.MeshStandardMaterial({ color: "#9aa0ab", metalness: 0.9, roughness: 0.35, transparent: true }),
      gold: new THREE.MeshStandardMaterial({ color: "#d4a94f", metalness: 1, roughness: 0.3, transparent: true }),
    };
  }, [bodyCells, wingCells]);

  if (lineArt) {
    const o = opacity;
    return (
      <group scale={scale}>
        <LineBox size={[BW, BL, BD]} o={0.95 * o} />
        {/* PCB stack seams across the bus */}
        <Segments
          pts={[-0.38, 0, 0.38].flatMap((y) => [-BW / 2, y, BD / 2, BW / 2, y, BD / 2])}
          o={0.45 * o}
        />
        {[1, -1].map((s) => (
          <group key={s} position={[s * wingX, wingY, 0]}>
            <LineBox size={[WING_L, WING_H, 0.001]} o={0.9 * o} />
            <Segments pts={grid} o={0.4 * o} />
            {/* hinge arm */}
            <Segments pts={[(-s * WING_L) / 2, 0, 0, -s * (WING_L / 2 + 0.06), 0, 0]} o={0.8 * o} />
          </group>
        ))}
        {/* tape antennas from the top plate */}
        <Segments pts={[0, BL / 2, 0, 0.32, BL / 2 + 0.42, 0, 0, BL / 2, 0, -0.32, BL / 2 + 0.42, 0]} o={0.75 * o} />
        {/* downward-looking payload aperture */}
        <Segments pts={[-0.12, -BL / 2, BD / 2, 0, -BL / 2 - 0.08, BD / 2, 0, -BL / 2 - 0.08, BD / 2, 0.12, -BL / 2, BD / 2]} o={0.6 * o} />
      </group>
    );
  }

  return (
    <group scale={scale}>
      {/* bus: cells on the 4 long faces, plates top/bottom */}
      <mesh material={[m.cell, m.cell, m.plate, m.plate, m.cell, m.cell]}>
        <boxGeometry args={[BW, BL, BD]} />
      </mesh>
      {/* aluminium corner rails */}
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[(x * BW) / 2, 0, (z * BD) / 2]} material={m.alu}>
          <boxGeometry args={[0.045, BL + 0.03, 0.045]} />
        </mesh>
      ))}
      {/* end plates with gold standoffs */}
      {[1, -1].map((s) => (
        <group key={s} position={[0, (s * (BL + 0.04)) / 2, 0]}>
          <mesh material={m.alu}>
            <boxGeometry args={[BW + 0.04, 0.02, BD + 0.04]} />
          </mesh>
          {[
            [0.19, 0.19],
            [0.19, -0.19],
            [-0.19, 0.19],
            [-0.19, -0.19],
          ].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, s * 0.02, z]} material={m.gold}>
              <cylinderGeometry args={[0.018, 0.018, 0.03, 12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* deployed wings, cell side toward +z */}
      {[1, -1].map((s) => (
        <group key={s} position={[s * wingX, wingY, 0]}>
          <mesh material={[m.alu, m.alu, m.alu, m.alu, m.wing, m.back]}>
            <boxGeometry args={[WING_L, WING_H, 0.014]} />
          </mesh>
          <mesh position={[(-s * WING_L) / 2 - s * 0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.alu}>
            <cylinderGeometry args={[0.012, 0.012, 0.07, 10]} />
          </mesh>
        </group>
      ))}
      {/* tape-measure antennas */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.16, BL / 2 + 0.21, 0]} rotation={[0, 0, -s * 0.65]} material={m.alu}>
          <boxGeometry args={[0.02, 0.5, 0.004]} />
        </mesh>
      ))}
    </group>
  );
}
