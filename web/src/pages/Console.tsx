import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Brand } from "@/components/story/Brand";
import { apiFetch } from "@/app/api";
import { ROLE_ACCESS, canVisit, homeFor } from "@/app/access";
import { FALLBACK_PROFILES } from "@/app/profiles";
import type { Profile } from "@/app/profiles";

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
        // Offline: still move on so the demo flow stays clickable; destination page shows offline banner
      }
      if (navTimer.current !== null) window.clearTimeout(navTimer.current);
      navTimer.current = window.setTimeout(
        () => navigate(next && canVisit(role, next) ? next : homeFor(role)),
        200,
      );
    },
    [navigate, next],
  );

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setFocus((f) => {
        const n = (f + 1) % profiles.length;
        tilesRef.current[n]?.focus();
        return n;
      });
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setFocus((f) => {
        const n = (f - 1 + profiles.length) % profiles.length;
        tilesRef.current[n]?.focus();
        return n;
      });
    } else if (e.key === "Enter" && profiles[focus] !== undefined) {
      e.preventDefault();
      void pick(profiles[focus].role);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col bg-black text-white"
      onKeyDown={onKeyDown}
    >
      <header className="border-b border-[var(--sx-hairline)] bg-black">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center px-6">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center px-6 py-16">
        <h1 className="sx-h1 text-center">
          Choose a profile
        </h1>
        <p className="sx-lead text-center mt-3">
          Every query runs as this Postgres role. Switch anytime from the top bar.
        </p>

        {offline && (
          <div className="sx-status mt-4" data-tone="warn">
            Backend offline — showing roles, sign-in will retry live
          </div>
        )}

        {/* Apple inset-grouped profile list */}
        <div
          role="listbox"
          aria-label="Console profiles"
          className="sx-group w-full max-w-[640px] mt-8"
        >
          {profiles.map((p, i) => {
            const isSelected = focus === i || zooming === p.role;
            return (
              <button
                key={p.role}
                ref={(el) => {
                  tilesRef.current[i] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onClick={() => void pick(p.role)}
                onMouseEnter={() => setFocus(i)}
                onFocus={() => setFocus(i)}
                className={`sx-row min-h-[64px] h-16 w-full text-left transition-colors cursor-pointer ${
                  isSelected ? "bg-[var(--sx-surface-2)]" : "hover:bg-[var(--sx-surface-2)]"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <span className="font-display text-[16px] font-semibold capitalize text-white truncate block">
                      {p.title}
                    </span>
                    <span className="sx-caption truncate block mt-0.5">
                      {p.subtitle || p.role.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-white/40" />
              </button>
            );
          })}
        </div>

        {/* Detail row showing permissions of the currently focused profile */}
        <div
          className="mt-6 min-h-[64px] w-full max-w-[640px] text-center"
          aria-live="polite"
        >
          {profiles[focus] &&
            (() => {
              const role = profiles[focus].role;
              const access = (ROLE_ACCESS as Record<string, { can: string[]; home: string }>)[role];
              const can = access?.can ?? profiles[focus].can.slice(0, 3);
              const home = access?.home ?? "/ops";
              return (
                <div key={role}>
                  <p className="sx-body text-[13px] text-white/70">
                    {can.slice(0, 3).join("  ·  ")}
                  </p>
                  <p className="sx-caption mt-1 text-[var(--sx-text-3)]">
                    Opens: {homeLabel(home)}
                  </p>
                </div>
              );
            })()}
        </div>

        {/* Primary continue action */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (profiles[focus]) void pick(profiles[focus].role);
            }}
            className="sx-btn sx-btn--filled min-w-[200px]"
          >
            Continue
          </button>
        </div>

        <Link
          to="/"
          className="sx-link mt-8 text-[13px] text-[var(--sx-text-3)] hover:text-white"
        >
          Back to the packet
        </Link>
      </main>
    </div>
  );
}
