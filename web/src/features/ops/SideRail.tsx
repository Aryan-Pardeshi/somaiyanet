// Right rail for /ops: KPI tiles, alerts, live telemetry ticker, decision feed.
import type { Alert, DecisionEvent, Kpi, TelemetryEvent } from "./api";

interface SideRailProps {
  kpis: Kpi[];
  alerts: Alert[];
  telemetry: TelemetryEvent[];
  decisions: DecisionEvent[];
  onDemoRoute?: () => void;
}

function sevColor(sev: Alert["severity"]): string {
  if (sev === "CRITICAL") return "var(--danger)";
  if (sev === "WARN") return "var(--warn)";
  return "var(--ok)";
}

function SatPill({ state }: { state: string }) {
  const color =
    state === "NOMINAL"
      ? "var(--ok)"
      : state === "SAFE"
        ? "var(--danger)"
        : state === "WARN"
          ? "var(--warn)"
          : "var(--text-3)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px]"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full"
        style={{ background: color }}
      />
      <span style={{ color }}>{state}</span>
    </span>
  );
}

export function SideRail({ kpis, alerts, telemetry, decisions, onDemoRoute }: SideRailProps) {
  const kpi = kpis[0];
  const tiles: Array<{ label: string; value: string }> = kpi
    ? [
        { label: "Satellites online", value: `${kpi.sats_operational}/${kpi.sats_total}` },
        { label: "Packets queued", value: String(kpi.packets_queued) },
        { label: "Delivered, 24h", value: String(kpi.packets_delivered_24h) },
        {
          label: "Contacts, 24h",
          value: `${kpi.isl_contacts_next_24h}/${kpi.contacts_next_24h} ISL`,
        },
        { label: "AI overrides, 24h", value: String(kpi.ai_overrides_24h) },
        {
          label: "Downlinked, 24h",
          value: `${(kpi.bytes_delivered_24h / 1_000_000).toFixed(1)} MB`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--navy-800)] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold">Fleet</h2>
          {onDemoRoute !== undefined && (
            <button
              onClick={onDemoRoute}
              className="ml-auto rounded-lg bg-[var(--navy-700)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--navy-600)]"
            >
              Demo 3-hop route
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-[10px] border border-[var(--line)] bg-[var(--navy-700)] p-2.5"
            >
              <p className="text-[12px] font-medium text-[var(--text-2)]">{t.label}</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-[var(--text)]">{t.value}</p>
            </div>
          ))}
          {tiles.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">No KPIs yet.</p>
          )}
        </div>
      </section>

      <section className="max-h-64 overflow-y-auto rounded-[14px] border border-[var(--line)] bg-[var(--navy-800)] p-4">
        <h2 className="text-[14px] font-semibold">Alerts</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.alert_id}
              className="rounded-[10px] border border-[var(--line)] bg-[var(--navy-700)] p-2.5"
            >
              <p className="text-[12px]" style={{ color: sevColor(a.severity) }}>
                {a.severity} <span className="font-mono">{a.sat_id ?? ""}</span>
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--text)]">{a.message}</p>
              <p className="mt-1 text-[12px] text-[var(--text-3)]">
                {new Date(a.raised_at).toUTCString()}
                {a.acknowledged ? " (acknowledged)" : ""}
              </p>
            </li>
          ))}
          {alerts.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">All quiet.</p>
          )}
        </ul>
      </section>

      <section className="max-h-64 overflow-y-auto rounded-[14px] border border-[var(--line)] bg-[var(--navy-800)] p-4">
        <h2 className="text-[14px] font-semibold">Live telemetry</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {[...telemetry].reverse().map((t, i) => (
            <li
              key={`${t.sat_id}-${t.ts}-${i}`}
              className={i === 0 ? "ops-flash rounded-md px-2 py-1" : "px-2 py-1"}
            >
              <p className="text-[13px] text-[var(--text)]">
                <span className="font-mono">{t.sat_id}</span>{" "}
                <span className="text-[var(--text-2)]">
                  {t.battery_v.toFixed(2)} V, {t.mode_active ?? "no mode"},{" "}
                  {new Date(t.ts).toISOString().slice(11, 19)}Z
                </span>
              </p>
            </li>
          ))}
          {telemetry.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">Awaiting stream.</p>
          )}
        </ul>
      </section>

      <section className="max-h-64 overflow-y-auto rounded-[14px] border border-[var(--line)] bg-[var(--navy-800)] p-4">
        <h2 className="text-[14px] font-semibold">Decisions</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {decisions.map((d, i) => (
            <li
              key={`${d.sat_id}-${d.final_action}-${i}`}
              className="rounded-md border px-2 py-1.5"
              style={{
                borderColor: d.overridden ? "var(--danger)" : "var(--line)",
                background: d.overridden ? "var(--navy-700)" : "var(--navy-800)",
              }}
            >
              <p className="text-[13px] text-[var(--text)]">
                <span className="font-mono">{d.sat_id}</span> {d.final_action}
                {d.overridden && (
                  <span className="ml-2 text-[var(--danger)]">override</span>
                )}
              </p>
            </li>
          ))}
          {decisions.length === 0 && (
            <p className="text-[13px] text-[var(--text-3)]">No decisions yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}

export { SatPill };
