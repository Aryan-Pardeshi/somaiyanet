# Brief 13: Landing rebuilt in the inspiration's cinematic structure (supersedes 08/11b)

**First study the inspiration.** Open **all** the images in `docs/inspiration/`. `exosat-sequence-01…07.jpg` are 1-frame-per-second contact sheets of a full scroll through exosat.com, read left→right, top→bottom; the sequence starts at sheet 02 and the hero is on sheets 02–03 and 07. The user said we missed the gist. **The gist is:**

1. **A cinematic, scroll-scrubbed 3D hero.** It runs as a pinned sequence of about 400vh:
   1. A **photoreal Earth** (day texture, night lights, atmosphere glow, stars) covered in a **dense constellation of glowing white-blue dots and orbit rings**, with a huge white headline at the bottom-left.
   2. Scrolling triggers a **dive/warp** through blue light streaks.
   3. The camera arrives at a **realistic 3D satellite** above the Earth's limb.
   4. The Earth fades away, and the background becomes **pure black with a deep navy-blue gradient glow from the top**.
   5. The scene **morphs into white line art**: thin outline satellites with **dashed beams** down to a **white wireframe Earth horizon** (arcs plus meridians). The headline stays.
2. **Then calm, sparse sections on pure black,** with lots of negative space and **sharp 1 px square borders** (no rounded filled cards):
   - a centered mission sentence with a tiny 3D Earth and an orbit ring
   - **numbered hairline rows** (number left, title, description right column)
   - **bordered square boxes with animated white line-art drawings**. These are pinned and step through one at a time, with the descriptive text appearing beside the active box.
   - a **blueprint block**: a blue-outline technical drawing of the spacecraft beside a render, with mono specs aligned right
   - a **dark world map with blue halftone dot clusters**
   - **tall ellipse outline cards** that reveal an image or hatch fill on hover
   - a **CTA banner** with a blurred Earth photo, a centered headline and a solid blue button
   - a **footer** with an Earth horizon and a satellite
3. **Chrome:**
   - The header has the logo at left and a bordered button at right ("Take the console ↗").
   - Small **mono uppercase labels** with a tiny blue dot.
   - Headlines are a light geometric sans, large, white.
   - Body text is grey.

We follow this structure faithfully, filled with **our** content: SomaiyaSat/SomaiyaPod, the 8-PocketQube constellation, ISL packet routing, the in-DB AI, PostgreSQL. **Do not copy exosat's or the friend's copy.** The friend (`reference/landing`) also imitated this site; **do not open or reuse `reference/landing/src`**. Use only the Earth textures already in `web/public/assets/textures/`.

**Parallel-work rules.** Another worker is editing `web/src/features/labs/**` and `web/src/pages/{Routing,Brain,Deploy,Lab}.tsx`. Work only in:
- `web/src/landing/**`
- `web/src/pages/Landing.tsx`
- `web/src/components/story/**`
- `web/src/pages/Console.tsx`
- new files under `web/src/landing/`

The token file `web/src/styles/tokens.css` may get **new** tokens added; do not change existing ones.

## Palette for the landing
- **Background:** pure black `#000`.
- **Navy glow:** `radial-gradient(ellipse at 50% -20%, #0b1f6b 0%, #050b26 35%, #000 70%)`. Use it in the hero's line-art stage and in the CTA, and nowhere else.
- **Lines:** white at 85% for the main strokes, 35% for the secondary.
- **Accent:** royal blue `--royal: #2442ff` (add the token). It is used for the CTA button fill, the halftone dots, the label dots, the blueprint lines and the active state.
- **Text:** white `#ffffff` for headlines and `#9aa3b8` for body.
- **The packet:** the `--somaiya` red dot is the only red, and it is small.

## Sections, in order (`web/src/pages/Landing.tsx`)

### 1. Hero: `web/src/landing/hero/CinematicHero.tsx`
- One R3F `<Canvas>` stays fixed during a pinned ScrollTrigger of about 400vh with `scrub: 1`. A single `progress` ref (0→1) drives everything in `useFrame`, and no React state is updated per frame.
- **Stage A (p 0–0.25):**
  - The Earth is a sphere with `earth_day.jpg`, `earth_night.jpg` (emissive on the night side), `earth_specular.jpg` and `earth_clouds.jpg`, plus a fresnel atmosphere shader in light blue, set on a starfield of points.
  - Around it sit **two orbital planes** (inclination 97.5°, RAAN 75°/105°), each drawn as about 600 glowing points along its ring (additive blending, size about 2 px). On top of those are **8 brighter satellites** moving along the rings, plus a few thousand faint random "contact" dots in a shell, which gives the dense-constellation look.
  - The Earth rotates slowly.
