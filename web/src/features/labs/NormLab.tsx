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
  const [stageFilter, setStageFilter] = useState<string>("ALL");
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
  const anomaly = pickAnomaly(shownAnomalies, anomalyKind);

  const filteredStages =
    stageFilter === "ALL" ? shown : shown.filter((s) => s.stage === stageFilter);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Normalization Steps as a Vertical Sequence */}
      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sx-hairline)] pb-3">
            <div>
              <h2 className="sx-h3">
                Decomposition pipeline
              </h2>
              <p className="sx-caption text-[var(--sx-text-3)]">
                Lossless join decomposition from UNF to BCNF
              </p>
            </div>

            {/* Stage filter segmented control */}
            <div
              className="inline-flex p-0.5 bg-[var(--sx-night)] rounded-[10px] gap-0.5 border border-[var(--sx-hairline)]"
              role="tablist"
              aria-label="Filter normal forms"
            >
              {["ALL", ...STAGES].map((tab) => {
                const active = stageFilter === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStageFilter(tab)}
                    className={`font-[var(--font-display)] text-[12px] capitalize font-semibold px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer ${
 active
 ? "bg-[var(--sx-surface-2)] text-white"
 : "text-white/60 hover:text-white"
 }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vertical list of normalization steps */}
          <div className="flex flex-col gap-8 pt-2">
            {filteredStages.map((s, stepIdx) => {
              const num = STAGES.indexOf(s.stage) + 1;
              return (
                <div key={s.stage} className="flex flex-col gap-4">
                  {/* Step label as .sx-eyebrow */}
                  <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
                    <div className="flex items-center gap-3">
                      <span className="sx-num text-white/40 text-[14px]">
                        0{num}
                      </span>
                      <span className="sx-eyebrow text-white">
                        {s.stage} stage
                      </span>
                    </div>
                    <span className="sx-caption text-[var(--sx-text-3)]">
                      {s.tables.length} {s.tables.length === 1 ? "relation" : "relations"} · {s.fds.length} FDs
                    </span>
                  </div>

                  {/* Functional Dependencies for this stage */}
                  {s.fds.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {s.fds.map((f, fi) => {
                        const hasViolation =
                          f.violates &&
                          f.violates !== "—" &&
                          f.violates.toLowerCase() !== "none";

                        return (
                          <div
                            key={fi}
                            className="p-3 rounded-[10px] bg-[var(--sx-night)] border border-[var(--sx-hairline)] font-mono text-[12px] flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-medium">{f.fd}</span>
                              {hasViolation && (
                                <span className="font-mono text-[11px] text-[#ff9f0a]">
                                  · Violates {f.violates}
                                </span>
                              )}
                            </div>
                            {f.fix && (
                              <span className="sx-caption text-[var(--sx-text-3)]">
                                Action: {f.fix}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tables for this stage rendered as inset-grouped tables */}
                  <div className="flex flex-col gap-4">
                    {s.tables.map((t) => (
                      <div key={t.name} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-mono text-white font-semibold">{t.name}</span>
                          <span className="font-mono text-[11px] text-[var(--sx-text-3)]">
                            Columns: {t.columns.join(", ")}
                          </span>
                        </div>
                        <HighlightGrid rows={t.rows} highlight={dupColumns(t.rows)} />
                      </div>
                    ))}
                  </div>

                  {stepIdx < filteredStages.length - 1 && (
                    <div className="border-b border-[var(--sx-hairline)] pt-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* 2. Anomaly Isolation Demos with text #ff9f0a only */}
      <Panel className="w-full">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sx-hairline)] pb-2.5">
            <h2 className="sx-h3">
              Anomaly isolation demos
            </h2>
            {/* Kind tabs as segmented control */}
            <div
              className="inline-flex p-0.5 bg-[var(--sx-night)] rounded-[10px] gap-0.5 border border-[var(--sx-hairline)]"
              role="tablist"
              aria-label="Anomaly types"
            >
              {(["update", "insert", "delete"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={anomalyKind === k}
                  onClick={() => setAnomalyKind(k)}
                  className={`font-[var(--font-display)] text-[12px] capitalize font-semibold px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer ${
 anomalyKind === k
 ? "bg-[var(--sx-surface-2)] text-white"
 : "text-white/60 hover:text-white"
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
                <span className="sx-caption text-[var(--sx-text-3)]">
                  {anomaly.stage}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Before: Un-normalized State */}
                <div className="p-3.5 rounded-[10px] bg-[var(--sx-night)] border border-[var(--sx-hairline)] flex flex-col gap-1.5">
                  <span className="sx-eyebrow text-[var(--sx-text-3)]">
                    Prior state (pre-decomposition)
                  </span>
                  <p className="font-mono text-[13px] text-white leading-relaxed">
                    {anomaly.before}
                  </p>
                </div>

                {/* After: Anomaly Consequence with #ff9f0a text only */}
                <div className="p-3.5 rounded-[10px] bg-[var(--sx-night)] border border-[var(--sx-hairline)] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="sx-eyebrow text-[#ff9f0a]">
                      Anomaly occurrence
                    </span>
                    <span className="sx-status" data-tone="warn">
                      Inconsistent
                    </span>
                  </div>
                  <p className="font-mono text-[13px] text-[#ff9f0a] font-medium leading-relaxed">
                    {anomaly.after}
                  </p>
                </div>
              </div>

              <p className="sx-body pt-1">
                {anomaly.explanation}
              </p>
            </div>
          ) : (
            <p className="sx-caption text-[var(--sx-text-3)]">
              No anomaly output currently available.
            </p>
          )}
        </div>
      </Panel>

      {/* 3. Lossless-Join Proof: Inset-grouped table */}
      <Card title="Lossless-join decomposition proof" kicker="NATURAL JOIN + EXCEPT both ways">
        <div className="flex flex-col gap-3">
          <p className="sx-body">
            Decomposition is lossless if and only if reconstructing the original relation via natural join produces
            zero missing tuples and zero spurious tuples: R = R₁ ⨝ R₂.
          </p>

          <div className="sx-group overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--sx-hairline)]">
                  {["Stage transition", "Original rows", "Rejoined rows", "Missing tuples", "Spurious tuples", "Verification"].map((c) => (
                    <th
                      key={c}
                      className="sx-eyebrow px-4 py-3 font-normal text-[var(--sx-text-2)]"
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
                      className="border-b border-[var(--sx-hairline)] last:border-b-0 hover:bg-[var(--sx-surface-2)] transition-colors h-[48px]"
                    >
                      <td className="font-mono px-4 py-3 text-[13px] text-white font-semibold">
                        {r.stage}
                      </td>
                      <td className="font-mono px-4 py-3 text-[13px] tabular-nums text-right text-white">
                        <span className="sx-num">{r.rows_original}</span>
                      </td>
                      <td className="font-mono px-4 py-3 text-[13px] tabular-nums text-right text-white">
                        <span className="sx-num">{r.rows_rejoined}</span>
                      </td>
                      <td className="font-mono px-4 py-3 text-[13px] tabular-nums text-right text-white">
                        <span className="sx-num">{r.missing}</span>
                      </td>
                      <td className="font-mono px-4 py-3 text-[13px] tabular-nums text-right text-white">
                        <span className="sx-num">{r.spurious}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="sx-status"
                          data-tone={ok ? "ok" : "critical"}
                        >
                          {ok ? "Lossless" : "Lossy"}
                        </span>
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
    return <p className="sx-caption text-[var(--sx-text-3)]">0 rows returned.</p>;
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="sx-group overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--sx-hairline)]">
            {cols.map((c) => {
              const isDup = highlight.has(c);
              return (
                <th
                  key={c}
                  className={`sx-eyebrow px-4 py-2.5 font-normal ${
                    isDup ? "text-[#ff9f0a]" : "text-[var(--sx-text-2)]"
                  }`}
                >
                  {c}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => (
            <tr
              key={i}
              className="border-b border-[var(--sx-hairline)] last:border-b-0 hover:bg-[var(--sx-surface-2)] transition-colors h-[48px]"
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
                    className={`font-mono max-w-[240px] truncate px-4 py-2.5 text-[12px] ${
                      numeric ? "text-right tabular-nums" : ""
                    } ${isDup ? "text-[#ff9f0a]" : isNull ? "text-[var(--sx-text-3)] italic" : "text-white"}`}
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
