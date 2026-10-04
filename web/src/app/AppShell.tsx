import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "@/components/story/Brand";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { apiFetch } from "./api";
import { SqlDrawer, SqlProvider } from "./SqlDrawer";
import { FALLBACK_PROFILES, ProfileAvatar, accentRing } from "./profiles";
import type { Profile } from "./profiles";

const NAV: Array<{ to: string; label: string }> = [
  { to: "/ops", label: "Ops" },
  { to: "/routing", label: "Routing" },
  { to: "/brain", label: "Brain" },
  { to: "/deploy", label: "Deploy" },
];

const LABS = [
  "transactions",
  "security",
  "indexing",
  "normalization",
  "schema",
  "sql",
];

function titleFor(role: string): string {
  return (
    FALLBACK_PROFILES.find((p) => p.role === role)?.title ??
    role.replace(/_/g, " ")
  );
}

function accentFor(role: string): string {
  return FALLBACK_PROFILES.find((p) => p.role === role)?.accent ?? "muted";
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  // Profile guard: 401 -> /console?next=<path>. Network failure stays put
  // with an offline badge instead of a redirect loop.
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    apiFetch<Profile>("/api/session")
      .then((r) => {
        if (cancelled) return;
        setProfile(r.data);
        setOffline(false);
        setChecking(false);
      })
      .catch((e: { status?: number }) => {
        if (cancelled) return;
        setChecking(false);
        if (e?.status === 401) {
          navigate(`/console?next=${encodeURIComponent(location.pathname)}`, {
            replace: true,
          });
        } else if (e?.status === 0) {
          setOffline(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // Re-guard on route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Profile list for the instant-switch popover (static fallback is fine).
  useEffect(() => {
    let cancelled = false;
    apiFetch<Profile[]>("/api/profiles")
      .then((r) => {
        if (!cancelled && Array.isArray(r.data)) setProfiles(r.data);
      })
      .catch(() => {
        // Keep FALLBACK_PROFILES; offline badge already covers it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close popovers on outside click.
  useEffect(() => {
    const onDown = (ev: MouseEvent): void => {
      if (chipRef.current && !chipRef.current.contains(ev.target as Node)) {
        setChipOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const switchProfile = async (role: string): Promise<void> => {
    try {
      const r = await apiFetch<Profile>("/api/session", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setProfile(r.data);
      setChipOpen(false);
      setSheetOpen(false);
      // Re-fetch the current page's data with the new role's permissions.
      window.location.reload();
    } catch {
      // Drawer surfaces the error card; keep the popover open.
    }
  };

  const labsActive = location.pathname.startsWith("/labs/");

  return (
    <div className="grid-paper min-h-screen bg-[var(--ink)] text-[var(--cream)]">
      <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[var(--ink)]/90 backdrop-blur-md">
        <div className="shell flex h-14 items-center gap-5">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-lg" />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Console">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                  location.pathname === n.to
                    ? "text-[var(--cream)]"
                    : "text-[var(--mute)] hover:text-[var(--cream)]"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <div className="relative">
              <button
                onClick={() => setLabsOpen((o) => !o)}
                aria-expanded={labsOpen}
                className={`font-mono text-[11px] uppercase tracking-[0.16em] ${
                  labsActive
                    ? "text-[var(--cream)]"
                    : "text-[var(--mute)] hover:text-[var(--cream)]"
                }`}
              >
                Labs ▾
              </button>
              {labsOpen && (
                <div className="absolute left-0 top-7 w-44 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] shadow-2xl">
                  {LABS.map((lab) => (
                    <Link
                      key={lab}
                      to={`/labs/${lab}`}
                      onClick={() => setLabsOpen(false)}
                      className="font-mono block px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--cream-dim)] hover:bg-[var(--somaiya-soft)] hover:text-[var(--cream)]"
                    >
                      {lab}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {offline && (
              <span className="font-mono hidden rounded-full border border-dashed border-[var(--amber)]/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--amber)] sm:inline-block">
                backend offline
              </span>
            )}
            {!checking && profile !== null && (
              <div className="relative" ref={chipRef}>
                <button
                  onClick={() => setChipOpen((o) => !o)}
                  aria-expanded={chipOpen}
                  aria-label="Switch profile"
                  className="flex items-center gap-2.5 rounded-full border border-[var(--rule)] bg-[var(--ink-2)] py-1 pl-1 pr-3 transition-transform hover:scale-[1.03]"
                  style={{ boxShadow: `0 0 0 1px ${accentRing(accentFor(profile.role))}55` }}
                >
                  <ProfileAvatar role={profile.role} size={28} />
                  <span className="text-left leading-none">
                    <span className="font-display block text-[13px] font-bold">
                      {profile.title ?? titleFor(profile.role)}
                    </span>
                    <span className="font-mono mt-0.5 block text-[10px] tracking-[0.08em] text-[var(--cream-dim)]">
                      {profile.role}
                    </span>
                  </span>
                </button>
                {chipOpen && (
                  <div className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] shadow-2xl">
                    <p className="font-mono px-4 pb-1 pt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                      Switch profile
                    </p>
                    {profiles.map((p) => (
                      <button
                        key={p.role}
                        onClick={() => void switchProfile(p.role)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--somaiya-soft)]"
                      >
                        <ProfileAvatar role={p.role} size={30} />
                        <span className="leading-tight">
                          <span className="font-display block text-[13px] font-bold">
                            {p.title}
                          </span>
                          <span className="font-mono block text-[10px] text-[var(--cream-dim)]">
                            {p.role}
                          </span>
                        </span>
                        {profile.role === p.role && (
                          <span
                            aria-hidden="true"
                            className="ml-auto inline-block size-2 rounded-full"
                            style={{ background: accentRing(p.accent) }}
                          />
                        )}
                      </button>
                    ))}
                    <Link
                      to="/console"
                      onClick={() => setChipOpen(false)}
                      className="font-mono block border-t border-[var(--rule)] px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-[var(--cream-dim)] hover:text-[var(--cream)]"
                    >
                      Change profile…
                    </Link>
                  </div>
                )}
              </div>
            )}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="font-mono rounded-lg border border-[var(--rule)] px-3 py-1.5 text-[12px] text-[var(--cream-dim)] lg:hidden"
                >
                  ☰
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="border-[var(--rule)] bg-[var(--ink-2)] text-[var(--cream)]"
              >
                <p className="font-mono mt-6 px-4 text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                  01 / Console
                </p>
                <nav className="flex flex-col gap-1 px-4" aria-label="Console mobile">
                  {NAV.map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setSheetOpen(false)}
                      className="font-display rounded-lg px-2 py-2 text-xl font-bold hover:bg-[var(--somaiya-soft)]"
                    >
                      {n.label}
                    </Link>
                  ))}
                  <p className="font-mono mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                    Labs
                  </p>
                  {LABS.map((lab) => (
                    <Link
                      key={lab}
                      to={`/labs/${lab}`}
                      onClick={() => setSheetOpen(false)}
                      className="font-mono rounded-lg px-2 py-1.5 text-[12px] uppercase tracking-[0.14em] text-[var(--cream-dim)] hover:bg-[var(--somaiya-soft)] hover:text-[var(--cream)]"
                    >
                      {lab}
                    </Link>
                  ))}
                  <p className="font-mono mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                    Profile
                  </p>
                  {profiles.map((p) => (
                    <button
                      key={p.role}
                      onClick={() => void switchProfile(p.role)}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--somaiya-soft)]"
                    >
                      <ProfileAvatar role={p.role} size={28} />
                      <span className="font-mono text-[12px] text-[var(--cream)]">
                        {p.title}
                      </span>
                    </button>
                  ))}
                  <Link
                    to="/console"
                    onClick={() => setSheetOpen(false)}
                    className="font-mono mt-1 px-2 py-1.5 text-[12px] uppercase tracking-[0.14em] text-[var(--cream-dim)]"
                  >
                    Change profile…
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <SqlDrawer />
    </div>
  );
}

/** Layout for every route except `/` and `/console`. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SqlProvider>
      <ShellInner>{children}</ShellInner>
    </SqlProvider>
  );
}
