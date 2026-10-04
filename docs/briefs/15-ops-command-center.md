# Brief 15: turn /ops into a satellite command center

Edit only: `web/src/pages/Ops.tsx`, `web/src/features/ops/SideRail.tsx`,
`web/src/features/ops/OpsGlobe.tsx`, and NEW files under `web/src/features/ops/cc/`
(create as many small components there as you like). Do NOT touch `AppShell.tsx`,
`api.ts`, `mock.ts`, `orbit.ts`, the landing page, or any backend file.
Keep using `useOpsData()` exactly as it is (same data contract).

## Reference look (described from the user's inspiration image, a "SpaceX" fleet console)
A dark, cinematic mission console on near-black, built around one big glowing globe:
- **Centre:** large dark Earth (city lights) with a soft white rim glow on top, several
  thin dotted orbit ellipses around it, satellites placed on the orbits, each with a small
  ring marker (white circle with dot) and a tiny label ("Aurora-1"). One marker is amber,
  one red (status colours).
- **Top centre:** a pill-shaped segmented tab bar (Overview, Fleet, Coverage, Telemetry, Control);
  pills have chamfered/notched ends, the active one is lighter.
- **HUD text** floats over the globe corners in tiny type: top-left "Mode: Relay, Alt 550 km /
  Selected: Aurora-1"; top-right "UTC 2026-... / Coverage 73.4%".
- **Left column:** a "Satellite Fleet" title card with a thin multi-colour segmented bar under
  it; a "Mission mode" card with 2x2 toggle chips (Tracking, Inspection, Relay [active],
  Standby); then a stack of fleet cards: satellite thumbnail on the left, name, "Nominal"
  badge, "Alt 550 km", a countdown "00:02:14", and two dashed progress bars (Signal 94%,
  Battery 88%). The selected card is brighter.
- **Right column:** "Active asset" card with huge light name "Aurora-1", sub line
  "SAT-01 / 550 KM LEO / Relay", a "Nominal" badge; "Signal strength 94%" with a dense
  vertical bar chart (-10 min ... NOW) and "+2.3% in 1h"; "Payload diagnostics" with two small
  area sparklines (Payload temp +18.4 C, Tx power 24.8 dBm); an amber "Anomaly detected"
  card with a warning icon, three amber progress rows (Orbit deviation 72%, Thermal threshold
  58%, Power budget 44%) and two buttons (Dismiss, Respond [amber filled]).
- **Bottom centre:** view toggles (2D / 3D [active] / Ground), a red-outlined "Live" pill with a
  signal icon, and a UTC clock box.
- **Panels:** translucent dark glass (very subtle white 3-5% fill, 1px border white 8-10%,
  backdrop blur), corners slightly chamfered (use `clip-path: polygon(...)` to cut 8-10px
  corners); this chamfer is the signature detail. Thin, light, wide-tracked type.

