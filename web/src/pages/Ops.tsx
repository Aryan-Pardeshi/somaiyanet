// /ops page: Mission Operations Command Center (SpaceX-inspired console)
// Dark, cinematic mission console on pure black built around glowing night-lights Earth.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "@/app/access";
import { ApiError } from "@/app/api";
import { OpsGlobe, type OpsGlobeHandle, type RouteHop } from "@/features/ops/OpsGlobe";
import { useOpsData, type TelemetryEvent } from "@/features/ops/api";
import { TabButtons, TopBar } from "@/features/ops/cc/TopBar";
import { LiquidOverlay, type GlassSlab } from "@/features/ops/cc/LiquidOverlay";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { LeftRail } from "@/features/ops/cc/LeftRail";
import { RightRail } from "@/features/ops/cc/RightRail";
import { BottomDock } from "@/features/ops/cc/BottomDock";
import { RouteCard, type RouteHopCardData } from "@/features/ops/cc/RouteCard";
import { findRoutes, type CgrRoute } from "@/features/routing/api";
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

  interface RoutePlaybackState {
    origin: string;
    route: CgrRoute | null;
    hops: RouteHopCardData[];
    globeHops: RouteHop[];
    activeHopIndex: number;
    isCompleted: boolean;
    isLoading: boolean;
    isFallback: boolean;
    sqlError?: { sqlstate?: string; message: string } | null;
  }

  const [routeState, setRouteState] = useState<RoutePlaybackState | null>(null);

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

  const handleReplayRoute = (): void => {
    if (!routeState || routeState.globeHops.length === 0) return;
    setRouteState((prev) =>
      prev ? { ...prev, activeHopIndex: 0, isCompleted: false } : null,
    );
    globeRef.current?.playRoute(routeState.globeHops, {
      onHop: (hopIdx) => {
        setRouteState((prev) =>
          prev ? { ...prev, activeHopIndex: hopIdx } : null,
        );
      },
      onDone: () => {
        setRouteState((prev) =>
          prev ? { ...prev, isCompleted: true } : null,
        );
      },
    });
  };

  const handleCloseRoute = (): void => {
    setRouteState(null);
    globeRef.current?.clearRoute();
  };

  const handlePlayRoute = async (): Promise<void> => {
    if (routeState && !routeState.isLoading) {
      handleReplayRoute();
      return;
    }

    const selectedSat = selectedId
      ? data.sats.find((s) => s.node_id === selectedId)
      : null;
    const isFlying =
      selectedSat &&
      selectedSat.state !== "STOWED" &&
      /^SS-[1-3]$/.test(selectedSat.node_id);
    const origin = isFlying ? selectedSat.node_id : "SS-1";

    globeRef.current?.clearRoute();

    setRouteState({
      origin,
      route: null,
      hops: [],
      globeHops: [],
      activeHopIndex: 0,
      isCompleted: false,
      isLoading: true,
      isFallback: false,
      sqlError: null,
    });

    const t0 = new Date().toISOString();
    const t0Ms = Date.parse(t0);

    let route: CgrRoute | null = null;
    let isFallback = false;
    let sqlError: { sqlstate?: string; message: string } | null = null;

    try {
      const routes = await findRoutes(origin, t0, 41216, 4);
      if (routes && routes.length > 0) {
        const sorted = [...routes].sort((a, b) => a.rank - b.rank);
        route = sorted[0];
      } else {
        isFallback = true;
      }
    } catch (err) {
      isFallback = true;
      if (err instanceof ApiError) {
        sqlError = { sqlstate: err.sqlstate, message: err.message };
      } else if (err && typeof err === "object" && "message" in err) {
        sqlError = { message: String((err as { message: string }).message) };
      } else {
        sqlError = { message: "Database offline" };
      }
    }

    const cardHops: RouteHopCardData[] = [];
    const globeHops: RouteHop[] = [];

    if (!isFallback && route && route.path_nodes.length >= 2) {
      let prevArriveMs = t0Ms;
      for (let i = 0; i < route.path_nodes.length - 1; i++) {
        const fromNode = route.path_nodes[i];
        const toNode = route.path_nodes[i + 1];
        const contactId = route.path_contacts[i];
        const contact = data.contacts.find((c) => c.contact_id === contactId);

        let kind: "ISL" | "DOWNLINK" = toNode.startsWith("GS-")
          ? "DOWNLINK"
          : "ISL";
        let linkScore: number | null = null;
        let departRel = "n/a";
        let departTs: string | undefined = undefined;
        let arriveTs: string | undefined = undefined;

        if (contact) {
          kind = contact.kind;
          linkScore = contact.link_score;
          const cStartMs = Date.parse(contact.start_ts);
          const departMs = Math.max(prevArriveMs, cStartMs);
          const arriveMs = departMs;
          prevArriveMs = arriveMs;

          departTs = new Date(departMs).toISOString();
          arriveTs = new Date(arriveMs).toISOString();

          const deltaS = Math.round((departMs - t0Ms) / 1000);
          if (deltaS <= 0) {
            departRel = "now";
          } else {
            const mins = Math.round(deltaS / 60);
            departRel = mins === 0 ? "now" : `T+${String(mins).padStart(2, "0")} min`;
          }
        }

        cardHops.push({
          hopNo: i + 1,
          fromNode,
          toNode,
          kind,
          linkScore,
          departRel,
        });

        globeHops.push({
          from_node: fromNode,
          to_node: toNode,
          kind,
          depart_ts: departTs,
          arrive_ts: arriveTs,
          link_score: linkScore,
        });
      }
    } else {
      isFallback = true;
      let nextSat = origin === "SS-2" ? "SS-1" : "SS-2";
      let destStation = "GS-BOM";

      const islContact = data.contacts.find(
        (c) => c.from_node === origin && c.kind === "ISL",
      );
      if (islContact) nextSat = islContact.to_node;
      const dlContact = data.contacts.find(
        (c) => c.from_node === nextSat && c.kind === "DOWNLINK",
      );
      if (dlContact) destStation = dlContact.to_node;

      const hop1Contact =
        islContact ??
        data.contacts.find(
          (c) => c.from_node === origin && c.to_node === nextSat,
        );
      const hop2Contact =
        dlContact ??
        data.contacts.find(
          (c) => c.from_node === nextSat && c.to_node === destStation,
        );

      let prevArriveMs = t0Ms;
      const fallbackDefs: Array<{
        from: string;
        to: string;
        kind: "ISL" | "DOWNLINK";
        contact: typeof hop1Contact;
      }> = [
        { from: origin, to: nextSat, kind: "ISL", contact: hop1Contact },
        { from: nextSat, to: destStation, kind: "DOWNLINK", contact: hop2Contact },
      ];

      for (let i = 0; i < fallbackDefs.length; i++) {
        const def = fallbackDefs[i];
        let linkScore: number | null = null;
        let departRel = "n/a";
        let departTs: string | undefined = undefined;
        let arriveTs: string | undefined = undefined;

        if (def.contact) {
          linkScore = def.contact.link_score;
          const cStartMs = Date.parse(def.contact.start_ts);
          const departMs = Math.max(prevArriveMs, cStartMs);
          const arriveMs = departMs;
          prevArriveMs = arriveMs;
          departTs = new Date(departMs).toISOString();
          arriveTs = new Date(arriveMs).toISOString();
          const deltaS = Math.round((departMs - t0Ms) / 1000);
          departRel =
            deltaS <= 0
              ? "now"
              : `T+${String(Math.round(deltaS / 60)).padStart(2, "0")} min`;
        }

        cardHops.push({
          hopNo: i + 1,
          fromNode: def.from,
          toNode: def.to,
          kind: def.kind,
          linkScore,
          departRel,
        });

        globeHops.push({
          from_node: def.from,
          to_node: def.to,
          kind: def.kind,
          depart_ts: departTs,
          arrive_ts: arriveTs,
          link_score: linkScore,
        });
      }

      const knownScores = cardHops
        .map((h) => h.linkScore)
        .filter((s): s is number => s !== null);
      const bottleneck = knownScores.length > 0 ? Math.min(...knownScores) : 43;
      const latencyS = Math.max(1, Math.round((prevArriveMs - t0Ms) / 1000));

      route = {
        rank: 1,
        destination: destStation,
        arrival_ts: new Date(prevArriveMs).toISOString(),
        hops: cardHops.length,
        bottleneck_score: bottleneck,
        latency_s: latencyS > 1 ? latencyS : 1527,
        path_nodes: [origin, nextSat, destStation],
        path_contacts: [
          hop1Contact?.contact_id ?? 0,
          hop2Contact?.contact_id ?? 0,
        ],
        explanation: "Sample route fallback",
      };
    }

    setRouteState({
      origin,
      route,
      hops: cardHops,
      globeHops,
      activeHopIndex: 0,
      isCompleted: false,
      isLoading: false,
      isFallback,
      sqlError,
    });

    globeRef.current?.playRoute(globeHops, {
      onHop: (hopIdx) => {
        setRouteState((prev) =>
          prev ? { ...prev, activeHopIndex: hopIdx } : null,
        );
      },
      onDone: () => {
        setRouteState((prev) =>
          prev ? { ...prev, isCompleted: true } : null,
        );
      },
    });
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

      {/* 5. Bottom Dock: view switching and packet route playback */}
      <div className="p-4 lg:p-0 lg:absolute lg:bottom-2 lg:inset-x-0 lg:z-20 pointer-events-none flex justify-center">
        <BottomDock
          currentView={currentView}
          onViewChange={handleViewChange}
          mock={data.mock}
          onDemoRoute={handlePlayRoute}
          hasActiveRoute={routeState !== null}
        />
      </div>

      {/* 6. Route Card floating above BottomDock */}
      {routeState && (
        <div className="fixed sm:absolute bottom-20 inset-x-0 mx-auto w-[calc(100%-32px)] max-w-[480px] z-30 pointer-events-auto">
          <RouteCard
            origin={routeState.origin}
            route={routeState.route}
            hops={routeState.hops}
            activeHopIndex={routeState.activeHopIndex}
            isCompleted={routeState.isCompleted}
            isLoading={routeState.isLoading}
            isFallback={routeState.isFallback}
            sqlError={routeState.sqlError}
            stations={data.stations}
            onReplay={handleReplayRoute}
            onClose={handleCloseRoute}
          />
        </div>
      )}
    </div>
  );
}

