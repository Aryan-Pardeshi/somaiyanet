import { cn } from "@/lib/utils"

export interface HopNode {
  id: string
  kind: "SAT" | "GROUND"
}

/**
 * Horizontal rail of nodes (circles = SATs, squares = stations) joined by
 * dashed segments. Hops at or before `active` glow Somaiya red.
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
                    "block size-4 transition-colors duration-500",
                    n.kind === "SAT" ? "rounded-full" : "rounded-[4px]",
                    lit
                      ? "bg-[var(--ice)]"
                      : "border border-dashed border-[var(--text-3)] bg-transparent"
                  )}
                  style={
                    lit
                      ? { boxShadow: "0 0 12px var(--ice)" }
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
                    className="absolute inset-y-0 left-0 border-t-2 border-solid border-[var(--ice)] transition-all duration-700"
                    style={{
                      width: i < active ? "100%" : "0%",
                      boxShadow: i < active ? "0 0 8px var(--ice)" : undefined,
                    }}
                  />
                  {i + 1 === active && (
                    <span
                      className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ice)]"
                      style={{ left: "100%", animation: "hop-pulse 1.1s ease-in-out infinite" }}
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
