# Brief 11: UI overhaul, black + navy (user rejected the cream/red look)

The user's verdict on the current UI: "the colours and ui just looks bad — use black and navy blue and fix overall UI." This brief **replaces spec §9 entirely** and you implement it across all of `web/`. Behaviour, API calls and data flow must not change. This is a visual and layout pass only. Another worker is in `db/` and `backend/`, so don't touch those.

Read every page before you start:
- `src/pages/*`
- `src/app/*`
- `src/landing/**`
- `src/components/story/*`
- `src/features/**`
- `src/styles/tokens.css`
- `src/index.css`

## 1. Design tokens (rewrite `src/styles/tokens.css`; it is the only place colours live)
| token | hex | use |
|---|---|---|
| `--space` | `#02040a` | page background (true deep black) |
| `--navy-900` | `#060d1f` | sidebar, landing section bands |
| `--navy-800` | `#0a1630` | panels / cards |
| `--navy-700` | `#0f2147` | raised: hover, selected rows, inputs |
| `--navy-600` | `#16306a` | active nav item, pressed |
| `--line` | `#1b2d55` | 1px borders and dividers |
| `--line-strong` | `#28427a` | focused input borders |
| `--text` | `#e6ecf8` | primary text (cool white, **no cream anywhere**) |
| `--text-2` | `#93a3c4` | secondary text |
| `--text-3` | `#5f6f93` | tertiary, placeholders |
| `--ice` | `#7fb2ff` | the ONE accent: links, primary buttons, focus ring, the active route, ISL lines |
| `--ice-strong` | `#a9caff` | accent hover and highlights |
| `--ok` | `#3ecf8e` | success, downlink beams |
| `--warn` | `#f5b142` | warnings only |
| `--danger` | `#e5484d` | errors, CRITICAL, "PostgreSQL refused", AI override |
| `--somaiya` | `#d7263d` | **only** the brand dot in the logo and the travelling packet dot. Nothing else. |

- **Remove every cream / amber-as-text / red-as-decoration usage.** Data numbers use `--text` and labels use `--text-2`.
- The **background** is `--space` with one subtle radial navy glow at the top (`radial-gradient(1200px 600px at 50% -10%, #0f2147 0%, transparent 60%)`). **Delete the grid-paper pattern.**
- **Radii** follow hierarchy: 14 px for page panels, 10 px for cards inside panels, 8 px for inputs and buttons, 999 px for pills. No drop shadows except a single soft `0 10px 30px -12px #000a` on popovers and modals.
- **Spacing** uses a 4 px base, with the scale 4/8/12/16/24/32/48/72.

## 2. Type
- Install `@fontsource/geist-sans` and `@fontsource/geist-mono` (v5.3, weights 400/500/600/700). Remove Space Grotesk, IBM Plex Sans and IBM Plex Mono.
- **Geist Sans** is for everything: headings, body and data.
- **Geist Mono** is **only** for SQL code blocks, ids (`SAT-A3`, `PKT 412`), and the UTC clock. **Do not** use mono for labels.
- **Scale:** 12 / 13 / 14 (body in the app) / 16 (body on the landing) / 20 / 24 / 32 / 48 / 72 (landing hero only). Line-height is 1.5 for body and 1.1 for display. Display weight is 600 with a letter-spacing of `-0.02em`.
- **Labels** are sentence case at 12–13 px, weight 500, in `--text-2`. **No ALL-CAPS tracked-out eyebrows**, **no `[ SECTION ]` or `01 / LABEL`** in the app, no strings joined with ` · ` middle dots for meta, and no `→` appended to button labels.
- On the landing, numbered chapters are allowed because the story is a real sequence. Show them as a small "Chapter 3" line above the headline, in sentence case.

