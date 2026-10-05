import { useEffect, useState } from "react";
import { RoleHeader, useRole } from "@/app/access";
import type { ConstellationSat, Contact } from "../api";
import { Glass } from "./Glass";
import { SatIcon } from "./SatIcon";
import { HelpHint } from "./HelpHint";
import type { FleetFilter } from "./types";

interface LeftRailProps {
  sats: ConstellationSat[];
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  filter: FleetFilter;
  onFilterChange: (f: FleetFilter) => void;
}

function stateTone(state: string): "ok" | "warn" | "critical" | undefined {
  if (state === "NOMINAL") return "ok";
  if (state === "SAFE") return "warn";
  if (state === "CRITICAL") return "critical";
  return undefined;
}

function stateColor(state: string): string {
  switch (state) {
    case "NOMINAL":
      return "var(--sx-green)";
    case "SAFE":
      return "var(--sx-orange)";
    case "CRITICAL":
      return "var(--sx-red)";
    default:
      return "var(--sx-text-3)";
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

function formatCountdown(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "None scheduled";
  const diff = Math.floor((new Date(iso).getTime() - nowMs) / 1000);
  if (diff <= 0) return "Happening now";
  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const ss = diff % 60;
  return `${two(hh)}:${two(mm)}:${two(ss)}`;
}

function DashedBar({
  value,
  max = 100,
  segments = 12,
  fillColor = "rgba(255, 255, 255, 0.7)",
}: {
  value: number;
  max?: number;
  segments?: number;
  fillColor?: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const activeCount = Math.round(ratio * segments);

  return (
    <div className="flex items-center gap-[2px] h-1 w-full">
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < activeCount;
        return (
          <span
            key={i}
            className="flex-1 h-full rounded-[1px] transition-colors"
            style={{
              backgroundColor: isActive ? fillColor : "rgba(255, 255, 255, 0.08)",
            }}
          />
        );
      })}
    </div>
  );
}

