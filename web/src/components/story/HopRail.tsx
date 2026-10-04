import { cn } from "@/lib/utils"

export interface HopNode {
  id: string
  kind: "SAT" | "GROUND"
}

/**
 * Hop rail: nodes (circles = SATs, squares = stations) joined by dashed
 * line-art segments on transparent ground. Hops at or before `active` glow
 * Somaiya red; the rest are thin dashed outlines.
 */
export function HopRail({
  nodes,
  active,
  className,
}: {
  nodes: HopNode[]
  active: number
  className?: string
}) {
  return (
    <div className={cn("w-full", className)} aria-label="Route hops">
      <style>{`
        @keyframes hop-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .hop-pulse-dot {
          animation: hop-pulse 1.1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .hop-pulse-dot {
            animation: none;
          }
        }
      `}</style>
      <div className="flex items-center">
        {nodes.map((n, i) => {
          const lit = i <= active
          const isLast = i === nodes.length - 1
          return (
            <div key={n.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  title={n.id}
                  className={cn(
                    "block size-4 bg-transparent transition-colors duration-500",
                    n.kind === "SAT" ? "rounded-full" : "rounded-[2px]",
                    lit
                      ? "border border-solid border-[var(--somaiya)]"
                      : "border border-dashed border-[var(--text-3)]"
                  )}
                  style={
                    lit
                      ? {
                          boxShadow:
                            "0 0 12px var(--somaiya), inset 0 0 6px rgba(215,38,61,0.55)",
                          backgroundColor: "rgba(215,38,61,0.18)",
                        }
                      : undefined
                  }
                />
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.1em]",
                    lit ? "text-[var(--text)]" : "text-[var(--text-3)]"
                  )}
                >
                  {n.id}
                </span>
              </div>
              {!isLast && (
                <div className="relative mx-1 mb-6 h-px flex-1 border-t border-dashed border-[var(--text-3)]">
                  <div
                    className="absolute inset-y-0 left-0 border-t border-solid border-[var(--somaiya)] transition-all duration-700"
                    style={{
                      width: i < active ? "100%" : "0%",
                      boxShadow: i < active ? "0 0 8px var(--somaiya)" : undefined,
                    }}
                  />
                  {i + 1 === active && (
                    <span
                      className="hop-pulse-dot absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--somaiya)]"
                      style={{ left: "100%" }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
