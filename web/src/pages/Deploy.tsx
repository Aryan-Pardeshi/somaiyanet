import { useCallback, useEffect, useState } from "react";
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
  const code = String(err.sqlstate ?? err.status ?? "42501");
  const is42501 = err.sqlstate === "42501" || String(err.message ?? "").includes("42501");
  return (
    <Panel className="w-full">
      <div role="alert" className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="sx-status" data-tone="critical">
            {is42501 ? "Permission denied by PostgreSQL" : "PostgreSQL refused"}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-[var(--sx-red)]">
              {code}
            </span>
            {context && (
              <span className="sx-caption text-[var(--sx-text-3)]">· {context}</span>
            )}
          </div>
        </div>
        <p className="font-mono text-[13px] text-[var(--sx-text)] leading-relaxed whitespace-pre-wrap">
          {err.message}
        </p>
        {err.detail && (
          <p className="font-mono text-[12px] text-[var(--sx-text-2)]">{err.detail}</p>
        )}
      </div>
    </Panel>
  );
}

/**
 * SomaiyaPod illustration, drawn to real 127.4 × 57.9 × 57.2 mm proportions.
 */
function PodSvg({ status, ejected }: { status: string; ejected: boolean }) {
  const out = ejected;
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
        fill="#111113"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1.5}
      />
      <rect
        x={20}
        y={45}
        width={18}
        height={60}
        rx={2}
        fill="#0a0a0a"
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
        fill="var(--sx-orange)"
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
          fill={out ? "#1c1c1e" : "#111113"}
          stroke={out ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.25)"}
          strokeWidth={1.5}
        />
        <rect
          x={-22}
          y={-22}
          width={44}
          height={10}
          rx={1}
          fill="rgba(255, 255, 255, 0.2)"
        />
        <circle cx={0} cy={8} r={5} fill="var(--sx-green)" />
      </g>
      {out && (
        <line
          x1={258}
          y1={80}
          x2={272}
          y2={80}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      <text
        x={20}
        y={130}
        fill="var(--sx-text-3)"
        fontSize={11}
        fontFamily="var(--font-sans)"
      >
        SOMAIYAPOD · 127.4 × 57.9 × 57.2 mm · status: {status}
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
    <div className="flex flex-col gap-2.5" role="img" aria-label="Satellite state machine">
      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((s, i) => {
          const isActive = current === s;
          return (
            <span key={s} className="flex items-center gap-2">
              <span
                className={`font-[var(--font-display)] text-[12px] capitalize px-2.5 py-1 rounded-[6px] transition-colors ${
 isActive
 ? "bg-[var(--sx-surface-2)] text-white font-semibold border border-white/20"
 : "text-white/40 border border-white/5"
 }`}
              >
                {s}
              </span>
              {i < STATES.length - 1 && (
                <span className="text-white/30 text-[12px]">→</span>
              )}
            </span>
          );
        })}
      </div>
      <span className="sx-caption text-[var(--sx-text-3)]">
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
      // The API tries the UPDATE as this role and always rolls it back.
      const r = await apiFetch<{ allowed: boolean; from_state?: string }>("/api/deploy/illegal", {
        method: "POST",
      });
      setIllegalMsg(
        `Allowed, because SS-4 is ${r.data.from_state ?? "no longer STOWED"} and that step to NOMINAL is legal. ` +
          `Nothing was saved. Press Reset demo to put SS-4 back in its pod, then try again.`,
      );
    } catch (e) {
      if (e instanceof ApiError) setIllegalError(e);
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
    <div className="w-full flex flex-col gap-6">
      {/* Page Title Row */}
      <div className="flex flex-col gap-2 border-b border-[var(--sx-hairline)] pb-4">
        <h1 className="sx-h1">Deploy</h1>
        <p className="sx-lead">
          Two signals agree, the pod opens, the satellite wakes. Every step runs in a
          transaction you can roll back on purpose (confirm_deployment).
        </p>
        <RoleHeader />
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

      {/* Transaction sequence summary as a vertical inset-grouped list */}
      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-3">
          <span className="sx-eyebrow">Transaction story · BEGIN → COMMIT</span>
          <div className="sx-group">
            <div className="sx-row">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">01</span>
                <span className="sx-body text-white">Inspect pod & satellite</span>
              </div>
              <span className="sx-status" data-tone={isEjected ? "ok" : undefined}>
                {isEjected ? "Committed" : "Pending"}
              </span>
            </div>
            <div className="sx-row">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">02</span>
                <span className="sx-body text-white">Arbitrate telemetry signals</span>
              </div>
              <span className="sx-status" data-tone={confirmedCount >= 2 ? "ok" : "warn"}>
                {confirmedCount >= 2 ? `${confirmedCount}/3 agreed` : "Pending signals"}
              </span>
            </div>
            <div className="sx-row">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">03</span>
                <span className="sx-body text-white">Execute confirm_deployment()</span>
              </div>
              <span
                className="sx-status"
                data-tone={rolledBack ? "critical" : after ? "ok" : undefined}
              >
                {rolledBack ? "Rolled back" : after ? "Committed" : "Pending"}
              </span>
            </div>
            <div className="sx-row">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">04</span>
                <span className="sx-body text-white">Audit trail & state verification</span>
              </div>
              <span
                className="sx-status"
                data-tone={rolledBack ? "critical" : after ? "ok" : undefined}
              >
                {rolledBack ? "Rollback logged" : after ? "Committed" : "Pending"}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      {/* SomaiyaPod Sequence as a Vertical Console Timeline */}
      <div className="flex flex-col gap-4">
        {/* TIMELINE STEP 01: POD INSPECTION */}
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2.5">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">01</span>
                <h3 className="sx-h3">Check the pod and its satellite</h3>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="sx-status"
                  data-tone={isEjected ? "ok" : undefined}
                >
                  POD: {podStatus}
                </span>
                <span className="sx-caption text-[var(--sx-text-3)]">
                  Before release
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="deploy-pod"
                    className="sx-eyebrow"
                  >
                    Pick a pod
                  </label>
                  <select
                    id="deploy-pod"
                    value={pod}
                    onChange={(e) => setPod(e.target.value)}
                    className="bg-[var(--sx-surface)] text-white border border-[var(--sx-hairline)] rounded-[10px] h-[44px] px-3.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-white transition-all cursor-pointer"
                  >
                    {PODS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {bundle?.pod && (
                  <div className="sx-group">
                    <div className="sx-row text-[13px]">
                      <span className="text-[var(--sx-text-2)]">Serial number</span>
                      <span className="font-mono text-white">{bundle.pod.serial_no}</span>
                    </div>
                    <div className="sx-row text-[13px]">
                      <span className="text-[var(--sx-text-2)]">Mechanism</span>
                      <span className="text-white">{bundle.pod.release_mechanism}</span>
                    </div>
                    <div className="sx-row text-[13px]">
                      <span className="text-[var(--sx-text-2)]">Release time</span>
                      <span className="font-mono text-white">
                        {bundle.pod.release_ts ? `${bundle.pod.release_ts.slice(11, 19)}Z` : "NULL"}
                      </span>
                    </div>
                    <div className="sx-row text-[13px]">
                      <span className="text-[var(--sx-text-2)]">Satellite</span>
                      <span className="text-white">
                        {bundle.satellite ? `${bundle.satellite.node_id} (${bundle.satellite.state})` : "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-8 flex items-center justify-center p-4 bg-[var(--sx-night)] rounded-[10px] border border-[var(--sx-hairline)]">
                <PodSvg status={podStatus} ejected={isEjected} />
              </div>
            </div>
          </div>
        </Panel>

        {/* TIMELINE STEP 02: TELEMETRY SIGNAL ARBITRATION */}
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2.5">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">02</span>
                <h3 className="sx-h3">Sensor agreement (2 of 3 must agree)</h3>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="sx-status"
                  data-tone={confirmedCount >= 2 ? "ok" : "warn"}
                >
                  {confirmedCount} of 3 confirmed
                </span>
                <span className="sx-caption text-[var(--sx-text-3)]">
                  Checking signals
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SIGNALS.map((s) => {
                const hits = bundle?.events.filter((e) => e.signal === s) ?? [];
                const lit = hits.some((e) => e.ok);
                return (
                  <div
                    key={s}
                    className="p-3.5 bg-[var(--sx-night)] rounded-[10px] border border-[var(--sx-hairline)] flex flex-col gap-3 justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="sx-status"
                          data-tone={lit ? "ok" : undefined}
                        />
                        <span className="font-mono text-[13px] font-semibold text-white">
                          {s}
                        </span>
                      </div>
                      <span className="sx-caption text-[var(--sx-text-3)]">
                        {hits.length} EVT
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--sx-hairline)]">
                      <button
                        onClick={() => setOkState((p) => ({ ...p, [s]: !(p[s] ?? true) }))}
                        className="sx-btn sx-btn--sm sx-btn--quiet"
                      >
                        Signal ok: {okState[s] ? "true" : "false"}
                      </button>

                      <Locked action="deploy_signal" onTry={() => void onSignal(s)}>
                        <button
                          onClick={() => void onSignal(s)}
                          className="sx-btn sx-btn--sm"
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
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2.5">
              <div className="flex items-center gap-3">
                <span className="sx-num text-white/40 text-[14px]">03</span>
                <h3 className="sx-h3">Release step (all or nothing)</h3>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="sx-status"
                  data-tone={rolledBack ? "critical" : after ? "ok" : undefined}
                >
                  SAT: {satState}
                </span>
                <span className="sx-caption text-[var(--sx-text-3)]">
                  {rolledBack ? "Rolled back" : after ? "Released" : "Ready"}
                </span>
              </div>
            </div>

            <p className="sx-body max-w-3xl">
              When a release is confirmed, PostgreSQL opens a transaction that updates the pod to RELEASED,
              moves the satellite from STOWED to DEPLOYED, and records a row in deployment_log.
              If any step fails or is simulated as faulty, the transaction rolls back cleanly.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Locked
                action="deploy_confirm"
                reason="Only the mission director may release a satellite (EXECUTE on procedure confirm_deployment)."
                onTry={() => void onConfirm(false)}
              >
                <button
                  onClick={() => void onConfirm(false)}
                  disabled={busy !== null}
                  className="sx-btn sx-btn--filled"
                >
                  {busy === "confirm" ? "Deploying…" : "Deploy SomaiyaSat-4"}
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
                  className="sx-btn"
                >
                  {busy === "fail" ? "Rolling back…" : "Roll back"}
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
                  className="sx-btn sx-btn--quiet"
                >
                  {busy === "reset" ? "Resetting…" : "Reset demo"}
                </button>
              </Locked>
            </div>
          </div>
        </Panel>

        {/* TIMELINE STEP 04: AUDIT LOG & BEFORE/AFTER DIFF */}
        {(before !== null || after !== null) && (
          <Panel className="w-full">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2.5">
                <div className="flex items-center gap-3">
                  <span className="sx-num text-white/40 text-[14px]">04</span>
                  <h3 className="sx-h3">What changed</h3>
                </div>

                <span
                  className="sx-status"
                  data-tone={rolledBack ? "critical" : "ok"}
                >
                  {rolledBack ? "Rolled back, nothing changed" : "Saved"}
                </span>
              </div>

              <p className="sx-body">
                {rolledBack
                  ? "Matching rows: the transaction rolled back and no database state changed. The deployment_log row was written as a separate audit trail."
                  : "Changed fields are highlighted in white. The saved log row confirms the release."}
              </p>

              {/* Diff Cards Restyled as Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="sx-group">
                  <div className="sx-row">
                    <span className="sx-eyebrow">
                      Release log #{effectiveLog.log_id}
                    </span>
                    <span
                      className="sx-status"
                      data-tone={effectiveLog.outcome === "COMMITTED" ? "ok" : "warn"}
                    >
                      {effectiveLog.outcome}
                    </span>
                  </div>
                  <div className="sx-row text-[13px]">
                    <span className="text-[var(--sx-text-2)]">Action</span>
                    <span className="text-white">{effectiveLog.action}</span>
                  </div>
                  <div className="sx-row text-[13px]">
                    <span className="text-[var(--sx-text-2)]">Logged at</span>
                    <span className="font-mono text-white">{effectiveLog.logged_at}</span>
                  </div>
                  {effectiveLog.detail && (
                    <div className="sx-row text-[13px]">
                      <span className="text-[var(--sx-text-2)]">Detail</span>
                      <span className="text-white">{effectiveLog.detail}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      {/* State Machine & Illegal Jump Test Section */}
      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2.5">
            <span className="sx-eyebrow">
              Allowed satellite states (trigger trg_satellite_state)
            </span>
            <span className="sx-caption text-[var(--sx-text-3)]">
              State rules
            </span>
          </div>

          <StateDiagram current={satState} />

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => void onIllegal()}
              className="sx-btn sx-btn--sm"
            >
              Try a disallowed change (STOWED to NOMINAL)
            </button>
          </div>

          {/* State-Machine Rejection Showing Red Critical Badge + Exact Postgres Error */}
          {illegalError !== null && (
            <RefusedCard err={illegalError} context="trg_satellite_state" />
          )}

          {illegalMsg && !illegalError && (
            <div className="p-3 bg-[var(--sx-night)] rounded-[10px] border border-[var(--sx-hairline)] font-mono text-[12px] text-white">
              {illegalMsg}
            </div>
          )}
        </div>
      </Panel>

      {/* Pass Execution (SAVEPOINT Demo) */}
      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2.5">
            <span className="sx-eyebrow">
              Downlink pass (savepoint demo, execute_pass())
            </span>
            <span className="sx-caption text-[var(--sx-text-3)]">
              Partial rollback
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="deploy-pass-sat"
                className="sx-eyebrow"
              >
                Pick a satellite
              </label>
              <select
                id="deploy-pass-sat"
                value={passSat}
                onChange={(e) => setPassSat(e.target.value)}
                className="bg-[var(--sx-surface)] text-white border border-[var(--sx-hairline)] rounded-[10px] h-[44px] px-3.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-white transition-all cursor-pointer"
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
                className="sx-eyebrow"
              >
                Pick a ground contact
              </label>
              <select
                id="deploy-pass-contact"
                value={passContactId ?? ""}
                onChange={(e) => setPassContactId(Number(e.target.value))}
                className="bg-[var(--sx-surface)] text-white border border-[var(--sx-hairline)] rounded-[10px] h-[44px] px-3.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-white transition-all cursor-pointer"
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
              className="sx-btn sx-btn--sm"
            >
              {busy === "pass" ? "Running…" : "Run pass"}
            </button>
            <button
              onClick={() => void onPass(true)}
              disabled={busy !== null || passContactId === null}
              className="sx-btn sx-btn--sm"
            >
              {busy === "pass-fail" ? "Failing…" : "Run pass with a stage 2 failure"}
            </button>
          </div>

          {passResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Stages List with SAVEPOINT, ROLLBACK, COMMIT badges */}
              <div className="flex flex-col gap-2">
                <span className="sx-eyebrow">
                  Pass steps
                </span>
                <div className="sx-group">
                  {passResult.stages.map((st, i) => {
                    const rolled = /roll/i.test(st.status);

                    return (
                      <div key={i} className="sx-row">
                        <div className="flex items-center gap-2.5">
                          <span className="sx-num text-white/40 text-[13px]">
                            {i + 1}
                          </span>
                          <span className="font-mono text-[13px] font-semibold text-white">
                            {st.stage}
                          </span>
                          <span className="sx-caption text-[var(--sx-text-3)]">
                            Savepoint
                          </span>
                          <span
                            className="sx-status"
                            data-tone={rolled ? "warn" : "ok"}
                          >
                            {rolled ? "ROLLBACK" : "COMMIT"}
                          </span>
                        </div>
                        <div className="sx-num text-[12px] text-[var(--sx-text-2)]">
                          {st.packets} pkts · {st.bytes} B
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Queue Buffer Comparison Before vs After */}
              <div className="flex flex-col gap-2">
                <span className="sx-eyebrow">
                  Waiting data before and after
                </span>
                <div className="flex flex-col gap-3 p-4 bg-[var(--sx-night)] rounded-[10px] border border-[var(--sx-hairline)]">
                  {passModes.map((m) => {
                    const b = passResult.before.find((q) => q.mode === m)?.bytes ?? 0;
                    const a = passResult.after.find((q) => q.mode === m)?.bytes ?? 0;
                    return (
                      <div key={m} className="flex flex-col gap-1.5">
                        <div className="flex justify-between font-mono text-[12px]">
                          <span className="text-white font-medium">{m}</span>
                          <span className="text-[var(--sx-text-2)]">
                            <span className="sx-num">{b}</span> B → <span className="sx-num text-white">{a}</span> B
                          </span>
                        </div>
                        <DashedBar value={a} max={passMax} segments={24} fillColor="#ffffff" />
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
