import { useEffect, useRef } from "react";
import type { JSX } from "react";

export interface RouteDiagramProps {
  progress: { current: number };
  reduced?: boolean;
  mobile?: boolean;
}

const clamp = (val: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, val));

const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const lerp = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
): { x: number; y: number } => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const FULL_QUERY = "SELECT * FROM cgr_routes('SS-1', now(), 41216);";
const RING_CIRCUMFERENCE = 56.55; // 2 * PI * 9

// Circular orbit: center (360, 980), radius 860
function getOrbitPos(baseX: number, drift: number): { x: number; y: number } {
  const x = baseX + drift;
  const dx = x - 360;
  const y = 980 - Math.sqrt(Math.max(0, 860 * 860 - dx * dx));
  return { x, y };
}

export function RouteDiagram({
  progress,
  reduced = false,
  mobile = false,
}: RouteDiagramProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  // Top Mission Clock & Progress Bar
  const clockTextRef = useRef<HTMLSpanElement>(null);
  const clockMinRef = useRef<HTMLSpanElement>(null);
  const clockBarFillRef = useRef<HTMLDivElement>(null);
  const clockDotRef = useRef<HTMLDivElement>(null);

  // Satellite node groups (for drift)
  const node1GroupRef = useRef<SVGGElement>(null);
  const node2GroupRef = useRef<SVGGElement>(null);
  const node3GroupRef = useRef<SVGGElement>(null);

  // Link 1: SS-1 -> SS-2
  const link1InactiveRef = useRef<SVGLineElement>(null);
  const link1ActiveRef = useRef<SVGLineElement>(null);
  const link1BadgeRef = useRef<SVGGElement>(null);
  const link1BadgeTextRef = useRef<SVGTextElement>(null);

  // Link 2: SS-2 -> SS-3
  const link2InactiveRef = useRef<SVGLineElement>(null);
  const link2ActiveRef = useRef<SVGLineElement>(null);
  const link2BadgeRef = useRef<SVGGElement>(null);

  // Link 3: SS-3 -> Ground
  const link3InactiveRef = useRef<SVGLineElement>(null);
  const link3ActiveRef = useRef<SVGLineElement>(null);
  const link3BadgeRef = useRef<SVGGElement>(null);

  // Decoy Link: SS-1 -> Ground (t=52..58)
  const decoyInactiveRef = useRef<SVGLineElement>(null);
  const decoyActiveRef = useRef<SVGLineElement>(null);
  const decoyBadgeRef = useRef<SVGGElement>(null);

  // Traveled red routes
  const redPath1Ref = useRef<SVGLineElement>(null);
  const redPath2Ref = useRef<SVGLineElement>(null);
  const redPath3Ref = useRef<SVGLineElement>(null);

  // Waiting countdown rings & labels
  const waitRing1Ref = useRef<SVGCircleElement>(null);
  const waitLabel1Ref = useRef<SVGTextElement>(null);
  const waitRing2Ref = useRef<SVGCircleElement>(null);
  const waitLabel2Ref = useRef<SVGTextElement>(null);
  const waitRing3Ref = useRef<SVGCircleElement>(null);
  const waitLabel3Ref = useRef<SVGTextElement>(null);

  // Packet dot & trail
  const packetGroupRef = useRef<SVGGElement>(null);
  const trailDot1Ref = useRef<SVGCircleElement>(null);
  const trailDot2Ref = useRef<SVGCircleElement>(null);

  // Dish ripple at KJSIT Mumbai
  const dishRippleRef = useRef<SVGCircleElement>(null);

  // Table rows
  const row1Ref = useRef<HTMLDivElement>(null);
  const row2Ref = useRef<HTMLDivElement>(null);
  const row3Ref = useRef<HTMLDivElement>(null);

  // SQL Query typing & caption
  const queryChipRef = useRef<HTMLDivElement>(null);
  const queryTextRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = (p: number) => {
      if (!containerRef.current) return;

      // Stage visibility: 0.64 -> 1.00 (fade in 0.64 -> 0.70)
      if (p < 0.64) {
        containerRef.current.style.opacity = "0";
        containerRef.current.style.visibility = "hidden";
        return;
      }
      containerRef.current.style.visibility = "visible";
      const cOpacity = smooth(0.64, 0.7, p);
      containerRef.current.style.opacity = String(cOpacity);

      // Simulated timeline: map progress 0.70 -> 0.98 to minute 0 -> 60
      const t = clamp(((p - 0.7) / (0.98 - 0.7)) * 60, 0, 60);

      // Satellite live drift along orbit (a few px)
      const pDrift = clamp((p - 0.64) / (1.0 - 0.64), 0, 1);
      const drift = pDrift * 14;

      const pos1 = getOrbitPos(170, drift);
      const pos2 = getOrbitPos(360, drift);
      const pos3 = getOrbitPos(540, drift);
      const posGround = { x: 520, y: 340 };

      // Update satellite node positions
      if (node1GroupRef.current) {
        node1GroupRef.current.setAttribute("transform", `translate(${pos1.x}, ${pos1.y})`);
      }
      if (node2GroupRef.current) {
        node2GroupRef.current.setAttribute("transform", `translate(${pos2.x}, ${pos2.y})`);
      }
      if (node3GroupRef.current) {
        node3GroupRef.current.setAttribute("transform", `translate(${pos3.x}, ${pos3.y})`);
      }

      // Mission clock & progress bar
      if (clockTextRef.current) {
        const mm = Math.floor(t);
        const ss = Math.floor((t * 60) % 60);
        const mmStr = mm < 10 ? `0${mm}` : `${mm}`;
        const ssStr = ss < 10 ? `0${ss}` : `${ss}`;
        clockTextRef.current.textContent = `T+${mmStr}:${ssStr}`;
      }
      if (clockMinRef.current) {
        clockMinRef.current.textContent = `(T+${Math.floor(t)} min)`;
      }
      if (clockBarFillRef.current) {
        const pct = clamp(t / 60, 0, 1) * 100;
        clockBarFillRef.current.style.width = `${pct}%`;
      }
      if (clockDotRef.current) {
        const pct = clamp(t / 60, 0, 1) * 100;
        clockDotRef.current.style.left = `${pct}%`;
      }

      // ─── Contact Links ───
      // Link 1: SS-1 -> SS-2 (ON t=5..12, and decoy t=40..48)
      const isL1Primary = t >= 5.0 && t <= 12.0;
      const isL1Decoy = t >= 40.0 && t <= 48.0;
      const isL1Active = isL1Primary || isL1Decoy;

      if (link1InactiveRef.current) {
        link1InactiveRef.current.setAttribute("x1", String(pos1.x));
        link1InactiveRef.current.setAttribute("y1", String(pos1.y));
        link1InactiveRef.current.setAttribute("x2", String(pos2.x));
        link1InactiveRef.current.setAttribute("y2", String(pos2.y));
        link1InactiveRef.current.style.opacity = isL1Active ? "0" : "1";
      }
      if (link1ActiveRef.current) {
        link1ActiveRef.current.setAttribute("x1", String(pos1.x));
        link1ActiveRef.current.setAttribute("y1", String(pos1.y));
        link1ActiveRef.current.setAttribute("x2", String(pos2.x));
        link1ActiveRef.current.setAttribute("y2", String(pos2.y));
        link1ActiveRef.current.style.opacity = isL1Active ? "1" : "0";
      }
      if (link1BadgeRef.current) {
        const midX = (pos1.x + pos2.x) / 2;
        const midY = (pos1.y + pos2.y) / 2 - 12;
        link1BadgeRef.current.setAttribute("transform", `translate(${midX}, ${midY})`);
        link1BadgeRef.current.style.opacity = isL1Active ? "1" : "0";
      }
      if (link1BadgeTextRef.current) {
        link1BadgeTextRef.current.textContent = isL1Decoy ? "q 65" : "q 91";
      }

      // Link 2: SS-2 -> SS-3 (ON t=18..28)
      const isL2Active = t >= 18.0 && t <= 28.0;
      if (link2InactiveRef.current) {
        link2InactiveRef.current.setAttribute("x1", String(pos2.x));
        link2InactiveRef.current.setAttribute("y1", String(pos2.y));
        link2InactiveRef.current.setAttribute("x2", String(pos3.x));
        link2InactiveRef.current.setAttribute("y2", String(pos3.y));
        link2InactiveRef.current.style.opacity = isL2Active ? "0" : "1";
      }
      if (link2ActiveRef.current) {
        link2ActiveRef.current.setAttribute("x1", String(pos2.x));
        link2ActiveRef.current.setAttribute("y1", String(pos2.y));
        link2ActiveRef.current.setAttribute("x2", String(pos3.x));
        link2ActiveRef.current.setAttribute("y2", String(pos3.y));
        link2ActiveRef.current.style.opacity = isL2Active ? "1" : "0";
      }
      if (link2BadgeRef.current) {
        const midX = (pos2.x + pos3.x) / 2;
        const midY = (pos2.y + pos3.y) / 2 - 12;
        link2BadgeRef.current.setAttribute("transform", `translate(${midX}, ${midY})`);
        link2BadgeRef.current.style.opacity = isL2Active ? "1" : "0";
      }

      // Link 3: SS-3 -> Ground / Mumbai (ON t=34..44)
      const isL3Active = t >= 34.0 && t <= 44.0;
      if (link3InactiveRef.current) {
        link3InactiveRef.current.setAttribute("x1", String(pos3.x));
        link3InactiveRef.current.setAttribute("y1", String(pos3.y));
        link3InactiveRef.current.setAttribute("x2", String(posGround.x));
        link3InactiveRef.current.setAttribute("y2", String(posGround.y));
        link3InactiveRef.current.style.opacity = isL3Active ? "0" : "1";
      }
      if (link3ActiveRef.current) {
        link3ActiveRef.current.setAttribute("x1", String(pos3.x));
        link3ActiveRef.current.setAttribute("y1", String(pos3.y));
        link3ActiveRef.current.setAttribute("x2", String(posGround.x));
        link3ActiveRef.current.setAttribute("y2", String(posGround.y));
        link3ActiveRef.current.style.opacity = isL3Active ? "1" : "0";
      }
      if (link3BadgeRef.current) {
        const midX = (pos3.x + posGround.x) / 2 + 18;
        const midY = (pos3.y + posGround.y) / 2;
        link3BadgeRef.current.setAttribute("transform", `translate(${midX}, ${midY})`);
        link3BadgeRef.current.style.opacity = isL3Active ? "1" : "0";
      }

      // Decoy Link: SS-1 -> Ground (ON t=52..58)
      const isDecoyActive = t >= 52.0 && t <= 58.0;
      if (decoyInactiveRef.current) {
        decoyInactiveRef.current.setAttribute("x1", String(pos1.x));
        decoyInactiveRef.current.setAttribute("y1", String(pos1.y));
        decoyInactiveRef.current.setAttribute("x2", String(posGround.x));
        decoyInactiveRef.current.setAttribute("y2", String(posGround.y));
        decoyInactiveRef.current.style.opacity = isDecoyActive ? "0" : "0.6";
      }
      if (decoyActiveRef.current) {
        decoyActiveRef.current.setAttribute("x1", String(pos1.x));
        decoyActiveRef.current.setAttribute("y1", String(pos1.y));
        decoyActiveRef.current.setAttribute("x2", String(posGround.x));
        decoyActiveRef.current.setAttribute("y2", String(posGround.y));
        decoyActiveRef.current.style.opacity = isDecoyActive ? "1" : "0";
      }
      if (decoyBadgeRef.current) {
        const midX = (pos1.x + posGround.x) / 2 - 20;
        const midY = (pos1.y + posGround.y) / 2 + 20;
        decoyBadgeRef.current.setAttribute("transform", `translate(${midX}, ${midY})`);
        decoyBadgeRef.current.style.opacity = isDecoyActive ? "1" : "0";
      }

      // ─── Waiting Rings & Countdown ───
      // Node 1: SS-1 (waits t=0..6)
      if (waitRing1Ref.current && waitLabel1Ref.current) {
        if (t < 6.0) {
          const ratio = clamp(t / 6.0, 0, 1);
          waitRing1Ref.current.style.strokeDashoffset = String(
            RING_CIRCUMFERENCE * (1 - ratio)
          );
          waitRing1Ref.current.style.opacity = "1";
          waitLabel1Ref.current.style.opacity = "1";
          const rem = Math.max(0, Math.ceil(6 - t));
          waitLabel1Ref.current.textContent = `waiting 00:0${rem}`;
        } else if (t < 6.8) {
          const fade = 1 - (t - 6.0) / 0.8;
          waitRing1Ref.current.style.opacity = String(fade);
          waitLabel1Ref.current.style.opacity = String(fade);
        } else {
          waitRing1Ref.current.style.opacity = "0";
          waitLabel1Ref.current.style.opacity = "0";
        }
      }

      // Node 2: SS-2 (waits t=7.5..20)
      if (waitRing2Ref.current && waitLabel2Ref.current) {
        if (t >= 7.5 && t < 20.0) {
          const ratio = clamp((t - 7.5) / (20.0 - 7.5), 0, 1);
          waitRing2Ref.current.style.strokeDashoffset = String(
            RING_CIRCUMFERENCE * (1 - ratio)
          );
          waitRing2Ref.current.style.opacity = "1";
          waitLabel2Ref.current.style.opacity = "1";
          const rem = Math.max(0, Math.ceil(20 - t));
          waitLabel2Ref.current.textContent = `waiting 00:${rem < 10 ? "0" + rem : rem}`;
        } else if (t >= 20.0 && t < 20.8) {
          const fade = 1 - (t - 20.0) / 0.8;
          waitRing2Ref.current.style.opacity = String(fade);
          waitLabel2Ref.current.style.opacity = String(fade);
        } else {
          waitRing2Ref.current.style.opacity = "0";
          waitLabel2Ref.current.style.opacity = "0";
        }
      }

      // Node 3: SS-3 (waits t=21.5..36)
      if (waitRing3Ref.current && waitLabel3Ref.current) {
        if (t >= 21.5 && t < 36.0) {
          const ratio = clamp((t - 21.5) / (36.0 - 21.5), 0, 1);
          waitRing3Ref.current.style.strokeDashoffset = String(
            RING_CIRCUMFERENCE * (1 - ratio)
          );
          waitRing3Ref.current.style.opacity = "1";
          waitLabel3Ref.current.style.opacity = "1";
          const rem = Math.max(0, Math.ceil(36 - t));
          waitLabel3Ref.current.textContent = `waiting 00:${rem < 10 ? "0" + rem : rem}`;
        } else if (t >= 36.0 && t < 36.8) {
          const fade = 1 - (t - 36.0) / 0.8;
          waitRing3Ref.current.style.opacity = String(fade);
          waitLabel3Ref.current.style.opacity = String(fade);
        } else {
          waitRing3Ref.current.style.opacity = "0";
          waitLabel3Ref.current.style.opacity = "0";
        }
      }

      // ─── Packet Movement & Traveled Red Paths ───
      const hop1Progress = clamp((t - 6.0) / 1.5, 0, 1);
      const hop2Progress = clamp((t - 20.0) / 1.5, 0, 1);
      const hop3Progress = clamp((t - 36.0) / 1.5, 0, 1);

      // Red path 1
      if (redPath1Ref.current) {
        if (hop1Progress > 0) {
          const end1 = lerp(pos1, pos2, hop1Progress);
          redPath1Ref.current.setAttribute("x1", String(pos1.x));
          redPath1Ref.current.setAttribute("y1", String(pos1.y));
          redPath1Ref.current.setAttribute("x2", String(end1.x));
          redPath1Ref.current.setAttribute("y2", String(end1.y));
          redPath1Ref.current.style.opacity = "1";
        } else {
          redPath1Ref.current.style.opacity = "0";
        }
      }

      // Red path 2
      if (redPath2Ref.current) {
        if (hop2Progress > 0) {
          const end2 = lerp(pos2, pos3, hop2Progress);
          redPath2Ref.current.setAttribute("x1", String(pos2.x));
          redPath2Ref.current.setAttribute("y1", String(pos2.y));
          redPath2Ref.current.setAttribute("x2", String(end2.x));
          redPath2Ref.current.setAttribute("y2", String(end2.y));
          redPath2Ref.current.style.opacity = "1";
        } else {
          redPath2Ref.current.style.opacity = "0";
        }
      }

      // Red path 3
      if (redPath3Ref.current) {
        if (hop3Progress > 0) {
          const end3 = lerp(pos3, posGround, hop3Progress);
          redPath3Ref.current.setAttribute("x1", String(pos3.x));
          redPath3Ref.current.setAttribute("y1", String(pos3.y));
          redPath3Ref.current.setAttribute("x2", String(end3.x));
          redPath3Ref.current.setAttribute("y2", String(end3.y));
          redPath3Ref.current.style.opacity = "1";
        } else {
          redPath3Ref.current.style.opacity = "0";
        }
      }

      // Packet dot position & motion vector
      let pktPos: { x: number; y: number };
      let isMoving = false;
      let moveVec = { x: 0, y: 0 };

      if (t < 6.0) {
        pktPos = pos1;
      } else if (t < 7.5) {
        const p1 = (t - 6.0) / 1.5;
        pktPos = lerp(pos1, pos2, p1);
        isMoving = true;
        moveVec = { x: pos2.x - pos1.x, y: pos2.y - pos1.y };
      } else if (t < 20.0) {
        pktPos = pos2;
      } else if (t < 21.5) {
        const p2 = (t - 20.0) / 1.5;
        pktPos = lerp(pos2, pos3, p2);
        isMoving = true;
        moveVec = { x: pos3.x - pos2.x, y: pos3.y - pos2.y };
      } else if (t < 36.0) {
        pktPos = pos3;
      } else if (t < 37.5) {
        const p3 = (t - 36.0) / 1.5;
        pktPos = lerp(pos3, posGround, p3);
        isMoving = true;
        moveVec = { x: posGround.x - pos3.x, y: posGround.y - pos3.y };
      } else {
        pktPos = posGround;
      }

      if (packetGroupRef.current) {
        packetGroupRef.current.setAttribute(
          "transform",
          `translate(${pktPos.x}, ${pktPos.y})`
        );
      }

      if (trailDot1Ref.current && trailDot2Ref.current) {
        if (isMoving) {
          trailDot1Ref.current.style.opacity = "0.6";
          trailDot2Ref.current.style.opacity = "0.35";
          const d1 = {
            x: pktPos.x - moveVec.x * 0.05,
            y: pktPos.y - moveVec.y * 0.05,
          };
          const d2 = {
            x: pktPos.x - moveVec.x * 0.1,
            y: pktPos.y - moveVec.y * 0.1,
          };
          trailDot1Ref.current.setAttribute("cx", String(d1.x));
          trailDot1Ref.current.setAttribute("cy", String(d1.y));
          trailDot2Ref.current.setAttribute("cx", String(d2.x));
          trailDot2Ref.current.setAttribute("cy", String(d2.y));
        } else {
          trailDot1Ref.current.style.opacity = "0";
          trailDot2Ref.current.style.opacity = "0";
        }
      }

      // Dish ripple at KJSIT Mumbai (t=36..43)
      if (dishRippleRef.current) {
        if (t >= 36.0 && t < 43.0) {
          const rip = (t - 36.0) / 7.0;
          dishRippleRef.current.setAttribute("r", String(4 + rip * 26));
          dishRippleRef.current.style.opacity = String((1 - rip) * 0.85);
        } else {
          dishRippleRef.current.style.opacity = "0";
        }
      }

      // ─── Table Rows (Slide in & Neutral Highlight) ───
      // Row 1: inserts t=6.0..7.5, highlighted t=6..10
      if (row1Ref.current) {
        const pRow1 = clamp((t - 6.0) / 1.5, 0, 1);
        row1Ref.current.style.opacity = String(pRow1);
        row1Ref.current.style.transform = `translateY(${(1 - pRow1) * 10}px)`;
        if (t >= 6.0 && t <= 10.0) {
          const hl = 1 - (t - 6.0) / 4.0;
          row1Ref.current.style.backgroundColor = `rgba(28, 28, 30, ${hl})`;
        } else {
          row1Ref.current.style.backgroundColor = "transparent";
        }
      }

      // Row 2: inserts t=20.0..21.5, highlighted t=20..24
      if (row2Ref.current) {
        const pRow2 = clamp((t - 20.0) / 1.5, 0, 1);
        row2Ref.current.style.opacity = String(pRow2);
        row2Ref.current.style.transform = `translateY(${(1 - pRow2) * 10}px)`;
        if (t >= 20.0 && t <= 24.0) {
          const hl = 1 - (t - 20.0) / 4.0;
          row2Ref.current.style.backgroundColor = `rgba(28, 28, 30, ${hl})`;
        } else {
          row2Ref.current.style.backgroundColor = "transparent";
        }
      }

      // Row 3: inserts t=36.0..37.5, highlighted t=36..40
      if (row3Ref.current) {
        const pRow3 = clamp((t - 36.0) / 1.5, 0, 1);
        row3Ref.current.style.opacity = String(pRow3);
        row3Ref.current.style.transform = `translateY(${(1 - pRow3) * 10}px)`;
        if (t >= 36.0 && t <= 40.0) {
          const hl = 1 - (t - 36.0) / 4.0;
          row3Ref.current.style.backgroundColor = `rgba(28, 28, 30, ${hl})`;
        } else {
          row3Ref.current.style.backgroundColor = "transparent";
        }
      }

      // ─── SQL Query Chip & Caption (0.88 -> 1.00) ───
      if (queryChipRef.current) {
        const chipFade = clamp((p - 0.84) / 0.05, 0, 1);
        queryChipRef.current.style.opacity = String(chipFade);
      }

      if (queryTextRef.current) {
        const pQuery = clamp((p - 0.88) / (0.98 - 0.88), 0, 1);
        const chars = Math.floor(pQuery * FULL_QUERY.length);
        queryTextRef.current.textContent = FULL_QUERY.slice(0, chars);
        if (cursorRef.current) {
          cursorRef.current.style.opacity = pQuery > 0 && pQuery < 1 ? "1" : "0";
        }
      }

      if (captionRef.current) {
        const pCap = clamp((p - 0.98) / 0.02, 0, 1);
        captionRef.current.style.opacity = String(pCap);
        captionRef.current.style.transform = `translateY(${(1 - pCap) * 6}px)`;
      }
    };

    if (reduced) {
      render(1.0);
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

  return (
    <div
      ref={containerRef}
      id="hero-route-diagram"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center overflow-hidden px-4 py-4 select-none sm:px-6 md:px-8"
      style={{
        backgroundColor: "#000000",
        opacity: reduced ? 1 : 0,
        visibility: reduced ? "visible" : "hidden",
      }}
    >
      <div className="my-auto flex w-full max-w-[1200px] flex-col items-center justify-center gap-3 sm:gap-4 md:gap-5">
        {/* Mission Clock + Progress Bar */}
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-white sm:gap-3">
            <span className="sx-eyebrow text-white/40">
              MISSION CLOCK
            </span>
            <span className="text-white/20">·</span>
            <span
              ref={clockTextRef}
              className="sx-num text-sm text-white sm:text-base"
            >
              {reduced ? "T+01:00" : "T+00:00"}
            </span>
            <span
              ref={clockMinRef}
              className="sx-num text-[11px] text-white/50 sm:text-xs"
            >
              {reduced ? "(T+60 min)" : "(T+0 min)"}
            </span>
            <span className="hidden text-white/20 sm:inline">·</span>
            <span className="hidden sx-eyebrow text-white/40 sm:inline">
              PACKET #412 · 41 KB
            </span>
          </div>

          {/* Thin progress bar: 1px white at 15% track, white fill */}
          <div className="relative h-px w-52 bg-white/15 sm:w-80">
            <div
              ref={clockBarFillRef}
              className="absolute top-0 left-0 h-full bg-white"
              style={{ width: reduced ? "100%" : "0%" }}
            />
            <div ref={clockDotRef} className="hidden" />
          </div>
        </div>

        {/* Main Stage Grid: Diagram (~62%) + Table (~35%) */}
        <div
          className={`flex w-full items-center justify-between gap-4 md:gap-8 ${
            mobile ? "flex-col" : "flex-col md:flex-row"
          }`}
        >
          {/* Left Column: Network Diagram SVG */}
          <div
            className={`flex items-center justify-center ${
              mobile ? "w-full" : "w-full md:w-[62%]"
            }`}
          >
            <svg
              viewBox="0 0 720 440"
              preserveAspectRatio="xMidYMid meet"
              className="h-auto max-h-[48vh] w-full overflow-visible sm:max-h-[54vh] md:max-h-[62vh]"
              aria-label="Satellite contact routing network diagram"
            >
              {/* ─── Earth Limb ─── */}
              <g id="earth-group">
                {/* Thin white limb arc (1px, 30%) */}
                <path
                  d="M 0,427 A 660 660 0 0 1 720,427"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth="1"
                />

                {/* Ground Station: KJSIT Mumbai on limb (x=520, y=340) */}
                <g id="ground-station" transform="translate(520, 340)">
                  {/* Expanding downlink ripple */}
                  <circle
                    ref={dishRippleRef}
                    cx="0"
                    cy="-4"
                    r="4"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.4)"
                    strokeWidth="1"
                    style={{ opacity: 0 }}
                  />

                  {/* Dish glyph */}
                  <path
                    d="M -6,-2 Q 0,3 6,-2"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="0"
                    y1="1"
                    x2="0"
                    y2="-6"
                    stroke="#ffffff"
                    strokeWidth="1"
                  />
                  <path
                    d="M -4,3 L 0,1 L 4,3"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />

                  {/* Mumbai label in DIN caps */}
                  <text
                    x="0"
                    y="18"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.75)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    KJSIT MUMBAI
                  </text>
                </g>
              </g>

              {/* ─── Orbit Arc ─── */}
              <path
                d="M 80,167 A 860 860 0 0 1 640,167"
                fill="none"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeDasharray="6 6"
                strokeWidth="1.2"
              />

              {/* ─── Contact Links (OFF dashed / ON white) ─── */}
              <g id="contact-links">
                {/* Link 1: SS-1 -> SS-2 */}
                <line
                  ref={link1InactiveRef}
                  x1="170"
                  y1="141"
                  x2="360"
                  y2="120"
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  style={{ opacity: 1 }}
                />
                <line
                  ref={link1ActiveRef}
                  x1="170"
                  y1="141"
                  x2="360"
                  y2="120"
                  stroke="rgba(255, 255, 255, 0.7)"
                  strokeWidth="1"
                  style={{ opacity: 0 }}
                />

                {/* Link 2: SS-2 -> SS-3 */}
                <line
                  ref={link2InactiveRef}
                  x1="360"
                  y1="120"
                  x2="540"
                  y2="139"
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  style={{ opacity: 1 }}
                />
                <line
                  ref={link2ActiveRef}
                  x1="360"
                  y1="120"
                  x2="540"
                  y2="139"
                  stroke="rgba(255, 255, 255, 0.7)"
                  strokeWidth="1"
                  style={{ opacity: 0 }}
                />

                {/* Link 3: SS-3 -> Ground */}
                <line
                  ref={link3InactiveRef}
                  x1="540"
                  y1="139"
                  x2="520"
                  y2="340"
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  style={{ opacity: 1 }}
                />
                <line
                  ref={link3ActiveRef}
                  x1="540"
                  y1="139"
                  x2="520"
                  y2="340"
                  stroke="rgba(255, 255, 255, 0.7)"
                  strokeWidth="1"
                  style={{ opacity: 0 }}
                />

                {/* Decoy Link: SS-1 -> Ground */}
                <line
                  ref={decoyInactiveRef}
                  x1="170"
                  y1="141"
                  x2="520"
                  y2="340"
                  stroke="rgba(255, 255, 255, 0.18)"
                  strokeDasharray="2 4"
                  strokeWidth="1"
                  style={{ opacity: 0.6 }}
                />
                <line
                  ref={decoyActiveRef}
                  x1="170"
                  y1="141"
                  x2="520"
                  y2="340"
                  stroke="rgba(255, 255, 255, 0.7)"
                  strokeWidth="1"
                  style={{ opacity: 0 }}
                />
              </g>

              {/* ─── Traveled Red Routes (permanent completed hops) ─── */}
              <g id="red-routes">
                <line
                  ref={redPath1Ref}
                  x1="170"
                  y1="141"
                  x2={reduced ? "360" : "170"}
                  y2={reduced ? "120" : "141"}
                  stroke="#ff453a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  style={{ opacity: reduced ? 1 : 0 }}
                />
                <line
                  ref={redPath2Ref}
                  x1="360"
                  y1="120"
                  x2={reduced ? "540" : "360"}
                  y2={reduced ? "139" : "120"}
                  stroke="#ff453a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  style={{ opacity: reduced ? 1 : 0 }}
                />
                <line
                  ref={redPath3Ref}
                  x1="540"
                  y1="139"
                  x2={reduced ? "520" : "540"}
                  y2={reduced ? "340" : "139"}
                  stroke="#ff453a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  style={{ opacity: reduced ? 1 : 0 }}
                />
              </g>

              {/* ─── Quality Badges for Links ─── */}
              <g id="link-badges">
                {/* Link 1 badge */}
                <g
                  ref={link1BadgeRef}
                  transform="translate(265, 118)"
                  style={{ opacity: 0 }}
                >
                  <text
                    ref={link1BadgeTextRef}
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.5)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      paintOrder: "stroke",
                      stroke: "#000000",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    q 91
                  </text>
                </g>

                {/* Link 2 badge */}
                <g
                  ref={link2BadgeRef}
                  transform="translate(450, 118)"
                  style={{ opacity: 0 }}
                >
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.5)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      paintOrder: "stroke",
                      stroke: "#000000",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    q 91
                  </text>
                </g>

                {/* Link 3 badge */}
                <g
                  ref={link3BadgeRef}
                  transform="translate(548, 240)"
                  style={{ opacity: 0 }}
                >
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.5)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      paintOrder: "stroke",
                      stroke: "#000000",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    q 84
                  </text>
                </g>

                {/* Decoy badge */}
                <g
                  ref={decoyBadgeRef}
                  transform="translate(325, 260)"
                  style={{ opacity: 0 }}
                >
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.5)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      paintOrder: "stroke",
                      stroke: "#000000",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    direct, arrives T+52
                  </text>
                </g>
              </g>

              {/* ─── Satellite Nodes & Waiting Rings ─── */}
              <g id="satellite-nodes">
                {/* SS-1 Node */}
                <g ref={node1GroupRef} transform="translate(170, 141)">
                  {/* Waiting ring */}
                  <circle
                    ref={waitRing1Ref}
                    r="9"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE}
                    transform="rotate(-90)"
                    style={{ opacity: 0 }}
                  />
                  <text
                    ref={waitLabel1Ref}
                    x="0"
                    y="-14"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.6)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 9,
                      letterSpacing: "0.04em",
                      opacity: 0,
                    }}
                  >
                    waiting 00:06
                  </text>

                  {/* Solid white circle core */}
                  <circle r="3.5" fill="#ffffff" />

                  {/* DIN Label */}
                  <text
                    x="0"
                    y="18"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.75)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    SS-1
                  </text>

                  {/* Status: 5px dot + plain words */}
                  <g transform="translate(0, 32)">
                    <circle cx="-23" cy="-3.5" r="2.5" fill="#30d158" />
                    <text
                      x="-16"
                      y="0"
                      fill="rgba(255, 255, 255, 0.55)"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                      }}
                    >
                      healthy
                    </text>
                  </g>
                </g>

                {/* SS-2 Node */}
                <g ref={node2GroupRef} transform="translate(360, 120)">
                  {/* Waiting ring */}
                  <circle
                    ref={waitRing2Ref}
                    r="9"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE}
                    transform="rotate(-90)"
                    style={{ opacity: 0 }}
                  />
                  <text
                    ref={waitLabel2Ref}
                    x="0"
                    y="-14"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.6)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 9,
                      letterSpacing: "0.04em",
                      opacity: 0,
                    }}
                  >
                    waiting 00:14
                  </text>

                  {/* Solid white circle core */}
                  <circle r="3.5" fill="#ffffff" />

                  {/* DIN Label */}
                  <text
                    x="0"
                    y="18"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.75)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    SS-2
                  </text>

                  {/* Status: 5px dot + plain words */}
                  <g transform="translate(0, 32)">
                    <circle cx="-33" cy="-3.5" r="2.5" fill="#ff9f0a" />
                    <text
                      x="-26"
                      y="0"
                      fill="rgba(255, 255, 255, 0.55)"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                      }}
                    >
                      low battery
                    </text>
                  </g>
                </g>

                {/* SS-3 Node */}
                <g ref={node3GroupRef} transform="translate(540, 139)">
                  {/* Waiting ring */}
                  <circle
                    ref={waitRing3Ref}
                    r="9"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE}
                    transform="rotate(-90)"
                    style={{ opacity: 0 }}
                  />
                  <text
                    ref={waitLabel3Ref}
                    x="0"
                    y="-14"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.6)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 9,
                      letterSpacing: "0.04em",
                      opacity: 0,
                    }}
                  >
                    waiting 00:16
                  </text>

                  {/* Solid white circle core */}
                  <circle r="3.5" fill="#ffffff" />

                  {/* DIN Label */}
                  <text
                    x="0"
                    y="18"
                    textAnchor="middle"
                    fill="rgba(255, 255, 255, 0.75)"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    SS-3
                  </text>

                  {/* Status: 5px dot + plain words */}
                  <g transform="translate(0, 32)">
                    <circle cx="-31" cy="-3.5" r="2.5" fill="#ff9f0a" />
                    <text
                      x="-24"
                      y="0"
                      fill="rgba(255, 255, 255, 0.55)"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                      }}
                    >
                      safe mode
                    </text>
                  </g>
                </g>
              </g>

              {/* ─── Moving Packet & Trail ─── */}
              <circle
                ref={trailDot2Ref}
                cx="0"
                cy="0"
                r="2"
                fill="#ff453a"
                style={{ opacity: 0 }}
              />
              <circle
                ref={trailDot1Ref}
                cx="0"
                cy="0"
                r="2.8"
                fill="#ff453a"
                style={{ opacity: 0 }}
              />

              <g
                ref={packetGroupRef}
                id="packet-indicator"
                transform={
                  reduced ? "translate(520, 340)" : "translate(170, 141)"
                }
              >
                <circle r="3.5" fill="#ff453a" />
              </g>
            </svg>
          </div>

          {/* Right Column: route_hop Inset-Grouped Card (~35% desktop, full-width mobile) */}
          <div
            className={`flex flex-col gap-3 ${
              mobile ? "w-full" : "w-full md:w-[36%]"
            }`}
          >
            {/* Apple inset-grouped Card */}
            <div className="flex flex-col rounded-[14px] bg-[#111113] p-4 sm:p-5">
              {/* Card Header: title + postgres eyebrow */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <span className="font-mono text-[13px] font-medium text-white">
                  route_hop
                </span>
                <span className="sx-eyebrow text-white/40">
                  PostgreSQL
                </span>
              </div>

              {/* Table Column Headers */}
              <div
                className={`grid items-center px-3 py-2 sx-eyebrow text-white/40 ${
                  mobile ? "grid-cols-3" : "grid-cols-3 md:grid-cols-5"
                }`}
              >
                <div>hop</div>
                <div>from</div>
                <div>to</div>
                {!mobile && (
                  <div className="hidden text-right md:block">depart</div>
                )}
                {!mobile && (
                  <div className="hidden text-right md:block">arrive</div>
                )}
              </div>

              {/* Table Rows (slide in upon hop completion) */}
              <div className="flex flex-col font-mono text-[12px]">
                {/* Row 1 */}
                <div
                  ref={row1Ref}
                  className={`grid items-center px-3 py-2 text-white/85 transition-colors duration-200 ${
                    mobile ? "grid-cols-3" : "grid-cols-3 md:grid-cols-5"
                  }`}
                  style={{
                    opacity: reduced ? 1 : 0,
                    transform: reduced ? "none" : "translateY(10px)",
                  }}
                >
                  <div className="text-white/50">1</div>
                  <div>SS-1</div>
                  <div>SS-2</div>
                  {!mobile && (
                    <div className="hidden text-right text-white/60 md:block">
                      T+06
                    </div>
                  )}
                  {!mobile && (
                    <div className="hidden text-right text-white/85 md:block">
                      T+06
                    </div>
                  )}
                </div>

                {/* Row 2 */}
                <div
                  ref={row2Ref}
                  className={`grid items-center border-t border-white/[0.08] px-3 py-2 text-white/85 transition-colors duration-200 ${
                    mobile ? "grid-cols-3" : "grid-cols-3 md:grid-cols-5"
                  }`}
                  style={{
                    opacity: reduced ? 1 : 0,
                    transform: reduced ? "none" : "translateY(10px)",
                  }}
                >
                  <div className="text-white/50">2</div>
                  <div>SS-2</div>
                  <div>SS-3</div>
                  {!mobile && (
                    <div className="hidden text-right text-white/60 md:block">
                      T+20
                    </div>
                  )}
                  {!mobile && (
                    <div className="hidden text-right text-white/85 md:block">
                      T+20
                    </div>
                  )}
                </div>

                {/* Row 3 */}
                <div
                  ref={row3Ref}
                  className={`grid items-center border-t border-white/[0.08] px-3 py-2 text-white/85 transition-colors duration-200 ${
                    mobile ? "grid-cols-3" : "grid-cols-3 md:grid-cols-5"
                  }`}
                  style={{
                    opacity: reduced ? 1 : 0,
                    transform: reduced ? "none" : "translateY(10px)",
                  }}
                >
                  <div className="text-white/50">3</div>
                  <div>SS-3</div>
                  <div>GS-BOM</div>
                  {!mobile && (
                    <div className="hidden text-right text-white/60 md:block">
                      T+36
                    </div>
                  )}
                  {!mobile && (
                    <div className="hidden text-right text-white/85 md:block">
                      T+36
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SQL Query typing chip */}
            <div
              ref={queryChipRef}
              className="flex items-center justify-between rounded-[10px] bg-[#0a0a0a] px-4 py-2.5 font-mono text-[13px] text-[#f0f0fa]"
              style={{ opacity: reduced ? 1 : 0 }}
            >
              <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
                <span className="text-white/40 select-none">sql&gt;</span>
                <span ref={queryTextRef} className="truncate text-white">
                  {reduced ? FULL_QUERY : ""}
                </span>
                <span
                  ref={cursorRef}
                  className="text-white"
                  style={{ opacity: reduced ? 0 : 1 }}
                >
                  █
                </span>
              </div>
              <span className="shrink-0 pl-2 sx-eyebrow text-white/30">
                RECURSIVE
              </span>
            </div>

            {/* Result Caption */}
            <div
              ref={captionRef}
              className="px-1 text-center font-sans text-[15px] leading-relaxed text-white/[0.62]"
              style={{
                opacity: reduced ? 1 : 0,
                transform: reduced ? "none" : "translateY(6px)",
              }}
            >
              <span>Earliest arrival </span>
              <span className="sx-num text-white">T+36</span>
              <span> · 3 hops · weakest link </span>
              <span className="sx-num text-white">q 84</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
