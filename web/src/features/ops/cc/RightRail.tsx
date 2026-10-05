import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Locked } from "@/app/access";
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

function stateTone(state: string): "ok" | "warn" | "critical" | undefined {
  if (state === "NOMINAL") return "ok";
  if (state === "SAFE") return "warn";
  if (state === "CRITICAL") return "critical";
  return undefined;
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
                  ? "bg-white"
                  : "bg-white/30 hover:bg-white/60"
              }`}
              style={{ height: `${Math.round(ratio * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between sx-caption">
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
            <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
              <span className="sx-eyebrow text-white">
                Upcoming passes
              </span>
              <span className="sx-caption">
                {sortedContacts.length} scheduled
              </span>
            </div>

            <div className="divide-y divide-[var(--sx-hairline)] max-h-[calc(100vh-14rem)] overflow-y-auto">
              {sortedContacts.map((c) => {
                const isIsl = c.kind === "ISL";
                return (
                  <div
                    key={c.contact_id}
                    className="py-3 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-[family-name:var(--font-display)] text-[13px] font-bold capitalize text-white">
                        {c.from_node} → {c.to_node}
                      </span>
                      <span className="sx-caption text-[var(--sx-text-3)] capitalize ">
                        {isIsl ? "ISL" : "Ground"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between sx-caption">
                      <span>Countdown</span>
                      <span className="sx-num text-white tabular-nums">
                        {formatContactCountdown(c.start_ts, now)}
                      </span>
                    </div>

                    {/* Link quality bar */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center sx-caption">
                        <span className="inline-flex items-center">
                          Link quality
                          <HelpHint text="Expected radio signal strength and packet success rate for this link." />
                        </span>
                        <span className="sx-num text-white tabular-nums">{c.link_score}%</span>
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${c.link_score}%`,
                            backgroundColor: "rgba(255, 255, 255, 0.7)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {sortedContacts.length === 0 && (
                <div className="py-4 text-center sx-caption">
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
            <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
              <span className="sx-eyebrow text-white">
                Live data
              </span>
              <span className="sx-status" data-tone="ok">
                Streaming
              </span>
            </div>

            <div className="divide-y divide-[var(--sx-hairline)] max-h-[300px] overflow-y-auto">
              {[...telemetry].reverse().map((t, idx) => (
                <div
                  key={`${t.sat_id}-${t.ts}-${idx}`}
                  className="py-2.5 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-display)] text-[13px] font-bold capitalize text-white">
                      {t.sat_id}
                    </span>
                    <span className="sx-caption tabular-nums">
                      {new Date(t.ts).toISOString().slice(11, 19)}Z
                    </span>
                  </div>
                  <div className="flex items-center justify-between sx-caption">
                    <span className="sx-num tabular-nums text-white">
                      {t.battery_v.toFixed(2)} V · {t.temp_c}°C
                    </span>
                    <span className="sx-num tabular-nums text-[var(--sx-text-3)]">
                      {t.rssi_dbm !== null ? `${t.rssi_dbm} dBm` : "—"} · {t.mode_active ?? "IDLE"}
                    </span>
                  </div>
                </div>
              ))}
              {telemetry.length === 0 && (
                <div className="py-4 text-center sx-caption">
                  Awaiting live data frames…
                </div>
              )}
            </div>
          </div>
        </Glass>

        {/* AI Router Decision Feed */}
        <Glass>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
              <span className="sx-eyebrow text-white">
                AI router decisions
              </span>
              <span className="sx-caption">
                {decisions.length} events
              </span>
            </div>

            <div className="divide-y divide-[var(--sx-hairline)] max-h-[260px] overflow-y-auto">
              {decisions.map((d, idx) => (
                <div
                  key={`${d.sat_id}-${idx}`}
                  className="py-2.5 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-[family-name:var(--font-display)] text-[13px] font-bold capitalize text-white">
                      {d.sat_id}
                    </span>
                    {d.overridden && (
                      <span className="sx-status" data-tone="warn">
                        Safety override
                      </span>
                    )}
                  </div>
                  <span className="sx-caption text-[var(--sx-text-2)]">
                    Action: <span className="text-white">{d.final_action}</span>
                  </span>
                </div>
              ))}
              {decisions.length === 0 && (
                <div className="py-4 text-center sx-caption">
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
      {/* 1. Selected satellite card */}
      {sat && (
        <Glass className="w-full">
          <div className="flex flex-col gap-3">
            {/* Identity section */}
            <div className="flex flex-col gap-1">
              <span className="sx-eyebrow text-[var(--sx-text-3)]">
                Selected satellite
              </span>
              <div className="flex items-baseline justify-between mt-1 gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold capitalize tracking-tight text-white leading-none">
                  {sat.display_name || sat.node_id}
                </h2>
                <span
                  className="sx-status shrink-0"
                  data-tone={stateTone(sat.state)}
                >
                  {formatSatState(sat.state)}
                  {sat.state === "SAFE" && (
                    <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
                  )}
                </span>
              </div>
              <p className="sx-caption">
                {sat.node_id} · Orbit plane {sat.plane} · 525 km
              </p>
            </div>

            {/* Battery section */}
            <div className="pt-2.5 border-t border-[var(--sx-hairline)] flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="sx-eyebrow text-[var(--sx-text-3)]">
                  Battery
                </span>
                <span className="sx-caption">
                  10 min change: {batDelta >= 0 ? "+" : ""}
                  {batDelta.toFixed(2)} V
                </span>
              </div>

              <div className="sx-num text-[26px] text-white tabular-nums leading-none">
                {currentBat.toFixed(2)} <span className="text-[13px] font-normal text-[var(--sx-text-3)]">V</span>
              </div>

              <BatteryBarChart values={batHistory} />
            </div>

            {/* 2-column stat row */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--sx-hairline)]">
              <div className="flex flex-col gap-0.5">
                <span className="sx-caption">
                  Temperature
                </span>
                <span className="sx-num text-[20px] text-white tabular-nums">
                  {curTemp} <span className="text-[12px] font-normal text-[var(--sx-text-3)]">°C</span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="sx-caption truncate">
                  Signal received (RSSI)
                </span>
                <span className="sx-num text-[20px] text-white tabular-nums">
                  {curRssi} <span className="text-[12px] font-normal text-[var(--sx-text-3)]">dBm</span>
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
            <Glass className="w-full">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span
                    className="sx-status"
                    data-tone={isCritical ? "critical" : "warn"}
                  >
                    {isCritical ? "Critical alert" : "Warning"}
                  </span>
                  <span className="sx-caption tabular-nums">
                    {new Date(activeAlert.raised_at).toISOString().slice(11, 16)} UTC
                  </span>
                </div>

                <p className="sx-body text-white">
                  {activeAlert.message}
                </p>

                {/* Progress rows */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[var(--sx-hairline)]">
                  {warningMetrics.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-baseline sx-caption">
                        <span className="text-white font-medium">{row.label}</span>
                        <span className="sx-num">{row.value}%</span>
                      </div>
                      <div className="sx-caption text-[var(--sx-text-3)]">
                        {row.explanation}
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.value}%`,
                            backgroundColor: isCritical ? "var(--sx-red)" : "var(--sx-orange)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buttons: Acknowledge & Open AI router */}
                <div className="flex flex-col gap-2 pt-1.5 border-t border-[var(--sx-hairline)]">
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
                        className="sx-btn sx-btn--sm sx-btn--filled"
                      >
                        {acking ? "Acknowledging..." : "Acknowledge"}
                      </button>
                    </Locked>
                    <button
                      type="button"
                      onClick={() => navigate("/brain")}
                      className="sx-btn sx-btn--sm ml-auto"
                    >
                      Open AI router
                    </button>
                  </div>
                  {ackError && (
                    <div className="p-3 rounded-[10px] border border-[var(--sx-hairline)] bg-[var(--sx-night)] text-xs text-[var(--sx-red)] flex flex-col gap-1">
                      <div className="font-semibold">
                        Permission denied by PostgreSQL ({ackError.sqlstate ?? "42501"})
                      </div>
                      <div className="sx-code break-words">
                        {ackError.message}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Glass>
          )}

          {/* 3. Today KPIs Card */}
          <Glass className="w-full">
            <div className="flex flex-col gap-2.5">
              <span className="sx-eyebrow text-white">
                Today
              </span>
              <div className="divide-y divide-[var(--sx-hairline)]">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="sx-caption">
                    Working satellites
                  </span>
                  <span className="sx-num text-[22px] text-white tabular-nums">
                    {kpi ? `${kpi.sats_operational}/${kpi.sats_total}` : "—"}
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="sx-caption">
                    Packets waiting to send
                  </span>
                  <span className="sx-num text-[22px] text-white tabular-nums">
                    {kpi ? kpi.packets_queued : "—"}
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="sx-caption">
                    Delivered in last 24 h
                  </span>
                  <span className="sx-num text-[22px] text-white tabular-nums">
                    {kpi ? kpi.packets_delivered_24h : "—"}
                  </span>
                </div>

                <div className="py-2.5 flex items-center justify-between">
                  <span className="sx-caption">
                    Safety check overruled AI
                  </span>
                  <span className="sx-num text-[22px] text-white tabular-nums">
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

