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
  const [scrolled, setScrolled] = useState(false);
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
      } else {
        const rect = hero.getBoundingClientRect();
        setVisible(rect.bottom <= 64);
      }
      setScrolled(window.scrollY > 8);
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
      className={`fixed inset-x-0 top-0 z-40 ${motionClasses}`}
      style={{
        height: 64,
        background: scrolled ? "rgba(0, 0, 0, 0.8)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
      }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 overflow-hidden px-8">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex shrink-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Brand />
        </Link>
        <nav aria-label="Sections" className="hidden min-w-0 items-center md:flex">
          <a href="#mission" className="sx-eyebrow px-8 py-6 text-white/75 transition-colors hover:text-white">
            Mission
          </a>
          <a href="#journey" className="sx-eyebrow px-8 py-6 text-white/75 transition-colors hover:text-white">
            Journey
          </a>
          <a href="#spacecraft" className="sx-eyebrow px-8 py-6 text-white/75 transition-colors hover:text-white">
            Spacecraft
          </a>
        </nav>
        <div className="flex shrink-0 items-center">
          <Link to="/console" className="sx-btn sx-btn--sm">
            <span>Take the console</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
