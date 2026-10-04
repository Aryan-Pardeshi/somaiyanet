import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/** Fixed 64px bar: red packet dot + SomaiyaNet left, bordered button right. */
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
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-black/80 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
          : "border-b border-transparent bg-transparent"
      }`}
      style={{ height: 64 }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex shrink-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span
            aria-hidden="true"
            className="inline-block size-[8px] rounded-full"
            style={{ background: "var(--somaiya)" }}
          />
          <span className="text-[17px] font-light tracking-tight text-white">
            SomaiyaNet
          </span>
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
