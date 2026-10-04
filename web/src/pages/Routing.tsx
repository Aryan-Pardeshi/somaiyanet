import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/app/api";
import { Locked, RoleHeader, useRole } from "@/app/access";
import { BackendOffline } from "@/app/SqlDrawer";
import { Panel } from "@/components/cc/Panel";
import { HopRail } from "@/components/story/HopRail";
import { SqlRibbon } from "@/components/story/SqlRibbon";
import {
  OpsGlobe,
  type OpsGlobeHandle,
  type RouteHop,
} from "@/features/ops/OpsGlobe";
import type { ConstellationSat, Contact, Station } from "@/features/ops/api";
import {
  CGR_CTE_EXCERPT,
  findRoutes,
  formatBytes,
  formatLatency,
  isOperational,
  loadGlobeData,
  loadQueue,
  planRoute,
  txSeconds,
  type CgrRoute,
  type PlanHop,
  type QueueRow,
} from "@/features/routing/api";
import { DashedBar } from "@/features/routing/DashedBar";
import { SatIcon } from "@/features/routing/SatIcon";

function stateColor(state: string): string {
  switch (state) {
    case "NOMINAL":
      return "#7ee2b8";
    case "SAFE":
      return "#f5a524";
    case "CRITICAL":
      return "#ff3b4f";
    case "STOWED":
    case "DEPLOYED":
    case "COMMISSIONING":
    default:
      return "#4a5a8a";
  }
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function RefusedCard({ err }: { err: ApiError }) {
  return (
    <Panel
      cut={8}
      borderColor="#ff3b4f"
      glowColor="rgba(255, 59, 79, 0.25)"
      className="w-full"
    >
      <div className="p-3.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-[#ff3b4f]/40 bg-[#ff3b4f]/10 text-[#ff3b4f]">
            {err.sqlstate === "42501" ? "Permission denied by PostgreSQL (42501)" : "Critical refusal"}
          </span>
          <span className="font-mono text-[11px] text-[#ff3b4f]">
            {err.sqlstate ?? err.status}
          </span>
        </div>
        <p className="font-mono text-[12.5px] text-[#dfe6f5]">{err.message}</p>
        {err.detail && (
          <p className="font-mono text-[11px] text-[#8b96b0]">{err.detail}</p>
        )}
      </div>
    </Panel>
  );
}

const QUEUE_ORDER = ["TTC", "SSTV", "M17", "CODEC2"];
const QUEUE_COLORS: Record<string, string> = {
  TTC: "#7ee2b8",
  SSTV: "#3d5bff",
  M17: "#7fb2ff",
  CODEC2: "#f5a524",
};

function toIsoLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Routing() {
  const { can } = useRole();
  const canPlan = can("plan_route");
  const [sats, setSats] = useState<ConstellationSat[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [mock, setMock] = useState(false);
  const [offline, setOffline] = useState(false);

  const [origin, setOrigin] = useState("SAT-A1");
  const [t0Local, setT0Local] = useState(() => toIsoLocal(new Date()));
  const [size, setSize] = useState(4096);
  const [maxHops, setMaxHops] = useState(4);

  const [routes, setRoutes] = useState<CgrRoute[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hops, setHops] = useState<PlanHop[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const globeRef = useRef<OpsGlobeHandle>(null);

  const loadGlobe = useCallback(() => {
    loadGlobeData()
      .then((g) => {
        setSats(g.sats);
        setStations(g.stations);
        setContacts(g.contacts);
        setMock(g.mock);
        setOffline(false);
        const ops = g.sats.filter((s) => isOperational(s.state));
        if (ops.length > 0) {
          setOrigin((prev) =>
            ops.some((s) => s.node_id === prev) ? prev : ops[0].node_id,
          );
        }
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 0) setOffline(true);
        else if (e instanceof ApiError) setError(e);
      });
  }, []);

  useEffect(() => {
    loadGlobe();
  }, [loadGlobe]);

  useEffect(() => {
    if (!origin) return;
    loadQueue(origin)
      .then(setQueue)
      .catch(() => setQueue([]));
  }, [origin]);

  const t0Iso = (): string => {
    const d = new Date(t0Local);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

  const onFind = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setHops([]);
    try {
      const rows = await findRoutes(origin, t0Iso(), size, maxHops);
      setRoutes(rows);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else if (e instanceof ApiError) setError(e);
    } finally {
      setLoading(false);
    }
  };

  const onSelectRoute = async (rank: number): Promise<void> => {
    setSelected(rank);
    setPlanning(true);
    setError(null);
    try {
      const bundle = await planRoute(origin, t0Iso(), size);
      const hs = bundle.hops ?? [];
      setHops(hs);
      const rh: RouteHop[] = hs.map((h) => ({
        from_node: h.from_node,
        to_node: h.to_node,
        depart_ts: h.depart_ts,
        arrive_ts: h.arrive_ts,
        kind: h.contact_kind,
      }));
      window.setTimeout(() => globeRef.current?.playRoute(rh), 60);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setPlanning(false);
    }
  };

  const railNodes =
    hops.length > 0
      ? [hops[0].from_node, ...hops.map((h) => h.to_node)].map((id) => ({
          id,
          kind: (id.startsWith("GS-") ? "GROUND" : "SAT") as "SAT" | "GROUND",
        }))
      : [];

  const queueByMode = QUEUE_ORDER.map((m) => {
    const rows = queue.filter((q) => q.mode === m && q.status === "QUEUED");
    return {
      mode: m,
      packets: rows.reduce((a, r) => a + Number(r.packets), 0),
      bytes: rows.reduce((a, r) => a + Number(r.bytes), 0),
    };
  });
  const queueTotal = Math.max(1, queueByMode.reduce((a, r) => a + r.bytes, 0));

  const displaySats = sats.length > 0 ? sats : [];

  return (
    <div className="-m-4 p-4 sm:-m-6 sm:p-6 min-h-[calc(100vh-3.5rem)] bg-black text-[#dfe6f5] flex flex-col gap-5">
      {/* Page Title Row */}
      <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="font-sans text-[28px] sm:text-[34px] font-light tracking-tight text-white leading-tight">
              Route finder: how a packet hops between satellites to reach the ground
            </h1>
            <p className="text-[13px] text-[#8b96b0] leading-snug">
              Earliest arrival first. Satellites that are still stowed never relay.
            </p>
            <RoleHeader note="Routes are computed live by the recursive query cgr_routes()." />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-white/15 bg-white/5 text-[#8b96b0]">
              EXP 6 · CO3
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff]">
              RECURSIVE CTE
            </span>
          </div>
        </div>
      </div>

      {offline && (
        <div className="w-full">
          <BackendOffline onRetry={loadGlobe} />
        </div>
      )}

      {error !== null && (
        <div className="w-full">
          <RefusedCard err={error} />
        </div>
      )}

      {/* Main Console Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Control Panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Origin Satellite Picker */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Start from
                </span>
                <span className="font-mono text-[10px] text-[#8b96b0]">
                  {displaySats.filter((s) => isOperational(s.state)).length} ready
                </span>
              </div>

              {/* Scrollable list of chamfered chips/cards with SatIcon */}
              <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                {displaySats.map((s) => {
                  const isSel = origin === s.node_id;
                  const col = stateColor(s.state);
                  return (
                    <Panel
                      key={s.node_id}
                      cut={6}
                      selected={isSel}
                      onClick={() => setOrigin(s.node_id)}
                      className="w-full cursor-pointer transition-transform active:scale-[0.99]"
                      innerClassName="p-2 flex items-center gap-2.5"
                    >
                      <SatIcon
                        size={28}
                        color={isSel ? "#7fb2ff" : "#8b96b0"}
                        className={s.state === "SAFE" ? "motion-safe:animate-pulse" : ""}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[12px] font-semibold tracking-wide text-white truncate">
                            {s.display_name || s.node_id}
                          </span>
                          <span
                            className="font-mono text-[9px] uppercase tracking-[0.14em] px-1 py-0.2 border shrink-0"
                            style={{
                              color: col,
                              borderColor: `color-mix(in srgb, ${col} 40%, transparent)`,
                              backgroundColor: `color-mix(in srgb, ${col} 10%, transparent)`,
                            }}
                          >
                            {s.state}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#8b96b0]">
                          <span>
                            Plane {s.plane} · Slot {s.slot}
                          </span>
                          {s.battery_v !== null && <span>{s.battery_v.toFixed(1)}V</span>}
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Route Parameters Panel */}
          <Panel cut={8} className="w-full">
            <div className="p-4 flex flex-col gap-3.5">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Route settings
              </span>

              {/* Time Picker */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="route-start-time"
                  className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
                >
                  Start time
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="route-start-time"
                    type="datetime-local"
                    value={t0Local}
                    onChange={(e) => setT0Local(e.target.value)}
                    className="font-mono w-full bg-[#05070d] border border-white/10 px-2.5 py-1.5 text-[12px] text-[#dfe6f5] focus:border-[#3d5bff] focus:outline-none"
                  />
                  <button
                    onClick={() => setT0Local(toIsoLocal(new Date()))}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 border border-white/15 bg-transparent text-[#dfe6f5] hover:border-white/30 cursor-pointer"
                  >
                    NOW
                  </button>
                </div>
              </div>

              {/* Size Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#8b96b0] uppercase tracking-wider">
                    Data to send
                  </span>
                  <span className="text-white font-medium">
                    {formatBytes(size)} · ≈{txSeconds(size).toFixed(1)}s @9.6k
                  </span>
                </div>
                <input
                  type="range"
                  min={256}
                  max={122880}
                  step={256}
                  value={size}
                  aria-label="Data to send in bytes"
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full accent-[#3d5bff] cursor-pointer"
                />
              </div>

              {/* Max Hops Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#8b96b0] uppercase tracking-wider">
                    Most hops allowed
                  </span>
                  <span className="text-white font-medium">{maxHops} hops</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={maxHops}
                  aria-label="Most hops allowed"
                  onChange={(e) => setMaxHops(Number(e.target.value))}
                  className="w-full accent-[#3d5bff] cursor-pointer"
                />
              </div>

              {/* Find Routes Primary Button */}
              <button
                onClick={() => void onFind()}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#3d5bff] hover:bg-[#4f6bff] text-white font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#3d5bff]"
              >
                {loading ? "Finding routes…" : "Find routes"}
              </button>
            </div>
          </Panel>

          {/* Queue Buffer Panel */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Waiting data on {origin}
                </span>
                <span className="font-mono text-[10px] text-[#8b96b0]">
                  v_queue_by_mode
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {queueByMode.map((q) => (
                  <div key={q.mode} className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span style={{ color: QUEUE_COLORS[q.mode] }}>{q.mode}</span>
                      <span className="text-[#8b96b0]">
                        {q.packets} pkts · {formatBytes(q.bytes)}
                      </span>
                    </div>
                    <DashedBar
                      value={q.bytes}
                      max={queueTotal}
                      segments={20}
                      fillColor={QUEUE_COLORS[q.mode] ?? "#3d5bff"}
                    />
                  </div>
                ))}
              </div>
              <span className="font-mono text-[9px] text-[#5f6f93] uppercase tracking-wider pt-1 border-t border-white/5">
                Priority: TTC → SSTV → M17 → CODEC2
              </span>
            </div>
          </Panel>
        </div>

        {/* Centre / Right Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Globe Framed by Panel with HUD Corner Labels */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                <span>Orbit view, 525 km</span>
                <span>Showing: {origin}</span>
              </div>
              <div className="relative h-[380px] lg:h-[460px] w-full overflow-hidden border border-white/5 bg-black">
                {/* HUD corner lines */}
                <div className="pointer-events-none absolute left-2 top-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  Links between satellites, up to 2000 km
                </div>
                <div className="pointer-events-none absolute right-2 top-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  Live position tracking
                </div>
                <div className="pointer-events-none absolute left-2 bottom-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  Route preview
                </div>
                <div className="pointer-events-none absolute right-2 bottom-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  Orbit globe
                </div>

                <OpsGlobe
                  ref={globeRef}
                  sats={sats}
                  stations={stations}
                  contacts={contacts}
                  selectedId={origin}
                  onSelect={(id) => {
                    if (id) setOrigin(id);
                  }}
                  histories={{}}
                />
              </div>
              {mock && (
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#f5a524]">
                  <span className="inline-block size-1.5 bg-[#f5a524]" />
                  <span>MOCK ORBIT DATA · BACKEND OFFLINE</span>
                </div>
              )}
            </div>
          </Panel>

          {/* Ranked Routes */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Routes, earliest arrival first
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {routes.length} options
              </span>
            </div>

            {routes.length === 0 ? (
              <Panel cut={8} className="w-full">
                <div className="p-5 font-mono text-[12px] text-[#8b96b0] leading-relaxed">
                  No routes yet — pick a start satellite and press Find routes. Calls
                  GET /api/routing/routes → cgr_routes().
                </div>
              </Panel>
            ) : (
              <div className="flex flex-col gap-2.5">
                {routes.map((r) => {
                  const isSel = selected === r.rank;
                  const arrivalDate = new Date(r.arrival_ts);
                  const arrivalTimeStr = !Number.isNaN(arrivalDate.getTime())
                    ? arrivalDate.toISOString().replace("T", " ").replace("Z", " UTC")
                    : r.arrival_ts;

                  return (
                    <Panel
                      key={r.rank}
                      cut={8}
                      selected={isSel}
                      onClick={canPlan ? () => void onSelectRoute(r.rank) : undefined}
                      className={`w-full transition-transform active:scale-[0.99] ${canPlan ? "cursor-pointer" : ""}`}
                    >
                      <div className="p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                                isSel
                                  ? "bg-[#3d5bff] text-white border-[#3d5bff]"
                                  : "bg-white/5 text-[#dfe6f5] border-white/10"
                              }`}
                            >
                              Rank #{r.rank}
                            </span>
                            <span className="font-mono text-[13px] font-semibold text-white">
                              → {r.destination}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#8b96b0]">
                            {formatLatency(r.latency_s)} · {r.hops} hops
                          </div>
                        </div>

                        {/* Big light arrival time */}
                        <div className="flex flex-col">
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8b96b0]">
                            Earliest arrival
                          </span>
                          <div className="text-[26px] sm:text-[30px] font-light tracking-tight text-white leading-tight font-sans break-words">
                            {arrivalTimeStr}
                          </div>
                        </div>

                        {/* Weakest link as segmented bar */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-[#8b96b0] uppercase tracking-wider">
                              Weakest link on the route
                            </span>
                            <span className="text-[#dfe6f5] font-semibold tabular-nums">
                              {r.bottleneck_score}/100
                            </span>
                          </div>
                          <DashedBar
                            value={r.bottleneck_score}
                            max={100}
                            segments={24}
                            fillColor="#3d5bff"
                          />
                        </div>

                        {/* Route explanation */}
                        <div className="font-mono text-[11px] leading-relaxed text-[#8b96b0] pt-1 border-t border-white/5">
                          {r.explanation}
                        </div>

                        <div className="pt-1">
                          <Locked action="plan_route" onTry={() => void onSelectRoute(r.rank)}>
                            <button
                              type="button"
                              onClick={() => void onSelectRoute(r.rank)}
                              className="px-4 py-1.5 border border-white/15 bg-transparent hover:border-white/30 text-white font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer"
                            >
                              Save this route
                            </button>
                          </Locked>
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Route Hop Timeline */}
          {selected !== null && (
            <Panel cut={8} className="w-full">
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                    Hops on route #{selected}
                  </span>
                  {planning && (
                    <span className="font-mono text-[10px] text-[#f5a524] uppercase tracking-wider motion-safe:animate-pulse">
                      Saving route…
                    </span>
                  )}
                </div>

                {hops.length > 0 && (
                  <>
                    <HopRail nodes={railNodes} active={railNodes.length} className="my-1" />

                    <div className="flex flex-col gap-1.5">
                      {hops.map((h) => {
                        const isIsl = h.contact_kind === "ISL";
                        const badgeCol = isIsl ? "#3d5bff" : "#7ee2b8";
                        return (
                          <div
                            key={h.hop_no}
                            className="p-2.5 bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-[#8b96b0]">
                                Hop {two(h.hop_no)}
                              </span>
                              <span className="font-mono text-[12px] font-semibold text-white">
                                {h.from_node} → {h.to_node}
                              </span>
                              <span
                                className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border"
                                style={{
                                  color: badgeCol,
                                  borderColor: `color-mix(in srgb, ${badgeCol} 40%, transparent)`,
                                  backgroundColor: `color-mix(in srgb, ${badgeCol} 10%, transparent)`,
                                }}
                              >
                                {h.contact_kind}
                              </span>
                              <span className="font-mono text-[10px] text-[#8b96b0]">
                                Link score {h.link_score}
                              </span>
                            </div>

                            <div className="font-mono text-[11px] text-[#dfe6f5] flex items-center gap-2">
                              <span>
                                Leaves {new Date(h.depart_ts).toISOString().slice(11, 19)}Z
                              </span>
                              <span className="text-[#8b96b0]">→</span>
                              <span>
                                Arrives {new Date(h.arrive_ts).toISOString().slice(11, 19)}Z
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() =>
                          globeRef.current?.playRoute(
                            hops.map((h) => ({
                              from_node: h.from_node,
                              to_node: h.to_node,
                              depart_ts: h.depart_ts,
                              arrive_ts: h.arrive_ts,
                              kind: h.contact_kind,
                            })),
                          )
                        }
                        className="px-4 py-1.5 border border-white/15 bg-transparent hover:border-white/30 text-white font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer"
                      >
                        Replay hops
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Panel>
          )}

          {/* Why This Route Panel */}
          <Panel cut={8} className="w-full">
            <div className="p-4 flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Why this route?
              </span>
              <p className="font-sans text-[13px] leading-relaxed text-[#dfe6f5] max-w-[85ch]">
                The recursive query walks forward in time from the start time, always taking the
                earliest usable contact per neighbour (links only to working
                satellites), and keeps the ground row with the smallest arrival — hops
                break ties, weakest link score after that. Stowed satellites like SAT-B4
                are filtered out, so no relay ever hops through the pod.
              </p>
              <SqlRibbon
                sql={CGR_CTE_EXCERPT}
                caption="Abbreviated CTE — the exact call is in the SQL drawer."
                className="mt-2"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
