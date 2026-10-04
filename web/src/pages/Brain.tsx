import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/app/api";
import { BackendOffline } from "@/app/SqlDrawer";
import { ChapterLabel } from "@/components/story/ChapterLabel";
import {
  ACTION_COLORS,
  DEFAULT_WHATIF,
  FEATURE_KEYS,
  OVERRIDE_PRESET,
  loadDecisions,
  loadModels,
  loadPreview,
  loadTree,
  postWhatIf,
  recordDecision,
  walkPath,
  type AiModel,
  type DecisionRow,
  type DtNode,
  type Features,
  type PreviewData,
  type RouterAction,
  type WhatIfData,
} from "@/features/brain/api";
import { TreeSvg } from "@/features/brain/TreeSvg";

const SATS = ["SAT-A1", "SAT-A2", "SAT-A3", "SAT-A4", "SAT-B1", "SAT-B2", "SAT-B3"];

function ExpCo({ exp, co }: { exp: string; co: string }) {
  return (
    <span className="font-mono rounded-full bg-[var(--somaiya-soft)] px-2 py-0.5 text-[10px] tracking-[0.08em] text-[var(--cream)]">
      {exp} · {co}
    </span>
  );
}

function RefusedCard({ err, context }: { err: ApiError; context?: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--somaiya)] bg-[var(--ink-2)] p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--somaiya)]">
        PostgreSQL refused · {err.sqlstate ?? err.status}
        {context ? ` · ${context}` : ""}
      </p>
      <p className="mt-2 text-[13px] text-[var(--cream)]">{err.message}</p>
      {err.detail && (
        <p className="font-mono mt-1 text-[11px] text-[var(--cream-dim)]">{err.detail}</p>
      )}
    </div>
  );
}

