import { SectionLabel } from "./SectionLabel";

type Constraint = {
  n: string;
  title: string;
  desc: string;
  art: "window" | "power" | "audit";
};

const ROWS: Constraint[] = [
  {
    n: "01",
    title: "Minutes-long contact windows",
    desc: "A downlink pass lasts only minutes per day. The onboard router must schedule telemetry, images, or digital voice before the pass closes — executing contact graph routing over inter-satellite links and ground stations in SQL.",
    art: "window",
  },
  {
    n: "02",
    title: "Sub-one-watt power budget",
    desc: "Transmitting images is power-intensive; low battery automatically restricts transmission to voice, then safe mode. The decision-tree router and safety watchdog rules evaluate as rows in PostgreSQL.",
    art: "power",
  },
  {
    n: "03",
    title: "Critical telemetry is never dropped",
    desc: "Spacecraft health telemetry, state transitions, telecommands, and manual overrides are audited by database triggers. Row-level security and column permissions enforce authorization.",
    art: "audit",
  },
];

function ConstraintIcon({ kind }: { kind: "window" | "power" | "audit" }) {
  return (
    <svg viewBox="0 0 32 32" className="size-6 text-white/70" fill="none" stroke="currentColor" strokeWidth={1.2}>
      {kind === "window" && (
        <>
          <circle cx="16" cy="16" r="13" strokeDasharray="3 3" opacity={0.4} />
          <path d="M 16 3 A 13 13 0 0 1 29 16" stroke="#3d5bff" strokeWidth={1.5} />
          <line x1="16" y1="16" x2="16" y2="7" />
          <line x1="16" y1="16" x2="23" y2="16" stroke="#3d5bff" />
          <circle cx="16" cy="16" r="1.5" fill="#fff" />
        </>
      )}
      {kind === "power" && (
        <>
          <rect x="6" y="9" width="18" height="14" rx="2" />
          <path d="M 24 13 L 26 13 L 26 19 L 24 19" />
          <line x1="11" y1="13" x2="11" y2="19" stroke="#3d5bff" strokeWidth={1.5} />
          <line x1="15" y1="13" x2="15" y2="19" stroke="#3d5bff" strokeWidth={1.5} />
          <line x1="19" y1="13" x2="19" y2="19" opacity={0.3} />
        </>
      )}
      {kind === "audit" && (
        <>
          <rect x="7" y="6" width="18" height="20" rx="1.5" />
          <line x1="11" y1="11" x2="21" y2="11" stroke="#3d5bff" />
          <line x1="11" y1="16" x2="21" y2="16" />
          <line x1="11" y1="21" x2="17" y2="21" opacity={0.6} />
          <circle cx="21" cy="21" r="1.5" fill="#3d5bff" />
        </>
      )}
    </svg>
  );
}

/** Numbered hairline rows: label right, light Geist headline left, plain English. */
export function Constraints() {
  return (
    <section className="border-t border-white/10 py-28" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2
            className="max-w-[18ch] font-light text-white"
            style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Minutes of contact. Milliwatts of power. Zero room for error.
          </h2>
          <SectionLabel>CONSTRAINTS</SectionLabel>
        </div>
        <div className="mt-12 border-t border-white/10">
          {ROWS.map((row) => (
            <div
              key={row.n}
              className="grid items-start gap-4 border-b border-white/10 py-8 md:grid-cols-[60px_40px_1fr_1.5fr]"
            >
              <span className="font-mono text-[12px]" style={{ color: "#3d5bff", letterSpacing: "0.08em" }}>
                [{row.n}]
              </span>
              <div className="hidden md:block">
                <ConstraintIcon kind={row.art} />
              </div>
              <h3 className="text-[20px] font-light text-white">{row.title}</h3>
              <p className="max-w-[62ch] text-[15px] leading-relaxed text-[#9aa3b8]">
                {row.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
