# Brief 19b: four satellites in the web app

Read docs/briefs/19-four-satellites.md first (mapping table).

Files you may edit: `web/src/**` only. Do NOT edit db, scripts, backend, or `web/src/app/access.tsx`.

## Work
1. Replace every old ID per the mapping (grep `SAT-[AB][1-4]`, `POD-[AB][1-4]`, `VU2SA`) in:
   `features/ops/mock.ts` (mock constellation = the 4 SomaiyaSats with the states in the table,
   one plane; mock TLEs: derive from the existing SAT-A1..A3 / B4 mock entries), `features/ops/api.ts`
   (mock telemetry tick ids/bases: SS-1 7.9 V, SS-2 6.95 V, SS-3 6.6 V), `pages/Ops.tsx` (demo route
   SS-1 -> SS-2 -> SS-3 -> GS-BOM), `pages/Deploy.tsx` + `features/deploy/api.ts` (default pod
   POD-4 / SS-4), `pages/Routing.tsx`, `pages/Brain.tsx`, `features/labs/{TxLab,IndexLab,SqlLab}.tsx`,
   `landing/PacketStepper.tsx` (example SQL), and anything else the grep finds.
2. Copy: anywhere the UI or landing text implies a big constellation, make it say four satellites
   (three flying, one waiting in its deployer). Check `landing/**` (hero copy, Mission, Constraints,
   Spacecraft specs, DatabaseRows, RoleEllipses, CtaBanner, Footer), `pages/Console.tsx`.
3. Landing hero (`landing/hero/CinematicHero.tsx`) stage A draws a dense decorative "constellation
   shell" of many points around the Earth, which implies a mega-constellation. Replace it with ONE
   thin orbit ring carrying 3 small white satellite dots (plus the existing red packet dot if it
   rides that ring). Keep everything else in the hero unchanged; be careful, it is a long file.
   Stage D already shows 3 line-art satellites: keep it.
4. Ops layout: with only 4 satellites the left fleet list is short; make sure nothing assumes 8
   (e.g. fixed grids of 8 segments). The constellation bar must use the real count.

Strict TypeScript, no `any`, no unused locals. You cannot run shell commands; only read and edit
files. Do not run git or servers.
