import { useEffect, useState } from "react";

/**
 * Scroll position shared by the 3D backdrop (SpaceScene) and the section rail.
 *
 * The landing page has four full-height sections, in this order, each a <section> whose id is
 * one of SCENES. scenePosition() is 0 while the first section's top is at the viewport top,
 * 1 when the second section's top reaches the viewport top, and so on, up to 3. Between two
 * sections it is fractional, so the scene can interpolate between its keyframes.
 */
export const SCENES = [
  { id: "network", label: "Network" },
  { id: "satellites", label: "Satellites" },
  { id: "downlink", label: "Downlink" },
  { id: "database", label: "Database" },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export function scenePosition(): number {
  const tops: number[] = [];
  for (const s of SCENES) {
    const el = document.getElementById(s.id);
    if (!el) return 0;
    tops.push(el.getBoundingClientRect().top);
  }
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i] > 0) continue;
    if (i === tops.length - 1) return i;
    const span = tops[i + 1] - tops[i];
    return span > 0 ? i + Math.min(1, -tops[i] / span) : i;
  }
  return 0;
}

/** Index of the section that fills most of the viewport (for the rail and header). */
export function useActiveScene(): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      setActive(Math.round(scenePosition()));
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}

/** Wide layout: text beside the Earth. Narrow (phones, portrait tablets): text under it. */
export function isWideViewport(): boolean {
  return window.innerWidth >= 1024 && window.innerWidth / window.innerHeight >= 1.2;
}

/**
 * Every section the rail and header name, in page order: the four 3D scenes plus the restored
 * story sections between Downlink and Database (they sit on an opaque band over the scene).
 */
export const RAIL = [
  { id: "network", label: "Network" },
  { id: "satellites", label: "Satellites" },
  { id: "downlink", label: "Downlink" },
  { id: "journey", label: "Packet" },
  { id: "route", label: "Route" },
  { id: "spacecraft", label: "Hardware" },
  { id: "database", label: "Database" },
] as const;

/** Index into RAIL of the section under the middle of the viewport. */
export function useActiveSection(): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const mid = window.innerHeight * 0.5;
      let idx = 0;
      RAIL.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= mid) idx = i;
      });
      setActive(idx);
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}
