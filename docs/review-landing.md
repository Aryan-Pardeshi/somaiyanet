# Landing Page UI Review & Fix List

Following `docs/briefs/18-ui-review.md`, this review was conducted strictly on the landing page files (`web/src/landing/**` and `web/src/pages/Landing.tsx`). No application, backend, database, or test files were modified.

## Overview of Improvements

The landing page was audited across all 5 review categories (Layout, Responsive, Consistency, Accessibility, Runtime). Special focus was given to the five unpolished sections (`Constraints`, `DatabaseRows`, `RoleEllipses`, `CtaBanner`, and `Footer`), bringing them into complete harmony with the exosat-inspired design language:
- **Pure Black**: Background is `#000` with subtle hairline `border-white/10` dividers.
- **White Line Art**: Replaced blurry bitmap textures and neon glow box-shadows in `CtaBanner` and `Footer` with crisp SVG wireframe horizons, orbital trajectories, and PocketQube silhouettes.
- **Light Geist Headlines**: Ensured all sections have `font-light` Geist Sans headings with fluid `clamp()` sizing and tight tracking (`letterSpacing: -0.02em`).
- **Plain English**: Replaced jargon, acronyms, and raw column/table names with clear, professional engineering descriptions.
- **Color Fidelity**: Standardized the royal blue accent to `#3d5bff` (replacing low-contrast `#2442ff`) and reserved red `#ff3b4f` exclusively for the travelling packet dot.

---

## Fix List (file:line)

