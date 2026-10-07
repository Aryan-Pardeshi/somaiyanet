# Brief 29 (common rules for 29a and 29b): a new landing page

## Why
A reviewer said our landing page is nearly the same as lakshyamody/dbmsproj's. It was: both had a
pinned, scroll-scrubbed 3D hero (Earth, then a warp dive, then a satellite hanging over the Earth's
limb, then a line-art route diagram), a giant bottom-left headline over a vignette, a cursor
lat/lng readout, a "constraints" trio of cards, a hardware spec section, a dot-grid world map of
ground stations with stats, and a 30-screen scroll story. All of that goes.

The new landing page is a **hands-on tool, not a film**. It is short (about 4 to 5 screens, normal
scrolling) and every number on it comes from a real query whose SQL is shown next to the result.

## Keep
Only **the Earth**: the textured day/night Earth with clouds and its atmosphere from
`web/src/landing/hero/CinematicHero.tsx` (`useEarthMaps`, `Earth`, `Atmosphere`, `EARTH_R`,
`SUN_DIR`). Brief 29a moves these into `web/src/landing/earth/Earth.tsx` unchanged.

## Never use (banned, they are what made it look copied)
Scroll pinning or scroll-scrubbed scenes; GSAP ScrollTrigger on the landing; warp/dive streaks; a 3D
satellite or PocketQube model; a line-art route diagram overlay; a cursor-following readout; a
bottom-left giant headline over a vignette; a loader or intro gate; a scroll progress rail; a
"challenge"/"constraints" trio of cards; a hardware spec section; a world map of stations; a "by
the numbers" big-stat strip; a team section; numbered 01/02/03 markers; smooth-scroll hijacking.

## New page, top to bottom (`web/src/pages/Landing.tsx`)
1. `SiteHeader` (always visible) - brief 29b
2. `LiveHero` (`id="network"`): Earth + "Send A Packet" route finder - brief 29a
3. `SchemaMap` (`id="database"`): the real schema, clickable - brief 29b
4. `RoleLens` (`id="roles"`): the same queries run as four database logins - brief 29b
5. `PageIndex` (`id="pages"`): a list of the console pages - brief 29b
6. `Footer` - brief 29b

## Data
Use only `web/src/landing/publicApi.ts` (already written; read it). Endpoints are public and
read-only: `getNetwork()`, `getRoutes(origin)`, `getRoles()`, `getSchema()`. Each returns
`{ data, sql, role }`; `sql` is a list of `{ label, sql, elapsed_ms, rowcount }` for the statements
the server actually ran. Show that SQL near the result it produced. Never invent numbers; if a
request fails, say what failed in one plain sentence (with the SQLSTATE in mono if there is one)
and keep the rest of the page working. `ApiError` has `status`, `sqlstate`, `message`.

## Design rules (read `docs/design/DESIGN.md` and `web/src/styles/sx.css` first)
- Pure black page, white text, greys from `--sx-*`. Colour only in data: `--sx-red` for the
  packet and its route and errors, `--sx-blue` for the one selected satellite, `--sx-green`/
  `--sx-orange` for status dots. No gradients, glows, shadows (the Earth's own atmosphere is the
  one exception, keep it).
- Headings Title Case via the `.sx-*` classes (`.sx-display`, `.sx-h2`, `.sx-h3`). No ALL CAPS
  except SQL keywords. Body sentence case. No "Exp N" or syllabus labels anywhere in the UI.
- Mono (`.sx-code`, `font-mono`) only for SQL, table/column names and ids inside results.
- Lists are Apple inset-grouped (`.sx-group` + `.sx-row`), not card grids. Buttons are `.sx-btn`
  pills; at most one `.sx-btn--filled` on the page (the header's "Open Console" is not filled).
- No middle-dot joined meta strings ("A · B · C"); write "2 hops, weakest link q 43".
- Section rhythm: `.sx-section`, content column `mx-auto max-w-[1200px] px-4 md:px-8`. Each section
  has one `.sx-h2` title and at most one `.sx-lead` line. No eyebrow labels above headings.
- Motion only in answer to a click (selecting a satellite, a table, a role), 200-400 ms with
  `--sx-ease-out`. The packet replay in the hero is the one orchestrated moment. Respect
  `prefers-reduced-motion` (show the final state).
- Phones (375 px): no horizontal scroll, 16 px gutters, touch targets at least 44 px.
- Strict TypeScript (no `any`, no unused locals or imports), React 19, no new npm packages
  (three, @react-three/fiber, @react-three/drei, satellite.js and lucide-react are installed).

## Process
- Edit or create only the files your brief lists. Do not delete files (I will). Do not edit
  `index.css`, `sx.css`, `DESIGN.md`, `publicApi.ts`, or the other brief's files.
- You cannot run shell commands; only read and edit files. Do not run git, npm or servers.
- When done, list each file you changed or created with a one-line summary.
