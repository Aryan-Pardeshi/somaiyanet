# Brief 14a: make the ground-station world map clearly visible

File to edit: `web/src/landing/GroundNetwork.tsx` only. Touch no other file.

## Problem
On the pure black page (#000) the land dot grid is nearly invisible (`#2a2e38`, radius 1.5),
so the continents do not read. Station halftone blooms are fine. The secondary label text
(`#5f6f93`) is also too dim.

## Required changes
1. Render the canvas crisply: keep the logical size W=1600, but size the backing store by
   `Math.min(window.devicePixelRatio || 1, 2)` and `ctx.scale` it, so dots stay sharp.
2. Land dots must read clearly as continents on black, while staying quieter than the blue blooms:
   - colour around `#59627a` (or `rgba(190,200,225,0.42)`), radius about 2.0, grid STEP 8
   - add a soft latitude falloff: dots near the crop edges (top 8% / bottom 8%) fade to ~60% alpha
   - ocean stays empty (pure black)
3. Blooms: keep the halftone math, but use the same new STEP grid so blooms and land align.
   Keep blue `rgb(61,91,255)`; the bloom centre dot may go to radius ~4.8.
4. Labels: station name stays white / `#dfe6f5`; the `GS-XXX · N passes/day` line becomes `#8b96b0`.
   Leader line `bg-white/60`.
5. Do not change the section layout, heading, counters or STATIONS data.

## Rules
- Do NOT start dev servers or any long-running process. Do NOT run git commit.
- Verify with: `npm --prefix web run build` (must pass type-check and build).
