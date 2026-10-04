# Brief 06: Web app shell + landing page port

Read `docs/spec.md` §0, §9, §10 and the Context section of `docs/PLAN.md`. The friend's project in `reference/` is read-only; **copy from it, never edit it**. The friend has agreed that we reuse the code. Keep a credit comment `// adapted from lakshyamody/dbmsproj (landing)` at the top of every file you copy and adapt.

Other workers are busy in `db/`, `scripts/` and `tests/` right now. **Work only inside `web/`.**

## Goal
A Vite + React + TypeScript app in `web/` that:
- builds cleanly
- hosts the full scroll-driven landing page at `/`, ported from `reference/landing/` and re-themed and re-written for **SomaiyaNet**
- has the app routes stubbed for later tasks

## Steps
1. Scaffold `web/` by copying `reference/landing/`'s config:
   - `package.json`: rename it to `somaiyanet-web`, keep the same deps, and add `react-router-dom@7`, `satellite.js@6` and `@xyflow/react@12`
   - `vite.config.ts`, the tsconfigs, `components.json`, `.oxlintrc.json`, `index.html` (title "SomaiyaNet: Constellation Mission Ops"), and `src/index.css`
   - Add a Vite dev proxy: `/api` → `http://localhost:8000`.
2. Copy `reference/landing/public/assets/**` to `web/public/assets/`: the fonts, the textures, `land_mask.png` and the `img/` folder. Copy the `vendor/` folder too only if the code still needs it; prefer the npm `globe.gl` and `satellite.js`. Copy `public/data/stats.json` to `web/public/data/stats.json` as mock data.
3. Copy `src/components/**`, `src/hooks/**`, `src/lib/**` and `src/sections/**`, then adapt them:
   - **Routing.** `src/main.tsx` uses a react-router `BrowserRouter`. The routes are:
     - `/`: Landing (the friend's `App.tsx` composition, moved to `src/pages/Landing.tsx`)
     - `/console`: role picker, placeholder
     - `/ops`, `/routing`, `/brain`, `/deploy`: placeholders
     - `/labs/:lab`: placeholder
     
     Each placeholder is a simple dark page with a `[ COMING ONLINE ]` label and the route name.
   - **Palette.** Edit `src/lib/palette.ts` and `src/index.css` to spec §9. Keep black and `#3d6bff`, and add the Somaiya red token `--somaiya-red: #d7263d`, used **sparingly**: the brand-mark dot, one hero accent line, and the CTA hover only. No large red areas.
   - **Brand.** Change the wordmark from "SomaiyaSat Ground Control" to **"SomaiyaNet"**, with the sub-label "Constellation Mission Ops · KJS-SRS-01".
4. **Rewrite all the copy.** Do not reuse the friend's sentences; the facts below come from the use-case PDF.
   - **Hero.** The tagline is about a constellation of PocketQubes that *routes its own data*: "Eight PocketQubes. One database deciding what reaches Earth." Keep the R3F scene stages, but relabel them: constellation, dive, the deployer releases, the link.
   - **Mission.** Keep it short. SomaiyaSat is a PocketQube (127.4 × 57.9 × 57.2 mm envelope, PCB 1.6 mm) released by the SomaiyaPod deployer. It carries M17, Codec2, SSTV and TT&C payloads, and the collaborator is ReOrbit, Finland.
   - **Challenge.** Three rows:
     - minutes-long ground passes
     - a power budget under 1 W
     - the AI must never drop housekeeping
   - **Payloads.** Priority order: TT&C → SSTV → M17/Codec2.
   - **NEW section `src/sections/Constellation.tsx` ("The constellation routes itself").** This is an animated SVG or R3F schematic of 8 sats in 2 orbital planes. Packets hop along inter-satellite links (dashed beams), toward the satellite that will reach a ground station first. Use GSAP ScrollTrigger to step through three states: (1) the packet is born over the ocean with no station in view, (2) it hops along the ISL chain, (3) it lands at GS-HEL. Add a caption saying this is **Contact Graph Routing computed in SQL (recursive CTE)**.
   - **`HowItDecides`.** Reframe it as the AI decision tree stored in the database: a small animated tree diagram, the path highlighting, and then the watchdog overriding an unsafe AI action. Show the override badge in Somaiya red.
   - **NEW section `src/sections/DatabaseIsMissionControl.tsx`.** A grid of 9 cards, one per DBMS experiment. Each card has the experiment number, its title, and the concept as it appears in SomaiyaNet:
     1. EER generalization
     2. relational mapping
     3. DDL with EXCLUDE and partitions
     4. DML/UPSERT
     5. aggregates and set ops
     6. recursive CTE routing and views
     7. roles + RLS
     8. BRIN/GIN/partial indexes
     9. isolation levels, deadlocks, and SKIP LOCKED
     
     Each card links to `/labs/<slug>`. Use the mono `[ SECTION ]` labels.
   - **Keep** ByTheNumbers (reading `/data/stats.json` through `useStats`; leave the fetch path configurable) and GroundNetwork. Relabel the stations to: KJSIT Mumbai, ReOrbit Espoo, Bengaluru, Tokyo, Svalbard, Cape Town.
   - **Team.** Placeholder names: "Aryan" and "Teammate". Faculty owners: Dr. Umesh Shinde (KJSIT), Dr. Shailesh Nikam (KJSSE).
   - **CTA.** The button "Enter Mission Control" navigates to `/console`.
   - **Footer.** Credit NASA imagery, plus "landing animation engine adapted from lakshyamody/dbmsproj".
   - Remove the sections that no longer fit, or merge them. Section order: Hero, Mission, Challenge, Payloads, Constellation, HowItDecides, DatabaseIsMissionControl, ByTheNumbers, GroundNetwork, Team, CTA.
5. Keep everything offline: local fonts, no CDN.

## Do not touch
Anything outside `web/`.

## Acceptance (run these and paste the output)
```bash
cd web && npm install && npm run build
```
- The build must pass with zero TypeScript errors.
- Then run `npm run lint` and report the result.
- Then `grep -rn "Ground Control" src` must return nothing.
- List the final section files and routes.

Do not start a long-running dev server. If you do start one to check something, stop it before you finish.
