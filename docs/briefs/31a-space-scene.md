# Brief 31a: SpaceScene, the fixed 3D backdrop

Read `31-common.md` first, then `web/src/landing/space/scroll.ts`,
`web/src/landing/earth/Earth.tsx` and `web/src/landing/earth/geo.ts`.

## Files you create (only these)
- `web/src/landing/space/SpaceScene.tsx`: exports `SpaceScene`.
- `web/src/landing/space/PocketQube.tsx`: exports `PocketQube`, the satellite model.
- `web/src/landing/space/effects.tsx`: exports `Starfield`, `OrbitArc`, `OrbitShells`,
  `DownlinkBeam`, `FleetOrbits` (described below).
- `web/src/landing/space/keyframes.ts`: the keyframe tables and the interpolation helpers.

Reuse `Earth`, `Atmosphere`, `useEarthMaps`, `EARTH_R`, `SUN_DIR` from `earth/Earth.tsx` and
`latLngToVector3`, `getSatVector3`, `getStationVector3` from `earth/geo.ts` as they are. Do not
edit those files.

## Public API
```ts
import type { PublicNetwork } from "@/landing/publicApi";
export function SpaceScene(props: { network: PublicNetwork | null }): JSX.Element;
```
It renders `<div aria-hidden className="pointer-events-none fixed inset-0 z-0">` with an R3F
`<Canvas>` inside: `dpr={[1, 1.75]}`, antialias, black clear colour, a perspective camera at
`(0, 0, 10)`, fov 35, looking at the origin. The page puts it behind its content; you do not
render any DOM text.

## Placing things on screen
Keyframes are given in screen space so they line up with the text in brief 31b. Convert with the
camera: at depth z = 0 the visible height is `H = 2 * 10 * tan(fov / 2)` and the width is
`H * aspect`. A screen point `(sx, sy)` is `x = (sx - 0.5) * H * aspect`, `y = (0.5 - sy) * H`.
An Earth "diameter d" is a fraction of the viewport height, so the Earth group's scale is
`d * H / (2 * EARTH_R)`. Satellite size is in CSS pixels: scale the model so its longest span is
that many pixels at its depth. Recompute when the canvas resizes.

Every frame: `p = scenePosition()`, `i = floor(p)`, `f = p - i`, and use
`t = smoothstep(0.18, 0.82, f)` to blend keyframe `i` into `i + 1`, so each section holds its
pose while it fills the screen and moves during the hand-off. Then damp the rendered values toward
those targets (`THREE.MathUtils.damp`, lambda about 5) so motion feels weighty. Use
`isWideViewport()` to choose the wide or narrow table (re-check on resize).

### Wide keyframes
| | `network` | `satellites` | `downlink` | `database` |
| --- | --- | --- | --- | --- |
| Earth centre | (0.50, 1.30) | (0.26, 0.56) | (0.80, 1.02) | (0.50, 0.40) |
| Earth diameter | 1.50 | 0.84 | 1.25 | 0.50 |
| Satellite | on the arc, near (0.69, 0.58), 120 px | (0.43, 0.20), 230 px | (0.60, 0.14), 130 px | shrinks to 0 px into its fleet dot |
| Orbit arc | drawn, bright | fades to 0 | 0 | 0 |
| Orbit shells | 0 | visible | faint | 0 |
| Downlink beam | 0 | 0 | on | 0 |
| Fleet orbits | 0 | 0 | 0 | on |

### Narrow keyframes
| | `network` | `satellites` | `downlink` | `database` |
| --- | --- | --- | --- | --- |
| Earth centre | (0.50, 1.12) | (0.50, 0.30) | (0.66, 0.36) | (0.50, 0.30) |
| Earth diameter | 0.78 | 0.40 | 0.48 | 0.38 |
| Satellite | on the arc, near (0.74, 0.70), 72 px | (0.80, 0.10), 100 px | (0.24, 0.10), 76 px | shrinks to 0 |

Effects follow the same on/off pattern as the wide table.

