# Brief 25: hero finale = network diagram + live route_hop table

You create ONE new file (the name is given in your instructions, e.g.
`web/src/landing/hero/RouteDiagramA.tsx`). Do not edit any other file. Export:

```ts
export function RouteDiagram(props: {
  progress: { current: number }; // 0..1 scroll progress of the hero; read it every frame
  reduced?: boolean;             // prefers-reduced-motion: render the final state, static
  mobile?: boolean;              // < 768px wide
}): JSX.Element
```
It is mounted inside the hero's sticky full-screen stage (`position:absolute; inset:0`, pure black
with a soft navy radial glow behind). It must be visible only for progress 0.64 -> 1 (fade in
0.64-0.70) and drive everything from `progress.current` in a requestAnimationFrame loop that
writes to refs / SVG attributes / CSS variables (never setState per frame). Scrolling back up
must play it backwards correctly (everything is a pure function of progress).

## The story (what a viewer must understand in 5 seconds)
"A packet can't reach the ground directly, so it waits on a satellite, hops across
satellite-to-satellite links when they come into range, and lands at KJSIT Mumbai. Every hop is a
row in PostgreSQL, and one recursive query finds this route."

## Layout (desktop, 16:9 stage; keep everything inside a centred max-width ~1200px box)
```
 T+00:36  ─────────────●──────────────  mission clock + thin progress bar (top, centred)

   [ NETWORK DIAGRAM  ~62% width ]              [ route_hop  ~34% width ]
        SS-1 ◉ ─ ─ ─ ◉ SS-2 ─ ─ ─ ◉ SS-3        hop  from   to       depart  arrive
           (orbit arc, gentle curve)             1    SS-1   SS-2     T+06    T+06
                         \                       2    SS-2   SS-3     T+20    T+20
                          \  downlink            3    SS-3   GS-BOM   T+36    T+36
     ~~~~~~~~ Earth limb arc ~~~~~ ◈ KJSIT Mumbai
                                                 SELECT * FROM cgr_routes('SS-1', now(), 41216);
```
- **Earth**: a large circle whose top arc forms the bottom of the diagram (only the top ~20% visible),
  filled with a dark navy radial gradient (#0b1a4a -> #000) and a thin bright limb stroke
  (rgba(160,190,255,0.6)) plus a soft atmospheric glow (blurred blue stroke). Faint longitude
  curves on it. A ground-station marker on the limb: small dish glyph + label "KJSIT Mumbai".
- **Orbit**: a gentle arc above the Earth (dashed, rgba(255,255,255,0.25)). Three satellite nodes on
  it: each is a 10px solid white core + 1px ring (r=18) + soft glow; label under it in Geist Mono
  11px ("SS-1", "SS-2", "SS-3"), plus a tiny state chip ("healthy", "low battery", "safe mode" in
  green / amber / amber). The nodes drift slowly along the orbit with progress (a few px), so it
  feels alive.
- **Links (contacts)**: lines between nodes (and SS-3 -> ground) that are OFF (very faint dashed) or
  ON (bright royal blue #3d5bff, 1.5px, glowing, with tiny "q 91" quality label at the midpoint).
  Links switch on/off at specific times so the viewer sees the graph change over time.
- **The packet**: red #ff3b4f dot (r=5) with a glow and a short fading trail. While it WAITS on a
  node, draw a thin red countdown ring around that node that fills up ("waiting for contact"),
  with a tiny label "waiting 00:06". When the link turns on, the packet slides along the link.
  Completed hops leave a thin solid red line on the path.
- **route_hop table** (right): a glass card (rounded 16px, 1px white/10 border, white/[0.03] fill,
  backdrop blur) titled `route_hop` in mono with a small "PostgreSQL" chip. Columns: hop, from, to,
  depart, arrive (mono 12px). Each row slides in (opacity + translateY) at the moment its hop
  completes, the newest row briefly highlighted in blue. Under the table, the query chip types
  itself character by character as the last stage plays, then a one-line result caption:
  "Earliest arrival T+36 · 3 hops · weakest link q 84".
- **Clock**: "T+00:00" -> "T+01:00" mapped to progress (this is simulated minutes:seconds of the
  60-minute window shown as mm:ss, i.e. T+36 = "T+00:36"; keep it simple: show "T+36 min").

## Timeline (map progress 0.70 -> 0.98 to simulated minute 0 -> 60)
- t 0-6: packet waits on SS-1 (ring fills); SS-1–SS-2 link turns ON at t=6 -> hop 1 (row 1 inserts).
- t 6-20: waits on SS-2 (SS-2 is "low battery"); SS-2–SS-3 link ON at t=20 -> hop 2 (row 2).
- t 20-36: waits on SS-3; SS-3–ground link ON at t=36 -> downlink to KJSIT Mumbai (row 3), a small
  ripple at the dish.
- Other links blink on/off as decoys: SS-1–ground ON t=52-58 (label it "direct, arrives T+52",
  dimmer), SS-1–SS-2 again t=40-48.
- 0.98-1.00: query chip finishes typing, caption appears.

## Look
Pure black + navy glow; white hairlines; royal blue `#3d5bff` only for live links and highlights;
red `#ff3b4f` only for the packet and its path; amber `#f5a524` only for the "low battery" chip.
Geist Sans light for the caption, Geist Mono for labels/table. Generous spacing, nothing cramped,
no Gantt bars, no random jargon, no "//". Everything crisp at 1280-1920 widths.

## Phones (`mobile`)
Stack: diagram on top (full width, smaller), table below with only hop / from / to columns; no
horizontal overflow.

Strict TypeScript, no `any`, no unused locals; React 19; no new npm packages; clean up rAF on unmount.
You cannot run shell commands; only read and edit files. Do not run git or servers.
