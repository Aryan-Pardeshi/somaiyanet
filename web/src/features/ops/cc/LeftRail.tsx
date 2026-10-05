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

function stateColor(state: string): string {
  switch (state) {
    case "NOMINAL":
      return "#7ee2b8";
    case "SAFE":
      return "#f5a524";
    case "CRITICAL":
      return "#ff3b4f";
    case "STOWED":
    case "DEPLOYED":
    case "COMMISSIONING":
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
  fillColor = "#3d5bff",
}: {
  value: number;
  max?: number;
  segments?: number;
  fillColor?: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const activeCount = Math.round(ratio * segments);

  return (
    <div className="flex items-center gap-[2px] h-1.5 w-full">
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
        <div
          className="flex items-center justify-between px-3.5 py-2 rounded-full border border-white/10 shadow-lg text-[11.5px] font-mono"
          style={{
            backgroundColor: "rgba(10, 14, 28, 0.85)",
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))",
            backdropFilter: "blur(22px) saturate(170%)",
            WebkitBackdropFilter: "blur(22px) saturate(170%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <span className="text-[#dfe6f5] font-semibold truncate flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#7ee2b8] shrink-0" />
            <span className="truncate">{roleTitle}</span>
          </span>
          <button
            type="button"
            onClick={() => setRoleExpanded((v) => !v)}
            className="text-[10.5px] text-[#3d5bff] hover:text-white uppercase tracking-wider transition-colors cursor-pointer shrink-0 ml-2 font-semibold"
            aria-expanded={roleExpanded}
          >
            {roleExpanded ? "Close" : "What can I do?"}
          </button>
        </div>
        {roleExpanded && (
          <div className="rounded-xl overflow-hidden">
            <RoleHeader note="Live constellation operations and ground pass scheduling." />
          </div>
        )}
      </div>

      {/* 1. ONE Satellites card (merges title panel + filter chips) */}
      <Glass>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold tracking-wider text-[#dfe6f5]">
              Satellites ({sats.length})
            </span>
          </div>

          {/* Segmented bar: one segment per satellite */}
          <div className="flex items-center gap-[3px] h-2 w-full">
            {sats.map((sat) => (
              <div
                key={sat.node_id}
                title={`${sat.display_name || sat.node_id} (${formatSatState(sat.state)})`}
                className="flex-1 h-full rounded-[1px] transition-all"
                style={{ backgroundColor: stateColor(sat.state) }}
              />
            ))}
          </div>

          {/* Legend line: "2 healthy · 1 in safe mode · 1 not yet deployed" (no stray commas) */}
          <div className="font-mono text-[11px] text-[#8b96b0] flex flex-wrap items-center gap-x-1.5 leading-snug">
            <span className="text-[#7ee2b8]">{nominalCount} healthy</span>
            {safeCount > 0 && (
              <>
                <span>·</span>
                <span className="text-[#f5a524] inline-flex items-center">
                  {safeCount} in safe mode
                  <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
                </span>
              </>
            )}
            {stowedCount > 0 && (
              <>
                <span>·</span>
                <span className="text-[#8b96b0]">
                  {stowedCount} not yet deployed
                </span>
              </>
            )}
          </div>

          {/* Filter chips directly under it */}
          <div className="grid grid-cols-2 gap-1.5 pt-2.5 border-t border-white/[0.08]">
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
                  className={`flex items-center justify-between px-3 py-1.5 rounded-full text-[11px] font-mono tracking-wider transition-all cursor-pointer ${
                    active
                      ? "bg-[#3d5bff]/85 text-white font-semibold shadow-[0_0_12px_rgba(61,91,255,0.4)] border border-[#3d5bff]"
                      : "bg-white/[0.04] text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.08] border border-white/10"
                  }`}
                >
                  <span className="inline-flex items-center truncate">
                    {item.label}
                    {"hint" in item && item.hint && <HelpHint text={item.hint} />}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 ml-1 ${
                      active ? "bg-white/20 text-white" : "text-[#8b96b0] bg-white/[0.04]"
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
          <div className="p-4 text-center font-mono text-xs text-[#8b96b0]">
            No satellites match filter "{filter}".
          </div>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {filteredSats.map((sat) => {
              const isSelected = selectedId === sat.node_id;
              const statusCol = stateColor(sat.state);
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
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? "border-l-4 border-l-[#3d5bff] bg-white/[0.09] shadow-[inset_0_0_24px_rgba(61,91,255,0.08)]"
                      : "border-l-4 border-l-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Left satellite SVG icon */}
                  <div className="shrink-0 flex items-center justify-center pt-0.5">
                    <SatIcon
                      size={44}
                      color={isSelected ? "#7fb2ff" : "#dfe6f5"}
                      className={sat.state === "SAFE" ? "motion-safe:animate-pulse" : ""}
                    />
                  </div>

                  {/* Right details */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    {/* Name and State Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[13px] font-semibold tracking-wide text-[#dfe6f5] truncate">
                        {sat.display_name || sat.node_id}
                      </span>
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border shrink-0 inline-flex items-center"
                        style={{
                          color: statusCol,
                          borderColor: `color-mix(in srgb, ${statusCol} 35%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${statusCol} 12%, transparent)`,
                        }}
                      >
                        {formatSatState(sat.state)}
                        {sat.state === "SAFE" && (
                          <HelpHint text="A low-power survival state where the satellite turns off payload systems and only listens for ground commands." />
                        )}
                      </span>
                    </div>

                    {/* Subline: Orbit & position, Altitude */}
                    <div className="font-mono text-[10px] text-[#8b96b0] flex items-center justify-between">
                      <span>
                        Orbit {sat.plane}, position {sat.slot}
                      </span>
                      <span>525 km up</span>
                    </div>

                    {/* Next ground pass countdown */}
                    <div className="flex items-center justify-between font-mono text-[10px] bg-black/40 px-2.5 py-1 rounded-md border border-white/5">
                      <span className="text-[#8b96b0]">
                        {sat.next_downlink_start ? "Next ground pass in" : "Ground pass"}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          sat.next_downlink_start
                            ? "text-[#7ee2b8]"
                            : "text-[#8b96b0]"
                        }`}
                      >
                        {formatCountdown(sat.next_downlink_start, now)}
                      </span>
                    </div>

                    {/* Two dashed progress bars: Link quality & Battery */}
                    <div className="flex flex-col gap-1 pt-0.5">
                      {/* Link quality */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between font-mono text-[9px]">
                          <span className="text-[#8b96b0] inline-flex items-center">
                            Link quality
                            <HelpHint text="Expected radio signal strength and packet success rate for this link." />
                          </span>
                          <span className="text-[#dfe6f5] tabular-nums font-medium">
                            {score}%
                          </span>
                        </div>
                        <DashedBar
                          value={score}
                          segments={10}
                          fillColor="#3d5bff"
                        />
                      </div>

                      {/* Battery */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between font-mono text-[9px]">
                          <span className="text-[#8b96b0]">Battery</span>
                          <span className="text-[#dfe6f5] tabular-nums font-medium">
                            {batPct}% ({batV.toFixed(2)} V)
                          </span>
                        </div>
                        <DashedBar
                          value={batPct}
                          segments={10}
                          fillColor={batPct < 30 ? "#f5a524" : "#3d5bff"}
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