## 3. App shell (rewrite `src/app/AppShell.tsx`)
```
┌──────────┬──────────────────────────────────────────────┐
│ ● Somaiya│  Page title                     [UTC clock]  │
│   Net    │  one-line description                        │
│          ├──────────────────────────────────────────────┤
│ Mission  │                                              │
│  Ops     │              page content                    │
│  Routing │                                              │
│  AI router                                              │
│  Deploy  │                                              │
│ Database │                                              │
│  labs    │                                              │
│  Trans…  │                                              │
│  Security│                                              │
│  Indexing│                                              │
│  Normal… │                                              │
│  Schema  │                                              │
│  SQL     │                                              │
│ ──────── │                                              │
│ [avatar] │                                              │
│ Director │                                              │
│ switch ▾ │                                              │
└──────────┴──────────────────────────────────────────────┘
```
- **Left sidebar.** It is 232 px wide on `--navy-900`, collapses to a 64 px icon rail at under 1200 px wide, and becomes a top bar plus sheet under 768 px.
  - Two nav groups headed "Mission" and "Database labs", using lucide icons.
  - The active item has a `--navy-600` background and a 2 px `--ice` left bar.
  - The profile switcher sits at the bottom of the sidebar: the avatar, the role title, the DB role in mono 12 px, and a popover for switching.
- **Page header.** Each page has a title (24 px / 600) plus a one-line description in `--text-2`. Exp/CO chips are small navy pills with ice text, placed on the right.
- **Content area.** Max width 1440 px with 24 px padding. Panels are `--navy-800` with a 1 px `--line` border and a 14 px radius. Panel headers are 14 px / 600 text with an optional right-side action. There is no `--navy-800` card nested inside another `--navy-800` card; inner groups use `--navy-700` or just spacing.
- **SQL drawer.** A right-side slide-over, 480 px wide on `--navy-900`, opened by a "SQL" button in the page header that shows a count badge. Remove the floating bottom pill.
  - Records are listed newest first with label, Exp/CO, ms and rows. Code blocks have a `--space` background, Geist Mono 12.5 px, keywords in `--ice`, strings in `--ok`, numbers in `--warn`.
  - The refusal card uses a `--danger` left border, the title "PostgreSQL refused this", the sqlstate pill, the message, then the SQL. It must read as deliberate.

## 4. Components (`src/components/ui` + shared)
- **Buttons:**
  - Primary: `--ice` background, `#04122e` text, 600 weight, 36 px high, 8 px radius.
  - Secondary: `--navy-700` with a `--line` border.
  - Ghost: text only.
  - Danger: `--danger` outline.
  - Focus ring is 2 px `--ice` at 2 px offset.
- **Inputs, selects and sliders:** `--navy-700` background, `--line` border, `--line-strong` on focus. Sliders get an ice track fill.
- **Tables:** 13 px text, row height 36 px, a sticky header on `--navy-900`, hairline row dividers, numbers right-aligned with tabular-nums, and hover set to `--navy-700`.
- **Status pills:** NOMINAL ok, SAFE danger, STOWED text-3, WARN warn. Each is a tinted background (12% alpha) plus a solid dot.
- **Empty/offline states:** an icon, one sentence on what happened, and one action (e.g. "Backend is offline. Start it with `python run.py`, then retry." with a [Retry] button).

## 5. Page-specific fixes
- **Console (`/console`):** keep the Netflix idea, but polish it.
  - A centered "Who's on console?" (40 px / 600), and 5 tiles each 168 px square: `--navy-800` with a `--line` border and the avatar SVG drawn in `--ice` line art (the Director avatar may use the `--somaiya` dot).
  - Hover lifts the tile 4 px, sets the border to `--ice`, and reveals the "can do" list under it.
  - Selected: a quick scale to 1.04, then navigate.
  - Below the tiles, in `--text-3`: "Every query runs as this Postgres role. Switch anytime from the sidebar."
