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
import { Brand, BrandMark } from "@/components/story/Brand";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiFetch } from "./api";
import { SqlButton, SqlDrawer, SqlProvider } from "./SqlDrawer";
import { RoleProvider, canVisit, homeFor } from "./access";
import { FALLBACK_PROFILES, ProfileAvatar } from "./profiles";
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

function getPageTitle(pathname: string): string {
  const mission = MISSION_NAV.find((m) => m.to === pathname);
  if (mission) return mission.label;
  const lab = LABS_NAV.find((l) => l.to === pathname);
  if (lab) return `Lab ${lab.label}`;
  if (pathname.startsWith("/labs/")) {
    const sub = pathname.replace("/labs/", "");
    return `Lab ${sub}`;
  }
  return pathname.replace(/^\//, "") || "SomaiyaNet";
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    <span className="sx-num text-[12px] text-[var(--sx-text-2)]">
      {p(now.getUTCHours())}:{p(now.getUTCMinutes())}:{p(now.getUTCSeconds())} UTC
    </span>
  );
}

function ProfileSwitcher({
  profile,
  profiles,
  checking,
  onSwitch,
}: {
  profile: Profile | null;
  profiles: Profile[];
  checking: boolean;
  onSwitch: (role: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (ev: MouseEvent): void => {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Switch profile"
        className="sx-btn sx-btn--quiet sx-btn--sm flex items-center gap-1.5"
      >
        <span className="truncate max-w-[110px] text-white md:max-w-[160px]">
          {profile !== null && !checking
            ? (profile.title ?? titleFor(profile.role))
            : checking
              ? "Checking..."
              : "No profile"}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={`shrink-0 text-[var(--sx-text-2)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && profile !== null && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[14px] border border-[var(--sx-hairline)] bg-[var(--sx-surface)] p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className="sx-eyebrow text-[11px] text-[var(--sx-text-3)]">
              Switch profile
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            {profiles.map((p) => {
              const isCurrent = profile.role === p.role;
              return (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void onSwitch(p.role);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-[var(--sx-surface-2)] text-white"
                      : "text-[var(--sx-text-2)] hover:bg-[var(--sx-surface-2)] hover:text-white"
                  }`}
                >
                  <ProfileAvatar role={p.role} size={22} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-medium text-white">
                      {p.title}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--sx-text-3)]">
                      {p.role.replace(/_/g, " ")}
                    </span>
                  </div>
                  {isCurrent && (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-white shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <Link
            to="/console"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-[var(--sx-hairline)] px-3 py-2 text-[12px] text-[var(--sx-text-2)] hover:text-white transition-colors"
          >
            Change profile →
          </Link>
        </div>
      )}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(FALLBACK_PROFILES);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [redirected, setRedirected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Home path we just redirected to, so the notice survives that navigation.
  const redirectTarget = useRef<string | null>(null);

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
        if (!canVisit(r.data.role, location.pathname)) {
          redirectTarget.current = homeFor(r.data.role);
          setRedirected(true);
          setDismissed(false);
          navigate(homeFor(r.data.role), { replace: true });
        } else if (location.pathname !== redirectTarget.current) {
          redirectTarget.current = null;
          setRedirected(false);
        }
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

  const switchProfile = async (role: string): Promise<void> => {
    try {
      const r = await apiFetch<Profile>("/api/session", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setProfile(r.data);
      setSheetOpen(false);
      if (!canVisit(r.data.role, location.pathname)) {
        navigate(homeFor(r.data.role), { replace: true });
      }
      // Re-fetch the current page's data with the new role's permissions.
      window.location.reload();
    } catch {
      // Drawer surfaces the error card
    }
  };

  const role = profile?.role ?? null;
  // No known profile (not picked yet, or backend offline): show no pages at
  // all rather than every page, so nothing appears that the role may not use.
  const missionNav = role ? MISSION_NAV.filter((m) => canVisit(role, m.to)) : [];
  const labsNav = role ? LABS_NAV.filter((l) => canVisit(role, l.to)) : [];

  const navList = (
    <>
      {role === null && !checking && (
        <div className="rounded-[14px] bg-[var(--sx-surface)] p-3 mb-3">
          <p className="sx-body text-[13px] leading-relaxed text-white">
            {offline ? "Backend offline, so no profile is loaded." : "No profile picked yet."}
          </p>
          <Link
            to="/console"
            className="sx-btn sx-btn--sm mt-2.5 w-full text-center"
          >
            Pick a profile
          </Link>
        </div>
      )}
      {missionNav.length > 0 && (
        <p className="sx-eyebrow px-3 pt-2 pb-1.5 text-white/50">
          Mission
        </p>
      )}
      <nav className="flex flex-col gap-1" aria-label="Mission">
        {missionNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) => {
              const active = isActive || location.pathname === to;
              return `group flex h-9 items-center gap-2.5 rounded-[8px] px-3 font-sans text-[14px] transition-colors select-none ${
                active
                  ? "bg-[var(--sx-surface-2)] text-white"
                  : "text-white/70 hover:bg-white/[0.04] hover:text-white"
              }`;
            }}
          >
            {({ isActive }) => {
              const active = isActive || location.pathname === to;
              return (
                <>
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    className={`shrink-0 transition-colors ${
                      active ? "text-white" : "text-white/70 group-hover:text-white"
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>

      {labsNav.length > 0 && (
        <p className="sx-eyebrow mt-5 px-3 pt-2 pb-1.5 text-white/50">
          Database labs
        </p>
      )}
      <nav className="flex flex-col gap-1" aria-label="Database labs">
        {labsNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) => {
              const active = isActive || location.pathname === to;
              return `group flex h-9 items-center gap-2.5 rounded-[8px] px-3 font-sans text-[14px] transition-colors select-none ${
                active
                  ? "bg-[var(--sx-surface-2)] text-white"
                  : "text-white/70 hover:bg-white/[0.04] hover:text-white"
              }`;
            }}
          >
            {({ isActive }) => {
              const active = isActive || location.pathname === to;
              return (
                <>
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    className={`shrink-0 transition-colors ${
                      active ? "text-white" : "text-white/70 group-hover:text-white"
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
    </>
  );

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex min-h-screen bg-black text-[var(--sx-text)]">
      {/* Left sidebar: ~220px, pure black, hairline border on right edge */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-[var(--sx-hairline)] bg-black px-2.5 py-3 md:flex">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex items-center gap-2 px-2 py-1"
        >
          <Brand className="text-base" />
        </Link>
        <div className="mt-4 flex-1 overflow-y-auto">{navList}</div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--sx-hairline)] bg-black px-4 md:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setSheetOpen(true)}
              className="p-1.5 text-[var(--sx-text-2)] hover:text-white transition-colors cursor-pointer"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
            <Link to="/" aria-label="SomaiyaNet home" className="shrink-0">
              <BrandMark size={22} />
            </Link>
            <span className="sx-eyebrow hidden truncate text-white/50 sm:inline">
              {pageTitle}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ProfileSwitcher
              profile={profile}
              profiles={profiles}
              checking={checking}
              onSwitch={switchProfile}
            />
            <SqlButton />
          </div>
        </header>

        {/* Desktop top bar: pure black, hairline bottom border, page title left, switcher + clock + SQL right */}
        <header className="sticky top-0 z-30 hidden h-12 items-center justify-between border-b border-[var(--sx-hairline)] bg-black px-6 md:flex">
          <div className="flex items-center gap-3">
            <span className="sx-eyebrow text-white tracking-[0.14em]">
              {pageTitle}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <ProfileSwitcher
              profile={profile}
              profiles={profiles}
              checking={checking}
              onSwitch={switchProfile}
            />
            {offline && (
              <span className="sx-status" data-tone="warn">
                Backend offline
              </span>
            )}
            <UtcClock />
            <SqlButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {redirected && !dismissed && profile !== null && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--sx-surface)] rounded-[14px] p-4">
              <p className="sx-body m-0 text-white">
                That page is not available to {profile.title ?? titleFor(profile.role)}, so you
                were sent to your home page.
              </p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss redirect notice"
                className="sx-btn sx-btn--sm shrink-0 self-start sm:self-center"
              >
                Dismiss
              </button>
            </div>
          )}
          {role === null && !checking && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--sx-surface)] rounded-[14px] p-4">
              <p className="sx-body m-0 text-white">
                {offline ? "Backend offline, so no profile is loaded." : "No profile picked yet."}
              </p>
              <Link to="/console" className="sx-btn sx-btn--sm shrink-0 self-start sm:self-center">
                Pick a profile
              </Link>
            </div>
          )}
          <RoleProvider role={role}>{children}</RoleProvider>
        </main>
      </div>

      {/* Mobile sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[260px] border-r border-[var(--sx-hairline)] bg-black p-4 text-[var(--sx-text)]"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--sx-hairline)]">
            <Brand className="text-base" />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setSheetOpen(false)}
              className="p-1.5 text-[var(--sx-text-2)] hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
          <div className="mt-3 flex-1 overflow-y-auto">{navList}</div>
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
