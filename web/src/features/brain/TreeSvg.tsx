import { useEffect, useMemo, useRef, useState } from "react";
import { ACTION_COLORS, type DtNode, type RouterAction } from "./api";

interface Pos {
  x: number;
  y: number;
}

const X_GAP = 100;
const Y_GAP = 110;
const NODE_W = 88;
const NODE_H = 46;
const CUT = 5;

/** Generates SVG polygon points for a chamfered rectangle */
function chamferPolygon(w: number, h: number, c: number): string {
  return `${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`;
}

export function TreeSvg({
  nodes,
  pathIds,
  stagger,
  modelVersion = 1,
}: {
  nodes: DtNode[];
  pathIds: number[];
  stagger: boolean;
  modelVersion?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showFull, setShowFull] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.node_id, n])), [nodes]);
  const onPath = useMemo(() => new Set(pathIds), [pathIds]);

  // Children adjacency for layout.
  const kids = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const n of nodes) {
      const c: number[] = [];
      if (n.left_child !== null && byId.has(n.left_child)) c.push(n.left_child);
      if (n.right_child !== null && byId.has(n.right_child)) c.push(n.right_child);
      m.set(n.node_id, c);
    }
    return m;
  }, [nodes, byId]);

  // Collapsed: hide subtrees that hang off the path (keep path + siblings).
  const visible = useMemo(() => {
    if (showFull || onPath.size === 0) return new Set(nodes.map((n) => n.node_id));
    const keep = new Set<number>(onPath);
    for (const id of onPath) {
      const n = byId.get(id);
      if (!n) continue;
      if (n.left_child !== null && byId.has(n.left_child)) keep.add(n.left_child);
      if (n.right_child !== null && byId.has(n.right_child)) keep.add(n.right_child);
    }
    return keep;
  }, [showFull, onPath, byId, nodes]);

  const pos = useMemo(() => {
    const out = new Map<number, Pos>();
    let leaf = 0;
    const visit = (id: number, depth: number): number => {
      const n = byId.get(id);
      if (!n) return leaf;
      const children = (kids.get(id) ?? []).filter((c) => visible.has(c));
      if (children.length === 0) {
        out.set(id, { x: leaf * X_GAP, y: depth * Y_GAP });
        leaf += 1;
        return leaf - 1;
      }
      const xs = children.map((c) => visit(c, depth + 1));
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      out.set(id, { x: mid * X_GAP, y: depth * Y_GAP });
      return mid;
    };
    if (byId.has(0)) visit(0, 0);
    return out;
  }, [byId, kids, visible]);

  const order = useMemo(
    () => nodes.filter((n) => visible.has(n.node_id) && pos.has(n.node_id)),
    [nodes, visible, pos],
  );

  const maxX = Math.max(1, ...[...pos.values()].map((p) => p.x)) + X_GAP;
  const maxY = Math.max(1, ...[...pos.values()].map((p) => p.y)) + NODE_H + 40;

  const polyPoints = useMemo(() => chamferPolygon(NODE_W, NODE_H, CUT), []);

  // Wheel zoom via a non-passive listener: React's synthetic onWheel is
  // passive, so preventDefault (to stop the page scrolling while zooming
  // the tree) would be ignored there.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent): void => {
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const onCanvasKeyDown = (e: React.KeyboardEvent): void => {
    const step = 24;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPan((p) => ({ ...p, x: p.x + step }));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPan((p) => ({ ...p, x: p.x - step }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPan((p) => ({ ...p, y: p.y + step }));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setPan((p) => ({ ...p, y: p.y - step }));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom((z) => Math.min(3, z * 1.2));
    } else if (e.key === "-") {
      e.preventDefault();
      setZoom((z) => Math.max(0.3, z / 1.2));
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-[#dfe6f5]">
            DECISION TREE / MODEL v{modelVersion} / {nodes.length} NODES
          </span>
          <span className="font-mono text-[10px] text-[#8b96b0]">
            [{visible.size} ACTIVE IN VIEW]
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFull((v) => !v)}
            className="font-mono px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 transition-colors cursor-pointer"
          >
            {showFull ? "COLLAPSE OFF-PATH" : "EXPAND FULL TREE"}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="font-mono px-2 py-0.5 text-[10px] border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 cursor-pointer"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              aria-label="Reset zoom"
              className="font-mono px-2 py-0.5 text-[10px] border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 cursor-pointer"
            >
              1×
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
              className="font-mono px-2 py-0.5 text-[10px] border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 cursor-pointer"
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* Decision tree canvas: wheel zooms, drag or arrow keys pan */}
      <div
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Decision tree diagram. Arrow keys pan, plus and minus zoom."
        className="relative cursor-grab overflow-hidden border border-white/10 bg-[#05070d] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#3d5bff] active:cursor-grabbing"
        style={{ height: 440 }}
        onKeyDown={onCanvasKeyDown}
        onMouseDown={(e) =>
          (drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y })
        }
        onMouseMove={(e) => {
          if (drag.current) {
            setPan({
              x: drag.current.px + (e.clientX - drag.current.x),
              y: drag.current.py + (e.clientY - drag.current.y),
            });
          }
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) touch.current = { x: t.clientX, y: t.clientY, px: pan.x, py: pan.y };
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t && touch.current) {
            setPan({
              x: touch.current.px + (t.clientX - touch.current.x),
              y: touch.current.py + (t.clientY - touch.current.y),
            });
          }
        }}
        onTouchEnd={() => (touch.current = null)}
      >
        {/* Corner labels */}
        <div className="pointer-events-none absolute left-2.5 top-2 z-10 font-mono text-[9px] uppercase tracking-wider text-[#8b96b0]/70">
          Active path highlighted
        </div>
        <div className="pointer-events-none absolute right-2.5 top-2 z-10 font-mono text-[9px] uppercase tracking-wider text-[#8b96b0]/70">
          Scroll to zoom · Drag to move
        </div>
        <div className="pointer-events-none absolute left-2.5 bottom-2 z-10 font-mono text-[9px] uppercase tracking-wider text-[#8b96b0]/70">
          Decision tree from dt_node rows
        </div>
        <div className="pointer-events-none absolute right-2.5 bottom-2 z-10 font-mono text-[9px] uppercase tracking-wider text-[#8b96b0]/70">
          Size: {Math.round(maxX)}×{Math.round(maxY)}
        </div>

        <svg
          width="100%"
          height="440"
          role="img"
          aria-label="Decision tree"
          style={{ display: "block" }}
        >
          <g transform={`translate(${pan.x + 30},${pan.y + 30}) scale(${zoom})`}>
            {/* Connection lines */}
            {order.map((n) => {
              const p = pos.get(n.node_id);
              if (!p) return null;
              return (kids.get(n.node_id) ?? [])
                .filter((c) => pos.has(c))
                .map((c) => {
                  const q = pos.get(c);
                  if (!q) return null;
                  const hot = onPath.has(n.node_id) && onPath.has(c);
                  return (
                    <line
                      key={`${n.node_id}-${c}`}
                      x1={p.x}
                      y1={p.y}
                      x2={q.x}
                      y2={q.y}
                      stroke={hot ? "#3d5bff" : "rgba(255, 255, 255, 0.12)"}
                      strokeWidth={hot ? 2.4 : 1}
                      style={
                        hot
                          ? { filter: "drop-shadow(0 0 4px rgba(61, 91, 255, 0.7))" }
                          : undefined
                      }
                    />
                  );
                });
            })}

            {/* Tree nodes as chamfered boxes */}
            {order.map((n) => {
              const p = pos.get(n.node_id);
              if (!p) return null;
              const hot = onPath.has(n.node_id);
              const leaf = n.leaf_action !== null;
              const leafColor = leaf
                ? (ACTION_COLORS[n.leaf_action as RouterAction] ?? "#8b96b0")
                : "#8b96b0";

              const strokeColor = hot
                ? "#3d5bff"
                : leaf
                  ? leafColor
                  : "rgba(255, 255, 255, 0.15)";
              const fillColor = hot
                ? "rgba(61, 91, 255, 0.18)"
                : leaf
                  ? "rgba(6, 11, 23, 0.9)"
                  : "rgba(10, 16, 30, 0.85)";
              const step = pathIds.indexOf(n.node_id);

              return (
                <g
                  key={n.node_id}
                  transform={`translate(${p.x - NODE_W / 2},${p.y - NODE_H / 2})`}
                  style={
                    stagger && hot && step >= 0
                      ? {
                          transition: "opacity 300ms ease",
                          transitionDelay: `${step * 100}ms`,
                          opacity: 1,
                        }
                      : undefined
                  }
                >
                  {/* Chamfered Box */}
                  <polygon
                    points={polyPoints}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={hot ? 2 : 1}
                    style={
                      hot
                        ? {
                            filter: "drop-shadow(0 0 6px rgba(61, 91, 255, 0.6))",
                          }
                        : undefined
                    }
                  />

                  {/* Leaf / Feature text */}
                  <text
                    x={NODE_W / 2}
                    y={leaf ? 18 : 17}
                    textAnchor="middle"
                    fill={hot ? "#ffffff" : leaf ? leafColor : "#dfe6f5"}
                    fontSize={8.5}
                    fontWeight={hot || leaf ? 600 : 400}
                    fontFamily="Geist Mono, monospace"
                  >
                    {leaf ? n.leaf_action : n.feature}
                  </text>

                  {/* Threshold / samples text */}
                  <text
                    x={NODE_W / 2}
                    y={leaf ? 31 : 31}
                    textAnchor="middle"
                    fill={hot ? "#7fb2ff" : "#8b96b0"}
                    fontSize={8}
                    fontFamily="Geist Mono, monospace"
                  >
                    {leaf
                      ? `n=${n.samples}`
                      : `≤${Number(n.threshold).toFixed(1)} · n=${n.samples}`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Action Colors Legend */}
      <div className="flex max-w-full flex-wrap items-center gap-3 pt-1 border-t border-white/5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8b96b0]">
          ACTION LABELS:
        </span>
        {(Object.keys(ACTION_COLORS) as RouterAction[]).map((a) => (
          <span
            key={a}
            className="font-mono inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-[#dfe6f5]"
          >
            <span
              className="inline-block size-2 rounded-none"
              style={{ background: ACTION_COLORS[a] }}
            />
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
