import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/app/api";
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
            CRITICAL REFUSAL
          </span>
          <span className="font-mono text-[11px] text-[#ff3b4f]">
            {err.sqlstate ?? err.status}
          </span>
        </div>
        <p className="font-sans text-[13px] text-[#dfe6f5]">{err.message}</p>
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
        if (ops.length > 0 && !ops.some((s) => s.node_id === origin)) {
          setOrigin(ops[0].node_id);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 0) setOffline(true);
        else if (e instanceof ApiError) setError(e);
      });
  }, [origin]);

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
    <div className="-m-6 p-6 min-h-[calc(100vh-3.5rem)] bg-black text-[#dfe6f5] flex flex-col gap-5">
      {/* Page Title Row */}
      <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="font-sans text-[28px] sm:text-[34px] font-light tracking-tight text-white leading-tight">
              Contact Graph Routing explorer
            </h1>
            <p className="text-[13px] text-[#8b96b0] leading-snug">
              Earliest-arrival routes through the ISL mesh, then down. STOWED sats never relay.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-white/15 bg-white/5 text-[#8b96b0]">
              EXP 6 · CO3
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff]">
              LEO CGR v2.4
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
                  Origin satellite
                </span>
                <span className="font-mono text-[10px] text-[#8b96b0]">
                  {displaySats.filter((s) => isOperational(s.state)).length} OPERATIONAL
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
                        className={s.state === "SAFE" ? "animate-pulse" : ""}
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
                Route parameters
              </span>

              {/* Time Picker */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Time t0
                </span>
                <div className="flex gap-1.5">
                  <input
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
                    Bundle size
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
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full accent-[#3d5bff] cursor-pointer"
                />
              </div>

              {/* Max Hops Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#8b96b0] uppercase tracking-wider">
                    Max hops
                  </span>
                  <span className="text-white font-medium">{maxHops} HOPS</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={maxHops}
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
                {loading ? "ROUTING…" : "FIND ROUTES"}
              </button>
            </div>
          </Panel>

          {/* Queue Buffer Panel */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Queue buffer // {origin}
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
                <span>ORBIT VIEW // SSO 525 KM</span>
                <span>ACTIVE ASSET: {origin}</span>
              </div>
              <div className="relative h-[380px] lg:h-[460px] w-full overflow-hidden border border-white/5 bg-black">
                {/* HUD corner lines */}
                <div className="pointer-events-none absolute left-2 top-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  ┌ ISL MESH // RANGE ≤ 2000 KM
                </div>
                <div className="pointer-events-none absolute right-2 top-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  LAT/LON TRACKING // AUTO ┐
                </div>
                <div className="pointer-events-none absolute left-2 bottom-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  └ CGR GRAPH WALKER
                </div>
                <div className="pointer-events-none absolute right-2 bottom-2 z-10 font-mono text-[9px] text-[#8b96b0]/70">
                  OPSGLOBE // WebGL ┘
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
                Ranked routes // Earliest arrival wins
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {routes.length} CANDIDATES
              </span>
            </div>

            {routes.length === 0 ? (
              <Panel cut={8} className="w-full">
                <div className="p-5 font-mono text-[12px] text-[#8b96b0] leading-relaxed">
                  No routes yet — pick an origin satellite and press FIND ROUTES. Calls
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
                      onClick={() => void onSelectRoute(r.rank)}
                      className="w-full cursor-pointer transition-transform active:scale-[0.99]"
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
                              RANK #{r.rank}
                            </span>
                            <span className="font-mono text-[13px] font-semibold text-white">
                              → {r.destination}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#8b96b0]">
                            {formatLatency(r.latency_s)} · {r.hops} HOPS
                          </div>
                        </div>

                        {/* Big light arrival time */}
                        <div className="flex flex-col">
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8b96b0]">
                            Earliest Arrival
                          </span>
                          <div className="text-[26px] sm:text-[30px] font-light tracking-tight text-white leading-tight font-sans">
                            {arrivalTimeStr}
                          </div>
                        </div>

                        {/* Bottleneck Link Score as segmented bar */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-[#8b96b0] uppercase tracking-wider">
                              Bottleneck Link Score
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
                    Hop timeline // Route #{selected}
                  </span>
                  {planning && (
                    <span className="font-mono text-[10px] text-[#f5a524] uppercase tracking-wider animate-pulse">
                      Persisting plan…
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
                                HOP {two(h.hop_no)}
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
                                SCORE {h.link_score}
                              </span>
                            </div>

                            <div className="font-mono text-[11px] text-[#dfe6f5] flex items-center gap-2">
                              <span>
                                DEP {new Date(h.depart_ts).toISOString().slice(11, 19)}Z
                              </span>
                              <span className="text-[#8b96b0]">→</span>
                              <span>
                                ARR {new Date(h.arrive_ts).toISOString().slice(11, 19)}Z
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
                        REPLAY TRAJECTORY
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
                Why this route? // Recursive contact graph algorithm
              </span>
              <p className="font-sans text-[13px] leading-relaxed text-[#dfe6f5] max-w-[85ch]">
                The recursive CTE walks forward in time from t0, always taking the
                earliest usable contact per neighbour (ISL only to operational
                sats), and keeps the ground row with the smallest arrival — hops
                break ties, bottleneck score after that. STOWED sats like SAT-B4
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
