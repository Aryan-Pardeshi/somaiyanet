# Brief 04: AI router stored in the database (training + SQL inference + watchdog)

Read `docs/spec.md` first, especially §0, §2 (ai_model, dt_node, ai_model_metric, routing_decision, telecommand), and §5 (the `db/05_ai.sql` part). The schema, the seed and the data generators already exist.

**Parallel-work rules.**
- Another worker is writing `db/03_views.sql`, `db/06_triggers.sql`, `db/07_security.sql`, `tests/` and appending to `db/04_functions.sql`. **Do not touch those files.** A third worker is in `web/`.
- Use **your own database**: `export PGPORT=55433; .venv/Scripts/python scripts/setup_db.py --db somaiyanet_w4`. Never run setup without `--db somaiyanet_w4`.
- The full pipeline, including the constellation data, is fine to run there.

## Files to create
1. `scripts/train_router.py`. It exposes `run(conn_factory)` and is also runnable standalone.
   - **Simulate** about 20 000 labelled pass scenarios with `numpy`, using `rng = np.random.default_rng(42)`. Sample features per spec §5:
     - `battery_v`: 6.3–8.3
     - `link_score`: 0–100; set it to 0 when contact_s = 0
     - `contact_s`: 0 with probability 0.35, otherwise 60–600
     - `queue_ttc_kb`: 0–4
     - `queue_sstv_kb`: 0–400
     - `queue_voice_kb`: 0–120
     - `sunlit`: 0/1
     - `isl_available`: 0/1
   - **Oracle label.** This is a utility model that is *smarter than the rules* but agrees with them most of the time. For each action, compute the expected value delivered within the pass, as follows.
     - Usable bytes are `contact_s · 9600/8 · (link_score/100)`.
     - Each mode has a value per KB: TTC 10, SSTV 1, voice 2.
     - There is a power cost: SSTV costs 1.5 units per pass, and the cost is doubled when `sunlit = 0` and `battery_v < 7.4`.
     - `RELAY_VIA_ISL` is worth 70% of `FULL_DOWNLINK` at a typical link, but only when `isl_available = 1`.
     - `HOLD` is worth 0.
     - A hard risk penalty applies: below 6.8 V, any action other than `SAFE_TTC_ONLY` is very bad.
   - Pick the argmax, then add **3% label noise**, so the tree sometimes learns slightly unsafe splits near the thresholds. That gives the watchdog something to catch in the demo, which is intended.
   - **Train** `sklearn.tree.DecisionTreeClassifier(max_depth=6, min_samples_leaf=40, random_state=42)` on an 80/20 split. Compute accuracy, per-class precision/recall/F1/support, and the confusion matrix.
   - **Export to the DB in one transaction:**
     - Deactivate the previous models.
     - Insert an `ai_model` row: name `somaiya-router`, version = previous max + 1, the features in exact column order, the classes as `router_action[]`, max_depth, train_rows, test_accuracy, `confusion` JSONB, `is_active = TRUE`.
     - Insert every tree node into `dt_node`. Use `tree_.feature`, `threshold`, `children_left/right` (sklearn uses -1 for a leaf, which must become NULL), `n_node_samples`, `impurity` for gini, and `value` for `class_counts` with the class names as keys. A leaf's `leaf_action` is the argmax class. `depth` must be computed.
     - Insert the `ai_model_metric` rows.
   - Print the accuracy, the node count, the depth, and the top 5 feature importances.
   - Also **train a second, deliberately weak model** (`max_depth=2`) as version N+1, with `is_active = FALSE`, so the UI can compare model versions.
2. `db/05_ai.sql`. Header `-- [AI use case: model-as-data, recursive CTE inference, watchdog; CO3]`. Implement `rule_action`, `rule_reason`, `features_for_satellite`, `ai_decide`, `watchdog_violation`, `decide_for_satellite` and `preview_decision` **exactly per spec §5**.
   - `ai_decide` **must** walk the tree with `WITH RECURSIVE` over `dt_node`, starting at node 0. The comparison is `(p_features->>feature)::float8 <= threshold` → left_child, otherwise right_child. Its path entries are formatted like `battery_v = 6.95 ≤ 7.05 → left`, rounding the numbers to 2 decimals.
   - `features_for_satellite` reads:
     - the latest telemetry row for battery_v and `housekeeping->>'sunlit'`
     - the DOWNLINK contact active at `p_at` with the highest link_score, giving link_score and the seconds left until end_ts
     - `SUM(size_bytes)` of QUEUED packets by mode bucket (TTC / SSTV / voice = M17+CODEC2), in KB
     - whether an ISL contact active at `p_at` exists to a sat in state NOMINAL / SAFE / COMMISSIONING

     Absent values become 0.
   - `decide_for_satellite`: the human-in-the-loop telecommand override takes precedence, as specified. When there is no active model, the AI action is NULL and the rule action is used, with `override_reason 'no active model: rule-based fallback'`.

## Do not touch
Everything not listed above. Specifically: `db/01–04`, `db/06+`, `tests/`, `web/`, `docs/`, `reference/`, `.env*`.

## Acceptance (run these and paste the output)
```bash
export PGPORT=55433
.venv/Scripts/python scripts/setup_db.py --db somaiyanet_w4
```
Then, via psql on `somaiyanet_w4`:
```sql
SELECT model_id, version, is_active, test_accuracy, (SELECT count(*) FROM dt_node d WHERE d.model_id=m.model_id) nodes FROM ai_model m;
SELECT node_id, features_for_satellite(node_id) FROM satellite WHERE state <> 'STOWED' ORDER BY 1;
SELECT s.node_id, d.action, d.path FROM satellite s, LATERAL ai_decide(features_for_satellite(s.node_id)) d WHERE s.state <> 'STOWED';
SELECT sat_id, ai_action, rule_action, final_action, overridden, override_reason FROM (SELECT (decide_for_satellite(node_id)).* FROM satellite WHERE state <> 'STOWED') x;
SELECT rule_action('{"battery_v":6.6,"link_score":80,"contact_s":300,"isl_available":0}'), rule_reason('{"battery_v":6.95,"link_score":80,"contact_s":300,"isl_available":1}');
SELECT watchdog_violation('{"battery_v":6.6,"link_score":80,"contact_s":300}', 'FULL_DOWNLINK');
```
Also write a **Python cross-check** at the end of `train_router.py`, enabled with `--verify`. It takes 500 random scenarios and asserts that SQL `ai_decide` equals sklearn `predict` for every one of them. Paste its output; it must report 500/500.
