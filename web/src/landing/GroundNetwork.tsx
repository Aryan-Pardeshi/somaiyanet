import { useEffect, useRef } from "react";
import { SectionLabel } from "./SectionLabel";
import { loadLandMask } from "@/lib/landmask";
import { useStoryStats } from "@/hooks/useStats";

const STATIONS = [
  { id: "GS-BOM", name: "KJSIT Mumbai", lat: 19.0728, lng: 72.8826, passes: 29, primary: true },
  { id: "GS-HEL", name: "ReOrbit Espoo", lat: 60.2055, lng: 24.6559, passes: 59 },
  { id: "GS-BLR", name: "Bengaluru", lat: 12.9716, lng: 77.5946, passes: 33, below: true },
  { id: "GS-TYO", name: "Tokyo", lat: 35.6762, lng: 139.6503, passes: 36 },
  { id: "GS-SVB", name: "Svalbard", lat: 78.2232, lng: 15.6267, passes: 141 },
  { id: "GS-CPT", name: "Cape Town", lat: -33.9249, lng: 18.4241, passes: 34, below: true },
];

// map crop (equirectangular): drop Antarctica, like most network maps
const LAT_TOP = 82;
const LAT_BOTTOM = -58;
const W = 1600;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360);
const STEP = 9; // dot grid pitch in canvas px

const toX = (lng: number) => ((lng + 180) / 360) * W;
const toY = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

/** Dark dot-grid world map; each station is a blue halftone bloom on the same grid. */
export function GroundNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats } = useStoryStats();

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = W;
    canvas.height = H;
    void loadLandMask().then((mask) => {
      if (!alive || !mask) return;
      ctx.clearRect(0, 0, W, H);
      const maxPasses = Math.max(...STATIONS.map((s) => s.passes));
      const blooms = STATIONS.map((s) => ({
        x: toX(s.lng),
        y: toY(s.lat),
        r: 34 + (s.passes / maxPasses) * 46, // bloom radius by pass count
      }));
      for (let y = STEP / 2; y < H; y += STEP) {
        for (let x = STEP / 2; x < W; x += STEP) {
          const lat = LAT_TOP - (y / H) * (LAT_TOP - LAT_BOTTOM);
          const mx = Math.floor((x / W) * mask.width);
          const my = Math.floor(((90 - lat) / 180) * mask.height);
          const land = mask.isLand(mx, my);
          // strongest halftone influence at this grid point
          let k = 0;
          for (const b of blooms) {
            const d = Math.hypot(x - b.x, y - b.y);
            if (d < b.r) k = Math.max(k, 1 - d / b.r);
          }
          if (k > 0) {
            ctx.fillStyle = `rgba(61, 91, ${255}, ${0.35 + k * 0.65})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.2 + k * 3.3, 0, Math.PI * 2);
            ctx.fill();
          } else if (land) {
            ctx.fillStyle = "#2a2e38";
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
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
    <section className="border-t border-white/10" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1180px] px-6 py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-[18ch] font-light text-white" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
            Six stations. One of them is our college.
          </h2>
          <SectionLabel>GROUND NETWORK</SectionLabel>
        </div>

        <div className="relative mt-12" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="World map of the six ground stations" />
          {STATIONS.map((s) => (
            <div
              key={s.id}
              className="pointer-events-none absolute"
              style={{ left: `${(toX(s.lng) / W) * 100}%`, top: `${(toY(s.lat) / H) * 100}%` }}
            >
              <span
                className="absolute left-0 top-0 h-px w-8 bg-white/50"
                style={{ transform: `translate(6px, ${"below" in s ? 10 : -10}px) rotate(${"below" in s ? 30 : -30}deg)`, transformOrigin: "left" }}
              />
              <span className="absolute whitespace-nowrap" style={{ left: 34, top: "below" in s ? 14 : -34 }}>
                <span className={`block text-[13px] ${s.primary ? "text-white" : "text-[#c9d1e3]"}`}>{s.name}</span>
                <span className="font-mono block text-[10px] tracking-[0.08em] text-[#5f6f93]">
                  {s.id} · {s.passes} passes/day
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-10 border-t border-white/10 pt-10 sm:grid-cols-3">
          {[
            ["Telemetry rows", stats.telemetry_rows.toLocaleString()],
            ["Contacts in the next 24 h", stats.contacts_next_24h.toLocaleString()],
            ["AI decisions logged", stats.ai_decisions.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="font-light text-white" style={{ fontSize: "clamp(36px, 4vw, 52px)", letterSpacing: "-0.03em" }}>
                {v}
              </p>
              <p className="mt-1 text-[14px] text-[#9aa3b8]">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
