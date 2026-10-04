import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "@/components/story/Brand";
import { apiFetch } from "@/app/api";
import {
  FALLBACK_PROFILES,
  ProfileAvatar,
  accentRing,
} from "@/app/profiles";
import type { Profile } from "@/app/profiles";

/**
 * Netflix-style "Who's on console?" picker at /console. No username/password:
 * clicking a tile POSTs {role} and the backend opens a pooled connection as
 * that real Postgres role behind an httpOnly session cookie.
 */
export default function Console() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") ?? "/ops";
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [offline, setOffline] = useState(false);
  const [focus, setFocus] = useState(0);
  const [zooming, setZooming] = useState<string | null>(null);
  const tilesRef = useRef<Array<HTMLButtonElement | null>>([]);

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
      window.setTimeout(() => navigate(next), 220);
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
      className="flex min-h-screen flex-col bg-[var(--space)] text-[var(--text)]"
      onKeyDown={onKeyDown}
    >
      <header className="border-b border-[var(--line)]">
        <div className="shell flex h-14 items-center">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
        </div>
      </header>
      <main className="shell flex flex-1 flex-col items-center justify-center py-16">
        <h1 className="text-center text-[40px] font-semibold tracking-[-0.02em]">
          Who&apos;s on console?
        </h1>
        {offline && (
          <p className="font-mono mt-4 rounded-full border border-dashed border-[var(--warn)]/60 px-3 py-1 text-[11px] text-[var(--warn)]">
            backend offline — showing roles, sign-in will retry live
          </p>
        )}
        <div
          role="listbox"
          aria-label="Console profiles"
          className="mt-10 grid grid-cols-2 justify-center gap-5 sm:flex sm:flex-wrap"
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
              className="group flex w-full flex-col items-center rounded-[10px] border border-[var(--line)] bg-[var(--navy-800)] p-5 transition-colors hover:-translate-y-1 hover:border-[var(--ice)] focus-visible:-translate-y-1 focus-visible:border-[var(--ice)] focus-visible:outline-none sm:w-[168px] sm:h-[168px] sm:justify-center"
              style={{
                transform: zooming === p.role ? "scale(1.04)" : undefined,
                boxShadow:
                  zooming === p.role
                    ? "0 0 0 2px var(--ice)"
                    : undefined,
              }}
            >
              <span
                className="flex size-[88px] items-center justify-center rounded-2xl border bg-[var(--space)]"
                style={{ borderColor: `${accentRing(p.accent)}66` }}
              >
                <ProfileAvatar role={p.role} size={52} />
              </span>
              <span className="mt-4 text-center text-[15px] font-semibold leading-tight">
                {p.title}
              </span>
              <span className="mt-1 font-mono text-[12px] text-[var(--text-2)]">
                {p.role}
              </span>
              <span className="mt-1 text-[12px] text-[var(--text-3)]">
                {p.subtitle}
              </span>
              <span className="mt-3 hidden min-h-[3.5rem] flex-col gap-1 text-center group-hover:flex group-focus-visible:flex">
                {p.can.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="text-[12px] leading-snug text-[var(--text-2)]"
                  >
                    {c}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-8 text-[13px] text-[var(--text-3)]">
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
