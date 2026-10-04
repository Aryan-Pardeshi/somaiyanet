import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { highlightSql } from "@/app/sql";
import { Card, DataGrid, OfflineOrEmpty, SqlBlock } from "./common";
import type { TxExecResult, TxLabState, TxScenario, TxStep } from "./types";

const FALLBACK_SCENARIOS: TxScenario[] = [
  { key: "lost_update", title: "Lost update", description: "READ COMMITTED read-modify-write loses A's update; FOR UPDATE fixes it.", steps: [
    { session: "A", sql: "BEGIN; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "A reads 100." },
    { session: "B", sql: "BEGIN; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "B reads the same 100." },
    { session: "A", sql: "UPDATE lab_account SET power_credits = 90 WHERE id = 1; COMMIT;", expect: "ok", explain: "A writes 90 and commits." },
    { session: "B", sql: "UPDATE lab_account SET power_credits = 80 WHERE id = 1; COMMIT;", expect: "ok", explain: "B overwrites with 80 — A's update is lost." },
  ]},
  { key: "non_repeatable_read", title: "Non-repeatable read", description: "READ COMMITTED sees B's commit mid-transaction; REPEATABLE READ pins a snapshot.", steps: [
    { session: "A", sql: "BEGIN ISOLATION LEVEL READ COMMITTED; SELECT power_credits FROM lab_account WHERE id = 1;", expect: "ok", explain: "A reads first value." },
    { session: "B", sql: "UPDATE lab_account SET power_credits = 70 WHERE id = 1; COMMIT;", expect: "ok", explain: "B commits a change." },
    { session: "A", sql: "SELECT power_credits FROM lab_account WHERE id = 1; COMMIT;", expect: "ok", explain: "A re-reads: different value." },
  ]},
  { key: "phantom_or_write_skew", title: "Write skew (SERIALIZABLE)", description: "Both read the sum then update different rows — one gets 40001.", steps: [
    { session: "A", sql: "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT SUM(power_credits) FROM lab_account;", expect: "ok", explain: "A reads the sum." },
    { session: "B", sql: "BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT SUM(power_credits) FROM lab_account;", expect: "ok", explain: "B reads the same sum." },
    { session: "A", sql: "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 1;", expect: "ok", explain: "A debits row 1." },
    { session: "B", sql: "UPDATE lab_account SET power_credits = power_credits - 10 WHERE id = 2;", expect: "ok", explain: "B debits row 2." },
    { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits first." },
    { session: "B", sql: "COMMIT;", expect: "error:40001", explain: "B gets SERIALIZATION FAILURE 40001 — retry." },
  ]},
  { key: "deadlock", title: "Deadlock", description: "A locks 1, B locks 2, then each wants the other — 40P01 aborts a victim.", steps: [
    { session: "A", sql: "BEGIN; SELECT * FROM lab_account WHERE id = 1 FOR UPDATE;", expect: "ok", explain: "A locks row 1." },
    { session: "B", sql: "BEGIN; SELECT * FROM lab_account WHERE id = 2 FOR UPDATE;", expect: "ok", explain: "B locks row 2." },
    { session: "A", sql: "SELECT * FROM lab_account WHERE id = 2 FOR UPDATE;", expect: "waits", explain: "A waits on B." },
    { session: "B", sql: "SELECT * FROM lab_account WHERE id = 1 FOR UPDATE;", expect: "error:40P01", explain: "Cycle: Postgres aborts a victim with 40P01." },
  ]},
  { key: "skip_locked", title: "SKIP LOCKED dispatch", description: "Two router workers claim disjoint packet sets.", steps: [
    { session: "A", sql: "BEGIN; SELECT * FROM dispatch_packets('SAT-A1', 'worker-A', 20000);", expect: "ok", explain: "Worker A claims its batch." },
    { session: "B", sql: "BEGIN; SELECT * FROM dispatch_packets('SAT-A1', 'worker-B', 20000);", expect: "ok", explain: "Worker B skips A's locked rows — disjoint ids." },
    { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits." },
    { session: "B", sql: "COMMIT;", expect: "ok", explain: "B commits." },
  ]},
  { key: "mvcc", title: "MVCC row versions", description: "Uncommitted UPDATE shows xmin/xmax/ctid divergence between sessions.", steps: [
    { session: "A", sql: "BEGIN; UPDATE deployer_pod SET temperature_c = temperature_c + 1 WHERE pod_id = 'POD-A1';", expect: "ok", explain: "A updates without committing." },
    { session: "A", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1';", expect: "ok", explain: "A sees the new version." },
    { session: "B", sql: "SELECT xmin, xmax, ctid, temperature_c FROM deployer_pod WHERE pod_id = 'POD-A1'; SELECT txid_current();", expect: "ok", explain: "B still sees the old version." },
    { session: "A", sql: "COMMIT;", expect: "ok", explain: "A commits; B now sees the new ctid." },
  ]},
  { key: "wal", title: "WAL / LSN", description: "Bulk telemetry insert moves pg_current_wal_lsn forward.", steps: [
    { session: "A", sql: "SELECT pg_current_wal_lsn() AS lsn_before;", expect: "ok", explain: "Record the LSN." },
    { session: "A", sql: "BEGIN; INSERT INTO telemetry SELECT now(), 'SAT-A1', 7.5, 22.0, 100, NULL, '{}' FROM generate_series(1, 1000); COMMIT;", expect: "ok", explain: "Write 1000 rows in one transaction." },
    { session: "A", sql: "SELECT pg_current_wal_lsn() AS lsn_after;", expect: "ok", explain: "LSN advanced; diff is the WAL bytes." },
  ]},
];

type SessKey = "A" | "B";

interface LogEntry {
  n: number;
  session: SessKey;
  sql: string;
  status: string;
  detail: string;
}

function pill(status: string): string {
  if (status === "waiting") return "border-[var(--warn)] text-[var(--warn)] animate-pulse";
  if (status.startsWith("error")) return "border-[var(--ice)] text-[var(--ice)]";
  if (status === "in transaction" || status === "in-transaction") return "border-[var(--ice)] text-[var(--ice)]";
  return "border-[var(--line)] text-[var(--text-2)]";
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
      const r = await apiFetch<TxScenario[]>("/api/labs/tx/scenarios");
      if (Array.isArray(r.data) && r.data.length > 0) {
        setScenarios(r.data);
        setUsingFallback(false);
        setScenarioKey((k) => (r.data.some((s) => s.key === k) ? k : r.data[0].key));
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

  // DELETE the lab session on unmount so no backend conns leak.
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
      const r = await apiFetch<TxLabState>(`/api/labs/tx/${encodeURIComponent(labId)}/state`);
      setState(r.data);
    } catch {
      // Poll failures are transient; keep the last snapshot.
    }
  }, [labId]);

  // Auto-poll every 400 ms only while something is waiting.
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
        const r = await apiFetch<TxExecResult>(
          `/api/labs/tx/${encodeURIComponent(labId)}/exec`,
          { method: "POST", body: JSON.stringify({ session, sql }) },
        );
        const res = r.data;
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
      // Reset is best-effort on a pending backend.
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
        // Ignore teardown errors; a fresh session is still opened below.
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
      <Card
        title="Scenario script"
        kicker="Exp 9 · CO1/CO4"
        aside={
          <div className="flex gap-2">
            <button onClick={() => void reset()} className="font-mono rounded-full border border-[var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)]">
              reset
            </button>
            <button onClick={() => void newSession()} className="font-mono rounded-full bg-[var(--ice)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#04122e] hover:scale-105">
              new lab session
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tx-scenario" className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
            Scenario
          </label>
          <select
            id="tx-scenario"
            value={scenarioKey}
            onChange={(e) => { setScenarioKey(e.target.value); setStepIdx(0); setVerdicts([]); }}
            className="font-mono rounded-lg border border-[var(--line)] bg-[var(--navy-700)] px-2.5 py-1.5 text-[13px] text-[var(--text)] focus:border-[var(--line-strong)] focus:outline-none"
          >
            {scenarios.map((s) => (
              <option key={s.key} value={s.key}>{s.title ?? s.key}</option>
            ))}
          </select>
          {usingFallback && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--warn)]">
              script preview · backend offline
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] text-[var(--text-2)]">{scenario.description}</p>
        <ol className="mt-3 flex flex-col gap-2">
          {scenario.steps.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            const ok = done ? verdicts[i] : null;
            return (
              <li
                key={i}
                className={`rounded-lg border p-2.5 ${
                  current ? "border-[var(--ice)] bg-[var(--navy-700)]" : "border-[var(--line)] bg-[var(--space)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-[var(--text)]">
                    {i + 1}. [{s.session}]
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-3)]">expect {s.expect}</span>
                  {ok === true && <span className="font-mono text-[11px] text-[var(--ok)]">✓</span>}
                  {ok === false && <span className="font-mono text-[11px] text-[var(--ice)]">✗</span>}
                </div>
                <pre className="font-mono mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-[var(--text-2)]">
                  {highlightSql(s.sql)}
                </pre>
                <p className="mt-1 text-[12px] text-[var(--text-3)]">{s.explain}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-3">
          <button
            onClick={nextStep}
            disabled={busy || doneSteps || labId === null}
            className="font-mono rounded-full bg-[var(--ice)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#04122e] hover:scale-105 disabled:opacity-40"
          >
            {doneSteps ? "script complete" : busy ? "running…" : `next step (${stepIdx + 1}/${scenario.steps.length})`}
          </button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {(["A", "B"] as SessKey[]).map((s) => {
          const sess = s === "A" ? state?.session_a : state?.session_b;
          const st = (sess?.status ?? "idle") as string;
          const waitingSess = sess?.result?.status === "waiting";
          const statusLabel = waitingSess ? "waiting" : st;
          return (
            <Card
              key={s}
              title={`Session ${s}`}
              kicker={s === "A" ? `pid ${pids.a ?? "…"}` : `pid ${pids.b ?? "…"}`}
              aside={
                <span className={`font-mono rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${pill(statusLabel)}`}>
                  {statusLabel}
                </span>
              }
            >
              <div className="flex flex-col gap-2">
                <label htmlFor={`tx-sql-${s}`} className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                  Ad-hoc SQL · ctrl+enter runs
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
                  rows={3}
                  spellCheck={false}
                  placeholder="SELECT … | BEGIN; …"
                  className="font-mono min-h-[72px] rounded-lg border border-[var(--line)] bg-[var(--space)] p-2.5 text-[12px] text-[var(--text)]"
                />
                <div>
                  <button
                    onClick={() => { void exec(s, inputs[s], null); setInputs((p) => ({ ...p, [s]: "" })); }}
                    disabled={busy || labId === null || inputs[s].trim() === ""}
                    className="font-mono rounded-full border border-[var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)] disabled:opacity-40"
                  >
                    run
                  </button>
                </div>
                <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {logs.filter((l) => l.session === s).length === 0 && (
                    <p className="font-mono text-[11px] text-[var(--text-3)]">No statements yet.</p>
                  )}
                  {logs.filter((l) => l.session === s).map((l) => (
                    <div key={l.n} className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-2">
                      <p className="font-mono text-[10px] text-[var(--text-3)]">
                        #{l.n} · <span className={l.status.startsWith("error") ? "text-[var(--ice)]" : l.status === "waiting" ? "text-[var(--warn)]" : "text-[var(--ok)]"}>{l.status}</span>
                      </p>
                      <pre className="font-mono mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-[var(--text)]">{l.sql}</pre>
                      <p className="font-mono mt-1 text-[10.5px] text-[var(--text-2)]">{l.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <OutcomeCallouts scenarioKey={scenarioKey} logs={logs} />

      <Card title="Locks + wait-for graph" kicker="pg_locks · pg_blocking_pids">
        <div className="flex flex-col gap-3">
          <WaitGraph
            pidA={pids.a}
            pidB={pids.b}
            aBlocked={aBlockedBy.length > 0}
            bBlocked={bBlockedBy.length > 0}
            cycle={cycle}
          />
          {locks.length === 0 ? (
            <p className="font-mono text-[11px] text-[var(--text-3)]">
              No lock rows yet — run a scenario step, then poll every 400 ms while waiting.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
              <table className="w-full border-collapse text-left">
                <thead className="bg-[var(--navy-700)]">
                  <tr>
                    {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                      <th key={c} className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-2)]">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {locks.map((l, i) => (
                    <tr key={i} className="odd:bg-[var(--space)] even:bg-[var(--navy-800)]">
                      {["pid", "locktype", "mode", "granted", "relation"].map((c) => (
                        <td
                          key={c}
                          className={`font-mono px-2.5 py-1.5 text-[11.5px] ${
                            c === "granted" && l[c] === false ? "text-[var(--warn)]" : "text-[var(--text)]"
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
          {state?.lab_table !== undefined && state.lab_table !== null && state.lab_table.length > 0 && (
            <div>
              <p className="font-mono mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">
                lab_account
              </p>
              <DataGrid rows={state.lab_table as Array<Record<string, unknown>>} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function WaitGraph({ pidA, pidB, aBlocked, bBlocked, cycle }: {
  pidA: number | null;
  pidB: number | null;
  aBlocked: boolean;
  bBlocked: boolean;
  cycle: boolean;
}) {
  const color = cycle ? "var(--danger)" : "var(--ice)";
  return (
    <svg viewBox="0 0 360 84" role="img" aria-label="wait-for graph" className="w-full max-w-[420px] rounded-lg border border-[var(--line)] bg-[var(--space)] p-2">
      <g fontFamily="Geist Mono, monospace" fontSize="11">
        <circle cx="60" cy="42" r="22" fill="none" stroke={aBlocked ? color : "var(--line)"} strokeWidth="2" />
        <text x="60" y="46" textAnchor="middle" fill="var(--text)">A</text>
        <text x="60" y="78" textAnchor="middle" fill="var(--text-3)" fontSize="9">{pidA ?? "…"}</text>
        <circle cx="300" cy="42" r="22" fill="none" stroke={bBlocked ? color : "var(--line)"} strokeWidth="2" />
        <text x="300" y="46" textAnchor="middle" fill="var(--text)">B</text>
        <text x="300" y="78" textAnchor="middle" fill="var(--text-3)" fontSize="9">{pidB ?? "…"}</text>
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
          <text x="180" y="46" textAnchor="middle" fill="var(--text-3)">no waits</text>
        )}
        {cycle && (
          <text x="180" y="20" textAnchor="middle" fill="var(--danger)">DEADLOCK CYCLE</text>
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
      <div role="alert" className="rounded-xl border border-[var(--ice)] bg-[var(--navy-800)] p-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--ice)]">
          Serialization failure · 40001 — retry the transaction
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-2)]">
          SERIALIZABLE saw a read/write cycle between A and B. One committer wins; the other must retry from BEGIN.
        </p>
      </div>
    );
  }
  if (scenarioKey === "deadlock" && has40P01) {
    return (
      <div role="alert" className="rounded-xl border border-[var(--ice)] bg-[var(--navy-800)] p-4">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--ice)]">
          Deadlock detected · 40P01 — Postgres aborted one victim
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-2)]">
          A → B and B → A formed a wait cycle. After deadlock_timeout Postgres picks a victim; retry it.
        </p>
      </div>
    );
  }
  if (scenarioKey === "skip_locked") {
    const idsA = extractIds(logs.filter((l) => l.session === "A").at(-1)?.detail ?? "");
    const idsB = extractIds(logs.filter((l) => l.session === "B").at(-1)?.detail ?? "");
    if (idsA.length > 0 || idsB.length > 0) {
      const overlap = idsA.filter((x) => idsB.includes(x));
      return (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ok)]">
            SKIP LOCKED — {overlap.length === 0 ? "disjoint ✓" : `overlap ✗ (${overlap.length})`}
          </p>
          <p className="font-mono mt-2 text-[11px] text-[var(--text-2)]">A: [{idsA.slice(0, 12).join(", ")}]{idsA.length > 12 ? "…" : ""}</p>
          <p className="font-mono mt-1 text-[11px] text-[var(--text-2)]">B: [{idsB.slice(0, 12).join(", ")}]{idsB.length > 12 ? "…" : ""}</p>
        </div>
      );
    }
  }
  if (scenarioKey === "mvcc") {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ice)]">MVCC</p>
        <p className="mt-1 text-[13px] text-[var(--text-2)]">
          A updated without committing: A reads the new tuple (new xmax/ctid), B still reads the old committed
          version. Compare xmin, xmax and ctid in both result logs; after COMMIT, B sees the new ctid.
        </p>
      </div>
    );
  }
  if (scenarioKey === "wal") {
    return (
      <WALBar logs={logs} />
    );
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
  void lsns;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--warn)]">WAL</p>
      <p className="mt-1 text-[13px] text-[var(--text-2)]">
        Every write goes to the write-ahead log before the heap. Take LSN before/after the 1000-row insert and
        diff with pg_wal_lsn_diff — the bar is the WAL bytes that make crash recovery possible.
      </p>
      <SqlBlock sql="SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') AS wal_bytes;" />
    </div>
  );
}
