# Brief 17 (shared): role-aware screens + plain language

## Why
The app has five console roles (picked on /console, no passwords). PostgreSQL enforces what
each role may do (GRANTs, column privileges, row-level security). The screens must now
REFLECT the role: which pages it sees, where it lands, what it may do, and why something is
locked. The denial itself must stay real: a locked button offers "Try anyway", which fires the
same API request so the page shows the genuine Postgres error (SQLSTATE 42501).

## The contract (already written, do NOT edit): `web/src/app/access.tsx`
- `ROLE_ACCESS[role]` gives `{ home, routes, who, can, grants, actions, station? }`
- `canVisit(role, path)`, `homeFor(role)`, `accessFor(role)`
- `<RoleProvider role>` (AppShell wraps pages with it), `useRole()` gives `{ role, access, can(action) }`
- `<RoleHeader note?>`: one-line "who you are / you can / Postgres grants" strip; put it directly
  under each page's title + description. `note` = one page-specific sentence (plain English).
- `<Locked action reason? onTry?>{button}</Locked>`: renders the button when allowed; otherwise a
  "Locked" chip + reason + "Try anyway" (calls `onTry`, which must call the same API as the real
  button so the 42501 error shows up in the page's normal error display).
- Actions: deploy_signal, deploy_confirm, telecommand, ack_alert, execute_pass, plan_route,
  decide, refresh_kpis, bench_index, station_keys.

## API errors
API responses are `{data, sql, role}`; failures carry `sqlstate` / `message` (see
`web/src/app/api.ts` for the exact error shape). Show a 42501 as a red line
"Permission denied by PostgreSQL (42501)" with the Postgres message in mono. Never hide it.

## Plain language rule (applies to every visible string you touch)
Write for a teacher who knows databases but not satellites. Sentence case. No invented
jargon, no fake version numbers, no "SYS.", "//", "ASSET", "PAYLOAD DIAGNOSTICS"-style labels.
Keep real database terms (table names, SQL, GRANT, RLS, SQLSTATE) because those are graded.
Prefer: "Satellite", "Battery", "Next pass over a ground station", "Link quality", "Warnings".
Units after numbers. Mono uppercase is fine for small labels, but the words must be plain.

## Style
Keep the current command-center look (chamfered `Panel` from `@/components/cc/Panel`, black,
royal blue `#3d5bff`, amber `#f5a524`, red `#ff3b4f` only for critical/denied).

## Rules
- Strict TypeScript, no `any`, no unused locals. No new npm packages.
- Edit ONLY the files your brief lists. Do NOT edit `web/src/app/access.tsx`, backend or db files.
- Do NOT run git. Do NOT start dev servers or any long-running process.
