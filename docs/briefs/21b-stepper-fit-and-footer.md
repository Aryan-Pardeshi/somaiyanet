# Brief 21b: fix the "Life of a packet" layout + an animated footer

Files you may edit: `web/src/landing/PacketStepper.tsx`, `web/src/landing/Footer.tsx`, and you may
APPEND keyframes/utility classes at the end of `web/src/index.css` (do not change existing rules).
Another worker is editing `web/src/components/story/Brand.tsx` and `web/src/landing/SiteHeader.tsx`:
do not touch those. Use the logo via `import { Brand } from "@/components/story/Brand";`
(`<Brand className="..." />`, existing API).

Context: landing page is pure black, exosat-like: thin white line art, royal blue `#3d5bff`,
red `#ff3b4f` only for the travelling packet dot, Geist Sans light headlines, Geist Mono small labels.

## 1. PacketStepper layout bug (user screenshot, laptop ~1366x768 with browser chrome)
The section is pinned for 300% scroll (GSAP ScrollTrigger, `pin: true`) and must fit in ONE
viewport, but today:
- the right text column + SQL `<pre>` run past the right edge of the screen (text cut off);
- the 5-thumbnail strip at the bottom is cut off below the viewport;
- the art box is too big for short screens.
Fix: the pinned stage is `h-screen` with a flex column layout that always fits: header row,
main row (art box + text), thumbnail row. Size the art box by height:
`width: min(420px, 44vh)` (square); thumbnails `min(96px, 10vh)`; text column `min-w-0` with
`max-w-[520px]` and the `<pre>` `whitespace-pre-wrap break-words` so nothing overflows; container
`max-w-[1180px] mx-auto px-6` with `overflow: hidden` on the stage only. Verify mentally at
1280x620, 1366x768 and 1920x1080 viewports: nothing clipped, no horizontal overflow.
Keep the art, STEPS text, ScrollTrigger logic, thumbnails as buttons, reduced-motion behaviour.

## 2. Footer redesign, animated
Current footer has: brand + description, institution block, two link lists, faculty line, spec
line, and a static line-art horizon with the text "EXOSAT GEOMETRY // 525 KM SUN-SYNCHRONOUS"
(REMOVE that text entirely: exosat is another company's name; no "//" jargon anywhere).
Keep the real content: description, "Department of Computer Engineering, K. J. Somaiya Institute of
Technology & K. J. Somaiya College of Engineering, in collaboration with ReOrbit, Helsinki,
Finland", faculty "Dr. Umesh Shinde (KJSIT) · Dr. Shailesh Nikam (KJSSE)", spec KJS-SRS-01, and
the link lists (they must link to real routes: /console, /ops, /routing, /brain, /deploy,
/labs/schema, /labs/normalization, /labs/sql, /labs/security, /labs/indexing, /labs/transactions).
Add a line "Credits: globe and landing ideas adapted from lakshyamody/dbmsproj" linking to
https://github.com/lakshyamody/dbmsproj.

Make it alive, but calm (one orchestrated idea, not scattered effects):
- A full-width bottom band (~180px tall) drawn as SVG: the Earth limb arc, our orbit arc above it,
  and THREE small line-art satellites moving slowly along the orbit (CSS/SVG animation, ~40 s per
  pass, staggered); every few seconds the red packet dot hops sat -> sat -> down to a small dish
  marked "KJSIT Mumbai" on the limb (dashed beam draws in, then fades). Ticks along the limb.
- A huge, very faint "SomaiyaNet" wordmark (Geist Sans light, ~16vw, white at 4% opacity) behind
  the band, clipped at the bottom edge, that slides up slightly when the footer scrolls into view
  (IntersectionObserver, once).
- Link lists: hover = text white + a short blue line that grows from the left (underline animation).
- A live UTC clock in Geist Mono in the bottom bar ("UTC 14:05:22"), updating every second.
- Use `<Brand />` at the top-left of the footer.
- Respect `prefers-reduced-motion`: no movement, static satellites, no wordmark slide.
- Clean up intervals/observers on unmount. Phones (375px): stacked columns, band height 120px,
  no horizontal overflow.

Strict TypeScript, no `any`, no unused locals. No new npm packages. Do not run git, do not start
servers. You may type-check with: `npx --prefix web tsc -p web/tsconfig.app.json --noEmit`
(errors in Brand.tsx / SiteHeader.tsx belong to the other worker; ignore them).
