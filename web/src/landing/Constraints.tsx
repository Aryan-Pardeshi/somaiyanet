import { SectionLabel } from "./SectionLabel";

const ROWS: Array<[string, string, string]> = [
  [
    "01",
    "Minutes-long passes",
    "A downlink lasts minutes per day. The router must pick TT&C, SSTV or voice before the window closes — contact graph routing over ISL and downlink contacts, all in SQL.",
  ],
  [
    "02",
    "A sub-1 W budget",
    "SSTV is power-hungry; a low battery means voice only, then safe mode. The decision-tree router and its watchdog rules live in Postgres as dt_node rows.",
  ],
  [
    "03",
    "Housekeeping is never dropped",
    "Telemetry, state transitions, telecommands and every override are audited by triggers. RLS and column privileges decide who may see or sign what.",
  ],
];

/** Numbered hairline rows: label right, headline left. */
export function Constraints() {
  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-[14ch] font-light text-white" style={{ fontSize: 40, lineHeight: 1.15 }}>
            Minutes of contact. Milliwatts of power. Zero room for error.
          </h2>
          <SectionLabel>WHY IT IS HARD</SectionLabel>
        </div>
        <div className="mt-12 border-t border-white/10">
          {ROWS.map(([n, title, desc]) => (
            <div
              key={n}
              className="grid gap-4 border-b border-white/10 py-8 md:grid-cols-[80px_1fr_1.4fr]"
            >
              <span className="font-mono text-[12px]" style={{ color: "var(--royal)", letterSpacing: "0.08em" }}>
                [{n}]
              </span>
              <h3 className="text-[20px] font-light text-white">{title}</h3>
              <p className="max-w-[62ch] text-[15px] leading-relaxed" style={{ color: "#9aa3b8" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
