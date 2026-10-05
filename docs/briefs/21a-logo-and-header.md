# Brief 21a: a real SomaiyaNet logo + header that appears after the hero

Files you may edit: `web/src/components/story/Brand.tsx`, `web/src/landing/SiteHeader.tsx`.
Do not edit any other file (another worker is editing the footer and the packet stepper; the
footer imports `Brand` from `@/components/story/Brand`, so keep that export and its
`className?: string` prop working; you may add optional props).

Context: landing page is pure black, exosat-like: thin white line art, royal blue `#3d5bff`,
red `#ff3b4f` is reserved for the travelling packet dot. Fonts: Geist Sans (light) + Geist Mono.

## 1. Logo (`Brand.tsx`)
Today the logo is a plain red dot + the word "SomaiyaNet". The user calls it boring. Design a
distinctive mark, drawn as inline SVG, ~22px tall next to the wordmark:
- Concept: a small Earth limb (arc) with one tilted orbit ellipse crossing it; a tiny line-art
  PocketQube (square with two short solar wings) rides the orbit, and the red packet dot sits just
  ahead of it. Thin white strokes (1.25px at 22px), the orbit in royal blue, packet dot red.
- Motion: the satellite + packet dot travel slowly along the orbit (SVG `animateMotion` along the
  ellipse path, ~12 s per lap) only on hover / focus of the link (or always, but subtle) and never
  when `prefers-reduced-motion` is set (check `window.matchMedia` once; render static).
- Wordmark: "Somaiya" in Geist Sans light + "Net" in Geist Sans medium, tight tracking, white.
  Optional props: `size?: "sm" | "md" | "lg"` (default "md"), `markOnly?: boolean`.
- It must look good at 16px (sidebar) and 28px (footer). Keep `aria-label`/`sr-only` text.
- Make the mark also usable as the favicon idea: export `BrandMark` (the SVG alone) too.

## 2. Header (`SiteHeader.tsx`)
- Hidden while the hero (`#hero`, a tall sticky scroll section) is on screen. It slides down +
  fades in (transform translateY(-100%) -> 0, opacity 0 -> 1, 300 ms) once the hero's bottom edge
  has scrolled above the top of the viewport (use an IntersectionObserver on `#hero` or compare
  `hero.getBoundingClientRect().bottom <= 64`), and hides again when scrolling back into the hero.
- When visible: black/80 background with backdrop blur and a 1px bottom border white/10.
- Use `<Brand />` (new logo) on the left instead of the inline red dot + text.
- Keep the "Take the console" button, focus styles, and `aria-hidden` / `inert` when hidden so
  keyboard users do not tab into an invisible header.
- Respect reduced motion (no slide, just show/hide).

Strict TypeScript, no `any`, no unused locals. You cannot run shell commands: only read and edit
files. Do not run git or servers.
