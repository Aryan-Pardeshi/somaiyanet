"""Fill the packet queue: ~60 QUEUED per operational sat plus ~300 DELIVERED history.

Deterministic via random.seed(17). Every packet gets its mode-subtype row.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _db  # noqa: E402

MODES = ["TTC", "SSTV", "M17", "CODEC2"]
WEIGHTS = [0.40, 0.15, 0.25, 0.20]
SSTV_MODES = ["Robot36", "Martin1", "Scottie1", "PD120"]
N_QUEUED_PER_SAT = 60
N_DELIVERED = 300


def _callsign(rng: random.Random) -> str:
    """Random valid amateur callsign: 3-8 [A-Z0-9], optional -NN suffix."""
    core = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(rng.randint(4, 6)))
    if not any(c.isalpha() for c in core):
        core = "V" + core[1:]
    if rng.random() < 0.2:
        core += f"-{rng.randint(1, 12)}"
    return core[:12]


def _size(rng: random.Random, mode: str) -> int:
    if mode == "TTC":
        return rng.randint(128, 512)
    if mode == "SSTV":
        return rng.randint(30 * 1024, 120 * 1024)
    if mode == "M17":
        return rng.randint(2 * 1024, 20 * 1024)
    return rng.randint(1 * 1024, 8 * 1024)


def _insert_subtype(cur, packet_id: int, mode: str, rng: random.Random, sat_call: str) -> None:
    if mode == "TTC":
        cur.execute(
            "INSERT INTO ttc_frame (packet_id, mode, battery_v, temp_c, solar_ma, flags)"
            " VALUES (%s, 'TTC', %s, %s, %s, %s)",
            (packet_id, round(rng.uniform(6.4, 8.0), 2), round(rng.uniform(5, 30), 2),
             rng.randint(0, 600), "{}"),
        )
    elif mode == "SSTV":
        cur.execute(
            "INSERT INTO sstv_image (packet_id, mode, sstv_mode, width, height, caption, image)"
            " VALUES (%s, 'SSTV', %s, %s, %s, %s, NULL)",
            (packet_id, rng.choice(SSTV_MODES), rng.choice([320, 640]),
             rng.choice([256, 480]), f"orbit view {rng.randint(1, 999)}"),
        )
    else:
        dur = rng.randint(1000, 30000)
        dst = _callsign(rng)
        cur.execute(
            "INSERT INTO voice_frame (packet_id, mode, duration_ms, src_callsign, dst_callsign)"
            " VALUES (%s, %s, %s, %s, %s)",
            (packet_id, mode, dur, sat_call, dst),
        )


def run(conn_factory) -> None:
    rng = random.Random(17)
    now = datetime.now(timezone.utc)
    with conn_factory() as conn:
        sats = conn.execute(
            "SELECT s.node_id, n.callsign FROM satellite s"
            " JOIN network_node n USING (node_id)"
            " WHERE s.state <> 'STOWED' ORDER BY s.node_id"
        ).fetchall()
        stations = [r[0] for r in conn.execute("SELECT node_id FROM ground_station").fetchall()]
        sat_call = {n: (c or "VU2SAT") for n, c in sats}
        sat_ids = [n for n, _ in sats]
        with conn.transaction():
            conn.execute("TRUNCATE packet CASCADE")
            n_q = 0
            for sat in sat_ids:
                for _ in range(N_QUEUED_PER_SAT):
                    mode = rng.choices(MODES, weights=WEIGHTS)[0]
                    size = _size(rng, mode)
                    created = now - timedelta(minutes=rng.randint(0, 7 * 24 * 60))
                    pid = conn.execute(
                        "INSERT INTO packet (origin_sat, mode, size_bytes, created_at, status)"
                        " VALUES (%s, %s, %s, %s, 'QUEUED') RETURNING packet_id",
                        (sat, mode, size, created),
                    ).fetchone()[0]
                    _insert_subtype(conn, pid, mode, rng, sat_call[sat])
                    n_q += 1
            n_d = 0
            for _ in range(N_DELIVERED):
                sat = rng.choice(sat_ids)
                mode = rng.choices(MODES, weights=WEIGHTS)[0]
                size = _size(rng, mode)
                delivered_at = now - timedelta(minutes=rng.randint(0, 48 * 60))
                created = delivered_at - timedelta(minutes=rng.randint(5, 600))
                gs = rng.choice(stations)
                pid = conn.execute(
                    "INSERT INTO packet (origin_sat, mode, size_bytes, created_at,"
                    " status, delivered_to, delivered_at)"
                    " VALUES (%s, %s, %s, %s, 'DELIVERED', %s, %s) RETURNING packet_id",
                    (sat, mode, size, created, gs, delivered_at),
                ).fetchone()[0]
                _insert_subtype(conn, pid, mode, rng, sat_call[sat])
                n_d += 1
    print(f"QUEUED packets: {n_q}, DELIVERED packets: {n_d}")


if __name__ == "__main__":
    run(_db.connect)
