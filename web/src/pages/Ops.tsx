// /ops page: Mission Operations Command Center (SpaceX-inspired console)
// Dark, cinematic mission console on pure black built around glowing night-lights Earth.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "@/app/access";
import { OpsGlobe, type OpsGlobeHandle } from "@/features/ops/OpsGlobe";
import { useOpsData, type TelemetryEvent } from "@/features/ops/api";
import { TabButtons, TopBar } from "@/features/ops/cc/TopBar";
import { LiquidOverlay, type GlassSlab } from "@/features/ops/cc/LiquidOverlay";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { LeftRail } from "@/features/ops/cc/LeftRail";
import { RightRail } from "@/features/ops/cc/RightRail";
import { BottomDock } from "@/features/ops/cc/BottomDock";
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
  const globeLayerRef = useRef<HTMLDivElement>(null);

  // Real WebGL liquid glass needs room for the floating tab pill; below this width
  // (or if WebGL / the library fails) the rails fall back to CSS glass.
  const wide = useMediaQuery("(min-width: 1280px)");
  const [liquidFailed, setLiquidFailed] = useState(false);
  const liquid = wide && !liquidFailed;

  useEffect(() => {
    setCurrentView(defaultView);
    globeRef.current?.flyTo(defaultView);
  }, [defaultView]);

  const handleViewChange = (v: GlobeView): void => {
    setCurrentView(v);
    globeRef.current?.flyTo(v);
  };

  const handleDemoRoute = (): void => {
    const nowIso = new Date().toISOString();
    const hop1Iso = new Date(Date.now() + 1400).toISOString();
    const hop2Iso = new Date(Date.now() + 2800).toISOString();
    globeRef.current?.playRoute([
      {
        from_node: "SS-1",
        to_node: "SS-2",
        depart_ts: nowIso,
        arrive_ts: hop1Iso,
        kind: "ISL",
      },
      {
        from_node: "SS-2",
        to_node: "GS-BOM",
        depart_ts: hop1Iso,
        arrive_ts: hop2Iso,
        kind: "DOWNLINK",
      },
    ]);
  };

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

  const leftRail = (
    <LeftRail
      sats={data.sats}
      contacts={data.contacts}
      selectedId={selectedId}
      onSelect={setSelectedId}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
  const rightRail = (
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
  );

  const scrollStyle = {
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255, 255, 255, 0.2) transparent",
  } as const;
  const scrollFade =
    "[scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [mask-image:linear-gradient(to_bottom,black_94%,transparent)]";

  const slabs: GlassSlab[] = [
    {
      key: "tabs",
      className: "inset-x-0 mx-auto top-3 h-11 w-[470px] rounded-full",
      config: { cornerRadius: 22, zRadius: 16, brightness: -0.2, blurAmount: 0.2 },
      clip: false,
      children: (
        <nav
          aria-label="Ops navigation"
          className="flex h-full items-center justify-center gap-1 px-1"
        >
          <TabButtons activeTab={activeTab} onTabChange={setActiveTab} />
        </nav>
      ),
    },
    {
      key: "left",
      className: "left-4 top-14 bottom-4 w-[320px] rounded-[16px]",
      config: { cornerRadius: 16, zRadius: 20 },
      children: (
        <div
          data-lenis-prevent
          className={`h-full overflow-y-auto overscroll-contain px-3 pt-3 pb-8 ${scrollFade}`}
          style={scrollStyle}
        >
          {leftRail}
        </div>
      ),
    },
    {
      key: "right",
      className: "right-4 top-14 bottom-4 w-[340px] rounded-[16px]",
      config: { cornerRadius: 16, zRadius: 20 },
      children: (
        <div
          data-lenis-prevent
          className={`h-full overflow-y-auto overscroll-contain px-3 pt-3 pb-8 ${scrollFade}`}
          style={scrollStyle}
        >
          {rightRail}
        </div>
      ),
    },
  ];

  return (
    <div className="-m-4 sm:-m-6 relative min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden bg-black text-[#dfe6f5] flex flex-col">
      {/* 1. Top Bar with Tabs */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedSat={activeSat}
        sats={data.sats}
        contacts={data.contacts}
        showTabs={!liquid}
      />

      {/* 2. Globe Canvas Background */}
      <div
        ref={globeLayerRef}
        className="relative h-[60vh] w-full shrink-0 lg:absolute lg:inset-0 lg:h-full lg:w-[calc(100%+40px)] lg:-left-[20px] lg:z-0 lg:translate-x-[-20px]"
      >
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

      {liquid ? (
        /* 3+4. Tab pill and both rails as WebGL liquid glass refracting the live globe. */
        <LiquidOverlay
          globeRef={globeLayerRef}
          slabs={slabs}
          onFail={() => setLiquidFailed(true)}
        />
      ) : (
        <>
          {/* 3. Left Rail */}
          <aside className="p-4 lg:p-0 lg:absolute lg:left-4 lg:top-14 lg:bottom-4 lg:w-[320px] lg:z-20 pointer-events-auto flex flex-col min-h-0">
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                data-lenis-prevent
                className="h-auto lg:h-full min-h-0 lg:overflow-y-auto lg:overscroll-contain pr-1 pb-8 lg:pb-8 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] lg:[mask-image:linear-gradient(to_bottom,black_92%,transparent)]"
                style={scrollStyle}
              >
                {leftRail}
              </div>
            </div>
          </aside>

          {/* 4. Right Rail */}
          <aside className="p-4 lg:p-0 lg:absolute lg:right-4 lg:top-14 lg:bottom-4 lg:w-[340px] lg:z-20 pointer-events-auto flex flex-col min-h-0">
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                data-lenis-prevent
                className="h-auto lg:h-full min-h-0 lg:overflow-y-auto lg:overscroll-contain pr-1 pb-8 lg:pb-8 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] lg:[mask-image:linear-gradient(to_bottom,black_92%,transparent)]"
                style={scrollStyle}
              >
                {rightRail}
              </div>
            </div>
          </aside>
        </>
      )}

      {/* 5. Bottom Dock: view switching and sample route playback */}
      <div className="p-4 lg:p-0 lg:absolute lg:bottom-2 lg:inset-x-0 lg:z-20 pointer-events-none flex justify-center">
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

