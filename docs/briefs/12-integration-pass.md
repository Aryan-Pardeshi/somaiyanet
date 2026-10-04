# Brief 12: Front-end ↔ backend integration pass (labs + mission pages)

The pages were written against the API contract **before** the backend existed. Some response shapes differ, so a page falls back to "script preview / backend offline" even though the backend is up.

**The live backend is already running on `http://localhost:8000`** against a fully built database. **Do not start or stop any server and do not run `setup_db`.** Use curl with a session cookie:
```bash
curl -s -c /tmp/c -H 'content-type: application/json' -d '{"role":"mission_director"}' localhost:8000/api/session >/dev/null
curl -s -b /tmp/c localhost:8000/api/labs/tx/scenarios | head -c 1500
```
Other roles available: `station_operator_bom`, `station_operator_hel`, `student_analyst`, `ai_router`.

**Parallel-work rules.** Another worker is editing `web/src/landing/**`, `web/src/pages/Landing.tsx`, `web/src/pages/Console.tsx` and `web/src/components/story/**`; do not touch those. Do not edit `backend/` or `db/` unless an endpoint is clearly broken (a 500 error). In that case, make a minimal fix and report it. **Prefer adapting the front end to the backend's actual shape.**

## Task
For **every** fetcher in `web/src/features/{labs,routing,brain,deploy,ops}/**/*.ts(x)` and `web/src/pages/*.tsx` (except Landing/Console):
1. curl the endpoint it calls (with a realistic query/body) and compare the real JSON with the TypeScript type and the fields the component reads.
2. Fix mismatches in the fetcher/adapter layer: shape (dict vs list), key names, nested objects, numeric strings, and missing fields. Keep a mock/fallback **only** for real network failure (`ApiError.status === 0`), never for shape errors. Remove any "script preview · backend offline" label whenever the backend answered.
3. Exercise each interactive flow with curl, then make sure the UI handles the response:
   - **tx lab:** session → exec A/B steps of `lost_update` (including a step that returns `waiting`) → state → reset → delete. Also run `deadlock` and `phantom_or_write_skew` far enough to see 40P01 and 40001. Close every lab session you open (`DELETE`).
   - **security:** matrix, `try` for 3 actions × 2 roles, and audit as the director vs the analyst (403).
   - **indexing:** catalog, `run` for `brin_ts`. Do **not** run `bulk` with more than 50 000 rows.
   - **norm:** stages, anomalies, lossless.
   - **schema:** the tags/mapping_notes shape and the xyflow node/edge building.
   - **console:** presets, a SELECT, an EXPLAIN, and a DELETE (expect 25006).
   - **routing:** routes, plan, queue.
   - **brain:** models, tree, preview, whatif, decide (director OK, analyst 403), decisions.
   - **deploy:** get, signal, confirm with `simulate_failure`, then `reset`. **Always end by calling `POST /api/deploy/reset`** so the demo state is clean.
4. **UI cleanup while you are in these files:**
   - Remove the duplicated labs sub-navigation inside the lab pages; the app sidebar already lists the labs.
   - Convert any remaining ALL-CAPS labels (e.g. "WHAT THE EXAMINER SHOULD NOTICE", "TRANSACTIONS", "SCENARIO", "EXP 9 · CO1/CO4") to sentence case per spec §9 / brief 11.
   - Remove `text-transform: uppercase` and `tracking-widest` style classes from these pages.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
```
Then give a table of **every endpoint used** with columns: endpoint | real shape (1 line) | file fixed | verified by curl ✓. Leave no lab sessions open, and leave the deploy demo reset.
