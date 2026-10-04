import { createContext, useContext, useMemo } from "react";

/** Line colour for the line-art variant (white in the hero, blueprint blue elsewhere). */
const LineColor = createContext("#ffffff");
import * as THREE from "three";
import type { ThreeElements } from "@react-three/fiber";

/*
 * Classic LEO spacecraft, built procedurally (no downloaded model):
 * hexagonal riveted bus, gold-foil equipment bay, instrument tower,
 * propellant tanks, a bottom dish whose struts converge on a gold feed,
 * and two three-panel solar wings with gold frames.
 * Local frame: bus vertical (y), wings along x, cell side toward +z.
 * `lineArt` renders the same parts as white edges for the line-art stage.
 */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function useTextures() {
  return useMemo(() => {
    const cells = canvasTex(512, 416, (g) => {
      g.fillStyle = "#07081c";
      g.fillRect(0, 0, 512, 416);
      const cols = 11;
      const rows = 9;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = (i * 512) / cols + 2;
          const y = (j * 416) / rows + 2;
          const w = 512 / cols - 4;
          const h = 416 / rows - 4;
          const grad = g.createLinearGradient(x, y, x + w, y + h);
          grad.addColorStop(0, "#1a1a6e");
          grad.addColorStop(0.6, "#0e0c47");
          grad.addColorStop(1, "#151262");
          g.fillStyle = grad;
          g.fillRect(x, y, w, h);
        }
      g.strokeStyle = "rgba(120,110,255,0.55)";
      g.lineWidth = 1.5;
      for (let i = 0; i <= cols; i++) {
        g.beginPath();
        g.moveTo((i * 512) / cols, 0);
        g.lineTo((i * 512) / cols, 416);
        g.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        g.beginPath();
        g.moveTo(0, (j * 416) / rows);
        g.lineTo(512, (j * 416) / rows);
        g.stroke();
      }
    });
    const foil = canvasTex(256, 256, (g) => {
      g.fillStyle = "#8a6a2a";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(${200 + Math.random() * 55},${160 + Math.random() * 50},${70 + Math.random() * 40},${0.25 + Math.random() * 0.35})`;
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
        g.stroke();
      }
      g.strokeStyle = "rgba(60,40,10,0.7)";
      g.lineWidth = 2;
      for (let k = 64; k < 256; k += 64) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, 256);
        g.stroke();
        g.beginPath();
        g.moveTo(0, k);
        g.lineTo(256, k);
        g.stroke();
      }
    });
    const riveted = canvasTex(256, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, "#c7c0bd");
      grad.addColorStop(1, "#9c9591");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 30, 1);
      }
      g.fillStyle = "rgba(70,65,62,0.8)";
      for (let k = 8; k < 256; k += 16) {
        for (const e of [6, 250]) {
          g.beginPath();
          g.arc(k, e, 2, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.arc(e, k, 2, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = "rgba(60,55,52,0.6)";
      g.strokeRect(1, 1, 254, 254);
    });
    return { cells, foil, riveted };
  }, []);
}

/** A part rendered either as a shaded mesh or as white edges. */
function Part({
  geometry,
  material,
  lineArt,
  edgeOpacity = 0.9,
  threshold = 25,
  ...rest
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  lineArt: boolean;
  edgeOpacity?: number;
  threshold?: number;
} & Omit<ThreeElements["group"], "children">) {
  const color = useContext(LineColor);
  const edges = useMemo(() => (lineArt ? new THREE.EdgesGeometry(geometry, threshold) : null), [geometry, lineArt, threshold]);
  return (
    <group {...rest}>
      {lineArt && edges ? (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={color} transparent opacity={edgeOpacity} />
        </lineSegments>
      ) : (
        <mesh geometry={geometry} material={material} />
      )}
    </group>
  );
}

function Lines({ pts, opacity }: { pts: number[]; opacity: number }) {
  const color = useContext(LineColor);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [pts]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

const PANEL_W = 0.62;
const PANEL_H = 0.5;
const PANEL_GAP = 0.07;
const BUS_R = 0.46;

export function Satellite({ lineArt = false, scale = 1, lineColor = "#ffffff" }: { lineArt?: boolean; scale?: number; lineColor?: string }) {
  const tex = useTextures();
  const mat = useMemo(() => {
    const t = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ transparent: true, ...o });
    return {
      cells: new THREE.MeshPhysicalMaterial({
        map: tex.cells,
        metalness: 0.4,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        transparent: true,
      }),
      panelBack: t({ color: "#2b2b33", metalness: 0.6, roughness: 0.5 }),
      gold: t({ color: "#c79a3c", metalness: 1, roughness: 0.32 }),
      foil: t({ map: tex.foil, metalness: 1, roughness: 0.38 }),
      riveted: t({ map: tex.riveted, metalness: 0.85, roughness: 0.38 }),
      alu: t({ color: "#d9d4d0", metalness: 1, roughness: 0.22 }),
      dark: t({ color: "#2a2d3a", metalness: 0.5, roughness: 0.5 }),
      strut: t({ color: "#b9b6c8", metalness: 0.9, roughness: 0.3 }),
    };
  }, [tex]);

  const g = useMemo(() => {
    const dish = new THREE.SphereGeometry(0.52, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    dish.scale(1, 0.5, 1);
    return {
      bus: new THREE.CylinderGeometry(BUS_R, BUS_R, 0.42, 6),
      bay: new THREE.BoxGeometry(0.52, 0.62, 0.42),
      bayPanel: new THREE.BoxGeometry(0.02, 0.5, 0.36),
      tower: new THREE.CylinderGeometry(0.15, 0.15, 0.62, 20),
      towerCap: new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20),
      tank: new THREE.SphereGeometry(0.11, 20, 14),
      dish,
      rim: new THREE.TorusGeometry(0.52, 0.012, 8, 48),
      panel: new THREE.BoxGeometry(PANEL_W, PANEL_H, 0.012),
      frameH: new THREE.BoxGeometry(PANEL_W + 0.03, 0.02, 0.02),
      frameV: new THREE.BoxGeometry(0.02, PANEL_H + 0.03, 0.02),
      yoke: new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8),
      link: new THREE.CylinderGeometry(0.008, 0.008, PANEL_GAP + 0.02, 6),
      feed: new THREE.SphereGeometry(0.035, 14, 10),
      boom: new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8),
      box: new THREE.BoxGeometry(0.1, 0.07, 0.06),
    };
  }, []);

  // struts from dish rim to the feed at the apex
  const apex = new THREE.Vector3(0, -0.21 - 0.26 - 0.42, 0);
  const strutPts = useMemo(() => {
    const out: { pos: THREE.Vector3; quat: THREE.Quaternion; len: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const from = new THREE.Vector3(Math.cos(a) * 0.5, -0.21 - 0.02, Math.sin(a) * 0.5);
      const dir = apex.clone().sub(from);
      const len = dir.length();
      out.push({
        pos: from.clone().add(apex).multiplyScalar(0.5),
        quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
        len,
      });
    }
    return out;
    // apex is constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wing = (s: 1 | -1) => {
    const x0 = s * (BUS_R + 0.32);
    return (
      <group key={s}>
        {/* yoke arm */}
        <Part geometry={g.yoke} material={mat.strut} lineArt={lineArt} edgeOpacity={0.7} position={[s * (BUS_R + 0.16), 0.02, 0]} rotation={[0, 0, Math.PI / 2]} />
        {[0, 1, 2].map((i) => {
          const cx = x0 + s * (PANEL_W / 2 + i * (PANEL_W + PANEL_GAP));
          return (
            <group key={i} position={[cx, 0.02, 0]} rotation={[0.08, 0, 0]}>
              {lineArt ? (
                <>
                  <Part geometry={g.panel} material={mat.cells} lineArt edgeOpacity={0.95} />
                  <Lines
                    opacity={0.38}
                    pts={[
                      ...Array.from({ length: 10 }, (_, k) => {
                        const x = -PANEL_W / 2 + ((k + 1) * PANEL_W) / 11;
                        return [x, -PANEL_H / 2, 0.007, x, PANEL_H / 2, 0.007];
                      }).flat(),
                      ...Array.from({ length: 8 }, (_, k) => {
                        const y = -PANEL_H / 2 + ((k + 1) * PANEL_H) / 9;
                        return [-PANEL_W / 2, y, 0.007, PANEL_W / 2, y, 0.007];
                      }).flat(),
                    ]}
                  />
                </>
              ) : (
                <>
                  <mesh geometry={g.panel} material={[mat.panelBack, mat.panelBack, mat.panelBack, mat.panelBack, mat.cells, mat.panelBack]} />
                  {[1, -1].map((v) => (
                    <mesh key={`h${v}`} geometry={g.frameH} material={mat.gold} position={[0, (v * PANEL_H) / 2, 0]} />
                  ))}
                  {[1, -1].map((v) => (
                    <mesh key={`v${v}`} geometry={g.frameV} material={mat.gold} position={[(v * PANEL_W) / 2, 0, 0]} />
                  ))}
                </>
              )}
              {i < 2 && (
                <Part
                  geometry={g.link}
                  material={mat.strut}
                  lineArt={lineArt}
                  edgeOpacity={0.6}
                  position={[s * (PANEL_W / 2 + PANEL_GAP / 2), 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                />
              )}
            </group>
          );
        })}
      </group>
    );
  };

  return (
    <LineColor.Provider value={lineColor}>
      <group scale={scale}>
        {/* hexagonal riveted bus */}
        <Part geometry={g.bus} material={mat.riveted} lineArt={lineArt} threshold={10} rotation={[0, Math.PI / 6, 0]} />
      {/* tanks on two hex faces */}
      {[0.9, -2.2].map((a, i) => (
        <Part
          key={i}
          geometry={g.tank}
          material={mat.alu}
          lineArt={lineArt}
          edgeOpacity={0.5}
          threshold={40}
          position={[Math.cos(a) * (BUS_R - 0.02), 0, Math.sin(a) * (BUS_R - 0.02)]}
        />
      ))}
      {/* gold-foil equipment bay on top */}
      <Part geometry={g.bay} material={[mat.foil, mat.foil, mat.dark, mat.dark, mat.foil, mat.foil]} lineArt={lineArt} position={[-0.14, 0.52, -0.06]} />
      <Part geometry={g.bayPanel} material={mat.cells} lineArt={lineArt} edgeOpacity={0.6} position={[-0.41, 0.52, -0.06]} />
      {/* instrument tower */}
      <Part geometry={g.tower} material={mat.alu} lineArt={lineArt} threshold={30} position={[0.19, 0.52, 0.12]} />
      <Part geometry={g.towerCap} material={mat.dark} lineArt={lineArt} threshold={30} position={[0.19, 0.85, 0.12]} />
      <Part geometry={g.box} material={mat.dark} lineArt={lineArt} edgeOpacity={0.6} position={[0.19, 0.6, 0.29]} />
      {/* top boom */}
      <Part geometry={g.boom} material={mat.strut} lineArt={lineArt} edgeOpacity={0.6} position={[-0.25, 0.98, -0.1]} rotation={[0, 0, 0.35]} />
      {/* bottom dish with struts to the gold feed */}
      <Part geometry={g.dish} material={mat.alu} lineArt={lineArt} threshold={20} edgeOpacity={0.55} position={[0, -0.21, 0]} />
      <Part geometry={g.rim} material={mat.strut} lineArt={lineArt} threshold={30} edgeOpacity={0.8} position={[0, -0.21, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {strutPts.map((s, i) =>
        lineArt ? (
          <Lines
            key={i}
            opacity={0.75}
            pts={(() => {
              const half = new THREE.Vector3(0, s.len / 2, 0).applyQuaternion(s.quat);
              const a = s.pos.clone().sub(half);
              const b = s.pos.clone().add(half);
              return [a.x, a.y, a.z, b.x, b.y, b.z];
            })()}
          />
        ) : (
          <mesh key={i} position={s.pos} quaternion={s.quat} material={mat.strut}>
            <cylinderGeometry args={[0.008, 0.008, s.len, 6]} />
          </mesh>
        ),
      )}
      <Part geometry={g.feed} material={mat.gold} lineArt={lineArt} threshold={40} position={apex} />
      {wing(1)}
      {wing(-1)}
    </group>
    </LineColor.Provider>
  );
}
