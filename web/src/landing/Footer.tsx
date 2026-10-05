import { Link } from "react-router-dom";

/**
 * Footer: pure black, technical white line-art horizon with PocketQube silhouette,
 * plain English institutional credits, and accessible navigation links.
 */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black" style={{ background: "#000" }}>
      {/* Navigation and project credentials */}
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 md:grid-cols-4">
        {/* Brand & project scope */}
        <div className="md:col-span-2">
          <Link to="/" className="inline-flex items-center gap-2 text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white">
            <span aria-hidden="true" className="inline-block size-[8px] rounded-full" style={{ background: "var(--somaiya)" }} />
            <span className="text-[18px] font-light tracking-tight">SomaiyaNet</span>
          </Link>
          <p className="mt-4 max-w-[46ch] text-[13.5px] leading-relaxed text-[#9aa3b8]">
            Autonomous four-satellite PocketQube constellation routing and telemetry engine built entirely in PostgreSQL for amateur radio and Earth observation.
          </p>
          <div className="mt-6 border-l border-white/15 pl-4">
            <p className="text-[12px] text-[#9aa3b8]">
              Department of Computer Engineering
            </p>
            <p className="text-[12px] text-[#9aa3b8]">
              K. J. Somaiya Institute of Technology & K. J. Somaiya College of Engineering
            </p>
            <p className="mt-1 text-[12px] text-[#5f6f93]">
              In collaboration with ReOrbit, Helsinki, Finland
            </p>
          </div>
        </div>

        {/* Console links */}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/50">
            Mission Control
          </p>
          <ul className="mt-4 space-y-2.5 text-[13px]">
            <li>
              <Link to="/console" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Live Console
              </Link>
            </li>
            <li>
              <Link to="/ops" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Operations
              </Link>
            </li>
            <li>
              <Link to="/routing" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Graph Routing
              </Link>
            </li>
            <li>
              <Link to="/brain" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Decision Tree
              </Link>
            </li>
            <li>
              <Link to="/deploy" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Pod Deployment
              </Link>
            </li>
          </ul>
        </div>

        {/* Database experiments */}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/50">
            Database Labs
          </p>
          <ul className="mt-4 space-y-2.5 text-[13px]">
            <li>
              <Link to="/labs/eer" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Generalization (EER)
              </Link>
            </li>
            <li>
              <Link to="/labs/mapping" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Relational Mapping
              </Link>
            </li>
            <li>
              <Link to="/labs/routing" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Recursive CGR Routing
              </Link>
            </li>
            <li>
              <Link to="/labs/security" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Row-Level Security
              </Link>
            </li>
            <li>
              <Link to="/labs/indexing" className="text-[#9aa3b8] transition-colors hover:text-white focus-visible:outline-none focus-visible:underline">
                Index Benchmarks
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Technical academic credits */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-[12px] text-[#5f6f93]">
          <p>
            Faculty Guidance: Dr. Umesh Shinde (KJSIT) · Dr. Shailesh Nikam (KJSSE)
          </p>
          <p className="font-mono text-[11px]">
            SPEC KJS-SRS-01 · SOMAIYASAT POCKETQUBE · SOMAIYAPOD
          </p>
        </div>
      </div>

      {/* White line-art Earth horizon with PocketQube silhouette */}
      <div className="relative h-28 overflow-hidden border-t border-white/10" aria-hidden="true">
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Earth limb line art */}
          <path d="M -50 125 Q 600 35 1250 125" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.8" />
          <path d="M -50 135 Q 600 45 1250 135" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.3" />
          <path d="M -50 145 Q 600 55 1250 145" stroke="#ffffff" strokeWidth="0.8" strokeDasharray="4 6" fill="none" opacity="0.15" />

          {/* Meridian tick lines */}
          {Array.from({ length: 13 }).map((_, i) => {
            const x = 100 + i * 83;
            return (
              <line
                key={i}
                x1={x}
                y1={65}
                x2={x}
                y2={75}
                stroke="#ffffff"
                strokeWidth="0.8"
                opacity={0.3}
              />
            );
          })}

          {/* PocketQube satellite silhouette in orbit */}
          <g transform="translate(600, 48)">
            {/* Bus body */}
            <rect x="-6" y="-6" width="12" height="12" stroke="#ffffff" strokeWidth="1" fill="#000000" />
            <line x1="-6" y1="0" x2="6" y2="0" stroke="#ffffff" strokeWidth="0.8" />
            {/* Solar wings */}
            <line x1="-12" y1="0" x2="-6" y2="0" stroke="#ffffff" strokeWidth="1" />
            <rect x="-24" y="-5" width="12" height="10" stroke="#ffffff" strokeWidth="1" fill="#000000" />
            <line x1="-18" y1="-5" x2="-18" y2="5" stroke="#ffffff" strokeWidth="0.8" />
            <line x1="6" y1="0" x2="12" y2="0" stroke="#ffffff" strokeWidth="1" />
            <rect x="12" y="-5" width="12" height="10" stroke="#ffffff" strokeWidth="1" fill="#000000" />
            <line x1="18" y1="-5" x2="18" y2="5" stroke="#ffffff" strokeWidth="0.8" />
            {/* Antennas */}
            <line x1="0" y1="-6" x2="0" y2="-11" stroke="#ffffff" strokeWidth="1" />
            <line x1="0" y1="6" x2="0" y2="10" stroke="#ffffff" strokeWidth="1" />
            {/* Red packet dot */}
            <circle cx="0" cy="0" r="2.5" fill="#ff3b4f" />
          </g>
        </svg>

        <div className="font-mono absolute bottom-3 right-6 text-[10px] tracking-[0.08em] text-[#5f6f93]">
          EXOSAT GEOMETRY // 525 KM SUN-SYNCHRONOUS
        </div>
      </div>
    </footer>
  );
}
