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
      <div className="sx-material pointer-events-auto flex flex-wrap items-center gap-2 p-1.5 rounded-full">
        {/* View toggles: Whole Earth / Mumbai / Espoo / Selected satellite */}
        <div className="flex items-center gap-1">
          {views.map((v) => {
            const active = currentView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onViewChange(v.id)}
                className={`sx-btn sx-btn--sm ${
                  active ? "sx-btn--filled" : "sx-btn--quiet"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Live or Mock pill */}
        <span
          className="sx-status text-[12px] px-2.5 select-none"
          data-tone={mock ? "warn" : "ok"}
        >
          {mock ? "Mock data" : "Live PostgreSQL"}
        </span>

        {/* UTC Clock box */}
        <span className="sx-num text-[12px] text-[var(--sx-text-2)] tabular-nums px-2">
          {p(clock.getUTCHours())}:{p(clock.getUTCMinutes())}:
          {p(clock.getUTCSeconds())} <span className="text-[var(--sx-text-3)]">UTC</span>
        </span>

        {/* Demo route button */}
        <button
          type="button"
          onClick={onDemoRoute}
          className="sx-btn sx-btn--sm"
        >
          Show sample route
        </button>
      </div>
    </div>
  );
}

