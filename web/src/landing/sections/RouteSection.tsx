import { useEffect, useRef, useState } from "react";
import { RouteDiagram } from "@/landing/hero/RouteDiagram";

/**
 * The mission-clock route diagram (restored from the old hero finale) as its own section: the
 * section is tall, its inner screen sticks, and scrolling through it runs the diagram's clock
 * from T+00 to T+60 (RouteDiagram's progress 0.70 to 0.98).
 */
export function RouteSection() {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0.7);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const local = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 1;
      progress.current = 0.7 + 0.3 * local;
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = (): void => {
      setMobile(window.innerWidth < 768);
      onScroll();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      id="route"
      ref={section}
      className={reduced ? "relative" : "relative h-[280vh]"}
      style={{ background: "var(--lx-space)" }}
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <RouteDiagram progress={progress} reduced={reduced} mobile={mobile} />
      </div>
    </section>
  );
}
