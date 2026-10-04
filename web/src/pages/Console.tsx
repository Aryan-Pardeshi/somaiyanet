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
      className="grid-paper flex min-h-screen flex-col bg-[var(--ink)] text-[var(--cream)]"
      onKeyDown={onKeyDown}
    >
      <header className="border-b border-[var(--rule)]">
        <div className="shell flex h-14 items-center">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
        </div>
      </header>
      <main className="shell flex flex-1 flex-col items-center justify-center py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">01</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">Console</span>
        </p>
        <h1
          className="font-display mt-4 text-center font-bold tracking-tight"
          style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
        >
          Who&apos;s on console?
        </h1>
        <p className="font-mono mt-3 text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">
          Every query runs as that Postgres role
        </p>
        {offline && (
          <p className="font-mono mt-4 rounded-full border border-dashed border-[var(--amber)]/60 px-3 py-1 text-[11px] text-[var(--amber)]">
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
              className="group flex w-full flex-col items-center rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)] p-5 transition-all duration-150 hover:scale-[1.06] hover:border-[var(--somaiya)] focus-visible:scale-[1.06] focus-visible:border-[var(--somaiya)] focus-visible:outline-none sm:w-[180px]"
              style={{
                transform: zooming === p.role ? "scale(1.12)" : undefined,
                boxShadow:
                  zooming === p.role
                    ? "0 0 0 2px var(--somaiya)"
                    : undefined,
              }}
            >
              <span
                className="flex size-[88px] items-center justify-center rounded-2xl border bg-[var(--ink)]"
                style={{ borderColor: `${accentRing(p.accent)}66` }}
              >
                <ProfileAvatar role={p.role} size={52} />
              </span>
              <span className="font-display mt-4 text-center text-[15px] font-bold leading-tight">
                {p.title}
              </span>
              <span className="font-mono mt-1 text-[10px] tracking-[0.08em] text-[var(--cream-dim)]">
                {p.role}
              </span>
              <span className="font-mono mt-1 text-[10px] text-[var(--mute)]">
                {p.subtitle}
              </span>
              <span className="mt-3 hidden min-h-[3.5rem] flex-col gap-1 text-center group-hover:flex group-focus-visible:flex">
                {p.can.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="font-mono text-[10px] leading-snug text-[var(--cream-dim)]"
                  >
                    · {c}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
        <Link
          to="/"
          className="font-mono mt-10 text-[11px] uppercase tracking-[0.16em] text-[var(--mute)] hover:text-[var(--cream)]"
        >
          ← back to the packet
        </Link>
      </main>
    </div>
  );
}
