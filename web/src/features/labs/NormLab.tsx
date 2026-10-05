import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { Card, OfflineOrEmpty, Panel, StatusBadge } from "./common";
import type { LosslessRow, NormAnomaly, NormStage } from "./types";

const STAGES = ["UNF", "1NF", "2NF", "3NF", "BCNF"];

export function NormLab() {
  const [stages, setStages] = useState<NormStage[]>([]);
  const [anomalies, setAnomalies] = useState<NormAnomaly[]>([]);
  const [lossless, setLossless] = useState<LosslessRow[]>([]);
  const [bootError, setBootError] = useState<unknown>(null);
  const [active, setActive] = useState(0);
  const [anomalyKind, setAnomalyKind] = useState<"update" | "insert" | "delete">("update");

  const load = useCallback(async () => {
    try {
      const [s, a, l] = await Promise.all([
        apiFetch<{
          stages?: Array<{ stage: string; table: string; rows: Array<Record<string, unknown>> }>;
          fds?: Array<{ stage: string; fd: string; violates: string; fix: string }>;
        }>("/api/labs/norm/stages"),
        apiFetch<Record<string, NormAnomaly[]>>("/api/labs/norm/anomalies"),
        apiFetch<LosslessRow[]>("/api/labs/norm/lossless"),
      ]);
      setStages(groupStages(s.data.stages ?? [], s.data.fds ?? []));
      setAnomalies(flattenAnomalies(a.data));
      setLossless(l.data);
      setBootError(null);
    } catch (e) {
      setBootError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (bootError !== null && stages.length === 0) {
    return (
      <OfflineOrEmpty
        error={bootError}
        onRetry={() => void load()}
        hint="GET /api/labs/norm/stages — lab backend (brief 10a) still being built in parallel."
      />
    );
  }

  const shown: NormStage[] = stages.length > 0 ? stages : fallbackStages();
  const shownLossless: LosslessRow[] = lossless.length > 0 ? lossless : fallbackLossless();
  const shownAnomalies: NormAnomaly[] = anomalies.length > 0 ? anomalies : fallbackAnomalies();
  const cur = shown[Math.min(active, shown.length - 1)];
  const anomaly = pickAnomaly(shownAnomalies, anomalyKind);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Normalization Stepper with Chamfered Tabs */}
      <Card title="Decomposition pipeline" kicker="UNF → BCNF · Relational normal forms · CO3">
        {/* Horizontal stepper of chamfered tabs */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none"
          role="tablist"
          aria-label="Normal forms stepper"
        >
          {shown.map((s, i) => {
            const isCur = i === active;
            const isDone = i < active;

            return (
              <div key={s.stage} className="flex items-center gap-2 shrink-0">
                <button
                  role="tab"
                  aria-selected={isCur}
                  onClick={() => setActive(i)}
                  className={`font-mono text-[11px] uppercase tracking-[0.1em] px-3.5 py-1.5 transition-all cursor-pointer ${
                    isCur
                      ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_10px_rgba(61,91,255,0.4)]"
                      : isDone
                        ? "bg-[#7ee2b8]/10 text-[#7ee2b8] border border-[#7ee2b8]/40 hover:bg-[#7ee2b8]/20"
                        : "bg-white/[0.03] text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.06] border border-white/10"
                  }`}
                  style={{
                    clipPath:
                      "polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)",
                  }}
                >
                  <span className="opacity-60 mr-1.5">{i + 1}.</span>
                  <span>{s.stage}</span>
                </button>
                {i < shown.length - 1 && (
                  <span className="font-mono text-[#5f6f93] text-[12px]">→</span>
                )}
              </div>
            );
          })}
        </div>

        <DecompTree active={active} />

        {/* Functional Dependencies in Mono */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
              Active stage functional dependencies ({cur.stage})
            </span>
            <span className="font-mono text-[10px] text-[#5f6f93]">
              {cur.fds.length} dependencies
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {cur.fds.map((f, i) => {
              const hasViolation =
                f.violates &&
                f.violates !== "—" &&
                f.violates.toLowerCase() !== "none";

              return (
                <div
                  key={i}
                  className={`border p-2.5 rounded-[2px] font-mono text-[12px] flex flex-wrap items-center justify-between gap-2 ${
                    hasViolation
                      ? "border-[#f5a524]/40 bg-[#f5a524]/5"
                      : "border-white/10 bg-[#05070d]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#7fb2ff] font-semibold">{f.fd}</span>
                    {hasViolation && (
                      <StatusBadge
                        status="warn"
                        label={`Violates ${f.violates}`}
                      />
                    )}
                  </div>
                  {f.fix && (
                    <span className="text-[#8b96b0] text-[11px]">
                      Action: {f.fix}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tables in Shared Table Style */}
        <div className="mt-5 flex flex-col gap-4">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
            Decomposed relation schema ({cur.stage})
          </span>
          {cur.tables.map((t) => (
            <div key={t.name} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-white font-semibold">{t.name}</span>
                <span className="text-[#5f6f93] text-[10.5px]">
                  Columns: {t.columns.join(", ")}
                </span>
              </div>
              <HighlightGrid rows={t.rows} highlight={dupColumns(t.rows)} />
            </div>
          ))}
        </div>
      </Card>

      {/* 2. Anomaly Theatre with Amber Badges */}
      <Panel cut={8} className="w-full">
        <div className="p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                Anomalies before BCNF
              </span>
              <span className="text-[#5f6f93] text-[10px]">·</span>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
                Anomaly isolation demos
              </h2>
            </div>
            {/* Kind tabs */}
            <div className="flex items-center gap-1.5">
              {(["update", "insert", "delete"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setAnomalyKind(k)}
                  className={`font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-[2px] transition-colors cursor-pointer ${
                    anomalyKind === k
                      ? "bg-[#3d5bff] text-white font-semibold"
                      : "bg-white/[0.03] text-[#8b96b0] hover:text-[#dfe6f5] border border-white/10"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {anomaly ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge
                  status="warn"
                  label={`${anomalyKind.charAt(0).toUpperCase() + anomalyKind.slice(1)} anomaly identified`}
                />
                <span className="font-mono text-[11px] text-[#8b96b0]">
                  {anomaly.stage}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* Before: Un-normalized State */}
                <div className="border border-white/10 bg-[#05070d] p-3 rounded-[2px] flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                    Prior state (pre-decomposition)
                  </span>
                  <p className="font-mono text-[12px] text-[#dfe6f5] leading-relaxed">
                    {anomaly.before}
                  </p>
                </div>

                {/* After: Anomaly Consequence with Amber Badge */}
                <div className="border border-[#f5a524]/40 bg-[#f5a524]/5 p-3 rounded-[2px] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a524]">
                      Anomaly occurrence
                    </span>
                    <StatusBadge status="warn" label="Inconsistent data" />
                  </div>
                  <p className="font-mono text-[12px] text-[#f5a524] font-semibold leading-relaxed">
                    {anomaly.after}
                  </p>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-[#dfe6f5] pt-1">
                {anomaly.explanation}
              </p>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-[#5f6f93]">
              No anomaly output currently available.
            </p>
          )}
        </div>
      </Panel>

      {/* 3. Lossless-Join Proof: Result as OK Badge */}
      <Card title="Lossless-join decomposition proof" kicker="NATURAL JOIN + EXCEPT both ways">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
            Decomposition is lossless if and only if reconstructing the original relation via natural join produces
            zero missing tuples and zero spurious tuples: R = R₁ ⨝ R₂.
          </p>

          <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#05070d]">
                  {["Stage transition", "Original rows", "Rejoined rows", "Missing tuples", "Spurious tuples", "Verification"].map((c) => (
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
                {shownLossless.map((r) => {
                  const ok = r.missing === 0 && r.spurious === 0;
                  return (
                    <tr
                      key={r.stage}
                      className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="font-mono px-3 py-2 text-[12px] text-[#7fb2ff] font-semibold">
                        {r.stage}
                      </td>
                      <td className="font-mono px-3 py-2 text-[12px] tabular-nums text-right text-[#dfe6f5]">
                        {r.rows_original}
                      </td>
                      <td className="font-mono px-3 py-2 text-[12px] tabular-nums text-right text-[#dfe6f5]">
                        {r.rows_rejoined}
                      </td>
                      <td className="font-mono px-3 py-2 text-[12px] tabular-nums text-right text-[#dfe6f5]">
                        {r.missing}
                      </td>
                      <td className="font-mono px-3 py-2 text-[12px] tabular-nums text-right text-[#dfe6f5]">
                        {r.spurious}
                      </td>
                      <td className="px-3 py-2">
                        {/* Lossless check result as ok badge */}
                        {ok ? (
                          <StatusBadge status="ok" label="Lossless ✓" />
                        ) : (
                          <StatusBadge status="critical" label="Lossy ✗" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DecompTree({ active }: { active: number }) {
  const labels = STAGES.slice(0, Math.max(active + 1, 2));
  return (
    <svg
      viewBox={`0 0 ${labels.length * 120} 46`}
      role="img"
      aria-label="decomposition diagram"
      className="mt-3 w-full max-w-[560px] border border-white/10 bg-[#05070d] p-2"
    >
      <g fontFamily="Geist Mono, monospace" fontSize="10">
        {labels.map((s, i) => (
          <g key={s}>
            {i > 0 && (
              <line
                x1={i * 120 - 78}
                y1="23"
                x2={i * 120 - 42}
                y2="23"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            )}
            <rect
              x={i * 120 + 6}
              y="8"
              width="72"
              height="30"
              fill={i === active ? "#3d5bff" : "rgba(255,255,255,0.03)"}
              stroke={i === active ? "#7fb2ff" : "rgba(255,255,255,0.15)"}
              strokeWidth={i === active ? 1.5 : 1}
            />
            <text
              x={i * 120 + 42}
              y="27"
              textAnchor="middle"
              fill={i === active ? "#ffffff" : "#8b96b0"}
              fontWeight={i === active ? "bold" : "normal"}
            >
              {s}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function dupColumns(rows: Array<Record<string, unknown>>): Set<string> {
  const dup = new Set<string>();
  if (rows.length === 0) return dup;
  for (const c of Object.keys(rows[0] ?? {})) {
    const seen = new Set<string>();
    let repeated = false;
    for (const r of rows.slice(0, 12)) {
      const v = String(r[c] ?? "");
      if (seen.has(v)) {
        repeated = true;
        break;
      }
      seen.add(v);
    }
    if (repeated) dup.add(c);
  }
  return dup;
}

function HighlightGrid({
  rows,
  highlight,
}: {
  rows: Array<Record<string, unknown>>;
  highlight: Set<string>;
}) {
  if (rows.length === 0)
    return <p className="font-mono text-[11px] text-[#5f6f93]">0 rows returned.</p>;
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-white/[0.08] bg-[#05070d]">
            {cols.map((c) => {
              const isDup = highlight.has(c);
              return (
                <th
                  key={c}
                  className={`font-mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] font-normal ${
                    isDup ? "text-[#f5a524]" : "text-[#8b96b0]"
                  }`}
                >
                  {c}
                  {isDup ? " [duplicate]" : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => (
            <tr
              key={i}
              className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
            >
              {cols.map((c) => {
                const v = r[c];
                const s = v === null || v === undefined ? "NULL" : String(v);
                const isNull = v === null || v === undefined;
                const numeric = !isNull && s !== "" && !Number.isNaN(Number(s));
                const isDup = highlight.has(c);

                return (
                  <td
                    key={c}
                    className={`font-mono max-w-[240px] truncate px-3 py-2 text-[12px] ${
                      numeric ? "text-right tabular-nums" : ""
                    } ${isDup ? "text-[#f5a524]" : isNull ? "text-[#5f6f93] italic" : "text-[#dfe6f5]"}`}
                    title={s}
                  >
                    {s}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pickAnomaly(all: NormAnomaly[], kind: string): NormAnomaly | null {
  const hit = all.find((a) => a.stage.toLowerCase().includes(kind));
  return hit ?? all[0] ?? null;
}

const STAGE_GROUPS: Array<{ stage: string; match: (s: string) => boolean }> = [
  { stage: "UNF", match: (s) => s === "unf" },
  { stage: "1NF", match: (s) => s === "1nf" },
  { stage: "2NF", match: (s) => s.startsWith("2nf") },
  { stage: "3NF", match: (s) => s.startsWith("3nf") },
  { stage: "BCNF", match: (s) => s.startsWith("bcnf") },
];

function groupStages(
  raw: Array<{ stage: string; table: string; rows: Array<Record<string, unknown>> }>,
  fds: Array<{ stage: string; fd: string; violates: string; fix: string }>,
): NormStage[] {
  return STAGE_GROUPS.map((g) => {
    const parts = raw.filter((r) => g.match(r.stage));
    const tables = parts.map((p) => ({
      name: p.table,
      columns: Object.keys(p.rows[0] ?? {}),
      rows: p.rows.slice(0, 12),
    }));
    const groupFds = fds
      .filter((f) => f.stage.toUpperCase() === g.stage)
      .map((f) => ({ fd: f.fd, violates: f.violates, fix: f.fix }));
    return { stage: g.stage, tables, fds: groupFds };
  }).filter((g) => g.tables.length > 0);
}

function flattenAnomalies(data: Record<string, NormAnomaly[]>): NormAnomaly[] {
  if (Array.isArray(data)) return data as NormAnomaly[];
  const out: NormAnomaly[] = [];
  for (const [kind, list] of Object.entries(data ?? {})) {
    for (const a of list ?? []) {
      out.push({ ...a, stage: `${kind} anomaly (${a.stage})` });
    }
  }
  return out;
}

function fallbackStages(): NormStage[] {
  const row = (n: number) => ({
    log_no: n,
    sat_name: "SomaiyaSat-1",
    sat_plane: "A",
    pod_serial: "SPOD-2026-001",
    station_city: "Mumbai",
    station_callsign: "VU2KJS",
    pass_date: "2026-09-20",
    modes_sent: "TTC:512;SSTV:40960",
    operator_name: "Aarav",
    operator_phone: "+91-90000",
  });
  return [
    {
      stage: "UNF",
      tables: [{ name: "norm.flight_log_unf", columns: ["log_no", "sat_name", "modes_sent"], rows: [row(1), row(2)] }],
      fds: [
        {
          fd: "{log_no} → {sat_name, station_callsign, …}",
          violates: "1NF (repeating group modes_sent)",
          fix: "split one row per mode",
        },
      ],
    },
    {
      stage: "1NF",
      tables: [{ name: "norm.flight_log_1nf", columns: ["log_no", "mode", "bytes"], rows: [{ log_no: 1, mode: "TTC", bytes: 512 }, { log_no: 1, mode: "SSTV", bytes: 40960 }] }],
      fds: [{ fd: "{log_no} → {sat_name, …} (partial)", violates: "2NF", fix: "split pass_log / pass_mode" }],
    },
    {
      stage: "2NF",
      tables: [{ name: "norm.pass_log", columns: ["log_no", "sat_name"], rows: [{ log_no: 1, sat_name: "SomaiyaSat-1" }] }],
      fds: [{ fd: "{sat_name} → {sat_plane, pod_serial}", violates: "3NF (transitive)", fix: "extract norm.sat" }],
    },
    {
      stage: "3NF",
      tables: [{ name: "norm.sat", columns: ["sat_name", "sat_plane"], rows: [{ sat_name: "SomaiyaSat-1", sat_plane: "A" }] }],
      fds: [{ fd: "{operator_name} → {station_callsign}", violates: "BCNF (not a superkey)", fix: "split operator_station / duty_bcnf" }],
    },
    {
      stage: "BCNF",
      tables: [{ name: "norm.duty_bcnf", columns: ["operator_name", "pass_date"], rows: [{ operator_name: "Aarav", pass_date: "2026-09-20" }] }],
      fds: [{ fd: "{operator_name, pass_date} → {…}", violates: "—", fix: "all determinants are keys" }],
    },
  ];
}

function fallbackLossless(): LosslessRow[] {
  return [
    { stage: "UNF→1NF", rows_original: 12, rows_rejoined: 12, missing: 0, spurious: 0 },
    { stage: "1NF→2NF", rows_original: 12, rows_rejoined: 12, missing: 0, spurious: 0 },
    { stage: "2NF→3NF", rows_original: 12, rows_rejoined: 12, missing: 0, spurious: 0 },
    { stage: "3NF→BCNF", rows_original: 12, rows_rejoined: 12, missing: 0, spurious: 0 },
  ];
}

function fallbackAnomalies(): NormAnomaly[] {
  return [
    {
      stage: "update anomaly (UNF)",
      before: "sat_plane = 'A' in 4 rows for SomaiyaSat-1",
      after: "1 row says 'B', 3 say 'A' — inconsistent",
      explanation:
        "One fact lives in many rows. Updating a sat's plane in UNF leaves siblings stale; in 3NF norm.sat holds it once.",
    },
    {
      stage: "insert anomaly (UNF)",
      before: "new pod SPOD-2026-009 exists, no pass yet",
      after: "cannot insert: log_no is the only key",
      explanation: "UNF cannot record a pod with no flight log; the decomposed pod table can.",
    },
    {
      stage: "delete anomaly (UNF)",
      before: "last pass of operator Diya",
      after: "deleting the pass deletes her phone number",
      explanation: "Deleting the final log row loses the operator fact; norm.operator keeps it.",
    },
  ];
}

