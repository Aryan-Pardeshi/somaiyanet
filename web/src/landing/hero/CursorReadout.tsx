import { useEffect, useRef, type RefObject } from "react";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const LABEL_W = 132;
const LABEL_H = 34;

function fmt(v: number, pos: string, neg: string, width: number): string {
  return `${Math.abs(v).toFixed(4).padStart(width, "0")}° ${v >= 0 ? pos : neg}`;
}

/**
 * Hero cursor: a dot on the pointer, a ring that trails it, and a fake
 * latitude/longitude readout mapped from the pointer position over the viewport.
 * Only shown over the hero, and only for mouse/trackpad users.
 */
export function CursorReadout({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const latEl = useRef<HTMLSpanElement>(null);
  const lonEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    const wrapEl = wrap.current;
    if (!target || !wrapEl || !window.matchMedia(FINE_POINTER).matches) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = { x: 0, y: 0 };
    const lag = { x: 0, y: 0 };
    let visible = false;
    let raf = 0;

    const prevCursor = target.style.cursor;
    target.style.cursor = "none";

    const frame = (): void => {
      raf = 0;
      const k = reduced ? 1 : 0.2;
      lag.x += (pos.x - lag.x) * k;
      lag.y += (pos.y - lag.y) * k;

      if (dot.current) dot.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${lag.x}px, ${lag.y}px, 0)`;
      if (label.current) {
        // Flip the readout to the other side of the pointer near the viewport edges.
        const flipX = pos.x > window.innerWidth - LABEL_W - 40;
        const flipY = pos.y > window.innerHeight - LABEL_H - 40;
        const lx = lag.x + (flipX ? -(LABEL_W + 16) : 16);
        const ly = lag.y + (flipY ? -(LABEL_H + 14) : 14);
        label.current.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
        label.current.style.textAlign = flipX ? "right" : "left";
      }
      if (latEl.current && lonEl.current) {
        latEl.current.textContent = fmt(90 - (pos.y / window.innerHeight) * 180, "N", "S", 7);
        lonEl.current.textContent = fmt((pos.x / window.innerWidth) * 360 - 180, "E", "W", 8);
      }

      const settled = Math.abs(pos.x - lag.x) < 0.1 && Math.abs(pos.y - lag.y) < 0.1;
      if (visible && !settled) raf = requestAnimationFrame(frame);
    };
    const kick = (): void => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const setVisible = (v: boolean): void => {
      visible = v;
      wrapEl.style.opacity = v ? "1" : "0";
    };

    const onMove = (e: PointerEvent): void => {
      // Header and other overlays are not inside the hero, so they hide the readout.
      const inside = e.pointerType === "mouse" && target.contains(e.target as Node);
      if (!inside) {
        if (visible) setVisible(false);
        return;
      }
      if (!visible) {
        lag.x = e.clientX;
        lag.y = e.clientY;
        setVisible(true);
      }
      pos.x = e.clientX;
      pos.y = e.clientY;
      kick();
    };
    const onLeave = (): void => setVisible(false);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      target.style.cursor = prevCursor;
    };
  }, [targetRef]);

  return (
    <div
      ref={wrap}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[35] overflow-hidden transition-opacity duration-200"
      style={{ opacity: 0 }}
    >
      <div
        ref={ring}
        className="absolute left-0 top-0 will-change-transform"
      >
        <div className="-ml-[14px] -mt-[14px] h-7 w-7 rounded-full border border-[#7fb2ff]/50" />
      </div>
      <div ref={dot} className="absolute left-0 top-0 will-change-transform">
        <div className="-ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_2px_rgba(127,178,255,0.8)]" />
      </div>
      <div
        ref={label}
        className="absolute left-0 top-0 font-mono text-[10px] leading-[1.7] tracking-[0.12em] text-[#9fc2ff] will-change-transform"
        style={{ width: LABEL_W }}
      >
        <div className="flex justify-between gap-2">
          <span className="text-[#5f6f93]">LAT</span>
          <span ref={latEl} className="tabular-nums" />
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[#5f6f93]">LON</span>
          <span ref={lonEl} className="tabular-nums" />
        </div>
      </div>
    </div>
  );
}
