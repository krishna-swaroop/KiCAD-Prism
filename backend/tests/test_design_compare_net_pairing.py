"""Net pairing: which base net corresponds to which compare net, and nothing else."""

import unittest

from app.services.design_compare_net_pairing import NetPair, pair_nets


def _net(name, uid):
    return {"netUid": uid, "name": name}


def _fingerprints(mapping):
    """Build a fingerprint callable from `{netUid: {(reference, pin), ...}}`."""
    return lambda item: frozenset(mapping.get(item["netUid"], ()))


class NetPairingTests(unittest.TestCase):
    def test_same_terminals_under_a_new_name_pair_by_connectivity(self) -> None:
        base = [_net("VCC", "b:vcc")]
        head = [_net("3V3", "h:3v3")]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:vcc": {("U1", "1"), ("C1", "1")}}),
            _fingerprints({"h:3v3": {("U1", "1"), ("C1", "1")}}),
        )
        self.assertEqual(pairing.pairs, (NetPair(base[0], head[0], "connectivity"),))
        self.assertEqual(pairing.unmatched_base, [])
        self.assertEqual(pairing.unmatched_head, [])

    def test_same_name_over_different_terminals_pairs_by_name(self) -> None:
        base = [_net("SIG", "b:sig")]
        head = [_net("SIG", "h:sig")]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:sig": {("U1", "1"), ("R1", "1")}}),
            _fingerprints({"h:sig": {("U1", "1"), ("R2", "2")}}),
        )
        self.assertEqual(pairing.pairs, (NetPair(base[0], head[0], "name"),))

    def test_nets_on_one_side_only_are_unmatched(self) -> None:
        base = [_net("A", "b:a"), _net("GONE", "b:gone")]
        head = [_net("A", "h:a"), _net("NEW", "h:new")]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:a": {("U1", "1")}, "b:gone": {("U1", "2")}}),
            _fingerprints({"h:a": {("U1", "1")}, "h:new": {("U1", "3")}}),
        )
        self.assertEqual(
            pairing.pairs,
            (
                NetPair(base[0], head[0], "connectivity"),
                NetPair(base[1], None, "unmatched"),
                NetPair(None, head[1], "unmatched"),
            ),
        )
        self.assertEqual(pairing.unmatched_base, [base[1]])
        self.assertEqual(pairing.unmatched_head, [head[1]])
        self.assertEqual([pair.base["name"] for pair in pairing.matched], ["A"])

    def test_duplicate_connectivity_disambiguates_by_name_then_listing_order(self) -> None:
        shared = {("U1", "1")}
        base = [_net("X", "b:x"), _net("Y", "b:y")]
        head = [_net("Y", "h:y"), _net("Z", "h:z")]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:x": shared, "b:y": shared}),
            _fingerprints({"h:y": shared, "h:z": shared}),
        )
        # Y keeps its name; X takes the remaining head net with the same
        # connectivity even though it is now called Z.
        self.assertEqual(
            pairing.pairs,
            (
                NetPair(base[0], head[1], "connectivity"),
                NetPair(base[1], head[0], "connectivity"),
            ),
        )

    def test_duplicate_connectivity_surplus_falls_through_to_name_stage(self) -> None:
        shared = {("U1", "1")}
        base = [_net("X", "b:x")]
        head = [_net("P", "h:p"), _net("X", "h:x2"), _net("R", "h:r")]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:x": shared}),
            _fingerprints({"h:p": shared, "h:x2": shared, "h:r": shared}),
        )
        self.assertEqual(pairing.pairs[0], NetPair(base[0], head[1], "connectivity"))
        self.assertEqual(pairing.unmatched_head, [head[0], head[2]])
        self.assertEqual([pair.basis for pair in pairing.pairs[1:]], ["unmatched", "unmatched"])
        # Leftovers are ordered by name, not by listing position.
        self.assertEqual([pair.head["name"] for pair in pairing.pairs[1:]], ["P", "R"])

    def test_nets_without_terminals_pair_by_name_and_zip_duplicates_in_order(self) -> None:
        base = [_net("N", "b:1"), _net("N", "b:2"), _net("M", "b:3")]
        head = [_net("N", "h:9"), _net("M", "h:3"), _net("K", "h:k")]
        empty = _fingerprints({})
        pairing = pair_nets(base, head, empty, empty)
        self.assertEqual(
            pairing.pairs,
            (
                NetPair(None, head[2], "unmatched"),
                NetPair(base[2], head[1], "name"),
                NetPair(base[0], head[0], "name"),
                NetPair(base[1], None, "unmatched"),
            ),
        )

    def test_unnamed_nets_are_ignored(self) -> None:
        base = [_net("", "b:blank"), _net("A", "b:a")]
        head = [_net("A", "h:a"), {"netUid": "h:none"}]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:blank": {("U1", "9")}, "b:a": {("U1", "1")}}),
            _fingerprints({"h:none": {("U1", "9")}, "h:a": {("U1", "1")}}),
        )
        self.assertEqual(pairing.pairs, (NetPair(base[1], head[0], "connectivity"),))

    def test_every_net_participates_at_most_once(self) -> None:
        shared = {("U1", "1")}
        other = {("U2", "1")}
        base = [
            _net("A", "b:a1"),
            _net("A", "b:a2"),
            _net("B", "b:b"),
            _net("C", "b:c"),
            _net("D", "b:d"),
        ]
        head = [
            _net("A", "h:a"),
            _net("B", "h:b1"),
            _net("B", "h:b2"),
            _net("C", "h:c"),
            _net("E", "h:e"),
        ]
        pairing = pair_nets(
            base,
            head,
            _fingerprints({"b:a1": shared, "b:a2": shared, "b:b": other, "b:c": {("U3", "1")}}),
            _fingerprints({"h:a": shared, "h:b1": shared, "h:b2": other, "h:c": {("U3", "2")}}),
        )
        seen_base = [id(pair.base) for pair in pairing.pairs if pair.base is not None]
        seen_head = [id(pair.head) for pair in pairing.pairs if pair.head is not None]
        self.assertEqual(len(seen_base), len(set(seen_base)))
        self.assertEqual(len(seen_head), len(set(seen_head)))
        self.assertEqual(sorted(seen_base), sorted(id(item) for item in base))
        self.assertEqual(sorted(seen_head), sorted(id(item) for item in head))
        for pair in pairing.pairs:
            self.assertIn(pair.basis, {"connectivity", "name", "unmatched"})
            self.assertEqual(pair.matched, pair.basis != "unmatched")

    def test_pairing_is_deterministic_and_leaves_inputs_untouched(self) -> None:
        base = [_net("N", "b:1"), _net("N", "b:2")]
        head = [_net("N", "h:1"), _net("M", "h:2")]
        base_snapshot = [dict(item) for item in base]
        head_snapshot = [dict(item) for item in head]
        fingerprints = _fingerprints({"b:1": {("U1", "1")}, "h:2": {("U1", "1")}})
        first = pair_nets(base, head, fingerprints, fingerprints)
        second = pair_nets(base, head, fingerprints, fingerprints)
        self.assertEqual(first, second)
        self.assertEqual(base, base_snapshot)
        self.assertEqual(head, head_snapshot)
        self.assertIs(first.pairs[0].base, base[0])
        self.assertIs(first.pairs[0].head, head[1])


if __name__ == "__main__":
    unittest.main()
