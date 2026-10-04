import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { SectionLabel } from "./SectionLabel";

type Step = { caption: string; title: string; body: string; sql: string; art: Kind };
type Kind = "scan" | "tree" | "hop" | "dish" | "rows";

const STEPS: Step[] = [
  {
    caption: "CAPTURED",
    title: "An image is captured",
    body: "SomaiyaSat paints an SSTV frame of the Earth's limb and queues it. The packet row and its sstv_image subtype row are written together — one supertype, one specialisation.",
    sql: "INSERT INTO packet (origin_sat, mode, size_bytes)\nVALUES ('SAT-A3', 'SSTV', 41216)\nRETURNING packet_id;",
    art: "scan",
  },
  {
    caption: "DECIDED",
    title: "The router decides",
    body: "A decision tree stored as rows walks battery, link score, contact time and queue depth. A watchdog checks five safety rules and can overrule the model.",
    sql: "SELECT action, path\nFROM ai_decide(\n  features_for_satellite('SAT-A3'));",
    art: "tree",
  },
  {
    caption: "RELAYED",
    title: "It hops satellite to satellite",
    body: "No station below. A recursive query chains time-ordered inter-satellite contacts and finds the earliest arrival at any ground station.",
    sql: "SELECT explanation\nFROM cgr_routes('SAT-A3', now(), 41216);\n-- WITH RECURSIVE … CYCLE node",
    art: "hop",
  },
  {
    caption: "DELIVERED",
    title: "It reaches the ground",
    body: "Inside the pass budget the frame goes down to the dish. Housekeeping commits first; the rest sits behind a savepoint so a failure never loses telemetry.",
    sql: "SELECT stage, status\nFROM execute_pass('SAT-B2', 412, false);",
    art: "dish",
  },
  {
    caption: "RECORDED",
    title: "Everything is on the record",
    body: "Triggers write every state change, decision and telecommand to the audit log, so each step of this story can be replayed from PostgreSQL alone.",
    sql: "SELECT op, table_name, changed_at\nFROM audit_log\nORDER BY audit_id DESC LIMIT 3;",
    art: "rows",
  },
];

