import { useEffect, useState } from "react";
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
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const p = (n: number): string => String(n).padStart(2, "0");

  return (
    <div className="relative w-full pb-3 px-4 flex justify-center items-center pointer-events-none z-20">
      <div
        className="pointer-events-auto flex flex-wrap items-center gap-2 p-1.5 rounded-lg border border-white/10 bg-[#060b17]/85 backdrop-blur-xl shadow-2xl"
        style={{
          clipPath:
            "polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)",
        }}
      >
        {/* View toggles: Globe / Mumbai / Fleet */}
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-md border border-white/5">
          {(
            [
              { id: "globe", label: "Globe" },
              { id: "mumbai", label: "Mumbai" },
              { id: "fleet", label: "Fleet" },
            ] as const
          ).map((v) => {
            const active = currentView === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onViewChange(v.id)}
                className={`px-3 py-1 text-[11px] font-mono uppercase tracking-[0.12em] transition-all cursor-pointer rounded ${
                  active
                    ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_8px_rgba(61,91,255,0.5)]"
                    : "text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/5"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Live or Mock pill */}
        {mock ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524] text-[11px] font-mono tracking-wider">
            <span className="size-1.5 rounded-full bg-[#f5a524]" />
            <span>MOCK DATA</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#ff3b4f]/60 bg-[#ff3b4f]/10 text-[#ff3b4f] text-[11px] font-mono tracking-wider">
            <span className="relative flex size-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff3b4f] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#ff3b4f]" />
            </span>
            <span>LIVE</span>
          </div>
        )}

        {/* UTC Clock box */}
        <div className="px-3 py-1 bg-black/50 border border-white/5 rounded text-[11px] font-mono tabular-nums text-[#dfe6f5] tracking-wider">
          {p(clock.getUTCHours())}:{p(clock.getUTCMinutes())}:
          {p(clock.getUTCSeconds())} <span className="text-[#8b96b0]">UTC</span>
        </div>

        {/* Demo route button */}
        <button
          onClick={onDemoRoute}
          className="flex items-center gap-1.5 px-3 py-1 rounded border border-[#3d5bff]/40 bg-[#3d5bff]/15 text-[#dfe6f5] hover:bg-[#3d5bff]/30 hover:border-[#3d5bff] text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
        >
          <span className="text-[#3d5bff]">▶</span>
          <span>Demo route</span>
        </button>
      </div>
    </div>
  );
}
