import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/app/api";
import { BackendOffline } from "@/app/SqlDrawer";
import { ChapterLabel } from "@/components/story/ChapterLabel";
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

function ExpCo({ exp, co }: { exp: string; co: string }) {
  return (
    <span className="font-mono rounded-full bg-[var(--somaiya-soft)] px-2 py-0.5 text-[10px] tracking-[0.08em] text-[var(--cream)]">
      {exp} · {co}
    </span>
  );
}

function RefusedCard({ err }: { err: ApiError }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--somaiya)] bg-[var(--ink-2)] p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--somaiya)]">
        PostgreSQL refused · {err.sqlstate ?? err.status}
      </p>
      <p className="mt-2 text-[13px] text-[var(--cream)]">{err.message}</p>
    </div>
  );
}

const QUEUE_ORDER = ["TTC", "SSTV", "M17", "CODEC2"];
const QUEUE_COLORS: Record<string, string> = {
  TTC: "var(--signal)",
  SSTV: "var(--somaiya)",
  M17: "var(--sky)",
  CODEC2: "var(--amber)",
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
    // origin is intentionally read once here; the select owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Let the globe mount the new hops before animating.
      window.setTimeout(() => globeRef.current?.playRoute(rh), 60);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setPlanning(false);
    }
  };

  const railNodes = hops.length > 0
    ? [hops[0].from_node, ...hops.map((h) => h.to_node)].map((id) => ({
      id,
      kind: (id.startsWith("GS-") ? "GROUND" : "SAT") as "SAT" | "GROUND",
    }))
    : [];

  const queueByMode = QUEUE_ORDER.map((m) => {
    const rows = queue.filter((q) => q.mode === m);
    return {
      mode: m,
      packets: rows.reduce((a, r) => a + Number(r.packets), 0),
      bytes: rows.reduce((a, r) => a + Number(r.bytes), 0),
    };
  });
  const queueTotal = Math.max(1, queueByMode.reduce((a, r) => a + r.bytes, 0));

  const ops = sats.filter((s) => isOperational(s.state));

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <main className="shell py-10">
        <ChapterLabel index="ROUTING" title="Contact Graph" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Contact Graph Routing explorer
          </h1>
          <ExpCo exp="Exp 6" co="CO3" />
        </div>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--cream-dim)]">
          Earliest-arrival routes through the ISL mesh, then down. STOWED sats
          never relay.
        </p>

        {offline && (
          <div className="mt-6">
            <BackendOffline onRetry={loadGlobe} />
          </div>
        )}
        {error !== null && (
          <div className="mt-6">
            <RefusedCard err={error} />
          </div>
        )}

        {/* Controls */}
        <section className="mt-6 grid gap-3 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
              origin sat
            </span>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-2 text-[13px] text-[var(--cream)]"
            >
              {(ops.length > 0 ? ops : sats).map((s) => (
                <option key={s.node_id} value={s.node_id}>
                  {s.node_id} · {s.state}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
              time t0
            </span>
            <span className="flex gap-1.5">
              <input
                type="datetime-local"
                value={t0Local}
                onChange={(e) => setT0Local(e.target.value)}
                className="font-mono w-full rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-2 text-[13px] text-[var(--cream)]"
              />
              <button
                onClick={() => setT0Local(toIsoLocal(new Date()))}
                className="font-mono shrink-0 rounded-lg border border-[var(--rule)] px-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
              >
                now
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
              size · {formatBytes(size)} · ≈{txSeconds(size).toFixed(1)}s @9600bps
            </span>
            <input
              type="range"
              min={256}
              max={122880}
              step={256}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-[#d7263d]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
              max hops · {maxHops}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={maxHops}
              onChange={(e) => setMaxHops(Number(e.target.value))}
              className="w-full accent-[#d7263d]"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => void onFind()}
              disabled={loading}
              className="font-mono w-full rounded-full bg-[var(--somaiya)] px-4 py-2.5 text-[12px] uppercase tracking-[0.14em] text-white hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? "routing…" : "Find routes"}
            </button>
          </div>
        </section>

        {/* Results + globe */}
        <section className="mt-6 flex flex-col gap-6 lg:flex-row">
          <div className="w-full lg:w-[45%]">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
              routes · earliest arrival wins
            </h2>
            {routes.length === 0 ? (
              <p className="font-mono mt-3 rounded-xl border border-dashed border-[var(--rule)] p-5 text-[12px] leading-relaxed text-[var(--mute)]">
                No routes yet — pick an origin and press Find routes. Calls
                GET /api/routing/routes → cgr_routes().
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {routes.map((r) => (
                  <li key={r.rank}>
                    <button
                      onClick={() => void onSelectRoute(r.rank)}
                      aria-pressed={selected === r.rank}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        selected === r.rank
                          ? "border-[var(--somaiya)] bg-[var(--somaiya-soft)]"
                          : "border-[var(--rule)] bg-[var(--ink-2)] hover:border-[var(--somaiya)]/60"
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono rounded-full bg-[var(--somaiya)] px-2 py-0.5 text-[11px] text-white">
                          #{r.rank}
                        </span>
                        <span className="font-mono text-[13px] text-[var(--cream)]">
                          → {r.destination}
                        </span>
                        <span className="font-mono ml-auto text-[11px] text-[var(--cream-dim)]">
                          {formatLatency(r.latency_s)} · {r.hops} hops
                        </span>
                      </span>
                      <span className="font-mono mt-1.5 block text-[11px] text-[var(--amber)]">
                        {new Date(r.arrival_ts).toISOString().replace("T", " ").replace("Z", " UTC")}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[var(--mute)]">
                          bottleneck {r.bottleneck_score}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ink)]">
                          <span
                            className="block h-full rounded-full bg-[var(--somaiya)]"
                            style={{ width: `${r.bottleneck_score}%` }}
                          />
                        </span>
                      </span>
                      <span className="font-mono mt-1.5 block text-[11px] leading-relaxed text-[var(--cream-dim)]">
                        {r.explanation}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected !== null && (
              <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
                <span className="flex items-center gap-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
                    hops · POST /api/routing/plan
                  </h3>
                  {planning && (
                    <span className="font-mono text-[10px] text-[var(--amber)]">
                      persisting…
                    </span>
                  )}
                </span>
                {hops.length > 0 && (
                  <>
                    <HopRail nodes={railNodes} active={railNodes.length} className="mt-3" />
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {hops.map((h) => (
                        <li
                          key={h.hop_no}
                          className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-3 py-2 text-[11px] leading-relaxed text-[var(--cream-dim)]"
                        >
                          <span className="text-[var(--cream)]">
                            {h.from_node} → {h.to_node}
                          </span>{" "}
                          <span
                            className={
                              h.contact_kind === "ISL"
                                ? "text-[var(--sky)]"
                                : "text-[var(--signal)]"
                            }
                          >
                            {h.contact_kind} {h.link_score}
                          </span>
                          <br />
                          ↑ {new Date(h.depart_ts).toISOString().slice(11, 19)}Z
                          {"  "}↓ {new Date(h.arrive_ts).toISOString().slice(11, 19)}Z
                        </li>
                      ))}
                    </ul>
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
                      className="font-mono mt-3 rounded-full border border-[var(--somaiya)]/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--cream)] hover:bg-[var(--somaiya-soft)]"
                    >
                      Replay
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Queue panel */}
            <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
                queue · {origin} · v_queue_by_mode
              </h3>
              <div className="mt-3 flex flex-col gap-2">
                {queueByMode.map((q) => (
                  <div key={q.mode}>
                    <span className="font-mono flex justify-between text-[11px]">
                      <span style={{ color: QUEUE_COLORS[q.mode] }}>{q.mode}</span>
                      <span className="text-[var(--cream-dim)]">
                        {q.packets} pkts · {formatBytes(q.bytes)}
                      </span>
                    </span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[var(--ink)]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(q.bytes / queueTotal) * 100}%`,
                          background: QUEUE_COLORS[q.mode],
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <p className="font-mono mt-2 text-[10px] text-[var(--mute)]">
                priority TTC → SSTV → M17 → CODEC2
              </p>
            </div>
          </div>

          {/* Globe */}
          <div className="w-full lg:w-[55%]">
            <div className="h-[420px] overflow-hidden rounded-xl border border-[var(--rule)] lg:h-[560px]">
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
              <p className="font-mono mt-2 text-[11px] text-[var(--amber)]">
                mock orbit data · backend offline
              </p>
            )}
          </div>
        </section>

        {/* Why this route */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
            why this route?
          </h2>
          <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--cream-dim)]">
            The recursive CTE walks forward in time from t0, always taking the
            earliest usable contact per neighbour (ISL only to operational
            sats), and keeps the ground row with the smallest arrival — hops
            break ties, bottleneck score after that. STOWED sats like SAT-B4
            are filtered out, so no relay ever hops through the pod.
          </p>
          <SqlRibbon
            sql={CGR_CTE_EXCERPT}
            caption="Abbreviated CTE — the exact call is in the SQL drawer."
            className="mt-3"
          />
        </section>
      </main>
    </div>
  );
}

