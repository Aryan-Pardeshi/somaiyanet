/**
 * Role-aware UI. PostgreSQL stays the real gatekeeper (GRANTs, column
 * privileges, RLS); this file only makes the screens reflect the role:
 * which pages a role sees, where it lands, and which actions are locked.
 * A locked action can still be fired ("Try anyway") so the real 42501
 * from Postgres is shown, never faked in the browser.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

export type Role =
  | "mission_director"
  | "station_operator_bom"
  | "station_operator_hel"
  | "student_analyst"
  | "ai_router";

/** Things a page can ask about before offering a write/action button. */
export type Action =
  | "deploy_signal" // record a deployment signal (record_deploy_signal)
  | "deploy_confirm" // CALL confirm_deployment / reset_deploy_demo (director only)
  | "telecommand" // sign + send a telecommand
  | "ack_alert" // acknowledge / respond to an alert
  | "execute_pass" // run a downlink pass
  | "plan_route" // persist a route (plan_route), not just preview cgr_routes
  | "decide" // run decide_for_satellite (writes routing_decision)
  | "refresh_kpis" // REFRESH MATERIALIZED VIEW mv_kpis
  | "bench_index" // create/drop benchmark indexes
  | "station_keys"; // read station_key.secret

export interface RoleAccess {
  /** Where the role lands after picking its profile. */
  home: string;
  /** Path prefixes the role may open; everything else redirects home. */
  routes: string[];
  /** One plain sentence: who you are. */
  who: string;
  /** Short list of what you can do here. */
  can: string[];
  /** The Postgres grants that make it so (shown in the role header). */
  grants: string[];
  /** Actions the role is allowed to perform. */
  actions: Action[];
  /** Ground station the role is tied to (row-level security), if any. */
  station?: "GS-BOM" | "GS-HEL";
}

const ALL_LABS = "/labs/";

export const ROLE_ACCESS: Record<Role, RoleAccess> = {
  mission_director: {
    home: "/ops",
    routes: ["/ops", "/routing", "/brain", "/deploy", ALL_LABS],
    who: "Mission director: full control of the constellation.",
    can: ["confirm deployments", "send telecommands", "respond to alerts", "run every lab"],
    grants: ["ALL PRIVILEGES ON ALL TABLES", "EXECUTE ON ALL FUNCTIONS", "SELECT ON telemetry WITH GRANT OPTION"],
    actions: [
      "deploy_signal",
      "deploy_confirm",
      "telecommand",
      "ack_alert",
      "execute_pass",
      "plan_route",
      "decide",
      "refresh_kpis",
      "bench_index",
      "station_keys",
    ],
  },
  station_operator_bom: {
    home: "/ops",
    routes: ["/ops", "/routing", "/brain", "/deploy", ALL_LABS],
    who: "Mumbai station operator (GS-BOM, KJSIT).",
    can: ["see Mumbai's passes", "send telecommands via Mumbai", "acknowledge alerts", "run a pass"],
    grants: [
      "SELECT ON mission tables",
      "INSERT ON telecommand (RLS: station_id = GS-BOM)",
      "UPDATE (acknowledged) ON alert",
      "no SELECT on station_key.secret",
    ],
    actions: ["telecommand", "ack_alert", "execute_pass", "plan_route", "decide", "deploy_signal"],
    station: "GS-BOM",
  },
  station_operator_hel: {
    home: "/ops",
    routes: ["/ops", "/routing", "/brain", "/deploy", ALL_LABS],
    who: "Espoo station operator (GS-HEL, ReOrbit).",
    can: ["see Espoo's passes", "send telecommands via Espoo", "acknowledge alerts", "run a pass"],
    grants: [
      "SELECT ON mission tables",
      "INSERT ON telecommand (RLS: station_id = GS-HEL)",
      "UPDATE (acknowledged) ON alert",
      "no SELECT on station_key.secret",
    ],
    actions: ["telecommand", "ack_alert", "execute_pass", "plan_route", "decide", "deploy_signal"],
    station: "GS-HEL",
  },
  student_analyst: {
    home: "/labs/sql",
    routes: ["/ops", "/routing", "/brain", "/deploy", ALL_LABS],
    who: "Student analyst: read-only.",
    can: ["read views and telemetry", "preview routes and AI decisions", "run every lab"],
    grants: ["SELECT ON views, telemetry, packets, contacts, AI tables", "no INSERT / UPDATE / DELETE anywhere"],
    actions: ["bench_index"],
  },
  ai_router: {
    home: "/brain",
    routes: ["/brain", "/labs/security", "/labs/sql"],
    who: "AI router: the program on board that decides what to send.",
    can: ["read its own decision tree", "log decisions", "write telemetry (cannot read it back)"],
    grants: [
      "INSERT ON telemetry, packet",
      "SELECT ON ai_model, dt_node, routing_decision",
      "SELECT (node_id, state) ON satellite",
      "EXECUTE decide_for_satellite, dispatch_packets",
    ],
    actions: ["decide"],
  },
};

