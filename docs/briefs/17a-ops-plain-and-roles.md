# Brief 17a: /ops in plain language + role-aware

Read docs/briefs/17-roles-common.md first.
Files you may edit: `web/src/pages/Ops.tsx`, `web/src/features/ops/**` (you may add fetch
helpers to `features/ops/api.ts`, but keep its existing exported types and `useOpsData` shape;
you may add a `refetchAlerts`/`reload` function to the hook's return value).

## 1. Remove jargon (current label -> new label; rewrite anything similar the same way)
- "ROUTER: AI DECISION TREE" / "SELECTED: SAT-A1" -> "Routing decided by: AI decision tree (in PostgreSQL)" / "Selected: SomaiyaSat-A1"
- "COVERAGE 100.0%" -> "Satellites with a ground pass in the next 90 min: 7 of 7" (real counts, not a bare %)
- Tabs "Overview / Fleet / Contacts / Telemetry" -> "Overview / Satellites / Upcoming passes / Live data"
- "CONSTELLATION 8 ASSETS" -> "Satellites (8)"; legend "6 nominal, 1 safe, 1 stowed" -> "6 healthy, 1 in safe mode, 1 not yet deployed"
- "MISSION FILTER" -> "Show"; chips "All / Nominal / Safe / Stowed" -> "All / Healthy / Safe mode / Not deployed"
- Fleet card: "Plane A, slot 1" -> "Orbit A, position 1"; "Alt 525 km" -> "525 km up"; "Pass: 00:19:26" -> "Next ground pass in 00:19:26"; "Signal" -> "Link quality"; keep "Battery 83% (8.00 V)"
- "ACTIVE ASSET" -> "Selected satellite"; "SAT-A1 / 525 KM SSO / PLANE A" -> "SAT-A1, sun-synchronous orbit A, 525 km"; state badge "NOMINAL" -> "Healthy" (SAFE -> "Safe mode", STOWED -> "Not deployed", DEPLOYED/COMMISSIONING -> "Starting up")
- "BATTERY VOLTAGE ... +0.00 V in 10m" -> "Battery" with "change over 10 min: +0.00 V"
- "PAYLOAD DIAGNOSTICS / PAYLOAD TEMP / TX POWER -88.5 dBm" -> "Health" with "Temperature" and "Signal received at ground (RSSI)". The value is `rssi_dbm` (received strength), so "TX power" was WRONG.
- "ANOMALY DETECTED" -> "Warning"; rows "Battery margin / Link margin / Queue load" -> plain words with a one-line explanation each (e.g. "Battery above safe-mode limit (6.8 V)")
- KPI panel -> "Today": "Working satellites", "Packets waiting to send", "Delivered in last 24 h", "Times the safety check overruled the AI"
- Dock: "Globe / Mumbai / Fleet" -> "Whole Earth / Mumbai / Selected satellite"; "LIVE" -> "Live from PostgreSQL"; "Demo route" -> "Show a sample route"
- Upcoming passes: "SAT-A3 -> SAT-A4 ISL" -> "SAT-A3 to SAT-A4 (satellite-to-satellite link)"; DOWNLINK -> "(to ground)"; "IN PASS" -> "Happening now"; "Link score" -> "Link quality"
- Live data tab: "WATCHDOG OVERRIDE" -> "Safety check overruled the AI"
- Add a small "?" hover hint next to "Link quality" and "Safe mode" explaining each in one sentence.

## 2. Role-aware
- Put a compact `<RoleHeader />` at the top of the left column (or a collapsible strip under the
  tab bar) so it never covers the globe.
- Station operators (`access.station`): default camera = their station (Mumbai for GS-BOM;
  add an "Espoo" camera option for GS-HEL at lat 60.2055, lng 24.6559 and use it as default for
  them); the Upcoming passes tab shows the note "Only passes involving your station are listed:
  row-level security on contact" (the API already returns only their rows); highlight their
  station marker on the globe.
- Warning panel: replace the local-only Dismiss with **Acknowledge**, which calls
  `POST /api/alerts/{alert_id}/ack` (via `apiFetch` from `@/app/api`) and then refetches alerts;
  wrap it in `<Locked action="ack_alert" onTry={sameCall}>`. Show API errors (42501) inline in
  the panel. Keep "Open AI router" (navigate to /brain).
- Student analyst sees Acknowledge as Locked ("Read-only role") with Try anyway (expect 42501
  from UPDATE on alert).

## 3. Layout bugs to fix while here
- Satellite labels on the globe overlap when satellites bunch up (A1/A2/B1/B2 near each other):
  for markers closer than about 28px on screen, hide the label of the non-selected ones and show
  it on hover; the selected satellite always shows its label.
- The right column is cut off at the bottom at 900px height (warning panel half hidden): make
  the right column scroll inside its own area with a soft fade at the bottom, and keep the
  bottom dock from overlapping it.
