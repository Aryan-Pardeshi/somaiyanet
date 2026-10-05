# Brief 23: short footer on a navy nebula with stars and cool motion

File you may edit: `web/src/landing/Footer.tsx`; you may APPEND keyframes / classes at the very end of
`web/src/index.css` (do not change existing rules). Do not edit anything else (another worker is
editing /ops files). Logo: `import { Brand } from "@/components/story/Brand";` use `<Brand className="text-[22px]" />`.

The user wants the footer **short** (about 320-380px tall on desktop, not a tall page) with a
**navy-blue cloud / nebula background, stars, and cool animations**.

## Content (keep it, but compact)
- Row 1: `<Brand />` on the left with one line under it: "Four PocketQubes, one database, every
  decision on the record." On the right, two short link columns (titles "Mission", "Database labs"):
  Mission: Take the console (/console), Command center (/ops), Route finder (/routing),
  AI router (/brain), Deploy (/deploy). Labs: Transactions (/labs/transactions),
  Security (/labs/security), Indexing (/labs/indexing), Normalization (/labs/normalization),
  Schema (/labs/schema), SQL console (/labs/sql). Use react-router `Link`.
- Row 2 (one thin line, small text): "Dept. of Computer Engineering, K. J. Somaiya Institute of
  Technology · with ReOrbit, Finland · Guided by Dr. Umesh Shinde (KJSIT) and Dr. Shailesh Nikam
  (KJSSE) · Use case KJS-SRS-01" and on the right a live UTC clock in Geist Mono ("UTC 14:05:22").
- Row 3 (tiny, muted): "Ideas for the globe and landing adapted from lakshyamody/dbmsproj" linking to
  https://github.com/lakshyamody/dbmsproj, and "© 2026 SomaiyaNet".
No "//", no "SYS", no "exosat", no jargon.

## Look and motion
- Background: deep navy nebula on black. Layer 2-3 large, very blurred radial gradients
  (e.g. #0b1a4a, #10246b, #1b1050 at 35-60% opacity, `filter: blur(60px)`) that drift slowly
  (CSS keyframes translate/scale, 30-45 s alternate). A faint top fade from pure black (the page
  above is black) so the footer emerges smoothly: `linear-gradient(to bottom, #000, transparent 30%)`.
- Stars: a `<canvas>` (absolute, inset 0) with ~180 stars (~90 on phones) of varying size/opacity
  that twinkle (per-star sine opacity) and drift very slowly to the left (parallax, 2 depth layers).
  Every 6-10 s one shooting star streaks diagonally (short white gradient line, 600 ms).
  Use requestAnimationFrame; pause when the footer is off-screen (IntersectionObserver) and when the
  tab is hidden; size by devicePixelRatio (cap 2); clean up on unmount.
- One satellite pass: a small white line-art PocketQube (square + two solar wings) crosses the
  footer slowly along a gentle arc every ~20 s with the red packet dot (#ff3b4f) blinking on it.
- Links: hover = white + a royal blue (#3d5bff) underline that grows from the left.
- Content sits above the effects (z-index), readable (text #dfe6f5 / muted #8b96b0).
- Respect `prefers-reduced-motion`: static nebula, static stars, no shooting stars or satellite.
- Phones (375px): stack columns, footer may grow, no horizontal overflow.

Strict TypeScript, no `any`, no unused locals. You cannot run shell commands: only read and edit
files. Do not run git or servers.
