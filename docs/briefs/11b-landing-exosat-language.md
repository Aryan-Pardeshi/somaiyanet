# Brief 11b: Landing refinement in the inspiration's visual language (black + navy, white line art)

The user's UI inspiration is **exosat.com**. Five reference frames are in `docs/inspiration/*.jpg`; **open and look at every one before you start.** Their visual language is:
- a pure black page
- **thin white line-art illustrations**: satellites with dashed beams to an Earth horizon drawn as white arcs and latitude lines (`exosat-hero-lineart.jpg`)
- a huge, light-weight geometric sans headline
- bordered square boxes holding white line-art drawings with small captions (`exosat-bordered-box.jpg`)
- ellipse outline cards (`exosat-ellipse-cards.jpg`)
- a dark world map with a **blue halftone dot** cluster (`exosat-halftone-map.jpg`)
- a glowing Earth wrapped in a constellation of light dots (`exosat-globe-dots.jpg`)
- thin 1 px frame lines running down the page edges

**The friend's site copied that same language very literally** (black, `#3d6bff`, `[ SECTION ]` bracket labels, the line-art link diagram). Ours must feel like it belongs to the same family, but it must be clearly **our own**:

| ours | theirs |
|---|---|
| deep black **with navy depth bands and glows** | flat black |
| Geist Sans **300 weight** headlines | their typeface |
| sentence-case labels with a small ice dot, e.g. `● Chapter 3`, and **no brackets** | `[ BRACKETS ]` |
| content built around **our packet story and our DB** | — |
| line art that depicts *our* things: the SomaiyaPod box, a PocketQube PCB stack, ISL chains, a decision tree, table rows | their imagery |

This runs **after** brief 11. The tokens in `web/src/styles/tokens.css` (space-black / navy / ice) already exist, so use them, and add only what is listed below. Work only in `web/src/landing/**`, `web/src/pages/Landing.tsx`, `web/src/components/story/**` and `web/src/pages/Console.tsx`.

## Changes
1. **Typography.** Landing display headlines are Geist Sans **300**, 64–88 px (clamp), letter-spacing -0.03em, in `--text`. Body is 17 px / 1.6 in `--text-2`. Labels are `● Chapter 3`, where the dot is 6 px `--ice` and the text is sentence case, 13 px, `--text-2`.
2. **Page frame.** Two 1 px `--line` vertical rules run 24 px inside the left and right viewport edges, and every chapter is separated by a 1 px `--line` horizontal rule spanning between them. The header bar is a semi-transparent `--space` strip with backdrop blur.
3. **Hero, rebuilt as line art.** Replace the R3F wireframe sphere hero with an **SVG/canvas line-art scene**:
   - an Earth horizon made of 5–6 thin white arcs plus 3 meridian curves, filling the bottom 45%
   - **8 small line-art PocketQubes** (simple outlined boxes with solar-panel hatch lines, *not* big satellite dishes), arranged as 2 tilted orbit-plane arcs (drawn dashed in `--line-strong`)
   - **dashed ISL beams between neighbouring cubes and dashed downlink beams to two tiny station markers on the horizon**, labelled "KJSIT Mumbai" and "Espoo" in 12 px `--text-3`
   - the **packet**, a `--somaiya` red glowing dot, travels the dashed path A3 → A2 → B2 → Mumbai on a slow loop, with GSAP MotionPath (already registered in `lib/gsap.ts`)
   - a parallax with the pointer of at most 8 px, disabled under reduced motion
   - a cursor coordinate readout is **not** allowed (the friend has one)
   - the headline sits on the left, the scene on the right half and under the header. Copy: "Satellites that decide what reaches Earth." The sub-line reads: "SomaiyaNet is a PocketQube constellation whose routing, AI decisions and permissions all live in PostgreSQL. Built for KJS-SRS-01."
   - two buttons: primary "Take the console" and secondary "Follow the packet", which scrolls to chapter 1
4. **Chapter visuals as bordered line-art boxes.** Each chapter's right-hand visual sits inside a 1 px `--line` square-ish box with a 12 px caption under it in `--text-2` (e.g. "SSTV frame · Robot36 · 320×240"). Redraw each visual in white/ice line art, with no filled navy cards inside:
   - Captured: scanline image drawing in white lines
   - Released: SomaiyaPod as an outline drawing with dimension lines, plus the 3 signal lamps as outlined circles that fill ice when confirmed
   - Decided: the tree as white strokes, path in ice, override stamp in `--danger` outline
   - No station: the ISL chain as line art with the packet dot
   - Downlink: a horizon arc, a station, and the beam in `--ok`
5. **Chapter 6 "It becomes data".** Make this a **halftone dot map**: a dark world map built from `/assets/textures/land_mask.png` (it exists in `web/public/assets/textures/`; sample it into a dot grid on a canvas) in `--navy-700` dots, with **ice halftone clusters over our 6 ground stations**, sized by their downlink counts from `/api/stats` (fallback values are fine). Overlay the live counters as plain large numbers (Geist 300, 48 px) with sentence-case labels. These are not cards.
6. **Chapter 7 "Who may see it".** The 5 roles appear as **ellipse outline cards** in a row (like the inspiration's ellipse cards): tall thin ellipses in `--line`. Hovering one fills it with an ice hatch pattern and reveals its rule line. Clicking navigates to `/console`.
7. **The 9 experiment chips** become a clean 3×3 grid of bordered boxes. Each has its Exp number (small, `--text-3`), its title, and a one-line concept; hovering turns the border ice.
8. **Console page:** match this language. Square bordered tiles holding line-art avatars (thin white strokes), the title "Who's on console?" in Geist 300 at 48 px, and the same page frame lines.
9. **Keep:** the chapter pin/scrub behaviour, PacketTag (restyled as a thin bordered pill), SqlRibbon, and reduced-motion support.
10. **Remove:** the R3F `OrbitScene` from the landing if it is no longer used. Keep the `three` dependency, because Ops uses it via globe.gl.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
grep -rn "\[ \|cursor\|CursorReadout" src/landing src/pages/Landing.tsx ; echo "grep-exit=$?"
```
- The grep must exit 1.
- List your files.
- Describe in 4 lines how the hero packet path animation is built.
- Do not leave a dev server running.