- **Stage B (p 0.25–0.45), the dive:** the camera flies toward the Earth while about 800 **streak lines** (stretched line segments in blue/white/red-ish, as in the reference warp) rush past.
- **Stage C (p 0.45–0.65):**
  - The camera settles beside a **3D SomaiyaSat PocketQube** (a procedural model) above the Earth's limb, which now fills the bottom of the frame.
  - The model is an elongated box with the true proportions 127.4 × 57.9 × 57.2 mm, with **solar-cell faces** (dark blue panels with a thin cell grid via a canvas texture), PCB-green edge stripes, and a thin whip antenna.
  - It rotates slowly.
- **Stage D (p 0.65–1.0), the morph:**
  - The textured Earth fades out and the background crossfades to the navy glow.
  - The PocketQube turns into **white edges only** (`EdgesGeometry`, line material), shrinks, and is **duplicated into 3 line-art PocketQubes** (positioned like the reference: centre-high, left, right).
  - **Dashed beams** from each cube go down to a **white wireframe horizon**: 4–5 concentric arcs plus 3 meridian curves across the lower third.
  - Add a **dashed ISL link** between the cubes, and the **red packet dot** travels cube → cube → down a beam to a station tick labelled "KJSIT Mumbai" on the horizon.
- **Headline:** bottom-left over every stage, white, light weight (Geist 300), `clamp(56px, 7vw, 110px)`, two lines: **"Satellites that / route themselves."** The sub-line underneath (17 px, grey): "SomaiyaNet is a PocketQube constellation whose routing, AI decisions and permissions all live in PostgreSQL. Built around use case KJS-SRS-01."
- **Reduced motion:** show Stage D statically.
- **Mobile:** keep it, but cap the DPR at 1.5 and halve the point counts.
- **Performance:** use one canvas and instanced points. Load the textures with a small loader and show a black screen with a thin progress line until they are ready.

### 2. Mission: `Mission.tsx`
Centered, with the label `● MISSION`. One sentence, 32–40 px, light weight: "Give a tiny satellite the judgement to send what matters first — and prove every decision in a database." Below it, a **small rotating 3D Earth** (a second tiny canvas, or a reused component) with one thin orbit ring and a moving dot. Then 2 lines of grey body text about SomaiyaSat, the SomaiyaPod deployer, ReOrbit Finland, and the HAM community.

### 3. Constraints: `Constraints.tsx`
Use the reference's numbered hairline rows. The label `● WHY IT IS HARD` sits on the right, with a left headline "Minutes of contact. Milliwatts of power. Zero room for error." Then 3 rows, each with a blue mono `[01]` number, a title, and a description in the right column:
- Minutes-long passes
- A sub-1 W budget
- Housekeeping is never dropped

### 4. Life of a packet: `PacketStepper.tsx`
**This is the bordered-box stepper.** The label is `● LIFE OF A PACKET`. Five square bordered boxes (1 px white/20%, about 190 px) sit in a row, each with an **animated white line-art drawing** (SVG + GSAP):
1. **Captured:** scanlines drawing an Earth-limb image (SSTV)
2. **Decided:** a small tree whose path lights up in royal blue
3. **Relayed:** 3 cubes with a dashed hop and the red dot moving
4. **Delivered:** a dish with a beam from a horizon arc
5. **Recorded:** 3 table rows sliding in

Pin it. As you scroll, one box at a time becomes active: the others dim to 30%, the active box scales up slightly and moves left, and its text appears beside it (title plus 2–3 sentences, plus one mono line of the real SQL involved, e.g. `INSERT INTO packet … RETURNING packet_id`, `SELECT * FROM ai_decide(…)`, `WITH RECURSIVE hops … CYCLE`, `DELIVERED → route_hop`, `audit_log ← trigger`). A mono caption sits under each box: CAPTURED, DECIDED, RELAYED, DELIVERED, RECORDED.

