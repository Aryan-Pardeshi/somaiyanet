// globe logic adapted from lakshyamody/dbmsproj (app/components/globe_template.html)
// /ops page: full-viewport globe on the left, ops rail on the right.
// The orchestrator wires the /ops route; this file owns the layout only.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

  if (data.unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#1f1f24] bg-[#0a0a0c] p-8 text-center">
          <p className="mono-label text-[#3d6bff]">[ console ]</p>
          <h1 className="mt-4 text-xl font-semibold text-white">
            Pick a console profile first
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#8a8a93]">
            Mission ops runs every query as a real Postgres role. Choose who is
            on console and the globe lights up with their permissions.
          </p>
          <Link
            to="/console"
            className="mono-label mt-6 inline-block rounded-full bg-[#3d6bff] px-5 py-2.5 text-white"
          >
            who&apos;s on console? →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-[#f5f5f7] md:h-screen md:overflow-hidden">
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <div className="relative h-[60vh] w-full md:h-auto md:min-h-0 md:flex-1">
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
            <span className="mono-label absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-dashed border-[#ffb020]/60 bg-black/70 px-3 py-1 text-[#ffb020]">
              mock data
            </span>
          )}
        </div>
        <aside className="w-full border-t border-[#1f1f24] bg-black p-4 md:max-h-full md:w-[340px] md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0">
          <SideRail
            kpis={data.kpis}
            alerts={data.alerts}
            telemetry={data.telemetry}
            decisions={data.decisions}
          />
          <details className="mt-4 rounded-lg border border-[#1f1f24] bg-[#0a0a0c] p-3">
            <summary className="mono-label cursor-pointer text-[#8a8a93]">
              [ sql under the hood ]
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="mono-label rounded-full bg-[#3d6bff]/15 px-2 py-0.5 text-[#8fa8ff]">exp · ops</span>
              <span className="mono-label rounded-full bg-white/5 px-2 py-0.5 text-[#8a8a93]">role: {data.role}</span>
            </div>
            {Object.entries(data.sql).map(([k, v]) => (
              <div key={k} className="mt-2">
                <p className="mono-label text-[#3d6bff]">{k}</p>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#8a8a93]">
                  {v}
                </pre>
              </div>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}
