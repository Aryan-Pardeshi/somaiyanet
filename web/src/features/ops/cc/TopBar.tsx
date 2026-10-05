import { useEffect, useState } from "react";
import type { ConstellationSat, Contact } from "../api";
import type { OpsTab } from "./types";

interface TopBarProps {
  activeTab: OpsTab;
  onTabChange: (tab: OpsTab) => void;
  selectedSat: ConstellationSat | null;
  sats: ConstellationSat[];
  contacts: Contact[];
}

const TABS: Array<{ id: OpsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "fleet", label: "Satellites" },
  { id: "contacts", label: "Upcoming passes" },
  { id: "telemetry", label: "Live data" },
];

function formatUtc(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const yr = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const hr = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const se = pad(d.getUTCSeconds());
  return `${yr}-${mo}-${da} ${hr}:${mi}:${se}`;
}

export function TopBar({
  activeTab,
  onTabChange,
  selectedSat,
  sats,
  contacts,
}: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Compute satellites with a ground pass in the next 90 min
  const nowMs = now.getTime();
  const horizonMs = nowMs + 90 * 60 * 1000;
  const downlinkSatIds = new Set<string>();
  for (const c of contacts) {
    if (c.kind === "DOWNLINK") {
      const t = Date.parse(c.start_ts);
      if (t >= nowMs - 60000 && t <= horizonMs) {
        downlinkSatIds.add(c.from_node);
      }
    }
  }
  const totalSats = Math.max(1, sats.filter((s) => s.state !== "STOWED").length);

  return (
    <div className="relative w-full px-4 pt-3 pb-2 z-20 pointer-events-none">
      {/* Top bar container */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* HUD top-left floating text */}
        <div className="hidden lg:flex flex-col gap-0.5 text-left font-mono pointer-events-auto">
          <div className="flex items-center gap-1.5 text-[10.5px] text-[#8b96b0]">
            <span className="inline-block size-1.5 rounded-full bg-[#7ee2b8] motion-safe:animate-pulse" />
            <span>Routing decided by:</span>
            <span className="text-[#dfe6f5] font-semibold">AI decision tree (in PostgreSQL)</span>
          </div>
          <div className="text-[10.5px] text-[#8b96b0]">
            <span>Selected: </span>
            <span className="text-[#3d5bff] font-semibold">
              {selectedSat ? (selectedSat.display_name || selectedSat.node_id) : "SomaiyaSat-1"}
            </span>
          </div>
        </div>

        {/* Center chamfered pill tab bar (wraps on narrow screens) */}
        <nav
          aria-label="Ops navigation"
          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 p-1 rounded-lg border border-white/10 bg-[#060b17]/85 backdrop-blur-xl shadow-2xl"
          style={{
            clipPath:
              "polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)",
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative px-4 py-1.5 text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer ${
                  active
                    ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_12px_rgba(61,91,255,0.4)]"
                    : "text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/5"
                }`}
                style={{
                  clipPath:
                    "polygon(4px 0%, calc(100% - 4px) 0%, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0% calc(100% - 4px), 0% 4px)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* HUD top-right floating text */}
        <div className="hidden lg:flex flex-col gap-0.5 text-right font-mono pointer-events-auto">
          <div className="text-[10.5px] text-[#8b96b0]">
            <span>UTC </span>
            <span className="text-[#dfe6f5] font-semibold tabular-nums">
              {formatUtc(now)}
            </span>
          </div>
          <div className="text-[10.5px] text-[#8b96b0]">
            <span>Satellites with a ground pass in the next 90 min: </span>
            <span className="text-[#7ee2b8] font-semibold tabular-nums">
              {downlinkSatIds.size} of {totalSats}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
