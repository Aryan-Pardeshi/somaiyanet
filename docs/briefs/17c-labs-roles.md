# Brief 17c: labs role-aware + plain language

Read docs/briefs/17-roles-common.md first.
Files you may edit: `web/src/pages/Lab.tsx`, `web/src/features/labs/**`.

- Lab tab bar (in Lab.tsx): only show tabs where `canVisit(role, "/labs/<id>")`.
- Each lab: `<RoleHeader note="..." />` under the title. The note says truthfully which database
  role the lab runs as. Read `backend/routers/labs_*.py` and `backend/routers/console.py` to find
  out: if a lab runs as the picked role, say so (e.g. Security: "Every check below runs as the
  role you picked, against real GRANTs."; SQL console: "Your query runs as <role> inside a
  read-only transaction."); if it uses a fixed role or the owner, name it.
- Indexing lab: create / drop / benchmark index buttons become `<Locked action="bench_index">`
  with Try anyway.
- SQL console: the role selector chips default to the current role (from `useRole()`).
- Plain language: rewrite headings and descriptions in plain English (keep SQL, table names,
  SQLSTATE, isolation-level names, normal-form names). Remove decorative strings like "//",
  "SYS.", "ENGINE", fake version numbers, "EXAMINER VERIFICATION" (call it "What to look for").
- Errors: show 42501 as described in the shared brief.
