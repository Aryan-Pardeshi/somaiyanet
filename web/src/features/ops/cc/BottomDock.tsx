import { useEffect, useState } from "react";
import { useRole } from "@/app/access";
import type { GlobeView } from "./types";

interface BottomDockProps {
  currentView: GlobeView;
  onViewChange: (view: GlobeView) => void;
  mock: boolean;
  onDemoRoute: () => void;
}

export function BottomDock({
  currentView,
  onViewChange,
  mock,
  onDemoRoute,
}: BottomDockProps) {
  const { access } = useRole();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const p = (n: number): string => String(n).padStart(2, "0");

  const views: Array<{ id: GlobeView; label: string }> = [
    { id: "globe", label: "Whole Earth" },
    { id: "mumbai", label: "Mumbai" },
    ...(access?.station === "GS-HEL" ? [{ id: "espoo" as const, label: "Espoo" }] : []),
    { id: "fleet", label: "Selected satellite" },
  ];

  return (
    <div className="relative w-full pb-3 px-4 flex justify-center items-center pointer-events-none z-20">
      <div
        className="pointer-events-auto flex flex-wrap items-center gap-2 p-1.5 rounded-full border border-white/10 shadow-2xl"
        style={{
          backgroundColor: "rgba(10, 14, 28, 0.85)",
          backgroundImage:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.025))",
          backdropFilter: "blur(22px) saturate(170%)",
          WebkitBackdropFilter: "blur(22px) saturate(170%)",
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 12px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* View toggles: Whole Earth / Mumbai / Espoo / Selected satellite */}
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-full border border-white/5">
          {views.map((v) => {
            const active = currentView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onViewChange(v.id)}
                className={`px-3 py-1 text-[11px] font-mono tracking-wider transition-all cursor-pointer rounded-full ${
                  active
                    ? "bg-[#3d5bff]/85 text-white font-semibold shadow-[0_0_8px_rgba(61,91,255,0.5)] border border-[#3d5bff]"
                    : "text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/5 border border-transparent"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Live or Mock pill */}
        {mock ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524] text-[11px] font-mono tracking-wider">
            <span className="size-1.5 rounded-full bg-[#f5a524]" />
            <span>Mock data</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#ff3b4f]/60 bg-[#ff3b4f]/10 text-[#ff3b4f] text-[11px] font-mono tracking-wider">
            <span className="relative flex size-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3b4f] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#ff3b4f]" />
            </span>
            <span>Live from PostgreSQL</span>
          </div>
        )}

        {/* UTC Clock box */}
        <div className="px-3 py-1 bg-black/50 border border-white/5 rounded-full text-[11px] font-mono tabular-nums text-[#dfe6f5] tracking-wider">
          {p(clock.getUTCHours())}:{p(clock.getUTCMinutes())}:
          {p(clock.getUTCSeconds())} <span className="text-[#8b96b0]">UTC</span>
        </div>

        {/* Demo route button */}
        <button
          type="button"
          onClick={onDemoRoute}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#3d5bff]/40 bg-[#3d5bff]/15 text-[#dfe6f5] hover:bg-[#3d5bff]/30 hover:border-[#3d5bff] text-[11px] font-mono tracking-wider transition-colors cursor-pointer"
        >
          <span className="text-[#3d5bff]">▶</span>
          <span>Show a sample route</span>
        </button>
      </div>
    </div>
  );
}
