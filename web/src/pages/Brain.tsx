import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/app/api";
import { Locked, RoleHeader } from "@/app/access";
import { BackendOffline } from "@/app/SqlDrawer";
import { Panel } from "@/components/cc/Panel";
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

const SATS = ["SS-1", "SS-2", "SS-3"];

function RefusedCard({ err, context }: { err: ApiError; context?: string }) {
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
          {context && (
            <span className="font-mono text-[10px] text-[#8b96b0]">· {context}</span>
          )}
        </div>
        <p className="font-mono text-[12.5px] text-[#dfe6f5]">{err.message}</p>
        {err.detail && (
          <p className="font-mono text-[11px] text-[#8b96b0]">{err.detail}</p>
        )}
      </div>
    </Panel>
  );
}

function normalizeFeatureRatio(key: string, val: number): number {
  switch (key) {
    case "battery_v":
      return Math.max(0, Math.min(1, (val - 6.0) / 2.4));
    case "link_score":
      return Math.max(0, Math.min(1, val / 100));
    case "contact_s":
      return Math.max(0, Math.min(1, val / 1200));
    case "queue_ttc_kb":
      return Math.max(0, Math.min(1, val / 500));
    case "queue_sstv_kb":
      return Math.max(0, Math.min(1, val / 2000));
    case "queue_voice_kb":
      return Math.max(0, Math.min(1, val / 500));
    case "sunlit":
    case "isl_available":
      return val > 0 ? 1 : 0;
    default:
      return 0.5;
  }
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
    <div className="flex flex-col gap-1 p-2 bg-[#05070d] border border-white/5">
      <div className="flex justify-between font-mono text-[10px] tracking-[0.1em]">
        <span className="text-[#8b96b0] uppercase">{label}</span>
        <span className="text-[#dfe6f5] font-semibold">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#3d5bff] cursor-pointer"
      />
    </div>
  );
}

