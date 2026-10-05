import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Panel } from "@/components/cc/Panel";
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
 * "SQL under the hood": a right-side slide-over console drawer.
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
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm cursor-pointer"
        />
      )}
      <aside
        aria-hidden={!open}
        style={{ visibility: open ? "visible" : "hidden" }}
        className={`fixed right-0 top-0 z-50 flex h-full w-[min(520px,100vw)] flex-col border-l border-white/10 bg-black text-[#dfe6f5] transition-[transform,visibility] duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header in mono uppercase */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
              SQL UNDER THE HOOD
            </h2>
            <span className="font-mono text-[10px] px-1.5 py-0.5 border border-[#3d5bff]/40 text-[#7fb2ff] bg-[#3d5bff]/10">
              {records.length}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close SQL drawer"
            className="rounded-none border border-white/15 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#8b96b0] hover:text-white hover:border-white/30 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Postgres error panel */}
        {lastError !== null && lastError.status !== 0 && (
          <div className="p-3">
            <Panel cut={6} borderColor="#ff3b4f" glowColor="rgba(255, 59, 79, 0.2)">
              <div className="p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff3b4f]">
                    PostgreSQL Refused This
                  </span>
                  {(lastError.sqlstate ?? lastError.status) !== undefined && (
                    <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#ff3b4f]/40 text-[#ff3b4f] bg-[#ff3b4f]/10">
                      {lastError.sqlstate ?? lastError.status}
                    </span>
                  )}
                  <button
                    onClick={dismissError}
                    aria-label="Dismiss error"
                    className="ml-2 font-mono text-[11px] text-[#8b96b0] hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <p className="font-sans text-[12px] text-[#dfe6f5] leading-snug">
                  {lastError.message}
                </p>
                {lastError.detail !== undefined && lastError.detail !== "" && (
                  <p className="font-mono text-[11px] text-[#8b96b0] leading-relaxed">
                    {lastError.detail}
                  </p>
                )}
                {lastError.sql.length > 0 && (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-none bg-[#05070d] border border-white/10 p-2.5 font-mono text-[12.5px] leading-relaxed text-[#dfe6f5]">
                    {highlightSql(lastError.sql[0].sql)}
                  </pre>
                )}
              </div>
            </Panel>
          </div>
        )}

        {/* Drawer Query Feed */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {records.length === 0 ? (
            <p className="px-1 py-4 font-mono text-[11px] uppercase tracking-wider text-[#8b96b0] text-center">
              No SQL captured yet. Every API call logs its exact statement here.
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  onClick={clear}
                  className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b96b0] hover:text-white border border-white/15 hover:border-white/30 px-2 py-0.5 bg-transparent transition-colors cursor-pointer"
                >
                  Clear Feed
                </button>
              </div>

              {records.map((r, i) => (
                <Panel key={`${r.label}-${i}`} cut={6} className="w-full">
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#dfe6f5]">
                        {r.label}
                      </span>
                      {r.elapsed_ms !== null && r.elapsed_ms !== undefined && (
                        <span className="ml-auto font-mono text-[10px] text-[#8b96b0]">
                          {r.elapsed_ms.toFixed(1)} ms
                        </span>
                      )}
                      {r.rowcount !== null && r.rowcount !== undefined && (
                        <span className="font-mono text-[10px] text-[#8b96b0]">
                          {r.rowcount} rows
                        </span>
                      )}
                    </div>

                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-none bg-[#05070d] border border-white/10 p-2.5 font-mono text-[12.5px] leading-relaxed text-[#dfe6f5]">
                      {highlightSql(r.sql)}
                    </pre>

                    <div className="flex justify-end">
                      <button
                        onClick={() => copyText(r.sql)}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border border-white/15 bg-transparent text-[#8b96b0] hover:text-white hover:border-white/30 transition-colors cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </Panel>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Header button opening the drawer, with a count badge. Chamfered mono button with royal blue badge. */
export function SqlButton() {
  const { records, setOpen } = useSqlLog();
  const cut = 5;
  const outerPolygon = `polygon(${cut}px 0%, calc(100% - ${cut}px) 0%, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0% calc(100% - ${cut}px), 0% ${cut}px)`;
  const innerPolygon = `polygon(${cut - 0.5}px 0%, calc(100% - ${cut - 0.5}px) 0%, 100% ${cut - 0.5}px, 100% calc(100% - ${cut - 0.5}px), calc(100% - ${cut - 0.5}px) 100%, ${cut - 0.5}px 100%, 0% calc(100% - ${cut - 0.5}px), 0% ${cut - 0.5}px)`;

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open SQL drawer"
      className="relative group cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#3d5bff]"
    >
      <div
        style={{
          clipPath: outerPolygon,
          WebkitClipPath: outerPolygon,
          backgroundColor: "rgba(255, 255, 255, 0.15)",
        }}
        className="p-[1px] group-hover:bg-white/30 transition-colors"
      >
        <div
          style={{
            clipPath: innerPolygon,
            WebkitClipPath: innerPolygon,
            backgroundColor: "rgba(6, 11, 23, 0.8)",
          }}
          className="px-2.5 py-1 flex items-center gap-1.5 group-hover:bg-white/[0.06] transition-colors"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#dfe6f5]">
            SQL
          </span>
          {records.length > 0 && (
            <span className="font-mono text-[9px] px-1 py-px bg-[#3d5bff] text-white font-semibold rounded-[1px] shadow-[0_0_6px_rgba(61,91,255,0.6)]">
              {records.length}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Calm offline card used by pages when the network itself fails. */
export function BackendOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <Panel cut={8} borderColor="rgba(245, 165, 36, 0.4)" className="max-w-lg mx-auto">
      <div className="p-6 text-center flex flex-col items-center gap-3">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f5a524"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="mx-auto"
          aria-hidden="true"
        >
          <path d="M5 12.5a10 10 0 0 1 14 0" />
          <path d="M8.5 16a5 5 0 0 1 7 0" />
          <circle cx="12" cy="19" r="1.2" fill="#f5a524" stroke="none" />
          <line x1="4" y1="4" x2="20" y2="20" />
        </svg>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a524]">
          CONNECTION LOST · BACKEND OFFLINE
        </div>
        <p className="text-[13px] text-[#dfe6f5]">
          Backend is offline. Start it with{" "}
          <code className="font-mono text-[12px] bg-[#05070d] border border-white/10 px-1.5 py-0.5 text-white">
            python run.py
          </code>
          , then retry.
        </p>
        {onRetry !== undefined && (
          <button
            onClick={onRetry}
            className="mt-2 h-8 px-4 font-mono text-[11px] uppercase tracking-[0.1em] font-medium bg-[#3d5bff] text-white border border-[#3d5bff] hover:bg-[#4d6aff] transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        )}
      </div>
    </Panel>
  );
}
