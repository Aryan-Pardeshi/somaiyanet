import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { RefusalCard } from "./common";

// Security lab, kept to three questions: what can this person do, which rows
// does each station see, and who may read the change history. Every answer is
// a real attempt as that PostgreSQL user (rolled back by the API), never a guess.

const PEOPLE = [
  { role: "mission_director", label: "Mission Director", group: "grp_director" },
  { role: "station_operator_bom", label: "Mumbai operator", group: "grp_station_operator" },
  { role: "station_operator_hel", label: "Espoo operator", group: "grp_station_operator" },
  { role: "student_analyst", label: "Student analyst", group: "grp_analyst" },
  { role: "ai_router", label: "AI router", group: "grp_router" },
] as const;

type Role = (typeof PEOPLE)[number]["role"];

// The API sends commands through GS-BOM for every role except the Espoo operator.
const homeStation = (r: Role) => (r === "station_operator_hel" ? "Espoo" : "Mumbai");
const otherStation = (r: Role) => (r === "station_operator_hel" ? "Mumbai" : "Espoo");

const CHECKS: Array<{ key: string; label: (r: Role) => string; sql: string }> = [
  { key: "read_telemetry", label: () => "Read satellite readings", sql: "SELECT … FROM telemetry" },
  { key: "insert_telemetry", label: () => "Save a new reading", sql: "INSERT INTO telemetry …" },
  { key: "read_station_secret", label: () => "See a station’s secret key", sql: "SELECT secret FROM station_key" },
  { key: "insert_telecommand_own", label: (r) => `Send a command through ${homeStation(r)}`, sql: "INSERT INTO telecommand …" },
  { key: "insert_telecommand_other", label: (r) => `Send a command through ${otherStation(r)}`, sql: "INSERT INTO telecommand …" },
  { key: "ack_alert", label: () => "Mark an alert as seen", sql: "UPDATE alert SET acknowledged = TRUE" },
];

const RLS_ROLES: Array<{ role: Role; label: string }> = [
  { role: "station_operator_bom", label: "Mumbai operator" },
  { role: "station_operator_hel", label: "Espoo operator" },
  { role: "mission_director", label: "Director" },
];

interface TryData {
  allowed?: boolean;
  result?: unknown;
  error?: { sqlstate?: string; message?: string } | null;
}

type Outcome = "loading" | { ok: boolean; sqlstate?: string; message?: string; rows?: Array<Record<string, unknown>> };

async function attempt(role: Role, action: string): Promise<Exclude<Outcome, "loading">> {
  try {
    const r = await apiFetch<TryData>("/api/labs/security/try", {
      method: "POST",
      body: JSON.stringify({ role, action_key: action }),
    });
    const ok = r.data.allowed ?? false;
    return {
      ok,
      sqlstate: r.data.error?.sqlstate,
      message: r.data.error?.message,
      rows: Array.isArray(r.data.result) ? (r.data.result as Array<Record<string, unknown>>) : undefined,
    };
  } catch (e) {
    const err = e as ApiError;
    return { ok: false, sqlstate: err.sqlstate, message: err.message };
  }
}

