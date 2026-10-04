import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Brain,
  ChevronDown,
  Database,
  FlaskConical,
  Gauge,
  Menu,
  Network,
  Rocket,
  Route,
  Satellite,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { Brand } from "@/components/story/Brand";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiFetch } from "./api";
import { SqlButton, SqlDrawer, SqlProvider } from "./SqlDrawer";
import { FALLBACK_PROFILES, ProfileAvatar, accentRing } from "./profiles";
import type { Profile } from "./profiles";

const MISSION_NAV = [
  { to: "/ops", label: "Ops", Icon: Satellite },
  { to: "/routing", label: "Routing", Icon: Route },
  { to: "/brain", label: "AI router", Icon: Brain },
  { to: "/deploy", label: "Deploy", Icon: Rocket },
];

const LABS_NAV = [
  { to: "/labs/transactions", label: "Transactions", Icon: FlaskConical },
  { to: "/labs/security", label: "Security", Icon: ShieldCheck },
  { to: "/labs/indexing", label: "Indexing", Icon: Gauge },
  { to: "/labs/normalization", label: "Normalization", Icon: Network },
  { to: "/labs/schema", label: "Schema", Icon: Database },
  { to: "/labs/sql", label: "SQL", Icon: Terminal },
];

function titleFor(role: string): string {
  return (
    FALLBACK_PROFILES.find((p) => p.role === role)?.title ??
    role.replace(/_/g, " ")
  );
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    <span className="font-mono text-[12px] tabular-nums text-[var(--text-2)]">
      {p(now.getUTCHours())}:{p(now.getUTCMinutes())}:{p(now.getUTCSeconds())} UTC
    </span>
  );
}

function navClass(active: boolean): string {
  return `relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${
    active
      ? "bg-[var(--navy-600)] text-[var(--text)]"
      : "text-[var(--text-2)] hover:bg-[var(--navy-700)] hover:text-[var(--text)]"
  }`;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
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

  const switcher = (
    <div className="relative" ref={chipRef}>
      <button
        onClick={() => setChipOpen((o) => !o)}
        aria-expanded={chipOpen}
        aria-label="Switch profile"
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-[var(--navy-800)] p-2 hover:border-[var(--line-strong)]"
      >
        {profile !== null && !checking ? (
          <>
            <ProfileAvatar role={profile.role} size={28} />
            <span className="min-w-0 flex-1 text-left leading-tight min-[1200px]:block">
              <span className="block truncate text-[13px] font-semibold">
                {profile.title ?? titleFor(profile.role)}
              </span>
              <span className="block truncate font-mono text-[12px] text-[var(--text-3)]">
                {profile.role}
              </span>
            </span>
            <ChevronDown
              size={14}
              className="shrink-0 text-[var(--text-3)] min-[1200px]:block"
            />
          </>
        ) : (
          <span className="px-1 text-[13px] text-[var(--text-3)]">
            {checking ? "Checking session" : "No profile"}
          </span>
        )}
      </button>
      {chipOpen && profile !== null && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--navy-800)]"
          style={{ boxShadow: "0 10px 30px -12px #000a" }}
        >
          <p className="px-4 pb-1 pt-3 text-[12px] font-medium text-[var(--text-2)]">
            Switch profile
          </p>
          {profiles.map((p) => (
            <button
              key={p.role}
              onClick={() => void switchProfile(p.role)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--navy-700)]"
            >
              <ProfileAvatar role={p.role} size={30} />
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold">{p.title}</span>
                <span className="block font-mono text-[12px] text-[var(--text-3)]">
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
            className="block border-t border-[var(--line)] px-4 py-2.5 text-[13px] text-[var(--text-2)] hover:text-[var(--text)]"
          >
            Change profile
          </Link>
        </div>
      )}
    </div>
  );

  const navList = (
    <>
      <p className="px-3 text-[12px] font-medium text-[var(--text-2)] min-[1200px]:block">
        <span className="hidden min-[1200px]:inline">Mission</span>
      </p>
      <nav className="mt-1 flex flex-col gap-0.5" aria-label="Mission">
        {MISSION_NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) => navClass(isActive)}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-[var(--ice)]"
                  />
                )}
                <Icon size={17} className="shrink-0" />
                <span className="hidden min-[1200px]:inline">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <p className="mt-5 px-3 text-[12px] font-medium text-[var(--text-2)]">
        <span className="hidden min-[1200px]:inline">Database labs</span>
      </p>
      <nav className="mt-1 flex flex-col gap-0.5" aria-label="Database labs">
        {LABS_NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) =>
              navClass(isActive || location.pathname === to)
            }
          >
            {({ isActive }) => {
              const active = isActive || location.pathname === to;
              return (
                <>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-[var(--ice)]"
                    />
                  )}
                  <Icon size={17} className="shrink-0" />
                  <span className="hidden min-[1200px]:inline">{label}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[var(--space)] text-[var(--text)]">
      {/* Left sidebar: 232px, icon rail under 1200px, sheet under 768px */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col bg-[var(--navy-900)] px-2 py-4 md:flex min-[1200px]:w-[232px] min-[1200px]:px-3">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex items-center gap-2 px-1"
        >
          <Brand className="text-lg" />
        </Link>
        <div className="mt-6 flex-1 overflow-y-auto">{navList}</div>
        <div className="mt-4 border-t border-[var(--line)] pt-3">{switcher}</div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--line)] bg-[var(--navy-900)] px-4 md:hidden">
          <Link to="/" aria-label="SomaiyaNet home">
            <Brand className="text-base" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <UtcClock />
            <SqlButton />
            <button
              aria-label="Open menu"
              onClick={() => setSheetOpen(true)}
              className="rounded-lg border border-[var(--line)] p-2 text-[var(--text-2)]"
            >
              <Menu size={16} />
            </button>
          </div>
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 z-30 hidden h-14 items-center gap-3 border-b border-[var(--line)] bg-[var(--space)]/90 px-6 backdrop-blur-md md:flex">
          <div className="ml-auto flex items-center gap-3">
            {offline && (
              <span className="hidden rounded-full border border-dashed border-[var(--warn)]/60 px-2.5 py-1 text-[12px] text-[var(--warn)] sm:inline-block">
                Backend offline
              </span>
            )}
            <UtcClock />
            <SqlButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">
          {children}
        </main>
      </div>

      {/* Mobile sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          className="w-72 border-[var(--line)] bg-[var(--navy-900)] text-[var(--text)]"
        >
          <div className="mt-2 flex items-center justify-between">
            <Brand className="text-base" />
            <button
              aria-label="Close menu"
              onClick={() => setSheetOpen(false)}
              className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--text-2)]"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-4">{navList}</div>
          <div className="mt-6 border-t border-[var(--line)] pt-3">
            {profiles.map((p) => (
              <button
                key={p.role}
                onClick={() => void switchProfile(p.role)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--navy-700)]"
              >
                <ProfileAvatar role={p.role} size={26} />
                <span className="text-[13px]">{p.title}</span>
              </button>
            ))}
            <Link
              to="/console"
              onClick={() => setSheetOpen(false)}
              className="mt-1 block px-2 py-1.5 text-[13px] text-[var(--text-2)]"
            >
              Change profile
            </Link>
          </div>
        </SheetContent>
      </Sheet>

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

