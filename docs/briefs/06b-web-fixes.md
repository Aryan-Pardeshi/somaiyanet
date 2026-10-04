# Brief 06b: Landing fixes (review findings)

Work only inside `web/`. Read `docs/spec.md` §9–§10. Another worker is writing `backend/` in parallel; don't touch it.

These problems were found in browser review of the landing page at `/`. Fix all of them:

1. **Tab title.** It is still the old "SomaiyaSat — Small satellite. Smart decisions." Change it in `index.html` and anywhere it is set at runtime to **"SomaiyaNet · Constellation Mission Ops"**.
2. **Mojibake.** The visible text contains broken UTF-8: `â€”`, `â€“`, `Ã—`, `Â·`. Search every file under `web/src` for `â€`, `Ã`, `Â` and replace each one with the intended character (—, –, ×, ·). Make sure the files are saved as UTF-8 without a BOM. Afterwards, `grep -rnP "â€|Ã|Â" web/src` must return nothing.
3. **Hero label.** It reads `[ ORBIT SHELLS · 3 DEPLOYED CUBES ]`. Change it to `[ 2 ORBITAL PLANES · 8 POCKETQUBES ]`.
4. **HowItDecides intro.** The paragraph "No model weights, no training run — just thresholds…" is now **false**. Rewrite it: a decision tree trained on 20 000 simulated passes is stored in PostgreSQL as rows (`dt_node`), inference walks it with a recursive CTE, and the rule-based fallback plus watchdog keep it safe.
   - Update the three rule cards to match `rule_action` in `db/05_ai.sql` (read that file):
     - SAFE: battery < 6.8 V
     - RELAY: no contact or link < 40 with an ISL available
     - CAUTION: battery < 7.2 V, so TTC + voice only
     - ALL CLEAR
   - Remove the `BUDGET = DURATION × LINK × 12` label; it is the friend's formula, not ours.
   - The architecture diagram (the PDF's Fig. 3 blocks) can stay.
5. **GroundNetwork stations.** Use exactly our six, from `db/02_seed.sql`:

   | station | lat, lon |
   |---|---|
   | KJSIT Mumbai | 19.07, 72.88 |
   | ReOrbit Espoo | 60.21, 24.66 |
   | Bengaluru | 12.97, 77.59 |
   | Tokyo | 35.68, 139.65 |
   | Svalbard | 78.22, 15.63 |
   | Cape Town | -33.92, 18.42 |

   Fix the copy too: "Mumbai is the home station; ReOrbit Espoo is the collaborator's site." Remove "with ReOrbit" duplication.
6. **ByTheNumbers.** Make it read the backend first, falling back to the file:
   - `useStats` fetches `/api/stats` first and falls back to `/data/stats.json`.
   - Then **replace `web/public/data/stats.json`** with our mission's mock numbers, keeping the existing shape: 7 of 8 sats deployed, about 70 560 telemetry rows, 420 packets queued, 1 064 contacts (366 ISL windows), 6 stations, 4 payload modes. Keep it plausible.
   - Replace the two "real satellites tracked / real passes" counters with "inter-satellite link windows" and "AI decisions logged", and rewrite the footnote to match.
7. **Team section.** It says "This page and the database behind it are the Information Technology slice." Keep that (it is fine), but make sure the rings are Aryan, Teammate, KJSIT, KJSSE and ReOrbit only.
8. **Delete `src/sections/Build.tsx`** and anything only it imported, provided nothing else uses those imports.
9. **Mobile.** At 375 px width there must be no horizontal page scroll. Check with the CSS (`overflow-x: clip` on `body`/sections if needed). The pinned hero must still work.

## Acceptance (run these and paste the output)
```bash
cd web && npm run build && npm run lint
grep -rnP "â€|Ã|Â" src index.html ; echo "mojibake-grep-exit=$?"
grep -rn "Singapore\|Santiago\|No model weights\|DEPLOYED CUBES\|Small satellite" src index.html ; echo "stale-grep-exit=$?"
```
Both greps must return exit code 1 (no matches). Do not leave a dev server running.
