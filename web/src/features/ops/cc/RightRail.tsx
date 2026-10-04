import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type {
  Alert,
  ConstellationSat,
  Contact,
  DecisionEvent,
  Kpi,
  TelemetryEvent,
} from "../api";
import { Panel } from "./Panel";
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

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function formatCountdown(iso: string, nowMs: number): string {
  const diff = Math.floor((new Date(iso).getTime() - nowMs) / 1000);
  if (diff <= 0) return "IN PASS";
  const mm = Math.floor(diff / 60);
  const ss = diff % 60;
  return `T- ${two(mm)}:${two(ss)}`;
}

// Sparkline SVG component
function Sparkline({
  points,
  color,
  unit,
  label,
  currentValue,
}: {
  points: number[];
  color: string;
  unit: string;
  label: string;
  currentValue: string;
}) {
  const w = 120;
  const h = 32;
  const pad = 2;

  let pathD = "";
  let areaD = "";
  let lastX = w - pad;
  let lastY = h / 2;

  if (points.length < 2) {
    // Flat line fallback
    const y = h / 2;
    pathD = `M ${pad} ${y} L ${w - pad} ${y}`;
    areaD = `M ${pad} ${y} L ${w - pad} ${y} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
    lastY = y;
  } else {
    let min = Math.min(...points);
    let max = Math.max(...points);
    if (max - min < 0.1) {
      max += 0.5;
      min -= 0.5;
    }
    const step = (w - pad * 2) / (points.length - 1);
    const coords = points.map((val, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (val - min) / (max - min));
      return [x, y] as [number, number];
    });

    pathD = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`)
      .join(" ");
    const last = coords[coords.length - 1];
    lastX = last[0];
    lastY = last[1];
    areaD = `${pathD} L ${lastX.toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;
  }

  return (
    <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-white/5 flex-1 min-w-0">
      <div className="flex items-center justify-between font-mono text-[9px]">
        <span className="text-[#8b96b0] uppercase tracking-wider">{label}</span>
        <span className="text-[#dfe6f5] font-semibold tabular-nums">
          {currentValue} {unit}
        </span>
      </div>
      <div className="w-full h-8 relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="w-full h-full block overflow-visible"
        >
          <path
            d={areaD}
            fill={`color-mix(in srgb, ${color} 15%, transparent)`}
          />
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={lastX.toFixed(1)}
            cy={lastY.toFixed(1)}
            r="2"
            fill={color}
          />
        </svg>
      </div>
    </div>
  );
}

// Vertical bar chart component (~40 bars)
function BatteryBarChart({ values }: { values: number[] }) {
  // Take last 40 values, or pad
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
      <div className="flex items-end gap-[2px] h-[54px] w-full pt-2">
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
}: RightRailProps) {
  const navigate = useNavigate();
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<number>>(
    () => new Set(),
  );
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
  const tempValues = satTelemetry.map((t) => t.temp_c);
  const rssiValues = satTelemetry
    .map((t) => t.rssi_dbm)
    .filter((r): r is number => r !== null);

  const curTemp = latestTelem ? `${latestTelem.temp_c > 0 ? "+" : ""}${latestTelem.temp_c.toFixed(1)}` : "+21.4";
  const curRssi = latestTelem?.rssi_dbm !== null && latestTelem?.rssi_dbm !== undefined ? `${latestTelem.rssi_dbm.toFixed(1)}` : "-88.5";

  // Highest priority unacknowledged alert
  const unackAlerts = alerts
    .filter((a) => !a.acknowledged && !dismissedAlertIds.has(a.alert_id))
    .sort((a, b) => {
      if (a.severity === "CRITICAL" && b.severity !== "CRITICAL") return -1;
      if (b.severity === "CRITICAL" && a.severity !== "CRITICAL") return 1;
      return new Date(b.raised_at).getTime() - new Date(a.raised_at).getTime();
    });

  const activeAlert = unackAlerts[0] ?? null;
  const isCritical = activeAlert?.severity === "CRITICAL";
  const alertColor = isCritical ? "#ff3b4f" : "#f5a524";

  // KPIs
  const kpi = kpis[0];

  // If Contacts tab
  if (activeTab === "contacts") {
    const sortedContacts = [...contacts].sort(
      (a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime(),
    );

    return (
      <div className="w-full flex flex-col gap-3">
        <Panel cut={8}>
          <div className="p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                Upcoming Contacts
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {sortedContacts.length} scheduled
              </span>
            </div>

            <div className="flex flex-col gap-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
              {sortedContacts.map((c) => {
                const isIsl = c.kind === "ISL";
                return (
                  <div
                    key={c.contact_id}
                    className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12px] font-semibold text-[#dfe6f5]">
                        {c.from_node} → {c.to_node}
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          isIsl
                            ? "text-[#7fb2ff] border-[#7fb2ff]/30 bg-[#7fb2ff]/10"
                            : "text-[#7ee2b8] border-[#7ee2b8]/30 bg-[#7ee2b8]/10"
                        }`}
                      >
                        {c.kind}
                      </span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-[#8b96b0]">Countdown</span>
                      <span className="text-[#7ee2b8] tabular-nums">
                        {formatCountdown(c.start_ts, now)}
                      </span>
                    </div>

                    {/* Link score bar */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between font-mono text-[9px] text-[#8b96b0]">
                        <span>Link score</span>
                        <span className="text-[#dfe6f5]">{c.link_score}%</span>
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
                  No upcoming contacts scheduled.
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  // If Telemetry tab
  if (activeTab === "telemetry") {
    return (
      <div className="w-full flex flex-col gap-3">
        {/* Live Telemetry Ticker */}
        <Panel cut={8}>
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                Live Telemetry
              </span>
              <span className="font-mono text-[10px] text-[#7ee2b8] flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[#7ee2b8] animate-pulse" />
                STREAMING
              </span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {[...telemetry].reverse().map((t, idx) => (
                <div
                  key={`${t.sat_id}-${t.ts}-${idx}`}
                  className={`p-2 rounded font-mono text-[11px] flex flex-col gap-0.5 border ${
                    idx === 0
                      ? "bg-[#3d5bff]/10 border-[#3d5bff]/40 text-white"
                      : "bg-black/30 border-white/5 text-[#8b96b0]"
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
                  Awaiting telemetry frames…
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* AI Decision Feed */}
        <Panel cut={8}>
          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dfe6f5]">
                AI Router Decisions
              </span>
              <span className="font-mono text-[10px] text-[#8b96b0]">
                {decisions.length} EVENTS
              </span>
            </div>

            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
              {decisions.map((d, idx) => (
                <div
                  key={`${d.sat_id}-${idx}`}
                  className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-1 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[#dfe6f5] font-semibold">{d.sat_id}</span>
                    {d.overridden && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#f5a524]/40 bg-[#f5a524]/10 text-[#f5a524]">
                        WATCHDOG OVERRIDE
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
        </Panel>
      </div>
    );
  }

  // Overview and Fleet Tabs:
  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. Active Asset Panel */}
      {sat && (
        <Panel cut={8} className="w-full">
          <div className="p-4 flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Active asset
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <h1 className="font-sans whitespace-nowrap text-[34px] font-light leading-none tracking-tight text-white">
                {sat.display_name || sat.node_id}
              </h1>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-sm border shrink-0"
                style={{
                  color: stateColor(sat.state),
                  borderColor: `color-mix(in srgb, ${stateColor(sat.state)} 30%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${stateColor(sat.state)} 10%, transparent)`,
                }}
              >
                {sat.state}
              </span>
            </div>
            <p className="font-mono text-[11px] text-[#8b96b0] uppercase tracking-wider mt-1">
              {sat.node_id} / 525 KM SSO / PLANE {sat.plane}
            </p>
          </div>
        </Panel>
      )}

      {/* 2. Battery Panel */}
      <Panel cut={8} className="w-full">
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Battery voltage
            </span>
            <span
              className={`font-mono text-[10px] ${
                batDelta >= 0 ? "text-[#7ee2b8]" : "text-[#f5a524]"
              }`}
            >
              {batDelta >= 0 ? "+" : ""}
              {batDelta.toFixed(2)} V in 10m
            </span>
          </div>

          <div className="font-mono text-[26px] font-semibold text-white tracking-tight leading-none">
            {currentBat.toFixed(2)}{" "}
            <span className="text-[14px] font-normal text-[#8b96b0]">V</span>
          </div>

          <BatteryBarChart values={batHistory} />
        </div>
      </Panel>

      {/* If Fleet tab: only asset card + battery chart */}
      {activeTab === "fleet" ? null : (
        <>
          {/* 3. Payload Diagnostics */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Payload Diagnostics
              </span>
              <div className="flex gap-2">
                <Sparkline
                  points={tempValues}
                  color="#7ee2b8"
                  unit="°C"
                  label="Payload temp"
                  currentValue={curTemp}
                />
                <Sparkline
                  points={rssiValues}
                  color="#3d5bff"
                  unit="dBm"
                  label="Tx power"
                  currentValue={curRssi}
                />
              </div>
            </div>
          </Panel>

          {/* 4. Anomaly Panel */}
          {activeAlert && (
            <Panel
              cut={8}
              borderColor={alertColor}
              glowColor={alertColor}
              className="w-full"
            >
              <div className="p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} style={{ color: alertColor }} />
                  <span
                    className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: alertColor }}
                  >
                    Anomaly Detected
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-[#8b96b0]">
                    {activeAlert.sat_id ?? "SAT-01"}
                  </span>
                </div>

                <p className="font-sans text-[12px] text-[#dfe6f5] leading-snug">
                  {activeAlert.message}
                </p>

                {/* Three progress rows */}
                <div className="flex flex-col gap-1.5 pt-1">
                  {[
                    { label: "Battery margin", value: 72 },
                    { label: "Link margin", value: 58 },
                    { label: "Queue load", value: 44 },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <div className="flex justify-between font-mono text-[9px] text-[#8b96b0]">
                        <span>{row.label}</span>
                        <span style={{ color: alertColor }}>{row.value}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${row.value}%`,
                            backgroundColor: alertColor,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buttons: Dismiss & Open AI router */}
                <div className="flex items-center gap-2 pt-1.5">
                  <button
                    onClick={() =>
                      setDismissedAlertIds(
                        (prev) => new Set([...prev, activeAlert.alert_id]),
                      )
                    }
                    className="flex-1 py-1.5 rounded border border-white/10 bg-white/5 text-[11px] font-mono uppercase tracking-wider text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => navigate("/brain")}
                    className="flex-1 py-1.5 rounded font-mono text-[11px] uppercase tracking-wider text-black font-semibold transition-transform hover:scale-[1.02] cursor-pointer"
                    style={{ backgroundColor: alertColor }}
                  >
                    Open AI router
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {/* 5. KPI Panel */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
                Constellation Metrics
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Sats Operational
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? `${kpi.sats_operational}/${kpi.sats_total}` : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Packets Queued
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.packets_queued : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    Delivered 24 h
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.packets_delivered_24h : "—"}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-black/40 border border-white/5 flex flex-col gap-0.5">
                  <span className="font-mono text-[9px] text-[#8b96b0] uppercase tracking-wider">
                    AI Overrides 24 h
                  </span>
                  <span className="font-sans text-[22px] font-light text-white leading-tight">
                    {kpi ? kpi.ai_overrides_24h : "—"}
                  </span>
                </div>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