- **Ops (`/ops`):** this is the most important screen.
  - The globe fills the main area on a black background. Make the atmosphere glow subtle navy-ice (`#3a6bd6` at low opacity), with no warm tint.
  - **Satellites are small 6 px white/ice dots with a soft glow.** Plane A is `#a9caff` and plane B is `#e6ecf8`. The selected sat gets an ice ring, and a SAFE sat gets a small `--danger` ring. No big yellow blobs.
  - ISL chords use `--ice` at an alpha proportional to the score. Downlink beams use `--ok`.
  - Overlays (speed, legend, clock) are compact 12–13 px glass chips: `--navy-900` at 80% alpha with backdrop blur and a `--line` border. Place them **top-left and bottom-left without covering the globe's centre**. The legend is collapsible and collapsed by default on screens under 1400 px.
  - The right rail is a 360 px column of panels: Fleet (KPIs as a compact 2×3 grid of label + value, values 20 px / 600), Alerts, Live telemetry, Decisions. Each panel scrolls internally, so the page itself doesn't scroll on desktop.
  - The "Demo 3-hop route" control becomes a secondary button inside the Fleet panel header.
- **Routing, AI router, Deploy and the labs:** apply the shell, panel, table and button system. Specifically:
  - The **tree SVG** uses `--line` edges, `--navy-700` nodes, and `--ice` for the active path. Leaves are colored by action with a 5-colour palette derived from the tokens (ice, ok, warn, danger, text-2).
  - The **confusion matrix** runs `--navy-800`→`--ice` (sequential), with numbers in `--text`.
  - **Transactions lab:** the two session columns use mono only for the SQL input. Status pills follow the status system. The wait-for graph uses ice arrows, and a deadlock is drawn as a `--danger` cycle.
  - **Schema ER (xyflow):** node cards are `--navy-800` with a header strip of `--navy-700`, edges are `--line-strong`, and the EER disjoint "d" circle is in ice. Set the xyflow background to `--space` with tiny `--line` dots.
- **Landing (`/`):** keep the story structure (chapters, pins, scroll), but restyle it.
  - The background is `--space`, with chapters alternating `--space` / `--navy-900` bands.
  - The headline is 72 px / 600 in `--text`. **No coloured word inside the headline.** The emphasis comes from the 3D scene instead.
  - **Hero 3D:** a wireframe Earth in `--line-strong` at 40% opacity, orbit rings in `--ice` at 35% opacity, satellites as small 4 px white points (**fix the giant yellow dots: the sprite size must not scale with camera distance enough to cover the text, so use `sizeAttenuation` off or clamp it**), and the **packet as the only `--somaiya` red glowing dot**, with a short trail. Keep the canvas behind the text with `pointer-events: none`, and offset the globe to the right half on desktop so it doesn't sit under the headline.
  - PacketTag: navy pill, mono id, status pill.
  - SqlRibbon: `--space` code block with the token colours from §3.
  - RowCard: navy-800 key/value card with an ice flash on insert.
  - The CTA becomes a primary button "Take the console".

## 6. Quality bar
- **Contrast:** text on panels must meet ≥ 4.5:1. Check `--text-2` on `--navy-800`.
- **Responsive:** no horizontal scroll at 375 px, and the sidebar becomes a sheet.
- **Motion:** respect `prefers-reduced-motion`. Remove decorative hover animations from cards; keep hover feedback to a background/border change.
- **Cleanup:** remove any leftover classes or styles referencing old tokens (`--cream`, `--ink`, `--amber`, `--rule`, `--somaiya-soft`, `--signal`, `--sky`). `grep` must find none.

## Acceptance (run these and paste the output)
```bash
cd web && npm install && npx tsc -b --noEmit && npm run build && npm run lint
grep -rnE "cream|--ink|--amber|--rule|--sky|--signal|somaiya-soft|Space Grotesk|Plex|grid-paper|\[ [A-Z]" src index.html ; echo "old-token-grep-exit=$?"
```
- The grep must exit 1 (no matches).
- List the files changed.
- Do not leave a dev server running.
