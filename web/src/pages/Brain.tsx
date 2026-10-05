import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/app/api";
import { Locked, RoleHeader } from "@/app/access";
import { BackendOffline } from "@/app/SqlDrawer";
import { Panel } from "@/components/cc/Panel";
import {
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
  type WhatIfData,
} from "@/features/brain/api";
import { TreeSvg } from "@/features/brain/TreeSvg";

const SATS = ["SS-1", "SS-2", "SS-3"];

function RefusedCard({ err, context }: { err: ApiError; context?: string }) {
  return (
    <Panel className="w-full">
      <div className="p-3.5 flex flex-col gap-1.5">
        <span className="sx-status" data-tone="critical">
          {err.sqlstate === "42501"
            ? "Permission denied by PostgreSQL (42501)"
            : "Critical refusal"}{" "}
          · <span className="sx-num">{err.sqlstate ?? err.status}</span>
          {context && <span className="sx-caption">· {context}</span>}
        </span>
        <p className="sx-body text-white">{err.message}</p>
        {err.detail && <p className="sx-caption">{err.detail}</p>}
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
    <div className="flex flex-col gap-1 rounded-[10px] bg-[#111113] p-2.5">
      <div className="flex justify-between text-[13px]">
        <span className="sx-caption">{label}</span>
        <span className="sx-num text-white">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white cursor-pointer min-h-[44px]"
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

  // Decisions to show in 3 side-by-side panels
  const aiAction = preview?.preview?.ai_action ?? whatif?.ai?.action ?? null;
  const ruleAction = preview?.preview?.rule_action ?? whatif?.rule_action ?? null;
  const ruleReason = preview?.rule_reason ?? whatif?.rule_reason ?? null;
  const finalAction = preview?.preview?.final_action ?? whatif?.rule_action ?? null;
  const isOverride = Boolean(preview?.preview?.overridden || whatif?.watchdog);
  const overrideReason = preview?.preview?.override_reason ?? whatif?.watchdog ?? null;
  const overrideNodeId = isOverride ? (whatif?.ai?.leaf_node ?? pathIds[pathIds.length - 1] ?? null) : null;

  return (
    <div className="-m-4 p-4 sm:-m-6 sm:p-6 min-h-[calc(100vh-3.5rem)] bg-black text-white flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="sx-h1">AI router</h1>
        <p className="sx-lead">
          A decision tree stored as rows, walked by SQL — the safety check has
          the last word.
        </p>
        <RoleHeader note="Preview is open to every role; recording a decision writes to routing_decision." />
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

      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="sx-eyebrow">
                Active model · {active?.name ?? "Model"} v{active?.version ?? 1}
              </span>
              <span className="sx-caption">
                {active?.algorithm} · max_depth {active?.max_depth ?? "?"} ·{" "}
                {active?.train_rows ?? "?"} train rows
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="sx-caption">Test accuracy</span>
              <span className="sx-num text-[32px] sm:text-[40px] leading-none text-white">
                {active?.test_accuracy !== null && active?.test_accuracy !== undefined
                  ? `${(Number(active.test_accuracy) * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="sx-eyebrow py-2 pr-3 font-medium">Model</th>
                  <th className="sx-eyebrow py-2 pr-3 font-medium">Version</th>
                  <th className="sx-eyebrow py-2 pr-3 font-medium">Status</th>
                  <th className="sx-eyebrow py-2 pr-3 font-medium">Algorithm</th>
                  <th className="sx-eyebrow py-2 pr-3 font-medium">Max depth</th>
                  <th className="sx-eyebrow py-2 pr-3 text-right font-medium">Train rows</th>
                  <th className="sx-eyebrow py-2 text-right font-medium">Test accuracy</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const isCurrent = active?.model_id === m.model_id;
                  return (
                    <tr
                      key={m.model_id}
                      onClick={() => setActiveId(m.model_id)}
                      className="cursor-pointer border-t border-[var(--sx-hairline)] transition-colors min-h-[52px] hover:bg-[var(--sx-surface-2)]"
                      style={
                        isCurrent
                          ? { backgroundColor: "var(--sx-surface-2)" }
                          : undefined
                      }
                    >
                      <td className="py-3 pr-3 sx-body text-white">
                        {isCurrent ? "▶ " : ""}
                        {m.name}
                      </td>
                      <td className="py-3 pr-3 sx-caption">v{m.version}</td>
                      <td className="py-3 pr-3">
                        {m.is_active ? (
                          <span className="sx-status" data-tone="ok">
                            Active
                          </span>
                        ) : (
                          <span className="sx-caption">Standby</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 sx-caption">{m.algorithm}</td>
                      <td className="py-3 pr-3 sx-caption">{m.max_depth ?? "—"}</td>
                      <td className="py-3 pr-3 text-right sx-num text-white/70">
                        {m.train_rows ?? "—"}
                      </td>
                      <td className="py-3 text-right sx-num text-white">
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

          {active && active.metrics && active.metrics.length > 0 && (
            <div className="pt-2 flex flex-col gap-2">
              <span className="sx-eyebrow">
                Score by action · {active.name} v{active.version}
              </span>
              <div className="sx-group">
                <div className="sx-row">
                  <span className="sx-eyebrow">Action</span>
                  <span className="sx-eyebrow">F1</span>
                </div>
                {active.metrics.map((mc) => (
                  <div key={mc.class_label} className="sx-row">
                    <span className="sx-body text-white inline-flex items-center gap-2">
                      <span className="inline-block size-[7px] rounded-full bg-white" />
                      {mc.class_label}
                    </span>
                    <span className="sx-caption">
                      P <span className="sx-num">{mc.precision_ ?? "—"}</span> · R{" "}
                      <span className="sx-num">{mc.recall ?? "—"}</span> · F1{" "}
                      <span className="sx-num text-white">{mc.f1 ?? "—"}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-2">
          {tree.length === 0 ? (
            <p className="sx-body p-6">
              Loading decision tree rows from{" "}
              <span className="font-mono">/api/ai/models/{active?.model_id ?? 1}/tree</span>…
            </p>
          ) : (
            <TreeSvg
              nodes={tree}
              pathIds={pathIds}
              stagger
              modelVersion={active?.version ?? 1}
              overrideNodeId={overrideNodeId}
            />
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-2">
        <span className="sx-eyebrow">What the AI, the rules, and the final choice say</span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Panel className="w-full">
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <span className="sx-eyebrow">AI decision</span>
              <div className="sx-h3">{aiAction ?? "—"}</div>
              <p className="sx-caption">
                {whatif?.ai?.path && whatif.ai.path.length > 0
                  ? `Inference path: ${whatif.ai.path.length} steps`
                  : "Postgres recursive walk"}
              </p>
            </div>
          </Panel>

          <Panel className="w-full">
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <span className="sx-eyebrow">Rule action</span>
              <div className="sx-h3">{ruleAction ?? "—"}</div>
              <p className="sx-caption">
                {ruleReason ?? "Power and queue limits"}
              </p>
            </div>
          </Panel>

          <Panel
            selected={isOverride}
            borderColor={isOverride ? "#ff9f0a" : undefined}
            className="w-full"
          >
            <div className="p-4 flex flex-col gap-2 min-h-[140px] justify-between">
              <div className="flex items-center justify-between gap-1">
                <span className="sx-eyebrow">Final action</span>
                {isOverride && (
                  <span className="sx-status" data-tone="warn">
                    Safety override
                  </span>
                )}
              </div>
              <div className="sx-h3">{finalAction ?? "—"}</div>
              <p
                className="sx-caption"
                style={isOverride ? { color: "#ff9f0a" } : undefined}
              >
                {overrideReason ?? "No violation — AI decision stands"}
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="sx-eyebrow">Inputs for this decision</span>
              <span className="sx-caption">
                Live values fed into the tree in{" "}
                <span className="font-mono">dt_node</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="sx-caption">Satellite</span>
              <select
                value={sat}
                onChange={(e) => setSat(e.target.value)}
                className="bg-[#111113] border border-[var(--sx-hairline)] rounded-[10px] min-h-[44px] px-3 text-[13px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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

          <div className="sx-group">
            {FEATURE_KEYS.map((k) => {
              const val = liveFeatures[k] ?? 0;
              const ratio = normalizeFeatureRatio(k, val);
              return (
                <div key={k} className="sx-row flex-col !items-stretch !gap-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="sx-body">{k}</span>
                    <span className="sx-num text-white">{val}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-white/70"
                      style={{
                        width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Locked action="decide" onTry={() => void onRecord()}>
                <button
                  type="button"
                  onClick={() => void onRecord()}
                  className="sx-btn sx-btn--filled"
                >
                  Decide now
                </button>
              </Locked>
              <span className="sx-caption">
                <span className="font-mono">POST /api/ai/decide/{sat}</span>
              </span>
            </div>

            {decideOk && (
              <span className="sx-status" data-tone="ok">
                {decideOk}
              </span>
            )}
          </div>

          {decideError !== null && (
            <div className="pt-2">
              <RefusedCard err={decideError} context={`POST /api/ai/decide/${sat}`} />
            </div>
          )}
        </div>
      </Panel>

      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="sx-eyebrow">Try what-if values</span>
              <span className="sx-caption">
                <span className="font-mono">POST /api/ai/whatif</span> · tests when the
                safety check steps in
              </span>
            </div>
            <button type="button" onClick={forceOverride} className="sx-btn sx-btn--sm">
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

      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="sx-eyebrow">
              Past decisions · <span className="font-mono">routing_decision</span>
            </span>
            <span className="sx-caption">
              <span className="sx-num">{decisions.length}</span> recorded
            </span>
          </div>

          <div className="sx-group">
            <div className="sx-row">
              <span className="sx-eyebrow">Time · Satellite</span>
              <span className="sx-eyebrow">Final choice</span>
            </div>
            {decisions.map((d) => (
              <div
                key={d.decision_id ?? `${d.sat_id}-${d.decided_at}`}
                className="sx-row"
                style={
                  d.overridden
                    ? { backgroundColor: "rgba(255, 159, 10, 0.08)" }
                    : undefined
                }
              >
                <span className="min-w-0">
                  <span className="sx-num text-[13px] text-white/80">
                    {String(d.decided_at ?? "").slice(11, 19)} UTC
                  </span>{" "}
                  <span className="font-mono text-[12px] text-white">{d.sat_id}</span>
                  <span className="sx-caption block truncate">
                    AI {d.ai_action ?? "—"} · Rule {d.rule_action} · {d.source}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="sx-body text-white">{d.final_action}</span>
                  {d.overridden ? (
                    <span className="sx-status" data-tone="warn">
                      Overridden
                    </span>
                  ) : (
                    <span className="sx-caption">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
