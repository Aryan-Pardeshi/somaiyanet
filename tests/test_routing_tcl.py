"""CGR routing, route_packet, dispatch_packets, deploy TCL, execute_pass."""
import psycopg


def test_cgr_best_route_is_two_hop_relay(conn):
    rows = conn.execute(
        "SELECT rank, destination, hops, path_nodes, path_contacts, arrival_ts, explanation"
        " FROM cgr_routes('SAT-T1', now(), 4096, 4, 5)").fetchall()
    assert rows, "expected at least one route"
    best = rows[0]
    # relay via T2 to SVB beats the 5 h direct downlink
    assert best[1] == "GS-SVB"
    assert list(best[3]) == ["SAT-T1", "SAT-T2", "GS-SVB"]
    assert best[2] == 2
    assert "ISL" in best[6] and "DOWNLINK" in best[6]


def test_cgr_hops_monotonic_and_acyclic(conn):
    rows = conn.execute(
        "SELECT path_nodes, path_contacts FROM cgr_routes('SAT-T1', now(), 4096, 4, 5)").fetchall()
    assert rows
    for nodes, contacts in rows:
        assert len(nodes) == len(set(nodes)), f"cycle in {nodes}"
    # route_packet persists hops with depart >= previous arrive
    conn.execute("DELETE FROM route_hop")
    conn.execute("DELETE FROM route")
    pid = conn.execute(
        "SELECT packet_id FROM packet WHERE origin_sat='SAT-T1' AND mode='TTC' LIMIT 1").fetchone()[0]
    rid = conn.execute("SELECT route_packet(%s)", (pid,)).fetchone()[0]
    assert rid is not None
    hops = conn.execute(
        "SELECT depart_ts, arrive_ts FROM route_hop WHERE route_id=%s ORDER BY hop_no", (rid,)).fetchall()
    assert len(hops) == 2
    for i in range(1, len(hops)):
        assert hops[i][0] >= hops[i - 1][1]
    assert conn.execute("SELECT route_id FROM packet WHERE packet_id=%s", (pid,)).fetchone()[0] == rid


def test_cgr_never_relays_via_stowed(conn):
    rows = conn.execute(
        "SELECT path_nodes FROM cgr_routes('SAT-T1', now(), 4096, 4, 10)").fetchall()
    for (nodes,) in rows:
        assert "SAT-T4" not in list(nodes)


def test_relay_beats_direct_downlink(conn):
    rows = conn.execute(
        "SELECT destination, arrival_ts FROM cgr_routes('SAT-T1', now(), 4096, 4, 5)").fetchall()
    by_dest = {r[0]: r[1] for r in rows}
    assert "GS-SVB" in by_dest
    if "GS-BOM" in by_dest:
        assert by_dest["GS-SVB"] < by_dest["GS-BOM"]


def test_dispatch_disjoint_and_priority(conn, role_conn_factory):
    c1 = role_conn_factory("mission_director")
    c1.autocommit = False
    c2 = role_conn_factory("mission_director")
    c2.autocommit = False
    try:
        r1 = c1.execute("SELECT packet_id, mode FROM dispatch_packets('SAT-T2', 'w1', 1500)").fetchall()
        r2 = c2.execute("SELECT packet_id, mode FROM dispatch_packets('SAT-T2', 'w2', 1500)").fetchall()
        s1 = {r[0] for r in r1}
        s2 = {r[0] for r in r2}
        # overlapping transactions must never hand the same packet to both workers
        assert not (s1 & s2), "concurrent dispatch claimed overlapping packets"
        # TTC (priority 1) comes first in whatever was claimed
        assert r1 and r1[0][1] == "TTC"
        c1.commit()
        # after the first worker commits, a new call makes progress on the rest
        c3 = role_conn_factory("mission_director")
        try:
            r3 = c3.execute("SELECT packet_id FROM dispatch_packets('SAT-T2', 'w3', 100000)").fetchall()
            s3 = {r[0] for r in r3}
            assert s3, "expected remaining packets after first commit"
            assert not (s1 & s3)
            c3.commit()
        finally:
            c3.close()
    finally:
        c1.close()
        c2.close()
    # restore fixture queue for other tests
    conn.execute("UPDATE packet SET status='QUEUED', claimed_by=NULL WHERE origin_sat='SAT-T2'")
    conn.commit()


def test_confirm_deployment_reject_success_and_rollback(conn, role_conn_factory):
    import psycopg
    # TCL procedures COMMIT internally, so CALL them over an autocommit link.
    admin = role_conn_factory("mission_director")
    admin.autocommit = True
    try:
        # reject: only 1 distinct ok signal
        try:
            admin.execute("CALL confirm_deployment('POD-X1')")
            raise AssertionError("expected rejection")
        except psycopg.errors.RaiseException:
            pass
        assert conn.execute("SELECT status FROM deployer_pod WHERE pod_id='POD-X1'").fetchone()[0] == "ARMED"
        # success
        admin.execute("CALL confirm_deployment('POD-X2')")
        assert conn.execute("SELECT status FROM deployer_pod WHERE pod_id='POD-X2'").fetchone()[0] == "CONFIRMED"
        assert conn.execute("SELECT state FROM satellite WHERE node_id='SAT-X2'").fetchone()[0] == "COMMISSIONING"
        # simulate failure leaves everything unchanged
        try:
            admin.execute("CALL confirm_deployment('POD-X3', TRUE)")
            raise AssertionError("expected simulated failure")
        except psycopg.errors.RaiseException:
            pass
        assert conn.execute("SELECT status FROM deployer_pod WHERE pod_id='POD-X3'").fetchone()[0] == "ARMED"
        assert conn.execute("SELECT state FROM satellite WHERE node_id='SAT-X3'").fetchone()[0] == "STOWED"
    finally:
        admin.close()


def test_execute_pass_fail_stage2(conn):
    cid = conn.execute(
        "SELECT contact_id FROM contact WHERE from_node='SAT-T1' AND to_node='GS-BOM' ORDER BY start_ts LIMIT 1"
    ).fetchone()[0]
    # reset packet states for SAT-T1 first
    conn.execute("UPDATE packet SET status='QUEUED', delivered_to=NULL, delivered_at=NULL WHERE origin_sat='SAT-T1'")
    conn.commit()
    rows = conn.execute("SELECT stage, status, packets, bytes FROM execute_pass('SAT-T1', %s, TRUE)", (cid,)).fetchall()
    assert len(rows) == 2
    assert rows[1][1] == "ROLLED BACK TO SAVEPOINT"
    n_ttc_sent = conn.execute(
        "SELECT count(*) FROM packet WHERE origin_sat='SAT-T1' AND mode='TTC' AND status='SENT'").fetchone()[0]
    assert n_ttc_sent == 2
    n_other_queued = conn.execute(
        "SELECT count(*) FROM packet WHERE origin_sat='SAT-T1' AND mode<>'TTC' AND status='QUEUED'").fetchone()[0]
    assert n_other_queued == 3
    conn.rollback()
