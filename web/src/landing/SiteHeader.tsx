import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/story/Brand";

/**
 * SiteHeader: hidden while #hero is on screen.
 * Slides down + fades in once the hero's bottom edge scrolls above the viewport (bottom <= 64).
 * Hides again when scrolling back into the hero.
 */
export function SiteHeader() {
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let rafId: number | null = null;

    const checkVisibility = (): void => {
      const hero = document.getElementById("hero");
      if (!hero) {
        setVisible(true);
        return;
      }
      const rect = hero.getBoundingClientRect();
      setVisible(rect.bottom <= 64);
    };

    checkVisibility();

    const onScroll = (): void => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        checkVisibility();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const motionClasses = reduced
    ? visible
      ? "opacity-100 pointer-events-auto"
      : "opacity-0 pointer-events-none"
    : visible
      ? "translate-y-0 opacity-100 pointer-events-auto transition-all duration-300 ease-out"
      : "-translate-y-full opacity-0 pointer-events-none transition-all duration-300 ease-in";

  return (
    <header
      inert={!visible ? true : undefined}
      aria-hidden={!visible}
      className={`fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)] ${motionClasses}`}
      style={{ height: 64 }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex shrink-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Brand />
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/console"
            className="font-mono inline-block border border-white/40 px-4 py-2 text-[12px] uppercase text-white transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d5bff]"
            style={{ letterSpacing: "0.08em" }}
          >
            <span>Take the console</span>
            <span aria-hidden="true" className="ml-1">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
