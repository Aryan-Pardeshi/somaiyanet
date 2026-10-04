import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "@/app/api";
import { BackendOffline } from "@/app/SqlDrawer";
import { ChapterLabel } from "@/components/story/ChapterLabel";
import { RowCard } from "@/components/story/RowCard";
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

/**
 * SomaiyaPod illustration, drawn to the real 127.4 × 57.9 × 57.2 mm
 * proportions. The PocketQube sits inside while ARMED, ejects when
 * RELEASED/CONFIRMED.
 */
function PodSvg({ status, ejected }: { status: string; ejected: boolean }) {
  const out = ejected;
  return (
    <svg viewBox="0 0 340 150" className="w-full" role="img" aria-label={`Pod ${status}`}>
      {/* pod tube: 127.4 long (x) — drawn 240 wide */}
      <rect x={20} y={45} width={240} height={60} rx={8} fill="var(--ink-3)" stroke="var(--rule)" strokeWidth={2} />
      <rect x={20} y={45} width={18} height={60} rx={8} fill="var(--ink)" stroke="var(--rule)" strokeWidth={1.5} />
      {/* spring plate */}
      <rect x={out ? 30 : 218} y={52} width={10} height={46} rx={2} fill="var(--amber)" opacity={0.9}>
        {!out && <animate attributeName="x" values="218;214;218" dur="2s" repeatCount="indefinite" />}
      </rect>
      {/* PocketQube 1P cube */}
      <g transform={out ? "translate(272,58)" : "translate(120,58)"} style={{ transition: "transform 800ms ease" }}>
        <rect x={-22} y={-22} width={44} height={44} rx={4} fill={out ? "var(--somaiya)" : "var(--ink-2)"} stroke={out ? "var(--somaiya)" : "var(--cream-dim)"} strokeWidth={2} />
        <rect x={-22} y={-22} width={44} height={10} rx={4} fill="var(--sky)" opacity={0.7} />
        <circle cx={0} cy={8} r={5} fill="var(--signal)" opacity={0.9} />
      </g>
      {out && (
        <line x1={258} y1={80} x2={272} y2={80} stroke="var(--somaiya)" strokeWidth={2} strokeDasharray="4 3" />
      )}
      <text x={20} y={128} fill="var(--mute)" fontSize={10} fontFamily="IBM Plex Mono, monospace">
        SomaiyaPod · 127.4 × 57.9 × 57.2 mm · {status}
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
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Satellite state machine">
      {STATES.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className={`font-mono rounded-full border px-2.5 py-1 text-[10px] tracking-[0.1em] ${
              current === s
                ? "border-[var(--somaiya)] bg-[var(--somaiya-soft)] text-[var(--cream)]"
                : "border-[var(--rule)] text-[var(--mute)]"
            }`}
            style={current === s ? { boxShadow: "0 0 12px var(--somaiya)" } : undefined}
          >
            {s}
          </span>
          {i < STATES.length - 1 && (
            <span className="font-mono text-[var(--mute)]">→</span>
          )}
        </span>
      ))}
      <span className="font-mono mt-1 w-full text-[10px] text-[var(--mute)]">
        legal jumps: {edges.map(([a, b]) => `${a}→${b}`).join(" · ")} (+ NOMINAL⇄SAFE, →DECOMMISSIONED)
      </span>
    </div>
  );
}

const PASS_SATS = ["SAT-A1", "SAT-A2", "SAT-A3", "SAT-A4", "SAT-B1", "SAT-B2", "SAT-B3"];

