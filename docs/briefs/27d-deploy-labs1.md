# Brief 27d: Deploy page, lab frame and labs (SQL, Index, Normalization)

First read `docs/briefs/27-common.md` and the files it lists.

Files you may edit (only these):
- `web/src/pages/Deploy.tsx`, `web/src/features/deploy/DiffCard.tsx`
- `web/src/pages/Lab.tsx`
- `web/src/features/labs/common.tsx`
- `web/src/features/labs/SqlLab.tsx`, `IndexLab.tsx`, `NormLab.tsx`

## Deploy
- Title `.sx-h1` "Deploy", `.sx-lead`. The deployment is a transaction story (BEGIN, steps,
  COMMIT / ROLLBACK): show the steps as a vertical list (it is a real sequence, so numbers are fine,
  as `.sx-num` white 40%), each step a row with a `.sx-status` (ok = committed, critical = rolled
  back, idle = pending). The main action ("Deploy SomaiyaSat-4") is the one `.sx-btn--filled`;
  "Roll back" is a ghost pill. `DiffCard`: before/after values in an inset-grouped list, changed
  values in white, unchanged white 45%, mono only for column names/values.
- Keep `Locked` wrappers and every API call.

## Lab frame (`Lab.tsx`) and `labs/common.tsx`
- The lab page header: `.sx-h1` title, `.sx-lead` line; lab tabs/switcher as a segmented control
  (Apple): a `--sx-surface` track radius 10px, the active segment `--sx-surface-2` with white text,
  others white 60%, DIN caps 12px. No underline glow, no blue.
- Shared lab pieces in `common.tsx` (result tables, query boxes, notes, explain output): result
  tables in the inset-grouped table style, SQL in `.sx-code`, success/fail lines as `.sx-status`,
  error codes (`42501`, `40001`, `40P01`) in mono `--sx-red`.

## SqlLab, IndexLab, NormLab
- Same system. Preset/query pickers: segmented control or a quiet list; the run action one
  `.sx-btn--filled` ("Run"). EXPLAIN output: `.sx-code`; numbers (ms, rows, buffers, sizes) `.sx-num`.
- Index comparison charts/bars: white bars, the faster/better one white 100%, the other white 35%;
  no blue. Normalization steps (UNF to BCNF) are a real sequence: a vertical list with step labels as
  `.sx-eyebrow`, tables as inset-grouped tables; anomalies highlighted with `#ff9f0a` text only.
- Keep the role chips that POST `/api/session` (restyle them as a segmented control) and all logic.
