import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/story/Brand";

interface FooterLink {
  readonly to: string;
  readonly label: string;
}

const MISSION_LINKS: readonly FooterLink[] = [
  { to: "/console", label: "Take the console" },
  { to: "/ops", label: "Command center" },
  { to: "/routing", label: "Route finder" },
  { to: "/brain", label: "AI router" },
  { to: "/deploy", label: "Deploy" },
];

const LABS_LINKS: readonly FooterLink[] = [
  { to: "/labs/transactions", label: "Transactions" },
  { to: "/labs/security", label: "Security" },
  { to: "/labs/indexing", label: "Indexing" },
  { to: "/labs/normalization", label: "Normalization" },
  { to: "/labs/schema", label: "Schema" },
  { to: "/labs/sql", label: "SQL console" },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function formatUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `UTC ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  driftSpeed: number;
}

function createStars(width: number, height: number, count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.5 + Math.random() * 0.6,
      baseAlpha: 0.15 + Math.random() * 0.25,
      twinkleSpeed: 0.5 + Math.random() * 0.8,
      twinklePhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.8 + Math.random() * 1.0,
    });
  }
  return stars;
}

export function Footer() {
  const reducedMotion = usePrefersReducedMotion();
  const [utc, setUtc] = useState<string>(() => formatUtc(new Date()));
  const footerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setUtc(formatUtc(new Date()));
    const id = window.setInterval(() => setUtc(formatUtc(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const footer = footerRef.current;
    if (!canvas || !footer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let isIntersecting = false;
    let isTabActive = !document.hidden;
    let lastTime = performance.now();

    let width = footer.clientWidth || window.innerWidth;
    let height = footer.clientHeight || 280;

    const initialCount = width < 640 ? 60 : 120;
    let stars = createStars(width, height, initialCount);

    const updateSize = () => {
      if (!footer || !canvas) return;
      const rect = footer.getBoundingClientRect();
      const newWidth = Math.max(300, Math.floor(rect.width));
      const newHeight = Math.max(160, Math.floor(rect.height));

      if (newWidth !== width || newHeight !== height) {
        const prevWidth = width;
        const prevHeight = height;
        width = newWidth;
        height = newHeight;
        const targetCount = width < 640 ? 60 : 120;
        if (stars.length !== targetCount) {
          stars = createStars(width, height, targetCount);
        } else {
          for (let i = 0; i < stars.length; i++) {
            stars[i].x = (stars[i].x / (prevWidth || 1)) * width;
            stars[i].y = (stars[i].y / (prevHeight || 1)) * height;
          }
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    updateSize();

    const drawScene = (now: number, staticMode: boolean) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const deltaSec = Math.min(0.1, (now - lastTime) / 1000);
      const timeSec = now / 1000;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!staticMode) {
          s.x -= s.driftSpeed * deltaSec;
          if (s.x < -4) {
            s.x = width + 4;
            s.y = Math.random() * height;
          }
        }

        const twinkle = staticMode
          ? 0.7
          : 0.6 + 0.4 * Math.sin(s.twinklePhase + timeSec * s.twinkleSpeed);
        const alpha = Math.min(0.45, Math.max(0.06, s.baseAlpha * twinkle));

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      lastTime = now;
    };

    const tick = (now: number) => {
      drawScene(now, false);
      if (isIntersecting && isTabActive && !reducedMotion) {
        animationFrameId = requestAnimationFrame(tick);
      } else {
        animationFrameId = null;
      }
    };

    const startLoop = () => {
      if (reducedMotion) {
        drawScene(performance.now(), true);
        return;
      }
      if (animationFrameId === null && isIntersecting && isTabActive) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    if (reducedMotion) {
      drawScene(performance.now(), true);
    } else {
      startLoop();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isIntersecting = !!entry?.isIntersecting;
        if (isIntersecting) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(footer);

    const handleVisibility = () => {
      isTabActive = !document.hidden;
      if (isTabActive) {
        startLoop();
      } else {
        stopLoop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleResize = () => {
      updateSize();
      if (reducedMotion) {
        drawScene(performance.now(), true);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      stopLoop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
    };
  }, [reducedMotion]);

  return (
    <footer
      ref={footerRef}
      className="relative w-full overflow-hidden border-t border-[color:var(--sx-hairline)] bg-black text-white"
      style={{ background: "#000000" }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-6 py-10 md:py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[380px]">
            <Brand className="text-[20px]" />
            <p className="mt-3 sx-body text-[14px] text-[color:var(--sx-text-2)]">
              Four PocketQubes, one database, every decision on the record.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <p className="sx-eyebrow">Mission</p>
              <ul className="mt-3 space-y-2">
                {MISSION_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="block font-[family-name:var(--font-sans)] text-[14px] text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="sx-eyebrow">Database labs</p>
              <ul className="mt-3 space-y-2">
                {LABS_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="block font-[family-name:var(--font-sans)] text-[14px] text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[color:var(--sx-hairline)] pt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sx-caption">
          <p className="max-w-[78ch] leading-relaxed">
            Dept. of Computer Engineering, K. J. Somaiya Institute of Technology · with ReOrbit, Finland · Guided by Dr. Umesh Shinde (KJSIT) and Dr. Shailesh Nikam (KJSSE) · Use case KJS-SRS-01
          </p>
          <span className="sx-num text-[12px] text-white/50 shrink-0">
            {utc}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sx-caption text-[color:var(--sx-text-3)]">
          <p>
            Ideas for the globe and landing adapted from{" "}
            <a
              href="https://github.com/lakshyamody/dbmsproj"
              target="_blank"
              rel="noreferrer"
              className="text-white/60 underline underline-offset-2 transition-colors hover:text-white"
            >
              lakshyamody/dbmsproj
            </a>
          </p>
          <p>© 2026 SomaiyaNet</p>
        </div>
      </div>
    </footer>
  );
}
