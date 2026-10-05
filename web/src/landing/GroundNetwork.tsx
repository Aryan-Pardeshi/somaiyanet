import { useEffect, useRef } from "react";
import { loadLandMask } from "@/lib/landmask";
import { useStoryStats } from "@/hooks/useStats";

const STATIONS = [
  { id: "GS-BOM", name: "KJSIT Mumbai", lat: 19.0728, lng: 72.8826, passes: 12, primary: true },
  { id: "GS-HEL", name: "ReOrbit Espoo", lat: 60.2055, lng: 24.6559, passes: 22 },
  { id: "GS-BLR", name: "Bengaluru", lat: 12.9716, lng: 77.5946, passes: 14, below: true },
  { id: "GS-TYO", name: "Tokyo", lat: 35.6762, lng: 139.6503, passes: 18 },
  { id: "GS-SVB", name: "Svalbard", lat: 78.2232, lng: 15.6267, passes: 57, below: true },
  { id: "GS-CPT", name: "Cape Town", lat: -33.9249, lng: 18.4241, passes: 18, below: true },
];

// map crop (equirectangular): drop Antarctica, like most network maps
const LAT_TOP = 82;
const LAT_BOTTOM = -58;
const W = 1600;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360);
const STEP = 8; // dot grid pitch in canvas px

const toX = (lng: number) => ((lng + 180) / 360) * W;
const toY = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

/** Dark dot-grid world map; minimal station dots with pass-encoded hairline rings. */
export function GroundNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats } = useStoryStats();

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    void loadLandMask().then((mask) => {
      if (!alive || !mask) return;
      ctx.clearRect(0, 0, W, H);
      for (let y = STEP / 2; y < H; y += STEP) {
        for (let x = STEP / 2; x < W; x += STEP) {
          const lat = LAT_TOP - (y / H) * (LAT_TOP - LAT_BOTTOM);
          const mx = Math.floor((x / W) * mask.width);
          const my = Math.floor(((90 - lat) / 180) * mask.height);
          const land = mask.isLand(mx, my);
          if (land) {
            let alphaMod = 1.0;
            const ratio = y / H;
            if (ratio < 0.08) {
              alphaMod = 0.6 + 0.4 * (ratio / 0.08);
            } else if (ratio > 0.92) {
              alphaMod = 0.6 + 0.4 * ((1 - ratio) / 0.08);
            }
            ctx.fillStyle = `rgba(235, 235, 245, ${0.32 * alphaMod})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="sx-section border-t border-[color:var(--sx-hairline)] bg-black">
      <div className="mx-auto max-w-[1200px] px-6">
        <div>
          <p className="sx-eyebrow">Ground network</p>
          <h2 className="sx-h2 mt-3">Six stations. One of them is our college.</h2>
          <p className="sx-lead mt-4">
            Amateur ground stations across six latitudes schedule contact passes and ingest downlink telemetry as the constellation passes overhead.
          </p>
        </div>

        <div
          className="relative mt-12 overflow-hidden rounded-[14px] border border-[color:var(--sx-hairline)] bg-black"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full opacity-70"
            style={{ filter: "grayscale(1) brightness(0.7)" }}
            role="img"
            aria-label="World map showing the six SomaiyaNet ground stations"
          />
          {STATIONS.map((s) => {
            const isEast = s.lng > 90;
            const isBelow = "below" in s && Boolean(s.below);
            const xPercent = (toX(s.lng) / W) * 100;
            const yPercent = (toY(s.lat) / H) * 100;
            const maxPasses = 57;
            const dotRadius = 2.5 + (s.passes / maxPasses) * 1.5;
            const ringRadius = 7 + (s.passes / maxPasses) * 13;
            const isPrimary = "primary" in s && Boolean(s.primary);

            return (
              <div
                key={s.id}
                className="pointer-events-none absolute"
                style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
              >
                {/* Hairline ring encoding passes per day */}
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25"
                  style={{ width: `${ringRadius * 2}px`, height: `${ringRadius * 2}px` }}
                />
                {/* Station marker dot: solid white; KJSIT Mumbai is #ff453a */}
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: `${dotRadius * 2}px`,
                    height: `${dotRadius * 2}px`,
                    backgroundColor: isPrimary ? "var(--sx-red)" : "#ffffff",
                  }}
                />

                {/* Callouts: hidden on mobile */}
                <div className="hidden md:block">
                  {/* Thin 1px white 30% leader line */}
                  <span
                    className="absolute top-0 h-px w-6 bg-white/30 sm:w-8"
                    style={{
                      left: isEast ? -28 : 4,
                      transform: `translate(${isEast ? 0 : 2}px, ${isBelow ? 8 : -8}px) rotate(${
                        isEast ? (isBelow ? -25 : 25) : isBelow ? 25 : -25
                      }deg)`,
                      transformOrigin: isEast ? "right" : "left",
                    }}
                  />
                  {/* Station callout text: station name in DIN caps 12px white, passes in system font 13px white 60% */}
                  <div
                    className={`absolute ${isEast ? "right-8 text-right" : "left-8 text-left"} whitespace-nowrap`}
                    style={{ top: isBelow ? 12 : -32 }}
                  >
                    <span className="font-[family-name:var(--font-display)] uppercase text-[12px] font-semibold tracking-[0.04em] text-white block">
                      {s.name}
                    </span>
                    <span className="font-[family-name:var(--font-sans)] text-[13px] text-white/60 block leading-tight mt-0.5">
                      {s.passes} passes a day
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Phone list: .sx-group + .sx-row (name left, passes right .sx-num) */}
        <div className="sx-group mt-6 md:hidden">
          {STATIONS.map((s) => (
            <div key={s.id} className="sx-row">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: "primary" in s && s.primary ? "var(--sx-red)" : "#ffffff" }}
                />
                <span className="text-[15px] font-medium text-white">{s.name}</span>
              </div>
              <span className="sx-num text-[13px] text-[color:var(--sx-text-2)]">
                {s.passes} passes a day
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-8 border-t border-[color:var(--sx-hairline)] pt-12 sm:grid-cols-3">
          {[
            ["Telemetry rows recorded", stats.telemetry_rows.toLocaleString()],
            ["Scheduled contact passes (24 h)", stats.contacts_next_24h.toLocaleString()],
            ["Autonomous routing decisions", stats.ai_decisions.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="sx-num text-[clamp(34px,4vw,48px)] font-bold leading-none text-white">
                {v}
              </p>
              <p className="mt-2 sx-caption">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
