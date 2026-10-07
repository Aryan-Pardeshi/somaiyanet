# Brief 29a: `LiveHero`, the Earth plus a real route finder

First read `docs/briefs/29-common.md` (rules), `docs/design/DESIGN.md`, `web/src/styles/sx.css`,
`web/src/landing/publicApi.ts`, `web/src/landing/hero/CinematicHero.tsx` (only for the Earth code)
and `web/src/features/ops/orbit.ts` (`propagateSat`).

Files you may create or edit (only these):
- new `web/src/landing/earth/Earth.tsx`
- new `web/src/landing/LiveHero.tsx` (export `function LiveHero()`; brief 29b imports it as
  `import { LiveHero } from "@/landing/LiveHero"`)
- new, optional: `web/src/landing/earth/geo.ts` for pure helpers

## 1. `earth/Earth.tsx`
Move `EARTH_R`, `SUN_DIR`, `useEarthMaps`, `Earth` and `Atmosphere` out of `CinematicHero.tsx` into
this file unchanged (same shaders, textures from `assets/textures/`, clouds, atmosphere). Export
them. Remove only the coupling to the old `#hero-loader` element. Do not edit `CinematicHero.tsx`;
it will be deleted.

## 2. Layout (`LiveHero.tsx`)
`<section id="network">`, black, `min-height: 100svh`, top padding to clear a 64 px fixed header.
- Desktop (>= 1024 px): two columns inside the 1200 px column. Left (about 5/12): the copy and the
  route finder. Right (about 7/12): the Earth canvas, large, allowed to bleed off the right edge of
  the viewport, vertically centred. Text is left-aligned.
- Phones: the Earth canvas on top (about 52svh), the copy and route finder below it.
- Copy: `<h1 className="sx-display">Satellites That Route Themselves</h1>`, then one `.sx-lead`:
  "Pick a satellite. PostgreSQL works out the earliest way to get its data to every ground station,
  using only the contact windows stored in the database."

## 3. Route finder (left column, under the copy)
- On mount call `getNetwork()` for satellites, stations and `plan`.
- "From" + a segmented control (one pill group, 44 px tall) with every satellite whose state is
  not `STOWED` (today SS-1, SS-2, SS-3), labelled by id. A satellite in `SAFE` state shows a
  6 px orange dot in its segment. Default selection: SS-1. Selecting a satellite immediately calls
  `getRoutes(id)` (no separate submit button). Ignore stale responses (track a request id).
- Results: an `.sx-group` list, one `.sx-row` per route in rank order, 52 px rows:
  left: station name (from `stations` by `destination`) and its city as `.sx-caption`;
  right: "in 25m 27s" (`.sx-num`, `formatLatency(latency_s)`), and under it a caption
  "2 hops, weakest link q 43" (`bottleneck_score`; write "q n/a" if null).
  Rank 1 is selected by default. Clicking a row selects it and replays it on the Earth (below).
  The selected row has `--sx-surface-2` and a 6 px `--sx-red` dot before the name.
- Under the list: the exact SQL from the response, `sql[0].sql`, in one `.sx-code` block (12 px,
  wraps), then a caption from the same record: "Ran as student_analyst in 61 ms, 6 rows."
  (`role`, `elapsed_ms` rounded, `rowcount`).
- Loading: a `.sx-caption` "Finding routes…" in place of the list (keep the height stable).
- Empty (`routes` is `[]`): if `plan.ends` is in the past, say "The stored contact plan ended on
  6 Oct, 23:44. Run scripts/compute_contacts.py to plan the next 30 hours." (format the real
  date, local time); otherwise "No ground station is reachable from SS-3 in the next 30 hours."
- Error (`ApiError` or network): "The database is offline, so live routes are unavailable." plus
  `sqlstate` in mono `--sx-red` if present. The Earth still renders.

## 4. The Earth canvas
One `@react-three/fiber` `<Canvas>` (alpha, dpr [1, 2], fixed camera, no scroll coupling, no
OrbitControls zoom; optional gentle drag-to-rotate is fine). Stars: keep a sparse static point
field (optional). Inside a single Earth group (which carries the Earth's rotation):
- `Earth` + `Atmosphere` from `earth/Earth.tsx` (opacity refs fixed at 1).
- Coordinates: this Earth uses three.js `SphereGeometry` texture mapping, so a point at latitude
  `lat`, longitude `lng` (degrees) and radius `r` is
  `x = r*cos(lat)*cos(lng), y = r*sin(lat), z = -r*cos(lat)*sin(lng)` (radians; note the minus on
  z). Check it: Mumbai (19.07, 72.88) must sit on India's west coast of the texture.
- Stations: white dots, radius about `0.012 * EARTH_R`, on the surface (r = `EARTH_R * 1.002`).
  The selected route's destination station gets a small white label (drei `Html`, 12 px,
  `--font-sans`, no box) with its name. No other labels.
- Satellites: build `satellite.twoline2satrec(tle_line1, tle_line2)` once per satellite, and each
  frame place it with `propagateSat(rec, displayMs)` at `r = EARTH_R * (1 + alt * 1.5)` (altitude
  exaggerated 1.5x so it reads). White dots about `0.018 * EARTH_R`; the selected origin
  satellite is `--sx-blue` (`#0a84ff`). STOWED satellites are not drawn. No halos.
- Idle: `displayMs = Date.now()`; the Earth group turns slowly (about 0.02 rad/s).

## 5. Packet replay (the one orchestrated moment)
When a route is selected (including the default rank 1 after load):
1. Build the timeline from `path_nodes`, `path_contacts` and `contacts` (look up by `contact_id`):
   `t0 = now`; for hop i: `depart = max(previousArrive, contact.start_ts)`,
   `arrive = depart + 34 s` (41216 bytes at 9600 bit/s). The packet's carrier is the origin until
   hop 1 departs, then the next node, and so on. If a contact id is missing from `contacts`, stop
   the replay at that hop and show the caption "Contact n missing from the response".
2. Turn the Earth group (about 900 ms, ease-out) so the origin satellite's current position and the
   destination station are both on the visible face (aim at their midpoint), then hold that
   orientation (no auto-turn) while the route is shown.
3. Play: map real time `t0 .. lastArrive` onto 4 to 8 s of animation (at least 1.2 s per hop);
   `displayMs` runs from `t0` to `lastArrive`, so every satellite moves along its real orbit,
   faster than real time. A solid 8 px-ish red dot (`#ff453a`, no glow) is the packet: it sits on
   its carrier; during a transfer it moves along the straight segment between the two satellites
   (ISL), or along a short arc that descends to the station (downlink). Leave a 2 px red trail of
   where the packet has been (a `Line` from drei or a `THREE.Line` you append points to). Nothing
   else is red.
4. While playing, a caption under the selected row reads "Packet on SS-2, T+14 min" (or
   "Packet moving SS-1 to SS-2"); at the end: "Delivered to Tokyo at 18:42" (local time of
   `arrival_ts`). The final state stays (trail, packet resting on the station, satellites at their
   positions at arrival) until another row or satellite is picked, which replaces it.
5. `prefers-reduced-motion`: no animation; draw the whole trail at once (sample 240 points from
   `t0` to `lastArrive`), satellites at arrival time, and the "Delivered" caption.

Performance: no React state updates per frame (use refs and `useFrame`); propagate at most once per
frame per satellite; dispose geometries you create. Pause rendering when the section is off-screen
(`frameloop="demand"` + an IntersectionObserver, or a visibility ref).

Do not add anything else to the hero: no stats, no badges, no extra buttons, no scroll hint.
