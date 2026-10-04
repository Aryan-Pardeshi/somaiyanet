// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// Right rail for /ops: KPI tiles, alerts, live telemetry ticker, decision feed.
import type { Alert, DecisionEvent, Kpi, TelemetryEvent } from "./api";

interface SideRailProps {
  kpis: Kpi[];
  alerts: Alert[];
  telemetry: TelemetryEvent[];
  decisions: DecisionEvent[];
}

function sevColor(sev: Alert["severity"]): string {
  if (sev === "CRITICAL") return "var(--somaiya)";
  if (sev === "WARN") return "var(--amber)";
  return "var(--signal)";
}

export function SideRail({ kpis, alerts, telemetry, decisions }: SideRailProps) {
  const kpi = kpis[0];
  const tiles: Array<{ label: string; value: string }> = kpi
    ? [
        { label: "sats", value: `${kpi.sats_operational}/${kpi.sats_total}` },
        { label: "queued", value: String(kpi.packets_queued) },
        { label: "deliv 24h", value: String(kpi.packets_delivered_24h) },
        {
          label: "contacts 24h",
          value: `${kpi.isl_contacts_next_24h}/${kpi.contacts_next_24h} isl`,
        },
        { label: "overrides 24h", value: String(kpi.ai_overrides_24h) },
        {
          label: "mb down 24h",
          value: `${(kpi.bytes_delivered_24h / 1_000_000).toFixed(1)}`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        .ops-flash{animation:ops-flash .8s ease-out}
        @keyframes ops-flash{0%{background:rgba(215,38,61,.28)}100%{background:transparent}}
      `}</style>

      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">01</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Kpis</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-2.5"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--cream-dim)]">{t.label}</p>
              <p className="font-mono mt-1 text-lg text-[var(--amber)]">{t.value}</p>
            </div>
          ))}
          {tiles.length === 0 && (
            <p className="font-mono text-xs text-[var(--mute)]">no kpis yet</p>
          )}
        </div>
      </section>

      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">02</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Alerts</span>
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.alert_id}
              className="rounded-xl border bg-[var(--ink-2)] p-2.5"
              style={{ borderColor: "var(--rule)" }}
            >
              <p className="font-mono text-[11px]" style={{ color: sevColor(a.severity) }}>
                {a.severity} · {a.sat_id ?? "—"}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--cream)]">{a.message}</p>
              <p className="font-mono mt-1 text-[10px] text-[var(--mute)]">
                {new Date(a.raised_at).toUTCString()}
                {a.acknowledged ? " · acked" : ""}
              </p>
            </li>
          ))}
          {alerts.length === 0 && (
            <p className="font-mono text-xs text-[var(--mute)]">all quiet</p>
          )}
        </ul>
      </section>

      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">03</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Telemetry · live</span>
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {[...telemetry].reverse().map((t, i) => (
            <li
              key={`${t.sat_id}-${t.ts}-${i}`}
              className={i === 0 ? "ops-flash rounded-md px-2 py-1" : "px-2 py-1"}
            >
              <p className="font-mono text-[11px] text-[var(--cream)]">
                {t.sat_id}{" "}
                <span className="text-[var(--cream-dim)]">
                  {t.battery_v.toFixed(2)}V · {t.mode_active ?? "—"} ·{" "}
                  {new Date(t.ts).toISOString().slice(11, 19)}Z
                </span>
              </p>
            </li>
          ))}
          {telemetry.length === 0 && (
            <p className="font-mono text-xs text-[var(--mute)]">awaiting stream…</p>
          )}
        </ul>
      </section>

      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">04</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Decisions</span>
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {decisions.map((d, i) => (
            <li
              key={`${d.sat_id}-${d.final_action}-${i}`}
              className="rounded-md border px-2 py-1.5"
              style={{
                borderColor: d.overridden ? "var(--somaiya)" : "var(--rule)",
                background: d.overridden ? "var(--somaiya-soft)" : "var(--ink-2)",
              }}
            >
              <p className="font-mono text-[11px] text-[var(--cream)]">
                {d.sat_id} → {d.final_action}
                {d.overridden && (
                  <span className="ml-2 text-[var(--somaiya)]">override</span>
                )}
              </p>
            </li>
          ))}
          {decisions.length === 0 && (
            <p className="font-mono text-xs text-[var(--mute)]">no decisions yet</p>
          )}
        </ul>
      </section>
    </div>
  );
}
