import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { GlassConfig } from "@ybouane/liquidglass";

/**
 * Real liquid glass (WebGL refraction) for the ops console, via @ybouane/liquidglass.
 *
 * The library needs every glass element to be a direct child of one root, and it
 * samples only that root's children. The live globe is a WebGL canvas outside the
 * root, so a hidden 2D "mirror" canvas inside the root copies it each tick.
 * Each slab is therefore rendered twice, as siblings sharing the same box:
 *   1. an empty shape element (the glass; the library injects its shader canvas)
 *   2. a content layer on top (the real, interactive React content)
 * Keeping content out of the glass element stops the library re-rasterising the
 * rails (html-to-image) on every DOM change.
 */

export interface GlassSlab {
  key: string;
  /** Positioning/size classes, applied to both the shape and the content layer. */
  className: string;
  config: Partial<GlassConfig>;
  /** Clip content to the slab's rounded box (default true; off for pills with outer glow). */
  clip?: boolean;
  children: ReactNode;
}

interface LiquidOverlayProps {
  /** Element holding the globe's WebGL canvas. */
  globeRef: RefObject<HTMLElement | null>;
  slabs: GlassSlab[];
  /** Called when WebGL / the library is unavailable so the caller can fall back to CSS glass. */
  onFail: () => void;
}

/** Mirror refresh interval (ms). The globe turns slowly, so ~20 fps is indistinguishable. */
const MIRROR_INTERVAL_MS = 50;

export function LiquidOverlay({ globeRef, slabs, onFail }: LiquidOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    const root = rootRef.current;
    const mirror = mirrorRef.current;
    if (!root || !mirror) return;

    let cancelled = false;
    let timer = 0;
    let instance: { destroy: () => void; markChanged: (el?: HTMLElement) => void } | null = null;

    const paintMirror = (): boolean => {
      const src = globeRef.current?.querySelector("canvas");
      if (!src || src.width === 0 || src.height === 0) return false;
      const rr = root.getBoundingClientRect();
      const w = Math.max(1, Math.round(rr.width));
      const h = Math.max(1, Math.round(rr.height));
      if (mirror.width !== w || mirror.height !== h) {
        mirror.width = w;
        mirror.height = h;
      }
      const ctx = mirror.getContext("2d");
      if (!ctx) return false;
      // The library's scene defaults to white; the page behind the globe is black.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const gr = src.getBoundingClientRect();
      ctx.drawImage(src, gr.left - rr.left, gr.top - rr.top, gr.width, gr.height);
      return true;
    };

    void (async () => {
      try {
        const { LiquidGlass } = await import("@ybouane/liquidglass");
        if (cancelled) return;
        paintMirror();
        const shapes = Array.from(root.querySelectorAll<HTMLElement>("[data-glass]"));
        const lg = await LiquidGlass.init({
          root,
          glassElements: shapes,
          defaults: { brightness: -0.3, blurAmount: 0.25 },
        });
        if (cancelled) {
          lg.destroy();
          return;
        }
        instance = lg;
        timer = window.setInterval(() => {
          if (document.hidden) return;
          if (paintMirror()) lg.markChanged(mirror);
        }, MIRROR_INTERVAL_MS);
        setReady(true);
      } catch (err) {
        console.warn("LiquidGlass unavailable, using CSS glass:", err);
        if (!cancelled) onFailRef.current();
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      instance?.destroy();
    };
  }, [globeRef]);

  return (
    <div
      ref={rootRef}
      data-lg={ready ? "ready" : "pending"}
      className="pointer-events-none absolute inset-0 z-20"
    >
      <canvas
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      {slabs.map((s) => (
        <div
          key={`${s.key}-glass`}
          data-glass
          data-config={JSON.stringify(s.config)}
          aria-hidden="true"
          className={`pointer-events-none absolute ${s.className}`}
        />
      ))}
      {slabs.map((s) => (
        <div
          key={`${s.key}-content`}
          data-dynamic
          className={`lg-content pointer-events-auto absolute ${s.className} ${
            s.clip === false ? "" : "overflow-hidden"
          } ${ready ? "" : "liquid-glass"}`}
        >
          {s.children}
        </div>
      ))}
    </div>
  );
}