function firstLine(msg?: string): string {
  const line = (msg ?? "permission denied").split("\n")[0].trim();
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

export function SecurityLab() {
  const [selected, setSelected] = useState<Role>("station_operator_bom");
  const [checks, setChecks] = useState<Record<string, Outcome>>({});
  const [rls, setRls] = useState<Partial<Record<Role, Outcome>>>({});
  const [audit, setAudit] = useState<Array<Record<string, unknown>> | null>(null);
  const [auditError, setAuditError] = useState<ApiError | null>(null);

  const runChecks = useCallback((role: Role) => {
    for (const c of CHECKS) {
      const k = `${role}:${c.key}`;
      setChecks((p) => ({ ...p, [k]: "loading" }));
      void attempt(role, c.key).then((o) => setChecks((p) => ({ ...p, [k]: o })));
    }
  }, []);

  const runRls = useCallback(() => {
    for (const { role } of RLS_ROLES) {
      setRls((p) => ({ ...p, [role]: "loading" }));
      void attempt(role, "read_downlinks").then((o) => setRls((p) => ({ ...p, [role]: o })));
    }
  }, []);

  useEffect(() => {
    runRls();
    apiFetch<Array<Record<string, unknown>>>("/api/labs/security/audit?limit=8")
      .then((r) => setAudit(r.data))
      .catch((e: ApiError) => setAuditError(e));
  }, [runRls]);

  // Check each person once, the first time they are picked.
  useEffect(() => {
    if (checks[`${selected}:${CHECKS[0].key}`] === undefined) runChecks(selected);
  }, [selected, checks, runChecks]);

  const person = PEOPLE.find((p) => p.role === selected) ?? PEOPLE[0];

  return (
    <div className="flex flex-col gap-8">
      {/* 1. What can this person do? */}
      <section className="flex flex-col gap-3">
        <div
          className="inline-flex flex-wrap gap-1 self-start rounded-[10px] border border-white/[0.08] bg-[var(--sx-surface)] p-1"
          role="tablist"
          aria-label="Pick a person"
        >
          {PEOPLE.map((p) => (
            <button
              key={p.role}
              type="button"
              role="tab"
              aria-selected={selected === p.role}
              onClick={() => setSelected(p.role)}
              className={`min-h-[36px] cursor-pointer rounded-[8px] px-3.5 py-1.5 text-[13px] transition-colors ${
                selected === p.role
                  ? "bg-[var(--sx-surface-2)] font-semibold text-white"
                  : "text-[var(--sx-text-2)] hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="sx-group">
          <div className="sx-row flex-wrap justify-between gap-2 bg-[var(--sx-surface-2)]">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-[16px] font-semibold text-white">What can the {person.label} do?</h2>
              <p className="sx-caption">
                Logs in as <span className="font-mono">{person.role}</span>, which gets its permissions from the
                group <span className="font-mono">{person.group}</span>. Each line is really tried, then undone.
              </p>
            </div>
            <button type="button" onClick={() => runChecks(selected)} className="sx-btn sx-btn--sm">
              Check again
            </button>
          </div>
          <div className="divide-y divide-white/[0.08]">
            {CHECKS.map((c) => {
              const o = checks[`${selected}:${c.key}`];
              const done = o !== undefined && o !== "loading";
              return (
                <div key={c.key} className="sx-row justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] text-white">{c.label(selected)}</span>
                    <span className="font-mono text-[11px] text-[var(--sx-text-3)]">{c.sql}</span>
                    {done && !o.ok && (
                      <span className="font-mono text-[11px] text-[var(--sx-red)]">
                        {o.sqlstate ?? "42501"}: {firstLine(o.message)}
                      </span>
                    )}
                  </div>
                  <span className="sx-status shrink-0" data-tone={done ? (o.ok ? "ok" : "critical") : "warn"}>
                    {done ? (o.ok ? "Yes" : "No") : "Checking"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Row-level security */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-[16px] font-semibold text-white">Each station sees only its own passes</h2>
            <p className="sx-caption">
              Row-level security: the same query, run as three users, returns different rows.
            </p>
          </div>
          <button type="button" onClick={runRls} className="sx-btn sx-btn--sm">
            Run again
          </button>
        </div>
        <pre className="sx-code overflow-x-auto">
          SELECT to_node, count(*) FROM contact WHERE kind = 'DOWNLINK' GROUP BY to_node;
        </pre>
        <RlsTable rls={rls} />
        <p className="sx-caption">
          The policy on <span className="font-mono">contact</span> shows an operator a row only if it ends at their
          station or is a satellite-to-satellite link:{" "}
          <span className="font-mono text-[var(--sx-text-2)]">to_node = 'GS-BOM' OR kind = 'ISL'</span>.
        </p>
      </section>

      {/* 3. Audit log */}
      <section className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[16px] font-semibold text-white">Change history</h2>
          <p className="sx-caption">
            Triggers record every change to the important tables. Only the Mission Director may read it; any other
            profile gets PostgreSQL’s real refusal here.
          </p>
        </div>
        {auditError !== null ? (
          <RefusalCard error={auditError} />
        ) : audit === null ? (
          <p className="sx-caption">Loading…</p>
        ) : (
          <AuditTable rows={audit} />
        )}
      </section>
    </div>
  );
}

function RlsTable({ rls }: { rls: Partial<Record<Role, Outcome>> }) {
  const counts: Partial<Record<Role, Record<string, number>>> = {};
  const stations = new Set<string>();
  for (const { role } of RLS_ROLES) {
    const o = rls[role];
    if (o && o !== "loading" && o.ok) {
      const m: Record<string, number> = {};
      for (const row of o.rows ?? []) {
        const st = String(row["to_node"] ?? "?");
        m[st] = Number(row["legs"] ?? row["count"] ?? 0);
        stations.add(st);
      }
      counts[role] = m;
    }
  }
  const rows = [...stations].sort();

  return (
    <div className="sx-group overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th className="sx-caption px-4 py-2.5 font-medium">Ground station</th>
            {RLS_ROLES.map((r) => (
              <th key={r.role} className="sx-caption px-4 py-2.5 font-medium whitespace-nowrap">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.08]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={RLS_ROLES.length + 1} className="sx-caption px-4 py-4">
                Running the query as each user…
              </td>
            </tr>
          ) : (
            rows.map((st) => (
              <tr key={st}>
                <td className="px-4 py-2.5 font-mono text-white">{st}</td>
                {RLS_ROLES.map(({ role }) => {
                  const o = rls[role];
                  const n = counts[role]?.[st];
                  let cell: ReactNode;
                  if (o === undefined || o === "loading") cell = <span className="text-[var(--sx-text-3)]">…</span>;
                  else if (!o.ok) cell = <span className="text-[var(--sx-red)]">{o.sqlstate ?? "error"}</span>;
                  else if (n === undefined) cell = <span className="text-[var(--sx-text-3)]">hidden</span>;
                  else cell = <span className="sx-num text-white">{n} passes</span>;
                  return (
                    <td key={role} className="px-4 py-2.5 whitespace-nowrap">
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const OPS: Record<string, string> = { I: "Added", U: "Changed", D: "Deleted" };

function utcTime(v: unknown): string {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(11, 19);
}

function AuditTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <p className="sx-caption">No changes recorded yet.</p>;
  return (
    <div className="sx-group overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {["Time (UTC)", "Changed by", "Table", "Change"].map((h) => (
              <th key={h} className="sx-caption px-4 py-2.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.08]">
          {rows.map((r, i) => (
            <tr key={String(r["audit_id"] ?? i)}>
              <td className="sx-num px-4 py-2.5 whitespace-nowrap text-[var(--sx-text-2)]">
                {utcTime(r["changed_at"])}
              </td>
              <td className="px-4 py-2.5 font-mono text-white">{String(r["changed_by"] ?? "")}</td>
              <td className="px-4 py-2.5 font-mono text-[var(--sx-text-2)]">{String(r["table_name"] ?? "")}</td>
              <td className="px-4 py-2.5 text-[var(--sx-text-2)]">
                {OPS[String(r["op"] ?? "")] ?? String(r["op"] ?? "")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
