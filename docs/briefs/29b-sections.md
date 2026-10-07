# Brief 29b: header, `SchemaMap`, `RoleLens`, `PageIndex`, footer and page assembly

First read `docs/briefs/29-common.md` (rules), `docs/design/DESIGN.md`, `web/src/styles/sx.css`,
`web/src/landing/publicApi.ts` and `web/src/components/story/Brand.tsx`.

Files you may create or edit (only these):
- rewrite `web/src/landing/SiteHeader.tsx`
- rewrite `web/src/landing/Footer.tsx`
- new `web/src/landing/SchemaMap.tsx`
- new `web/src/landing/RoleLens.tsx`
- new `web/src/landing/PageIndex.tsx`
- rewrite `web/src/pages/Landing.tsx`

`LiveHero` is being written in parallel by another worker; import it as
`import { LiveHero } from "@/landing/LiveHero"` and do not create that file.

## `Landing.tsx`
Black page: `SiteHeader`, then `<main>` with `LiveHero`, `SchemaMap`, `RoleLens`, `PageIndex`, then
`Footer`. Remove every import of the old sections (`CinematicHero`, `Mission`, `Constraints`,
`PacketStepper`, `Spacecraft`, `GroundNetwork`, `DatabaseRows`). Set `document.title` to
"SomaiyaNet" (no "Life of a Packet").

## `SiteHeader.tsx` (always visible)
Fixed top bar, 64 px. Transparent at the top; once the page has scrolled more than 8 px it becomes
`.sx-material`-like (black at 72% with blur, a bottom hairline, no radius). Left: `<Brand />`
linking to `/`. Middle/right on desktop: plain text links (`.sx-link`-quiet style, 14 px,
`--sx-text-2`, white on hover) to `#network` "Network", `#database` "Database", `#roles` "Roles",
`#pages` "Pages". Far right: `<Link to="/console" className="sx-btn sx-btn--sm">Open Console</Link>`.
Phones: Brand and "Open Console" only. No show/hide on scroll, no clock, no status badges.
Anchor links scroll natively (CSS `scroll-margin-top: 72px` on the sections is set with an inline
style or Tailwind `scroll-mt-[72px]` in your sections).

## `SchemaMap.tsx` (`<section id="database">`)
- `.sx-h2` "Inside The Database"; `.sx-lead` "Every screen in SomaiyaNet reads these tables. Pick
  one to see its columns and what it links to."
- One `.sx-caption` sentence built from `getSchema()` data: "27 tables, 11 views, 36 functions,
  13 triggers, 3 row-level security policies and 36 partitions." (count tables by `kind`; views =
  view + materialized view). No big-number strip.
- The map (desktop): five columns, one per area, each headed by a `.sx-eyebrow`:
  - Network: network_node, satellite, satellite_tle, deployer_pod, ground_station, station_key, contact
  - Data: payload_mode, telemetry, packet, ttc_frame, sstv_image, voice_frame
  - Routing: route, route_hop, routing_decision
  - AI: ai_model, ai_model_metric, dt_node
  - Operations: telecommand, alert, audit_log, deployment_event, deployment_log, sat_state_transition, lab_account
  Any table not listed goes to Operations. Views and the materialized view are listed after the
  map as one wrapped line of mono names in `.sx-caption` ("Views: v_constellation_status, …").
  Each table is a button (min 44 px tall, radius 10 px, `--sx-surface`): its name in mono 13 px,
  and `≈ 70,560 rows` as a caption (`approx_rows`, `toLocaleString()`). A partitioned table adds
  "partitioned" to that caption.
- Foreign keys come from `edges` (`from_table` references `to_table`). Draw them as 1 px white
  lines at 12% opacity in an absolutely positioned SVG over the map, as smooth curves between the
  right/left edges of the two buttons (measure with `getBoundingClientRect` relative to the map,
  re-measure on resize with `ResizeObserver`). Self-references (dt_node) are skipped.
- Selecting a table (click or Enter): its button gets `--sx-surface-2` and a 1 px white inset
  ring; buttons it references or that reference it stay full opacity, every other button fades to
  35%; its edges go to 70% white, others hide. Default selection: `packet`.
- Detail panel (right of the map on wide screens, under it on phones), an `.sx-group`:
  header row: table name (mono, 17 px, white) and its kind as a caption; then rows "References"
  and "Referenced by" with the neighbour names as small text buttons that select that table;
  then one row per column: column name (mono 13 px) left, type right (`.sx-caption`), and "null"
  in `--sx-text-3` when nullable. Long column lists scroll inside the panel (max-height ~440 px).
- Phones: no SVG lines; the five areas stack, buttons wrap; selection still dims unrelated tables.
- Error: "Could not load the schema." plus the SQLSTATE if present.

## `RoleLens.tsx` (`<section id="roles">`)
- `.sx-h2` "Same Query, Four Logins"; `.sx-lead` "PostgreSQL decides what each login may see. These
  are real results of the same two queries, run as four different database roles."
- Data: `getRoles()` once. Segmented control (44 px) with four segments: "Mission Director"
  (`mission_director`), "Mumbai Operator" (`station_operator_bom`), "Espoo Operator"
  (`station_operator_hel`), "Student Analyst" (`student_analyst`). Default: Mumbai Operator.
- For the chosen role, two blocks side by side on desktop, stacked on phones:
  1. Query `passes`: its SQL in `.sx-code`, then the result as an inset-grouped table (columns
     station, passes; mono station ids, `.sx-num` counts). Under it a caption that compares with
     the director's result, computed from data: if fewer rows than the director, "Row-level security
     on contact hides the other 5 stations' passes from this login." (use the real difference);
     otherwise "This login sees every station's passes."
  2. Query `telecommands`: SQL in `.sx-code`, then either the count (`.sx-num`, 28 px) with caption
     "telecommand rows visible to this login", or, when `ok` is false, the error in mono 13 px
     `--sx-red`: "ERROR 42501: permission denied for table telecommand" (use the real sqlstate
     and message) and the caption "This login has no SELECT grant on telecommand."
- Switching roles crossfades the results (200 ms). Keep block heights stable while switching.
- Error loading: "Could not reach the database." plus the SQLSTATE if present.

## `PageIndex.tsx` (`<section id="pages">`)
- `.sx-h2` "Open A Page"; no lead.
- One `.sx-group`; each row is a `<Link>` (min 64 px tall): left a title (`.sx-h3`, 17 px) with a
  `.sx-caption` under it; right a lucide `ChevronRight` (16 px, `--sx-text-3`). Hover: row
  background `--sx-surface-2`. Rows:
  - Ops (`/ops`): "Live globe of the satellites, their contact windows and alerts"
  - Routing (`/routing`): "Plan a packet's route with cgr_routes() and inspect every hop"
  - AI Brain (`/brain`): "The decision tree that chooses what each satellite sends"
  - Deploy (`/deploy`): "Release a satellite from its SomaiyaPod in one transaction"
  - Labs (`/labs/transactions`): "Transactions, security, indexing, normalization, schema and SQL"
  - Console (`/console`): "Choose a login role and start"

## `Footer.tsx`
Short and quiet: a top hairline, then in the 1200 px column: `<Brand />`, one `.sx-caption`
"A DBMS mini project at K J Somaiya, built on PostgreSQL 18, FastAPI and React.", a row of
`.sx-link` links (Console, Labs, Routing), and "© 2026 SomaiyaNet" as `.sx-caption`. No stars,
no canvas, no big CTA band, no animation. Phones: stacked, 16 px gutters.
