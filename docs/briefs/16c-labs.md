# Brief 16c: the six database labs

Read docs/briefs/16-console-style.md first (shared style + rules).

Files you may edit: `web/src/pages/Lab.tsx`, `web/src/features/labs/**`
(common.tsx, TxLab, SecurityLab, IndexLab, NormLab, SchemaLab, SqlLab, types.ts).

Each lab page: title row (light 30px title, muted one-line description, experiment/CO badges in
mono blue outline e.g. "EXP 9", "CO4"). Then a console grid of Panels.
- Transactions lab: the two sessions side by side as two Panels headed "SESSION A" / "SESSION B"
  in mono, each step a row with the SQL in code style and the result; scenario picker as a
  vertical list of chamfered chips (selected = royal blue left bar). Errors like 40001 / 40P01 as
  red critical badge + message; MVCC xmin/xmax/ctid and WAL LSN in mono tables.
- Security lab: privilege matrix as a table (roles x objects) with check = ok-green glyph, denied
  = red cross glyph, column-level ones marked; RLS demo as two Panels per station.
- Indexing lab: index types as Panels with size in big light number; EXPLAIN ANALYZE output in
  code style; timing comparison as horizontal bars (royal blue vs muted).
- Normalization lab: UNF -> 1NF -> 2NF -> 3NF -> BCNF as a horizontal stepper of chamfered tabs;
  tables in the shared table style; FDs in mono; anomaly demos with amber badges; lossless check
  result as ok badge.
- Schema lab: EER/table diagram framed in a Panel; entity boxes chamfered; keep @xyflow/react if
  used, restyle nodes (black fill, white/15 border, mono headers, PK/FK badges).
- SQL lab: editor + results in Panels, role selector as chips, presets as a list, results table in
  the shared table style, EXPLAIN plan tree nodes as chamfered boxes.
Shared helpers belong in `features/labs/common.tsx` (restyle whatever is there first).
