import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Locked, useRole } from "@/app/access";
import { apiFetch, ApiError } from "@/app/api";
import type {
  Alert,
  ConstellationSat,
  Contact,
  DecisionEvent,
  Kpi,
  TelemetryEvent,
} from "../api";
import { Glass } from "./Glass";
import { HelpHint } from "./HelpHint";
import type { OpsTab } from "./types";

interface RightRailProps {
  activeTab: OpsTab;
  selectedSat: ConstellationSat | null;
  histories: Record<string, number[]>;
  telemetry: TelemetryEvent[];
  alerts: Alert[];
  kpis: Kpi[];
  contacts: Contact[];
  decisions: DecisionEvent[];
  onRefetchAlerts?: () => Promise<void>;
}

function stateColor(state: string): string {
  switch (state) {
    case "NOMINAL":
      return "#7ee2b8";
    case "SAFE":
      return "#f5a524";
    case "CRITICAL":
      return "#ff3b4f";
    default:
      return "#4a5a8a";
  }
}

function formatSatState(state: string): string {
  switch (state) {
    case "NOMINAL":
      return "Healthy";
    case "SAFE":
      return "Safe mode";
    case "STOWED":
      return "Not deployed";
    case "DEPLOYED":
    case "COMMISSIONING":
      return "Starting up";
    case "CRITICAL":
      return "Critical";
    default:
      return state;
  }
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function formatContactCountdown(iso: string, nowMs: number): string {
  const diff = Math.floor((new Date(iso).getTime() - nowMs) / 1000);
  if (diff <= 0) return "Happening now";
  const mm = Math.floor(diff / 60);
  const ss = diff % 60;
  return `In ${two(mm)}:${two(ss)}`;
}

// Vertical bar chart component (~40 bars)
function BatteryBarChart({ values }: { values: number[] }) {
  let bars = values.slice(-40);
  if (bars.length === 0) bars = [7.4];

  let min = Math.min(...bars);
  let max = Math.max(...bars);
  if (max - min < 0.1) {
    max += 0.2;
    min -= 0.2;
  }
  const range = max - min;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-end gap-[2px] h-[52px] w-full pt-1.5">
        {bars.map((v, i) => {
          const isLatest = i === bars.length - 1;
          const ratio = Math.max(0.1, Math.min(1, (v - min) / range));
          return (
            <div
              key={i}
              title={`${v.toFixed(2)} V`}
              className={`flex-1 rounded-[1px] transition-all ${
                isLatest
                  ? "bg-white shadow-[0_0_8px_white]"
                  : "bg-[#3d5bff] opacity-80 hover:opacity-100"
              }`}
              style={{ height: `${Math.round(ratio * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
        <span>-10 min</span>
        <span>NOW</span>
      </div>
    </div>
  );
}

export function RightRail({
  activeTab,
  selectedSat,
  histories,
  telemetry,
  alerts,
  kpis,
  contacts,
  decisions,
  onRefetchAlerts,
}: RightRailProps) {
  const { access } = useRole();
  const navigate = useNavigate();
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState<{
    sqlstate?: string;
    message: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Active sat details
  const sat = selectedSat;
  const satId = sat ? sat.node_id : "";
  const batHistory = satId ? (histories[satId] ?? []) : [];
  const currentBat = sat?.battery_v ?? 7.4;
  const firstBat = batHistory.length > 0 ? batHistory[0] : currentBat;
  const batDelta = currentBat - firstBat;

  // Telemetry for selected sat
  const satTelemetry = telemetry.filter((t) => t.sat_id === satId);
  const latestTelem = satTelemetry[satTelemetry.length - 1];

  const curTemp = latestTelem
    ? `${latestTelem.temp_c > 0 ? "+" : ""}${latestTelem.temp_c.toFixed(1)}`
    : "+21.4";
  const curRssi =
    latestTelem?.rssi_dbm !== null && latestTelem?.rssi_dbm !== undefined
      ? `${latestTelem.rssi_dbm.toFixed(1)}`
      : "-88.5";

  // Highest priority unacknowledged alert
  const unackAlerts = alerts
    .filter((a) => !a.acknowledged)
    .sort((a, b) => {
      if (a.severity === "CRITICAL" && b.severity !== "CRITICAL") return -1;
      if (b.severity === "CRITICAL" && a.severity !== "CRITICAL") return 1;
      return new Date(b.raised_at).getTime() - new Date(a.raised_at).getTime();
    });

  const activeAlert = unackAlerts[0] ?? null;
  const isCritical = activeAlert?.severity === "CRITICAL";
  const alertColor = isCritical ? "#ff3b4f" : "#f5a524";

  const handleAckAlert = async () => {
    if (!activeAlert) return;
    setAcking(true);
    setAckError(null);
    try {
      await apiFetch(`/api/alerts/${activeAlert.alert_id}/ack`, {
        method: "POST",
      });
      await onRefetchAlerts?.();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setAckError({
          sqlstate: e.sqlstate,
          message: e.message,
        });
      } else if (e instanceof Error) {
        setAckError({
          message: e.message,
        });
      }
    } finally {
      setAcking(false);
    }
  };

  const warningMetrics = [
    {
      label: "Battery reserve",
      explanation: "Battery above safe-mode limit (6.8 V)",
      value: 72,
    },
    {
      label: "Link quality reserve",
      explanation: "Signal headroom above minimum ground contact threshold",
      value: 58,
    },
    {
      label: "Storage buffer space",
      explanation: "Memory available for queued packets before overflow",
      value: 44,
    },
  ];

  // KPIs
  const kpi = kpis[0];

  // If Upcoming passes tab (contacts)
  if (activeTab === "contacts") {
    const sortedContacts = [...contacts].sort(
      (a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime(),
    );

    return (
      <div className="w-full flex flex-col gap-3">
        <Glass>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                Upcoming passes
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {sortedContacts.length} scheduled
              </span>
            </div>

            {access?.station && (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-[#dfe6f5] leading-relaxed">
                Only passes involving your station are listed: row-level security on contact
              </div>
            )}

            <div className="flex flex-col gap-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
              {sortedContacts.map((c) => {
                const isIsl = c.kind === "ISL";
                return (
                  <div
                    key={c.contact_id}
                    className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11.5px] font-semibold text-[#dfe6f5]">
                        {isIsl
                          ? `${c.from_node} to ${c.to_node} (satellite-to-satellite link)`
                          : `${c.from_node} to ${c.to_node} (to ground)`}
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                          isIsl
                            ? "text-[#7fb2ff] border-[#7fb2ff]/30 bg-[#7fb2ff]/10"
                            : "text-[#7ee2b8] border-[#7ee2b8]/30 bg-[#7ee2b8]/10"
                        }`}
                      >
                        {isIsl ? "ISL" : "Ground"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-[#8b96b0]">Countdown</span>
                      <span className="text-[#7ee2b8] tabular-nums font-medium">
                        {formatContactCountdown(c.start_ts, now)}
                      </span>
                    </div>

                    {/* Link quality bar */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center font-mono text-[9px] text-[#8b96b0]">
                        <span className="inline-flex items-center">
                          Link quality
                          <HelpHint text="Expected radio signal strength and packet success rate for this link." />
                        </span>
                        <span className="text-[#dfe6f5] tabular-nums font-medium">{c.link_score}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${c.link_score}%`,
                            backgroundColor:
                              c.link_score >= 70
                                ? "#7ee2b8"
                                : c.link_score >= 40
                                  ? "#f5a524"
                                  : "#ff3b4f",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {sortedContacts.length === 0 && (
                <div className="p-4 text-center font-mono text-xs text-[#8b96b0]">
                  No upcoming passes scheduled.
                </div>
              )}
            </div>
          </div>
        </Glass>
      </div>
    );
  }

  // If Live data tab (telemetry)
  if (activeTab === "telemetry") {
    return (
      <div className="w-full flex flex-col gap-3">
        {/* Live Data Ticker */}
        <Glass>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                Live data
              </span>
              <span className="font-mono text-[10px] text-[#7ee2b8] flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#7ee2b8] motion-safe:animate-pulse" />
                STREAMING
              </span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {[...telemetry].reverse().map((t, idx) => (
                <div
                  key={`${t.sat_id}-${t.ts}-${idx}`}
                  className={`p-2.5 rounded-xl font-mono text-[11px] flex flex-col gap-0.5 border ${
                    idx === 0
                      ? "bg-[#3d5bff]/10 border-[#3d5bff]/40 text-white"
                      : "liquid-glass-inset text-[#8b96b0]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[#dfe6f5] font-semibold">{t.sat_id}</span>
                    <span className="text-[10px] text-[#8b96b0]">
                      {new Date(t.ts).toISOString().slice(11, 19)}Z
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span>
                      {t.battery_v.toFixed(2)} V • {t.temp_c}°C
                    </span>
                    <span>
                      {t.rssi_dbm !== null ? `${t.rssi_dbm} dBm` : "—"} •{" "}
                      {t.mode_active ?? "IDLE"}
                    </span>
                  </div>
                </div>
              ))}
              {telemetry.length === 0 && (
                <div className="p-4 text-center font-mono text-xs text-[#8b96b0]">
                  Awaiting live data frames…
                </div>
              )}
            </div>
          </div>
        </Glass>

        {/* AI Router Decision Feed */}
        <Glass>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                AI router decisions
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {decisions.length} EVENTS
              </span>
            </div>

            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
              {decisions.map((d, idx) => (
                <div
                  key={`${d.sat_id}-${idx}`}
                  className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-1 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[#dfe6f5] font-semibold">{d.sat_id}</span>
                    {d.overridden && (
                      <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#f5a524]/40 bg-[#f5a524]/10 text-[#f5a524]">
                        Safety check overruled the AI
                      </span>
                    )}
                  </div>
                  <span className="text-[#8b96b0] text-[10px]">
                    Action: <span className="text-[#dfe6f5]">{d.final_action}</span>
                  </span>
                </div>
              ))}
              {decisions.length === 0 && (
                <div className="p-4 text-center font-mono text-xs text-[#8b96b0]">
                  No AI decision logs recorded.
                </div>
              )}
            </div>
          </div>
        </Glass>
      </div>
    );
  }

  // Overview and Satellites (Fleet) Tabs:
  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. ONE "Selected satellite" card (merges identity, battery & chart, and 2-column stats) */}
      {sat && (
        <Glass className="w-full">
          <div className="flex flex-col gap-3">
            {/* Identity section */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Selected satellite
              </span>
              <div className="flex items-baseline justify-between mt-1 gap-2">
                <h1 className="font-sans min-w-0 break-words text-[30px] font-light leading-none tracking-tight text-white">
                  {sat.display_name || sat.node_id}
                </h1>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.14em] px-2.5 py-0.5 rounded-full border shrink-0 inline-flex items-center"
                  style={{
                    color: stateColor(sat.state),
                    borderColor: `color-mix(in srgb, ${stateColor(sat.state)} 35%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${stateColor(sat.state)} 12%, transparent)`,
                  }}
                >
                  {formatSatState(sat.state)}
                  {sat.state === "SAFE" && (
                    <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
                  )}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[#8b96b0] tracking-wider">
                {sat.node_id}, sun-synchronous orbit {sat.plane}, 525 km
              </p>
            </div>

            {/* Battery section */}
            <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                  Battery
                </span>
                <span
                  className={`font-mono text-[10px] ${
                    batDelta >= 0 ? "text-[#7ee2b8]" : "text-[#f5a524]"
                  }`}
                >
                  change over 10 min: {batDelta >= 0 ? "+" : ""}
                  {batDelta.toFixed(2)} V
                </span>
              </div>

              <div className="font-mono text-[24px] font-semibold text-white tracking-tight leading-none">
                {currentBat.toFixed(2)}{" "}
                <span className="text-[13px] font-normal text-[#8b96b0]">V</span>
              </div>

              <BatteryBarChart values={batHistory} />
            </div>

            {/* 2-column stat row: Temperature and Signal received (RSSI) as plain numbers with units */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.08]">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8b96b0]">
                  Temperature
                </span>
                <span className="font-mono text-[18px] font-medium text-white tabular-nums">
                  {curTemp} <span className="text-[12px] font-normal text-[#8b96b0]">°C</span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8b96b0] truncate">
                  Signal received (RSSI)
                </span>
                <span className="font-mono text-[18px] font-medium text-white tabular-nums">
                  {curRssi} <span className="text-[12px] font-normal text-[#8b96b0]">dBm</span>
                </span>
              </div>
            </div>
          </div>
        </Glass>
      )}

      {/* If Satellites (Fleet) tab: only asset card + battery chart */}
      {activeTab === "fleet" ? null : (
        <>
          {/* 2. Warning Card (only when there is an unacknowledged alert) */}
          {activeAlert && (
            <Glass
              tone={isCritical ? "critical" : "warn"}
              className="w-full"
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} style={{ color: alertColor }} />
                  <span
                    className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: alertColor }}
                  >
                    Warning
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-[#8b96b0]">
                    {activeAlert.sat_id ?? "SS-1"}
                  </span>
                </div>

                <p className="font-sans text-[12px] text-[#dfe6f5] leading-snug">
                  {activeAlert.message}
                </p>

                {/* Three progress rows */}
                <div className="flex flex-col gap-2 pt-1">
                  {warningMetrics.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-baseline font-mono text-[10px]">
                        <span className="text-[#dfe6f5] font-semibold">{row.label}</span>
                        <span style={{ color: alertColor }}>{row.value}%</span>
                      </div>
                      <div className="text-[10px] text-[#8b96b0]">
                        {row.explanation}
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.value}%`,
                            backgroundColor: alertColor,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buttons: Acknowledge & Open AI router */}
                <div className="flex flex-col gap-2 pt-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Locked
                      action="ack_alert"
                      reason="Read-only role"
                      onTry={handleAckAlert}
                    >
                      <button
                        type="button"
                        onClick={handleAckAlert}
                        disabled={acking}
                        className="px-3.5 py-1.5 rounded-full border border-white/15 bg-white/10 text-[11px] font-mono uppercase tracking-wider text-[#dfe6f5] hover:bg-white/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {acking ? "Acknowledging..." : "Acknowledge"}
                      </button>
                    </Locked>
                    <button
                      type="button"
                      onClick={() => navigate("/brain")}
                      className="px-3.5 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider text-black font-semibold transition-transform hover:scale-[1.02] cursor-pointer ml-auto"
                      style={{ backgroundColor: alertColor }}
                    >
                      Open AI router
                    </button>
                  </div>
                  {ackError && (
                    <div className="p-2.5 rounded-xl border border-[#ff3b4f]/40 bg-[#ff3b4f]/10 text-xs text-[#ff3b4f] flex flex-col gap-1">
                      <div className="font-semibold">
                        Permission denied by PostgreSQL ({ackError.sqlstate ?? "42501"})
                      </div>
                      <div className="font-mono text-[11px] text-[#dfe6f5] break-words">
                        {ackError.message}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Glass>
          )}

          {/* 3. Today KPIs Card (2x2 numbers) */}
          <Glass className="w-full">
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Today
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Working satellites
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? `${kpi.sats_operational}/${kpi.sats_total}` : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Packets waiting to send
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.packets_queued : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Delivered in last 24 h
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.packets_delivered_24h : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl liquid-glass-inset flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Times the safety check overruled the AI
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.ai_overrides_24h : "—"}
                  </span>
                </div>
              </div>
            </div>
          </Glass>
        </>
      )}
    </div>
  );
}
