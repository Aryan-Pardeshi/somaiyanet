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
import { Panel } from "@/components/cc/Panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiFetch } from "./api";
import { SqlButton, SqlDrawer, SqlProvider } from "./SqlDrawer";
import { RoleProvider, accessFor, canVisit, homeFor } from "./access";
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

function getPageTitle(pathname: string): string {
  const mission = MISSION_NAV.find((m) => m.to === pathname);
  if (mission) return mission.label.toUpperCase();
  const lab = LABS_NAV.find((l) => l.to === pathname);
  if (lab) return `LAB // ${lab.label.toUpperCase()}`;
  if (pathname.startsWith("/labs/")) {
    const sub = pathname.replace("/labs/", "");
    return `LAB // ${sub.toUpperCase()}`;
  }
  return pathname.replace(/^\//, "").toUpperCase() || "SOMAIYANET";
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    <span className="font-mono text-[11px] tabular-nums text-[#8b96b0]">
      {p(now.getUTCHours())}:{p(now.getUTCMinutes())}:{p(now.getUTCSeconds())} UTC
    </span>
  );
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
  const [redirected, setRedirected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Home path we just redirected to, so the notice survives that navigation.
  const redirectTarget = useRef<string | null>(null);
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
      if (!canVisit(r.data.role, location.pathname)) {
        navigate(homeFor(r.data.role), { replace: true });
      }
      // Re-fetch the current page's data with the new role's permissions.
      window.location.reload();
    } catch {
      // Drawer surfaces the error card; keep the popover open.
    }
  };

  const role = profile?.role ?? null;
  const who = role ? accessFor(role)?.who : null;
  const missionNav = MISSION_NAV.filter((m) => canVisit(role, m.to));
  const labsNav = LABS_NAV.filter((l) => canVisit(role, l.to));

  const switcher = (
    <div className="relative" ref={chipRef}>
      <Panel
        cut={6}
        className="w-full"
        onClick={() => setChipOpen((o) => !o)}
        aria-expanded={chipOpen}
        aria-label="Switch profile"
      >
        <div className="p-2 flex items-center gap-2.5 w-full select-none cursor-pointer">
          {profile !== null && !checking ? (
            <>
              <ProfileAvatar role={profile.role} size={24} />
              <div className="min-w-0 flex-1 text-left leading-tight">
                <span className="block truncate text-[12px] font-medium text-white">
                  {profile.title ?? titleFor(profile.role)}
                </span>
                <span className="block truncate font-mono text-[10px] text-[#8b96b0] uppercase tracking-wider">
                  {profile.role}
                </span>
                {who && (
                  <span className="block truncate text-[11px] text-[#5f6f93]">
                    {who}
                  </span>
                )}
              </div>
              <ChevronDown
                size={13}
                className={`shrink-0 text-[#8b96b0] transition-transform duration-200 ${
                  chipOpen ? "rotate-180" : ""
                }`}
              />
            </>
          ) : (
            <span className="px-1 font-mono text-[11px] text-[#8b96b0]">
              {checking ? "CHECKING..." : "NO PROFILE"}
            </span>
          )}
        </div>
      </Panel>

      {chipOpen && profile !== null && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-64 border border-white/10 bg-[#05070d]/95 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.85)]"
        >
          <div className="border-b border-white/[0.06] px-3 py-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b96b0]">
              SWITCH PROFILE
            </p>
          </div>
          <div className="flex flex-col py-1">
            {profiles.map((p) => {
              const isCurrent = profile.role === p.role;
              return (
                <button
                  key={p.role}
                  onClick={() => void switchProfile(p.role)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-[#3d5bff]/10 text-white"
                      : "text-[#dfe6f5] hover:bg-white/[0.06]"
                  }`}
                >
                  <ProfileAvatar role={p.role} size={26} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12px] font-medium text-white">
                      {p.title}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-[#8b96b0] uppercase tracking-wider">
                      {p.role}
                    </span>
                  </div>
                  {isCurrent ? (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-[#3d5bff] shadow-[0_0_6px_#3d5bff]"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full opacity-60"
                      style={{ background: accentRing(p.accent) }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <Link
            to="/console"
            onClick={() => setChipOpen(false)}
            className="block border-t border-white/[0.06] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[#8b96b0] hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            CHANGE PROFILE →
          </Link>
        </div>
      )}
    </div>
  );

  const navList = (
    <>
      <p className="px-3 pt-1 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
        MISSION
      </p>
      <nav className="mt-0.5 flex flex-col gap-0.5" aria-label="Mission">
        {missionNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) =>
              `group relative flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors select-none ${
                isActive
                  ? "text-white"
                  : "text-[#8b96b0] hover:text-white hover:bg-white/[0.03]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#3d5bff]"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[#3d5bff]/[0.08]"
                      style={{
                        clipPath:
                          "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
                      }}
                    />
                  </>
                )}
                <Icon
                  size={16}
                  className={`shrink-0 transition-colors ${
                    isActive
                      ? "text-[#7fb2ff]"
                      : "text-[#8b96b0] group-hover:text-white"
                  }`}
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <p className="mt-5 px-3 pt-1 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
        DATABASE LABS
      </p>
      <nav className="mt-0.5 flex flex-col gap-0.5" aria-label="Database labs">
        {labsNav.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            onClick={() => setSheetOpen(false)}
            className={({ isActive }) => {
              const active = isActive || location.pathname === to;
              return `group relative flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors select-none ${
                active
                  ? "text-white"
                  : "text-[#8b96b0] hover:text-white hover:bg-white/[0.03]"
              }`;
            }}
          >
            {({ isActive }) => {
              const active = isActive || location.pathname === to;
              return (
                <>
                  {active && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#3d5bff]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[#3d5bff]/[0.08]"
                        style={{
                          clipPath:
                            "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
                        }}
                      />
                    </>
                  )}
                  <Icon
                    size={16}
                    className={`shrink-0 transition-colors ${
                      active
                        ? "text-[#7fb2ff]"
                        : "text-[#8b96b0] group-hover:text-white"
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
    <div className="flex min-h-screen bg-black text-[#dfe6f5]">
      {/* Left sidebar: ~220px, pure black, 1px right border white/8 */}
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-black px-2.5 py-3 md:flex">
        <Link
          to="/"
          aria-label="SomaiyaNet home"
          className="flex items-center gap-2 px-2 py-1"
        >
          <Brand className="text-base" />
        </Link>
        <div className="mt-4 flex-1 overflow-y-auto">{navList}</div>
        <div className="mt-3 border-t border-white/[0.08] pt-2.5">{switcher}</div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-white/[0.08] bg-black/80 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              aria-label="Open menu"
              onClick={() => setSheetOpen(true)}
              className="p-1 border border-white/10 text-[#8b96b0] hover:text-white bg-transparent transition-colors cursor-pointer"
            >
              <Menu size={16} />
            </button>
            <Link to="/" aria-label="SomaiyaNet home" className="shrink-0">
              <Brand className="text-sm" />
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#8b96b0] truncate">
              / {pageTitle}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <UtcClock />
            <SqlButton />
          </div>
        </header>

        {/* Desktop top bar: transparent black, 1px bottom border white/8, page title left in mono uppercase, UTC clock + SQL button right */}
        <header className="sticky top-0 z-30 hidden h-12 items-center justify-between border-b border-white/[0.08] bg-black/70 px-6 backdrop-blur-md md:flex">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#dfe6f5]">
              {pageTitle}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {offline && (
              <span className="inline-flex items-center gap-1.5 border border-[#f5a524]/40 bg-[#f5a524]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#f5a524]">
                <span className="size-1.5 rounded-full bg-[#f5a524] animate-pulse" />
                Backend offline
              </span>
            )}
            <UtcClock />
            <SqlButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">
          {redirected && !dismissed && profile !== null && (
            <div className="mb-4 flex items-start justify-between gap-3 border border-[#f5a524]/40 bg-[#f5a524]/10 px-3 py-2 text-[12.5px] text-[#dfe6f5]">
              <span>
                That page is not available to {profile.title ?? titleFor(profile.role)}, so you
                were sent to your home page.
              </span>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss redirect notice"
                className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-[#8b96b0] hover:text-white"
              >
                Dismiss
              </button>
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
          className="w-[260px] border-r border-white/[0.08] bg-black p-4 text-[#dfe6f5]"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <Brand className="text-base" />
            <button
              aria-label="Close menu"
              onClick={() => setSheetOpen(false)}
              className="p-1 border border-white/10 text-[#8b96b0] hover:text-white transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">{navList}</div>
          <div className="mt-4 border-t border-white/[0.08] pt-3">
            {switcher}
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
