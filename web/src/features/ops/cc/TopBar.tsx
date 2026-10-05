import type { ConstellationSat, Contact } from "../api";
import type { OpsTab } from "./types";

interface TopBarProps {
  activeTab: OpsTab;
  onTabChange: (tab: OpsTab) => void;
  selectedSat: ConstellationSat | null;
  sats: ConstellationSat[];
  contacts: Contact[];
  /** Render the tab pill inline (CSS-glass fallback). False when the liquid-glass overlay owns it. */
  showTabs?: boolean;
}

const TABS: Array<{ id: OpsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "fleet", label: "Satellites" },
  { id: "contacts", label: "Upcoming passes" },
  { id: "telemetry", label: "Live data" },
];

/** The four tab buttons, shared by the inline pill and the liquid-glass overlay. */
export function TabButtons({
  activeTab,
  onTabChange,
}: {
  activeTab: OpsTab;
  onTabChange: (tab: OpsTab) => void;
}) {
  return (
    <>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`sx-btn sx-btn--sm ${
              active
                ? "sx-btn--filled"
                : "sx-btn--quiet"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </>
  );
}

/** Ops tab pill. Role, clock and profile switch live in the app shell header, so they are not repeated here. */
export function TopBar({ activeTab, onTabChange, showTabs = true }: TopBarProps) {
  return (
    <header className="pointer-events-none relative z-20 flex min-h-[52px] w-full items-center justify-center px-4 pt-3 pb-2">
      {showTabs && (
        <nav
          aria-label="Ops navigation"
          className="sx-material pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full p-1"
        >
          <TabButtons activeTab={activeTab} onTabChange={onTabChange} />
        </nav>
      )}
    </header>
  );
}
