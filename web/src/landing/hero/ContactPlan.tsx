import { useEffect, useRef } from "react";

interface ContactPlanProps {
  progress: { current: number };
  reduced?: boolean;
  mobile?: boolean;
}

interface WindowData {
  id: string;
  source: string;
  target: string;
  fromT: number;
  toT: number;
  fromY: number;
  toY: number;
  quality: string;
  isLate?: boolean;
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const X_START = 180;
const LANE_WIDTH = 960; // 60 minutes * 16px/min -> from x=180 to x=1140
const ROUTE_LENGTH = 836;
const FULL_QUERY = "SELECT * FROM cgr_routes('SS-1', now(), 41216);";

// Four lanes:
// SS-1 (y=110), SS-2 (y=190), SS-3 (y=270), KJSIT MUMBAI (y=370)
const WINDOWS: WindowData[] = [
  { id: "w0", source: "SS-1", target: "SS-2", fromT: 4, toT: 14, fromY: 110, toY: 190, quality: "q 88" },
  { id: "w1", source: "SS-2", target: "SS-3", fromT: 18, toT: 30, fromY: 190, toY: 270, quality: "q 91" },
  { id: "w2", source: "SS-3", target: "GROUND", fromT: 34, toT: 42, fromY: 270, toY: 370, quality: "q 84" },
  { id: "w3", source: "SS-1", target: "SS-2", fromT: 40, toT: 48, fromY: 110, toY: 190, quality: "q 65" },
  { id: "w4", source: "SS-2", target: "GROUND", fromT: 46, toT: 50, fromY: 190, toY: 370, quality: "q 52" },
  { id: "w5", source: "SS-3", target: "SS-2", fromT: 50, toT: 55, fromY: 190, toY: 270, quality: "q 60" },
  { id: "w6", source: "SS-1", target: "GROUND", fromT: 52, toT: 58, fromY: 110, toY: 370, quality: "q 43", isLate: true },
];

/**
 * Precomputed polyline for the packet route:
 * (1) SS-1 at T=0 -> (180, 110)
 * (2) SS-1 until T=6 -> (276, 110) [length: 96]
 * (3) Hop SS-1 -> SS-2 at T=6 -> (276, 190) [length: 80]
 * (4) SS-2 until T=20 -> (500, 190) [length: 224]
 * (5) Hop SS-2 -> SS-3 at T=20 -> (500, 270) [length: 80]
 * (6) SS-3 until T=36 -> (756, 270) [length: 256]
 * (7) Drop SS-3 -> GROUND at T=36 -> (756, 370) [length: 100]
 * Total length = 96 + 80 + 224 + 80 + 256 + 100 = 836 px
 */
function getRoutePoint(progressFraction: number): { x: number; y: number } {
  const d = clamp(progressFraction, 0, 1) * ROUTE_LENGTH;
  if (d <= 96) return { x: 180 + d, y: 110 };
  if (d <= 176) return { x: 276, y: 110 + (d - 96) };
  if (d <= 400) return { x: 276 + (d - 176), y: 190 };
  if (d <= 480) return { x: 500, y: 190 + (d - 400) };
  if (d <= 736) return { x: 500 + (d - 480), y: 270 };
  return { x: 756, y: 270 + (d - 736) };
}

export function ContactPlan({ progress, reduced = false, mobile = false }: ContactPlanProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const laneLinesRef = useRef<(SVGLineElement | null)[]>([]);
  const axisLineRef = useRef<SVGLineElement>(null);
  const labelsGroupRef = useRef<SVGGElement>(null);
  const axisTicksRef = useRef<SVGGElement>(null);
  const windowItemRefs = useRef<(SVGGElement | null)[]>([]);
  const routePathGlowRef = useRef<SVGPathElement>(null);
  const routePathRef = useRef<SVGPathElement>(null);
  const packetGroupRef = useRef<SVGGElement>(null);
  const captionRef = useRef<SVGTextElement>(null);
  const queryChipRef = useRef<SVGGElement>(null);
  const queryTextRef = useRef<SVGTSpanElement>(null);
  const cursorRef = useRef<SVGTSpanElement>(null);

  useEffect(() => {
    const render = (p: number) => {
      if (!containerRef.current) return;

      // Stage window: visible over ~0.64 -> 1.00
      if (p < 0.64) {
        containerRef.current.style.opacity = "0";
        containerRef.current.style.visibility = "hidden";
        return;
      }
      containerRef.current.style.visibility = "visible";
      const cOpacity = smooth(0.64, 0.68, p);
      containerRef.current.style.opacity = String(cOpacity);

      // 0.66 - 0.72: lanes and axis draw in
      const pLanes = clamp((p - 0.66) / (0.72 - 0.66), 0, 1);
      const laneOffset = String(LANE_WIDTH * (1 - pLanes));
      laneLinesRef.current.forEach((line) => {
        if (line) line.style.strokeDashoffset = laneOffset;
      });
      if (axisLineRef.current) {
        axisLineRef.current.style.strokeDashoffset = laneOffset;
      }
      if (labelsGroupRef.current) {
        labelsGroupRef.current.style.opacity = String(pLanes);
      }
      if (axisTicksRef.current) {
        axisTicksRef.current.style.opacity = String(pLanes);
      }

      // 0.72 - 0.78: contact windows fade/scale in one by one
      windowItemRefs.current.forEach((winEl, i) => {
        if (!winEl) return;
        const startP = 0.72 + (i / WINDOWS.length) * 0.045;
        const pWin = clamp((p - startP) / 0.015, 0, 1);
        winEl.style.opacity = String(pWin);
        winEl.style.transform = `scale(${0.92 + 0.08 * pWin})`;
      });

      // 0.78 - 0.92: packet travels the route
      const pPacket = clamp((p - 0.78) / (0.92 - 0.78), 0, 1);
      const routeOffset = String(ROUTE_LENGTH * (1 - pPacket));
      if (routePathRef.current) {
        routePathRef.current.style.strokeDashoffset = routeOffset;
      }
      if (routePathGlowRef.current) {
        routePathGlowRef.current.style.strokeDashoffset = routeOffset;
      }

      if (packetGroupRef.current) {
        if (p < 0.76) {
          packetGroupRef.current.style.opacity = "0";
        } else {
          const pktOpacity = clamp((p - 0.76) / 0.02, 0, 1);
          packetGroupRef.current.style.opacity = String(pktOpacity);
          const pt = getRoutePoint(pPacket);
          packetGroupRef.current.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
        }
      }

      // 0.92 - 1.00: caption + query typing appear under the plan
      const pFinale = clamp((p - 0.92) / (1.0 - 0.92), 0, 1);
      if (captionRef.current) {
        captionRef.current.style.opacity = String(clamp(pFinale / 0.35, 0, 1));
      }
      if (queryChipRef.current) {
        queryChipRef.current.style.opacity = String(clamp((pFinale - 0.15) / 0.3, 0, 1));
      }
      if (queryTextRef.current) {
        const pQuery = clamp((pFinale - 0.3) / 0.7, 0, 1);
        const chars = Math.floor(pQuery * FULL_QUERY.length);
        queryTextRef.current.textContent = FULL_QUERY.slice(0, chars);
        if (cursorRef.current) {
          cursorRef.current.style.opacity = pQuery >= 1 ? "0" : "1";
        }
      }
    };

    if (reduced) {
      render(1);
      return;
    }

    let rafId: number;
    let lastP = -1;

    const tick = () => {
      const p = progress.current;
      if (Math.abs(p - lastP) > 0.0001) {
        lastP = p;
        render(p);
      }
      rafId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(rafId);
  }, [reduced, progress]);

  const endPt = getRoutePoint(reduced ? 1 : 0);

  return (
    <div
      ref={containerRef}
      id="hero-contact-plan"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center px-4 pt-4 pb-12 md:px-8"
      style={{
        opacity: reduced ? 1 : 0,
        visibility: reduced ? "visible" : "hidden",
      }}
    >
      <svg
        viewBox="0 0 1200 600"
        preserveAspectRatio="xMidYMid meet"
        className="h-auto max-h-[80vh] w-full max-w-[1100px] overflow-visible"
        aria-label="Contact Graph Routing animated plan"
      >
        <defs>
          <filter id="packet-glow-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Top Eyebrow / Telemetry Header */}
        <g opacity="0.6">
          <text
            x="180"
            y="56"
            fill="rgba(255, 255, 255, 0.45)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em" }}
          >
            CONTACT PLAN · NEXT 60 MINUTES
          </text>
          <text
            x="1140"
            y="56"
            textAnchor="end"
            fill="#3d5bff"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", fontWeight: 500 }}
          >
            PACKET #412
          </text>
        </g>

        {/* Contact Windows */}
        <g id="contact-windows">
          {WINDOWS.map((win, i) => {
            const x = X_START + win.fromT * 16;
            const w = (win.toT - win.fromT) * 16;
            const y = win.fromY;
            const h = win.toY - win.fromY;
            const isLate = win.isLate ?? false;

            return (
              <g
                key={win.id}
                ref={(el) => {
                  windowItemRefs.current[i] = el;
                }}
                style={{
                  opacity: reduced ? (isLate ? 0.35 : 1) : 0,
                  transformOrigin: `${x + w / 2}px ${y + h / 2}px`,
                  transition: "none",
                }}
              >
                {/* Bridge band */}
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  fill={isLate ? "rgba(61, 91, 255, 0.08)" : "rgba(61, 91, 255, 0.28)"}
                  stroke={isLate ? "rgba(61, 91, 255, 0.35)" : "#3d5bff"}
                  strokeWidth="1"
                  strokeDasharray={isLate ? "4 3" : undefined}
                />

                {/* Window quality tag */}
                <text
                  x={x + 8}
                  y={y + 16}
                  fill={isLate ? "rgba(169, 202, 255, 0.45)" : "rgba(169, 202, 255, 0.9)"}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
                >
                  {win.quality}
                </text>

                {/* Late option label with strike */}
                {isLate && (
                  <g>
                    <text
                      x={x + w / 2}
                      y={y + h / 2}
                      textAnchor="middle"
                      fill="#818ea8"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.02em" }}
                    >
                      arrives T+52, slower
                    </text>
                    <line
                      x1={x + 6}
                      y1={y + h / 2 - 3}
                      x2={x + w - 6}
                      y2={y + h / 2 - 3}
                      stroke="#ff3b4f"
                      strokeWidth="1.2"
                      strokeOpacity="0.8"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Four horizontal lanes */}
        <g id="lanes">
          {/* SS-1 */}
          <line
            ref={(el) => {
              laneLinesRef.current[0] = el;
            }}
            x1="180"
            y1="110"
            x2="1140"
            y2="110"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1"
            strokeDasharray={LANE_WIDTH}
            style={{ strokeDashoffset: reduced ? 0 : LANE_WIDTH }}
          />
          {/* SS-2 */}
          <line
            ref={(el) => {
              laneLinesRef.current[1] = el;
            }}
            x1="180"
            y1="190"
            x2="1140"
            y2="190"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1"
            strokeDasharray={LANE_WIDTH}
            style={{ strokeDashoffset: reduced ? 0 : LANE_WIDTH }}
          />
          {/* SS-3 */}
          <line
            ref={(el) => {
              laneLinesRef.current[2] = el;
            }}
            x1="180"
            y1="270"
            x2="1140"
            y2="270"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1"
            strokeDasharray={LANE_WIDTH}
            style={{ strokeDashoffset: reduced ? 0 : LANE_WIDTH }}
          />
          {/* KJSIT MUMBAI (ground lane: slightly thicker) */}
          <line
            ref={(el) => {
              laneLinesRef.current[3] = el;
            }}
            x1="180"
            y1="370"
            x2="1140"
            y2="370"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1.5"
            strokeDasharray={LANE_WIDTH}
            style={{ strokeDashoffset: reduced ? 0 : LANE_WIDTH }}
          />
        </g>

        {/* Lane labels on left */}
        <g
          ref={labelsGroupRef}
          id="lane-labels"
          style={{ opacity: reduced ? 1 : 0, transition: "none" }}
        >
          <text
            x="162"
            y="114"
            textAnchor="end"
            fill="rgba(255, 255, 255, 0.75)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.05em" }}
          >
            SS-1
          </text>
          <text
            x="162"
            y="194"
            textAnchor="end"
            fill="rgba(255, 255, 255, 0.75)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.05em" }}
          >
            SS-2
          </text>
          <text
            x="162"
            y="274"
            textAnchor="end"
            fill="rgba(255, 255, 255, 0.75)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.05em" }}
          >
            SS-3
          </text>

