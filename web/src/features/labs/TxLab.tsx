import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { highlightSql } from "@/app/sql";
import { DataGrid, OfflineOrEmpty, Panel } from "./common";
import type { TxExecResult, TxLabState, TxScenario, TxSessionState, TxStep } from "./types";

const FALLBACK_SCENARIOS: TxScenario[] = [
  {
    key: "lost_update",
    title: "Lost update",
    description: "READ COMMITTED read-modify-write loses A's update; FOR UPDATE fixes it.",
    steps: [
      { session: "A", sql: "BEGIN; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "A reads 100." },
      { session: "B", sql: "BEGIN; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "B reads the same 100." },
      { session: "A", sql: "UPDATE lab_account SET power_credits = 90 WHERE id = 1; COMMIT;", expect: "ok", explain: "A writes 90 and commits." },
      { session: "B", sql: "UPDATE lab_account SET power_credits = 80 WHERE id = 1; COMMIT;", expect: "ok", explain: "B overwrites with 80 — A's update is lost." },
    ],
  },
  {
    key: "non_repeatable_read",
    title: "Non-repeatable read",
    description: "READ COMMITTED sees B's commit mid-transaction; REPEATABLE READ pins a snapshot.",
    steps: [
      { session: "A", sql: "BEGIN ISOLATION LEVEL READ COMMITTED; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "A reads first value." },
      { session: "B", sql: "UPDATE lab_account SET power_credits = 70 WHERE id = 1; COMMIT;", expect: "ok", explain: "B commits a change." },
      { session: "A", sql: "SELECT power_credits FROM lab_account WHERE id = 1; COMMIT;", expect: "ok", explain: "A re-reads: different value." },
    ],
  },
  {
    key: "phantom_or_write_skew",
    title: "Write skew (SERIALIZABLE)",
    description: "Both read the sum then update different rows — one gets 40001.",
    steps: [
      { session: "A", sql: "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT SUM(power_credits) FROM lab_account;", expect: "ok", explain: "A reads the sum." },
      { session: "B", sql: "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT SUM(power_credits) FROM lab_account;", expect: "ok", explain: "B reads the same sum." },
      { session: "A", sql: "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 1;", expect: "ok", explain: "A debits row 1." },
      { session: "B", sql: "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 2;", expect: "ok", explain: "B debits row 2." },
      { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits first." },
      { session: "B", sql: "COMMIT;", expect: "error:40001", explain: "B gets SERIALIZATION FAILURE 40001 — retry." },
    ],
  },
  {
    key: "deadlock",
    title: "Deadlock",
    description: "A locks 1, B locks 2, then each wants the other — 40P01 aborts a victim.",
    steps: [
      { session: "A", sql: "BEGIN; SELECT * FROM lab_account WHERE id = 1 FOR UPDATE;", expect: "ok", explain: "A locks row 1." },
      { session: "B", sql: "BEGIN; SELECT * FROM lab_account WHERE id = 2 FOR UPDATE;", expect: "ok", explain: "B locks row 2." },
      { session: "A", sql: "SELECT * FROM lab_account WHERE id = 2 FOR UPDATE;", expect: "waits", explain: "A waits on B." },
      { session: "B", sql: "SELECT * FROM lab_account WHERE id = 1 FOR UPDATE;", expect: "error:40P01", explain: "Cycle: Postgres aborts a victim with 40P01." },
    ],
  },
  {
    key: "skip_locked",
    title: "SKIP LOCKED dispatch",
    description: "Two router workers claim disjoint packet sets.",
    steps: [
      { session: "A", sql: "BEGIN; SELECT * FROM dispatch_packets('SS-1', 'worker-A', 20000);", expect: "ok", explain: "Worker A claims its batch." },
      { session: "B", sql: "BEGIN; SELECT * FROM dispatch_packets('SS-1', 'worker-B', 20000);", expect: "ok", explain: "Worker B skips A's locked rows — disjoint ids." },
      { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits." },
      { session: "B", sql: "COMMIT;", expect: "ok", explain: "B commits." },
    ],
  },
  {
    key: "mvcc",
    title: "MVCC row versions",
    description: "Uncommitted UPDATE shows xmin/xmax/ctid divergence between sessions.",
    steps: [
      { session: "A", sql: "BEGIN; UPDATE deployer_pod SET temperature_c = temperature_c + 1 WHERE pod_id = 'POD-1';", expect: "ok", explain: "A updates without committing." },
      { session: "A", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-1';", expect: "ok", explain: "A sees the new version." },
      { session: "B", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-1'; SELECT txid_current();", expect: "ok", explain: "B still sees the old version." },
      { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits; B now sees the new ctid." },
    ],
  },
  {
    key: "wal",
    title: "WAL / LSN",
    description: "Bulk telemetry insert moves pg_current_wal_lsn forward.",
    steps: [
      { session: "A", sql: "SELECT pg_current_wal_lsn() AS lsn_before;", expect: "ok", explain: "Record the LSN." },
      { session: "A", sql: "BEGIN; INSERT INTO telemetry SELECT now(), 'SS-1', 7.5, 22.0, 100, NULL, '{}' FROM generate_series(1, 1000); COMMIT;", expect: "ok", explain: "Write 1000 rows in one transaction." },
      { session: "A", sql: "SELECT pg_current_wal_lsn() AS lsn_after;", expect: "ok", explain: "LSN advanced; diff is the WAL bytes." },
    ],
  },
];

type SessKey = "A" | "B";

interface LogEntry {
  n: number;
  session: SessKey;
  sql: string;
  status: string;
  detail: string;
}

function matchExpect(expect: string, res: TxExecResult): boolean {
  if (expect === "waits" || expect === "waiting") return res.status === "waiting";
  if (expect.startsWith("error:")) {
    const code = expect.slice("error:".length);
    const msg = `${res.sqlstate ?? ""} ${res.message ?? ""} ${res.notice ?? ""}`;
    return msg.includes(code);
  }
  return res.status === "done";
}

export function TxLab() {
  const [scenarios, setScenarios] = useState<TxScenario[]>(FALLBACK_SCENARIOS);
  const [usingFallback, setUsingFallback] = useState(true);
  const [scenarioKey, setScenarioKey] = useState(FALLBACK_SCENARIOS[0].key);
  const [stepIdx, setStepIdx] = useState(0);
  const [labId, setLabId] = useState<string | null>(null);
  const [pids, setPids] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [state, setState] = useState<TxLabState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputs, setInputs] = useState<Record<SessKey, string>>({ A: "", B: "" });
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<unknown>(null);
  const [verdicts, setVerdicts] = useState<boolean[]>([]);
  const logN = useRef(0);
  const pollRef = useRef<number | null>(null);

  const scenario = scenarios.find((s) => s.key === scenarioKey) ?? scenarios[0];
  const doneSteps = stepIdx >= scenario.steps.length;

  const loadScenarios = useCallback(async () => {
    try {
      const r = await apiFetch<Record<string, { title?: string; description?: string; steps?: TxStep[] }>>(
        "/api/labs/tx/scenarios",
      );
      const list: TxScenario[] = Object.entries(r.data ?? {}).map(([key, v]) => ({
        key,
        title: v.title ?? key,
        description: v.description ?? "",
        steps: v.steps ?? [],
      }));
      if (list.length > 0) {
        setScenarios(list);
        setUsingFallback(false);
        setScenarioKey((k) => (list.some((s) => s.key === k) ? k : list[0].key));
      }
    } catch {
      setScenarios(FALLBACK_SCENARIOS);
      setUsingFallback(true);
    }
  }, []);

  const openSession = useCallback(async () => {
    setBootError(null);
    try {
      const r = await apiFetch<{ lab_id: string; pid_a: number; pid_b: number }>(
        "/api/labs/tx/session",
        { method: "POST", body: JSON.stringify({}) },
      );
      setLabId(r.data.lab_id);
      setPids({ a: r.data.pid_a, b: r.data.pid_b });
    } catch (e) {
      setBootError(e);
    }
  }, []);

  useEffect(() => {
    void loadScenarios();
    void openSession();
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [loadScenarios, openSession]);

  useEffect(() => {
    return () => {
      if (labId !== null) {
        void fetch(`/api/labs/tx/${encodeURIComponent(labId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        }).catch(() => undefined);
      }
    };
  }, [labId]);

  const refreshState = useCallback(async () => {
    if (labId === null) return;
    try {
      const r = await apiFetch<{
        A?: Record<string, unknown>;
        B?: Record<string, unknown>;
      }>(`/api/labs/tx/${encodeURIComponent(labId)}/state`);
      const norm = (s?: Record<string, unknown> | null): TxSessionState | null => {
        if (!s) return null;
        const activity = (s["activity"] ?? null) as Record<string, unknown> | null;
        const blocked = activity?.["blocked_by"];
        return {
          status: String(s["xact"] ?? "idle"),
          activity,
          blocking_pids: Array.isArray(blocked) ? (blocked as number[]) : [],
          result: (s["result"] ?? null) as TxSessionState["result"],
        };
      };
      const aLocks = ((r.data.A?.["locks"] ?? []) as Array<Record<string, unknown>>);
      const bLocks = ((r.data.B?.["locks"] ?? []) as Array<Record<string, unknown>>);
      setState({
        session_a: norm(r.data.A),
        session_b: norm(r.data.B),
        locks: [...aLocks, ...bLocks],
      });
    } catch {
      // Poll failures are transient.
    }
  }, [labId]);

  const waiting =
    state?.session_a?.result?.status === "waiting" ||
    state?.session_b?.result?.status === "waiting";

  useEffect(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (waiting && labId !== null) {
      pollRef.current = window.setInterval(() => void refreshState(), 400);
    }
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [waiting, labId, refreshState]);

  const appendLog = (session: SessKey, sql: string, status: string, detail: string) => {
    logN.current += 1;
    const n = logN.current;
    setLogs((prev) => [...prev.slice(-79), { n, session, sql, status, detail }]);
  };

  const exec = useCallback(
    async (session: SessKey, sql: string, step: TxStep | null) => {
      if (labId === null || sql.trim() === "") return;
      setBusy(true);
      try {
        const r = await apiFetch<Record<string, unknown>>(
          `/api/labs/tx/${encodeURIComponent(labId)}/exec`,
          { method: "POST", body: JSON.stringify({ session, sql }) },
        );
        const raw = r.data as Record<string, unknown> & {
          status?: string;
          error?: { sqlstate?: string; message?: string };
        };
        let res: TxExecResult;
        if (raw.status === "error" && raw.error) {
          res = {
            status: "done",
            sqlstate: raw.error.sqlstate ?? null,
            message: raw.error.message ?? null,
          };
        } else {
          res = {
            status: raw.status === "waiting" ? "waiting" : "done",
            rows: (raw["rows"] ?? undefined) as TxExecResult["rows"],
            rowcount: (raw["rowcount"] ?? undefined) as number | undefined,
            notice: (raw["notice"] ?? null) as string | null,
            sqlstate: (raw["sqlstate"] ?? null) as string | null,
            message: (raw["message"] ?? null) as string | null,
          };
        }
        const label = res.status === "waiting" ? "waiting" : res.sqlstate ? `error:${res.sqlstate}` : "done";
        const detail =
          res.status === "waiting"
            ? "blocked on a row lock — still running server-side"
            : res.message ?? `${res.rowcount ?? 0} rows`;
        appendLog(session, sql, label, detail);
        if (step !== null) {
          setVerdicts((v) => [...v, matchExpect(step.expect, res)]);
          setStepIdx((i) => i + 1);
        }
        await refreshState();
      } catch (e) {
        const err = e as ApiError;
        appendLog(session, sql, `error:${err.sqlstate ?? err.status}`, err.message);
        if (step !== null) {
          const fake: TxExecResult = {
            status: "done",
            sqlstate: err.sqlstate,
            message: err.message,
          };
          setVerdicts((v) => [...v, matchExpect(step.expect, fake)]);
          setStepIdx((i) => i + 1);
        }
      } finally {
        setBusy(false);
      }
    },
    [labId, refreshState],
  );

  const nextStep = () => {
    const step = scenario.steps[stepIdx];
    if (step === undefined) return;
    void exec(step.session, step.sql, step);
  };

  const reset = async () => {
    if (labId === null) return;
    try {
      await apiFetch(`/api/labs/tx/${encodeURIComponent(labId)}/reset`, { method: "POST", body: JSON.stringify({}) });
    } catch {
      // Best-effort.
    }
    setStepIdx(0);
    setVerdicts([]);
    setLogs([]);
    setState(null);
    await refreshState();
  };

  const newSession = async () => {
    if (labId !== null) {
      try {
        await fetch(`/api/labs/tx/${encodeURIComponent(labId)}`, { method: "DELETE", credentials: "same-origin" });
      } catch {
        // Ignore teardown error.
      }
    }
    setStepIdx(0);
    setVerdicts([]);
    setLogs([]);
    setState(null);
    await openSession();
  };

  if (bootError !== null && labId === null) {
    return (
      <OfflineOrEmpty
        error={bootError}
        onRetry={() => void openSession()}
        hint="POST /api/labs/tx/session — lab backend (brief 10a) still being built in parallel."
      />
    );
  }

  const locks = state?.locks ?? [];
  const aBlockedBy: number[] = Array.isArray(state?.session_a?.blocking_pids)
    ? (state?.session_a?.blocking_pids as number[])
    : [];
  const bBlockedBy: number[] = Array.isArray(state?.session_b?.blocking_pids)
    ? (state?.session_b?.blocking_pids as number[])
    : [];
  const cycle = aBlockedBy.includes(pids.b ?? -1) && bBlockedBy.includes(pids.a ?? -1);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Scenario picker as Apple segmented control */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sx-eyebrow">Transaction scenarios</h2>
          {usingFallback && (
            <span className="sx-status" data-tone="warn">
              Script preview · offline
            </span>
          )}
        </div>
        <div
          className="inline-flex flex-wrap p-1 bg-[#111113] rounded-[10px] border border-white/[0.08] gap-1 self-start"
          role="tablist"
          aria-label="Transaction scenarios"
        >
          {scenarios.map((s) => {
            const isSel = s.key === scenarioKey;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={isSel}
                onClick={() => {
                  setScenarioKey(s.key);
                  setStepIdx(0);
                  setVerdicts([]);
                }}
                className={`font-[family-name:var(--font-display)] text-[12px] capitalize px-3.5 py-1.5 min-h-[36px] rounded-[8px] transition-colors cursor-pointer ${
 isSel
 ? "bg-[#1c1c1e] text-white font-semibold shadow-sm"
 : "text-[var(--sx-text-2)] hover:text-white"
 }`}
              >
                {s.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Scenario script workbench */}
      <Panel className="w-full">
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="sx-h3">{scenario.title}</h2>
              <p className="sx-lead mt-1 text-[14px]">{scenario.description}</p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => void reset()}
                className="sx-btn sx-btn--sm"
              >
                Reset
              </button>
              <button
                onClick={() => void newSession()}
                className="sx-btn sx-btn--sm"
              >
                New session
              </button>
            </div>
          </div>

          <div className="sx-group">
            <div className="sx-row bg-[var(--sx-surface-2)]">
              <span className="sx-eyebrow">Scenario Timeline ({scenario.steps.length} steps)</span>
              <span className="sx-caption font-mono">
                Step {Math.min(stepIdx + 1, scenario.steps.length)} of {scenario.steps.length}
              </span>
            </div>
            <div className="divide-y divide-white/[0.08]">
              {scenario.steps.map((s, i) => {
                const done = i < stepIdx;
                const current = i === stepIdx;
                const ok = done ? verdicts[i] : null;
                return (
                  <div
                    key={i}
                    className={`sx-row flex-col items-start gap-2 p-3 transition-colors ${
                      current ? "bg-[var(--sx-surface-2)]" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-2">
                        <span className="font-[family-name:var(--font-display)] text-[12px] font-bold text-white capitalize ">
                          Step {i + 1}
                        </span>
                        <span className="sx-eyebrow text-white/50">
                          Session {s.session}
                        </span>
                        <span className="sx-caption text-[var(--sx-text-3)] font-mono text-[11px]">
                          Expect: {s.expect}
                        </span>
                      </div>
                      {ok === true && (
                        <span className="sx-status" data-tone="ok">Passed</span>
                      )}
                      {ok === false && (
                        <span className="sx-status" data-tone="critical">Failed</span>
                      )}
                      {current && (
                        <span className="sx-caption text-white font-medium">Current step</span>
                      )}
                    </div>

                    <pre className="font-mono text-[12px] sm:text-[13px] overflow-x-auto whitespace-pre-wrap w-full p-2.5 rounded-[8px] bg-black/60 border border-white/[0.06]">
                      {highlightSql(s.sql)}
                    </pre>

                    <p className="sx-caption text-[var(--sx-text-2)]">
                      {s.explain}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={nextStep}
              disabled={busy || doneSteps || labId === null}
              className="sx-btn sx-btn--filled"
            >
              {doneSteps
                ? "Scenario complete"
                : busy
                  ? "Running…"
                  : `Next step (${stepIdx + 1}/${scenario.steps.length})`}
            </button>
          </div>
        </div>
      </Panel>

      {/* 3. Two session columns side by side (stacked on phones) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["A", "B"] as SessKey[]).map((s) => {
          const sess = s === "A" ? state?.session_a : state?.session_b;
          const st = (sess?.status ?? "idle") as string;
          const waitingSess = sess?.result?.status === "waiting";
          const pid = s === "A" ? pids.a : pids.b;

          const sessionSteps = scenario.steps
            .map((step, globalIdx) => ({ step, globalIdx }))
            .filter(({ step }) => step.session === s);

          const sessionLogs = logs.filter((l) => l.session === s);

          return (
            <div key={s} className="sx-group">
              <div className="sx-row bg-[var(--sx-surface-2)]">
                <div className="flex items-center gap-2">
                  <h3 className="sx-eyebrow">Session {s}</h3>
                  <span className="sx-caption font-mono">PID {pid ?? "…"}</span>
                </div>
                <span
                  className="sx-status"
                  data-tone={waitingSess ? "warn" : st.includes("xact") ? "ok" : undefined}
                >
                  {waitingSess ? "WAITING" : st.includes("xact") ? "IN TRANSACTION" : "IDLE"}
                </span>
              </div>

              {/* Ad-hoc SQL execution */}
              <div className="p-3.5 sm:p-4 border-b border-white/[0.08] flex flex-col gap-2.5">
                <label
                  htmlFor={`tx-sql-${s}`}
                  className="sx-caption text-[var(--sx-text-3)]"
                >
                  Ad-hoc SQL · Ctrl+Enter runs
                </label>
                <textarea
                  id={`tx-sql-${s}`}
                  value={inputs[s]}
                  onChange={(e) => setInputs((p) => ({ ...p, [s]: e.target.value }))}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      void exec(s, inputs[s], null);
                      setInputs((p) => ({ ...p, [s]: "" }));
                    }
                  }}
                  rows={2}
                  spellCheck={false}
                  placeholder="SELECT … | BEGIN; …"
                  className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-[10px] p-3 text-[13px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      void exec(s, inputs[s], null);
                      setInputs((p) => ({ ...p, [s]: "" }));
                    }}
                    disabled={busy || labId === null || inputs[s].trim() === ""}
                    className="sx-btn sx-btn--sm"
                  >
                    Run SQL
                  </button>
                </div>
              </div>

              {/* Statements history */}
              <div className="divide-y divide-white/[0.08] max-h-[380px] overflow-y-auto">
                {sessionSteps.length === 0 && sessionLogs.length === 0 && (
                  <p className="sx-caption p-4 text-center">
                    No statements dispatched yet.
                  </p>
                )}

                {sessionSteps.map(({ step, globalIdx }) => {
                  const isExecuted = globalIdx < stepIdx;
                  const isCurrent = globalIdx === stepIdx;
                  const isPending = globalIdx > stepIdx;

                  const matchingLog = sessionLogs[globalIdx];
                  const logStatus = matchingLog?.status ?? "";
                  const isRollbackOrErr =
                    logStatus.startsWith("error") ||
                    step.expect.includes("40001") ||
                    step.expect.includes("40P01");
                  const isWaitingOutcome =
                    logStatus === "waiting" || step.expect === "waits";
                  const isCommit =
                    step.sql.toUpperCase().includes("COMMIT") ||
                    logStatus === "done";

                  return (
                    <div
                      key={`step-${globalIdx}`}
                      className={`sx-row flex-col items-start gap-1.5 p-3.5 transition-colors ${
                        isCurrent ? "bg-[var(--sx-surface-2)]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="sx-caption text-[var(--sx-text-3)] font-mono text-[11px]">
                          Step {globalIdx + 1}
                        </span>
                        {isExecuted && (
                          isRollbackOrErr ? (
                            <span className="sx-status" data-tone="critical">
                              <span className="font-mono text-[var(--sx-red)] font-medium">
                                {logStatus ? logStatus.replace("error:", "") : step.expect.replace("error:", "")}
                              </span>
                            </span>
                          ) : isWaitingOutcome ? (
                            <span className="sx-status" data-tone="warn">
                              Waiting
                            </span>
                          ) : isCommit ? (
                            <span className="sx-status" data-tone="ok">
                              {step.sql.toUpperCase().includes("COMMIT") ? "COMMIT" : "OK"}
                            </span>
                          ) : (
                            <span className="sx-status" data-tone="ok">OK</span>
                          )
                        )}
                        {isCurrent && (
                          <span className="sx-caption text-white font-medium">
                            Ready
                          </span>
                        )}
                        {isPending && (
                          <span className="sx-caption text-[var(--sx-text-3)]">
                            Pending
                          </span>
                        )}
                      </div>

                      <pre
                        className={`font-mono text-[12px] sm:text-[13px] overflow-x-auto whitespace-pre-wrap ${
                          isExecuted
                            ? "text-white"
                            : isPending
                              ? "text-white/40"
                              : "text-white font-medium"
                        }`}
                      >
                        {step.sql}
                      </pre>

                      <p className="sx-caption text-[11px] text-[var(--sx-text-3)]">
                        {step.explain}
                      </p>
                    </div>
                  );
                })}

                {sessionLogs.slice(sessionSteps.length).map((l) => {
                  const isErr = l.status.startsWith("error");
                  const isWait = l.status === "waiting";
                  const errCode = isErr ? l.status.replace("error:", "") : "";
                  return (
                    <div
                      key={`log-${l.n}`}
                      className="sx-row flex-col items-start gap-1.5 p-3.5"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="sx-caption text-[var(--sx-text-3)] font-mono text-[11px]">
                          Ad-hoc #{l.n}
                        </span>
                        {isErr ? (
                          <span className="sx-status" data-tone="critical">
                            <span className="font-mono text-[var(--sx-red)] font-medium">
                              {errCode}
                            </span>
                          </span>
                        ) : isWait ? (
                          <span className="sx-status" data-tone="warn">
                            Waiting
                          </span>
                        ) : (
                          <span className="sx-status" data-tone="ok">
                            {l.sql.toUpperCase().includes("COMMIT") ? "COMMIT" : "OK"}
                          </span>
                        )}
                      </div>
                      <pre className="font-mono text-[12px] sm:text-[13px] text-white overflow-x-auto whitespace-pre-wrap">
                        {l.sql}
                      </pre>
                      <p className="sx-caption text-[11px] text-[var(--sx-text-3)]">
                        {l.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Outcome Callouts: critical 40001, 40P01, skip_locked, MVCC, and WAL tables */}
      <OutcomeCallouts scenarioKey={scenarioKey} logs={logs} />

      {/* 5. Locks and wait-for graph: pg_locks · pg_blocking_pids */}
      <div className="flex flex-col gap-3">
        <h2 className="sx-eyebrow">Lock table & wait-for graph · pg_locks · pg_blocking_pids</h2>
        <div className="sx-group">
          <div className="p-4 sm:p-5 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="sx-caption text-[var(--sx-text-3)]">
                Wait-for dependency graph
              </span>
              <WaitGraph
                pidA={pids.a}
                pidB={pids.b}
                aBlocked={aBlockedBy.length > 0}
                bBlocked={bBlockedBy.length > 0}
                cycle={cycle}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="sx-caption text-[var(--sx-text-3)]">
                Active locks (pg_locks)
              </span>
              {locks.length === 0 ? (
                <p className="sx-caption p-4 bg-[var(--sx-surface-2)] rounded-[10px] text-center">
                  No row locks held — run a scenario step, then poll will refresh lock state while waiting.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-[10px] border border-white/[0.08]">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[var(--sx-surface-2)]">
                        {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                          <th
                            key={c}
                            className="sx-eyebrow px-3 py-2.5 font-normal"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.08]">
                      {locks.map((l, i) => (
                        <tr
                          key={i}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                            <td
                              key={c}
                              className={`font-mono px-3 py-2.5 text-[12px] ${
                                c === "pid" ? "tabular-nums text-right" : ""
                              } ${
                                c === "granted" && l[c] === false
                                  ? "text-[var(--sx-orange)] font-semibold"
                                  : "text-white"
                              }`}
                            >
                              {String(l[c] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {state?.lab_table !== undefined && state.lab_table !== null && state.lab_table.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="sx-caption text-[var(--sx-text-3)]">
                  Live state: lab_account
                </span>
                <DataGrid rows={state.lab_table as Array<Record<string, unknown>>} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WaitGraph({
  pidA,
  pidB,
  aBlocked,
  bBlocked,
  cycle,
}: {
  pidA: number | null;
  pidB: number | null;
  aBlocked: boolean;
  bBlocked: boolean;
  cycle: boolean;
}) {
  const color = cycle ? "var(--sx-red)" : "var(--sx-orange)";
  return (
    <svg
      viewBox="0 0 360 84"
      role="img"
      aria-label="wait-for graph"
      className="w-full max-w-[420px] rounded-[10px] border border-white/[0.08] bg-[#0a0a0a] p-2"
    >
      <g fontFamily="var(--font-sans)" fontSize="11">
        <circle
          cx="60"
          cy="42"
          r="22"
          fill="#111113"
          stroke={aBlocked ? color : "rgba(255,255,255,0.18)"}
          strokeWidth="1.5"
        />
        <text x="60" y="46" textAnchor="middle" fill="#ffffff" fontWeight="bold">
          A
        </text>
        <text x="60" y="78" textAnchor="middle" fill="var(--sx-text-3)" fontSize="10">
          PID {pidA ?? "…"}
        </text>

        <circle
          cx="300"
          cy="42"
          r="22"
          fill="#111113"
          stroke={bBlocked ? color : "rgba(255,255,255,0.18)"}
          strokeWidth="1.5"
        />
        <text x="300" y="46" textAnchor="middle" fill="#ffffff" fontWeight="bold">
          B
        </text>
        <text x="300" y="78" textAnchor="middle" fill="var(--sx-text-3)" fontSize="10">
          PID {pidB ?? "…"}
        </text>

        {aBlocked && (
          <g stroke={color} strokeWidth="1.6" strokeDasharray="5 4">
            <line x1="84" y1="34" x2="274" y2="34" />
            <polygon points="274,34 266,30 266,38" fill={color} stroke="none" />
          </g>
        )}
        {bBlocked && (
          <g stroke={color} strokeWidth="1.6" strokeDasharray="5 4">
            <line x1="274" y1="52" x2="84" y2="52" />
            <polygon points="84,52 92,48 92,56" fill={color} stroke="none" />
          </g>
        )}
        {!aBlocked && !bBlocked && (
          <text x="180" y="46" textAnchor="middle" fill="var(--sx-text-3)">
            no waits
          </text>
        )}
        {cycle && (
          <text x="180" y="20" textAnchor="middle" fill="var(--sx-red)" fontWeight="bold">
            Deadlock cycle detected
          </text>
        )}
      </g>
    </svg>
  );
}

function OutcomeCallouts({ scenarioKey, logs }: { scenarioKey: string; logs: LogEntry[] }) {
  const has40001 = logs.some((l) => l.detail.includes("40001") || l.status.includes("40001"));
  const has40P01 = logs.some((l) => l.detail.includes("40P01") || l.status.includes("40P01"));

  if (scenarioKey === "phantom_or_write_skew" && has40001) {
    return (
      <div className="sx-group border border-[var(--sx-red)]/30">
        <div className="sx-row bg-[var(--sx-surface-2)]">
          <h3 className="sx-eyebrow text-[var(--sx-red)]">
            Serialization failure · 40001
          </h3>
          <span className="sx-status" data-tone="critical">
            <span className="font-mono text-[var(--sx-red)]">40001</span>
          </span>
        </div>
        <div className="p-4">
          <p className="sx-body">
            SERIALIZABLE transaction saw a concurrent read/write dependency cycle between Session A and Session B.
            One committer wins; PostgreSQL aborts the other with SQLSTATE 40001. The client must retry from BEGIN.
          </p>
        </div>
      </div>
    );
  }

  if (scenarioKey === "deadlock" && has40P01) {
    return (
      <div className="sx-group border border-[var(--sx-red)]/30">
        <div className="sx-row bg-[var(--sx-surface-2)]">
          <h3 className="sx-eyebrow text-[var(--sx-red)]">
            Deadlock detected · 40P01
          </h3>
          <span className="sx-status" data-tone="critical">
            <span className="font-mono text-[var(--sx-red)]">40P01</span>
          </span>
        </div>
        <div className="p-4">
          <p className="sx-body">
            Mutual wait cycle: Session A waiting on row held by Session B, and Session B waiting on row held by Session A.
            Postgres deadlock detector detected the cycle and rolled back the victim transaction to release all held locks.
          </p>
        </div>
      </div>
    );
  }

  if (scenarioKey === "skip_locked") {
    const idsA = extractIds(logs.filter((l) => l.session === "A").at(-1)?.detail ?? "");
    const idsB = extractIds(logs.filter((l) => l.session === "B").at(-1)?.detail ?? "");
    if (idsA.length > 0 || idsB.length > 0) {
      const overlap = idsA.filter((x) => idsB.includes(x));
      const disjoint = overlap.length === 0;
      return (
        <div className="sx-group">
          <div className="sx-row bg-[var(--sx-surface-2)]">
            <h3 className="sx-eyebrow">Row dispatch isolation (SKIP LOCKED)</h3>
            <span className="sx-status" data-tone={disjoint ? "ok" : "critical"}>
              {disjoint ? "Disjoint" : `Overlap (${overlap.length})`}
            </span>
          </div>
          <div className="p-4 flex flex-col gap-2 font-mono text-[12px]">
            <p className="text-[var(--sx-text-2)]">
              Worker A packet IDs: [<span className="sx-num text-white">{idsA.slice(0, 12).join(", ")}{idsA.length > 12 ? "…" : ""}</span>]
            </p>
            <p className="text-[var(--sx-text-2)]">
              Worker B packet IDs: [<span className="sx-num text-white">{idsB.slice(0, 12).join(", ")}{idsB.length > 12 ? "…" : ""}</span>]
            </p>
            <p className="sx-body pt-1 font-[family-name:var(--font-sans)]">
              {disjoint
                ? "Disjoint sets confirmed: Worker B skipped Worker A's locked tuples without blocking."
                : "Concurrency collision detected."}
            </p>
          </div>
        </div>
      );
    }
  }

  if (scenarioKey === "mvcc") {
    return (
      <div className="sx-group">
        <div className="sx-row bg-[var(--sx-surface-2)]">
          <h3 className="sx-eyebrow">Multi-Version Concurrency Control (MVCC) · xmin / xmax / ctid</h3>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="sx-body">
            Postgres does not overwrite tuples in-place. An uncommitted UPDATE creates a new version with the
            modifying transaction's xmin, while the old version is tagged with xmax. Session A reads the uncommitted
            tuple, while Session B's snapshot still reads the prior version until Session A issues COMMIT.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-mono text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="sx-eyebrow px-4 py-3">Session</th>
                  <th className="sx-eyebrow px-3 py-3">Tuple ctid</th>
                  <th className="sx-eyebrow px-3 py-3 text-right">xmin</th>
                  <th className="sx-eyebrow px-3 py-3 text-right">xmax</th>
                  <th className="sx-eyebrow px-3 py-3">Visibility state</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                <tr>
                  <td className="px-4 py-3 text-white">Session A</td>
                  <td className="px-3 py-3 text-[var(--sx-text-2)]">(0, 2)</td>
                  <td className="px-3 py-3 text-right sx-num text-[var(--sx-green)]">txid_current()</td>
                  <td className="px-3 py-2 text-right sx-num text-[var(--sx-text-3)]">0 (active)</td>
                  <td className="px-3 py-3 text-[var(--sx-green)]">New uncommitted version</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white">Session B</td>
                  <td className="px-3 py-3 text-[var(--sx-text-2)]">(0, 1)</td>
                  <td className="px-3 py-3 text-right sx-num text-white">initial_xid</td>
                  <td className="px-3 py-3 text-right sx-num text-[var(--sx-orange)]">txid_A (uncommitted)</td>
                  <td className="px-3 py-3 text-[var(--sx-text-3)]">Snapshot pinned to old tuple</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (scenarioKey === "wal") {
    return <WALBar logs={logs} />;
  }

  return null;
}

function extractIds(detail: string): number[] {
  const m = detail.match(/\d+/g);
  return m ? m.map(Number).slice(0, 200) : [];
}

function WALBar({ logs }: { logs: LogEntry[] }) {
  const lsns = logs.flatMap((l) => {
    const m = l.sql.match(/pg_current_wal_lsn|lsn/i) ? [l.detail] : [];
    return m;
  });

  return (
    <div className="sx-group">
      <div className="sx-row bg-[var(--sx-surface-2)]">
        <h3 className="sx-eyebrow">Write-Ahead Logging (WAL) & Log Sequence Numbers · pg_current_wal_lsn</h3>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <p className="sx-body">
          PostgreSQL ensures durability (ACID 'D') through write-ahead logging. Changes are flushed to the WAL
          before the data heap pages. The Log Sequence Number (LSN) marks the byte offset in the WAL stream.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="sx-eyebrow px-4 py-3">Execution checkpoint</th>
                <th className="sx-eyebrow px-3 py-3">LSN Address</th>
                <th className="sx-eyebrow px-3 py-3 text-right">WAL Stream Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              <tr>
                <td className="px-4 py-3 text-white font-[family-name:var(--font-sans)]">Pre-insert baseline</td>
                <td className="px-3 py-3 sx-num text-white">pg_current_wal_lsn() [Step 1]</td>
                <td className="px-3 py-3 text-right text-[var(--sx-text-3)]">lsn_before recorded</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-white font-[family-name:var(--font-sans)]">Post-1000 row batch commit</td>
                <td className="px-3 py-3 sx-num text-white">pg_current_wal_lsn() [Step 3]</td>
                <td className="px-3 py-3 text-right text-[var(--sx-green)]">lsn_after advanced</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="sx-eyebrow">WAL byte difference query</span>
          <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
            SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') AS wal_bytes;
          </pre>
        </div>
        {lsns.length > 0 && (
          <p className="font-mono text-[11px] text-[var(--sx-text-2)]">
            Recorded LSN points in log: {lsns.join(" → ")}
          </p>
        )}
      </div>
    </div>
  );
}