function ActionCard({
  title,
  action,
  extra,
  accent,
}: {
  title: string;
  action: RouterAction | null;
  extra?: string | null;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-[var(--ink)] p-4 ${
        accent ? "border-[var(--somaiya)]" : "border-[var(--rule)]"
      }`}
      style={accent ? { boxShadow: "0 0 18px #d7263d44" } : undefined}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
        {title}
      </p>
      <p
        className="font-mono mt-2 text-[15px] font-medium"
        style={{ color: action ? ACTION_COLORS[action] : "var(--mute)" }}
      >
        {action ?? "—"}
      </p>
      {extra !== undefined && extra !== null && extra !== "" && (
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--cream-dim)]">{extra}</p>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono flex justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--mute)]">
        <span>{label}</span>
        <span className="text-[var(--amber)]">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#d7263d]"
      />
    </label>
  );
}

export default function Brain() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tree, setTree] = useState<DtNode[]>([]);
  const [sat, setSat] = useState("SAT-A1");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [whatif, setWhatif] = useState<WhatIfData | null>(null);
  const [wi, setWi] = useState<Features>({ ...DEFAULT_WHATIF });
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [decideError, setDecideError] = useState<ApiError | null>(null);
  const [decideOk, setDecideOk] = useState<string | null>(null);
  const wiTimer = useRef<number | null>(null);

  const active = models.find((m) => m.model_id === activeId) ?? models.find((m) => m.is_active) ?? models[0] ?? null;

  const boot = useCallback(() => {
    loadModels()
      .then((ms) => {
        setModels(ms);
        const act = ms.find((m) => m.is_active) ?? ms[0];
        if (act) setActiveId(act.model_id);
        setOffline(false);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 0) setOffline(true);
        else if (e instanceof ApiError) setError(e);
      });
    loadDecisions()
      .then(setDecisions)
      .catch(() => setDecisions([]));
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (activeId === null) return;
    loadTree(activeId)
      .then(setTree)
      .catch(() => setTree([]));
  }, [activeId]);

  useEffect(() => {
    loadPreview(sat)
      .then((p) => {
        setPreview(p);
        if (p.features) setWi((prev) => ({ ...prev, ...p.features }));
      })
      .catch(() => setPreview(null));
  }, [sat, activeId]);

  // Live decision feed from the simulator.
  useEffect(() => {
    let src: EventSource | null = null;
    try {
      src = new EventSource("/api/stream");
      src.addEventListener("decision", (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data) as DecisionRow;
          setDecisions((prev) => [d, ...prev].slice(0, 50));
        } catch {
          // Malformed frame: keep the stream open.
        }
      });
    } catch {
      src = null;
    }
    return () => src?.close();
  }, []);

  const runWhatIf = useCallback((f: Features, modelId: number | null) => {
    postWhatIf(f, modelId)
      .then(setWhatif)
      .catch(() => setWhatif(null));
  }, []);

  useEffect(() => {
    if (wiTimer.current !== null) window.clearTimeout(wiTimer.current);
    wiTimer.current = window.setTimeout(() => runWhatIf(wi, activeId), 250);
    return () => {
      if (wiTimer.current !== null) window.clearTimeout(wiTimer.current);
    };
  }, [wi, activeId, runWhatIf]);

  const liveFeatures: Features = useMemo(
    () => ({ ...wi }),
    [wi],
  );
  const pathIds = useMemo(
    () => (tree.length > 0 ? walkPath(tree, liveFeatures) : []),
    [tree, liveFeatures],
  );

  const onRecord = async (): Promise<void> => {
    setDecideError(null);
    setDecideOk(null);
    try {
      const row = await recordDecision(sat);
      setDecideOk(`decision #${row.decision_id} recorded → ${row.final_action}`);
      const ds = await loadDecisions().catch(() => null);
      if (ds) setDecisions(ds);
    } catch (e) {
      // Button stays enabled for the analyst: the 403 refusal IS the demo.
      if (e instanceof ApiError) setDecideError(e);
    }
  };

  const forceOverride = (): void => {
    // Try the preset, then nudge battery until the watchdog trips.
    const base = { ...OVERRIDE_PRESET };
    setWi(base);
    runWhatIf(base, activeId);
  };

  const maxConf = active?.confusion?.matrix.flat().reduce((a, b) => Math.max(a, b), 1) ?? 1;

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <main className="shell py-10">
        <ChapterLabel index="BRAIN" title="AI Router" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            The AI router
          </h1>
          <ExpCo exp="Exp 9" co="CO4" />
        </div>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--cream-dim)]">
          A decision tree stored as rows in dt_node, walked by SQL. The
          watchdog always has the last word.
        </p>

        {offline && (
          <div className="mt-6">
            <BackendOffline onRetry={boot} />
          </div>
        )}
        {error !== null && (
          <div className="mt-6">
            <RefusedCard err={error} />
          </div>
        )}

        {/* Model cards */}
        <section className="mt-6 grid gap-3 md:grid-cols-2">
          {models.map((m) => (
            <button
              key={m.model_id}
              onClick={() => setActiveId(m.model_id)}
              aria-pressed={active?.model_id === m.model_id}
              className={`rounded-xl border p-4 text-left ${
                active?.model_id === m.model_id
                  ? "border-[var(--somaiya)] bg-[var(--somaiya-soft)]"
                  : "border-[var(--rule)] bg-[var(--ink-2)] hover:border-[var(--somaiya)]/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-display text-[15px] font-bold">
                  {m.name} · v{m.version}
                </span>
                {m.is_active && (
                  <span className="font-mono rounded-full bg-[var(--signal)] px-2 py-0.5 text-[10px] text-black">
                    ACTIVE
                  </span>
                )}
                <span className="font-mono ml-auto text-[12px] text-[var(--amber)]">
                  {m.test_accuracy !== null ? Number(m.test_accuracy).toFixed(3) : "—"}
                </span>
              </span>
              <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--ink)]">
                <span
                  className="block h-full rounded-full bg-[var(--somaiya)]"
                  style={{ width: `${(Number(m.test_accuracy ?? 0) * 100).toFixed(1)}%` }}
                />
              </span>
              <span className="font-mono mt-1.5 block text-[10px] text-[var(--mute)]">
                {m.algorithm} · depth {m.max_depth ?? "?"} · {m.train_rows ?? "?"} rows
              </span>
              {m.confusion && (
                <span className="mt-2 grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1" style={{ display: "grid" }}>
                  <span />
                  {m.confusion.labels.map((l) => (
                    <span key={l} className="font-mono truncate text-center text-[8px] text-[var(--mute)]">
                      {l.slice(0, 4)}
                    </span>
                  ))}
                  {m.confusion.matrix.map((row, i) => (
                    <span key={m.confusion?.labels[i] ?? i} style={{ display: "contents" }}>
                      <span className="font-mono truncate text-right text-[8px] text-[var(--mute)]">
                        {m.confusion?.labels[i].slice(0, 4)}
                      </span>
                      {row.map((v, j) => (
                        <span
                          key={j}
                          className="font-mono rounded px-1 py-0.5 text-center text-[9px]"
                          style={{
                            background: `rgba(215,38,61,${(v / maxConf).toFixed(2)})`,
                            color: "var(--amber)",
                          }}
                        >
                          {v}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              )}
              {m.metrics.length > 0 && (
                <span className="font-mono mt-2 block overflow-x-auto text-[10px] text-[var(--cream-dim)]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-[var(--mute)]">
                        <th className="py-0.5 text-left font-normal">class</th>
                        <th className="text-right font-normal">prec</th>
                        <th className="text-right font-normal">rec</th>
                        <th className="text-right font-normal">f1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.metrics.map((mc) => (
                        <tr key={mc.class_label} className="border-t border-[var(--rule)]">
                          <td className="py-0.5">{mc.class_label}</td>
                          <td className="text-right">{mc.precision_ ?? "—"}</td>
                          <td className="text-right">{mc.recall ?? "—"}</td>
                          <td className="text-right">{mc.f1 ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </span>
              )}
            </button>
          ))}
        </section>

        {/* Tree */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
            tree · dt_node · wheel to zoom, drag to pan
          </h2>
          {tree.length === 0 ? (
            <p className="font-mono mt-3 text-[12px] text-[var(--mute)]">
              No tree rows — GET /api/ai/models/{"{id}"}/tree.
            </p>
          ) : (
            <div className="mt-3">
              <TreeSvg nodes={tree} pathIds={pathIds} stagger />
            </div>
          )}
        </section>

        {/* Inference */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
              inference · preview
            </h2>
            <select
              value={sat}
              onChange={(e) => setSat(e.target.value)}
              className="font-mono ml-auto rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-1.5 text-[12px] text-[var(--cream)]"
              aria-label="Satellite"
            >
              {SATS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {preview?.features && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FEATURE_KEYS.map((k) => (
                <span
                  key={k}
                  className="font-mono rounded-full border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-1 text-[11px] text-[var(--cream-dim)]"
                >
                  {k} <span className="text-[var(--amber)]">{preview.features[k]}</span>
                </span>
              ))}
            </div>
          )}

          {preview?.preview?.ai_path && preview.preview.ai_path.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1">
              {preview.preview.ai_path.map((step, i) => (
                <li
                  key={i}
                  className="font-mono rounded-lg border border-[var(--somaiya)]/50 bg-[var(--somaiya-soft)] px-3 py-1.5 text-[11px] text-[var(--cream)]"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className="text-[var(--somaiya)]">{String(i + 1).padStart(2, "0")}</span> {step}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <ActionCard title="AI action" action={preview?.preview?.ai_action ?? whatif?.ai?.action ?? null} />
            <ActionCard
              title="Rule action"
              action={preview?.preview?.rule_action ?? whatif?.rule_action ?? null}
              extra={preview?.rule_reason ?? whatif?.rule_reason}
            />
            <div className="relative">
              <ActionCard
                title="Final action"
                action={preview?.preview?.final_action ?? whatif?.rule_action ?? null}
                extra={preview?.preview?.override_reason ?? whatif?.watchdog}
                accent={preview?.preview?.overridden}
              />
              {(preview?.preview?.overridden || whatif?.watchdog) && (
                <span className="font-mono absolute -right-1 -top-2 rotate-6 rounded border-2 border-[var(--somaiya)] bg-[var(--ink)] px-2 py-0.5 text-[10px] tracking-[0.14em] text-[var(--somaiya)]">
                  OVERRIDE
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void onRecord()}
              className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-[1.02]"
            >
              Record decision
            </button>
            <span className="font-mono text-[10px] text-[var(--mute)]">
              works for director / operators / ai_router — analyst gets PostgreSQL refused
            </span>
          </div>
          {decideOk && (
            <p className="font-mono mt-2 text-[12px] text-[var(--signal)]">{decideOk}</p>
          )}
          {decideError !== null && (
            <div className="mt-2">
              <RefusedCard err={decideError} context={`POST /api/ai/decide/${sat}`} />
            </div>
          )}
        </section>

        {/* What-if */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
              what-if · POST /api/ai/whatif · 250ms debounce
            </h2>
            <button
              onClick={forceOverride}
              className="font-mono ml-auto rounded-full border border-[var(--somaiya)]/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--cream)] hover:bg-[var(--somaiya-soft)]"
            >
              Force a watchdog override
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Slider label="battery_v" value={wi.battery_v} min={6.0} max={8.4} step={0.05} onChange={(v) => setWi((p) => ({ ...p, battery_v: v }))} />
            <Slider label="link_score" value={wi.link_score} min={0} max={100} step={1} onChange={(v) => setWi((p) => ({ ...p, link_score: v }))} />
            <Slider label="contact_s" value={wi.contact_s} min={0} max={1200} step={10} onChange={(v) => setWi((p) => ({ ...p, contact_s: v }))} />
            <Slider label="queue_ttc_kb" value={wi.queue_ttc_kb} min={0} max={500} step={1} onChange={(v) => setWi((p) => ({ ...p, queue_ttc_kb: v }))} />
            <Slider label="queue_sstv_kb" value={wi.queue_sstv_kb} min={0} max={2000} step={5} onChange={(v) => setWi((p) => ({ ...p, queue_sstv_kb: v }))} />
            <Slider label="queue_voice_kb" value={wi.queue_voice_kb} min={0} max={500} step={1} onChange={(v) => setWi((p) => ({ ...p, queue_voice_kb: v }))} />
            <Slider label="sunlit 0/1" value={wi.sunlit} min={0} max={1} step={1} onChange={(v) => setWi((p) => ({ ...p, sunlit: v }))} />
            <Slider label="isl_available 0/1" value={wi.isl_available} min={0} max={1} step={1} onChange={(v) => setWi((p) => ({ ...p, isl_available: v }))} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <ActionCard title="AI action" action={whatif?.ai?.action ?? null} extra={whatif?.ai?.path.join(" · ")} />
            <ActionCard title="Rule action" action={whatif?.rule_action ?? null} extra={whatif?.rule_reason} />
            <ActionCard
              title="Watchdog"
              action={null}
              extra={whatif?.watchdog ?? whatif?.watchdog_full ?? "no violation — AI stands"}
              accent={Boolean(whatif?.watchdog)}
            />
          </div>
          {whatif?.ai?.path && whatif.ai.path.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1">
              {whatif.ai.path.map((step, i) => (
                <li
                  key={i}
                  className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-3 py-1.5 text-[11px] text-[var(--cream-dim)]"
                >
                  <span className="text-[var(--somaiya)]">{String(i + 1).padStart(2, "0")}</span> {step}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Decision log */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
            decision log · live from /api/stream
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="font-mono w-full min-w-[640px] border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-[var(--mute)]">
                  <th className="py-1 pr-2 font-normal">time</th>
                  <th className="py-1 pr-2 font-normal">sat</th>
                  <th className="py-1 pr-2 font-normal">ai</th>
                  <th className="py-1 pr-2 font-normal">rule</th>
                  <th className="py-1 pr-2 font-normal">final</th>
                  <th className="py-1 pr-2 font-normal">ovr</th>
                  <th className="py-1 font-normal">src</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr
                    key={d.decision_id ?? `${d.sat_id}-${d.decided_at}`}
                    className={`border-t border-[var(--rule)] ${d.overridden ? "bg-[var(--somaiya-soft)]" : ""}`}
                  >
                    <td className="py-1 pr-2 text-[var(--cream-dim)]">
                      {String(d.decided_at ?? "").slice(11, 19)}
                    </td>
                    <td className="py-1 pr-2 text-[var(--cream)]">{d.sat_id}</td>
                    <td className="py-1 pr-2 text-[var(--cream-dim)]">{d.ai_action ?? "—"}</td>
                    <td className="py-1 pr-2 text-[var(--cream-dim)]">{d.rule_action}</td>
                    <td className="py-1 pr-2 text-[var(--amber)]">{d.final_action}</td>
                    <td className="py-1 pr-2">{d.overridden ? "●" : ""}</td>
                    <td className="py-1 text-[var(--mute)]">{d.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
