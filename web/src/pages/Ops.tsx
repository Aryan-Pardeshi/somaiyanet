// /ops page: Mission Operations Command Center (SpaceX-inspired console)
// Dark, cinematic mission console on pure black built around glowing night-lights Earth.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "@/app/access";
import { OpsGlobe, type OpsGlobeHandle } from "@/features/ops/OpsGlobe";
import { useOpsData, type TelemetryEvent } from "@/features/ops/api";
import { TopBar } from "@/features/ops/cc/TopBar";
import { BottomDock } from "@/features/ops/cc/BottomDock";
import { LeftRail } from "@/features/ops/cc/LeftRail";
import { RightRail } from "@/features/ops/cc/RightRail";
import type { FleetFilter, GlobeView, OpsTab } from "@/features/ops/cc/types";

function seedHistories(
  sats: Array<{ node_id: string; battery_v: number | null }>,
  telemetry: TelemetryEvent[],
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of sats) {
    const base = s.battery_v ?? 7.4;
    out[s.node_id] = Array.from({ length: 36 }, (_, i) => {
      const w = Math.sin(i / 3.1) * 0.12 + (i % 5) * 0.008;
      return Math.round((base + w) * 100) / 100;
    });
  }
  for (const t of telemetry) {
    const arr = out[t.sat_id] ?? (out[t.sat_id] = []);
    arr.push(t.battery_v);
    if (arr.length > 48) arr.splice(0, arr.length - 48);
  }
  return out;
}

export default function Ops() {
  const { access } = useRole();
  const data = useOpsData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OpsTab>("overview");
  const [filter, setFilter] = useState<FleetFilter>("ALL");

  // Station operators (access.station): default camera = their station (Mumbai for GS-BOM, Espoo for GS-HEL)
  const defaultView: GlobeView = useMemo(() => {
    if (access?.station === "GS-HEL") return "espoo";
    if (access?.station === "GS-BOM") return "mumbai";
    return "globe";
  }, [access?.station]);

  const [currentView, setCurrentView] = useState<GlobeView>(defaultView);
  const globeRef = useRef<OpsGlobeHandle>(null);

  useEffect(() => {
    setCurrentView(defaultView);
    globeRef.current?.flyTo(defaultView);
  }, [defaultView]);

  const histories = useMemo(
    () => seedHistories(data.sats, data.telemetry),
    [data.sats, data.telemetry],
  );

  // Default active sat: first NOMINAL sat if none explicitly selected
  const activeSat = useMemo(() => {
    if (selectedId) {
      const found = data.sats.find((s) => s.node_id === selectedId);
      if (found) return found;
    }
    return (
      data.sats.find((s) => s.state === "NOMINAL") ??
      data.sats[0] ??
      null
    );
  }, [data.sats, selectedId]);

  // Compute highlight IDs for globe based on filter
  const highlightIds = useMemo(() => {
    if (filter === "ALL") return undefined;
    return data.sats
      .filter((s) => {
        if (filter === "NOMINAL") return s.state === "NOMINAL";
        if (filter === "SAFE") return s.state === "SAFE";
        if (filter === "STOWED")
          return (
            s.state === "STOWED" ||
            s.state === "DEPLOYED" ||
            s.state === "COMMISSIONING"
          );
        return true;
      })
      .map((s) => s.node_id);
  }, [data.sats, filter]);

  const handleDemoRoute = () => {
    const now = Date.now();
    const iso = (ms: number): string => new Date(ms).toISOString();
    globeRef.current?.playRoute([
      {
        from_node: "SAT-A1",
        to_node: "SAT-A2",
        depart_ts: iso(now),
        arrive_ts: iso(now + 4000),
        kind: "ISL",
      },
      {
        from_node: "SAT-A2",
        to_node: "SAT-A3",
        depart_ts: iso(now + 4000),
        arrive_ts: iso(now + 8000),
        kind: "ISL",
      },
      {
        from_node: "SAT-A3",
        to_node: "GS-BOM",
        depart_ts: iso(now + 8000),
        arrive_ts: iso(now + 12000),
        kind: "DOWNLINK",
      },
    ]);
  };

  const handleViewChange = (v: GlobeView) => {
    setCurrentView(v);
    globeRef.current?.flyTo(v);
  };

  return (
    <div className="-m-4 sm:-m-6 relative min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden bg-black text-[#dfe6f5] flex flex-col">
      {/* 1. Top Bar with Tabs + HUD corner floating text */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedSat={activeSat}
        sats={data.sats}
        contacts={data.contacts}
      />

      {/* 2. Globe Canvas Background:
             On desktop (lg), it fills behind everything and is offset by -20px to center
             the 3D sphere perfectly in the gap between the 300px and 340px translucent rails.
             Below lg (<1024px), it renders as a 60vh box stacked above the rails. */}
      <div className="relative h-[60vh] w-full shrink-0 lg:absolute lg:inset-0 lg:h-full lg:w-[calc(100%+40px)] lg:-left-[20px] lg:z-0 lg:translate-x-[-20px]">
        <OpsGlobe
          ref={globeRef}
          sats={data.sats}
          stations={data.stations}
          contacts={data.contacts}
          selectedId={selectedId}
          onSelect={setSelectedId}
          histories={histories}
          highlightIds={highlightIds}
          defaultView={defaultView}
          myStation={access?.station}
        />
      </div>

      {/* 3. Left Rail:
             Constellation bar, 2x2 chips filter, and fleet cards list.
             Overlays globe on desktop, stacks below globe on mobile. */}
      <aside className="p-4 lg:p-0 lg:absolute lg:left-4 lg:top-14 lg:bottom-20 lg:w-[300px] lg:z-20 pointer-events-auto flex flex-col">
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div className="h-full overflow-y-auto pr-1 pb-8 scrollbar-none [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent_100%)]">
            <LeftRail
              sats={data.sats}
              contacts={data.contacts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filter={filter}
              onFilterChange={setFilter}
            />
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black to-transparent" />
        </div>
      </aside>

      {/* 4. Right Rail:
             Swaps by tab (Overview / Satellites / Upcoming passes / Live data).
             Overlays globe on desktop, stacks below left rail on mobile.
             Scrolls inside its own area with a soft fade at the bottom and dock clearance. */}
      <aside className="p-4 lg:p-0 lg:absolute lg:right-4 lg:top-14 lg:bottom-20 lg:w-[340px] lg:z-20 pointer-events-auto flex flex-col">
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div className="h-full overflow-y-auto pr-1 pb-8 scrollbar-none [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent_100%)]">
            <RightRail
              activeTab={activeTab}
              selectedSat={activeSat}
              histories={histories}
              telemetry={data.telemetry}
              alerts={data.alerts}
              kpis={data.kpis}
              contacts={data.contacts}
              decisions={data.decisions}
              onRefetchAlerts={data.refetchAlerts}
            />
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black to-transparent" />
        </div>
      </aside>

      {/* 5. Bottom Dock:
             View toggles (Whole Earth / Mumbai / Espoo / Selected satellite), Live pill, UTC clock, Demo route button. */}
      <div className="mt-auto lg:mt-0 lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:z-20">
        <BottomDock
          currentView={currentView}
          onViewChange={handleViewChange}
          mock={data.mock}
          onDemoRoute={handleDemoRoute}
        />
      </div>
    </div>
  );
}
