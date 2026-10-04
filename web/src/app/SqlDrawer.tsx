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
  open: boolean;
  setOpen: (v: boolean) => void;
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
  const [open, setOpen] = useState(false);

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
      // refusal card — only surface real PostgreSQL refusals here.
      if (err.status !== 0) setLastError(err);
    });
    return () => {
      setSqlPusher(null);
      setSqlErrorPusher(null);
    };
  }, [push]);

  const value = useMemo(
    () => ({ records, push, clear, lastError, dismissError, open, setOpen }),
    [records, push, clear, lastError, dismissError, open],
  );

  return <SqlLogContext.Provider value={value}>{children}</SqlLogContext.Provider>;
}

function ExpCoChip({ r }: { r: SqlRecord }) {
  if (!r.exp && !r.co) return null;
  const label = [r.exp, r.co].filter(Boolean).join(" ");
  return (
    <span className="rounded-full bg-[var(--navy-700)] px-2 py-0.5 text-[10px] text-[var(--ice)]">
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
 * "SQL under the hood": a right-side slide-over, 480px on navy-900.
 * Lists every SQL record of the most recent API calls, newest first.
 */
export function SqlDrawer() {
  const { records, clear, lastError, dismissError, open, setOpen } = useSqlLog();

  return (
    <>
      {open && (
        <button
          aria-label="Close SQL drawer"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60"
        />
      )}
      <aside
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(480px,100vw)] flex-col border-l border-[var(--line)] bg-[var(--navy-900)] transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[var(--text)]">
            SQL under the hood
          </h2>
          <span className="rounded-full bg-[var(--navy-700)] px-2 py-0.5 text-[11px] text-[var(--ice)]">
            {records.length}
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close SQL drawer"
            className="ml-auto rounded-lg border border-[var(--line)] px-2 py-1 text-[12px] text-[var(--text-2)] hover:text-[var(--text)]"
          >
            ×
          </button>
        </div>
        {lastError !== null && lastError.status !== 0 && (
          <div
            role="alert"
            className="m-3 rounded-[10px] border border-[var(--line)] border-l-4 border-l-[var(--danger)] bg-[var(--navy-800)] p-4"
            style={{ boxShadow: "0 10px 30px -12px #000a" }}
          >
            <div className="flex items-start gap-2">
              <p className="text-[13px] font-semibold text-[var(--text)]">
                PostgreSQL refused this
              </p>
              {(lastError.sqlstate ?? lastError.status) !== undefined && (
                <span className="ml-auto shrink-0 rounded-full bg-[var(--navy-700)] px-2 py-0.5 font-mono text-[10px] text-[var(--danger)]">
                  {lastError.sqlstate ?? lastError.status}
                </span>
              )}
              <button
                onClick={dismissError}
                aria-label="Dismiss error"
                className="rounded px-1.5 text-[var(--text-3)] hover:text-[var(--text)]"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[var(--text)]">
              {lastError.message}
            </p>
            {lastError.detail !== undefined && lastError.detail !== "" && (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-2)]">
                {lastError.detail}
              </p>
            )}
            {lastError.sql.length > 0 && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--space)] p-2.5 font-mono text-[12.5px] leading-relaxed text-[var(--text)]">
                {highlightSql(lastError.sql[0].sql)}
              </pre>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">
          {records.length === 0 ? (
            <p className="px-1 py-2 text-[13px] leading-relaxed text-[var(--text-3)]">
              No SQL yet. Every API call logs its exact statement here.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <button
                  onClick={clear}
                  className="rounded-lg px-2 py-1 text-[12px] text-[var(--text-3)] hover:text-[var(--text)]"
                >
                  Clear
                </button>
              </div>
              {records.map((r, i) => (
                <div
                  key={`${r.label}-${i}`}
                  className="rounded-[10px] border border-[var(--line)] bg-[var(--space)] p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] text-[var(--text)]">
                      {r.label}
                    </span>
                    <ExpCoChip r={r} />
                    {r.elapsed_ms !== null && r.elapsed_ms !== undefined && (
                      <span className="ml-auto font-mono text-[10px] text-[var(--text-3)]">
                        {r.elapsed_ms.toFixed(1)} ms
                      </span>
                    )}
                    {r.rowcount !== null && r.rowcount !== undefined && (
                      <span className="font-mono text-[10px] text-[var(--text-3)]">
                        {r.rowcount} rows
                      </span>
                    )}
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-[var(--text)]">
                    {highlightSql(r.sql)}
                  </pre>
                  <div className="mt-1.5 flex justify-end">
                    <button
                      onClick={() => copyText(r.sql)}
                      className="rounded-lg border border-[var(--line)] px-2 py-0.5 text-[12px] text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/** Header button opening the drawer, with a count badge. */
export function SqlButton() {
  const { records, setOpen } = useSqlLog();
  return (
    <button
      onClick={() => setOpen(true)}
      className="relative rounded-lg bg-[var(--navy-700)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--navy-600)]"
    >
      SQL
      {records.length > 0 && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--ice)] px-1.5 py-px font-mono text-[10px] font-semibold text-[#04122e]">
          {records.length}
        </span>
      )}
    </button>
  );
}

/** Calm offline card used by pages when the network itself fails. */
export function BackendOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--navy-800)] p-6 text-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ice)"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="mx-auto"
        aria-hidden="true"
      >
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="1.2" fill="var(--ice)" stroke="none" />
        <line x1="4" y1="4" x2="20" y2="20" />
      </svg>
      <p className="mt-3 text-[14px] text-[var(--text)]">
        Backend is offline. Start it with{" "}
        <code className="font-mono text-[13px] text-[var(--ice)]">
          python run.py
        </code>
        , then retry.
      </p>
      {onRetry !== undefined && (
        <button
          onClick={onRetry}
          className="mt-4 h-9 rounded-lg bg-[var(--ice)] px-4 text-[13px] font-semibold text-[#04122e] hover:bg-[var(--ice-strong)]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
