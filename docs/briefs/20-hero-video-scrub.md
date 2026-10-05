# Brief 20: landing hero = scroll-scrubbed video, then the line-art finale

File to edit: `web/src/landing/hero/CinematicHero.tsx` only. Assets already exist (do not create
or move them):
- `web/public/assets/hero/f_001.webp` .. `f_144.webp` (1280x720, desktop)
- `web/public/assets/hero/m_001.webp` .. `m_144.webp` (640x360, phones, use when `innerWidth < 768`)
URL: `${import.meta.env.BASE_URL}assets/hero/f_${String(i).padStart(3, "0")}.webp`.

The frames come from a 6 s clip: Earth turning (Africa), slowly zooming toward the night side,
city lights of India, and at the end a satellite flying over Mumbai (frame 144).

## What to build (Apple-style scroll-scrubbed image sequence)
Keep the section structure: `<section id="hero" style={{height: 420vh}}>` with an inner
`sticky top-0 h-screen overflow-hidden` stage, GSAP ScrollTrigger on the section providing
`progress` 0..1 (already in the file), the headline + paragraph overlay, reduced-motion handling.

1. New `FrameScrub` component: a full-bleed `<canvas>` (position absolute, inset 0) that draws one
   frame with object-fit **cover** math (centre crop to the canvas aspect), sized to the stage with
   `devicePixelRatio` (cap 2) and redrawn on resize.
   - Frame index = `Math.round(lerp(0, 143, smooth(0, 0.72, progress)))`.
   - Draw only when the index changes (requestAnimationFrame loop reading the progress ref, or a
     ScrollTrigger onUpdate callback). Never re-render React per frame.
   - Preload: load frame 1 first and draw it immediately; then load the rest in order with
     `new Image()` + `decode()`, keeping them in an array; if the wanted frame is not loaded yet,
     draw the nearest loaded frame below it.
   - Fade the video canvas out over progress 0.72 -> 0.82 (canvas style opacity).
2. Keep the existing **line-art finale** (`LineArtScene`: three line-art satellites, dashed beams,
   wireframe horizon, red packet route to the station) and the navy glow div; it fades in over
   0.74 -> 0.9 exactly as now. Its R3F `<Canvas>` stays, transparent, layered ABOVE the frame canvas.
3. Remove from the hero scene: the shader Earth + Atmosphere + OurPlanes + Warp + the PocketQube /
   Satellite close-up stage (stages A, B, C). BUT keep exporting `useEarthMaps`, `Earth`,
   `Atmosphere` (they are imported by `web/src/landing/Mission.tsx`). Remove now-unused code
   (Warp, OurPlanes, stars if unused) so there are no unused locals.
4. Readability: add a bottom-left dark gradient over the video
   (`linear-gradient(to top right, rgba(0,0,0,0.75), transparent 55%)`) behind the headline. The
   headline + paragraph fade out over progress 0.55 -> 0.7 (so the satellite over Mumbai is seen
   clean), then the line-art finale takes over.
5. Add one small caption that fades in with the last video frames (progress 0.6 -> 0.72) and out
   with the video: bottom-right-ish but NOT over the extreme bottom-right corner (a watermark sits
   there; leave it visible, do not cover or blur it). Text: "Over Mumbai, where KJSIT's ground
   station listens." in 13px #dfe6f5.
6. Reduced motion (`prefers-reduced-motion`): section height 100vh, draw only the last frame
   (f_144) statically with the headline; no scrubbing, no line-art animation.
7. Loader: the existing loader / failsafe logic should wait for frame 1 only (not all frames).

Strict TypeScript, no `any`, no unused locals or imports. No new npm packages.
You cannot run shell commands: only read and edit files. Do not run git or servers.
