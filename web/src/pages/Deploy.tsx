import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "@/app/api";
import { Locked, RoleHeader } from "@/app/access";
import { BackendOffline } from "@/app/SqlDrawer";
import { Panel } from "@/components/cc/Panel";
import {
  PODS,
  SIGNALS,
  STATES,
  confirmDeploy,
  executePass,
  loadDeploy,
  loadDownlinks,
  resetDeploy,
  sendSignal,
  type ConfirmFail,
  type DeployBundle,
  type PassContact,
  type PassResult,
  type Snapshot,
} from "@/features/deploy/api";
import { DiffCard } from "@/features/deploy/DiffCard";
import { DashedBar } from "@/features/routing/DashedBar";

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

function stateColor(state: string | null | undefined): string {
  switch (state) {
    case "NOMINAL":
      return "#7ee2b8";
    case "SAFE":
      return "#f5a524";
    case "DEPLOYED":
      return "#7fb2ff";
    case "COMMISSIONING":
      return "#3d5bff";
    case "CRITICAL":
      return "#ff3b4f";
    case "STOWED":
    case "ARMED":
    default:
      return "#8b96b0";
  }
}

/**
 * SomaiyaPod illustration, drawn to real 127.4 × 57.9 × 57.2 mm proportions.
 */
function PodSvg({ status, ejected }: { status: string; ejected: boolean }) {
  const out = ejected;
  // SMIL has no CSS off-switch: skip the idle jiggle entirely when the
  // user prefers reduced motion.
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <svg
      viewBox="0 0 340 150"
      className="w-full h-auto max-h-[170px]"
      role="img"
      aria-label={`Pod ${status}`}
    >
      {/* pod tube: 127.4 long (x) */}
      <rect
        x={20}
        y={45}
        width={240}
        height={60}
        rx={2}
        fill="#060b17"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1.5}
      />
      <rect
        x={20}
        y={45}
        width={18}
        height={60}
        rx={2}
        fill="#05070d"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1.2}
      />
      {/* spring plate */}
      <rect
        x={out ? 30 : 218}
        y={52}
        width={10}
        height={46}
        rx={1}
        fill="#f5a524"
        opacity={0.9}
      >
        {!out && !reduceMotion && (
          <animate
            attributeName="x"
            values="218;214;218"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </rect>
      {/* PocketQube 1P cube */}
      <g
        transform={out ? "translate(272,58)" : "translate(120,58)"}
        style={reduceMotion ? undefined : { transition: "transform 800ms ease" }}
      >
        <rect
          x={-22}
          y={-22}
          width={44}
          height={44}
          rx={2}
          fill={out ? "#0e172c" : "#05070d"}
          stroke={out ? "#3d5bff" : "rgba(255, 255, 255, 0.3)"}
          strokeWidth={1.5}
        />
        <rect
          x={-22}
          y={-22}
          width={44}
          height={10}
          rx={1}
          fill="#3d5bff"
          opacity={0.7}
        />
        <circle cx={0} cy={8} r={5} fill="#7ee2b8" opacity={0.9} />
      </g>
      {out && (
        <line
          x1={258}
          y1={80}
          x2={272}
          y2={80}
          stroke="#3d5bff"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      <text
        x={20}
        y={130}
        fill="#8b96b0"
        fontSize={9.5}
        fontFamily="Geist Mono, monospace"
      >
        SOMAIYAPOD, 127.4 × 57.9 × 57.2 mm, status: {status}
      </text>
    </svg>
  );
}

function StateDiagram({ current }: { current: string | null }) {
  const edges: Array<[string, string]> = [
    ["STOWED", "DEPLOYED"],
    ["DEPLOYED", "COMMISSIONING"],
    ["COMMISSIONING", "NOMINAL"],
    ["COMMISSIONING", "SAFE"],
  ];
  return (
    <div className="flex flex-col gap-2" role="img" aria-label="Satellite state machine">
      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((s, i) => {
          const isActive = current === s;
          const col = stateColor(s);
          return (
            <span key={s} className="flex items-center gap-2">
              <span
                className="font-mono text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border"
                style={{
                  color: isActive ? col : "#8b96b0",
                  borderColor: isActive
                    ? `color-mix(in srgb, ${col} 60%, transparent)`
                    : "rgba(255, 255, 255, 0.1)",
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${col} 15%, transparent)`
                    : "transparent",
                  boxShadow: isActive ? `0 0 10px ${col}44` : undefined,
                }}
              >
                {s}
              </span>
              {i < STATES.length - 1 && (
                <span className="font-mono text-[#5f6f93] text-[11px]">→</span>
              )}
            </span>
          );
        })}
      </div>
      <span className="font-mono text-[10px] text-[#5f6f93]">
        Legal paths: {edges.map(([a, b]) => `${a}→${b}`).join(" · ")} (+ NOMINAL⇄SAFE, →DECOMMISSIONED)
      </span>
    </div>
  );
}

const PASS_SATS = ["SS-1", "SS-2", "SS-3"];

export default function Deploy() {
  const [pod, setPod] = useState("POD-4");
  const [bundle, setBundle] = useState<DeployBundle | null>(null);
  const [okState, setOkState] = useState<Record<string, boolean>>({
    SEPARATION_SWITCH: true,
    RELEASE_TIMER: true,
    RF_BEACON: true,
  });
  const [before, setBefore] = useState<Snapshot | null>(null);
  const [after, setAfter] = useState<Snapshot | null>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const [lastLog, setLastLog] = useState<DeployBundle["log"]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [illegalMsg, setIllegalMsg] = useState<string | null>(null);
  const [illegalError, setIllegalError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Pass execution state
  const [passSat, setPassSat] = useState("SS-1");
  const [passContacts, setPassContacts] = useState<PassContact[]>([]);
  const [passContactId, setPassContactId] = useState<number | null>(null);
  const [passResult, setPassResult] = useState<PassResult | null>(null);

  const refresh = useCallback((p: string) => {
    loadDeploy(p)
      .then((b) => {
        setBundle(b);
        setOffline(false);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 0) setOffline(true);
        else if (e instanceof ApiError) setError(e);
      });
  }, []);

  useEffect(() => {
    refresh(pod);
  }, [pod, refresh]);

  useEffect(() => {
    loadDownlinks(passSat)
      .then((cs) => {
        setPassContacts(cs);
        setPassContactId(cs.length > 0 ? cs[0].contact_id : null);
      })
      .catch(() => {
        setPassContacts([]);
        setPassContactId(null);
      });
  }, [passSat]);

  const confirmedCount = SIGNALS.filter((s) =>
    bundle?.events.some((e) => e.signal === s && e.ok),
  ).length;

  const onSignal = async (signal: string): Promise<void> => {
    setError(null);
    try {
      await sendSignal(pod, signal, okState[signal] ?? true);
      refresh(pod);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    }
  };

  const onConfirm = async (simulate: boolean): Promise<void> => {
    setBusy(simulate ? "fail" : "confirm");
    setError(null);
    setRolledBack(false);
    try {
      const ok = await confirmDeploy(pod, simulate);
      setBefore(ok.before);
      setAfter(ok.after);
      setLastLog(ok.log ? [ok.log] : []);
      refresh(pod);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e);
        const data = (e.data ?? undefined) as ConfirmFail | undefined;
        if (data?.before) {
          setBefore(data.before);
          setAfter(data.after);
          setRolledBack(true);
          refresh(pod);
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const onReset = async (): Promise<void> => {
    setBusy("reset");
    setError(null);
    try {
      await resetDeploy();
      setBefore(null);
      setAfter(null);
      setRolledBack(false);
      refresh(pod);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(null);
    }
  };

  const onIllegal = async (): Promise<void> => {
    setIllegalMsg(null);
    setIllegalError(null);
    try {
      await apiFetch("/api/console", {
        method: "POST",
        body: JSON.stringify({
          query: "UPDATE satellite SET state = 'NOMINAL' WHERE node_id = 'SS-4'",
        }),
      });
      setIllegalMsg("Unexpectedly allowed — the trigger should have fired.");
    } catch (e) {
      if (e instanceof ApiError) {
        setIllegalError(e);
        setIllegalMsg(
          `Console refused (${e.sqlstate ?? e.status}): ${e.message}. ` +
            `The live trigger trg_satellite_state would raise ` +
            `'illegal state transition STOWED -> NOMINAL for SS-4'.`,
        );
      }
    }
  };

  const onPass = async (failStage2: boolean): Promise<void> => {
    if (passContactId === null) return;
    setBusy(failStage2 ? "pass-fail" : "pass");
    setError(null);
    try {
      const r = await executePass(passSat, passContactId, failStage2);
      setPassResult(r);
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(null);
    }
  };

  const passModes = ["TTC", "SSTV", "M17", "CODEC2"];
  const passMax = Math.max(
    1,
    ...(passResult?.before.map((q) => q.bytes) ?? [1]),
    ...(passResult?.after.map((q) => q.bytes) ?? [1]),
  );

  const podStatus = bundle?.pod?.status ?? "STOWED";
  const satState = bundle?.satellite?.state ?? "STOWED";
  const isEjected = podStatus === "RELEASED" || podStatus === "CONFIRMED";

  const effectiveLog =
    lastLog.length > 0 ? lastLog[0] : bundle && bundle.log.length > 0 ? bundle.log[0] : null;

  return (
    <div className="-m-4 p-4 sm:-m-6 sm:p-6 min-h-[calc(100vh-3.5rem)] bg-black text-[#dfe6f5] flex flex-col gap-5">
      {/* Page Title Row */}
      <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="font-sans text-[28px] sm:text-[34px] font-light tracking-tight text-white leading-tight">
              Releasing a satellite from its deployer
            </h1>
            <p className="text-[13px] text-[#8b96b0] leading-snug">
              Two signals agree, the pod opens, the satellite wakes. Every step runs in a
              transaction you can roll back on purpose (confirm_deployment).
            </p>
            <RoleHeader />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff]">
              TRANSACTION TIMELINE
            </span>
          </div>
        </div>
      </div>

      {offline && (
        <div className="w-full">
          <BackendOffline onRetry={() => refresh(pod)} />
        </div>
      )}

      {error !== null && (
        <div className="w-full">
          <RefusedCard err={error} />
        </div>
      )}

      {/* SomaiyaPod Sequence as a Vertical Console Timeline */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] uppercase text-[#dfe6f5]">
            Release steps
          </span>
          <span className="font-mono text-[10px] text-[#8b96b0]">
            Pod {pod}
          </span>
        </div>

        {/* TIMELINE STEP 01: POD INSPECTION */}
        <Panel cut={8} className="w-full">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] font-semibold text-[#7fb2ff] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10">
                  Step 1
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white">
                  Check the pod and its satellite
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* State Badge */}
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border"
                  style={{
                    color: stateColor(podStatus),
                    borderColor: `color-mix(in srgb, ${stateColor(podStatus)} 40%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${stateColor(podStatus)} 10%, transparent)`,
                  }}
                >
                  POD: {podStatus}
                </span>

                {/* Transaction Outcome Badge */}
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-white/15 bg-white/5 text-[#8b96b0]">
                  Before release
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-4 flex flex-col gap-2">
                <label
                  htmlFor="deploy-pod"
                  className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
                >
                  Pick a pod:
                </label>
                <select
                  id="deploy-pod"
                  value={pod}
                  onChange={(e) => setPod(e.target.value)}
                  className="font-mono bg-[#05070d] border border-white/10 px-2.5 py-1.5 text-[12px] text-white focus:border-[#3d5bff] focus:outline-none"
                >
                  {PODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                {bundle?.pod && (
                  <div className="mt-1 flex flex-col gap-1 p-2.5 bg-[#05070d] border border-white/5 font-mono text-[11px]">
                    <div className="flex justify-between text-[#8b96b0]">
                      <span>Serial number:</span>
                      <span className="text-[#dfe6f5]">{bundle.pod.serial_no}</span>
                    </div>
                    <div className="flex justify-between text-[#8b96b0]">
                      <span>Mechanism:</span>
                      <span className="text-[#dfe6f5]">{bundle.pod.release_mechanism}</span>
                    </div>
                    <div className="flex justify-between text-[#8b96b0]">
                      <span>Release time:</span>
                      <span className="text-[#dfe6f5]">
                        {bundle.pod.release_ts ? `${bundle.pod.release_ts.slice(11, 19)}Z` : "NULL"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#8b96b0]">
                      <span>Satellite:</span>
                      <span className="text-[#7ee2b8]">
                        {bundle.satellite ? `${bundle.satellite.node_id} (${bundle.satellite.state})` : "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-8 flex items-center justify-center p-2 bg-[#05070d] border border-white/5">
                <PodSvg status={podStatus} ejected={isEjected} />
              </div>
            </div>
          </div>
        </Panel>

        {/* TIMELINE STEP 02: TELEMETRY SIGNAL ARBITRATION */}
        <Panel cut={8} className="w-full">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] font-semibold text-[#7fb2ff] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10">
                  Step 2
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white">
                  Sensor agreement (2 of 3 must agree)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* State Badge */}
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border"
                  style={{
                    color: confirmedCount >= 2 ? "#7ee2b8" : "#f5a524",
                    borderColor: confirmedCount >= 2 ? "#7ee2b866" : "#f5a52466",
                    backgroundColor: confirmedCount >= 2 ? "#7ee2b815" : "#f5a52415",
                  }}
                >
                  {confirmedCount} OF 3 CONFIRMED
                </span>

                {/* Outcome Badge */}
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-white/15 bg-white/5 text-[#8b96b0]">
                  Checking signals
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {SIGNALS.map((s) => {
                const hits = bundle?.events.filter((e) => e.signal === s) ?? [];
                const lit = hits.some((e) => e.ok);
                return (
                  <div
                    key={s}
                    className="p-3 bg-[#05070d] border border-white/5 flex flex-col gap-2 justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-none"
                          style={{
                            backgroundColor: lit ? "#7ee2b8" : "#5f6f93",
                            boxShadow: lit ? "0 0 6px #7ee2b8" : undefined,
                          }}
                        />
                        <span className="font-mono text-[12px] font-semibold text-white">
                          {s}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#8b96b0]">
                        {hits.length} EVT
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                      <button
                        onClick={() => setOkState((p) => ({ ...p, [s]: !(p[s] ?? true) }))}
                        className="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-1 border border-white/10 bg-transparent text-[#dfe6f5] hover:border-white/20 cursor-pointer"
                      >
                        Signal ok: {okState[s] ? "true" : "false"}
                      </button>

                      <Locked action="deploy_signal" onTry={() => void onSignal(s)}>
                      <button
                        onClick={() => void onSignal(s)}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-1 bg-[#3d5bff] hover:bg-[#4f6bff] text-white font-semibold transition-colors cursor-pointer"
                      >
                        Send signal
                      </button>
                      </Locked>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* TIMELINE STEP 03: DEPLOYMENT TRANSACTION */}
        <Panel cut={8} className="w-full">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] font-semibold text-[#7fb2ff] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10">
                  Step 3
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white">
                  Release step (all or nothing)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* State Badge */}
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border"
                  style={{
                    color: stateColor(satState),
                    borderColor: `color-mix(in srgb, ${stateColor(satState)} 40%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${stateColor(satState)} 10%, transparent)`,
                  }}
                >
                  SAT: {satState}
                </span>

                {/* Transaction Outcome Badge */}
                {rolledBack ? (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524]">
                    Rolled back
                  </span>
                ) : after ? (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#7ee2b8]/60 bg-[#7ee2b8]/10 text-[#7ee2b8]">
                    Released
                  </span>
                ) : (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-white/15 bg-white/5 text-[#8b96b0]">
                    Ready
                  </span>
                )}
              </div>
            </div>

            <p className="font-sans text-[13px] leading-relaxed text-[#dfe6f5] max-w-[85ch]">
              When a release is confirmed, PostgreSQL opens a transaction that updates the pod to RELEASED,
              moves the satellite from STOWED to DEPLOYED, and records a row in deployment_log.
              If any step fails or is simulated as faulty, the transaction rolls back cleanly.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Locked
                action="deploy_confirm"
                reason="Only the mission director may release a satellite (EXECUTE on procedure confirm_deployment)."
                onTry={() => void onConfirm(false)}
              >
                <button
                  onClick={() => void onConfirm(false)}
                  disabled={busy !== null}
                  className="py-2 px-4 bg-[#3d5bff] hover:bg-[#4f6bff] text-white font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {busy === "confirm" ? "Confirming…" : "Confirm release"}
                </button>
              </Locked>

              <Locked
                action="deploy_confirm"
                reason="Only the mission director may release a satellite (EXECUTE on procedure confirm_deployment)."
                onTry={() => void onConfirm(true)}
              >
                <button
                  onClick={() => void onConfirm(true)}
                  disabled={busy !== null}
                  className="py-2 px-4 border border-[#f5a524]/60 bg-transparent hover:bg-[#f5a524]/10 text-[#f5a524] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {busy === "fail" ? "Simulating…" : "Simulate a failure"}
                </button>
              </Locked>

              <Locked
                action="deploy_confirm"
                reason="Only the mission director may release a satellite (EXECUTE on procedure confirm_deployment)."
                onTry={() => void onReset()}
              >
                <button
                  onClick={() => void onReset()}
                  disabled={busy !== null}
                  className="py-2 px-4 border border-white/15 bg-transparent hover:border-white/30 text-[#dfe6f5] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {busy === "reset" ? "Resetting…" : "Reset demo"}
                </button>
              </Locked>
            </div>
          </div>
        </Panel>

        {/* TIMELINE STEP 04: AUDIT LOG & BEFORE/AFTER DIFF */}
        {(before !== null || after !== null) && (
          <Panel cut={8} className="w-full">
            <div className="p-4 flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] font-semibold text-[#7fb2ff] px-2 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10">
                    Step 4
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white">
                    What changed
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Transaction Outcome Badge */}
                  {rolledBack ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#f5a524]/60 bg-[#f5a524]/10 text-[#f5a524]">
                      Rolled back, nothing changed
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#7ee2b8]/60 bg-[#7ee2b8]/10 text-[#7ee2b8]">
                      Saved
                    </span>
                  )}
                </div>
              </div>

              <p className="font-sans text-[13px] text-[#8b96b0]">
                {rolledBack
                  ? "Matching rows: the transaction rolled back and no database state changed. The deployment_log row was written as a separate audit trail."
                  : "Changed fields are highlighted in royal blue. The saved log row confirms the release."}
              </p>

              {/* Diff Cards Restyled as Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {before && (
                  <DiffCard
                    title="POD"
                    before={(before.pod ?? {}) as unknown as Record<string, unknown>}
                    after={(after?.pod ?? before.pod ?? {}) as unknown as Record<string, unknown>}
                  />
                )}
                {before && (
                  <DiffCard
                    title="SATELLITE"
                    before={(before.sat ?? {}) as unknown as Record<string, unknown>}
                    after={(after?.sat ?? before.sat ?? {}) as unknown as Record<string, unknown>}
                  />
                )}
              </div>

              {/* Deployment Log Audit Row */}
              {effectiveLog && (
                <div className="p-3 bg-[#05070d] border border-white/10 flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1">
                    <span className="text-[#8b96b0] uppercase">
                      Release log #{effectiveLog.log_id}
                    </span>
                    <span
                      className="px-1.5 py-0.2 border text-[9px] uppercase tracking-wider"
                      style={{
                        color: effectiveLog.outcome === "COMMITTED" ? "#7ee2b8" : "#f5a524",
                        borderColor:
                          effectiveLog.outcome === "COMMITTED"
                            ? "#7ee2b866"
                            : "#f5a52466",
                      }}
                    >
                      {effectiveLog.outcome}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[#dfe6f5]">
                    <div>
                      <span className="text-[#8b96b0]">Action: </span>
                      {effectiveLog.action}
                    </div>
                    <div>
                      <span className="text-[#8b96b0]">Logged at: </span>
                      {effectiveLog.logged_at}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[#8b96b0]">Detail: </span>
                      {effectiveLog.detail ?? "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      {/* State Machine & Illegal Jump Test Section */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Allowed satellite states (trigger trg_satellite_state)
            </span>
            <span className="font-mono text-[10px] text-[#8b96b0]">
              State rules
            </span>
          </div>

          <StateDiagram current={satState} />

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => void onIllegal()}
              className="py-1.5 px-3 border border-[#ff3b4f]/40 bg-transparent hover:border-[#ff3b4f] text-[#ff3b4f] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer"
            >
              Try a disallowed change (STOWED to NOMINAL)
            </button>
            <Link
              to="/labs/transactions"
              className="font-mono text-[11px] tracking-[0.1em] text-[#7fb2ff] hover:underline"
            >
              Open transactions lab →
            </Link>
          </div>

          {/* State-Machine Rejection Showing Red Critical Badge + Exact Postgres Error */}
          {illegalError !== null && (
            <Panel
              cut={8}
              borderColor="#ff3b4f"
              glowColor="rgba(255, 59, 79, 0.3)"
              className="w-full mt-2"
            >
              <div className="p-3.5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[#ff3b4f]/40 bg-[#ff3b4f]/10 text-[#ff3b4f]">
                    Change refused
                  </span>
                  <span className="font-mono text-[11px] text-[#ff3b4f]">
                    SQLSTATE {illegalError.sqlstate ?? illegalError.status}
                  </span>
                  <span className="font-mono text-[10px] text-[#8b96b0]">
                    TRIGGER trg_satellite_state
                  </span>
                </div>
                <div className="bg-[#05070d] border border-white/10 p-3 font-mono text-[12.5px] text-[#ff3b4f] leading-relaxed">
                  ERROR: {illegalError.message}
                </div>
                {illegalError.detail && (
                  <div className="font-mono text-[11px] text-[#8b96b0]">
                    DETAIL: {illegalError.detail}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {illegalMsg && !illegalError && (
            <div className="p-3 bg-[#05070d] border border-white/10 font-mono text-[11px] text-white">
              {illegalMsg}
            </div>
          )}
        </div>
      </Panel>

      {/* Pass Execution (SAVEPOINT Demo) */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Downlink pass (savepoint demo, execute_pass())
            </span>
            <span className="font-mono text-[10px] text-[#8b96b0]">
              Partial rollback
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="deploy-pass-sat"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
              >
                Pick a satellite
              </label>
              <select
                id="deploy-pass-sat"
                value={passSat}
                onChange={(e) => setPassSat(e.target.value)}
                className="font-mono bg-[#05070d] border border-white/10 px-2.5 py-1.5 text-[12px] text-white focus:border-[#3d5bff] focus:outline-none"
              >
                {PASS_SATS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label
                htmlFor="deploy-pass-contact"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
              >
                Pick a ground contact
              </label>
              <select
                id="deploy-pass-contact"
                value={passContactId ?? ""}
                onChange={(e) => setPassContactId(Number(e.target.value))}
                className="font-mono bg-[#05070d] border border-white/10 px-2.5 py-1.5 text-[12px] text-white focus:border-[#3d5bff] focus:outline-none"
              >
                {passContacts.length === 0 && <option value="">no downlink in window</option>}
                {passContacts.map((c) => (
                  <option key={c.contact_id} value={c.contact_id}>
                    #{c.contact_id} → {c.to_node} · {new Date(c.start_ts).toISOString().slice(11, 16)}Z · score {c.link_score}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => void onPass(false)}
              disabled={busy !== null || passContactId === null}
              className="py-2 px-4 bg-[#3d5bff] hover:bg-[#4f6bff] text-white font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy === "pass" ? "Running…" : "Run pass"}
            </button>
            <button
              onClick={() => void onPass(true)}
              disabled={busy !== null || passContactId === null}
              className="py-2 px-4 border border-[#f5a524]/60 bg-transparent hover:bg-[#f5a524]/10 text-[#f5a524] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy === "pass-fail" ? "Failing…" : "Run pass with a stage 2 failure"}
            </button>
          </div>

          {passResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Stages List with SAVEPOINT, ROLLBACK, COMMIT badges */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Pass steps
                </span>
                <div className="flex flex-col gap-2">
                  {passResult.stages.map((st, i) => {
                    const rolled = /roll/i.test(st.status);
                    const outcomeCol = rolled ? "#f5a524" : "#7ee2b8";
                    const outcomeBadge = rolled ? "ROLLBACK" : "COMMIT";

                    return (
                      <Panel key={i} cut={6} className="w-full">
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-[#8b96b0]">
                              Stage {i + 1}
                            </span>
                            <span className="font-mono text-[12px] font-semibold text-white">
                              {st.stage}
                            </span>
                            {/* Savepoint badge if stage 1 was saved */}
                            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-[#3d5bff]/40 bg-[#3d5bff]/10 text-[#7fb2ff]">
                              Savepoint
                            </span>
                            <span
                              className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border"
                              style={{
                                color: outcomeCol,
                                borderColor: `color-mix(in srgb, ${outcomeCol} 40%, transparent)`,
                                backgroundColor: `color-mix(in srgb, ${outcomeCol} 10%, transparent)`,
                              }}
                            >
                              {outcomeBadge}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-[#8b96b0]">
                            {st.packets} pkts · {st.bytes} B
                          </div>
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              </div>

              {/* Queue Buffer Comparison Before vs After */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  Waiting data before and after
                </span>
                <div className="flex flex-col gap-2.5 p-3 bg-[#05070d] border border-white/5">
                  {passModes.map((m) => {
                    const b = passResult.before.find((q) => q.mode === m)?.bytes ?? 0;
                    const a = passResult.after.find((q) => q.mode === m)?.bytes ?? 0;
                    return (
                      <div key={m} className="flex flex-col gap-1">
                        <div className="flex justify-between font-mono text-[11px]">
                          <span className="text-white font-medium">{m}</span>
                          <span className="text-[#8b96b0]">
                            {b} B → <span className="text-[#7ee2b8]">{a} B</span>
                          </span>
                        </div>
                        <DashedBar value={a} max={passMax} segments={24} fillColor="#3d5bff" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