- `web/src/landing/Constraints.tsx:10-29`: Rewrote acronym-heavy descriptions into plain English and added bespoke SVG white line-art icons for contact windows, power budgets, and trigger auditing.
- `web/src/landing/Constraints.tsx:68-78`: Replaced hardcoded 40px headline with responsive fluid Geist Sans light clamp (`clamp(30px, 3.4vw, 46px)`) and updated section label to `CONSTRAINTS`.
- `web/src/landing/Constraints.tsx:85`: Replaced dark `var(--royal)` (`#2442ff`, failing contrast on black) with vibrant royal blue `#3d5bff`.
- `web/src/landing/DatabaseRows.tsx:11-66`: Rewrote all 9 DBMS lab titles and descriptions into plain English while preserving exact route slugs.
- `web/src/landing/DatabaseRows.tsx:75-81`: Added missing light Geist Sans headline ("Nine database experiments. Built on live PostgreSQL.") and section label header.
- `web/src/landing/DatabaseRows.tsx:89-100`: Replaced `var(--royal)` with `#3d5bff`, added white line-art arrows with hover translation, and added accessible `:focus-visible` ring styles.
- `web/src/landing/RoleEllipses.tsx:39`: Removed critical bug where an un-scoped `<style>` tag targeting `button:hover > span` was injected 5 times per render, breaking button hover styles throughout the entire application.
- `web/src/landing/RoleEllipses.tsx:53-63`: Added missing light Geist Sans headline ("Five operational roles. Enforced in the engine.") and plain English clearance explanation.
- `web/src/landing/RoleEllipses.tsx:11-42`: Rewrote role descriptions into plain English detailing exact operational clearances.
- `web/src/landing/RoleEllipses.tsx:65-119`: Replaced rigid ovals with responsive grid, scoped diagonal royal hatch gradient on hover, white line-art orbital crosshairs, and accessible `:focus-visible` button styles.
- `web/src/landing/CtaBanner.tsx:11-48`: Removed blurry bitmap `earth_day.jpg` texture and navy overlay; replaced with pure black background and technical white line art SVG featuring wireframe Earth horizon, orbital trajectories, and packet dot.
- `web/src/landing/CtaBanner.tsx:59-75`: Replaced fixed headline with fluid light Geist headline, plain English subtext, and consistent bordered console button matching `SiteHeader`.
- `web/src/landing/Footer.tsx:11-101`: Replaced placeholder text with academic credentials (KJSIT, KJSSE, ReOrbit, Dr. Umesh Shinde, Dr. Shailesh Nikam) and structured navigation links.
- `web/src/landing/Footer.tsx:116-167`: Removed bitmap texture with cyan glowing box-shadow; implemented pure black with technical white line-art Earth limb and PocketQube silhouette.
- `web/src/landing/SiteHeader.tsx:5-18`: Replaced direct `document.getElementById` DOM mutation with idiomatic React state and added WebKit backdrop blur support (`[-webkit-backdrop-filter:blur(12px)]`).
- `web/src/landing/SiteHeader.tsx:39-44`: Added `:focus-visible` keyboard accessibility styles to console button and logo link.
- `web/src/landing/GroundNetwork.tsx:98-118`: Fixed Tokyo ground station callout label extending 88.8% + 34px + text width without bounds, which caused horizontal page scrollbar at 375px; anchored east stations to the left and added `overflow-hidden`.
- `web/src/landing/GroundNetwork.tsx:121-125`: Polished stat metric labels into plain English ("Telemetry rows recorded", "Scheduled contact passes (24 h)", "Autonomous routing decisions").
- `web/src/landing/PacketStepper.tsx:592-604`: Disabled GSAP ScrollTrigger pinning when `prefers-reduced-motion: reduce` is active.
- `web/src/landing/PacketStepper.tsx:618-633`: Added `min-w-0` to grid columns and text block to prevent SQL `<pre>` code overflow on narrow screens.
- `web/src/landing/PacketStepper.tsx:637-652`: Converted static thumbnail divs into accessible `<button>` controls with `aria-label` and `aria-current`.
- `web/src/landing/Spacecraft.tsx:24`: Added `flex-wrap gap-6` to prevent headline and SectionLabel collision at 375px width.
- `web/src/landing/Spacecraft.tsx:8-15`: Rewrote mission specs into plain English.
- `web/src/landing/Spacecraft.tsx:47,85`: Added `aria-label` to canvas and reduced-motion check in 3D frame loop.
- `web/src/landing/Mission.tsx:10`: Added missing `border-t border-white/10` to match all other landing sections.
- `web/src/landing/Mission.tsx:13`: Converted `<p>` section headline to semantic `<h2>` with Geist Sans light styling.
- `web/src/landing/Mission.tsx:20-25`: Polished mission description into plain English.
- `web/src/landing/Mission.tsx:45`: Added reduced-motion check to MiniEarth Three.js rotation loop.
- `web/src/landing/hero/CinematicHero.tsx:509-514`: Cached DOM navy glow reference with `glowRef` to eliminate `document.getElementById` queries on every 60fps frame.
- `web/src/landing/hero/CinematicHero.tsx:584`: Added accessible `aria-label` to hero 3D simulation canvas.
- `web/src/landing/hero/CinematicHero.tsx:601`: Adjusted minimum fluid clamp to `clamp(40px, 7vw, 112px)` and added `break-words` to eliminate text clipping on <=360px screens.
- `web/src/landing/hero/Satellite.tsx:288`: Fixed code indentation around `LineColor.Provider`.
- `web/src/landing/SectionLabel.tsx:11`: Updated dot color to royal blue `#3d5bff` to ensure WCAG contrast on pure black.
- `web/src/pages/Landing.tsx:20`: Added `overflow-x-hidden` to outer container to guarantee zero horizontal scroll across all device viewports.

---

## Items Observed but Not Fixed (Out of Landing Scope)

As instructed, only `web/src/landing/**` and `web/src/pages/Landing.tsx` were modified. The following observations outside the landing page were noted for future review:
1. **App Shell & Panel Chamfers**: App pages (`/console`, `/ops`, `/routing`, `/brain`, `/deploy`, `/labs/*`) use `ChamferPanel` and command-center styling; they were not touched.
2. **Access Control**: `web/src/app/access.tsx` was not modified per explicit instructions.
3. **Database & API Routes**: Backend and test suites were preserved without change.
