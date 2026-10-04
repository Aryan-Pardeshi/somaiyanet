# Brief 18: full UI bug review + fixes

The site is a Vite + React 19 + Tailwind v4 app in `web/`. Two parts:
- Landing page `/` (files in `web/src/landing/**`, `web/src/pages/Landing.tsx`): exosat.com-like
  scroll story on pure black, white line art, royal blue `#3d5bff`, red `#ff3b4f` only for the
  packet dot. Geist Sans light headlines, Geist Mono small labels.
- App pages (`/console`, `/ops`, `/routing`, `/brain`, `/deploy`, `/labs/*`): command-center
  style with chamfered `Panel` (`web/src/components/cc/Panel.tsx`), role-aware via
  `web/src/app/access.tsx`.

You cannot open a browser. Review the code carefully and FIX real bugs you can prove from the
code. Look for:
1. Layout: content that overflows its container, text that can be clipped (fixed heights with
   variable text), horizontal page scroll at 375px width, elements hidden behind sticky/fixed bars,
   z-index fights, missing `min-w-0` on flex children with long text, tables without
   `overflow-x-auto` on mobile.
2. Responsive: every page must work at 375px, 768px, 1280px, 1440px. Grids that do not collapse,
   fixed px widths wider than the phone, absolute-positioned overlays that cover content on mobile.
3. Consistency: leftover old styling (rounded navy cards `rounded-xl`, `bg-[var(--navy-*)]`,
   gradients, emoji, mixed fonts) on pages that should use the new look; inconsistent button
   styles; jargon or invented labels ("SYS.", "//", fake versions). Use plain English.
4. Accessibility: buttons without accessible names, missing `alt`/`aria-label`, focus styles
   missing on custom buttons, colour-only status with no text, `prefers-reduced-motion` ignored
   by animations.
5. Runtime: effects without cleanup (intervals, listeners, rAF, observers), state updates after
   unmount, keys missing or index keys on reorderable lists, `useEffect` dependency bugs that
   cause loops, uncaught promise rejections in fetches.

For each fix keep behaviour, data flow and text meaning the same. Do NOT change
`web/src/app/access.tsx`, backend, db or tests. Strict TypeScript, no `any`, no unused locals,
no new packages. Do NOT run git, do NOT start servers.

At the end write a short list of what you fixed (file:line, one line each) and anything you saw
but did not fix, to the file named in your instructions.
