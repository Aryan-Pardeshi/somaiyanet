import { Link } from "react-router-dom";

/** CTA banner: blurred Earth horizon under a dark wash, light headline, console button. */
export function CtaBanner() {
  return (
    <section className="border-t border-white/10 py-28" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="relative overflow-hidden border border-white/15 bg-black px-6 py-20 md:px-12 md:py-24">
          {/* Blurred Earth horizon behind a dark wash: the one photographic moment at the end */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}assets/textures/earth_day.jpg)`,
              backgroundSize: "cover",
              backgroundPosition: "center 70%",
              filter: "blur(18px)",
              transform: "scale(1.15)",
            }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "rgba(3,7,24,0.74)" }} />

          <div className="relative z-10 flex flex-col items-center text-center">
            <h2
              className="max-w-[20ch] font-light text-white"
              style={{ fontSize: "clamp(32px, 4vw, 56px)", lineHeight: 1.08, letterSpacing: "-0.025em" }}
            >
              Watch PostgreSQL fly a satellite.
            </h2>
            <p className="mt-5 max-w-[54ch] text-[16px] leading-relaxed text-[#9aa3b8]">
              Inspect live telemetry, trace inter-satellite routing graphs, and verify engine-level access control in the mission console.
            </p>
            <Link
              to="/console"
              className="font-mono mt-8 inline-flex items-center gap-2 border border-white/40 px-6 py-3 text-[13px] uppercase text-white transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d5bff]"
              style={{ letterSpacing: "0.08em" }}
            >
              <span>Take the console</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
