
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
    <svg viewBox="0 0 32 32" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      {kind === "window" && (
        <>
          <circle cx="16" cy="16" r="13" strokeDasharray="3 3" opacity={0.4} />
          <path d="M 16 3 A 13 13 0 0 1 29 16" />
          <line x1="16" y1="16" x2="16" y2="7" />
          <line x1="16" y1="16" x2="23" y2="16" />
          <circle cx="16" cy="16" r="1.5" fill="#fff" stroke="none" />
        </>
      )}
      {kind === "power" && (
        <>
          <rect x="6" y="9" width="18" height="14" rx="2" />
          <path d="M 24 13 L 26 13 L 26 19 L 24 19" />
          <line x1="11" y1="13" x2="11" y2="19" />
          <line x1="15" y1="13" x2="15" y2="19" />
          <line x1="19" y1="13" x2="19" y2="19" opacity={0.3} />
        </>
      )}
      {kind === "audit" && (
        <>
          <rect x="7" y="6" width="18" height="20" rx="1.5" />
          <line x1="11" y1="11" x2="21" y2="11" />
          <line x1="11" y1="16" x2="21" y2="16" />
          <line x1="11" y1="21" x2="17" y2="21" opacity={0.6} />
          <circle cx="21" cy="21" r="1.5" fill="#fff" stroke="none" />
        </>
      )}
    </svg>
  );
}

/** Three hard limits: title, then three spaced columns with minimal white icons. */
export function Constraints() {
  return (
    <section className="sx-section" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="sx-h2 max-w-[20ch]">
          Minutes of contact. Milliwatts of power. Zero room for error.
        </h2>
        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
          {ROWS.map((row) => (
            <div key={row.n} className="min-w-0">
              <ConstraintIcon kind={row.art} />
              <p className="sx-eyebrow mt-6">{row.n}</p>
              <h3 className="sx-h3 mt-3">{row.title}</h3>
              <p className="sx-body mt-3">{row.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