## The pieces
**Earth.** `Earth` + `Atmosphere` in one group, tilted about 0.32 rad on z. Slow spin
(0.025 rad/s) plus a per-keyframe yaw offset; in `downlink` the yaw is chosen so the primary
station (`primary: true` in `network.stations`, KJSIT Mumbai) faces the camera, where the beam
lands. Add a soft outer halo: two camera-facing, very faint white discs/rings behind the Earth at
1.25 and 1.6 times its radius (like the translucent circles in the reference), opacity about 0.04.

**Starfield.** About 2,400 points on a large sphere (radius 60), two layers, white, size
attenuation, sizes 0.6 to 1.8 px. Each layer moves vertically with `scenePosition()` at a
different rate (parallax, the near layer about twice as fast), and stars twinkle gently
(per-star phase in a small shader). A subtle pointer parallax on desktop: the camera shifts up to
0.12 units toward the pointer, damped.

**PocketQube.** Our satellites are PocketQubes, not big cylinders, so the model is ours: a 3P
PocketQube is a tall box (5 x 5 x 17.8 units ratio) with a bright aluminium frame (four corner
rails, slightly proud of the faces), side faces covered in solar cells (dark blue-black cells in a
grid with thin silver gaps, drawn into a `CanvasTexture`), a gold Kapton band near one end, two
deployed solar wings hinged at the top edge (same cell texture, thin white frame), and two thin
tape antennas (long thin boxes) sticking out of the bottom. Use `MeshStandardMaterial`
(metalness/roughness so the frame and cells catch the sun) and a `RoomEnvironment` through
`PMREMGenerator` as `scene.environment` for reflections (no network fetch). One directional light
along `SUN_DIR`, a low ambient. It slowly tumbles (yaw about 0.15 rad/s) and per keyframe has a
preset orientation so it reads three-quarter on.

**OrbitArc** (`network`). A glowing red arc that the satellite rides: the visible part of a
circular orbit around the Earth at radius 1.12 x EARTH_R, tilted so it rises from behind the right
limb, passes in front of the Earth near the satellite and runs off. Draw it as a tube (or Line2)
with a bright core and a wider, additive, low-opacity outer layer for the glow; brightness fades
toward the tail so it reads like a trail behind the satellite. On load it draws itself in once
(about 1.8 s, ease-out), with the Earth rising 6% of the viewport into place at the same time.
That is the one intro moment. The satellite sits at the head of the arc and moves along it a
little as you scroll before the hand-off.

**OrbitShells** (`satellites`). Three thin concentric white rings around the Earth (screen
facing, 1.18, 1.38, 1.62 times its radius, opacity 0.12 / 0.08 / 0.05), plus a few tiny dots
drifting slowly along them. They scale in from 0.92 as they fade in.

**DownlinkBeam** (`downlink`). A vertical-ish red beam from the satellite down to the primary
station on the Earth's surface: a thin bright core plus an additive glow, with short brighter
pulses travelling down it (packets) and a small ring that ripples outward at the station on the
surface (repeating every 1.6 s). When the beam is off it retracts upward.

**FleetOrbits** (`database`). The four real satellites from `network.satellites` propagated
with `satellite.js` at the current time (`getSatVector3`, update positions every frame from
`Date.now()`), each a small white dot (about 4 px) with its orbit drawn as a thin white line
(sample one orbital period ahead, opacity 0.18). Ground stations from `network.stations` as tiny
white dots on the surface. When `network` is null, show nothing for this layer. The big
PocketQube shrinks to nothing at the position of the `SS-1` dot so it reads as "one of these".

## Quality bar
- Smooth 60 fps on a laptop: reuse geometries and materials, no allocations inside `useFrame`
  (keep scratch `Vector3`s in refs), no React state updates per frame.
- Every material disposes on unmount (R3F does this for JSX-created ones; dispose
  `CanvasTexture`s and PMREM targets yourself).
- Reduced motion: no intro, no spin, no tumble, no twinkle, no pulses or ripples; scroll still
  moves between keyframes with no damping lag.
- Do not use drei `Html` (it crashed here before). No text in the scene.
- Make it genuinely beautiful: this is the whole page's personality.
