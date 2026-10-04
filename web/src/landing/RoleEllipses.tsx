import { useNavigate } from "react-router-dom";
import { SectionLabel } from "./SectionLabel";

type RoleItem = {
  name: string;
  tag: string;
  rule: string;
  angle: number;
};

const ROLES: RoleItem[] = [
  {
    name: "Mission Director",
    tag: "SYS_ADMIN",
    rule: "Full administrative control with authorization to grant privileges.",
    angle: 6,
  },
  {
    name: "Mumbai Station",
    tag: "GS_BOM",
    rule: "Telecommands restricted to line-of-sight pass windows over Mumbai.",
    angle: -4,
  },
  {
    name: "Espoo Station",
    tag: "GS_HEL",
    rule: "Telecommands restricted to line-of-sight pass windows over Espoo.",
    angle: 5,
  },
  {
    name: "Student Analyst",
    tag: "ANALYST_RO",
    rule: "Read-only access to historical telemetry, orbital passes, and public imagery.",
    angle: -5,
  },
  {
    name: "Autonomous Router",
    tag: "ORBIT_AGENT",
    rule: "In-orbit flight software permitted only to record telemetry and routing state.",
    angle: 4,
  },
];

/** Orbital ellipse cards with white line art, scoped royal hatch on hover, click → /console. */
export function RoleEllipses() {
  const nav = useNavigate();

  return (
    <section className="border-t border-white/10 py-28" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2
            className="max-w-[18ch] font-light text-white"
            style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Five operational roles. Enforced in the engine.
          </h2>
          <SectionLabel>ACCESS CONTROL</SectionLabel>
        </div>

        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#9aa3b8]">
          PostgreSQL row-level security and column privileges guarantee that ground stations and satellites only read and write data permitted by their cryptographic keys.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {ROLES.map((role) => (
            <button
              key={role.name}
              type="button"
              onClick={() => void nav("/console")}
              className="group flex flex-col items-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d5bff] focus-visible:ring-offset-4 focus-visible:ring-offset-black"
              aria-label={`Open console as ${role.name}: ${role.rule}`}
            >
              {/* Ellipse capsule */}
              <div
                className="relative flex h-[210px] w-full max-w-[160px] items-center justify-center overflow-hidden border border-white/30 transition-all duration-300 group-hover:border-[#3d5bff] group-hover:shadow-[0_0_24px_rgba(61,91,255,0.2)]"
                style={{
                  borderRadius: "50%",
                  transform: `rotate(${role.angle}deg)`,
                }}
              >
                {/* Scoped diagonal hatch fill on hover */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(61,91,255,0.18) 0, rgba(61,91,255,0.18) 3px, transparent 3px, transparent 8px)",
                  }}
                />

                {/* Subtle orbital crosshair inside */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30"
                >
                  <div className="h-full w-px bg-white/20" />
                  <div className="absolute h-px w-full bg-white/20" />
                </div>

                <div
                  className="relative z-10 px-3"
                  style={{ transform: `rotate(${-role.angle}deg)` }}
                >
                  <span className="font-mono block text-[10px] tracking-[0.1em] text-[#3d5bff]">
                    {role.tag}
                  </span>
                  <span className="mt-1 block text-[15px] font-light leading-snug text-white">
                    {role.name}
                  </span>
                </div>
              </div>

              <span className="mt-4 max-w-[180px] text-[12.5px] leading-relaxed text-[#9aa3b8] transition-colors group-hover:text-[#dfe6f5]">
                {role.rule}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
