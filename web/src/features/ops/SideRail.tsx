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
  if (sev === "CRITICAL") return "#d7263d";
  if (sev === "WARN") return "#ffb020";
  return "#3ddc97";
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
        @keyframes ops-flash{0%{background:rgba(61,107,255,.35)}100%{background:transparent}}
      `}</style>

      <section>
        <p className="mono-label text-[#8a8a93]">[ kpis ]</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-lg border border-[#1f1f24] bg-[#0a0a0c] p-2.5"
            >
              <p className="mono-label text-[#8a8a93]">{t.label}</p>
              <p className="mt-1 font-mono text-lg text-[#f5f5f7]">{t.value}</p>
            </div>
          ))}
          {tiles.length === 0 && (
            <p className="font-mono text-xs text-[#8a8a93]">no kpis yet</p>
          )}
        </div>
      </section>

      <section>
        <p className="mono-label text-[#8a8a93]">[ alerts ]</p>
        <ul className="mt-2 flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.alert_id}
              className="rounded-lg border bg-[#0a0a0c] p-2.5"
              style={{ borderColor: `${sevColor(a.severity)}55` }}
            >
              <p className="font-mono text-[11px]" style={{ color: sevColor(a.severity) }}>
                {a.severity} · {a.sat_id ?? "—"}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[#f5f5f7]">{a.message}</p>
              <p className="mt-1 font-mono text-[10px] text-[#8a8a93]">
                {new Date(a.raised_at).toUTCString()}
                {a.acknowledged ? " · acked" : ""}
              </p>
            </li>
          ))}
          {alerts.length === 0 && (
            <p className="font-mono text-xs text-[#8a8a93]">all quiet</p>
          )}
        </ul>
      </section>

      <section>
        <p className="mono-label text-[#8a8a93]">[ telemetry · live ]</p>
        <ul className="mt-2 flex flex-col gap-1">
          {[...telemetry].reverse().map((t, i) => (
            <li
              key={`${t.sat_id}-${t.ts}-${i}`}
              className={i === 0 ? "ops-flash rounded-md px-2 py-1" : "px-2 py-1"}
            >
              <p className="font-mono text-[11px] text-[#f5f5f7]">
                {t.sat_id}{" "}
                <span className="text-[#8a8a93]">
                  {t.battery_v.toFixed(2)}V · {t.mode_active ?? "—"} ·{" "}
                  {new Date(t.ts).toISOString().slice(11, 19)}Z
                </span>
              </p>
            </li>
          ))}
          {telemetry.length === 0 && (
            <p className="font-mono text-xs text-[#8a8a93]">awaiting stream…</p>
          )}
        </ul>
      </section>

      <section>
        <p className="mono-label text-[#8a8a93]">[ decisions ]</p>
        <ul className="mt-2 flex flex-col gap-1">
          {decisions.map((d, i) => (
            <li
              key={`${d.sat_id}-${d.final_action}-${i}`}
              className="rounded-md border px-2 py-1.5"
              style={{
                borderColor: d.overridden ? "#d7263d88" : "#1f1f24",
                background: d.overridden ? "rgba(215,38,61,.08)" : "#0a0a0c",
              }}
            >
              <p className="font-mono text-[11px] text-[#f5f5f7]">
                {d.sat_id} → {d.final_action}
                {d.overridden && (
                  <span className="ml-2 text-[#d7263d]">override</span>
                )}
              </p>
            </li>
          ))}
          {decisions.length === 0 && (
            <p className="font-mono text-xs text-[#8a8a93]">no decisions yet</p>
          )}
        </ul>
      </section>
    </div>
  );
}