export function LeftRail({
  sats,
  contacts,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: LeftRailProps) {
  const { access } = useRole();
  const [roleExpanded, setRoleExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const roleTitle = access
    ? (access.who.split(":")[0]?.replace(/\s*\([^)]*\)\.?$/, "").trim() || "Operator")
    : "Operator";

  // Summary counts
  const nominalCount = sats.filter((s) => s.state === "NOMINAL").length;
  const safeCount = sats.filter((s) => s.state === "SAFE").length;
  const stowedCount = sats.filter(
    (s) =>
      s.state === "STOWED" ||
      s.state === "DEPLOYED" ||
      s.state === "COMMISSIONING",
  ).length;

  // Filter sats
  const filteredSats = sats.filter((s) => {
    if (filter === "ALL") return true;
    if (filter === "NOMINAL") return s.state === "NOMINAL";
    if (filter === "SAFE") return s.state === "SAFE";
    if (filter === "STOWED")
      return (
        s.state === "STOWED" ||
        s.state === "DEPLOYED" ||
        s.state === "COMMISSIONING"
      );
    return true;
  });

  // Contact score lookup
  const getBestLinkScore = (satId: string): number => {
    const matched = contacts.filter(
      (c) =>
        (c.from_node === satId || c.to_node === satId) &&
        Date.parse(c.end_ts) >= now,
    );
    if (matched.length === 0) return 0;
    return Math.max(...matched.map((c) => c.link_score));
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 0. Compact Role Strip */}
      <div className="w-full flex flex-col gap-2">
        <div className="sx-material flex items-center justify-between px-3.5 py-2 rounded-full text-[12px]">
          <span className="sx-status text-white font-medium truncate" data-tone="ok">
            {roleTitle}
          </span>
          <button
            type="button"
            onClick={() => setRoleExpanded((v) => !v)}
            className="sx-caption hover:text-white capitalize transition-colors cursor-pointer shrink-0 ml-2"
            aria-expanded={roleExpanded}
          >
            {roleExpanded ? "Close" : "What can I do?"}
          </button>
        </div>
        {roleExpanded && (
          <div className="rounded-[14px] overflow-hidden">
            <RoleHeader note="Live constellation operations and ground pass scheduling." />
          </div>
        )}
      </div>

      {/* 1. ONE Satellites card */}
      <Glass>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="sx-eyebrow text-white">
              Satellites ({sats.length})
            </span>
          </div>

          {/* Segmented bar: one segment per satellite */}
          <div className="flex items-center gap-[3px] h-1.5 w-full">
            {sats.map((sat) => (
              <div
                key={sat.node_id}
                title={`${sat.display_name || sat.node_id} (${formatSatState(sat.state)})`}
                className="flex-1 h-full rounded-[1px] transition-all"
                style={{ backgroundColor: stateColor(sat.state) }}
              />
            ))}
          </div>

          {/* Legend line: "2 healthy · 1 in safe mode · 1 not yet deployed" */}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--sx-text-2)] leading-snug">
            <span className="sx-status" data-tone="ok">{nominalCount} healthy</span>
            {safeCount > 0 && (
              <span className="sx-status" data-tone="warn">
                {safeCount} in safe mode
                <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
              </span>
            )}
            {stowedCount > 0 && (
              <span className="sx-status text-[var(--sx-text-3)]">
                {stowedCount} not deployed
              </span>
            )}
          </div>

          {/* Filter chips directly under it */}
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[var(--sx-hairline)]">
            {(
              [
                { id: "ALL", label: "All", count: sats.length },
                { id: "NOMINAL", label: "Healthy", count: nominalCount },
                {
                  id: "SAFE",
                  label: "Safe mode",
                  count: safeCount,
                  hint: "A low-power survival state where the satellite turns off payload systems and only listens for ground commands.",
                },
                { id: "STOWED", label: "Not deployed", count: stowedCount },
              ] as const
            ).map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onFilterChange(item.id)}
                  className={`sx-btn sx-btn--sm flex items-center justify-between px-3 min-h-[34px] ${
                    active
                      ? "sx-btn--filled"
                      : "sx-btn--quiet border border-[var(--sx-hairline)]"
                  }`}
                >
                  <span className="inline-flex items-center truncate">
                    {item.label}
                    {"hint" in item && item.hint && <HelpHint text={item.hint} />}
                  </span>
                  <span
                    className={`text-[11px] px-1.5 rounded-full shrink-0 ml-1 ${
                      active ? "bg-black/15 text-black" : "text-[var(--sx-text-3)]"
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Glass>

      {/* 2. Fleet List inside ONE glass card */}
      <Glass noPadding className="overflow-hidden">
        {filteredSats.length === 0 ? (
          <div className="p-4 text-center sx-caption">
            No satellites match filter "{filter}".
          </div>
        ) : (
          <div className="divide-y divide-[var(--sx-hairline)]">
            {filteredSats.map((sat) => {
              const isSelected = selectedId === sat.node_id;
              const tone = stateTone(sat.state);
              const score = getBestLinkScore(sat.node_id);
              const batV = sat.battery_v ?? 7.4;
              const batPct = Math.max(
                0,
                Math.min(100, Math.round(((batV - 6.0) / (8.4 - 6.0)) * 100)),
              );

              return (
                <div
                  key={sat.node_id}
                  onClick={() => onSelect(isSelected ? null : sat.node_id)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? "bg-[var(--sx-surface-2)]"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  {/* Left satellite SVG icon */}
                  <div className="shrink-0 pt-0.5">
                    <SatIcon
                      size={40}
                      color="white"
                    />
                  </div>

                  {/* Right details */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    {/* Name and State */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-[family-name:var(--font-display)] text-[13px] font-bold capitalize text-white truncate">
                        {sat.display_name || sat.node_id}
                      </span>
                      <span className="sx-status shrink-0" data-tone={tone}>
                        {formatSatState(sat.state)}
                        {sat.state === "SAFE" && (
                          <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
                        )}
                      </span>
                    </div>

                    {/* Subline: Orbit & position, Altitude */}
                    <div className="sx-caption flex items-center justify-between">
                      <span>
                        Orbit {sat.plane}, slot {sat.slot}
                      </span>
                      <span>525 km</span>
                    </div>

                    {/* Next ground pass countdown */}
                    <div className="flex items-center justify-between sx-caption">
                      <span className="text-[var(--sx-text-3)]">
                        {sat.next_downlink_start ? "Next pass" : "Ground pass"}
                      </span>
                      <span className="sx-num text-white tabular-nums">
                        {formatCountdown(sat.next_downlink_start, now)}
                      </span>
                    </div>

                    {/* Two metrics: Link quality & Battery */}
                    <div className="flex flex-col gap-1.5 pt-0.5">
                      {/* Link quality */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between sx-caption">
                          <span className="text-[var(--sx-text-3)] inline-flex items-center">
                            Link quality
                            <HelpHint text="Expected radio signal strength and packet success rate for this link." />
                          </span>
                          <span className="sx-num text-white tabular-nums">
                            {score}%
                          </span>
                        </div>
                        <DashedBar
                          value={score}
                          segments={10}
                          fillColor="rgba(255, 255, 255, 0.7)"
                        />
                      </div>

                      {/* Battery */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between sx-caption">
                          <span className="text-[var(--sx-text-3)]">Battery</span>
                          <span className="sx-num text-white tabular-nums">
                            {batPct}% ({batV.toFixed(2)} V)
                          </span>
                        </div>
                        <DashedBar
                          value={batPct}
                          segments={10}
                          fillColor={batPct < 30 ? "var(--sx-orange)" : "rgba(255, 255, 255, 0.7)"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Glass>
    </div>
  );
}

