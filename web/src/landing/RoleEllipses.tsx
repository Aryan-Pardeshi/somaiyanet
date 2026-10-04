import { useNavigate } from "react-router-dom";
import { SectionLabel } from "./SectionLabel";

const ROLES: Array<[string, string]> = [
  ["Mission Director", "everything, with GRANT OPTION"],
  ["Mumbai Station", "telecommand via GS-BOM only"],
  ["Espoo Station", "telecommand via GS-HEL only"],
  ["Student Analyst", "read-only views, no telecommand"],
  ["AI Router", "write-only sensor in space"],
];

/** Tall tilted ellipse outline cards; hover fills royal hatch, click → /console. */
export function RoleEllipses() {
  const nav = useNavigate();
  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionLabel>WHO MAY SEE IT</SectionLabel>
        <div className="mt-10 flex flex-wrap justify-center gap-5">
          {ROLES.map(([name, rule]) => (
            <button
              key={name}
              onClick={() => void nav("/console")}
              className="group flex flex-col items-center"
              aria-label={`${name}: ${rule}`}
            >
              <span
                className="flex items-center justify-center border border-white/40 transition-all group-hover:border-[var(--royal)]"
                style={{
                  width: 150,
                  height: 230,
                  borderRadius: "50%",
                  transform: "rotate(6deg)",
                }}
              >
                <span className="px-4 text-center text-[15px] font-light text-white" style={{ transform: "rotate(-6deg)" }}>
                  {name}
                </span>
                <style>{`button:hover > span { background: repeating-linear-gradient(45deg, rgba(36,66,255,0.25) 0 4px, transparent 4px 9px); }`}</style>
              </span>
              <span className="mt-3 max-w-[150px] text-center text-[12px]" style={{ color: "#9aa3b8" }}>
                {rule}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