export default function Brain() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tree, setTree] = useState<DtNode[]>([]);
  const [sat, setSat] = useState("SS-1");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [whatif, setWhatif] = useState<WhatIfData | null>(null);
  const [wi, setWi] = useState<Features>({ ...DEFAULT_WHATIF });
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [decideError, setDecideError] = useState<ApiError | null>(null);
  const [decideOk, setDecideOk] = useState<string | null>(null);
  const wiTimer = useRef<number | null>(null);

  const active =
    models.find((m) => m.model_id === activeId) ??
    models.find((m) => m.is_active) ??
    models[0] ??
    null;

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
          // Keep stream open
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

  const liveFeatures: Features = useMemo(() => ({ ...wi }), [wi]);
  const pathIds = useMemo(
    () => (tree.length > 0 ? walkPath(tree, liveFeatures) : []),
    [tree, liveFeatures],
  );

  const onRecord = async (): Promise<void> => {
    setDecideError(null);
    setDecideOk(null);
    try {
      const row = await recordDecision(sat);
      setDecideOk(`Decision #${row.decision_id} recorded → ${row.final_action}`);
      const ds = await loadDecisions().catch(() => null);
      if (ds) setDecisions(ds);
    } catch (e) {
      if (e instanceof ApiError) setDecideError(e);
    }
  };

  const forceOverride = (): void => {
    const base = { ...OVERRIDE_PRESET };
    setWi(base);
    runWhatIf(base, activeId);
  };

  // Determine decisions to show in 3 side-by-side panels
  const aiAction = preview?.preview?.ai_action ?? whatif?.ai?.action ?? null;
  const ruleAction = preview?.preview?.rule_action ?? whatif?.rule_action ?? null;
  const ruleReason = preview?.rule_reason ?? whatif?.rule_reason ?? null;
  const finalAction = preview?.preview?.final_action ?? whatif?.rule_action ?? null;
  const isOverride = Boolean(preview?.preview?.overridden || whatif?.watchdog);
  const overrideReason = preview?.preview?.override_reason ?? whatif?.watchdog ?? null;

  return (
    <div className="-m-4 p-4 sm:-m-6 sm:p-6 min-h-[calc(100vh-3.5rem)] bg-black text-[#dfe6f5] flex flex-col gap-5">
      {/* Page Title Row */}
      <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="font-sans text-[28px] sm:text-[34px] font-light tracking-tight text-white leading-tight">
              AI router: what the satellite sends next
            </h1>
            <p className="text-[13px] text-[#8b96b0] leading-snug">
              A decision tree stored as rows in dt_node, walked by SQL. The safety check always has the last word.
            </p>
            <RoleHeader note="Preview is open to every role; recording a decision writes to routing_decision." />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff]">
              Decision tree in SQL
            </span>
          </div>
        </div>
      </div>

      {offline && (
        <div className="w-full">
          <BackendOffline onRetry={boot} />
        </div>
      )}

      {error !== null && (
        <div className="w-full">
          <RefusedCard err={error} />
        </div>
      )}

      {/* Model Versions & Metrics Table with Big Light Accuracy Number */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Active model and test score: {active?.name ?? "Model"} v{active?.version ?? 1}
              </span>
              <span className="text-[12px] text-[#8b96b0]">
                {active?.algorithm} · max_depth {active?.max_depth ?? "?"} · {active?.train_rows ?? "?"} train rows
              </span>
            </div>

            {/* Big light accuracy number */}
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                Test accuracy:
              </span>
              <span className="font-sans text-[32px] sm:text-[40px] font-light tracking-tight text-white leading-none">
                {active?.test_accuracy !== null && active?.test_accuracy !== undefined
                  ? `${(Number(active.test_accuracy) * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </div>

          {/* Model versions table in shared table style */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  <th className="py-2 pr-3 font-normal">Model</th>
                  <th className="py-2 pr-3 font-normal">Version</th>
                  <th className="py-2 pr-3 font-normal">Status</th>
                  <th className="py-2 pr-3 font-normal">Algorithm</th>
                  <th className="py-2 pr-3 font-normal">Max depth</th>
                  <th className="py-2 pr-3 text-right font-normal">Train rows</th>
                  <th className="py-2 text-right font-normal">Test accuracy</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const isCurrent = active?.model_id === m.model_id;
                  return (
                    <tr
                      key={m.model_id}
                      onClick={() => setActiveId(m.model_id)}
                      className={`border-b border-white/[0.06] cursor-pointer transition-colors ${
                        isCurrent
                          ? "bg-[#3d5bff]/15 text-white"
                          : "hover:bg-white/[0.03] text-[#dfe6f5]"
                      }`}
                    >
                      <td className="py-2 pr-3 font-semibold">
                        {isCurrent ? "▶ " : ""}
                        {m.name}
                      </td>
                      <td className="py-2 pr-3 text-[#8b96b0]">v{m.version}</td>
                      <td className="py-2 pr-3">
                        {m.is_active ? (
                          <span className="px-1.5 py-0.5 border border-[#7ee2b8]/40 bg-[#7ee2b8]/10 text-[#7ee2b8] text-[9px] uppercase tracking-wider">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[#8b96b0] text-[10px]">STANDBY</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-[#8b96b0]">{m.algorithm}</td>
                      <td className="py-2 pr-3 text-[#8b96b0]">{m.max_depth ?? "—"}</td>
                      <td className="py-2 pr-3 text-right text-[#8b96b0]">
                        {m.train_rows ?? "—"}
                      </td>
                      <td className="py-2 text-right font-semibold text-[#7ee2b8]">
                        {m.test_accuracy !== null
                          ? `${(Number(m.test_accuracy) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per-class metrics table if available */}
          {active && active.metrics && active.metrics.length > 0 && (
            <div className="pt-2 flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Score by action: {active.name} v{active.version}
              </span>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                      <th className="py-1.5 pr-3 font-normal">Action Class</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Precision</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Recall</th>
                      <th className="py-1.5 text-right font-normal">F1 Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.metrics.map((mc) => (
                      <tr
                        key={mc.class_label}
                        className="border-b border-white/[0.06] text-[#dfe6f5]"
                      >
                        <td className="py-1.5 pr-3 flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-none"
                            style={{
                              backgroundColor:
                                ACTION_COLORS[mc.class_label as RouterAction] ?? "#8b96b0",
                            }}
                          />
                          <span>{mc.class_label}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-right text-[#8b96b0]">
                          {mc.precision_ ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-[#8b96b0]">
                          {mc.recall ?? "—"}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-[#7fb2ff]">
                          {mc.f1 ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Decision Tree View in Large Panel with HUD label */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-2">
          {tree.length === 0 ? (
            <div className="p-6 font-mono text-[12px] text-[#8b96b0]">
              Loading decision tree rows from /api/ai/models/{active?.model_id ?? 1}/tree…
            </div>
          ) : (
            <TreeSvg
              nodes={tree}
              pathIds={pathIds}
              stagger
              modelVersion={active?.version ?? 1}
            />
          )}
        </div>
      </Panel>

      {/* AI vs Rule vs Final Decision as Three Panels Side-by-Side */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
          What the AI, the safety rules, and the final choice say
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Panel 1: AI Decision */}
          <Panel cut={8} className="w-full">
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                AI decision
              </span>
              <div
                className="font-mono text-[18px] font-semibold tracking-tight"
                style={{
                  color: aiAction ? ACTION_COLORS[aiAction] : "#8b96b0",
                }}
              >
                {aiAction ?? "—"}
              </div>
              <div className="font-mono text-[11px] text-[#8b96b0] leading-snug">
                {whatif?.ai?.path && whatif.ai.path.length > 0
                  ? `Inference path: ${whatif.ai.path.length} steps traversed`
                  : "Postgres recursive graph traversal"}
              </div>
            </div>
          </Panel>

          {/* Panel 2: Rule-Based Action */}
          <Panel cut={8} className="w-full">
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Rule action
              </span>
              <div
                className="font-mono text-[18px] font-semibold tracking-tight"
                style={{
                  color: ruleAction ? ACTION_COLORS[ruleAction] : "#8b96b0",
                }}
              >
                {ruleAction ?? "—"}
              </div>
              <div className="font-mono text-[11px] text-[#8b96b0] leading-snug">
                {ruleReason ?? "Standard power and queue boundary conditions"}
              </div>
            </div>
          </Panel>

          {/* Panel 3: Final Arbitrated Decision with amber glow on override */}
          <Panel
            cut={8}
            selected={isOverride}
            borderColor={isOverride ? "#f5a524" : undefined}
            glowColor={isOverride ? "rgba(245, 165, 36, 0.45)" : undefined}
            className="w-full"
          >
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                  Final action
                </span>
                {isOverride && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524]">
                    Safety override
                  </span>
                )}
              </div>
              <div
                className="font-mono text-[18px] font-semibold tracking-tight"
                style={{
                  color: finalAction ? ACTION_COLORS[finalAction] : "#8b96b0",
                }}
              >
                {finalAction ?? "—"}
              </div>
              <div
                className="font-mono text-[11px] leading-snug"
                style={{ color: isOverride ? "#f5a524" : "#8b96b0" }}
              >
                {overrideReason ?? "No violation — AI decision committed"}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Feature Inputs as a Panel of Mono Key/Value Rows with Thin Bars */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-2.5">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Inputs used for this decision
              </span>
              <span className="text-[12px] text-[#8b96b0]">
                Live values fed into the decision tree in SQL (dt_node)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-[#8b96b0]">
                Satellite:
              </span>
              <select
                value={sat}
                onChange={(e) => setSat(e.target.value)}
                className="font-mono bg-[#05070d] border border-white/10 px-2 py-1 text-[12px] text-white focus:border-[#3d5bff] focus:outline-none"
                aria-label="Satellite"
              >
                {SATS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Key/Value Rows with Thin Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {FEATURE_KEYS.map((k) => {
              const val = liveFeatures[k] ?? 0;
              const ratio = normalizeFeatureRatio(k, val);
              return (
                <div
                  key={k}
                  className="flex flex-col gap-1 p-2.5 bg-[#05070d] border border-white/5"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#8b96b0] uppercase tracking-wider">{k}</span>
                    <span className="text-white font-semibold tabular-nums">{val}</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full transition-all duration-200"
                      style={{
                        width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                        backgroundColor: "#3d5bff",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Record Decision Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
            <div className="flex items-center gap-2">
              <Locked action="decide" onTry={() => void onRecord()}>
                <button
                  onClick={() => void onRecord()}
                  className="px-4 py-2 bg-[#3d5bff] hover:bg-[#4f6bff] text-white font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors cursor-pointer"
                >
                  Decide now
                </button>
              </Locked>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                POST /api/ai/decide/{sat} (writes to routing_decision)
              </span>
            </div>

            {decideOk && (
              <span className="font-mono text-[11px] text-[#7ee2b8]">{decideOk}</span>
            )}
          </div>

          {decideError !== null && (
            <div className="pt-2">
              <RefusedCard err={decideError} context={`POST /api/ai/decide/${sat}`} />
            </div>
          )}
        </div>
      </Panel>

      {/* What-If Scenario Modeling Panel */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-2.5">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Try what-if values (POST /api/ai/whatif)
              </span>
              <span className="text-[12px] text-[#8b96b0]">
                Adjust live values to test when the safety check steps in (250 ms wait)
              </span>
            </div>
            <button
              onClick={forceOverride}
              className="font-mono px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524] hover:bg-[#f5a524]/20 transition-colors cursor-pointer"
            >
              Force a safety override
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Slider
              label="battery_v"
              value={wi.battery_v}
              min={6.0}
              max={8.4}
              step={0.05}
              onChange={(v) => setWi((p) => ({ ...p, battery_v: v }))}
            />
            <Slider
              label="link_score"
              value={wi.link_score}
              min={0}
              max={100}
              step={1}
              onChange={(v) => setWi((p) => ({ ...p, link_score: v }))}
            />
            <Slider
              label="contact_s"
              value={wi.contact_s}
              min={0}
              max={1200}
              step={10}
              onChange={(v) => setWi((p) => ({ ...p, contact_s: v }))}
            />
            <Slider
              label="queue_ttc_kb"
              value={wi.queue_ttc_kb}
              min={0}
              max={500}
              step={1}
              onChange={(v) => setWi((p) => ({ ...p, queue_ttc_kb: v }))}
            />
            <Slider
              label="queue_sstv_kb"
              value={wi.queue_sstv_kb}
              min={0}
              max={2000}
              step={5}
              onChange={(v) => setWi((p) => ({ ...p, queue_sstv_kb: v }))}
            />
            <Slider
              label="queue_voice_kb"
              value={wi.queue_voice_kb}
              min={0}
              max={500}
              step={1}
              onChange={(v) => setWi((p) => ({ ...p, queue_voice_kb: v }))}
            />
            <Slider
              label="sunlit 0/1"
              value={wi.sunlit}
              min={0}
              max={1}
              step={1}
              onChange={(v) => setWi((p) => ({ ...p, sunlit: v }))}
            />
            <Slider
              label="isl_available 0/1"
              value={wi.isl_available}
              min={0}
              max={1}
              step={1}
              onChange={(v) => setWi((p) => ({ ...p, isl_available: v }))}
            />
          </div>
        </div>
      </Panel>

      {/* Decision Audit Log (Live from /api/stream) */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Past decisions (live from /api/stream, table routing_decision)
            </span>
            <span className="font-mono text-[10px] text-[#8b96b0]">
              {decisions.length} recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  <th className="py-2 pr-3 font-normal">Time</th>
                  <th className="py-2 pr-3 font-normal">Satellite</th>
                  <th className="py-2 pr-3 font-normal">AI choice</th>
                  <th className="py-2 pr-3 font-normal">Rule choice</th>
                  <th className="py-2 pr-3 font-normal">Final choice</th>
                  <th className="py-2 pr-3 font-normal">Override</th>
                  <th className="py-2 text-right font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr
                    key={d.decision_id ?? `${d.sat_id}-${d.decided_at}`}
                    className={`border-b border-white/[0.06] ${
                      d.overridden ? "bg-[#f5a524]/10 text-white" : "text-[#dfe6f5]"
                    }`}
                  >
                    <td className="py-2 pr-3 text-[#8b96b0]">
                      {String(d.decided_at ?? "").slice(11, 19)} UTC
                    </td>
                    <td className="py-2 pr-3 font-semibold text-white">{d.sat_id}</td>
                    <td className="py-2 pr-3 text-[#8b96b0]">{d.ai_action ?? "—"}</td>
                    <td className="py-2 pr-3 text-[#8b96b0]">{d.rule_action}</td>
                    <td
                      className="py-2 pr-3 font-semibold"
                      style={{
                        color: d.final_action
                          ? ACTION_COLORS[d.final_action]
                          : "#dfe6f5",
                      }}
                    >
                      {d.final_action}
                    </td>
                    <td className="py-2 pr-3">
                      {d.overridden ? (
                        <span className="px-1 py-0.5 border border-[#f5a524]/40 bg-[#f5a524]/20 text-[#f5a524] text-[9px] uppercase">
                          Overridden
                        </span>
                      ) : (
                        <span className="text-[#5f6f93]">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-[#8b96b0]">{d.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}
