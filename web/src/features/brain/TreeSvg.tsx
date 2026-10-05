import { useEffect, useMemo, useRef, useState } from "react";
import type { DtNode, RouterAction } from "./api";

interface Pos {
  x: number;
  y: number;
}

const X_GAP = 100;
const Y_GAP = 110;
const NODE_W = 88;
const NODE_H = 46;

export function TreeSvg({
  nodes,
  pathIds,
  stagger,
  modelVersion = 1,
  overrideNodeId = null,
}: {
  nodes: DtNode[];
  pathIds: number[];
  stagger: boolean;
  modelVersion?: number;
  overrideNodeId?: number | null;
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

  const actions = useMemo(() => {
    const seen = new Set<RouterAction>();
    for (const n of nodes) {
      if (n.leaf_action !== null) seen.add(n.leaf_action);
    }
    return [...seen];
  }, [nodes]);

  // Wheel zoom via a non-passive listener: React's synthetic onWheel is
  // passive, so preventDefault (to stop the page scrolling while zooming
  // the tree) would be ignored there.: React's synthetic onWheel is
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="sx-eyebrow">
            Decision tree · Model v{modelVersion} · {nodes.length} nodes
          </span>
          <span className="sx-caption">{visible.size} in view</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="sx-btn sx-btn--quiet sx-btn--sm"
            aria-expanded={showFull}
          >
            {showFull ? "Collapse off-path" : "Expand full tree"}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="sx-btn sx-btn--quiet sx-btn--sm"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              aria-label="Reset zoom"
              className="sx-btn sx-btn--quiet sx-btn--sm"
            >
              1×
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
              className="sx-btn sx-btn--quiet sx-btn--sm"
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
        className="relative cursor-grab overflow-hidden rounded-[10px] bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white active:cursor-grabbing"
        style={{ height: 440, boxShadow: "inset 0 0 0 1px var(--sx-hairline)" }}
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
        <div className="sx-caption pointer-events-none absolute left-2.5 top-2 z-10">
          Active path in white
        </div>
        <div className="sx-caption pointer-events-none absolute right-2.5 top-2 z-10">
          Scroll to zoom · Drag to move
        </div>

        <svg
          width="100%"
          height="440"
          role="img"
          aria-label="Decision tree"
          style={{ display: "block" }}
        >
          <g transform={`translate(${pan.x + 30},${pan.y + 30}) scale(${zoom})`}>
            {/* Connection lines: 1px white 25% idle, white 100% on the active path */}
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
                      stroke={hot ? "#ffffff" : "rgba(255, 255, 255, 0.25)"}
                      strokeWidth={hot ? 1.5 : 1}
                    />
                  );
                });
            })}

            {/* Tree nodes: minimal rounded rectangles, no borders, no glows */}
            {order.map((n) => {
              const p = pos.get(n.node_id);
              if (!p) return null;
              const hot = onPath.has(n.node_id);
              const leaf = n.leaf_action !== null;
              const overridden = overrideNodeId !== null && n.node_id === overrideNodeId;
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
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={overridden ? "rgba(255, 159, 10, 0.16)" : "#111113"}
                  />
                  {overridden && (
                    <circle cx={NODE_W - 10} cy={10} r={3} fill="#ff9f0a" />
                  )}
                  {hot && !leaf && (
                    <circle cx={NODE_W / 2} cy={6} r={2} fill="#ffffff" />
                  )}

                  <text
                    x={NODE_W / 2}
                    y={leaf ? 19 : 18}
                    textAnchor="middle"
                    fill={overridden ? "#ff9f0a" : "#ffffff"}
                    fontSize={11}
                    fontWeight={600}
                    fontFamily="var(--font-display)"
                    style={{ textTransform: "capitalize", letterSpacing: "0.06em" }}
                  >
                    {(leaf && n.leaf_action ? n.leaf_action : (n.feature ?? "")).slice(0, 14)}
                  </text>

                  <text
                    x={NODE_W / 2}
                    y={32}
                    textAnchor="middle"
                    fill={overridden ? "#ff9f0a" : hot ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)"}
                    fontSize={10}
                    fontFamily="var(--font-sans)"
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

      <div className="flex max-w-full flex-wrap items-center gap-3 pt-1">
        <span className="sx-eyebrow">Actions</span>
        {actions.map((a) => (
          <span
            key={a}
            className="sx-caption inline-flex items-center gap-1.5 !text-white/70"
          >
            <span className="inline-block size-[7px] rounded-full bg-white" />
            {a}
          </span>
        ))}
        <span className="sx-caption inline-flex items-center gap-1.5">
          <span className="inline-block size-[7px] rounded-full bg-[#ff9f0a]" />
          Watchdog override
        </span>
      </div>
    </div>
  );
}
