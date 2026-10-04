import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { SectionLabel } from "./SectionLabel";

const STEPS: Array<{
  caption: string;
  title: string;
  body: string;
  sql: string;
  art: string;
}> = [
  {
    caption: "CAPTURED",
    title: "Captured",
    body: "SomaiyaSat captures an SSTV frame and queues it with its mode and size. TT&C always jumps the queue; SSTV waits for power and a window.",
    sql: "INSERT INTO packet … RETURNING packet_id",
    art: "scan",
  },
  {
    caption: "DECIDED",
    title: "Decided",
    body: "The in-database decision tree walks battery, link score, contact seconds and queue depth. The watchdog can veto the AI and fall back to the rule action.",
    sql: "SELECT * FROM ai_decide(…)",
    art: "tree",
  },
  {
    caption: "RELAYED",
    title: "Relayed",
    body: "No station in view? Contact-graph routing hops the packet across ISL links toward the earliest downlink, each hop a row in route_hop.",
    sql: "WITH RECURSIVE hops … CYCLE",
    art: "hop",
  },
  {
    caption: "DELIVERED",
    title: "Delivered",
    body: "Inside the pass budget the queued frames go down to the station dish. Delivery marks the packet DELIVERED with station and timestamp.",
    sql: "DELIVERED → route_hop",
    art: "dish",
  },
  {
    caption: "RECORDED",
    title: "Recorded",
    body: "Triggers append the audit trail — state changes, decisions, telecommands — so the viva can replay every step from Postgres alone.",
    sql: "audit_log ← trigger",
    art: "rows",
  },
];

function Art({ kind, active }: { kind: string; active: boolean }) {
  const cls = active ? "#ffffff" : "#5f6f93";
  const blue = "var(--royal)";
  if (kind === "scan")
    return (
      <svg viewBox="0 0 120 80" className="h-20 w-full">
        <path d="M4 52 Q60 30 116 52" fill="none" stroke={cls} strokeWidth="1.5" />
        <path d="M4 60 Q60 38 116 60" fill="none" stroke={cls} strokeWidth="1" opacity="0.5" />
        {[14, 26, 38].map((y) => (
          <line key={y} x1="20" y1={y} x2="100" y2={y} stroke={active ? blue : cls} strokeWidth="1" opacity={active ? 0.9 : 0.4} />
        ))}
      </svg>
    );
  if (kind === "tree")
    return (
      <svg viewBox="0 0 120 80" className="h-20 w-full">
        <circle cx="60" cy="12" r="4" fill="none" stroke={cls} strokeWidth="1.5" />
        <line x1="60" y1="16" x2="34" y2="38" stroke={cls} strokeWidth="1.5" />
        <line x1="60" y1="16" x2="86" y2="38" stroke={active ? blue : cls} strokeWidth="1.5" />
        <circle cx="34" cy="44" r="5" fill="none" stroke={cls} strokeWidth="1.5" />
        <circle cx="86" cy="44" r="5" fill="none" stroke={active ? blue : cls} strokeWidth="1.5" />
        <line x1="86" y1="49" x2="86" y2="64" stroke={active ? blue : cls} strokeWidth="1.5" />
      </svg>
    );
  if (kind === "hop")
    return (
      <svg viewBox="0 0 120 80" className="h-20 w-full">
        {[24, 60, 96].map((x) => (
          <rect key={x} x={x - 8} y="22" width="16" height="14" fill="none" stroke={cls} strokeWidth="1.5" />
        ))}
        <line x1="32" y1="29" x2="52" y2="29" stroke={cls} strokeWidth="1" strokeDasharray="4 3" />
        <line x1="68" y1="29" x2="88" y2="29" stroke={cls} strokeWidth="1" strokeDasharray="4 3" />
        <line x1="96" y1="36" x2="96" y2="62" stroke={cls} strokeWidth="1" strokeDasharray="4 3" />
        <circle cx={active ? 78 : 60} cy="29" r="4" fill="var(--somaiya)" />
        <rect x="88" y="58" width="10" height="10" fill="none" stroke={cls} strokeWidth="1.5" />
      </svg>
    );
  if (kind === "dish")
    return (
      <svg viewBox="0 0 120 80" className="h-20 w-full">
        <path d="M4 60 Q60 44 116 60" fill="none" stroke={cls} strokeWidth="1.5" />
        <path d="M78 62 A20 20 0 0 1 108 48" fill="none" stroke={cls} strokeWidth="1.5" />
        <line x1="40" y1="20" x2="88" y2="54" stroke={active ? blue : cls} strokeWidth="1.5" strokeDasharray="4 3" />
        <rect x="32" y="12" width="14" height="12" fill="none" stroke={cls} strokeWidth="1.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-full">
      {[16, 34, 52].map((y, i) => (
        <g key={y} opacity={active || i === 0 ? 1 : 0.35}>
          <line x1="16" y1={y} x2="104" y2={y} stroke={cls} strokeWidth="1" />
          <rect x="16" y={y - 6} width="30" height="4" fill="none" stroke={cls} strokeWidth="1" />
        </g>
      ))}
    </svg>
  );
}

/** Bordered-box stepper, pinned: one box active at a time. */
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
        end: "+=250%",
        pin: true,
        scrub: 0.4,
        onUpdate: (self) => {
          setActive(Math.min(4, Math.floor(self.progress * 5)));
        },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const step = STEPS[active];
  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div ref={root} className="mx-auto max-w-[1200px] px-6">
        <SectionLabel>LIFE OF A PACKET</SectionLabel>
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="flex flex-wrap gap-3">
            {STEPS.map((s, i) => (
              <div key={s.caption} className="flex flex-col items-center">
                <div
                  className="flex items-center justify-center border p-3 transition-all"
                  style={{
                    width: 150,
                    height: 150,
                    borderColor: i === active ? "#fff" : "rgba(255,255,255,0.2)",
                    opacity: i === active ? 1 : 0.3,
                    transform: i === active ? "scale(1.06)" : "none",
                  }}
                >
                  <Art kind={s.art} active={i === active} />
                </div>
                <span className="font-mono mt-2 text-[11px] uppercase" style={{ color: "#9aa3b8", letterSpacing: "0.08em" }}>
                  {s.caption}
                </span>
              </div>
            ))}
          </div>
          <div key={active} className="border-l border-white/10 pl-6">
            <h3 className="text-[24px] font-light text-white">{step.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#9aa3b8" }}>
              {step.body}
            </p>
            <p className="font-mono mt-4 border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white">
              {step.sql}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
