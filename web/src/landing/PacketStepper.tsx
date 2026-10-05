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
    sql: "INSERT INTO packet (origin_sat, mode, size_bytes)\nVALUES ('SS-1', 'SSTV', 41216)\nRETURNING packet_id;",
    art: "scan",
  },
  {
    caption: "DECIDED",
    title: "The router decides",
    body: "A decision tree stored as rows walks battery, link score, contact time and queue depth. A watchdog checks five safety rules and can overrule the model.",
    sql: "SELECT action, path\nFROM ai_decide(\n  features_for_satellite('SS-1'));",
    art: "tree",
  },
  {
    caption: "RELAYED",
    title: "It hops satellite to satellite",
    body: "No station below. A recursive query chains time-ordered inter-satellite contacts and finds the earliest arrival at any ground station.",
    sql: "SELECT explanation\nFROM cgr_routes('SS-1', now(), 41216);\n-- WITH RECURSIVE … CYCLE node",
    art: "hop",
  },
  {
    caption: "DELIVERED",
    title: "It reaches the ground",
    body: "Inside the pass budget the frame goes down to the dish. Housekeeping commits first; the rest sits behind a savepoint so a failure never loses telemetry.",
    sql: "SELECT stage, status\nFROM execute_pass('SS-3', 412, false);",
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

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/** Earth limb spanning the bottom with atmosphere line */
function EarthLimb({ stroke, strokeWidth, draw }: { stroke: string; strokeWidth: number; draw: string }) {
  return (
    <g>
      <path
        d="M -10 178 Q 100 128 210 178"
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        pathLength={1}
        className={draw}
      />
      <path
        d="M -10 188 Q 100 138 210 188"
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        opacity={0.35}
        pathLength={1}
        className={draw}
      />
    </g>
  );
}

/** Classic satellite icon with bus, solar cell dividers, and antenna */
function Sat({
  x,
  y,
  scale = 1,
  stroke,
  strokeWidth,
  angle = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  stroke: string;
  strokeWidth: number;
  angle?: number;
}) {
  const transform = angle ? `translate(${x} ${y}) rotate(${angle}) scale(${scale})` : `translate(${x} ${y}) scale(${scale})`;
  return (
    <g transform={transform}>
      {/* Central square bus */}
      <rect x={-7} y={-7} width={14} height={14} stroke={stroke} strokeWidth={strokeWidth} fill="#000" />
      {/* Inner detail line */}
      <line x1={-7} y1={0} x2={7} y2={0} stroke={stroke} strokeWidth={strokeWidth * 0.8} />

      {/* Left solar wing with boom & 3 cell dividers */}
      <line x1={-11} y1={0} x2={-7} y2={0} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={-27} y={-6} width={16} height={12} stroke={stroke} strokeWidth={strokeWidth} fill="#000" />
      <line x1={-23} y1={-6} x2={-23} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
      <line x1={-19} y1={-6} x2={-19} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
      <line x1={-15} y1={-6} x2={-15} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />

      {/* Right solar wing with boom & 3 cell dividers */}
      <line x1={7} y1={0} x2={11} y2={0} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={11} y={-6} width={16} height={12} stroke={stroke} strokeWidth={strokeWidth} fill="#000" />
      <line x1={15} y1={-6} x2={15} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
      <line x1={19} y1={-6} x2={19} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
      <line x1={23} y1={-6} x2={23} y2={6} stroke={stroke} strokeWidth={strokeWidth * 0.8} />

      {/* Antennas */}
      <line x1={0} y1={-7} x2={0} y2={-11} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={0} y1={7} x2={0} y2={10} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}

/** Ground station dish: parabolic bowl, feed arm + feed point, mast, and base sitting on Earth limb */
function Dish({
  x = 152,
  y = 160,
  stroke,
  strokeWidth,
}: {
  x?: number;
  y?: number;
  stroke: string;
  strokeWidth: number;
}) {
  return (
    <g>
      {/* Base on Earth limb */}
      <line x1={x - 8} y1={y} x2={x + 8} y2={y} stroke={stroke} strokeWidth={strokeWidth} />
      {/* Mast & tripod legs */}
      <path d={`M ${x - 6} ${y} L ${x} ${y - 15} L ${x + 6} ${y}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <line x1={x} y1={y} x2={x} y2={y - 15} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={x - 3} y1={y - 7} x2={x + 3} y2={y - 7} stroke={stroke} strokeWidth={strokeWidth * 0.8} />
      {/* Bracket to bowl */}
      <line x1={x} y1={y - 15} x2={x - 2} y2={y - 20} stroke={stroke} strokeWidth={strokeWidth} />
      {/* Parabolic bowl */}
      <path
        d={`M ${x + 7} ${y - 35} Q ${x + 3} ${y - 19} ${x - 15} ${y - 15}`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Struts to feed point (x - 15, y - 33) */}
      <line x1={x + 7} y1={y - 35} x2={x - 15} y2={y - 33} stroke={stroke} strokeWidth={strokeWidth * 0.75} />
      <line x1={x - 15} y1={y - 15} x2={x - 15} y2={y - 33} stroke={stroke} strokeWidth={strokeWidth * 0.75} />
      {/* Feed point */}
      <circle cx={x - 15} cy={y - 33} r={1.5} fill={stroke} />
    </g>
  );
}

/** White line art; strokes draw themselves in when the box becomes active. */
function Art({ kind, active, size }: { kind: Kind; active: boolean; size: "lg" | "sm" }) {
  const reducedMotion = usePrefersReducedMotion();
  const s = active ? "#ffffff" : "rgba(255,255,255,0.45)";
  const blue = "#3d5bff";
  const red = "#ff3b4f";
  const strokeWidth = size === "lg" ? 1.3 : 2.4;
  const draw = active && size === "lg" ? "draw-in" : "";
  const canAnimate = active && size === "lg" && !reducedMotion;

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      {kind === "scan" && (
        <g>
          {/* Earth limb spanning full width */}
          <EarthLimb stroke={s} strokeWidth={strokeWidth} draw={draw} />

          {/* Sat top-left */}
          <Sat x={42} y={36} scale={0.78} stroke={s} strokeWidth={strokeWidth} />

          {/* Dashed blue field-of-view cone from sat to Earth limb */}
          <line x1={42} y1={42} x2={16} y2={168} stroke={blue} strokeDasharray="4 3" strokeWidth={strokeWidth} />
          <line x1={42} y1={42} x2={94} y2={154} stroke={blue} strokeDasharray="4 3" strokeWidth={strokeWidth} />
          <path
            d="M 16 168 Q 55 158 94 154"
            stroke={blue}
            strokeDasharray="3 3"
            strokeWidth={strokeWidth}
            fill="none"
            opacity={0.6}
          />

          {/* SSTV 4:3 frame on the right */}
          <rect x={102} y={32} width={84} height={63} stroke={s} strokeWidth={strokeWidth} fill="none" rx={2} />

          {/* Horizontal scan lines drawing in top-to-bottom, one blue */}
          {Array.from({ length: 8 }).map((_, i) => {
            const y = 37 + i * 7.5;
            const isScanBlue = i === 4;
            return (
              <line
                key={i}
                x1={107}
                y1={y}
                x2={181}
                y2={y}
                stroke={isScanBlue ? blue : s}
                strokeWidth={strokeWidth}
                opacity={isScanBlue ? 1 : 0.65}
                pathLength={1}
                className={draw}
                style={{ animationDelay: `${i * 0.09}s` }}
              />
            );
          })}

          {/* SSTV metadata label */}
          {size === "lg" && (
            <text
              x={144}
              y={107}
              textAnchor="middle"
              fill="#8b96b0"
              fontFamily="monospace"
              fontSize={7}
              letterSpacing="0.05em"
            >
              SSTV · 320×256
            </text>
          )}

          {/* Static red packet dot at sat */}
          <circle cx={42} cy={36} r={size === "lg" ? 3.5 : 4.5} fill={red} />
        </g>
      )}

      {kind === "tree" && (
        <g>
          {/* Tree branch connections */}
          {/* Level 0 to Level 1 */}
          <line
            x1={100}
            y1={35}
            x2={50}
            y2={69}
            stroke={s}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />
          <line
            x1={100}
            y1={35}
            x2={150}
            y2={69}
            stroke={blue}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />

          {/* Level 1 to Level 2 (Leaves) */}
          <line
            x1={50}
            y1={87}
            x2={25}
            y2={125}
            stroke={s}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />
          <line
            x1={50}
            y1={87}
            x2={74}
            y2={125}
            stroke={s}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />
          <line
            x1={150}
            y1={87}
            x2={133}
            y2={125}
            stroke={blue}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />
          <line
            x1={150}
            y1={87}
            x2={179}
            y2={125}
            stroke={s}
            strokeWidth={strokeWidth}
            pathLength={1}
            className={draw}
          />

          {/* Root node: battery_v */}
          <rect x={72} y={17} width={56} height={18} rx={3} stroke={blue} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={100} y={29} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize={6.5}>
              battery_v
            </text>
          )}

          {/* Level 1: link_score */}
          <rect x={22} y={69} width={56} height={18} rx={3} stroke={s} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={50} y={81} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace" fontSize={6.5}>
              link_score
            </text>
          )}

          {/* Level 1: contact_s (on path) */}
          <rect x={123} y={69} width={54} height={18} rx={3} stroke={blue} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={150} y={81} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize={6.5}>
              contact_s
            </text>
          )}

          {/* Leaf: HOLD */}
          <rect x={8} y={125} width={34} height={18} rx={3} stroke={s} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={25} y={137} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace" fontSize={6.5}>
              HOLD
            </text>
          )}

          {/* Leaf: TTC_VOICE */}
          <rect x={48} y={125} width={52} height={18} rx={3} stroke={s} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={74} y={137} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace" fontSize={6}>
              TTC_VOICE
            </text>
          )}

          {/* Leaf: RELAY_VIA_ISL (chosen leaf with blue outline) */}
          <rect x={104} y={125} width={58} height={18} rx={3} stroke={blue} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={133} y={137} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize={5.5}>
              RELAY_VIA_ISL
            </text>
          )}

          {/* Leaf: FULL */}
          <rect x={164} y={125} width={30} height={18} rx={3} stroke={s} strokeWidth={strokeWidth} fill="#000" />
          {size === "lg" && (
            <text x={179} y={137} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace" fontSize={6.5}>
              FULL
            </text>
          )}

          {/* 'chosen' label beneath chosen leaf */}
          {size === "lg" && (
            <text
              x={133}
              y={156}
              textAnchor="middle"
              fill={blue}
              fontFamily="monospace"
              fontSize={6.5}
              letterSpacing="0.08em"
            >
              chosen
            </text>
          )}

          {/* Red dot travels root to leaf */}
          {canAnimate ? (
            <circle r={3.5} fill={red}>
              <animateMotion
                dur="2.2s"
                repeatCount="indefinite"
                path="M 100 26 L 100 35 L 150 69 L 150 87 L 133 125 L 133 134"
              />
            </circle>
          ) : (
            <circle cx={133} cy={134} r={size === "lg" ? 3.5 : 4} fill={red} />
          )}
        </g>
      )}

      {kind === "hop" && (
        <g>
          {/* Earth limb spanning full width */}
          <EarthLimb stroke={s} strokeWidth={strokeWidth} draw={draw} />

          {/* Three Sats across top in gentle arc */}
          <Sat x={36} y={52} scale={0.62} stroke={s} strokeWidth={strokeWidth} />
          <Sat x={95} y={38} scale={0.62} stroke={s} strokeWidth={strokeWidth} />
          <Sat x={154} y={54} scale={0.62} stroke={s} strokeWidth={strokeWidth} />

          {/* Dashed ISL links between satellites */}
          <line x1={48} y1={50} x2={83} y2={40} stroke={blue} strokeDasharray="3 3" strokeWidth={strokeWidth} />
          <line x1={107} y1={40} x2={142} y2={50} stroke={blue} strokeDasharray="3 3" strokeWidth={strokeWidth} />

          {/* Downlink beam from last sat down to ground station dish */}
          <line x1={154} y1={62} x2={137} y2={127} stroke={blue} strokeDasharray="4 3" strokeWidth={strokeWidth} />

          {/* Ground station dish on Earth limb */}
          <Dish x={152} y={160} stroke={s} strokeWidth={strokeWidth} />

          {/* Red dot: animateMotion along sat1 -> sat2 -> sat3 -> dish (lg only), static at sat2 in thumbnails */}
          {canAnimate ? (
            <circle r={3.5} fill={red}>
              <animateMotion dur="2.8s" repeatCount="indefinite" path="M 36 52 L 95 38 L 154 54 L 137 127" />
            </circle>
          ) : (
            <circle cx={95} cy={38} r={size === "lg" ? 3.5 : 4} fill={red} />
          )}
        </g>
      )}

      {kind === "dish" && (
        <g>
          {/* Earth limb spanning full width */}
          <EarthLimb stroke={s} strokeWidth={strokeWidth} draw={draw} />

          {/* Sat upper-left */}
          <Sat x={44} y={38} scale={0.78} stroke={s} strokeWidth={strokeWidth} />

          {/* Downlink beam: narrow cone formed by two thin white lines to Dish feed point */}
          <line
            x1={38}
            y1={44}
            x2={137}
            y2={127}
            stroke={s}
            strokeWidth={strokeWidth * 0.85}
            opacity={0.65}
            pathLength={1}
            className={draw}
          />
          <line
            x1={50}
            y1={44}
            x2={137}
            y2={127}
            stroke={s}
            strokeWidth={strokeWidth * 0.85}
            opacity={0.65}
            pathLength={1}
            className={draw}
          />

          {/* Dashed blue centre line */}
          <line
            x1={44}
            y1={44}
            x2={137}
            y2={127}
            stroke={blue}
            strokeWidth={strokeWidth}
            strokeDasharray="4 3"
          />

          {/* Dish standing on Earth limb lower-right */}
          <Dish x={152} y={160} stroke={s} strokeWidth={strokeWidth} />

          {/* 3 short arcs ('signal received') next to the dish */}
          <path d="M 161 123 A 12 12 0 0 1 161 137" stroke={blue} strokeWidth={strokeWidth} fill="none" opacity={0.9} />
          <path d="M 167 119 A 18 18 0 0 1 167 141" stroke={blue} strokeWidth={strokeWidth} fill="none" opacity={0.65} />
          <path d="M 173 115 A 24 24 0 0 1 173 145" stroke={blue} strokeWidth={strokeWidth} fill="none" opacity={0.4} />

          {/* Red dot moving down centre line (lg only) */}
          {canAnimate ? (
            <circle r={3.5} fill={red}>
              <animateMotion dur="1.8s" repeatCount="indefinite" path="M 44 44 L 137 127" />
            </circle>
          ) : (
            <circle cx={137} cy={127} r={size === "lg" ? 3.5 : 4} fill={red} />
          )}
        </g>
      )}

      {kind === "rows" && (
        <g>
          {/* Table outer rect */}
          <rect x={14} y={28} width={172} height={138} rx={3} stroke={s} strokeWidth={strokeWidth} fill="none" />

          {/* Header dividing line */}
          <line x1={14} y1={52} x2={186} y2={52} stroke={s} strokeWidth={strokeWidth} />

          {/* Header row mono text */}
          {size === "lg" && (
            <g>
              <text x={22} y={43} fill="#8b96b0" fontFamily="monospace" fontSize={7} letterSpacing="0.05em">
                op
              </text>
              <text x={64} y={43} fill="#8b96b0" fontFamily="monospace" fontSize={7} letterSpacing="0.05em">
                table
              </text>
              <text x={138} y={43} fill="#8b96b0" fontFamily="monospace" fontSize={7} letterSpacing="0.05em">
                changed_at
              </text>
            </g>
          )}

          {/* 4 table rows, first row blue, rows fade in staggered */}
          {[
            { op: "INSERT", table: "packet", time: "12:04:31" },
            { op: "UPDATE", table: "satellite", time: "12:04:32" },
            { op: "INSERT", table: "routing_decision", time: "12:04:32" },
            { op: "INSERT", table: "telecommand", time: "12:04:35" },
          ].map((row, r) => {
            const isFirst = r === 0;
            const textColor = isFirst ? blue : s;
            return (
              <g
                key={r}
                className={active && size === "lg" ? "row-in" : ""}
                style={{ animationDelay: `${r * 0.14}s` }}
              >
                {/* Row divider */}
                {r > 0 && (
                  <line
                    x1={14}
                    y1={52 + r * 28}
                    x2={186}
                    y2={52 + r * 28}
                    stroke={s}
                    strokeWidth={strokeWidth}
                    opacity={0.2}
                  />
                )}

                {size === "lg" ? (
                  <>
                    <text x={22} y={70 + r * 28} fill={textColor} fontFamily="monospace" fontSize={7.2}>
                      {row.op}
                    </text>
                    <text x={64} y={70 + r * 28} fill={textColor} fontFamily="monospace" fontSize={7.2}>
                      {row.table}
                    </text>
                    <text x={138} y={70 + r * 28} fill={textColor} fontFamily="monospace" fontSize={7.2}>
                      {row.time}
                    </text>
                  </>
                ) : (
                  <>
                    <rect x={22} y={64 + r * 28} width={24} height={5} fill={isFirst ? blue : s} rx={1} />
                    <rect
                      x={58}
                      y={64 + r * 28}
                      width={56}
                      height={5}
                      fill={isFirst ? blue : s}
                      opacity={isFirst ? 0.9 : 0.6}
                      rx={1}
                    />
                    <rect
                      x={138}
                      y={64 + r * 28}
                      width={34}
                      height={5}
                      fill={isFirst ? blue : s}
                      opacity={isFirst ? 0.8 : 0.4}
                      rx={1}
                    />
                  </>
                )}
              </g>
            );
          })}
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
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || reducedMotion) return;
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
  }, [reducedMotion]);

  const step = STEPS[active];
  return (
    <section className="border-t border-white/10" style={{ background: "#000" }}>
      <div
        ref={root}
        className="mx-auto flex h-screen max-w-[1180px] flex-col justify-center overflow-hidden px-6 py-4 md:py-6"
      >
        <div className="flex items-end justify-between gap-4">
          <SectionLabel>LIFE OF A PACKET</SectionLabel>
          <span className="font-mono text-[11px] tracking-[0.08em] text-[#5f6f93]">
            {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        <div className="mt-4 grid items-center gap-4 md:mt-6 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:gap-10 lg:gap-16">
          <div
            className="relative aspect-square max-w-full shrink-0 border border-white/80"
            style={{ width: "min(420px, 44vh)", height: "min(420px, 44vh)" }}
          >
            <span className="font-mono absolute left-3 top-3 text-[10px] tracking-[0.1em] text-[#5f6f93]">{step.caption}</span>
            <div key={active} className="absolute inset-6">
              <Art kind={step.art} active size="lg" />
            </div>
          </div>
          <div key={`t${active}`} className="fade-step min-w-0 max-w-[520px]">
            <h3 className="font-light text-white" style={{ fontSize: "clamp(24px, 2.6vw, 34px)", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
              {step.title}
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-[#9aa3b8]">{step.body}</p>
            <pre className="font-mono mt-4 max-w-full whitespace-pre-wrap break-words border border-white/15 bg-[#05070d] p-4 text-[12.5px] leading-relaxed text-[#dfe6f5]">
              {step.sql}
            </pre>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2 md:mt-6 md:max-w-[620px] md:gap-3">
          {STEPS.map((s, i) => (
            <button
              key={s.caption}
              type="button"
              onClick={() => setActive(i)}
              className="flex flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3d5bff]"
              aria-label={`Step ${i + 1}: ${s.caption} — ${s.title}`}
              aria-current={i === active ? "step" : undefined}
            >
              <div
                className="aspect-square border transition-all duration-300"
                style={{ width: "min(96px, 10vh)", height: "min(96px, 10vh)", borderColor: i === active ? "#fff" : "rgba(255,255,255,0.18)", opacity: i <= active ? 1 : 0.5 }}
              >
                <div className="h-full w-full p-2">
                  <Art kind={s.art} active={i === active} size="sm" />
                </div>
              </div>
              <span className="font-mono text-[10px] tracking-[0.08em] transition-colors" style={{ color: i === active ? "#fff" : "#5f6f93" }}>
                {s.caption}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