### 5. Spacecraft: `Spacecraft.tsx`
The blueprint block, with the label `● SOMAIYASAT`.
- **Left:** a royal-blue outline technical drawing (SVG) of the PocketQube in front and side view, with dimension lines (127.4, 57.9, 57.2, PCB 1.6, solar cell 42.25 × 22.95). Overlap it slightly with a small R3F render of the same model (reuse the hero model component).
- **Right:** a mono spec list, right-aligned, label/value pairs:

  | label | value |
  |---|---|
  | ENVELOPE | 127.4 × 57.9 × 57.2 MM |
  | DEPLOYER | SOMAIYAPOD |
  | ORBIT | ~525 KM SSO |
  | PAYLOADS | M17 · CODEC2 · SSTV · TT&C |
  | ISL RANGE | ≤ 2000 KM |
  | ROUTER | DECISION TREE, 93 NODES, IN POSTGRESQL |

### 6. Ground network: `GroundNetwork.tsx`
- A headline at left, "Six stations. One of them is our college.", with the label `● GROUND NETWORK` at right.
- A **dark world map rendered as a dot grid** sampled from `/assets/textures/land_mask.png` (gray `#1a1a1a` dots), with **royal-blue halftone clusters** (concentric dots of decreasing size) over GS-BOM Mumbai, GS-HEL Espoo, GS-BLR, GS-TYO, GS-SVB and GS-CPT, sized by their downlink counts. Fetch these from `/api/stats` if available; fall back to the counts BOM 29, HEL 59, BLR 33, TYO 36, SVB 141, CPT 34.
- Below, a short paragraph and 3 live counters in plain large light numbers: telemetry rows, contacts in the next 24 h, AI decisions.

### 7. Database: `DatabaseRows.tsx`
The label `● THE DATABASE IS MISSION CONTROL`. Show the 9 DBMS experiments as **numbered hairline rows**, reusing the Constraints row style: `[01] EER generalization`, then the right column with a one-line description, linking to `/labs/<slug>` (the slugs are eer, mapping, ddl, dml, aggregates, routing, security, indexing, transactions).

### 8. Roles: `RoleEllipses.tsx`
The label `● WHO MAY SEE IT`. The 5 roles are shown as **tall tilted ellipse outline cards** in a row (Mission Director, Mumbai Station, Espoo Station, Student Analyst, AI Router), with the name centered.
- Hovering one fills the ellipse with a **royal-blue hatch pattern**, or a line-art avatar for that role, and shows its one-line rule underneath.
- Clicking one goes to `/console`.

### 9. CTA: `CtaBanner.tsx`
A wide banner inset with 1 px borders. The background is `earth_day.jpg` heavily blurred (CSS `filter: blur(18px)`, cropped to a horizon band) with a navy overlay. A centered headline, "Watch Postgres fly a satellite.", and a **solid royal-blue button** reading "Take the console ↗".

### 10. Footer: `Footer.tsx`
- **Left:** the logo, "DBMS mini project · K J Somaiya", the faculty owners (Dr. Umesh Shinde, KJSIT; Dr. Shailesh Nikam, KJSSE) and the collaborator ReOrbit, Finland.
- **Right:** the team, Aryan and Teammate.
- **Bottom:** an Earth horizon (the textured sphere's limb in a small canvas, or a static crop of `earth_day.jpg` with an atmosphere gradient) with a tiny PocketQube silhouette, and the credits "NASA Blue Marble imagery".

## Header: `SiteHeader.tsx`
- A fixed bar, 64 px high, with a translucent black background and backdrop blur that appears after the first scroll.
- **Left:** the logo, a red packet dot followed by "SomaiyaNet" in light weight.
- **Right:** a **1 px-bordered** button "Take the console ↗" in mono uppercase, 12 px.
- No nav links.

## Typography
Geist Sans: weight 300 for headlines and 400 for body. Geist Mono, uppercase at 11–12 px with letter-spacing 0.08em, for labels, captions, specs and the `[01]` numbers. **On the landing, mono uppercase labels are intentional** (they match the reference). **Do not use brackets around section labels** (use `● LABEL`); the brackets are only allowed for the row numbers `[01]`.

## Remove
Remove all the old chapter components (`landing/chapters/*`, `ChapterShell`, the `usePinnedScrub` you no longer use, the `OrbitScene` remnants) that the new sections don't use. Keep `PacketTag` only if you use it; otherwise delete it.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
grep -rn "Ground Control\|Satellites Without Borders\|Exosat" src ; echo "copy-grep-exit=$?"
```
- The grep must exit 1.
- List your files.
- Describe how each hero stage maps to scroll progress.
- Do not leave a dev server running.
- The orchestrator will review it in the browser against the reference frames.
