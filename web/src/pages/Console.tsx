import { useCallback, useEffect, useRef, useState } from "react";
import "@fontsource/geist-sans/latin-300.css";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "@/components/story/Brand";
import { apiFetch } from "@/app/api";
import { ROLE_ACCESS, canVisit, homeFor } from "@/app/access";
import { FALLBACK_PROFILES } from "@/app/profiles";
import type { Profile } from "@/app/profiles";

/** Thin white line-art avatars — one per role, 1.5 px strokes, no fills. */
function ConsoleAvatar({ role, size = 52 }: { role: string; size?: number }) {
  const s = { fill: "none", stroke: "#e6ecf8", strokeWidth: 1.5 } as const;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    "aria-hidden": true,
  } as const;
  if (role === "mission_director") {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="14" {...s} />
        <circle cx="24" cy="24" r="6" {...s} />
        <circle cx="24" cy="24" r="1.8" fill="#e6ecf8" />
      </svg>
    );
  }
  if (role === "station_operator_bom" || role === "station_operator_hel") {
    return (
      <svg {...common}>
        <path d="M10 32 A17 17 0 0 1 38 32" {...s} strokeLinecap="round" />
        <circle cx="24" cy="34" r="2.5" {...s} />
        <line x1="24" y1="36" x2="24" y2="42" {...s} strokeLinecap="round" />
        <line x1="24" y1="6" x2="24" y2="14" {...s} />
        <circle cx="24" cy="17" r="2" {...s} />
      </svg>
    );
  }
  if (role === "student_analyst") {
    return (
      <svg {...common}>
        <ellipse cx="24" cy="24" rx="15" ry="9.5" {...s} />
        <circle cx="24" cy="24" r="5" {...s} />
        <circle cx="24" cy="24" r="1.5" fill="#e6ecf8" />
        <line x1="24" y1="5" x2="24" y2="10" {...s} />
        <line x1="24" y1="38" x2="24" y2="43" {...s} />
      </svg>
    );
  }
  // ai_router: hex outline, packet dot at the centre.
  return (
    <svg {...common}>
      <polygon
        points="24,6 39,15 39,33 24,42 9,33 9,15"
        {...s}
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="4" {...s} />
      <circle cx="24" cy="24" r="1.8" fill="var(--somaiya)" />
    </svg>
  );
}

/**
 * Netflix-style "Who's on console?" picker at /console. No username/password:
 * clicking a tile POSTs {role} and the backend opens a pooled connection as
 * that real Postgres role behind an httpOnly session cookie.
 */
