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

function Satellite() {
  return (
    <div
      className="satellite-pass pointer-events-none absolute top-0 left-0 z-10 select-none"
      aria-hidden="true"
    >
      <svg
        width="44"
        height="26"
        viewBox="-22 -13 44 26"
        fill="none"
        className="overflow-visible"
      >
        <rect
          x="-5"
          y="-5"
          width="10"
          height="10"
          stroke="#ffffff"
          strokeWidth="1"
          fill="#04091a"
        />
        <rect
          x="-3"
          y="-3"
          width="6"
          height="6"
          stroke="#ffffff"
          strokeWidth="0.5"
          opacity="0.35"
        />
        <line x1="-8" y1="0" x2="-5" y2="0" stroke="#ffffff" strokeWidth="1" />
        <line x1="5" y1="0" x2="8" y2="0" stroke="#ffffff" strokeWidth="1" />
        <rect
          x="-19"
          y="-4.5"
          width="11"
          height="9"
          stroke="#ffffff"
          strokeWidth="1"
          fill="#04091a"
        />
        <line
          x1="-13.5"
          y1="-4.5"
          x2="-13.5"
          y2="4.5"
          stroke="#ffffff"
          strokeWidth="0.75"
          opacity="0.5"
        />
        <rect
          x="8"
          y="-4.5"
          width="11"
          height="9"
          stroke="#ffffff"
          strokeWidth="1"
          fill="#04091a"
        />
        <line
          x1="13.5"
          y1="-4.5"
          x2="13.5"
          y2="4.5"
          stroke="#ffffff"
          strokeWidth="0.75"
          opacity="0.5"
        />
        <line x1="0" y1="-5" x2="0" y2="-9.5" stroke="#ffffff" strokeWidth="1" />
        <circle cx="0" cy="-9.5" r="0.8" fill="#ffffff" />
        <circle
          cx="0"
          cy="-9.5"
          r="2.2"
          fill="#ff3b4f"
          className="packet-dot-blink"
        />
      </svg>
    </div>
  );
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

interface ShootingStar {
  active: boolean;
  startTime: number;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function createStars(width: number, height: number, count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const isForeground = Math.random() < 0.35;
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: isForeground ? 1.0 + Math.random() * 0.7 : 0.5 + Math.random() * 0.5,
      baseAlpha: isForeground ? 0.55 + Math.random() * 0.4 : 0.25 + Math.random() * 0.45,
      twinkleSpeed: 1.0 + Math.random() * 2.2,
      twinklePhase: Math.random() * Math.PI * 2,
      driftSpeed: isForeground ? 3.2 + Math.random() * 2.2 : 1.2 + Math.random() * 1.4,
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
    let nextShootTime = performance.now() + 6000 + Math.random() * 4000;

    let width = footer.clientWidth || window.innerWidth;
    let height = footer.clientHeight || 350;

    const initialCount = width < 640 ? 90 : 180;
    let stars = createStars(width, height, initialCount);

    const shootingStar: ShootingStar = {
      active: false,
      startTime: 0,
      duration: 600,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
    };

    const updateSize = () => {
      if (!footer || !canvas) return;
      const rect = footer.getBoundingClientRect();
      const newWidth = Math.max(300, Math.floor(rect.width));
      const newHeight = Math.max(200, Math.floor(rect.height));

      if (newWidth !== width || newHeight !== height) {
        const prevWidth = width;
        const prevHeight = height;
        width = newWidth;
        height = newHeight;
        const targetCount = width < 640 ? 90 : 180;
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
          ? 0.75
          : 0.65 + 0.35 * Math.sin(s.twinklePhase + timeSec * s.twinkleSpeed);
        const alpha = Math.min(1, Math.max(0.08, s.baseAlpha * twinkle));

        ctx.fillStyle = `rgba(223, 230, 245, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!staticMode) {
        if (!shootingStar.active && now >= nextShootTime) {
          shootingStar.active = true;
          shootingStar.startTime = now;
          shootingStar.duration = 600;
          shootingStar.startX = width * 0.25 + Math.random() * (width * 0.65);
          shootingStar.startY = Math.random() * (height * 0.45);
          const distance = 140 + Math.random() * 80;
          const angle = (145 + Math.random() * 20) * (Math.PI / 180);
          shootingStar.endX = shootingStar.startX + Math.cos(angle) * distance;
          shootingStar.endY = shootingStar.startY + Math.sin(angle) * distance;
          nextShootTime = now + 6000 + Math.random() * 4000;
        }

        if (shootingStar.active) {
          const elapsed = now - shootingStar.startTime;
          if (elapsed >= shootingStar.duration) {
            shootingStar.active = false;
          } else {
            const p = elapsed / shootingStar.duration;
            const hx = shootingStar.startX + (shootingStar.endX - shootingStar.startX) * p;
            const hy = shootingStar.startY + (shootingStar.endY - shootingStar.startY) * p;

            const dx = shootingStar.endX - shootingStar.startX;
            const dy = shootingStar.endY - shootingStar.startY;
            const len = Math.hypot(dx, dy) || 1;
            const trailLen = Math.min(48, len * p);
            const tx = hx - (dx / len) * trailLen;
            const ty = hy - (dy / len) * trailLen;

            let fade = 1;
            if (p < 0.2) fade = p / 0.2;
            else if (p > 0.75) fade = (1 - p) / 0.25;

            const grad = ctx.createLinearGradient(tx, ty, hx, hy);
            grad.addColorStop(0, "rgba(255, 255, 255, 0)");
            grad.addColorStop(0.7, `rgba(215, 230, 255, ${(0.6 * fade).toFixed(3)})`);
            grad.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * fade).toFixed(3)})`);

            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * fade).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(hx, hy, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
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
      className="relative w-full overflow-hidden border-t border-white/10 bg-black text-[#dfe6f5]"
      style={{ background: "#000000" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="nebula-cloud-1 absolute -top-[20%] -left-[10%] h-[140%] w-[55%] rounded-full opacity-55 blur-[60px]"
          style={{
            background: "radial-gradient(ellipse at center, #0b1a4a 0%, rgba(11, 26, 74, 0.4) 55%, transparent 75%)",
          }}
        />
        <div
          className="nebula-cloud-2 absolute -top-[10%] left-[30%] h-[130%] w-[60%] rounded-full opacity-50 blur-[60px]"
          style={{
            background: "radial-gradient(ellipse at center, #10246b 0%, rgba(16, 36, 107, 0.35) 55%, transparent 80%)",
          }}
        />
        <div
          className="nebula-cloud-3 absolute top-[10%] -right-[10%] h-[120%] w-[50%] rounded-full opacity-45 blur-[60px]"
          style={{
            background: "radial-gradient(ellipse at center, #1b1050 0%, rgba(27, 16, 80, 0.35) 50%, transparent 75%)",
          }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28 z-10"
        style={{
          background: "linear-gradient(to bottom, #000000 0%, rgba(0, 0, 0, 0.6) 35%, transparent 100%)",
        }}
        aria-hidden="true"
      />

      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        aria-hidden="true"
      />

      {!reducedMotion && <Satellite />}

      <div className="relative z-20 mx-auto max-w-[1200px] px-6 py-8 md:py-9">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[420px]">
            <Brand className="text-[22px]" />
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#8b96b0]">
              Four PocketQubes, one database, every decision on the record.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-12 md:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/60">Mission</p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {MISSION_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="footer-nav-link focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3d5bff]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/60">Database labs</p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {LABS_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="footer-nav-link focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3d5bff]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[12px] text-[#8b96b0]">
          <p className="leading-relaxed max-w-[78ch]">
            Dept. of Computer Engineering, K. J. Somaiya Institute of Technology · with ReOrbit, Finland · Guided by Dr. Umesh Shinde (KJSIT) and Dr. Shailesh Nikam (KJSSE) · Use case KJS-SRS-01
          </p>
          <p className="font-mono text-[12px] text-[#dfe6f5] tabular-nums shrink-0 self-start sm:self-auto">
            {utc}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] text-[#8b96b0]/80">
          <p>
            Ideas for the globe and landing adapted from{" "}
            <a
              href="https://github.com/lakshyamody/dbmsproj"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[#dfe6f5]"
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
