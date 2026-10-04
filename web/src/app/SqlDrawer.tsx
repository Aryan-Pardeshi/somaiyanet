import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, setSqlErrorPusher, setSqlPusher } from "./api";
import type { SqlRecord } from "./api";
import { highlightSql } from "./sql";

interface SqlLog {
  records: SqlRecord[];
  push: (recs: SqlRecord[]) => void;
  clear: () => void;
  lastError: ApiError | null;
  dismissError: () => void;
}

const SqlLogContext = createContext<SqlLog | null>(null);

/** Pages read the drawer feed with this; apiFetch pushes automatically. */
export function useSqlLog(): SqlLog {
  const ctx = useContext(SqlLogContext);
  if (!ctx) throw new Error("useSqlLog must be used inside <SqlProvider>");
  return ctx;
}

const MAX_RECORDS = 60;

export function SqlProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<SqlRecord[]>([]);
  const [lastError, setLastError] = useState<ApiError | null>(null);

  const push = useCallback((recs: SqlRecord[]) => {
    if (recs.length === 0) return;
    setRecords((prev) => [...recs, ...prev].slice(0, MAX_RECORDS));
  }, []);

  const clear = useCallback(() => setRecords([]), []);
  const dismissError = useCallback(() => setLastError(null), []);

  useEffect(() => {
    setSqlPusher(push);
    setSqlErrorPusher((err: ApiError) => {
      // Network-offline (status 0) is shown inline by pages, not as a
      // red refusal card — only surface real PostgreSQL refusals here.
      if (err.status !== 0) setLastError(err);
    });
    return () => {
      setSqlPusher(null);
      setSqlErrorPusher(null);
    };
  }, [push]);

  const value = useMemo(
    () => ({ records, push, clear, lastError, dismissError }),
    [records, push, clear, lastError, dismissError],
  );

  return <SqlLogContext.Provider value={value}>{children}</SqlLogContext.Provider>;
}

function ExpCoChip({ r }: { r: SqlRecord }) {
  if (!r.exp && !r.co) return null;
  const label = [r.exp, r.co].filter(Boolean).join(" · ");
  return (
    <span className="font-mono rounded-full bg-[var(--somaiya-soft)] px-2 py-0.5 text-[10px] tracking-[0.08em] text-[var(--cream)]">
      {label}
    </span>
  );
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    // Clipboard unavailable (permissions/headless): selection still works.
  });
}

/**
 * Signature "SQL under the hood" drawer, docked bottom-right.
 * Lists every SQL record of the most recent API calls, newest first.
 */
export function SqlDrawer() {
  const { records, clear, lastError, dismissError } = useSqlLog();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col items-end gap-2">
      {lastError !== null && lastError.status !== 0 && (
        <div
          role="alert"
          className="w-full rounded-xl border border-[var(--somaiya)] bg-[var(--ink-2)] p-4 shadow-2xl"
        >
          <div className="flex items-start gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--somaiya)]">
              PostgreSQL refused · {lastError.sqlstate ?? lastError.status}
            </p>
            <button
              onClick={dismissError}
              aria-label="Dismiss error"
              className="font-mono ml-auto rounded px-1.5 text-[var(--mute)] hover:text-[var(--cream)]"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-[var(--cream)]">
            {lastError.message}
          </p>
          {lastError.detail !== undefined && lastError.detail !== "" && (
            <p className="font-mono mt-1 text-[11px] leading-relaxed text-[var(--cream-dim)]">
              {lastError.detail}
            </p>
          )}
          {lastError.sql.length > 0 && (
            <pre className="font-mono mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-2.5 text-[11px] leading-relaxed text-[var(--cream-dim)]">
              {lastError.sql[0].sql}
            </pre>
          )}
        </div>
      )}
      <div className="w-full overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] shadow-2xl">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="font-mono flex w-full items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-[var(--cream-dim)] hover:text-[var(--cream)]"
        >
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full bg-[var(--somaiya)]"
          />
          SQL · {records.length}
          <span className="ml-auto text-[var(--mute)]">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-[var(--rule)] p-3">
            {records.length === 0 ? (
              <p className="font-mono px-1 py-2 text-[11px] leading-relaxed text-[var(--mute)]">
                No SQL yet — every API call logs its exact statement here.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    onClick={clear}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)] hover:text-[var(--cream)]"
                  >
                    clear
                  </button>
                </div>
                {records.map((r, i) => (
                  <div
                    key={`${r.label}-${i}`}
                    className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-[var(--cream)]">
                        {r.label}
                      </span>
                      <ExpCoChip r={r} />
                      {r.elapsed_ms !== null && r.elapsed_ms !== undefined && (
                        <span className="font-mono ml-auto text-[10px] text-[var(--mute)]">
                          {r.elapsed_ms.toFixed(1)} ms
                        </span>
                      )}
                      {r.rowcount !== null && r.rowcount !== undefined && (
                        <span className="font-mono text-[10px] text-[var(--mute)]">
                          {r.rowcount} rows
                        </span>
                      )}
                    </div>
                    <pre className="font-mono mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--cream)]">
                      {highlightSql(r.sql)}
                    </pre>
                    <div className="mt-1.5 flex justify-end">
                      <button
                        onClick={() => copyText(r.sql)}
                        className="font-mono rounded border border-[var(--rule)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
                      >
                        copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Calm offline card used by pages when the network itself fails. */
export function BackendOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--amber)]/60 bg-[var(--ink-2)] p-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--amber)]">
        02 / Backend offline
      </p>
      <p className="font-mono mt-2 text-[12px] text-[var(--cream-dim)]">
        Backend offline: run `python run.py`
      </p>
      {onRetry !== undefined && (
        <button
          onClick={onRetry}
          className="font-mono mt-4 rounded-full bg-[var(--somaiya)] px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-105"
        >
          retry
        </button>
      )}
    </div>
  );
}
