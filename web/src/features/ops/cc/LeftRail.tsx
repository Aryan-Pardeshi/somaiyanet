import { useEffect, useState } from "react";
import type { ConstellationSat, Contact } from "../api";
import { Panel } from "./Panel";
import { SatIcon } from "./SatIcon";
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

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function formatCountdown(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "no pass";
  const diff = Math.floor((new Date(iso).getTime() - nowMs) / 1000);
  if (diff <= 0) return "window open";
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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
      {/* 1. Constellation Title Panel */}
      <Panel cut={8} className="w-full">
        <div className="p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
              Constellation
            </span>
            <span className="font-mono text-[10px] tracking-wider text-[#dfe6f5]">
              {sats.length} ASSETS
            </span>
          </div>

          {/* Segmented bar: one segment per satellite */}
          <div className="flex items-center gap-[3px] h-2 w-full">
            {sats.map((sat) => (
              <div
                key={sat.node_id}
                title={`${sat.node_id} (${sat.state})`}
                className="flex-1 h-full rounded-[1px] transition-all"
                style={{ backgroundColor: stateColor(sat.state) }}
              />
            ))}
          </div>

          {/* Count line */}
          <div className="font-mono text-[11px] text-[#8b96b0] flex flex-wrap gap-x-2">
            <span className="text-[#7ee2b8]">{nominalCount} nominal</span>
            {safeCount > 0 && (
              <span className="text-[#f5a524]">, {safeCount} safe</span>
            )}
            {stowedCount > 0 && (
              <span className="text-[#8b96b0]">, {stowedCount} stowed</span>
            )}
          </div>
        </div>
      </Panel>

      {/* 2. Filter Panel (2x2 chips) */}
      <Panel cut={8} className="w-full">
        <div className="p-3 flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
            Mission filter
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { id: "ALL", label: "All", count: sats.length },
                { id: "NOMINAL", label: "Nominal", count: nominalCount },
                { id: "SAFE", label: "Safe", count: safeCount },
                { id: "STOWED", label: "Stowed", count: stowedCount },
              ] as const
            ).map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onFilterChange(item.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[11px] font-mono tracking-wider transition-all cursor-pointer ${
                    active
                      ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_8px_rgba(61,91,255,0.4)]"
                      : "bg-white/[0.03] text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.06] border border-white/5"
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`text-[10px] px-1 rounded ${
                      active ? "bg-white/20 text-white" : "text-[#8b96b0]"
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* 3. Fleet Cards Stack */}
      <div className="flex flex-col gap-2">
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
            <Panel
              key={sat.node_id}
              cut={8}
              selected={isSelected}
              onClick={() => onSelect(isSelected ? null : sat.node_id)}
              className="w-full transition-transform active:scale-[0.99]"
            >
              <div className="p-3 flex items-start gap-3">
                {/* Left satellite SVG icon */}
                <div className="shrink-0 flex items-center justify-center pt-0.5">
                  <SatIcon
                    size={48}
                    color={isSelected ? "#7fb2ff" : "#dfe6f5"}
                    className={sat.state === "SAFE" ? "animate-pulse" : ""}
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
                      className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm border shrink-0"
                      style={{
                        color: statusCol,
                        borderColor: `color-mix(in srgb, ${statusCol} 30%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${statusCol} 10%, transparent)`,
                      }}
                    >
                      {sat.state}
                    </span>
                  </div>

                  {/* Subline: Plane & slot, Altitude */}
                  <div className="font-mono text-[10px] text-[#8b96b0] flex items-center justify-between">
                    <span>
                      Plane {sat.plane}, slot {sat.slot}
                    </span>
                    <span>Alt 525 km</span>
                  </div>

                  {/* Next Downlink countdown */}
                  <div className="flex items-center justify-between font-mono text-[10px] bg-black/30 px-2 py-0.5 rounded border border-white/5">
                    <span className="text-[#8b96b0]">Pass:</span>
                    <span
                      className={`tabular-nums ${
                        sat.next_downlink_start
                          ? "text-[#7ee2b8]"
                          : "text-[#8b96b0]"
                      }`}
                    >
                      {formatCountdown(sat.next_downlink_start, now)}
                    </span>
                  </div>

                  {/* Two dashed progress bars: Signal & Battery */}
                  <div className="flex flex-col gap-1 pt-0.5">
                    {/* Signal */}
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between font-mono text-[9px]">
                        <span className="text-[#8b96b0]">Signal</span>
                        <span className="text-[#dfe6f5] tabular-nums">
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
                        <span className="text-[#dfe6f5] tabular-nums">
                          {batPct}% ({batV.toFixed(2)}V)
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
            </Panel>
          );
        })}
        {filteredSats.length === 0 && (
          <div className="p-4 text-center font-mono text-xs text-[#8b96b0] border border-dashed border-white/10 rounded-lg">
            No satellites match filter "{filter}".
          </div>
        )}
      </div>
    </div>
  );
}
