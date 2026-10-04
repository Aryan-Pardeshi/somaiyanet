import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { Card, OfflineOrEmpty } from "./common";
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
        apiFetch<NormStage[]>("/api/labs/norm/stages"),
        apiFetch<NormAnomaly[]>("/api/labs/norm/anomalies"),
        apiFetch<LosslessRow[]>("/api/labs/norm/lossless"),
      ]);
      setStages(s.data);
      setAnomalies(a.data);
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
      <Card title="Normalization stepper" kicker="UNF → BCNF · CO3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Normal forms">
          {shown.map((s, i) => (
            <button
              key={s.stage}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`font-mono rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.12em] ${
                i === active
                  ? "border-[var(--ice)] bg-[var(--navy-700)] text-[var(--text)]"
                  : i < active
                    ? "border-[var(--ok)]/50 text-[var(--ok)]"
                    : "border-[var(--line)] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)]"
              }`}
            >
              {i + 1} · {s.stage}
            </button>
          ))}
        </div>
        <DecompTree active={active} />
        <div className="mt-4">
          <p className="font-mono mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--warn)]">
            {cur.stage} · functional dependencies
          </p>
          <div className="flex flex-col gap-1.5">
            {cur.fds.map((f, i) => (
              <p
                key={i}
                className={`font-mono rounded-lg border px-3 py-1.5 text-[11.5px] ${
                  f.violates && f.violates !== "—" && f.violates.toLowerCase() !== "none"
                    ? "border-[var(--ice)]/60 bg-[var(--navy-700)] text-[var(--text)]"
                    : "border-[var(--line)] bg-[var(--space)] text-[var(--text-2)]"
                }`}
              >
                <span className="text-[var(--ice)]">{f.fd}</span>
                {f.violates && f.violates !== "—" && (
                  <span className="text-[var(--ice)]"> · violates {f.violates}</span>
                )}
                {f.fix && <span className="text-[var(--text-3)]"> → {f.fix}</span>}
              </p>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {cur.tables.map((t) => (
            <div key={t.name}>
              <p className="font-mono mb-1 text-[11px] text-[var(--text)]">
                {t.name}
                <span className="text-[var(--text-3)]"> · {t.columns.join(", ")}</span>
              </p>
              <HighlightGrid rows={t.rows} highlight={dupColumns(t.rows)} />
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Anomaly theatre"
        kicker="read-only demos"
        aside={
          <div className="flex gap-1.5">
            {(["update", "insert", "delete"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAnomalyKind(k)}
                className={`font-mono rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${
                  anomalyKind === k
                    ? "border-[var(--ice)] bg-[var(--navy-700)] text-[var(--text)]"
                    : "border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        }
      >
        {anomaly ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">before</p>
              <p className="font-mono mt-1 text-[11.5px] text-[var(--text-2)]">{anomaly.before}</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">after</p>
              <p className="font-mono mt-1 text-[11.5px] text-[var(--warn)]">{anomaly.after}</p>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-2)] md:col-span-2">
              {anomaly.explanation}
            </p>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-[var(--text-3)]">No anomaly output yet.</p>
        )}
      </Card>

      <Card title="Lossless-join proof" kicker="NATURAL JOIN + EXCEPT both ways">
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--navy-700)]">
              <tr>
                {["stage", "original", "rejoined", "missing", "spurious", ""].map((c) => (
                  <th key={c} className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-2)]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownLossless.map((r) => {
                const ok = r.missing === 0 && r.spurious === 0;
                return (
                  <tr key={r.stage} className="odd:bg-[var(--space)] even:bg-[var(--navy-800)]">
                    <td className="font-mono px-2.5 py-1.5 text-[11.5px] text-[var(--warn)]">{r.stage}</td>
                    <td className="font-mono px-2.5 py-1.5 text-[11.5px] text-[var(--text)]">{r.rows_original}</td>
                    <td className="font-mono px-2.5 py-1.5 text-[11.5px] text-[var(--text)]">{r.rows_rejoined}</td>
                    <td className="font-mono px-2.5 py-1.5 text-[11.5px] text-[var(--text)]">{r.missing}</td>
                    <td className="font-mono px-2.5 py-1.5 text-[11.5px] text-[var(--text)]">{r.spurious}</td>
                    <td className={`font-mono px-2.5 py-1.5 text-[12px] ${ok ? "text-[var(--ok)]" : "text-[var(--ice)]"}`}>
                      {ok ? "✓" : "✗"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DecompTree({ active }: { active: number }) {
  const labels = STAGES.slice(0, Math.max(active + 1, 2));
  return (
    <svg viewBox={`0 0 ${labels.length * 120} 46`} role="img" aria-label="decomposition diagram" className="mt-4 w-full max-w-[560px] rounded-lg border border-[var(--line)] bg-[var(--space)] p-2">
      <g fontFamily="Geist Mono, monospace" fontSize="10">
        {labels.map((s, i) => (
          <g key={s}>
            {i > 0 && (
              <line x1={i * 120 - 78} y1="23" x2={i * 120 - 42} y2="23" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 3" />
            )}
            <rect
              x={i * 120 + 6}
              y="8"
              width="72"
              height="30"
              rx="8"
              fill="none"
              stroke={i === active ? "var(--ice)" : "var(--line)"}
              strokeWidth={i === active ? 2 : 1.2}
            />
            <text x={i * 120 + 42} y="27" textAnchor="middle" fill={i === active ? "var(--text)" : "var(--text-3)"}>{s}</text>
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
      if (seen.has(v)) { repeated = true; break; }
      seen.add(v);
    }
    if (repeated) dup.add(c);
  }
  return dup;
}

function HighlightGrid({ rows, highlight }: { rows: Array<Record<string, unknown>>; highlight: Set<string> }) {
  if (rows.length === 0) return <p className="font-mono text-[11px] text-[var(--text-3)]">0 rows.</p>;
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[var(--navy-700)]">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className={`font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.06em] ${highlight.has(c) ? "text-[var(--warn)]" : "text-[var(--text-2)]"}`}
              >
                {c}{highlight.has(c) ? " ●" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => (
            <tr key={i} className="odd:bg-[var(--space)] even:bg-[var(--navy-800)]">
              {cols.map((c) => (
                <td
                  key={c}
                  className={`font-mono max-w-[240px] truncate px-2.5 py-1.5 text-[11px] ${highlight.has(c) ? "text-[var(--warn)]" : "text-[var(--text)]"}`}
                  title={String(r[c] ?? "NULL")}
                >
                  {String(r[c] ?? "NULL")}
                </td>
              ))}
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

function fallbackStages(): NormStage[] {
  const row = (n: number) => ({
    log_no: n, sat_name: "SomaiyaSat-A1", sat_plane: "A", pod_serial: "SPOD-2026-001",
    station_city: "Mumbai", station_callsign: "VU2KJS", pass_date: "2026-09-20",
    modes_sent: "TTC:512;SSTV:40960", operator_name: "Aarav", operator_phone: "+91-90000",
  });
  return [
    { stage: "UNF", tables: [{ name: "norm.flight_log_unf", columns: ["log_no", "sat_name", "modes_sent"], rows: [row(1), row(2)] }], fds: [{ fd: "{log_no} → {sat_name, station_callsign, …}", violates: "1NF (repeating group modes_sent)", fix: "split one row per mode" }] },
    { stage: "1NF", tables: [{ name: "norm.flight_log_1nf", columns: ["log_no", "mode", "bytes"], rows: [{ log_no: 1, mode: "TTC", bytes: 512 }, { log_no: 1, mode: "SSTV", bytes: 40960 }] }], fds: [{ fd: "{log_no} → {sat_name, …} (partial)", violates: "2NF", fix: "split pass_log / pass_mode" }] },
    { stage: "2NF", tables: [{ name: "norm.pass_log", columns: ["log_no", "sat_name"], rows: [{ log_no: 1, sat_name: "SomaiyaSat-A1" }] }], fds: [{ fd: "{sat_name} → {sat_plane, pod_serial}", violates: "3NF (transitive)", fix: "extract norm.sat" }] },
    { stage: "3NF", tables: [{ name: "norm.sat", columns: ["sat_name", "sat_plane"], rows: [{ sat_name: "SomaiyaSat-A1", sat_plane: "A" }] }], fds: [{ fd: "{operator_name} → {station_callsign}", violates: "BCNF (not a superkey)", fix: "split operator_station / duty_bcnf" }] },
    { stage: "BCNF", tables: [{ name: "norm.duty_bcnf", columns: ["operator_name", "pass_date"], rows: [{ operator_name: "Aarav", pass_date: "2026-09-20" }] }], fds: [{ fd: "{operator_name, pass_date} → {…}", violates: "—", fix: "all determinants are keys" }] },
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
    { stage: "update anomaly (UNF)", before: "sat_plane = 'A' in 4 rows for SomaiyaSat-A1", after: "1 row says 'B', 3 say 'A' — inconsistent", explanation: "One fact lives in many rows. Updating a sat's plane in UNF leaves siblings stale; in 3NF norm.sat holds it once." },
    { stage: "insert anomaly (UNF)", before: "new pod SPOD-2026-009 exists, no pass yet", after: "cannot insert: log_no is the only key", explanation: "UNF cannot record a pod with no flight log; the decomposed pod table can." },
    { stage: "delete anomaly (UNF)", before: "last pass of operator Diya", after: "deleting the pass deletes her phone number", explanation: "Deleting the final log row loses the operator fact; norm.operator keeps it." },
  ];
}