export function accessFor(role: string | null | undefined): RoleAccess | null {
  if (!role) return null;
  return (ROLE_ACCESS as Record<string, RoleAccess>)[role] ?? null;
}

export function canVisit(role: string | null | undefined, path: string): boolean {
  const a = accessFor(role);
  if (!a) return true; // unknown role: let Postgres decide
  return a.routes.some((r) => (r.endsWith("/") ? path.startsWith(r) : path === r || path.startsWith(`${r}/`)));
}

export function homeFor(role: string | null | undefined): string {
  return accessFor(role)?.home ?? "/ops";
}

interface RoleCtx {
  role: string | null;
  access: RoleAccess | null;
  can: (a: Action) => boolean;
}

const RoleContext = createContext<RoleCtx>({ role: null, access: null, can: () => true });

export function RoleProvider({ role, children }: { role: string | null; children: ReactNode }) {
  const access = accessFor(role);
  const can = (a: Action): boolean => (access ? access.actions.includes(a) : true);
  return <RoleContext.Provider value={{ role, access, can }}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleCtx {
  return useContext(RoleContext);
}

/**
 * One-line strip under a page title: who you are, what you can do on this
 * page, and the Postgres grants behind it. `note` adds a page-specific line.
 */
export function RoleHeader({ note }: { note?: string }) {
  const { access } = useRole();
  const [open, setOpen] = useState(false);
  if (!access) return null;
  return (
    <div className="mt-3 border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12.5px] text-[#9aa3b8]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[#dfe6f5]">{access.who}</span>
        <span>You can: {access.can.join(", ")}.</span>
        {note && <span className="text-[#dfe6f5]">{note}</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[#3d5bff] hover:text-white"
          aria-expanded={open}
        >
          {open ? "Hide grants" : "Postgres grants"}
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-[#8b96b0]">
          {access.grants.map((g) => (
            <li key={g}>GRANT {g}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Wraps an action button. Allowed: renders children as-is. Not allowed:
 * renders a locked look with the reason, plus "Try anyway" which still calls
 * `onTry` so the page can show the real Postgres error (usually 42501).
 */
export function Locked({
  action,
  reason,
  onTry,
  children,
}: {
  action: Action;
  reason?: string;
  onTry?: () => void;
  children: ReactNode;
}) {
  const { can, access } = useRole();
  if (can(action)) return <>{children}</>;
  const why = reason ?? `${access?.who.split(":")[0] ?? "This role"} is not allowed to do this.`;
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#5f6f93]"
        title={why}
      >
        <Lock size={12} aria-hidden="true" />
        Locked
      </span>
      <span className="text-[12px] text-[#8b96b0]">{why}</span>
      {onTry && (
        <button
          type="button"
          onClick={onTry}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#ff3b4f] underline-offset-2 hover:underline"
        >
          Try anyway
        </button>
      )}
    </div>
  );
}
