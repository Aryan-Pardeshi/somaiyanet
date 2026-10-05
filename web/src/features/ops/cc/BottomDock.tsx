import { useRole } from "@/app/access";
import type { GlobeView } from "./types";

interface BottomDockProps {
  currentView: GlobeView;
  onViewChange: (view: GlobeView) => void;
  mock: boolean;
  onDemoRoute: () => void;
  hasActiveRoute?: boolean;
}

export function BottomDock({
  currentView,
  onViewChange,
  mock,
  onDemoRoute,
  hasActiveRoute = false,
}: BottomDockProps) {
  const { access } = useRole();
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

        {/* only flag fallback data; live is the normal state */}
        {mock && (
          <span className="sx-status text-[12px] px-2.5 select-none" data-tone="warn">
            Mock data
          </span>
        )}

        {/* Packet route playback button */}
        <button
          type="button"
          onClick={onDemoRoute}
          className="sx-btn sx-btn--sm"
        >
          {hasActiveRoute ? "Replay Route" : "Show Packet Route"}
        </button>
      </div>
    </div>
  );
}

