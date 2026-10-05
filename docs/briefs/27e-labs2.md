# Brief 27e: labs (Schema, Security, Transactions)

First read `docs/briefs/27-common.md` and the files it lists.

Files you may edit (only these):
- `web/src/features/labs/SchemaLab.tsx`
- `web/src/features/labs/SecurityLab.tsx`
- `web/src/features/labs/TxLab.tsx`

## SchemaLab (ER / EER diagram from the catalog)
- Entity boxes: `#111113` fill, radius 10px, no border (or 1px 8% hairline), entity name in DIN caps
  12px white, attributes in mono 11px white 70% (they are column names), keys marked with a small
  "PK"/"FK" in DIN caps white 45%. Relationship lines 1px white 30%; generalization arrows white.
  Weak entities: a double hairline is fine. No blue, no glow, no coloured headers.
- Side info (selected table details): inset-grouped list.

## SecurityLab (roles, grants, RLS, 42501)
- Role switcher as a segmented control (Apple). The privilege matrix as an inset-grouped table:
  allowed = `.sx-status` data-tone="ok" "Allowed", denied = data-tone="critical" "Denied". The live
  denial output: mono 12px `--sx-red` with the SQLSTATE. "Try" actions are ghost pills `.sx-btn--sm`.

## TxLab (two sessions: lost update, non-repeatable read, write skew, deadlock, SKIP LOCKED, MVCC, WAL)
- Two session columns side by side (stacked on phones), each an `.sx-group` titled `.sx-eyebrow`
  "Session A" / "Session B"; statements as rows with the SQL in mono 12-13px; executed statements
  white, pending white 40%; the current step row `--sx-surface-2`. Outcomes: COMMIT `.sx-status`
  ok, ROLLBACK / `40001` / `40P01` data-tone critical with the code in mono `--sx-red`, waiting/locked
  data-tone warn. Scenario picker: segmented control. Step controls: ghost pills; "Next step" may be
  the one `.sx-btn--filled`. `xmin`/`xmax` and WAL positions: `.sx-num` or mono (they are values).
- Keep the timeline logic, API calls and keyboard handling exactly.
