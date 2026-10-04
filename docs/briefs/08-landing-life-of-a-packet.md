# Brief 08: New landing page, "Life of a Packet" (built from scratch)

Read `docs/spec.md` **§9 (REVISED design language)** and §10 first.

The current landing in `web/src/sections/*` was ported from a friend's project. The user rejected it because it looks identical to the friend's site. **You are replacing it with an original design.** Do not open `reference/landing/src/sections` for inspiration, and do not keep the friend's section structure, copy, layout, cursor readout, glitch bands, progress rail, intro spiral gate, or point-cloud-Earth dive.

**Parallel-work rules.** A backend worker is in `backend/`. **Do not touch** `web/src/features/ops/**` or `web/src/pages/Ops.tsx` (the globe is done). Work in `web/` only.

## Delete
- `web/src/sections/**`
- `web/src/components/layout/**`, `web/src/components/three/**`, `web/src/components/brand/**`
- `web/src/hooks/useScrollScene.ts`
- any friend-derived files that become unused

**Keep** `web/src/lib/{gsap,lenis,utils,landmask}.ts` and `web/src/components/ui/*` (shadcn primitives), restyling them to the tokens. After deleting, make sure that nothing imports the deleted files, **including `web/src/features/ops`**, and that the build still passes. If ops imported something you deleted, recreate a minimal equivalent inside `features/ops`.

## Install
`@fontsource/space-grotesk`, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`. Remove `@fontsource/inter` and `@fontsource/jetbrains-mono` if nothing else uses them.

## Build
1. `web/src/styles/tokens.css` holds every token from §9 and the grid-paper background. `src/index.css` imports it and sets `body` to ink background and cream text with Plex Sans. Tailwind v4 theme vars map to the tokens. Remove the old palette files and values (`#3d6bff`, pure black).
2. **Shared components** in `web/src/components/story/`:
   - `PacketTag`
   - `SqlRibbon`: a typewriter that takes `sql: string`, highlights keywords amber, and starts when scrolled into view via ScrollTrigger
   - `HopRail`: takes nodes and an active index and animates the active segment in Somaiya red
   - `ChapterLabel`: `"01 / CAPTURED"`
   - `RowCard`: shows a DB row as a key/value card that "inserts" with a slide plus a red flash
   - `Brand`: the wordmark **SomaiyaNet**, with a Somaiya-red packet dot as the logo mark
