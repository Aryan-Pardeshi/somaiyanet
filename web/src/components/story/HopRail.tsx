import { cn } from "@/lib/utils";

export interface HopNode {
  id: string;
  kind: "SAT" | "GROUND";
}

/**
 * Hop rail: chosen packet route. Satellites are solid white dots (r 3-4),
 * DIN caps labels plus a quiet status line. Links are 1px hairlines:
 * white 20% idle, white 70% live; the fully chosen route renders in
 * `--sx-red` with a red packet dot. No rings, halos or glows.
 */
export function HopRail({
  nodes,
  active,
  className,
}: {
  nodes: HopNode[];
  active: number;
  className?: string;
}) {
  if (nodes.length === 0) return null;
  const chosen = active >= nodes.length;
  const liveColor = chosen ? "var(--sx-red)" : "rgba(255, 255, 255, 0.7)";
  const idleColor = "rgba(255, 255, 255, 0.2)";

  return (
    <div className={cn("w-full", className)} aria-label="Route hops">
      <div className="flex items-start">
        {nodes.map((n, i) => {
          const lit = i <= active;
          const isLast = i === nodes.length - 1;
          const isPacketHead = chosen ? isLast : i === active;
          return (
            <div key={n.id} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  title={n.id}
                  aria-label={`${n.id} ${n.kind === "SAT" ? "satellite" : "ground station"}`}
                  className="block size-[7px] shrink-0 rounded-full"
                  style={{
                    backgroundColor: isPacketHead
                      ? "var(--sx-red)"
                      : lit
                        ? "#ffffff"
                        : "rgba(255, 255, 255, 0.45)",
                  }}
                />
                <span
                  className="text-center leading-tight text-white/70"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    letterSpacing: "0.08em",
                  }}
                >
                  {n.id}
                </span>
                <span className="sx-status">
                  {n.kind === "SAT" ? "Relay" : "Ground"}
                </span>
              </div>
              {!isLast && (
                <div
                  className="relative mx-1 mt-[3px] h-px flex-1"
                  style={{ backgroundColor: idleColor }}
                  aria-hidden="true"
                >
                  <div
                    className="absolute inset-y-0 left-0 h-px"
                    style={{
                      width: i < active ? "100%" : "0%",
                      backgroundColor: liveColor,
                    }}
                  />
                  {i + 1 === active && !chosen && (
                    <span
                      className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: "100%", backgroundColor: "var(--sx-red)" }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
