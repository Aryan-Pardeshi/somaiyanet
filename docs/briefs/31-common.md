# Brief 31 (common rules for 31a and 31b): the "orbit" landing page

## What the owner asked for
"Redesign the landing page to something like this: cool three.js scroll animations and cool
effects, no useless simulation diagrams and boxy stuff." The reference is a dark space site
(a Dribbble space-site shot the owner shared; not kept in the repo): a huge realistic Earth, a white 3D satellite
riding a glowing orbit arc, thin condensed Title Case headlines, ghost pill buttons, faint
concentric circles around the Earth, a glowing vertical beam, and a slim dot rail on the right
that names the current section. As you scroll, the Earth and the satellite glide to a new
position for each section while the text changes.

This replaces the previous landing (route finder, contact timeline, schema map, role lens, page
index). Those were the "boxy" parts. Do not bring back cards, tables, diagrams or SQL panels.

## Architecture
One fixed, full-viewport WebGL canvas sits behind the whole page (`SpaceScene`, brief 31a). The
page itself scrolls normally (no pinning, no scroll hijacking, no Lenis). Four transparent
sections, each `min-h-[100svh]`, sit on top of the canvas (brief 31b). The scene reads the
scroll position on every frame and moves the Earth, the satellite and the effects between one
keyframe per section.

The contract between the two briefs is `web/src/landing/space/scroll.ts` (already written, read
it, do not edit it):
- `SCENES`: the four section ids and labels, in order: `network`, `satellites`, `downlink`,
  `database`.
- `scenePosition()`: 0..3, fractional between sections (section i's top at the viewport top
  gives exactly i).
- `useActiveScene()`: rounded index for the rail and header.
- `isWideViewport()`: true when width >= 1024 and aspect >= 1.2. Wide puts text beside the
  Earth, narrow puts text in the lower part of the screen with the Earth above it.

Screen positions below are fractions of the viewport: x from the left edge, y from the top
edge. Both briefs use the same numbers so the text never sits on the Earth.

| Section | Wide: where the text goes | Narrow: where the text goes |
| --- | --- | --- |
| `network` | centred, y 0.16 to 0.45 | centred, y 0.14 to 0.48 |
| `satellites` | right half, x 0.54 to 0.92, y 0.48 to 0.86 | y 0.56 to 0.95 |
| `downlink` | left, x 0.07 to 0.44, y 0.36 to 0.80 | y 0.56 to 0.95 |
| `database` | centred, y 0.70 to 0.94 | y 0.56 to 0.95 |

## Look
- Black space `#000`, white type, greys from `--sx-*` in `web/src/styles/sx.css`.
- One accent: `--sx-red` `#ff453a`. In this product red is the data's path (the packet and its
  route), so the glowing orbit arc and the downlink beam are red. Nothing else is coloured,
  except the 6 px status dots (`.sx-status[data-tone]`).
- Glow is allowed only inside the 3D scene (the arc, the beam, the atmosphere). The DOM stays
  flat: no box shadows, no text shadows, no gradients on text or buttons.
- Headlines: Barlow Condensed (installed: `@fontsource/barlow-condensed`), weight 300, Title Case,
  never ALL CAPS. Body: the existing sans (`--font-sans`), sentence case.
- Buttons are the existing `.sx-btn` ghost pills (one `.sx-btn--filled` on the whole page).

## Rules for both briefs
- Strict TypeScript (no `any`, no unused locals or imports), React 19. No new npm packages:
  three, @react-three/fiber, @react-three/drei, satellite.js, lucide-react are installed.
- Respect `prefers-reduced-motion`: no intro animation, no time-based motion (spin, twinkle,
  beam flow); scroll still moves the scene, but with no easing lag.
- Phones (375 px wide): no horizontal scroll, 16 px gutters, touch targets at least 44 px.
- Never invent numbers. Live facts come from `web/src/landing/publicApi.ts`
  (`getNetwork()`, `getSchema()`); if a request fails, the copy falls back to words without
  numbers and the page keeps working.
- No "Exp N" labels, no numbered 01/02/03 markers, no eyebrow labels above headings, no
  middle-dot joined strings, no "→" appended to links.
- You cannot run shell commands. Only read and write files. Do not run git, npm or servers. Do
  not delete files. Edit only the files your brief lists.
- When done, list every file you changed or created with a one-line summary.
