import { useEffect } from "react";
import { X } from "lucide-react";
import type { CgrRoute } from "@/features/routing/api";
import { formatLatency } from "@/features/routing/api";
import type { Station } from "../api";

export interface RouteHopCardData {
  hopNo: number;
  fromNode: string;
  toNode: string;
  kind: "ISL" | "DOWNLINK";
  linkScore: number | null;
  departRel: string;
}

export interface RouteCardProps {
  origin: string;
  route: CgrRoute | null;
  hops: RouteHopCardData[];
  activeHopIndex: number;
  isCompleted: boolean;
  isLoading: boolean;
  isFallback: boolean;
  sqlError?: { sqlstate?: string; message: string } | null;
  stations: Station[];
  onReplay: () => void;
  onClose: () => void;
}

export function RouteCard({
  origin,
  route,
  hops,
  activeHopIndex,
  isCompleted,
  isLoading,
  isFallback,
  sqlError,
  stations,
  onReplay,
  onClose,
}: RouteCardProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Destination name: station city or display_name, fallback to destination code
  const destinationStation = route
    ? stations.find((s) => s.node_id === route.destination)
    : undefined;
  const destName =
    destinationStation?.city ||
    destinationStation?.display_name ||
    route?.destination ||
    "Destination";

  const weakestScore = route?.bottleneck_score ?? null;
  const arrivalText = route
    ? `${origin} to ${destName}, earliest arrival in ${formatLatency(route.latency_s)}, weakest link ${
        weakestScore != null ? `q ${weakestScore}` : "q n/a"
      }`
    : `${origin} route`;

  return (
    <div
      role="dialog"
      aria-label="Packet Route"
      className="sx-material p-3 flex flex-col gap-2 pointer-events-auto max-h-[calc(100vh-6rem)] overflow-y-auto"
      style={{
        animation: "route-card-slide-up 250ms var(--sx-ease-out) forwards",
      }}
    >
      <style>{`
        @keyframes route-card-slide-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Header row: title and quiet close button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="sx-h3 text-[15px]">Packet Route</h2>
          {isFallback && (
            <span className="sx-status text-[12px]" data-tone="warn">
              Sample route (database offline)
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close route"
          className="sx-btn sx-btn--quiet p-1 min-h-0 min-w-0 h-7 w-7 rounded-full"
        >
          <X className="w-3.5 h-3.5 text-[var(--sx-text-2)] hover:text-white transition-colors" />
        </button>
      </div>

      {/* SQL error note if present */}
      {sqlError && (
        <div className="font-mono text-[12px] text-[var(--sx-red)] break-words">
          {sqlError.sqlstate ? `[${sqlError.sqlstate}] ` : ""}
          {sqlError.message}
        </div>
      )}

      {/* Loading state: no spinner gimmicks */}
      {isLoading ? (
        <p className="sx-body py-4">Finding the earliest route…</p>
      ) : (
        <>
          {/* Subtitle line */}
          <p className="sx-caption text-[var(--sx-text-2)]">{arrivalText}</p>

          {/* Hops inset-grouped list */}
          <div className="sx-group">
            {hops.map((hop, idx) => {
              const isCurrent = idx === activeHopIndex && !isCompleted;
              const isUpcoming = !isCompleted && idx > activeHopIndex;

              return (
                <div
                  key={`${hop.fromNode}-${hop.toNode}-${idx}`}
                  className={`sx-row min-h-[32px] py-1.5 px-2.5 transition-colors duration-150 ${
                    isCurrent ? "bg-[var(--sx-surface-2)]" : ""
                  } ${isUpcoming ? "text-white/45" : "text-[var(--sx-text)]"}`}
                >
                  {/* Left: red dot indicator, hop number, from to to */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 transition-opacity ${
                        isCurrent
                          ? "bg-[var(--sx-red)] opacity-100"
                          : "opacity-0"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="sx-num text-[12px] w-3 text-center shrink-0">
                      {hop.hopNo}
                    </span>
                    <span className="font-medium text-[13px] truncate">
                      {hop.fromNode} to {hop.toNode}
                    </span>
                  </div>

                  {/* Right: kind, quality, depart time */}
                  <div className="flex items-center gap-2.5 sm:gap-3 text-[12px] shrink-0">
                    <span className="text-[var(--sx-text-2)] hidden sm:inline">
                      {hop.kind === "ISL" ? "Satellite link" : "Downlink"}
                    </span>
                    <span className="sx-num">
                      {hop.linkScore != null ? `q ${hop.linkScore}` : "q n/a"}
                    </span>
                    <span className="sx-num w-14 text-right">
                      {hop.departRel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: the query that found this route, and replay */}
          <div className="flex items-center gap-2">
            <div className="sx-code min-w-0 flex-1 truncate px-2.5 py-1 text-[11px]" title={`SELECT * FROM cgr_routes('${origin}', now(), 41216, 4);`}>
              SELECT * FROM cgr_routes('{origin}', now(), 41216, 4);
            </div>
            <button type="button" onClick={onReplay} className="sx-btn sx-btn--sm shrink-0 min-h-[30px] px-3.5 text-[12px]">
              Replay
            </button>
          </div>
        </>
      )}
    </div>
  );
}
