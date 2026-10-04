import { useMemo, useRef, useState } from "react";
import { ACTION_COLORS, type DtNode, type RouterAction } from "./api";

interface Pos {
  x: number;
  y: number;
}

const X_GAP = 96;
const Y_GAP = 110;
const NODE_W = 84;
const NODE_H = 46;

/**
 * Top-down tidy layout computed locally: leaves are ordered left to right,
 * internal nodes sit above the midpoint of their children. Wheel zooms,
 * drag pans. Off-path branches collapse to a ▸ stub by default.
 */
export function TreeSvg({
  nodes,
  pathIds,
  stagger,
}: {
  nodes: DtNode[];
  pathIds: number[];
  stagger: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showFull, setShowFull] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

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

  const onWheel = (e: React.WheelEvent): void => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
          {nodes.length} nodes · {visible.size} shown
        </span>
        <button
          onClick={() => setShowFull((v) => !v)}
          className="font-mono rounded-full border border-[var(--rule)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
        >
          {showFull ? "collapse off-path" : "expand full tree"}
        </button>
        <span className="font-mono ml-auto flex gap-1 text-[10px]">
          <button
            onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
            className="rounded border border-[var(--rule)] px-2 py-0.5 text-[var(--cream-dim)]"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="rounded border border-[var(--rule)] px-2 py-0.5 text-[var(--cream-dim)]"
          >
            1×
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
            className="rounded border border-[var(--rule)] px-2 py-0.5 text-[var(--cream-dim)]"
            aria-label="Zoom out"
          >
            −
          </button>
        </span>
      </div>
      <div
        className="mt-2 cursor-grab overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink)] active:cursor-grabbing"
        style={{ height: 420 }}
        onWheel={onWheel}
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
      >
        <svg
          width="100%"
          height="420"
          role="img"
          aria-label="Decision tree"
          style={{ display: "block" }}
        >
          <g transform={`translate(${pan.x + 16},${pan.y + 16}) scale(${zoom})`}>
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
                      stroke={hot ? "var(--somaiya)" : "var(--rule)"}
                      strokeWidth={hot ? 2.4 : 1.2}
                    />
                  );
                });
            })}
            {order.map((n, drawIdx) => {
              const p = pos.get(n.node_id);
              if (!p) return null;
              const hot = onPath.has(n.node_id);
              const leaf = n.leaf_action !== null;
              const fill = leaf
                ? (ACTION_COLORS[n.leaf_action as RouterAction] ?? "#7d7a73")
                : "var(--ink-3)";
              const step = pathIds.indexOf(n.node_id);
              return (
                <g
                  key={n.node_id}
                  transform={`translate(${p.x - NODE_W / 2},${p.y - NODE_H / 2})`}
                  style={
                    stagger && hot && step >= 0
                      ? {
                        transition: "opacity 300ms ease",
                        transitionDelay: `${step * 120}ms`,
                        opacity: 1,
                      }
                      : undefined
                  }
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={leaf ? NODE_H / 2 : 8}
                    fill={hot ? "var(--somaiya-soft)" : "var(--ink-2)"}
                    stroke={hot ? "var(--somaiya)" : fill}
                    strokeWidth={hot ? 2.2 : 1.2}
                    style={
                      hot
                        ? { filter: "drop-shadow(0 0 6px var(--somaiya))" }
                        : undefined
                    }
                  />
                  <text
                    x={NODE_W / 2}
                    y={leaf ? 18 : 17}
                    textAnchor="middle"
                    fill="var(--cream)"
                    fontSize={9}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {leaf ? n.leaf_action : n.feature}
                  </text>
                  <text
                    x={NODE_W / 2}
                    y={leaf ? 32 : 31}
                    textAnchor="middle"
                    fill="var(--cream-dim)"
                    fontSize={8.5}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {leaf
                      ? `n=${n.samples}`
                      : `≤ ${Number(n.threshold).toFixed(2)} · n=${n.samples}`}
                  </text>
                  {drawIdx === 0 && <title>drag to pan · wheel to zoom</title>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-2 flex max-w-full flex-wrap gap-2 overflow-x-auto">
        {(Object.keys(ACTION_COLORS) as RouterAction[]).map((a) => (
          <span
            key={a}
            className="font-mono inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-[var(--cream-dim)]"
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: ACTION_COLORS[a] }}
            />
            {a}
          </span>
        ))}
        <span className="font-mono ml-auto hidden text-[10px] text-[var(--mute)] sm:inline">
          canvas {Math.round(maxX)}×{Math.round(maxY)}
        </span>
      </div>
    </div>
  );
}