export default function Deploy() {
  const [pod, setPod] = useState("POD-B4");
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
  const [busy, setBusy] = useState<string | null>(null);

  // Pass execution state
  const [passSat, setPassSat] = useState("SAT-A1");
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
      // Failure path: backend returns before/after inside the error body.
      if (e instanceof ApiError) {
        setError(e);
        const data = (e as unknown as { data?: ConfirmFail }).data;
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
    try {
      await apiFetch("/api/console", {
        method: "POST",
        body: JSON.stringify({
          query: "UPDATE satellite SET state = 'NOMINAL' WHERE node_id = 'SAT-B4'",
        }),
      });
      setIllegalMsg("Unexpectedly allowed — the trigger should have fired.");
    } catch (e) {
      if (e instanceof ApiError) {
        setIllegalMsg(
          `Console refused (${e.sqlstate ?? e.status}): ${e.message}. ` +
            `The live trigger trg_satellite_state would raise ` +
            `'illegal state transition STOWED -> NOMINAL for SAT-B4'.`,
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

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <main className="shell py-10">
        <ChapterLabel index="DEPLOY" title="SomaiyaPod" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Deployment &amp; transactions
          </h1>
          <ExpCo exp="Exp 9" co="CO4" />
        </div>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--cream-dim)]">
          Two signals agree, the pod fires, the sat wakes. Every step is a
          transaction you can roll back on purpose.
        </p>

        {offline && (
          <div className="mt-6">
            <BackendOffline onRetry={() => refresh(pod)} />
          </div>
        )}
        {error !== null && (
          <div className="mt-6">
            <RefusedCard err={error} />
          </div>
        )}

        {/* Pod selector + illustration */}
        <section className="mt-6 grid gap-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4 lg:grid-cols-2">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--mute)]">
              pod
            </label>
            <select
              value={pod}
              onChange={(e) => setPod(e.target.value)}
              className="font-mono mt-1.5 w-full rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-2 text-[13px] text-[var(--cream)]"
            >
              {PODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div className="mt-3">
              <PodSvg
                status={bundle?.pod?.status ?? "…"}
                ejected={
                  bundle?.pod?.status === "RELEASED" ||
                  bundle?.pod?.status === "CONFIRMED"
                }
              />
            </div>
            {bundle?.pod && (
              <RowCard
                title={`deployer_pod · ${bundle.pod.pod_id}`}
                rows={[
                  ["status", bundle.pod.status],
                  ["serial_no", bundle.pod.serial_no],
                  ["mechanism", bundle.pod.release_mechanism],
                  ["release_ts", bundle.pod.release_ts ?? "NULL"],
                  ["satellite", bundle.satellite ? `${bundle.satellite.node_id} · ${bundle.satellite.state}` : "—"],
                ]}
              />
            )}
          </div>

          {/* Signals + actions */}
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
              deploy signals · {confirmedCount} of 3 confirmed (need 2)
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {SIGNALS.map((s) => {
                const hits = bundle?.events.filter((e) => e.signal === s) ?? [];
                const lit = hits.some((e) => e.ok);
                return (
                  <div
                    key={s}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--ink)] px-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block size-3 rounded-full"
                      style={{
                        background: lit ? "var(--signal)" : "var(--mute)",
                        boxShadow: lit ? "0 0 10px var(--signal)" : undefined,
                      }}
                    />
                    <span className="font-mono text-[12px] text-[var(--cream)]">{s}</span>
                    <span className="font-mono text-[10px] text-[var(--mute)]">
                      {hits.length > 0 ? `${hits.length} event${hits.length > 1 ? "s" : ""}` : "no signal yet"}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => setOkState((p) => ({ ...p, [s]: !(p[s] ?? true) }))}
                        aria-label={`Toggle ok for ${s}`}
                        className="font-mono rounded-full border border-[var(--rule)] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--cream-dim)]"
                      >
                        ok: {okState[s] ? "true" : "false"}
                      </button>
                      <button
                        onClick={() => void onSignal(s)}
                        className="font-mono rounded-full bg-[var(--somaiya)] px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-white hover:scale-105"
                      >
                        send
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => void onConfirm(false)}
                disabled={busy !== null}
                className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-[1.02] disabled:opacity-50"
              >
                {busy === "confirm" ? "confirming…" : "Confirm deployment"}
              </button>
              <button
                onClick={() => void onConfirm(true)}
                disabled={busy !== null}
                className="font-mono rounded-full border border-[var(--amber)]/60 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--amber)] hover:bg-[var(--somaiya-soft)] disabled:opacity-50"
              >
                {busy === "fail" ? "failing…" : "Simulate failure"}
              </button>
              <button
                onClick={() => void onReset()}
                disabled={busy !== null}
                className="font-mono rounded-full border border-[var(--rule)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--cream-dim)] hover:text-[var(--cream)] disabled:opacity-50"
              >
                {busy === "reset" ? "resetting…" : "Reset demo"}
              </button>
            </div>
          </div>
        </section>

        {/* Before / after */}
        {(before !== null || after !== null) && (
          <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
                before / after
              </h2>
              {rolledBack && (
                <span className="font-mono rotate-[-2deg] rounded border-2 border-[var(--amber)] px-2 py-0.5 text-[11px] tracking-[0.14em] text-[var(--amber)]">
                  ROLLED BACK
                </span>
              )}
            </div>
            <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--cream-dim)]">
              {rolledBack
                ? "Identical rows: the transaction rolled back, nothing changed. The deployment_log row below still exists because it was written in a separate transaction — and deployment_log has no foreign keys, so nothing cascades it away."
                : "Changed fields glow red. The COMMITTED log row is the audit twin of the same transaction."}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {before && (
                <DiffCard
                  title="pod"
                  before={(before.pod ?? {}) as unknown as Record<string, unknown>}
                  after={(after?.pod ?? before.pod ?? {}) as unknown as Record<string, unknown>}
                />
              )}
              {before && (
                <DiffCard
                  title="satellite"
                  before={(before.sat ?? {}) as unknown as Record<string, unknown>}
                  after={(after?.sat ?? before.sat ?? {}) as unknown as Record<string, unknown>}
                />
              )}
            </div>
            {lastLog.length > 0 && (
              <div className="mt-3">
                <RowCard
                  title={`deployment_log #${lastLog[0].log_id} · ${lastLog[0].outcome}`}
                  rows={[
                    ["action", lastLog[0].action],
                    ["outcome", lastLog[0].outcome],
                    ["detail", (lastLog[0].detail ?? "—").slice(0, 160)],
                    ["logged_at", lastLog[0].logged_at],
                  ]}
                />
              </div>
            )}
            {bundle && bundle.log.length > 0 && lastLog.length === 0 && (
              <div className="mt-3">
                <RowCard
                  title={`deployment_log #${bundle.log[0].log_id} · ${bundle.log[0].outcome}`}
                  rows={[
                    ["action", bundle.log[0].action],
                    ["outcome", bundle.log[0].outcome],
                    ["detail", (bundle.log[0].detail ?? "—").slice(0, 160)],
                    ["logged_at", bundle.log[0].logged_at],
                  ]}
                />
              </div>
            )}
          </section>
        )}

        {/* State machine + illegal jump */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
            state machine · trg_satellite_state
          </h2>
          <div className="mt-3">
            <StateDiagram current={bundle?.satellite?.state ?? null} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void onIllegal()}
              className="font-mono rounded-full border border-[var(--somaiya)]/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--cream)] hover:bg-[var(--somaiya-soft)]"
            >
              Try illegal jump (STOWED → NOMINAL)
            </button>
            <Link
              to="/labs/transactions"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sky)] hover:underline"
            >
              open /labs/transactions →
            </Link>
          </div>
          {illegalMsg && (
            <p className="font-mono mt-2 rounded-lg border border-[var(--somaiya)]/50 bg-[var(--somaiya-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--cream)]">
              {illegalMsg}
            </p>
          )}
        </section>

        {/* Pass execution */}
        <section className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cream-dim)]">
            pass execution · SAVEPOINT demo · execute_pass()
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
                sat
              </span>
              <select
                value={passSat}
                onChange={(e) => setPassSat(e.target.value)}
                className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-2 text-[13px] text-[var(--cream)]"
              >
                {PASS_SATS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
                downlink contact
              </span>
              <select
                value={passContactId ?? ""}
                onChange={(e) => setPassContactId(Number(e.target.value))}
                className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-2 text-[13px] text-[var(--cream)]"
              >
                {passContacts.length === 0 && <option value="">no downlink in window</option>}
                {passContacts.map((c) => (
                  <option key={c.contact_id} value={c.contact_id}>
                    #{c.contact_id} → {c.to_node} · {new Date(c.start_ts).toISOString().slice(11, 16)}Z · score {c.link_score}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void onPass(false)}
              disabled={busy !== null || passContactId === null}
              className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-[1.02] disabled:opacity-50"
            >
              {busy === "pass" ? "executing…" : "Execute pass"}
            </button>
            <button
              onClick={() => void onPass(true)}
              disabled={busy !== null || passContactId === null}
              className="font-mono rounded-full border border-[var(--amber)]/60 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--amber)] hover:bg-[var(--somaiya-soft)] disabled:opacity-50"
            >
              {busy === "pass-fail" ? "failing…" : "Execute with stage-2 failure"}
            </button>
          </div>

          {passResult && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ol className="relative ml-2 flex flex-col gap-3 border-l border-dashed border-[var(--rule)] pl-5">
                {passResult.stages.map((st, i) => {
                  const rolled = /roll/i.test(st.status);
                  return (
                    <li key={i} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[27px] top-1 size-2.5 rounded-full"
                        style={{
                          background: rolled ? "var(--amber)" : "var(--signal)",
                          boxShadow: `0 0 8px ${rolled ? "var(--amber)" : "var(--signal)"}`,
                        }}
                      />
                      <p className="font-mono text-[12px] text-[var(--cream)]">
                        {st.stage} · {rolled ? "ROLLED BACK TO SAVEPOINT" : st.status}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--cream-dim)]">
                        {st.packets} packets · {st.bytes} bytes
                      </p>
                    </li>
                  );
                })}
              </ol>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
                  queued bytes by mode · before → after
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {passModes.map((m) => {
                    const b = passResult.before.find((q) => q.mode === m)?.bytes ?? 0;
                    const a = passResult.after.find((q) => q.mode === m)?.bytes ?? 0;
                    return (
                      <div key={m}>
                        <span className="font-mono flex justify-between text-[11px]">
                          <span className="text-[var(--cream)]">{m}</span>
                          <span className="text-[var(--cream-dim)]">
                            {b} → {a} B
                          </span>
                        </span>
                        <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[var(--ink)]">
                          <span
                            className="block h-full rounded-full bg-[var(--sky)]"
                            style={{ width: `${(b / passMax) * 100}%`, opacity: 0.45 }}
                          />
                        </span>
                        <span className="mt-0.5 block h-2 overflow-hidden rounded-full bg-[var(--ink)]">
                          <span
                            className="block h-full rounded-full bg-[var(--somaiya)]"
                            style={{ width: `${(a / passMax) * 100}%` }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
