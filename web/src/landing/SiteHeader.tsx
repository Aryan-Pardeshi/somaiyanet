import { useEffect } from "react";
import { Link } from "react-router-dom";

/** Fixed 64px bar: red packet dot + SomaiyaNet left, bordered button right. */
export function SiteHeader() {
  useEffect(() => {
    const onScroll = (): void => {
      const el = document.getElementById("site-header");
      if (!el) return;
      el.style.background =
        window.scrollY > 8 ? "rgba(0,0,0,0.72)" : "transparent";
      el.style.backdropFilter = window.scrollY > 8 ? "blur(12px)" : "none";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      id="site-header"
      className="fixed inset-x-0 top-0 z-40 border-b border-white/10"
      style={{ height: 64 }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center px-6">
        <Link to="/" aria-label="SomaiyaNet home" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-[8px] rounded-full"
            style={{ background: "var(--somaiya)" }}
          />
          <span className="text-[17px] font-light tracking-tight text-white">
            SomaiyaNet
          </span>
        </Link>
        <div className="ml-auto">
          <Link
            to="/console"
            className="font-mono inline-block border border-white/40 px-4 py-2 text-[12px] uppercase text-white transition-colors hover:border-white hover:bg-white hover:text-black"
            style={{ letterSpacing: "0.08em" }}
          >
            Take the console ↗
          </Link>
        </div>
      </div>
    </header>
  );
}
