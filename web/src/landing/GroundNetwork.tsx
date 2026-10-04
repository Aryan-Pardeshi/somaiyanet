import { useEffect, useRef } from "react";
import { SectionLabel } from "./SectionLabel";
import { loadLandMask } from "@/lib/landmask";
import { useStoryStats } from "@/hooks/useStats";

const STATIONS = [
  { id: "GS-BOM", lat: 19.0728, lng: 72.8826, fallback: 29 },
  { id: "GS-HEL", lat: 60.2055, lng: 24.6559, fallback: 59 },
  { id: "GS-BLR", lat: 12.9716, lng: 77.5946, fallback: 33 },
  { id: "GS-TYO", lat: 35.6762, lng: 139.6503, fallback: 36 },
  { id: "GS-SVB", lat: 78.2232, lng: 15.6267, fallback: 141 },
  { id: "GS-CPT", lat: -33.9249, lng: 18.4241, fallback: 34 },
];

function lngToX(lng: number, w: number): number {
  return ((lng + 180) / 360) * w;
}
function latToY(lat: number, h: number): number {
  return ((90 - lat) / 180) * h;
}

/** Dark dot-grid world map from land_mask.png + royal halftone clusters. */
export function GroundNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stats } = useStoryStats();

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = (canvas.width = 960);
    const H = (canvas.height = 480);
    void loadLandMask().then((mask) => {
      if (!alive || !mask) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const step = 6;
      ctx.fillStyle = "#1a1a1a";
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          const mx = Math.floor((x / W) * mask.width);
          const my = Math.floor((y / H) * mask.height);
          if (mask.isLand(mx, my)) {
            ctx.beginPath();
            ctx.arc(x, y, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // royal halftone clusters over stations, sized by downlink counts
      const max = Math.max(...STATIONS.map((s) => s.fallback));
      for (const s of STATIONS) {
        const cx = lngToX(s.lng, W);
        const cy = latToY(s.lat, H);
        const r = 8 + (s.fallback / max) * 22;
        ctx.fillStyle = "#2442ff";
        for (let ring = 0; ring < 4; ring++) {
          const rr = r * (1 - ring * 0.24);
          const n = 10 - ring * 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + ring * 0.5;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.55, 3.4 - ring * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = "#9aa3b8";
        ctx.font = "11px 'Geist Mono', monospace";
        ctx.fillText(s.id, cx + 8, cy - 8);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-[16ch] font-light text-white" style={{ fontSize: 40, lineHeight: 1.15 }}>
            Six stations. One of them is our college.
          </h2>
          <SectionLabel>GROUND NETWORK</SectionLabel>
        </div>
        <canvas ref={canvasRef} className="mt-10 w-full border border-white/10" style={{ aspectRatio: "2 / 1" }} aria-label="World map of ground stations" />
        <p className="mt-6 max-w-[68ch] text-[15px] leading-relaxed" style={{ color: "#9aa3b8" }}>
          KJSIT Mumbai is the primary station; Espoo, Bengaluru, Tokyo,
          Svalbard and Cape Town fill the gaps. Contacts stream from SGP4
          propagation into the contact table the router reads.
        </p>
        <div className="mt-8 flex flex-wrap gap-10">
          {[
            ["TELEMETRY ROWS", stats.telemetry_rows.toLocaleString()],
            ["CONTACTS NEXT 24H", stats.contacts_next_24h.toLocaleString()],
            ["AI DECISIONS", stats.ai_decisions.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="font-light text-white" style={{ fontSize: 44 }}>{v}</p>
              <p className="font-mono text-[11px] uppercase" style={{ color: "#9aa3b8", letterSpacing: "0.08em" }}>{k}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