/** White line art; strokes draw themselves in when the box becomes active. */
function Art({ kind, active, size }: { kind: Kind; active: boolean; size: "lg" | "sm" }) {
  const s = active ? "#ffffff" : "rgba(255,255,255,0.45)";
  const blue = "#3d5bff";
  const draw = active && size === "lg" ? "draw-in" : "";
  const common = { fill: "none", strokeWidth: size === "lg" ? 1.4 : 2.2, vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      {kind === "scan" && (
        <g>
          <rect x="40" y="38" width="120" height="90" stroke={s} {...common} pathLength={1} className={draw} />
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1="46" x2={46 + (i < 6 ? 108 : 108 - (i - 5) * 30)} y1={48 + i * 9} y2={48 + i * 9} stroke={i % 3 === 0 ? blue : s} {...common} opacity={0.7} pathLength={1} className={draw} style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
          <path d="M20 168 Q100 132 180 168" stroke={s} {...common} pathLength={1} className={draw} />
          <path d="M20 180 Q100 144 180 180" stroke={s} {...common} opacity={0.4} pathLength={1} className={draw} />
        </g>
      )}
      {kind === "tree" && (
        <g>
          {[
            ["100,30", "60,80"],
            ["100,30", "140,80"],
            ["60,80", "36,130"],
            ["60,80", "84,130"],
            ["140,80", "116,130"],
            ["140,80", "164,130"],
            ["116,130", "116,170"],
          ].map(([a, b], i) => {
            const [x1, y1] = a.split(",").map(Number);
            const [x2, y2] = b.split(",").map(Number);
            const onPath = i === 1 || i === 4 || i === 6;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={onPath ? blue : s} {...common} pathLength={1} className={draw} style={{ animationDelay: `${i * 0.12}s` }} />;
          })}
          {[
            [100, 30],
            [60, 80],
            [140, 80],
            [36, 130],
            [84, 130],
            [116, 130],
            [164, 130],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="7" stroke={i === 0 || i === 2 || i === 5 ? blue : s} {...common} fill="#000" />
          ))}
          <rect x="100" y="166" width="32" height="12" stroke={blue} {...common} />
        </g>
      )}
      {kind === "hop" && (
        <g>
          {[40, 100, 160].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 1 ? 52 : 70})`}>
              <rect x="-9" y="-14" width="18" height="28" stroke={s} {...common} />
              <rect x="-40" y="-7" width="26" height="14" stroke={s} {...common} opacity={0.7} />
              <rect x="14" y="-7" width="26" height="14" stroke={s} {...common} opacity={0.7} />
            </g>
          ))}
          <line x1="49" y1="70" x2="91" y2="52" stroke={s} {...common} strokeDasharray="4 4" />
          <line x1="109" y1="52" x2="151" y2="70" stroke={s} {...common} strokeDasharray="4 4" />
          <line x1="160" y1="84" x2="150" y2="160" stroke={s} {...common} strokeDasharray="4 4" />
          <path d="M14 170 Q100 140 186 170" stroke={s} {...common} />
          <rect x="145" y="152" width="10" height="10" stroke={s} {...common} />
          {active && size === "lg" && (
            <circle r="5" fill="#ff3b4f">
              <animateMotion dur="2.6s" repeatCount="indefinite" path="M40 70 L100 52 L160 70 L150 157" />
            </circle>
          )}
          {!active && <circle cx="100" cy="52" r="4" fill="#ff3b4f" />}
        </g>
      )}
      {kind === "dish" && (
        <g>
          <path d="M14 168 Q100 132 186 168" stroke={s} {...common} pathLength={1} className={draw} />
          <path d="M14 182 Q100 146 186 182" stroke={s} {...common} opacity={0.4} pathLength={1} className={draw} />
          <path d="M112 128 Q132 98 160 104" stroke={s} {...common} pathLength={1} className={draw} />
          <line x1="136" y1="112" x2="136" y2="146" stroke={s} {...common} />
          <rect x="44" y="30" width="22" height="30" stroke={s} {...common} />
          {[0, 1, 2].map((k) => (
            <line key={k} x1="58" y1="62" x2={124 + k * 10} y2={106 + k * 4} stroke={blue} {...common} strokeDasharray="5 4" pathLength={1} className={draw} style={{ animationDelay: `${0.2 + k * 0.15}s` }} />
          ))}
        </g>
      )}
      {kind === "rows" && (
        <g>
          <rect x="30" y="34" width="140" height="132" stroke={s} {...common} />
          <line x1="30" y1="58" x2="170" y2="58" stroke={s} {...common} />
          {[0, 1, 2, 3].map((r) => (
            <g key={r} className={active && size === "lg" ? "row-in" : ""} style={{ animationDelay: `${r * 0.18}s` }}>
              <line x1="30" x2="170" y1={84 + r * 22} y2={84 + r * 22} stroke={s} {...common} opacity={0.35} />
              <rect x="40" y={66 + r * 22} width="38" height="10" stroke={r === 0 ? blue : s} {...common} />
              <rect x="88" y={66 + r * 22} width="70" height="10" stroke={s} {...common} opacity={0.6} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * Pinned stepper: one large active box with its text beside it, and a strip
 * of five small boxes underneath that shows where you are in the story.
 */
export function PacketStepper() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: "+=300%",
        pin: true,
        onUpdate: (self) => setActive(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))),
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const step = STEPS[active];
  return (
    <section className="border-t border-white/10" style={{ background: "#000" }}>
      <div ref={root} className="mx-auto flex min-h-screen max-w-[1180px] flex-col justify-center px-6 py-16">
        <div className="flex items-end justify-between">
          <SectionLabel>LIFE OF A PACKET</SectionLabel>
          <span className="font-mono text-[11px] tracking-[0.08em] text-[#5f6f93]">
            {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        <div className="mt-10 grid items-center gap-10 md:grid-cols-[minmax(0,420px)_1fr] md:gap-16">
          <div className="relative aspect-square w-full max-w-[420px] border border-white/80">
            <span className="font-mono absolute left-3 top-3 text-[10px] tracking-[0.1em] text-[#5f6f93]">{step.caption}</span>
            <div key={active} className="absolute inset-8">
              <Art kind={step.art} active size="lg" />
            </div>
          </div>
          <div key={`t${active}`} className="fade-step max-w-[520px]">
            <h3 className="font-light text-white" style={{ fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
              {step.title}
            </h3>
            <p className="mt-4 text-[16px] leading-relaxed text-[#9aa3b8]">{step.body}</p>
            <pre className="font-mono mt-6 overflow-x-auto border border-white/15 bg-[#05070d] p-4 text-[12.5px] leading-relaxed text-[#dfe6f5]">
              {step.sql}
            </pre>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-5 gap-3 md:max-w-[620px]">
          {STEPS.map((s, i) => (
            <div key={s.caption} className="flex flex-col gap-2">
              <div
                className="aspect-square border transition-colors duration-300"
                style={{ borderColor: i === active ? "#fff" : "rgba(255,255,255,0.18)", opacity: i <= active ? 1 : 0.5 }}
              >
                <div className="h-full w-full p-2">
                  <Art kind={s.art} active={i === active} size="sm" />
                </div>
              </div>
              <span className="font-mono text-[10px] tracking-[0.08em]" style={{ color: i === active ? "#fff" : "#5f6f93" }}>
                {s.caption}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
