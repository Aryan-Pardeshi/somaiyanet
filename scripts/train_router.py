"""Train the SomaiyaNet onboard AI router and export it as DB rows.

Simulates ~20k labelled pass scenarios, trains a DecisionTreeClassifier,
and exports the tree into ai_model / dt_node / ai_model_metric in one
transaction (plus a deliberately weak max_depth=2 second version for the
UI model comparison). Runnable standalone or via setup_db's data steps.

Usage:
    python scripts/train_router.py [--db NAME] [--verify]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _db  # noqa: E402

# Feature columns in exact ai_model.features order (spec section 5).
FEATURES = [
    "battery_v",
    "link_score",
    "contact_s",
    "queue_ttc_kb",
    "queue_sstv_kb",
    "queue_voice_kb",
    "sunlit",
    "isl_available",
]

# Argmax order. Direct-downlink actions sort before RELAY before HOLD so
# ties on empty queues / no contact resolve per the R1..R5 rule order.
ACTIONS = ["SAFE_TTC_ONLY", "TTC_VOICE", "FULL_DOWNLINK", "RELAY_VIA_ISL", "HOLD"]

N_SIM = 20000
SEED = 42

# Oracle constants: 9600 bps downlink, value per KB, SSTV power cost
# (1.5 units scaled to value, doubled in eclipse below 7.4 V), relay at
# 70% of a typical-link FULL_DOWNLINK, hard risk penalty below 6.8 V.
BYTE_RATE = 9600 / 8
V_TTC, V_VOICE, V_SSTV = 10.0, 2.0, 1.0
SSTV_COST, SSTV_COST_ECLIPSE = 75.0, 150.0
TYPICAL_USABLE_KB = 300 * BYTE_RATE * 0.7 / 1024.0
RISK_PENALTY = 10000.0


def simulate(n: int, rng: np.random.Generator):
    """Sample n pass scenarios; returns (X, cols dict)."""
    battery = rng.uniform(6.3, 8.3, n)
    no_contact = rng.random(n) < 0.35
    contact = np.where(no_contact, 0.0, rng.integers(60, 601, n).astype(float))
    link = rng.integers(0, 101, n).astype(float)
    link[no_contact] = 0.0  # no window means no link score
    q_ttc = rng.uniform(0, 4, n)
    q_sstv = rng.uniform(0, 400, n)
    q_voice = rng.uniform(0, 120, n)
    sunlit = rng.integers(0, 2, n).astype(float)
    isl = rng.integers(0, 2, n).astype(float)
    cols = {
        "battery_v": battery,
        "link_score": link,
        "contact_s": contact,
        "queue_ttc_kb": q_ttc,
        "queue_sstv_kb": q_sstv,
        "queue_voice_kb": q_voice,
        "sunlit": sunlit,
        "isl_available": isl,
    }
    X = np.column_stack([cols[f] for f in FEATURES])
    return X, cols


def _alloc(values_q, usable):
    """Greedy TTC -> voice -> SSTV allocation; returns (take_ttc, take_voice, take_sstv)."""
    q_ttc, q_voice, q_sstv = values_q
    take_ttc = np.minimum(q_ttc, usable)
    rem1 = usable - take_ttc
    take_voice = np.minimum(q_voice, rem1)
    rem2 = rem1 - take_voice
    take_sstv = np.minimum(q_sstv, rem2)
    return take_ttc, take_voice, take_sstv


def oracle_labels(cols: dict) -> np.ndarray:
    """Utility-model oracle: expected delivered value per action, argmax."""
    battery = cols["battery_v"]
    link = cols["link_score"]
    contact = cols["contact_s"]
    sunlit = cols["sunlit"]
    isl = cols["isl_available"]
    q_ttc, q_sstv, q_voice = cols["queue_ttc_kb"], cols["queue_sstv_kb"], cols["queue_voice_kb"]

    usable = contact * BYTE_RATE * (link / 100.0) / 1024.0
    t_ttc, t_voice, t_sstv = _alloc((q_ttc, q_voice, q_sstv), usable)
    cost = np.where((sunlit == 0) & (battery < 7.4), SSTV_COST_ECLIPSE, SSTV_COST)
    transmits_sstv = t_sstv > 1e-9

    val_safe = t_ttc * V_TTC
    val_voice = t_ttc * V_TTC + t_voice * V_VOICE
    val_full = val_voice + t_sstv * V_SSTV - np.where(transmits_sstv, cost, 0.0)
    # No window means nothing can downlink directly; HOLD must win ties.
    no_contact = contact == 0
    val_safe = np.where(no_contact, -1.0, val_safe)
    val_voice = np.where(no_contact, -1.0, val_voice)
    val_full = np.where(no_contact, -1.0, val_full)

    # Relay earns 70% of a typical-link FULL_DOWNLINK via the ISL neighbour.
    r_ttc, r_voice, r_sstv = _alloc(
        (q_ttc, q_voice, q_sstv),
        np.full_like(usable, TYPICAL_USABLE_KB),
    )
    full_typ = (
        r_ttc * V_TTC
        + r_voice * V_VOICE
        + r_sstv * V_SSTV
        - np.where(r_sstv > 1e-9, cost, 0.0)
    )
    val_relay = np.where(isl == 1, 0.7 * full_typ, -np.inf)
    val_hold = np.zeros_like(usable)

    # Hard risk penalty: below 6.8 V only SAFE_TTC_ONLY is viable.
    low = battery < 6.8
    val_voice = np.where(low, -RISK_PENALTY, val_voice)
    val_full = np.where(low, -RISK_PENALTY, val_full)
    val_relay = np.where(low, -RISK_PENALTY, val_relay)
    val_hold = np.where(low, -RISK_PENALTY, val_hold)

    stacked = np.column_stack([val_safe, val_voice, val_full, val_relay, val_hold])
    return np.array(ACTIONS)[np.argmax(stacked, axis=1)]


def _export_tree(cur, model_id: int, clf, class_names: list[str]) -> tuple[int, int]:
    """Insert every sklearn tree node into dt_node; returns (nodes, depth)."""
    tree = clf.tree_
    n_nodes = tree.node_count
    feat_idx = tree.feature  # -2 at leaves
    thr = tree.threshold
    left, right = tree.children_left, tree.children_right
    samples = tree.n_node_samples
    impurity = tree.impurity
    value = tree.value  # (nodes, 1, n_classes)

    # Depth via stack walk from the root (node 0).
    depth = np.zeros(n_nodes, dtype=int)
    stack = [0]
    while stack:
        node = stack.pop()
        for child in (left[node], right[node]):
            if child != -1:
                depth[child] = depth[node] + 1
                stack.append(int(child))

    rows = []
    for node in range(n_nodes):
        is_leaf = left[node] == -1
        counts = {
            cls: int(value[node, 0, c]) for c, cls in enumerate(class_names)
        }
        if is_leaf:
            feature, threshold = None, None
            lch, rch = None, None
            leaf_action = class_names[int(np.argmax(value[node, 0]))]
        else:
            feature, threshold = FEATURES[int(feat_idx[node])], float(thr[node])
            lch, rch = int(left[node]), int(right[node])
            leaf_action = None
        rows.append(
            (
                model_id, int(node), int(depth[node]), feature, threshold,
                lch, rch, leaf_action, int(samples[node]),
                round(float(impurity[node]), 5), json.dumps(counts),
            )
        )
    cur.cursor().executemany(
        "INSERT INTO dt_node (model_id, node_id, depth, feature, threshold,"
        " left_child, right_child, leaf_action, samples, gini, class_counts)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)",
        rows,
    )
    return n_nodes, int(tree.max_depth)


def _export_metrics(cur, model_id: int, y_true, y_pred, class_names: list[str]) -> None:
    from sklearn.metrics import precision_recall_fscore_support

    prec, rec, f1, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=class_names, zero_division=0
    )
    rows = [
        (model_id, cls, round(float(prec[i]), 4), round(float(rec[i]), 4),
         round(float(f1[i]), 4), int(sup[i]))
        for i, cls in enumerate(class_names)
    ]
    cur.cursor().executemany(
        "INSERT INTO ai_model_metric (model_id, class_label, precision_, recall, f1, support)"
        " VALUES (%s, %s, %s, %s, %s, %s)",
        rows,
    )


def _train_and_export(cur, name: str, version: int, Xtr, ytr, Xte, yte,
                      active: bool, **clf_kwargs):
    from sklearn.metrics import accuracy_score, confusion_matrix

    clf = __import__("sklearn.tree", fromlist=["DecisionTreeClassifier"]).DecisionTreeClassifier(
        **clf_kwargs
    ).fit(Xtr, ytr)
    y_pred = clf.predict(Xte)
    acc = float(accuracy_score(yte, y_pred))
    classes = [str(c) for c in clf.classes_]
    cm = confusion_matrix(yte, y_pred, labels=classes)
    confusion = json.dumps({"labels": classes, "matrix": cm.tolist()})

    model_id = cur.execute(
        "INSERT INTO ai_model (name, version, algorithm, features,"
        " classes, max_depth, train_rows, test_accuracy, confusion, is_active)"
        " VALUES (%s, %s, 'DecisionTreeClassifier', %s, %s::router_action[],"
        " %s, %s, %s, %s::jsonb, %s) RETURNING model_id",
        (name, version, FEATURES, classes, clf_kwargs.get("max_depth"),
         len(Xtr), round(acc, 4), confusion, active),
    ).fetchone()[0]
    nodes, depth = _export_tree(cur, model_id, clf, classes)
    _export_metrics(cur, model_id, yte, y_pred, classes)
    return clf, model_id, acc, nodes, depth


def run(conn_factory, verify: bool = False) -> None:
    from sklearn.model_selection import train_test_split

    rng = np.random.default_rng(SEED)
    X, cols = simulate(N_SIM, rng)
    y = oracle_labels(cols)
    # 3% label noise so the tree learns slightly unsafe splits near the
    # thresholds; the watchdog demo catches those on purpose.
    flip = rng.choice(N_SIM, size=int(0.03 * N_SIM), replace=False)
    for i in flip:
        others = [a for a in ACTIONS if a != y[i]]
        y[i] = others[rng.integers(0, len(others))]

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=SEED)

    with conn_factory() as conn:
        with conn.transaction():
            base = conn.execute(
                "SELECT COALESCE(MAX(version), 0) FROM ai_model WHERE name = 'somaiya-router'"
            ).fetchone()[0]
            conn.execute("UPDATE ai_model SET is_active = FALSE WHERE is_active")
            clf, model_id, acc, nodes, depth = _train_and_export(
                conn, "somaiya-router", base + 1, Xtr, ytr, Xte, yte,
                True, max_depth=6, min_samples_leaf=40, random_state=SEED,
            )
            weak, weak_id, weak_acc, weak_nodes, weak_depth = _train_and_export(
                conn, "somaiya-router", base + 2, Xtr, ytr, Xte, yte,
                False, max_depth=2, random_state=SEED,
            )
    print(f"main model v{base + 1} (id {model_id}): accuracy={acc:.4f}"
          f" nodes={nodes} depth={depth} train_rows={len(Xtr)}")
    print(f"weak model v{base + 2} (id {weak_id}): accuracy={weak_acc:.4f}"
          f" nodes={weak_nodes} depth={weak_depth} (inactive comparison)")
    order = np.argsort(clf.feature_importances_)[::-1][:5]
    print("top features:")
    for j in order:
        print(f"  {FEATURES[int(j)]}: {clf.feature_importances_[int(j)]:.4f}")

    if verify:
        n_ok = cross_check(conn_factory, clf, model_id, n=500)
        print(f"verify: SQL ai_decide == sklearn predict on {n_ok}/500 scenarios")
        assert n_ok == 500, f"verify failed: {n_ok}/500 match"


def cross_check(conn_factory, clf=None, model_id: int | None = None, n: int = 500) -> int:
    """Assert SQL ai_decide equals sklearn predict on n random scenarios."""
    rng = np.random.default_rng(123)
    X, _ = simulate(n, rng)
    if clf is None or model_id is None:
        raise ValueError("cross_check needs the trained classifier and model_id")
    expected = clf.predict(X)
    ok = 0
    with conn_factory() as conn:
        if model_id is None:
            model_id = conn.execute(
                "SELECT model_id FROM ai_model WHERE is_active"
                " ORDER BY version DESC LIMIT 1"
            ).fetchone()[0]
        for i in range(n):
            feats = {f: float(X[i, j]) for j, f in enumerate(FEATURES)}
            got = conn.execute(
                "SELECT action FROM ai_decide(%s::jsonb, %s)",
                (json.dumps(feats), model_id),
            ).fetchone()[0]
            if got is not None and str(got) == str(expected[i]):
                ok += 1
            else:
                print(f"MISMATCH row {i}: sklearn={expected[i]} sql={got} feats={feats}")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the SomaiyaNet AI router")
    parser.add_argument("--db", default=None, help="target database name")
    parser.add_argument("--verify", action="store_true",
                        help="cross-check SQL ai_decide vs sklearn on 500 scenarios")
    args = parser.parse_args()

    def factory(user=None, password=None, autocommit=False):
        kw = {}
        if args.db:
            kw["dbname"] = args.db
        elif os.environ.get("SOMAIYANET_DB"):
            kw["dbname"] = os.environ["SOMAIYANET_DB"]
        return _db.connect(user=user, password=password, autocommit=autocommit, **kw)

    run(factory, verify=args.verify)


if __name__ == "__main__":
    main()
