// /ops page: full-viewport globe on the left, ops rail on the right.
// Rendered inside AppShell (which owns the sidebar, profile guard and the
// "SQL under the hood" drawer); this file owns the ops layout only.
import { useMemo, useRef, useState } from "react";
import { OpsGlobe, type OpsGlobeHandle } from "@/features/ops/OpsGlobe";
import { SideRail } from "@/features/ops/SideRail";
import { useOpsData, type TelemetryEvent } from "@/features/ops/api";

function seedHistories(
  sats: Array<{ node_id: string; battery_v: number | null }>,
  telemetry: TelemetryEvent[],
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of sats) {
    // A gentle synthetic arc around the pinned battery so the sparkline
    // has shape before the stream fills it with real points.
    const base = s.battery_v ?? 7.4;
    out[s.node_id] = Array.from({ length: 24 }, (_, i) => {
      const w = Math.sin(i / 3.1) * 0.12 + (i % 5) * 0.008;
      return Math.round((base + w) * 100) / 100;
    });
  }
  for (const t of telemetry) {
    const arr = out[t.sat_id] ?? (out[t.sat_id] = []);
    arr.push(t.battery_v);
    if (arr.length > 48) arr.splice(0, arr.length - 48);
  }
  return out;
}

export default function Ops() {
  const data = useOpsData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const globeRef = useRef<OpsGlobeHandle>(null);
  const histories = useMemo(
    () => seedHistories(data.sats, data.telemetry),
    [data.sats, data.telemetry],
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[var(--space)] text-[var(--text)] md:h-[calc(100vh-3.5rem)] md:overflow-hidden">
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <div className="relative h-[60vh] w-full bg-black md:h-auto md:min-h-0 md:flex-1">
          <OpsGlobe
            ref={globeRef}
            sats={data.sats}
            stations={data.stations}
            contacts={data.contacts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            histories={histories}
          />
          {data.mock && (
            <span className="absolute left-4 top-4 z-30 rounded-full border border-dashed border-[var(--warn)]/60 bg-[var(--navy-900)]/80 px-3 py-1 text-[12px] text-[var(--warn)] backdrop-blur-xl">
              Mock data, backend offline
            </span>
          )}
        </div>
        <aside className="w-full border-t border-[var(--line)] bg-[var(--space)] p-4 md:max-h-full md:w-[360px] md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0">
          <SideRail
            kpis={data.kpis}
            alerts={data.alerts}
            telemetry={data.telemetry}
            decisions={data.decisions}
            onDemoRoute={() => globeRef.current?.playRoute([
              {
                from_node: "SAT-A1",
                to_node: "SAT-A2",
                depart_ts: new Date().toISOString(),
                arrive_ts: new Date(Date.now() + 4000).toISOString(),
                kind: "ISL",
              },
              {
                from_node: "SAT-A2",
                to_node: "SAT-A3",
                depart_ts: new Date(Date.now() + 4000).toISOString(),
                arrive_ts: new Date(Date.now() + 8000).toISOString(),
                kind: "ISL",
              },
              {
                from_node: "SAT-A3",
                to_node: "GS-BOM",
                depart_ts: new Date(Date.now() + 8000).toISOString(),
                arrive_ts: new Date(Date.now() + 12000).toISOString(),
                kind: "DOWNLINK",
              },
            ])}
          />
        </aside>
      </div>
    </div>
  );
}
