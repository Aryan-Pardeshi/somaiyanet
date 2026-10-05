# Brief 27b: Ops command center

First read `docs/briefs/27-common.md` and the files it lists.

Files you may edit (only these):
- `web/src/pages/Ops.tsx`
- `web/src/features/ops/OpsGlobe.tsx`
- `web/src/features/ops/cc/TopBar.tsx`, `BottomDock.tsx`, `LeftRail.tsx`, `RightRail.tsx`,
  `Glass.tsx`, `HelpHint.tsx`, `SatIcon.tsx`, `LiquidOverlay.tsx`

## Look
A SpaceX mission-control view: the globe full-bleed on black, calm translucent panels floating over
it (Apple materials), white type, almost no colour.
- Panels (`Glass`): keep the existing glass behaviour, including the `LiquidOverlay` WebGL glass if it
  is in use, but remove coloured tints, coloured rims and glows (`data-tone` warn/critical must no
  longer tint the whole panel; instead show a `.sx-status` dot + words inside). Look = `.sx-material`
  (dark translucent, blur 24px, 1px 8% white hairline, radius 16px). Fewer lines, more spacing.
- Panel titles `.sx-eyebrow`; key values `.sx-num` white 20-28px; labels `.sx-caption`. Remove mono
  from labels. Lists inside panels: rows with hairlines, no nested bordered cards.
- TopBar: logo/role left, UTC clock `.sx-num`, a quiet profile switch; no glowing pills.
- BottomDock / actions: ghost pill buttons `.sx-btn--sm`; the single main action (e.g. "Acknowledge"
  or "Run pass") may be `.sx-btn--filled`. Keep `Locked` wrappers as they are.
- Alerts: a `.sx-status` dot (critical red / warning orange) + plain words + time; no red panels.
- Satellite list items: name in DIN caps 13px, state as `.sx-status`, battery volts `.sx-num`.
  Selected item `--sx-surface-2` background, no blue bar.

## OpsGlobe
- Satellite markers: minimal solid white dots (no halos, no glow sprites, no rings), the selected
  satellite `--sx-blue` `#0a84ff`. Labels in DIN caps 11px white 80% (keep the short `SS-1` labels).
- Orbits: 1px white at 25%; ground tracks/trails white at 15-35%. Ground stations: small white
  squares, KJSIT Mumbai `#ff453a`. Contact/link lines: white at 60%; the active route `#ff453a`.
- Globe: keep the Earth texture but no blue atmosphere glow (or a very faint neutral one); keep the
  camera behaviour (station operators start on their station).
- Keep `VIS_ALT`, data flow, SSE updates and all interactions.

## SatIcon
A minimal white line drawing (1.5 stroke) with no coloured fills or glow.
