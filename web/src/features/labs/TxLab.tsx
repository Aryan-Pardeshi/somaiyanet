import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { highlightSql } from "@/app/sql";
import { Card, DataGrid, OfflineOrEmpty, Panel, SqlBlock, StatusBadge } from "./common";
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
      { session: "A", sql: "BEGIN; SELECT * FROM dispatch_packets('SAT-A1', 'worker-A', 20000);", expect: "ok", explain: "Worker A claims its batch." },
      { session: "B", sql: "BEGIN; SELECT * FROM dispatch_packets('SAT-A1', 'worker-B', 20000);", expect: "ok", explain: "Worker B skips A's locked rows — disjoint ids." },
      { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits." },
      { session: "B", sql: "COMMIT;", expect: "ok", explain: "B commits." },
    ],
  },
  {
    key: "mvcc",
    title: "MVCC row versions",
    description: "Uncommitted UPDATE shows xmin/xmax/ctid divergence between sessions.",
    steps: [
      { session: "A", sql: "BEGIN; UPDATE deployer_pod SET temperature_c = temperature_c + 1 WHERE pod_id = 'POD-A1';", expect: "ok", explain: "A updates without committing." },
      { session: "A", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1';", expect: "ok", explain: "A sees the new version." },
      { session: "B", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1'; SELECT txid_current();", expect: "ok", explain: "B still sees the old version." },
      { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits; B now sees the new ctid." },
    ],
  },
  {
    key: "wal",
    title: "WAL / LSN",
    description: "Bulk telemetry insert moves pg_current_wal_lsn forward.",
    steps: [
      { session: "A", sql: "SELECT pg_current_wal_lsn() AS lsn_before;", expect: "ok", explain: "Record the LSN." },
      { session: "A", sql: "BEGIN; INSERT INTO telemetry SELECT now(), 'SAT-A1', 7.5, 22.0, 100, NULL, '{}' FROM generate_series(1, 1000); COMMIT;", expect: "ok", explain: "Write 1000 rows in one transaction." },
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
      {/* Top Console Grid: Scenario Picker (vertical list of chamfered chips) + Script Workbench */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left: Scenario picker as a vertical list of chamfered chips (selected = royal blue left bar) */}
        <Panel cut={8} className="w-full">
          <div className="p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Scenario picker
              </span>
              <span className="font-mono text-[10px] text-[#5f6f93]">
                {scenarios.length} scenarios
              </span>
            </div>
            {usingFallback && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#f5a524] bg-[#f5a524]/10 border border-[#f5a524]/30 px-2 py-0.5 rounded-[2px]">
                Script preview · offline
              </span>
            )}
            <div className="flex flex-col gap-1.5 mt-1">
              {scenarios.map((s) => {
                const isSel = s.key === scenarioKey;
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      setScenarioKey(s.key);
                      setStepIdx(0);
                      setVerdicts([]);
                    }}
                    className={`flex flex-col gap-0.5 text-left p-2.5 rounded-[2px] transition-all cursor-pointer ${
                      isSel
                        ? "bg-[#3d5bff]/15 text-white border-l-[3px] border-l-[#3d5bff] border-t border-r border-b border-white/10 shadow-[0_0_10px_rgba(61,91,255,0.25)]"
                        : "bg-white/[0.02] text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.05] border-l-[3px] border-l-transparent border-t border-r border-b border-white/5"
                    }`}
                  >
                    <span className="font-mono text-[11px] font-semibold tracking-wide">
                      {s.title}
                    </span>
                    <span className="text-[11px] text-[#5f6f93] line-clamp-1">
                      {s.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Right: Scenario script workbench */}
        <Panel cut={8} className="w-full">
          <div className="p-3.5 sm:p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                  Exp 9 · CO1/CO4
                </span>
                <span className="text-[#5f6f93] text-[10px]">·</span>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  {scenario.title}
                </h2>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => void reset()}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] cursor-pointer"
                >
                  Reset
                </button>
                <button
                  onClick={() => void newSession()}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-1 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] cursor-pointer"
                >
                  New session
                </button>
              </div>
            </div>

            <p className="text-[13px] text-[#8b96b0]">{scenario.description}</p>

            <ol className="flex flex-col gap-2 mt-1">
              {scenario.steps.map((s, i) => {
                const done = i < stepIdx;
                const current = i === stepIdx;
                const ok = done ? verdicts[i] : null;
                return (
                  <li
                    key={i}
                    className={`border p-3 rounded-[2px] transition-all ${
                      current
                        ? "border-[#3d5bff] bg-[#3d5bff]/10 shadow-[0_0_10px_rgba(61,91,255,0.2)]"
                        : "border-white/10 bg-[#05070d]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-white font-semibold">
                          Step {i + 1}
                        </span>
                        <StatusBadge
                          status={s.session === "A" ? "info" : "nominal"}
                          label={`Session ${s.session}`}
                        />
                        <span className="font-mono text-[10px] text-[#5f6f93]">
                          Expect: {s.expect}
                        </span>
                      </div>
                      {ok === true && (
                        <StatusBadge status="ok" label="Passed" />
                      )}
                      {ok === false && (
                        <StatusBadge status="critical" label="Failed" />
                      )}
                    </div>
                    <pre className="font-mono overflow-x-auto whitespace-pre-wrap text-[12px] text-[#dfe6f5] bg-black/60 p-2 border border-white/5">
                      {highlightSql(s.sql)}
                    </pre>
                    <p className="mt-1 text-[11px] font-mono text-[#8b96b0]">
                      {s.explain}
                    </p>
                  </li>
                );
              })}
            </ol>

            <div className="pt-2">
              <button
                onClick={nextStep}
                disabled={busy || doneSteps || labId === null}
                className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 bg-[#3d5bff] hover:bg-[#324dd8] text-white rounded-[2px] font-semibold transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
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
      </div>

      {/* The two sessions side by side as two Panels headed "SESSION A" / "SESSION B" in mono */}
      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as SessKey[]).map((s) => {
          const sess = s === "A" ? state?.session_a : state?.session_b;
          const st = (sess?.status ?? "idle") as string;
          const waitingSess = sess?.result?.status === "waiting";
          const statusLabel = waitingSess ? "WAITING" : st.toUpperCase();
          const pid = s === "A" ? pids.a : pids.b;

          return (
            <Panel key={s} cut={8} className="w-full">
              <div className="p-3.5 sm:p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                      PID {pid ?? "…"}
                    </span>
                    <span className="text-[#5f6f93] text-[10px]">·</span>
                    <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0] font-bold">
                      Session {s}
                    </h2>
                  </div>
                  <StatusBadge
                    status={waitingSess ? "warn" : st.includes("xact") ? "info" : "nominal"}
                    label={statusLabel}
                    className={waitingSess ? "motion-safe:animate-pulse" : ""}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`tx-sql-${s}`}
                      className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
                    >
                      Ad-hoc SQL · Ctrl+Enter runs
                    </label>
                  </div>
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
                    rows={3}
                    spellCheck={false}
                    placeholder="SELECT … | BEGIN; …"
                    className="font-mono min-h-[72px] border border-white/10 bg-[#05070d] p-2.5 text-[12.5px] text-[#dfe6f5] focus:border-[#3d5bff] focus:outline-none rounded-[2px]"
                  />
                  <div>
                    <button
                      onClick={() => {
                        void exec(s, inputs[s], null);
                        setInputs((p) => ({ ...p, [s]: "" }));
                      }}
                      disabled={busy || labId === null || inputs[s].trim() === ""}
                      className="font-mono text-[11px] uppercase tracking-[0.1em] px-3.5 py-1.5 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      Run SQL
                    </button>
                  </div>

                  {/* Statement history list: each step a row with SQL in code style and result */}
                  <div className="flex max-h-64 flex-col gap-2 overflow-y-auto mt-2">
                    {logs.filter((l) => l.session === s).length === 0 && (
                      <p className="font-mono text-[11px] text-[#5f6f93] p-2 border border-dashed border-white/5 text-center">
                        No statements dispatched yet.
                      </p>
                    )}
                    {logs
                      .filter((l) => l.session === s)
                      .map((l) => {
                        const isErr = l.status.startsWith("error");
                        const isWait = l.status === "waiting";
                        return (
                          <div
                            key={l.n}
                            className="border border-white/10 bg-[#05070d] p-2.5 rounded-[2px] flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between font-mono text-[10px]">
                              <span className="text-[#5f6f93]">Statement #{l.n}</span>
                              <StatusBadge
                                status={isErr ? "critical" : isWait ? "warn" : "ok"}
                                label={l.status.toUpperCase()}
                              />
                            </div>
                            <pre className="font-mono overflow-x-auto whitespace-pre-wrap text-[11.5px] text-[#dfe6f5] bg-black/50 p-1.5 border border-white/5 mt-0.5">
                              {l.sql}
                            </pre>
                            <p className="font-mono text-[10.5px] text-[#8b96b0]">
                              {l.detail}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Outcome Callouts: critical 40001, 40P01, skip_locked, MVCC, and WAL tables */}
      <OutcomeCallouts scenarioKey={scenarioKey} logs={logs} />

      {/* Locks and wait-for graph: pg_locks · pg_blocking_pids */}
      <Card title="Lock table & wait-for graph" kicker="pg_locks · pg_blocking_pids">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
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
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
              Active locks (pg_locks)
            </span>
            {locks.length === 0 ? (
              <p className="font-mono text-[11px] text-[#5f6f93] p-3 border border-white/10 bg-[#05070d]">
                No row locks held — run a scenario step, then poll will refresh lock state while waiting.
              </p>
            ) : (
              <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-[#05070d]">
                      {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                        <th
                          key={c}
                          className="font-mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] font-normal"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locks.map((l, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                      >
                        {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                          <td
                            key={c}
                            className={`font-mono px-3 py-2 text-[11.5px] ${
                              c === "pid" ? "tabular-nums text-right" : ""
                            } ${
                              c === "granted" && l[c] === false
                                ? "text-[#f5a524] font-semibold"
                                : "text-[#dfe6f5]"
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
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Live state: lab_account
              </span>
              <DataGrid rows={state.lab_table as Array<Record<string, unknown>>} />
            </div>
          )}
        </div>
      </Card>
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
  const color = cycle ? "#ff3b4f" : "#f5a524";
  return (
    <svg
      viewBox="0 0 360 84"
      role="img"
      aria-label="wait-for graph"
      className="w-full max-w-[420px] border border-white/10 bg-[#05070d] p-2"
    >
      <g fontFamily="Geist Mono, monospace" fontSize="11">
        <circle
          cx="60"
          cy="42"
          r="22"
          fill="#05070d"
          stroke={aBlocked ? color : "rgba(255,255,255,0.15)"}
          strokeWidth="2"
        />
        <text x="60" y="46" textAnchor="middle" fill="#dfe6f5" fontWeight="bold">
          A
        </text>
        <text x="60" y="78" textAnchor="middle" fill="#8b96b0" fontSize="9">
          PID {pidA ?? "…"}
        </text>

        <circle
          cx="300"
          cy="42"
          r="22"
          fill="#05070d"
          stroke={bBlocked ? color : "rgba(255,255,255,0.15)"}
          strokeWidth="2"
        />
        <text x="300" y="46" textAnchor="middle" fill="#dfe6f5" fontWeight="bold">
          B
        </text>
        <text x="300" y="78" textAnchor="middle" fill="#8b96b0" fontSize="9">
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
          <text x="180" y="46" textAnchor="middle" fill="#5f6f93">
            no waits
          </text>
        )}
        {cycle && (
          <text x="180" y="20" textAnchor="middle" fill="#ff3b4f" fontWeight="bold">
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
      <Panel
        cut={8}
        borderColor="rgba(255, 59, 79, 0.45)"
        glowColor="rgba(255, 59, 79, 0.15)"
        className="w-full"
      >
        <div role="alert" className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ff3b4f] font-semibold">
              Serialization failure · 40001
            </span>
            <StatusBadge status="critical" label="Retry transaction" />
          </div>
          <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
            SERIALIZABLE transaction saw a concurrent read/write dependency cycle between Session A and Session B.
            One committer wins; PostgreSQL aborts the other with SQLSTATE 40001. The client must retry from BEGIN.
          </p>
        </div>
      </Panel>
    );
  }

  if (scenarioKey === "deadlock" && has40P01) {
    return (
      <Panel
        cut={8}
        borderColor="rgba(255, 59, 79, 0.45)"
        glowColor="rgba(255, 59, 79, 0.15)"
        className="w-full"
      >
        <div role="alert" className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ff3b4f] font-semibold">
              Deadlock detected · 40P01
            </span>
            <StatusBadge status="critical" label="Transaction aborted" />
          </div>
          <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
            Mutual wait cycle: Session A waiting on row held by Session B, and Session B waiting on row held by Session A.
            Postgres deadlock detector detected the cycle and rolled back the victim transaction to release all held locks.
          </p>
        </div>
      </Panel>
    );
  }

  if (scenarioKey === "skip_locked") {
    const idsA = extractIds(logs.filter((l) => l.session === "A").at(-1)?.detail ?? "");
    const idsB = extractIds(logs.filter((l) => l.session === "B").at(-1)?.detail ?? "");
    if (idsA.length > 0 || idsB.length > 0) {
      const overlap = idsA.filter((x) => idsB.includes(x));
      const disjoint = overlap.length === 0;
      return (
        <Card
          title="Row dispatch isolation (SKIP LOCKED)"
          kicker={disjoint ? "Disjoint queues" : "Queue overlap"}
          aside={
            <StatusBadge
              status={disjoint ? "ok" : "critical"}
              label={disjoint ? "Disjoint" : `Overlap (${overlap.length})`}
            />
          }
        >
          <div className="flex flex-col gap-2 font-mono text-[12px]">
            <p className="text-[#8b96b0]">
              Worker A packet IDs: [{idsA.slice(0, 12).join(", ")}{idsA.length > 12 ? "…" : ""}]
            </p>
            <p className="text-[#8b96b0]">
              Worker B packet IDs: [{idsB.slice(0, 12).join(", ")}{idsB.length > 12 ? "…" : ""}]
            </p>
            <p className="text-[12px] text-[#dfe6f5] font-sans pt-1">
              {disjoint
                ? "Disjoint sets confirmed: Worker B skipped Worker A's locked tuples without blocking."
                : "Concurrency collision detected."}
            </p>
          </div>
        </Card>
      );
    }
  }

  if (scenarioKey === "mvcc") {
    return (
      <Card title="Multi-Version Concurrency Control (MVCC)" kicker="xmin / xmax / ctid">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
            Postgres does not overwrite tuples in-place. An uncommitted UPDATE creates a new version with the
            modifying transaction's xmin, while the old version is tagged with xmax. Session A reads the uncommitted
            tuple, while Session B's snapshot still reads the prior version until Session A issues COMMIT.
          </p>
          {/* MVCC tuple inspection mono table */}
          <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
            <table className="w-full border-collapse text-left font-mono text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#05070d]">
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">Session</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">Tuple ctid</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] text-right">xmin</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] text-right">xmax</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">Visibility state</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.06]">
                  <td className="px-3 py-2 text-[#7fb2ff]">Session A</td>
                  <td className="px-3 py-2 text-[#dfe6f5]">(0, 2)</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#7ee2b8]">txid_current()</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#5f6f93]">0 (active)</td>
                  <td className="px-3 py-2 text-[#7ee2b8]">New uncommitted version</td>
                </tr>
                <tr className="border-b border-white/[0.06]">
                  <td className="px-3 py-2 text-[#7ee2b8]">Session B</td>
                  <td className="px-3 py-2 text-[#dfe6f5]">(0, 1)</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#dfe6f5]">initial_xid</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#f5a524]">txid_A (uncommitted)</td>
                  <td className="px-3 py-2 text-[#8b96b0]">Snapshot pinned to old tuple</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>
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
    <Card title="Write-Ahead Logging (WAL) & Log Sequence Numbers" kicker="pg_current_wal_lsn">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
          PostgreSQL ensures durability (ACID 'D') through write-ahead logging. Changes are flushed to the WAL
          before the data heap pages. The Log Sequence Number (LSN) marks the byte offset in the WAL stream.
        </p>
        {/* WAL LSN mono table */}
        <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
          <table className="w-full border-collapse text-left font-mono text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#05070d]">
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">Execution checkpoint</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">LSN Address</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] text-right">WAL Stream Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/[0.06]">
                <td className="px-3 py-2 text-[#dfe6f5]">Pre-insert baseline</td>
                <td className="px-3 py-2 text-[#7fb2ff]">pg_current_wal_lsn() [Step 1]</td>
                <td className="px-3 py-2 text-right text-[#8b96b0]">lsn_before recorded</td>
              </tr>
              <tr className="border-b border-white/[0.06]">
                <td className="px-3 py-2 text-[#dfe6f5]">Post-1000 row batch commit</td>
                <td className="px-3 py-2 text-[#7fb2ff]">pg_current_wal_lsn() [Step 3]</td>
                <td className="px-3 py-2 text-right text-[#7ee2b8]">lsn_after advanced</td>
              </tr>
            </tbody>
          </table>
        </div>
        <SqlBlock
          label="WAL byte difference query"
          sql="SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') AS wal_bytes;"
        />
        {lsns.length > 0 && (
          <p className="font-mono text-[11px] text-[#8b96b0]">
            Recorded LSN points in log: {lsns.join(" → ")}
          </p>
        )}
      </div>
    </Card>
  );
}