function homeLabel(home: string): string {
  if (home === "/ops") return "Command center";
  if (home === "/labs/sql") return "SQL console";
  if (home === "/brain") return "AI router";
  return home;
}
export default function Console() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next");
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [offline, setOffline] = useState(false);
  const [focus, setFocus] = useState(0);
  const [zooming, setZooming] = useState<string | null>(null);
  const tilesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const navTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Profile[]>("/api/profiles")
      .then((r) => {
        if (cancelled) return;
        if (Array.isArray(r.data) && r.data.length > 0) setProfiles(r.data);
        setOffline(false);
      })
      .catch((e: { status?: number }) => {
        if (!cancelled && e?.status === 0) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = useCallback(
    async (role: string) => {
      setZooming(role);
      try {
        await apiFetch<Profile>("/api/session", {
          method: "POST",
          body: JSON.stringify({ role }),
        });
      } catch {
        // Offline: still move on so the demo flow stays clickable; the
        // destination page shows the calm offline card / mock data.
      }
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
      navTimer.current = window.setTimeout(
        () => navigate(next && canVisit(role, next) ? next : homeFor(role)),
        220,
      );
    },
    [navigate, next],
  );

  // Arrow keys move focus, Enter selects.
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const cols = window.innerWidth < 640 ? 2 : profiles.length;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocus((f) => {
        const n = (f + 1) % profiles.length;
        tilesRef.current[n]?.focus();
        return n;
      });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocus((f) => {
        const n = (f - 1 + profiles.length) % profiles.length;
        tilesRef.current[n]?.focus();
        return n;
      });
    } else if (e.key === "Enter" && profiles[focus] !== undefined) {
      e.preventDefault();
      void pick(profiles[focus].role);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // 2-column grid on mobile: jump a row.
      e.preventDefault();
      const d = e.key === "ArrowDown" ? cols : -cols;
      setFocus((f) => {
        const n = (f + d + profiles.length) % profiles.length;
        tilesRef.current[n]?.focus();
        return n;
      });
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--space)] font-light text-[var(--text)]"
      onKeyDown={onKeyDown}
    >
      {/* page frame: vertical rules 24 px inside the edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-[24px] z-30 w-px bg-[var(--line)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-[24px] z-30 w-px bg-[var(--line)]"
      />

      <header className="border-b border-[var(--line)] bg-[var(--space)]/70 backdrop-blur-md">
        <div className="shell flex h-14 items-center">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
        </div>
      </header>
      <main className="shell flex flex-1 flex-col items-center justify-center py-16">
        <h1
          className="text-center font-light text-[var(--text)]"
          style={{ fontSize: "48px", letterSpacing: "-0.03em", lineHeight: 1.05 }}
        >
          Who&apos;s on console?
        </h1>
        {offline && (
          <p className="font-mono mt-4 border border-dashed border-[var(--warn)]/60 px-3 py-1 text-[11px] text-[var(--warn)]" style={{ borderRadius: "999px" }}>
            backend offline — showing roles, sign-in will retry live
          </p>
        )}
        <div
          role="listbox"
          aria-label="Console profiles"
          className="mt-10 grid grid-cols-2 justify-center gap-4 sm:flex sm:flex-wrap"
        >
          {profiles.map((p, i) => (
            <button
              key={p.role}
              ref={(el) => {
                tilesRef.current[i] = el;
              }}
              role="option"
              aria-selected={zooming === p.role}
              onClick={() => void pick(p.role)}
              onMouseEnter={() => setFocus(i)}
              onFocus={() => setFocus(i)}
              className="flex h-[228px] w-full flex-col items-center justify-center border bg-transparent p-5 transition-[border-color,transform] duration-200 focus-visible:outline-none sm:w-[176px]"
              style={{
                borderColor: focus === i || zooming === p.role ? "var(--ice)" : "var(--line)",
                transform: zooming === p.role ? "scale(1.04)" : undefined,
              }}
            >
              <span className="flex size-[88px] shrink-0 items-center justify-center border border-[var(--line)]">
                <ConsoleAvatar role={p.role} size={52} />
              </span>
              <span className="mt-4 text-center text-[15px] font-medium leading-tight">{p.title}</span>
              <span className="font-mono mt-1 truncate text-[11.5px] text-[var(--text-2)]">{p.role}</span>
            </button>
          ))}
        </div>
        {/* Fixed-height detail panel: shows what the focused role may do, so
            hovering never changes the page layout. */}
        <div className="mt-6 h-[92px] w-full max-w-[640px] overflow-hidden border-t border-[var(--line)] pt-4 text-center" aria-live="polite">
          {profiles[focus] &&
            (() => {
              const role = profiles[focus].role;
              const access = (ROLE_ACCESS as Record<string, { can: string[]; home: string }>)[role];
              const can = access?.can ?? profiles[focus].can.slice(0, 3);
              const home = access?.home ?? "/ops";
              return (
                <div key={role} className="fade-step">
                  <p className="text-[13px] text-[var(--text)]">{profiles[focus].subtitle}</p>
                  <p className="mt-2 truncate text-[12.5px] leading-relaxed text-[var(--text-2)]">
                    {can.slice(0, 3).join("  ·  ")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--text-3)]">
                    Opens: {homeLabel(home)}
                  </p>
                </div>
              );
            })()}
        </div>
        <p className="mt-4 text-[13px] text-[var(--text-3)]">
          Every query runs as this Postgres role. Switch anytime from the
          sidebar.
        </p>
        <Link
          to="/"
          className="mt-6 text-[13px] text-[var(--text-3)] hover:text-[var(--text)]"
        >
          Back to the packet
        </Link>
      </main>
    </div>
  );
}
