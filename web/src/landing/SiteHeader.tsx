import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/story/Brand";
import { RAIL, SCENES, useActiveSection } from "@/landing/space/scroll";

/**
 * SiteHeader: always visible fixed top bar, 64 px.
 * Transparent at the top; black at 72% with blur and a bottom
 * hairline once scrolled more than 8 px.
 *
 * Brief 31c: brand left, nav centred as uppercase tracked labels with the current section in
 * lime, a ghost "Open Console" pill on the right.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const activeId = RAIL[useActiveSection()].id;

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-40"
      style={{
        height: 64,
        background: scrolled ? "rgba(0, 0, 0, 0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(24px) saturate(160%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(24px) saturate(160%)" : "none",
        borderBottom: scrolled ? "1px solid var(--sx-hairline)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Brand />
        </Link>
        <nav
          aria-label="Sections"
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-8 md:flex"
        >
          {SCENES.map((scene) => (
            <a
              key={scene.id}
              href={`#${scene.id}`}
              aria-current={activeId === scene.id ? "true" : undefined}
              className="lx-nav-link"
            >
              {scene.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center">
          <Link to="/console" className="sx-btn lx-btn lx-btn--sm">
            Open Console
          </Link>
        </div>
      </div>
    </header>
  );
}
