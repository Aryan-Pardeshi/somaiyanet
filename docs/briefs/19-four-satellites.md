# Brief 19 (shared): shrink the fleet from 8 satellites to 4

A college would not fly 8 satellites. SomaiyaNet now has **4 SomaiyaSats**: three in orbit and
one still inside its SomaiyaPod deployer (used by the Deploy demo).

## Exact mapping (use these values everywhere)

| new node_id | display_name   | callsign | pod    | pod serial    | orbit                        | state at build | role in demos (was)                         |
|-------------|----------------|----------|--------|---------------|------------------------------|----------------|---------------------------------------------|
| SS-1        | SomaiyaSat-1   | VU2SS1   | POD-1  | SPOD-2026-001 | plane A, slot 1              | NOMINAL        | healthy workhorse (was SAT-A1)              |
| SS-2        | SomaiyaSat-2   | VU2SS2   | POD-2  | SPOD-2026-002 | plane A, slot 2              | NOMINAL        | weak battery ~6.9 V: WARN alerts + watchdog overrides (was SAT-B2) |
| SS-3        | SomaiyaSat-3   | VU2SS3   | POD-3  | SPOD-2026-003 | plane A, slot 3              | SAFE           | battery below 6.8 V, safe mode (was SAT-B3) |
| SS-4        | SomaiyaSat-4   | VU2SS4   | POD-4  | SPOD-2026-004 | plane A, slot 4 (planned TLE)| STOWED         | waiting in its pod for the Deploy demo (was SAT-B4 / POD-B4) |

Old IDs SAT-A4, SAT-B1, SAT-B2, SAT-B3 disappear; anything that referenced them is remapped by
role (B2 -> SS-2, B3 -> SS-3, A4/B1 -> SS-1 or SS-2, whichever keeps the example meaningful).
SAT-A1 -> SS-1, SAT-A2 -> SS-2, SAT-A3 -> SS-3, SAT-B4 -> SS-4, POD-B4 -> POD-4, other pods
POD-A1.. -> POD-1..POD-3.

Orbit: ONE sun-synchronous plane, 525 km, RAAN 75 deg, the four slots spaced 12 deg apart in mean
anomaly (same "string of pearls" spacing as before, so SS-1/SS-2/SS-3 inter-satellite links stay
up and a packet can go SS-1 -> SS-2 -> SS-3 -> ground: two relay hops). Plane B is removed.
Ground stations stay the same 6 (KJSIT Mumbai is ours; the others are partner / amateur stations).

If the `callsign` domain's CHECK pattern rejects `VU2SS1`, keep the domain and choose the
closest valid callsign (e.g. `VU2SSA`..`VU2SSD`), then use it consistently.
