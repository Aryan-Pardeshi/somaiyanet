import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
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

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {
    // Clipboard unavailable (permissions/headless): selection still works.
  });
}

/**
 * "SQL under the hood": Apple sheet slide-over console drawer.
 * Lists every SQL record of the most recent API calls, newest first.
 */
export function SqlDrawer() {
  const { records, clear, lastError, dismissError, open, setOpen } = useSqlLog();

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close SQL drawer"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm cursor-pointer"
        />
      )}
      <aside
        aria-hidden={!open}
        style={{ visibility: open ? "visible" : "hidden" }}
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(540px,100vw)] flex-col rounded-l-[16px] border-l border-[var(--sx-hairline)] bg-[var(--sx-surface)] text-[var(--sx-text)] shadow-2xl transition-[transform,visibility] duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Grabber bar at top */}
        <div className="mx-auto mt-2.5 h-[5px] w-9 rounded-full bg-white/25" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="sx-h3">
              SQL under the hood
            </h2>
            {records.length > 0 && (
              <span className="rounded-full bg-[var(--sx-surface-2)] px-2 py-0.5 sx-num text-[11px] text-[var(--sx-text-2)]">
                {records.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close SQL drawer"
            className="sx-btn sx-btn--quiet sx-btn--sm p-1"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Postgres error panel */}
        {lastError !== null && lastError.status !== 0 && (
          <div className="p-4 border-b border-[var(--sx-hairline)]">
            <div className="rounded-[12px] bg-[var(--sx-night)] p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="sx-eyebrow text-[var(--sx-red)]">
                  PostgreSQL Refused This
                </span>
                {(lastError.sqlstate ?? lastError.status) !== undefined && (
                  <span className="font-mono text-[11px] text-[var(--sx-red)]">
                    {lastError.sqlstate ?? lastError.status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={dismissError}
                  aria-label="Dismiss error"
                  className="sx-btn sx-btn--quiet sx-btn--sm p-0 h-auto text-[11px]"
                >
                  Dismiss
                </button>
              </div>
              <p className="sx-body text-[13px] leading-snug">
                {lastError.message}
              </p>
              {lastError.detail !== undefined && lastError.detail !== "" && (
                <p className="font-mono text-[11px] text-[var(--sx-text-3)] leading-relaxed">
                  {lastError.detail}
                </p>
              )}
              {lastError.sql.length > 0 && (
                <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
                  {highlightSql(lastError.sql[0].sql)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Drawer Query Feed */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {records.length === 0 ? (
            <p className="px-2 py-8 sx-caption text-center">
              No SQL captured yet. Every API call logs its exact statement here.
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clear}
                  className="sx-btn sx-btn--quiet sx-btn--sm"
                >
                  Clear Feed
                </button>
              </div>

              {records.map((r, i) => (
                <div
                  key={`${r.label}-${i}`}
                  className="rounded-[12px] bg-[var(--sx-night)] p-3.5 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sx-eyebrow text-white">
                      {r.label}
                    </span>
                    {r.elapsed_ms !== null && r.elapsed_ms !== undefined && (
                      <span className="ml-auto sx-num text-[11px] text-[var(--sx-text-3)]">
                        {r.elapsed_ms.toFixed(1)} ms
                      </span>
                    )}
                    {r.rowcount !== null && r.rowcount !== undefined && (
                      <span className="sx-num text-[11px] text-[var(--sx-text-3)]">
                        {r.rowcount} rows
                      </span>
                    )}
                  </div>

                  <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
                    {highlightSql(r.sql)}
                  </pre>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => copyText(r.sql)}
                      className="sx-btn sx-btn--quiet sx-btn--sm"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Header button opening the drawer, with a count badge. Ghost pill sx-btn--sm. */
export function SqlButton() {
  const { records, setOpen } = useSqlLog();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open SQL drawer"
      className="sx-btn sx-btn--sm flex items-center gap-1.5"
    >
      <span>SQL</span>
      {records.length > 0 && (
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 sx-num text-[10px] text-white leading-none">
          {records.length}
        </span>
      )}
    </button>
  );
}

/** Calm offline card used by pages when the network itself fails. */
export function BackendOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-[14px] bg-[var(--sx-surface)] p-6 text-center flex flex-col items-center gap-3">
      <div className="sx-status" data-tone="warn">
        Backend offline
      </div>
      <p className="sx-body m-0 text-white">
        Backend is offline. Start it with{" "}
        <code className="sx-code px-2 py-0.5 text-[12px]">
          python run.py
        </code>
        , then retry.
      </p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="sx-btn sx-btn--sm mt-2"
        >
          Retry connection
        </button>
      )}
    </div>
  );
}
