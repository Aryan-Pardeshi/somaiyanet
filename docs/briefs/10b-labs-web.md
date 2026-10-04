# Brief 10b: DBMS lab pages (`/labs/:lab`)

Read `docs/spec.md` §9 (REVISED) and §10. Read `docs/briefs/10a-labs-db-backend.md` for the **exact API** you consume; the backend is being built in parallel, so code against that contract. Reuse the existing app plumbing:
- `web/src/app/api.ts` (`apiFetch`, `ApiError`)
- `web/src/app/SqlDrawer.tsx`
- `web/src/app/sql.tsx` (`highlightSql`)
- `web/src/app/AppShell.tsx`
- the story components
- the tokens

**Parallel-work rules.**
- Only create `web/src/pages/Lab.tsx` and files under `web/src/features/labs/**`.
- The only change allowed in `App.tsx` is pointing `/labs/:lab` to `Lab.tsx`.
- Do not touch any other pages, which other workers own.

`Lab.tsx` switches on `:lab`, which is one of `transactions`, `security`, `indexing`, `normalization`, `schema`, `sql`. The landing also links `eer`, `mapping`, `ddl`, `dml`, `aggregates` and `routing`, so map those:
- `eer`, `mapping`, `ddl` → `schema` (with a matching tab preselected)
- `dml`, `aggregates` → `sql` (with that experiment's presets preselected)
- `routing` → redirect to `/routing`

Every lab page has:
- a header (`LAB / TRANSACTIONS`)
- Exp/CO chips
- a **"What the examiner should notice"** box of 3 bullets
- a left sub-nav listing the 6 labs

## 1. /labs/transactions (Exp 9, CO1/CO4): the showpiece
- **Two-column console:** **Session A** and **Session B**, side by side and stacked on mobile.
  - Each column shows its pid, a status pill (idle / in transaction / waiting / error, where waiting pulses amber and error shows red), a SQL input (mono textarea with a Run button and Ctrl+Enter), and a scrolling result log for that session.
- A **scenario picker** offers the 7 scenarios from `GET /api/labs/tx/scenarios`.
  - The steps appear as a numbered vertical script between the columns. **Next step** executes the next statement in the right session.
  - Show `expect` vs actual with a ✓ or ✗.
  - Auto-poll `GET /api/labs/tx/{id}/state` every 400 ms while anything is waiting.
- A **lock panel** at the bottom is a live table of the `pg_locks` rows for both pids (mode, granted, relation) plus `pg_blocking_pids`. Draw a small **wait-for graph**: A → B arrows when blocked, and a red cycle for a deadlock.
- **Outcome callouts:**
  - for 40001, a red card "SERIALIZATION FAILURE · 40001 — retry the transaction"
  - for 40P01, "DEADLOCK DETECTED · 40P01 — Postgres aborted one victim"
  - for skip_locked, two id lists with "disjoint ✓"
  - for mvcc, a row-version table showing xmin, xmax and ctid per session
  - for wal, the LSN before/after and the bytes, as a bar
- **Reset** and **New lab session** buttons. Clean up with DELETE on unmount.

## 2. /labs/security (Exp 7)
- A **privilege matrix heatmap**: rows are the 5 roles, columns are the objects (tables, key columns, functions), and cells show S/I/U/D/X chips (granted = cream, denied = dim with red strike). Hovering a cell shows the exact `has_*_privilege` call.
- A **role tree** from the memberships: login → grp_*.
- An **RLS panel** listing the policies (`pg_policies`), plus a live comparison: run `read_downlinks` as the BOM operator, the HEL operator and the director side by side, and show their row counts per station as small bars. This makes it obvious each operator sees only their own station.
- An **"Try it as…" grid** with the action rows × role columns. Each cell has a run button that calls `POST /api/labs/security/try` and shows ✓ (green) or "PostgreSQL refused 42501" (red), with the SQL in a tooltip.
- An **audit log** table (director only, so other roles show the refusal card) with the JSON old/new diff rendered as key-level changes.

## 3. /labs/indexing (Exp 8)
- A **catalog of 6 index types** as cards: kind, DDL (highlighted), purpose, and current size.
- A **benchmark runner**:
  - pick a query and an index, then **Run** calls `POST /api/labs/index/run`
  - show before/after timing bars, the scan node type ("Seq Scan → Bitmap Index Scan"), buffers, and the index size
  - a **Bulk load 500k rows** button (director only) to make the effect visible
- A **plan tree visualizer**: render the EXPLAIN JSON as a collapsible tree with node type, rows (actual vs estimated), time, and highlighted index names. Reuse it in the SQL console.
- A **partition-pruning card**: the 6-hour query plan, showing which `telemetry_YYYYMMDD` partitions were scanned versus the total.
- A **lesson box**: BRIN is tiny and great for append-only time series, GIN suits JSONB containment, a partial index only covers QUEUED, and a covering INCLUDE enables index-only scans. Note that a low-selectivity range makes the planner choose a seq scan, and that is correct.

## 4. /labs/normalization (CO3)
- A **stepper**: UNF → 1NF → 2NF → 3NF → BCNF. Each stage shows:
  - its table(s) as compact data grids (the first 12 rows), with the repeating/duplicated values highlighted amber
  - the FDs as arrows `{sat_name} → {sat_plane, pod_serial}`, with the violating ones red and labelled with the form they violate
  - the fix applied to reach the next stage
- An **anomaly theatre**: three buttons (Update, Insert, Delete anomaly) that call `/api/labs/norm/anomalies` and show the before/after/explanation.
- A **lossless-join proof** table: stage, original rows, rejoined rows, missing, spurious, with a green ✓ when both are 0.
- A small **decomposition diagram** of how each table splits, as an SVG tree.

## 5. /labs/schema (Exp 1–3)
- A **live ER/EER diagram** built from `GET /api/labs/schema` with `@xyflow/react` (already a dependency).
  - Nodes are tables showing their columns: the PK has a key icon, FKs are marked, generated columns are italic.
  - Edges are the FKs, labelled with cardinality.
  - **EER styling:** supertype→subtype edges meet at a "d" disjoint circle with a double line (total participation), weak entities get a double border, partitioned telemetry shows a stacked-pages icon with the partition count, bridges get a diamond-ish badge, and lookups are dim.
  - Auto-layout: group by domain (Network: node/sat/station/contact/route; Payload: packet + subtypes + payload_mode + telemetry; Deploy: pod/events/log/transitions; AI: ai_model/dt_node/metric/decision; Security: station_key/telecommand/audit/alert). Use a simple column layout; dagre is not installed, so place the groups by hand.
- **Tabs:**
  - **ER/EER diagram**
  - **Mapping rules**, which renders `mapping_notes`
  - **Constraints**, a table of every CHECK/EXCLUDE/UNIQUE/FK grouped by table, with highlighted definitions
- Clicking a table opens a side panel with its comment, columns and constraints.

## 6. /labs/sql (Exp 4–6): the console
- A big editor textarea (mono, Ctrl+Enter to run), an **EXPLAIN** toggle, and the role shown from the session chip.
- Results are a data grid (sticky header, at most 500 rows, NULL shown dim). With EXPLAIN on, show the plan tree visualizer (shared with indexing).
- **Presets:** `GET /api/console/presets`, grouped by Exp 4/5/6/7/8/9, appear as a sidebar list; clicking one loads it.
- A banner explains that statements run inside `BEGIN READ ONLY` with a 5 s timeout, so writes fail with 25006 even for the director. That is intentional; the write labs are on the other pages.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
```
- Zero TypeScript errors.
- List your files.
- Explain the transactions lab polling/waiting flow in 5 lines.
- Do not leave a dev server running.
