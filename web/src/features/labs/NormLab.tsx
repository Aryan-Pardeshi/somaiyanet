import { useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { OfflineOrEmpty } from "./common";

// Normalization lab, kept basic: one messy sheet, five steps, one table view per
// step, and the database's own lossless check. Data comes from the norm schema
// (db/09_normalization.sql).

interface Stage {
  stage: string;
  table: string;
  rows: Array<Record<string, unknown>>;
  count: number;
}

interface Lossless {
  stage: string;
  rows_original: number;
  rows_rejoined: number;
  missing: number;
  spurious: number;
}

interface Step {
  key: string;
  text: string;
  tables: Array<{ id: string; label: string; highlight?: string[]; columns?: string[] }>;
  check?: string;
}

// Fewer columns on the wide early tables, so the two problems are easy to spot.
const PASS_COLS = ["log_no", "sat_name", "station_city", "pass_date", "operator_name", "operator_phone"];

const STEPS: Step[] = [
  {
    key: "UNF",
    text: "One messy sheet with two problems. The “modes sent” cell holds a whole list, and the same operator’s phone number is typed again on many rows.",
    tables: [{ id: "unf", label: "Flight log", highlight: ["modes_sent", "operator_phone"], columns: [...PASS_COLS.slice(0, 4), "modes_sent", ...PASS_COLS.slice(4)] }],
  },
  {
    key: "1NF",
    text: "One value per cell. The list is split so each data type gets its own row. The phone number is still repeated, now even more often.",
    tables: [{ id: "1nf", label: "Flight log, one value per cell", highlight: ["operator_phone"], columns: ["log_no", "mode", "bytes", ...PASS_COLS.slice(1)] }],
    check: "unf->1nf",
  },
  {
    key: "2NF",
    text: "Facts about the pass (satellite, station, operator) depend only on the log number, not on the data type. They move to their own table, so they’re stored once per pass.",
    tables: [
      { id: "2nf-header", label: "Pass", highlight: ["operator_phone"], columns: PASS_COLS },
      { id: "2nf-lines", label: "Data sent in each pass" },
    ],
    check: "1nf->2nf",
  },
  {
    key: "3NF",
    text: "An operator’s phone depends on the operator, not on the pass (the same goes for a station’s city, a satellite’s plane and a pod’s mechanism). Each gets its own small table, so every phone number is now stored exactly once.",
    tables: [
      { id: "3nf-fact", label: "Pass" },
      { id: "3nf-sat", label: "Satellite" },
      { id: "3nf-pod", label: "Pod" },
      { id: "3nf-station", label: "Station" },
      { id: "3nf-operator", label: "Operator" },
    ],
    check: "2nf->3nf",
  },
  {
    key: "BCNF",
    text: "One last case. In the duty roster, each operator always works at the same station, so that fact is split into its own table too.",
    tables: [
      { id: "bcnf-duty", label: "Duty roster, before", highlight: ["station_callsign"] },
      { id: "bcnf-operator-station", label: "Operator’s station" },
      { id: "bcnf-duty-bcnf", label: "Duty roster, after" },
    ],
    check: "bcnf",
  },
];

const MAX_ROWS = 8;

export function NormLab() {
  const [stages, setStages] = useState<Record<string, Stage> | null>(null);
  const [checks, setChecks] = useState<Record<string, Lossless>>({});
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState(0);

  const load = () => {
    setError(null);
    apiFetch<{ stages: Stage[] }>("/api/labs/norm/stages")
      .then((r) => setStages(Object.fromEntries(r.data.stages.map((s) => [s.stage, s]))))
      .catch((e) => setError(e));
    apiFetch<Lossless[]>("/api/labs/norm/lossless")
      .then((r) => setChecks(Object.fromEntries(r.data.map((c) => [c.stage, c]))))
      .catch(() => undefined);
  };

  useEffect(load, []);

  if (error !== null && stages === null) {
    return <OfflineOrEmpty error={error} onRetry={load} hint="GET /api/labs/norm/stages" />;
  }

  const s = STEPS[step];
  const check = s.check ? checks[s.check] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex flex-wrap gap-1 rounded-[10px] border border-white/[0.08] bg-[var(--sx-surface)] p-1"
          role="tablist"
          aria-label="Normal form"
        >
          {STEPS.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={i === step}
              onClick={() => setStep(i)}
              className={`min-h-[36px] cursor-pointer rounded-[8px] px-3.5 py-1.5 text-[13px] transition-colors ${
                i === step ? "bg-[var(--sx-surface-2)] font-semibold text-white" : "text-[var(--sx-text-2)] hover:text-white"
              }`}
            >
              {x.key}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStep((i) => Math.min(STEPS.length - 1, i + 1))}
          disabled={step === STEPS.length - 1}
          className="sx-btn sx-btn--sm"
        >
          Next step
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-[18px] font-semibold text-white">
          {step === 0 ? "Before: one messy sheet" : `Step ${step}: ${s.key}`}
        </h2>
        <p className="sx-body max-w-[70ch] text-[15px]">{s.text}</p>
        {s.tables.some((t) => t.highlight) && (
          <p className="sx-caption">
            <span className="rounded-[4px] bg-[rgba(255,159,10,0.16)] px-1.5 py-0.5 text-[var(--sx-orange)]">Orange</span>{" "}
            cells are the problem this step still has.
          </p>
        )}
      </div>

      {check && (
        <div className="sx-group">
          <div className="sx-row justify-between gap-3">
            <span className="text-[14px] text-white">
              Joining these tables back gives the original {check.rows_original} rows: {check.missing} missing,{" "}
              {check.spurious} extra.
            </span>
            <span className="sx-status shrink-0" data-tone={check.missing === 0 && check.spurious === 0 ? "ok" : "critical"}>
              {check.missing === 0 && check.spurious === 0 ? "Nothing lost" : "Data lost"}
            </span>
          </div>
        </div>
      )}

      {stages === null ? (
        <p className="sx-caption">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {s.tables.map((t) => {
            const st = stages[t.id];
            if (!st) return null;
            return (
              <SmallTable key={t.id} label={t.label} table={st.table} rows={st.rows} highlight={t.highlight ?? []} columns={t.columns} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SmallTable({
  label,
  table,
  rows,
  highlight,
  columns,
}: {
  label: string;
  table: string;
  rows: Array<Record<string, unknown>>;
  highlight: string[];
  columns?: string[];
}) {
  const cols = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  // A value is "repeated" when it shows up in more than one row of that column.
  const seen: Record<string, Record<string, number>> = {};
  for (const c of cols) {
    seen[c] = {};
    for (const r of rows) {
      const v = String(r[c] ?? "");
      seen[c][v] = (seen[c][v] ?? 0) + 1;
    }
  }
  const isHot = (c: string, v: string) => highlight.includes(c) && (c === "modes_sent" ? v.includes(";") : seen[c][v] > 1);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[14px] font-semibold text-white">{label}</h3>
        <span className="font-mono text-[11px] text-[var(--sx-text-3)]">
          {table} · {rows.length} rows{columns ? " · some columns hidden" : ""}
        </span>
      </div>
      <div className="sx-group overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.08]">
              {cols.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-medium text-[var(--sx-text-3)]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.slice(0, MAX_ROWS).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => {
                  const v = String(r[c] ?? "");
                  return (
                    <td
                      key={c}
                      className={`whitespace-nowrap px-3 py-1.5 ${
                        isHot(c, v) ? "bg-[rgba(255,159,10,0.12)] text-[var(--sx-orange)]" : "text-[var(--sx-text-2)]"
                      }`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && <span className="sx-caption">and {rows.length - MAX_ROWS} more rows</span>}
    </div>
  );
}
