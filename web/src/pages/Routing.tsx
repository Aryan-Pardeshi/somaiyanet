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
      return "var(--sx-green)";
    case "SAFE":
      return "var(--sx-orange)";
    case "CRITICAL":
      return "var(--sx-red)";
    default:
      return "rgba(255, 255, 255, 0.35)";
  }
}

function stateTone(state: string): "ok" | "warn" | "critical" | undefined {
  switch (state) {
    case "NOMINAL":
      return "ok";
    case "SAFE":
      return "warn";
    case "CRITICAL":
      return "critical";
    default:
      return undefined;
  }
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function RefusedCard({ err }: { err: ApiError }) {
  return (
    <Panel className="w-full">
      <div className="p-3.5 flex flex-col gap-1.5">
        <span
          className="sx-status"
          data-tone="critical"
        >
          {err.sqlstate === "42501"
            ? "Permission denied by PostgreSQL (42501)"
            : "Critical refusal"}{" "}
          · <span className="sx-num">{err.sqlstate ?? err.status}</span>
        </span>
        <p className="sx-body text-white">{err.message}</p>
        {err.detail && <p className="sx-caption">{err.detail}</p>}
      </div>
    </Panel>
  );
}

const QUEUE_ORDER = ["TTC", "SSTV", "M17", "CODEC2"];
const QUEUE_COLORS: Record<string, string> = {
  TTC: "#ffffff",
  SSTV: "rgba(255, 255, 255, 0.7)",
  M17: "rgba(255, 255, 255, 0.45)",
  CODEC2: "rgba(255, 255, 255, 0.3)",
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

  const [origin, setOrigin] = useState("SS-1");
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
  const readyCount = displaySats.filter((s) => isOperational(s.state)).length;

  return (
    <div className="-m-4 p-4 sm:-m-6 sm:p-6 min-h-[calc(100vh-3.5rem)] bg-black text-white flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="sx-h1">Routing</h1>
        <p className="sx-lead">
          A packet&apos;s route, found by the recursive{" "}
          <span className="font-mono">cgr_routes()</span> query.
        </p>
        <RoleHeader note="Routes are computed live by the recursive query cgr_routes()." />
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Panel className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="sx-eyebrow">Start from</span>
                <span className="sx-caption">
                  <span className="sx-num">{readyCount}</span> ready
                </span>
              </div>

              <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                {displaySats.map((s) => {
                  const isSel = origin === s.node_id;
                  const tone = stateTone(s.state);
                  return (
                    <Panel
                      key={s.node_id}
                      selected={isSel}
                      onClick={() => setOrigin(s.node_id)}
                      className="w-full cursor-pointer active:scale-[0.99]"
                      innerClassName="p-2 flex items-center gap-2.5"
                    >
                      <SatIcon
                        size={20}
                        color={isSel ? "#ffffff" : "rgba(255,255,255,0.55)"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="sx-body text-white truncate">
                            {s.display_name || s.node_id}
                          </span>
                          <span
                            className="sx-status shrink-0"
                            {...(tone ? { "data-tone": tone } : {})}
                          >
                            {s.state.charAt(0) + s.state.slice(1).toLowerCase()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between sx-caption">
                          <span>
                            Plane {s.plane} · Slot {s.slot}
                          </span>
                          {s.battery_v !== null && (
                            <span className="sx-num">
                              {s.battery_v.toFixed(1)}V
                            </span>
                          )}
                        </div>
                        <span
                          aria-hidden="true"
                          className="mt-1 block size-1.5 rounded-full"
                          style={{ backgroundColor: stateColor(s.state) }}
                        />
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel className="w-full">
            <div className="p-4 flex flex-col gap-3.5">
              <span className="sx-eyebrow">Route settings</span>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="route-start-time" className="sx-caption">
                  Start time
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="route-start-time"
                    type="datetime-local"
                    value={t0Local}
                    onChange={(e) => setT0Local(e.target.value)}
                    className="w-full bg-[#111113] border border-[var(--sx-hairline)] rounded-[10px] min-h-[44px] px-2.5 text-[13px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  />
                  <button
                    type="button"
                    onClick={() => setT0Local(toIsoLocal(new Date()))}
                    className="sx-btn sx-btn--quiet sx-btn--sm shrink-0 min-h-[44px]"
                  >
                    Now
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="sx-caption">Data to send</span>
                  <span className="sx-caption">
                    <span className="sx-num text-white">{formatBytes(size)}</span>{" "}
                    · ≈<span className="sx-num">{txSeconds(size).toFixed(1)}s</span>{" "}
                    @9.6k
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
                  className="w-full accent-white cursor-pointer min-h-[44px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="sx-caption">Most hops allowed</span>
                  <span className="sx-num text-white">{maxHops} hops</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={maxHops}
                  aria-label="Most hops allowed"
                  onChange={(e) => setMaxHops(Number(e.target.value))}
                  className="w-full accent-white cursor-pointer min-h-[44px]"
                />
              </div>

              <button
                type="button"
                onClick={() => void onFind()}
                disabled={loading}
                className="sx-btn sx-btn--filled w-full"
              >
                {loading ? "Finding routes…" : "Find routes"}
              </button>
            </div>
          </Panel>

          <Panel className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="sx-eyebrow">Waiting data on {origin}</span>
                <span className="font-mono text-[11px] text-white/40">
                  v_queue_by_mode
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {queueByMode.map((q) => (
                  <div key={q.mode} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[13px]">
                      <span className="sx-body text-white">{q.mode}</span>
                      <span className="sx-caption">
                        <span className="sx-num">{q.packets}</span> pkts ·{" "}
                        {formatBytes(q.bytes)}
                      </span>
                    </div>
                    <DashedBar
                      value={q.bytes}
                      max={queueTotal}
                      segments={20}
                      fillColor={QUEUE_COLORS[q.mode] ?? "rgba(255,255,255,0.7)"}
                    />
                  </div>
                ))}
              </div>
              <span className="sx-caption pt-1">Priority: TTC → SSTV → M17 → CODEC2</span>
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-4">
          <Panel className="w-full">
            <div className="p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="sx-eyebrow">Orbit view · 525 km</span>
                <span className="sx-caption">Showing {origin}</span>
              </div>
              <div className="relative h-[380px] lg:h-[460px] w-full overflow-hidden bg-black rounded-[10px]">
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
                <span className="sx-status" data-tone="warn">
                  Mock orbit data · backend offline
                </span>
              )}
            </div>
          </Panel>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="sx-eyebrow">Routes, earliest first</span>
              <span className="sx-caption">
                <span className="sx-num">{routes.length}</span> options
              </span>
            </div>

            {routes.length === 0 ? (
              <Panel className="w-full">
                <div className="p-5 flex flex-col gap-1">
                  <p className="sx-body">
                    No routes yet — pick a start satellite and press Find routes.
                  </p>
                  <p className="sx-caption">
                    Calls <span className="font-mono">GET /api/routing/routes</span> →{" "}
                    <span className="font-mono">cgr_routes()</span>.
                  </p>
                </div>
              </Panel>
            ) : (
              <div className="sx-group" role="list">
                {routes.map((r) => {
                  const isSel = selected === r.rank;
                  const arrivalDate = new Date(r.arrival_ts);
                  const arrivalTimeStr = !Number.isNaN(arrivalDate.getTime())
                    ? arrivalDate.toISOString().replace("T", " ").replace("Z", " UTC")
                    : r.arrival_ts;
                  const summary = `#${r.rank} → ${r.destination} · ${r.hops} hops · ${formatLatency(r.latency_s)}`;
                  const row = (
                    <>
                      <span className="sx-body text-white min-w-0">
                        {summary}
                        <span className="sx-caption block truncate">
                          {r.explanation}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="sx-num text-[13px] text-white">
                          {arrivalTimeStr}
                        </span>
                        {isSel && (
                          <span className="sx-status" data-tone="ok">
                            Chosen
                          </span>
                        )}
                      </span>
                    </>
                  );
                  return canPlan ? (
                    <button
                      key={r.rank}
                      type="button"
                      role="listitem"
                      onClick={() => void onSelectRoute(r.rank)}
                      aria-pressed={isSel}
                      className="sx-row w-full text-left min-h-[52px] cursor-pointer"
                      style={
                        isSel
                          ? { backgroundColor: "var(--sx-surface-2)" }
                          : undefined
                      }
                    >
                      {row}
                    </button>
                  ) : (
                    <div
                      key={r.rank}
                      role="listitem"
                      className="sx-row min-h-[52px]"
                      style={
                        isSel
                          ? { backgroundColor: "var(--sx-surface-2)" }
                          : undefined
                      }
                    >
                      {row}
                    </div>
                  );
                })}
              </div>
            )}
            {!canPlan && routes.length > 0 && (
              <Locked
                action="plan_route"
                onTry={() => void onSelectRoute(routes[0].rank)}
              >
                <span className="sx-caption">
                  Saving a route needs the plan_route grant.
                </span>
              </Locked>
            )}
          </div>

          {selected !== null && (
            <Panel className="w-full">
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="sx-eyebrow">Hops on route #{selected}</span>
                  {planning && (
                    <span className="sx-status" data-tone="warn">
                      Saving route…
                    </span>
                  )}
                </div>

                {hops.length > 0 && (
                  <>
                    <HopRail nodes={railNodes} active={railNodes.length} className="my-1" />

                    <div className="sx-group">
                      {hops.map((h) => (
                        <div
                          key={h.hop_no}
                          className="sx-row !items-start sm:!items-center flex-col sm:flex-row sm:justify-between"
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                            <span className="sx-caption">Hop {two(h.hop_no)}</span>
                            <span className="font-mono text-[12px] text-white">
                              {h.from_node} → {h.to_node}
                            </span>
                            <span className="sx-status">
                              {h.contact_kind} ·{" "}
                              <span className="sx-num">{h.link_score}</span>
                            </span>
                          </div>
                          <div className="sx-caption shrink-0">
                            Leaves{" "}
                            <span className="sx-num">
                              {new Date(h.depart_ts).toISOString().slice(11, 19)}Z
                            </span>{" "}
                            → Arrives{" "}
                            <span className="sx-num">
                              {new Date(h.arrive_ts).toISOString().slice(11, 19)}Z
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
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
                        className="sx-btn sx-btn--sm"
                      >
                        Replay hops
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Panel>
          )}

          <Panel className="w-full">
            <div className="p-4 flex flex-col gap-2.5">
              <span className="sx-eyebrow">Why this route</span>
              <p className="sx-body max-w-[85ch]">
                The query walks forward in time from the start, always taking the
                earliest usable contact to each neighbour, and keeps the ground
                row with the smallest arrival. Stowed satellites never relay.
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