## Our version (SomaiyaNet palette, not SpaceX)
Background pure black `#000`. Text white / `#dfe6f5`, muted `#8b96b0`. Accent royal blue
`#3d5bff` (replaces the image's white "active" states and the chart bars). Status:
nominal = `#7ee2b8` (soft green), warn/anomaly = amber `#f5a524`, critical = `#ff3b4f`
(red only for critical and the routed packet). Fonts already loaded: Geist Sans (light 300
for big names), Geist Mono (small uppercase HUD labels). No rounded SaaS cards: use the
chamfered glass panels. Write the chamfer as one reusable `<Panel>` component in `cc/Panel.tsx`
(a 1px chamfered border can be done with an outer clip-path div in border colour and an inner
clip-path div inset by 1px).

### Layout (desktop >= 1280px)
The page sits inside AppShell's content area: full height, no page scroll. The globe fills
the whole area behind; the columns overlay it.
- Left column 300px, right column 340px, both scroll internally if needed, 16px gutters.
- Top centre tab bar: **Overview, Fleet, Contacts, Telemetry**.
  - Overview: everything visible (default).
  - Fleet: same as overview but the right column shows only the asset card + battery chart.
  - Contacts: right column swaps to a list of the next ISL / downlink contacts from
    `data.contacts` (from -> to, kind, start as live mm:ss countdown, link_score bar).
  - Telemetry: right column swaps to the live telemetry ticker (`data.telemetry`, newest
    first: sat, battery V, temp C, RSSI, mode) and the AI decisions (`data.decisions`;
    overridden ones marked amber "WATCHDOG OVERRIDE").
- HUD corner text over the globe: top-left `ROUTER: AI DECISION TREE` / `SELECTED: SAT-A3`;
  top-right live UTC clock + `COVERAGE` = share of sats with a downlink contact in the next
  90 min (compute from contacts) as a percent.
- Bottom centre dock: view buttons **Globe / Mumbai / Fleet** (Globe = default camera,
  Mumbai = point camera at GS-BOM, Fleet = fly to the selected sat). Add a
  `flyTo(view)` method to `OpsGlobeHandle` for this. Then a "Live" pill (red outline, pulsing
  dot) shown when not `data.mock`, else an amber "Mock data" pill; and a UTC clock box.
  Keep a small "Demo route" button in the dock that calls the existing `playRoute` demo
  (move the demo hops from Ops.tsx as-is).

### Left column
1. Title panel "Constellation" with a segmented bar: one segment per satellite coloured by
   state (NOMINAL green, SAFE amber, STOWED/DEPLOYED/COMMISSIONING muted blue `#4a5a8a`), plus a
   count line like `7 nominal, 1 stowed` computed from `data.sats`.
2. "Filter" panel with 2x2 chips: All, Nominal, Safe, Stowed. It filters the fleet list and
   dims non-matching sats on the globe (pass a `highlightIds` prop to OpsGlobe).
3. Fleet cards, one per satellite: a white line-art satellite icon (write `cc/SatIcon.tsx`,
   an SVG: square bus, two solar wings with cell lines, small dish; about 56px), name
   (`display_name`), state badge, `Plane A, slot 3`, `Alt 525 km`, next downlink countdown
   from `next_downlink_start` (hh:mm:ss, live, or "no pass" when null), and two dashed
   progress bars: **Signal** = best upcoming link_score for that sat (from contacts, 0-100)
   and **Battery** = battery_v mapped 6.0 V -> 0 %, 8.4 V -> 100 %. Click selects the sat
   (same `selectedId` state as the globe). Selected card: brighter fill + blue left edge.

### Right column (Overview / Fleet tabs)
1. Active asset panel for the selected sat (default: first NOMINAL sat): huge light name
   (40px, weight 300), sub line `SAT-A3 / 525 KM SSO / PLANE A`, state badge.
2. "Battery" panel: value now + delta vs start of history, a dense vertical bar chart (~40 bars)
   from `histories[selectedId]` (the existing seedHistories in Ops.tsx), x labels `-10 min`
   and `NOW`, bars blue, latest bar white.
3. "Payload diagnostics": two small area sparklines from telemetry for the selected sat
   (Temp C, RSSI dBm) with current values; fall back to a flat line when no data.
4. Anomaly panel (amber border + soft amber glow), shown when there is an unacknowledged WARN or
   CRITICAL alert in `data.alerts` (CRITICAL uses red instead of amber): warning icon,
   "Anomaly detected", the alert message, its sat, and three progress rows derived from that
   sat: Battery margin, Link margin, Queue load (sensible 0-100 mappings). Buttons
   **Dismiss** (hides it locally) and **Open AI router** (navigates to `/brain` with
   react-router-dom `useNavigate`).
5. KPI panel (from `data.kpis[0]`): Sats operational, Packets queued, Delivered 24 h,
   AI overrides 24 h; 2x2 grid, big light numbers.

### Globe (OpsGlobe.tsx)
Keep all existing behaviour (TLE propagation, ISL lines, downlink arcs, route playback,
station markers). Restyle: darker Earth (night-lights texture if one exists under
`web/public`, otherwise darken the current one), atmosphere colour `#cfd8ff` with altitude
about 0.18 so the rim glows like the reference; draw each satellite's orbit as a thin dotted
white path (opacity ~0.25); satellite markers as HTML elements (globe.gl `htmlElementsData`):
a 14px ring marker + label in Geist Mono 10px, coloured by state as above; selected marker
larger with a blue ring. Accept new optional prop `highlightIds?: string[]`; add
`flyTo(view: "globe" | "mumbai" | "fleet")` to the handle. Transparent background so the
black page shows. Centre the globe in the free space between the two columns (offset the
canvas/container) so it is not hidden behind the left column.

### Responsive
Below 1024px: columns stack under the globe (globe 60vh), tab bar stays on top, no overlay.

### Quality
- Strict TypeScript, no `any`, no unused locals. Use the existing `@/` path alias. No new npm
  packages (lucide-react icons are available).
- Respect `prefers-reduced-motion` for pulsing dots.
- SideRail.tsx may be deleted from use (leave the file or reuse pieces of it).

## Rules
- You cannot run shell commands in this session; do not try. Only read and edit files.
- Do NOT run git. Do NOT start servers.