          {/* KJSIT MUMBAI ground lane label + dish icon */}
          <g>
            {/* Dish icon */}
            <g transform="translate(46, 360)">
              <path
                d="M 1,16 L 8,9 L 15,16 M 8,9 L 8,14"
                fill="none"
                stroke="#3d5bff"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M 2,4 Q 8,11 15,6"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <line x1="9" y1="8" x2="6" y2="2" stroke="#3d5bff" strokeWidth="1.2" />
              <circle cx="6" cy="2" r="1.4" fill="#ff3b4f" />
            </g>
            <text
              x="162"
              y="374"
              textAnchor="end"
              fill="#ffffff"
              style={{ fontFamily: "var(--font-mono)", fontSize: mobile ? 11 : 12.5, fontWeight: 500, letterSpacing: "0.04em" }}
            >
              KJSIT MUMBAI
            </text>
          </g>
        </g>

        {/* Time axis along bottom */}
        <g id="time-axis">
          {/* Axis line */}
          <line
            ref={axisLineRef}
            x1="180"
            y1="430"
            x2="1140"
            y2="430"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1"
            strokeDasharray={LANE_WIDTH}
            style={{ strokeDashoffset: reduced ? 0 : LANE_WIDTH }}
          />

          {/* Axis Ticks & Mono Labels */}
          <g
            ref={axisTicksRef}
            style={{ opacity: reduced ? 1 : 0, transition: "none" }}
          >
            {/* Sub-ticks every 5 min */}
            {Array.from({ length: 13 }).map((_, i) => {
              const x = 180 + i * 5 * 16;
              const isMajor = i % 2 === 0;
              return (
                <line
                  key={`tick-${i}`}
                  x1={x}
                  y1="430"
                  x2={x}
                  y2={isMajor ? "437" : "433"}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Labels every 10 min */}
            {[0, 10, 20, 30, 40, 50, 60].map((t) => {
              const x = 180 + t * 16;
              return (
                <text
                  key={`label-${t}`}
                  x={x}
                  y="452"
                  textAnchor="middle"
                  fill="rgba(255, 255, 255, 0.5)"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em" }}
                >
                  T+{t}
                </text>
              );
            })}
          </g>
        </g>

        {/* Chosen Route (travelled path) */}
        <g id="chosen-route">
          {/* Soft glow halo */}
          <path
            ref={routePathGlowRef}
            d="M 180,110 L 276,110 L 276,190 L 500,190 L 500,270 L 756,270 L 756,370"
            fill="none"
            stroke="rgba(255, 59, 79, 0.4)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={ROUTE_LENGTH}
            style={{ strokeDashoffset: reduced ? 0 : ROUTE_LENGTH }}
          />
          {/* Solid red-tinted white route line */}
          <path
            ref={routePathRef}
            d="M 180,110 L 276,110 L 276,190 L 500,190 L 500,270 L 756,270 L 756,370"
            fill="none"
            stroke="#ffebec"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={ROUTE_LENGTH}
            style={{ strokeDashoffset: reduced ? 0 : ROUTE_LENGTH }}
          />
        </g>

        {/* Packet: red dot with soft glow */}
        <g
          ref={packetGroupRef}
          id="packet-indicator"
          transform={`translate(${endPt.x}, ${endPt.y})`}
          style={{ opacity: reduced ? 1 : 0, transition: "none" }}
        >
          {/* Soft outer glow */}
          <circle r="14" fill="#ff3b4f" opacity="0.22" />
          <circle r="8" fill="#ff3b4f" opacity="0.45" />
          {/* Core red dot */}
          <circle r="4.5" fill="#ff3b4f" filter="url(#packet-glow-filter)" />
          {/* Packet telemetry pill label */}
          <g transform="translate(0, -18)">
            <rect
              x="-24"
              y="-7"
              width="48"
              height="15"
              rx="3"
              fill="rgba(6, 12, 28, 0.9)"
              stroke="#ff3b4f"
              strokeWidth="0.8"
            />
            <text
              x="0"
              y="4.5"
              textAnchor="middle"
              fill="#ffccd0"
              style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, fontWeight: 500 }}
            >
              #412
            </text>
          </g>
        </g>

        {/* Caption under the plan */}
        <text
          ref={captionRef}
          x="600"
          y="500"
          textAnchor="middle"
          fill="#ffffff"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: mobile ? 14 : 16.5,
            fontWeight: 300,
            letterSpacing: "-0.01em",
            opacity: reduced ? 1 : 0,
            transition: "none",
          }}
        >
          Earliest arrival:{" "}
          <tspan fill="#3d5bff" style={{ fontWeight: 500 }}>
            T+36
          </tspan>{" "}
          via SS-2 and SS-3. Found by a recursive SQL query.
        </text>

        {/* Code Chip under the caption */}
        <g
          ref={queryChipRef}
          transform="translate(600, 545)"
          style={{ opacity: reduced ? 1 : 0, transition: "none" }}
        >
          {/* Chip pill background */}
          <rect
            x="-255"
            y="-18"
            width="510"
            height="34"
            rx="6"
            fill="rgba(6, 12, 32, 0.88)"
            stroke="rgba(61, 91, 255, 0.4)"
            strokeWidth="1"
          />
          <text
            x="0"
            y="4.5"
            textAnchor="middle"
            fill="#dbe4ff"
            style={{ fontFamily: "var(--font-mono)", fontSize: mobile ? 11 : 13, letterSpacing: "0.02em" }}
          >
            <tspan ref={queryTextRef}>{reduced ? FULL_QUERY : ""}</tspan>
            <tspan ref={cursorRef} fill="#3d5bff" style={{ opacity: reduced ? 0 : 1 }}>
              █
            </tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}
