# Brief 09a: App shell, Netflix-style role picker, SQL drawer, globe restyle

Read `docs/spec.md` **§9 (REVISED design language)** and **§10 (role picker)**, plus `docs/briefs/05-backend.md` (the API contract). Look at the landing's components in `web/src/components/story/` and `web/src/styles/tokens.css` and reuse them; the app must feel like the same product as the landing.

**Parallel-work rules.** The backend worker is writing `backend/` and `run.py`. Work only in `web/`. Do **not** edit `web/src/landing/**`, `web/src/pages/Landing.tsx` or `web/src/components/story/**`; import them only.

## API contract summary
Every response is `{data, sql:[{label, sql, exp, co, elapsed_ms, rowcount}], role}`. An error looks like `{error:{sqlstate, message, detail, hint}, sql, role}`, with 401 (no profile), 403 (`42501`, "PostgreSQL refused"), 409, 422 or 400.

Endpoints you use here:
- `GET /api/profiles`
- `POST /api/session {role}`
- `GET /api/session`
- `DELETE /api/session`

The backend may not be running while you work. Build `web/src/app/api.ts` with a typed `apiFetch<T>(path, init)` that:
- returns `{data, sql, role}` on success
- throws an `ApiError` carrying `{status, sqlstate, message, detail, sql}`
- is used by every page from now on

When the network fails (backend down), pages show a calm "Backend offline: run `python run.py`" card. Do **not** silently mock data in the app pages, except where Ops already has its own mock.

## Build
1. **`web/src/app/AppShell.tsx`**: the layout for every route except `/` and `/console`.
   - **Top bar:** the Brand, then nav links (Ops, Routing, Brain, Deploy, Labs ▾ with the 6 labs: transactions, security, indexing, normalization, schema, sql), then a **profile chip** on the right showing the avatar, role title and DB role name in mono.
   - **Profile chip:** clicking it opens a popover listing the 5 profiles for an instant switch (`POST /api/session`, then re-fetch the current page's data), plus "Change profile…" which goes to `/console`.
   - **Profile guard:** if `GET /api/session` returns 401, redirect to `/console?next=<path>`.
   - **Background:** the ink background with the grid paper, using the tokens.
2. **`web/src/app/SqlDrawer.tsx`**: the signature "SQL under the hood" drawer.
   - A collapsible panel docked at the bottom-right, with a tab showing "SQL · N".
   - It lists every SQL record of the most recent API calls on the page, newest first. Each record shows its label, an Exp/CO chip (`Exp 6 · CO3`), `elapsed_ms`, `rowcount`, and the SQL in a mono block with keyword highlighting (reuse `SqlRibbon`'s highlighter, or extract a shared `highlightSql()` into `web/src/app/sql.ts`), plus a copy button.
   - Provide a React context `useSqlLog()` that pages push into. `apiFetch` should push automatically, so pages do nothing extra.
   - **Errors:** when an error has `sqlstate 42501` or a `P0001`/`28000`, show it as a Somaiya-red card: "PostgreSQL refused · 42501 · permission denied for table telemetry", along with the SQL that was attempted. This is a key demo moment, so make it look deliberate, not like a crash.
3. **`web/src/pages/Console.tsx` at `/console`**: the Netflix-style picker.
   - A full-screen ink page with the title "Who's on console?" in big Space Grotesk.
   - Below it, 5 **large square tiles** (about 180 px, responsive wrap) with an avatar per role. Make the avatars simple geometric SVGs in the brand style, not emoji:
     - Director: a red ring
     - Mumbai and Espoo: a station dish
     - Analyst: an eye or lens
     - AI Router: the packet dot inside a hex
   - Under each tile: the title, the DB role in mono, and the "can" lines from `/api/profiles`.
   - Hover: the tile scales to 1.06 with a Somaiya-red outline and reveals the "can" lines (Netflix feel).
   - Click: `POST /api/session`, then a short zoom transition, then navigate to `next` or `/ops`.
   - Keyboard: arrow keys move focus and Enter selects.
   - If `/api/profiles` fails, fall back to the static list of 5 profiles and show a "backend offline" note.
4. **Routes in `App.tsx`:**
   - `/` stays the landing.
   - `/console` is the picker.
   - `/ops`, `/routing`, `/brain`, `/deploy` and `/labs/:lab` render inside `AppShell`. The non-Ops ones stay as `Placeholder` for now, restyled to the shell; later briefs fill them in.
   - The landing CTA "Take the console →" already links to `/console`; verify it does.
5. **Restyle `/ops`** (`web/src/features/ops/*`, `web/src/pages/Ops.tsx`) to the §9 tokens **without changing the logic**:
   - Panels use `--ink-2` with `--rule` borders, Plex Mono labels in the `01 / LABEL` style, and amber KPI values.
   - Satellites are amber markers; the selected one has a Somaiya-red ring. SAFE sats get a red pulse.
   - ISL chords use `--sky` and downlink beams use `--signal`.
   - The globe atmosphere is tinted a slightly warmer cream-blue so it no longer looks like the friend's electric-blue globe.
   - Ops must use `apiFetch` and AppShell now; keep its existing mock fallback for network errors only. Remove its own 401 card, since AppShell guards it.
6. **Mobile:** the top-bar nav collapses into a sheet menu (shadcn `sheet` exists in `components/ui`), and the Console tiles become a 2-column grid. No horizontal scroll at 375 px.

## Acceptance (run these and paste the output)
```bash
cd web && npx tsc -b --noEmit && npm run build && npm run lint
```
- Zero TypeScript errors.
- List your files.
- Explain how the SqlDrawer gets its records (the context + `apiFetch` hook).
- Do not leave a dev server running.
