import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/story/Brand";

/**
 * SiteHeader: always visible fixed top bar, 64 px.
 * Transparent at the top; black at 72% with blur and a bottom
 * hairline once scrolled more than 8 px.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

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
        <nav aria-label="Sections" className="hidden min-w-0 items-center gap-7 md:flex">
          <a
            href="#network"
            className="transition-colors hover:text-white"
            style={{ fontSize: 14, color: "var(--sx-text-2)", textDecoration: "none" }}
          >
            Network
          </a>
          <a
            href="#database"
            className="transition-colors hover:text-white"
            style={{ fontSize: 14, color: "var(--sx-text-2)", textDecoration: "none" }}
          >
            Database
          </a>
          <a
            href="#roles"
            className="transition-colors hover:text-white"
            style={{ fontSize: 14, color: "var(--sx-text-2)", textDecoration: "none" }}
          >
            Roles
          </a>
          <a
            href="#pages"
            className="transition-colors hover:text-white"
            style={{ fontSize: 14, color: "var(--sx-text-2)", textDecoration: "none" }}
          >
            Pages
          </a>
        </nav>
        <div className="flex shrink-0 items-center">
          <Link to="/console" className="sx-btn sx-btn--sm">
            Open Console
          </Link>
        </div>
      </div>
    </header>
  );
}
