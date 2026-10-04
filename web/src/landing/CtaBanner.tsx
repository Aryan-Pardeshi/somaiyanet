import { Link } from "react-router-dom";

/**
 * CTA banner: pure black with technical white line-art orbital horizon,
 * light Geist headline, and bordered console action.
 */
export function CtaBanner() {
  return (
    <section className="border-t border-white/10 py-28" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="relative overflow-hidden border border-white/15 bg-black px-6 py-20 md:px-12 md:py-24">
          {/* White line-art background graphic: wireframe horizon, orbital arcs & packet dot */}
          <svg
            viewBox="0 0 1000 400"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
            aria-hidden="true"
          >
            {/* Horizon curved arcs */}
            <path d="M -100 480 Q 500 240 1100 480" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.6" />
            <path d="M -100 510 Q 500 270 1100 510" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.3" />
            <path d="M -100 540 Q 500 300 1100 540" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.15" />

            {/* Meridians */}
            <path d="M 500 285 L 500 400" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.4" />
            <path d="M 280 305 L 230 400" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.3" />
            <path d="M 720 305 L 770 400" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.3" />

            {/* Orbital trajectories */}
            <path d="M 120 80 Q 500 180 880 80" stroke="#ffffff" strokeWidth="1" strokeDasharray="4 6" opacity="0.4" />
            <path d="M 80 180 Q 500 90 920 180" stroke="#3d5bff" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.7" />

            {/* Downlink beam to station */}
            <line x1="500" y1="135" x2="500" y2="285" stroke="#3d5bff" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
            <circle cx="500" cy="285" r="3" fill="#ffffff" />
            <circle cx="500" cy="285" r="7" stroke="#3d5bff" strokeWidth="1" fill="none" opacity="0.7" />

            {/* Line-art satellite on orbit */}
            <g transform="translate(500, 135)">
              <rect x="-8" y="-6" width="16" height="12" stroke="#ffffff" strokeWidth="1" fill="#000000" />
              <line x1="-16" y1="0" x2="-8" y2="0" stroke="#ffffff" strokeWidth="1" />
              <rect x="-24" y="-4" width="8" height="8" stroke="#ffffff" strokeWidth="0.8" fill="#000000" />
              <line x1="8" y1="0" x2="16" y2="0" stroke="#ffffff" strokeWidth="1" />
              <rect x="16" y="-4" width="8" height="8" stroke="#ffffff" strokeWidth="0.8" fill="#000000" />
              {/* Travelling packet dot */}
              <circle cx="0" cy="0" r="3" fill="#ff3b4f" />
            </g>
          </svg>

          {/* Technical blueprint annotation */}
          <div className="font-mono pointer-events-none absolute left-6 top-6 hidden text-[10px] tracking-[0.12em] text-[#5f6f93] sm:block">
            SYS_STAGE // FLIGHT READY
          </div>
          <div className="font-mono pointer-events-none absolute right-6 top-6 hidden text-[10px] tracking-[0.12em] text-[#5f6f93] sm:block">
            ALT 525 KM · INC 97.5° · GS-BOM
          </div>

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