3. **`web/src/pages/Landing.tsx`** is a scroll story built with Lenis + GSAP ScrollTrigger. **Each chapter pins** and scrubs its own animation.
   - A sticky left column carries the chapter label, the headline and 2–3 sentences of copy.
   - The right column carries the visual.
   - On mobile the two columns stack and nothing pins horizontally.
   - A persistent **PacketTag** floats top-right throughout, and its fields update per chapter: status `QUEUED → CLAIMED → ROUTED → DELIVERED`.

   **Chapter 00 / HERO.** Headline: "Every packet has a story. This is how a PocketQube constellation decides which ones reach Earth." The sub-line reads "SomaiyaNet · KJS-SRS-01 · DBMS mini project". Behind it is an R3F scene:
   - a **wireframe Earth** (lat/long line sphere in `--rule`/`--cream-dim`, *not* points, *not* textured)
   - two tilted **orbit rings** (planes A/B, 97.5° SSO feel)
   - 8 small amber satellite dots moving along the rings
   - one Somaiya-red glowing packet dot riding SAT-A3
   
   Slow camera drift, with the scroll hint "scroll to follow PKT#0412".

   **Chapter 01 / CAPTURED.** SAT-A3 captures an SSTV frame over the Pacific.
   - Visual: a stylised SSTV image builds line by line from scanlines (a canvas drawing scanlines of a procedurally generated Earth-limb image).
   - Beside it, two `RowCard`s insert: `packet {packet_id:412, origin_sat:'SAT-A3', mode:'SSTV', size_bytes:41216, status:'QUEUED'}` and `sstv_image {sstv_mode:'Robot36', width:320, height:240}`.
   - A `SqlRibbon` shows the INSERT, with copy explaining the **EER specialization**: packet → ttc_frame | sstv_image | voice_frame.

   **Chapter 02 / RELEASED.** A flashback to deployment: an SVG drawing of the SomaiyaPod deployer (a box with a spring plate, using the real envelope 127.4 × 57.9 × 57.2 mm as dimension annotations) ejects the PocketQube.
   - Three signal lamps light up in turn: SEPARATION_SWITCH, RELEASE_TIMER, RF_BEACON.
   - Show a "2 of 3 confirmed" counter, then `SqlRibbon`: `CALL confirm_deployment('POD-A3');` followed by `COMMIT`.
   - Then show the failure variant faintly: `ROLLBACK`, "the attempt is still logged, because the log is written in its own transaction".
   - Copy is about ACID and TCL.

   **Chapter 03 / DECIDED.** An SVG **decision tree** of about 15 nodes (data from `/api/ai/models/1/tree` if available, otherwise a bundled fixture shaped like `dt_node` rows).
   - On scroll, the path lights up node by node in Somaiya red, showing features like `battery_v = 7.40 ≤ 7.05? → right`.
   - The leaf says `RELAY_VIA_ISL`. Then a **watchdog** stamp checks the 5 invariants with ticks.
   - A second mini-scenario shows the watchdog **overriding** `FULL_DOWNLINK → TTC_VOICE` with a red OVERRIDE stamp.
   - Copy: the model is stored as rows and walked by a recursive CTE, which makes it explainable and keeps it fail-safe, matching the PDF's governance table.

   **Chapter 04 / NO STATION IN VIEW.** The hero R3F scene returns (shared canvas or a second instance).
   - The camera moves to SAT-A3, there is no ground station below, and the packet **hops** A3 → A2 → B2 along sky-blue ISL chords, with a `HopRail` underneath tracking it.
   - `SqlRibbon` shows an abbreviated `WITH RECURSIVE hops AS (...) CYCLE node SET is_cycle USING visited ...` (take the real text from `cgr_routes` in `db/04_functions.sql` and abbreviate it).
   - Copy explains Contact Graph Routing as earliest arrival over a time-varying contact graph.

   **Chapter 05 / DOWNLINK.** B2 rises over **KJSIT Mumbai**.
   - A signal-green beam runs to a station marker, with an elevation arc and the link score `64`.
   - The PacketTag flips to DELIVERED, and a `RowCard` shows the route row: `hops 3 · latency 18m 40s · bottleneck 64`.

   **Chapter 06 / IT BECOMES DATA.** A mini "database view": 3 stacked table cards (`telemetry`, `routing_decision`, `audit_log`) whose rows tick in.
   - A counter strip reads live numbers from `/api/stats` (fall back to `web/public/data/stats.json`).
   - **Rewrite `stats.json`** with our real shape:
     ```json
     {
       "source": "mock",
       "sats_total": 8,
       "sats_operational": 7,
       "telemetry_rows": 70560,
       "packets_queued": 420,
       "packets_delivered_24h": 144,
       "contacts_next_24h": 697,
       "isl_contacts_next_24h": 480,
       "ai_decisions": 7,
       "stations": 6
     }
     ```
   - Below the strip sits a grid of **9 experiment chips** (Exp 1–9, each with its concept in SomaiyaNet: EER generalization, mapping, DDL with EXCLUDE/partitions, DML/UPSERT, aggregates/set ops, recursive CTE + views, roles + RLS, BRIN/GIN/partial indexes, isolation/deadlock/SKIP LOCKED). Each chip links to `/labs/<slug>`, using the slugs `eer`, `mapping`, `ddl`, `dml`, `aggregates`, `routing`, `security`, `indexing` and `transactions`.

   **Chapter 07 / WHO MAY SEE IT.** Five profile cards, previewing the console: Mission Director, Mumbai Station, Espoo Station, Student Analyst, AI Router.
   - Each card has a one-line rule, e.g. "Analyst: may read, may never write — PostgreSQL enforces it."
   - The packet passes through a "lock" whenever a card is hovered.
   - A big CTA, **"Take the console →"**, links to `/console`.

   **Footer.** "SomaiyaNet — DBMS mini project, K J Somaiya." Faculty owners: Dr. Umesh Shinde (KJSIT) and Dr. Shailesh Nikam (KJSSE). Collaborator: ReOrbit, Finland. Credits: NASA Blue Marble textures (used on /ops), "orbit-math and globe textures adapted from lakshyamody/dbmsproj". Team placeholders: Aryan, Teammate.
4. **Motion quality.**
   - Use `gsap.context` per chapter and clean it up on unmount.
   - Respect `prefers-reduced-motion`: show the end states with no scrub.
   - Target 60 fps. No state updates per frame; use refs.
   - Run Lenis with ScrollTrigger sync (see `lib/lenis.ts`).
5. **Routes.** In `App.tsx`, keep the existing routes and wire `/ops` to `pages/Ops.tsx`. Leave the rest as placeholders, but restyle `Placeholder.tsx` to the new tokens.
6. **index.html.** Title "SomaiyaNet · Life of a Packet", plus a favicon showing a red packet dot (inline SVG).

## Copy rules
Write all copy yourself, short and confident, using the facts from spec + PLAN. Do not copy sentences from `reference/`.

## Acceptance (run these and paste the output)
```bash
cd web && npm install && npx tsc -b --noEmit && npm run build && npm run lint
grep -rn "3d6bff\|JetBrains\|Inter'\|\[ SECTION\|GlitchBands\|CursorReadout\|IntroGate\|PointsEarth" src index.html ; echo "old-identity-grep-exit=$?"
```
- The grep must exit 1 (no matches).
- Do not leave a dev server running.
- List the chapter components and explain how each one pins and scrubs.
