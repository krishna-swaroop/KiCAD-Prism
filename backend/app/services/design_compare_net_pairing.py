"""Pair nets across two revisions before any change is classified.

Pairing decides *which* base net corresponds to *which* compare net; it says
nothing about how they differ. Keeping it separate from classification means a
new matching rule cannot quietly change the evidence a change carries, and the
one-participation guarantee can be tested on its own.

Nets are matched on the terminals they connect first, then on name:

1. Nets whose connectivity fingerprints are equal are paired. When several
   nets on both sides share one fingerprint, equal names disambiguate; any
   remainder pairs in listing order.
2. Nets left over pair by exact name, in sorted-name order, zipping duplicate
   names in listing order. A name present on one side only yields an
   unmatched pair.

The result preserves both revisions' source records untouched and is
deterministic for a given input order, which is part of the diff contract.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, List, Optional, Tuple

Net = Dict[str, Any]
# Connectivity identity: the (reference, pin) terminals a net connects. Empty
# means the net has no terminals and cannot be matched on connectivity.
Fingerprint = Callable[[Net], FrozenSet[Tuple[str, str]]]


@dataclass(frozen=True)
class NetPair:
    """One pairing decision. `basis` records why the two were paired."""

    base: Optional[Net]
    head: Optional[Net]
    basis: str  # "connectivity", "name", or "unmatched"

    @property
    def matched(self) -> bool:
        return self.base is not None and self.head is not None


@dataclass(frozen=True)
class NetPairing:
    """Ordered pairing decisions plus the matched/unmatched views of them."""

    pairs: Tuple[NetPair, ...]

    @property
    def matched(self) -> List[NetPair]:
        return [pair for pair in self.pairs if pair.matched]

    @property
    def unmatched_base(self) -> List[Net]:
        return [pair.base for pair in self.pairs if pair.base is not None and pair.head is None]

    @property
    def unmatched_head(self) -> List[Net]:
        return [pair.head for pair in self.pairs if pair.head is not None and pair.base is None]


def pair_nets(
    base_nets: List[Net],
    head_nets: List[Net],
    base_fingerprint: Fingerprint,
    head_fingerprint: Fingerprint,
) -> NetPairing:
    """Pair every named net at most once, by connectivity first, then by name.

    `base_fingerprint`/`head_fingerprint` map a net to its cross-revision
    connectivity identity; a falsy fingerprint (no terminals) opts the net out
    of connectivity matching and leaves it to the name stage.
    """
    base_nets = [item for item in base_nets if item.get("name")]
    head_nets = [item for item in head_nets if item.get("name")]

    base_by_fp: Dict[FrozenSet[Tuple[str, str]], List[Net]] = {}
    head_by_fp: Dict[FrozenSet[Tuple[str, str]], List[Net]] = {}
    for item in base_nets:
        fp = base_fingerprint(item)
        if fp:
            base_by_fp.setdefault(fp, []).append(item)
    for item in head_nets:
        fp = head_fingerprint(item)
        if fp:
            head_by_fp.setdefault(fp, []).append(item)

    pairs: List[NetPair] = []
    used_base: set[int] = set()
    used_head: set[int] = set()

    for fp in sorted(base_by_fp.keys() & head_by_fp.keys(), key=lambda value: sorted(value)):
        base_group = base_by_fp[fp]
        head_group = head_by_fp[fp]
        # Disambiguate identical connectivity by net name when possible. Name
        # matches are settled for the whole group before any listing-order
        # fallback, so an earlier base net cannot take a head net that a later
        # base net still holds the name of; that would pair the head net twice.
        head_by_name: Dict[str, deque[Net]] = defaultdict(deque)
        for item in head_group:
            head_by_name[str(item.get("name"))].append(item)
        assigned: Dict[int, Net] = {}
        for old in base_group:
            named_candidates = head_by_name.get(str(old.get("name")))
            if named_candidates:
                assigned[id(old)] = named_candidates.popleft()
        taken = {id(item) for item in assigned.values()}
        unmatched_heads: deque[Net] = deque(item for item in head_group if id(item) not in taken)
        for old in base_group:
            if id(old) in assigned or not unmatched_heads:
                continue
            assigned[id(old)] = unmatched_heads.popleft()
        for old in base_group:
            new = assigned.get(id(old))
            if new is None:
                continue
            pairs.append(NetPair(old, new, "connectivity"))
            used_base.add(id(old))
            used_head.add(id(new))

    by_name_base: Dict[str, deque[Net]] = defaultdict(deque)
    by_name_head: Dict[str, deque[Net]] = defaultdict(deque)
    for item in base_nets:
        if id(item) not in used_base:
            by_name_base[str(item.get("name"))].append(item)
    for item in head_nets:
        if id(item) not in used_head:
            by_name_head[str(item.get("name"))].append(item)
    for name in sorted(by_name_base.keys() | by_name_head.keys()):
        old_group = by_name_base.get(name, deque())
        new_group = by_name_head.get(name, deque())
        while old_group or new_group:
            old = old_group.popleft() if old_group else None
            new = new_group.popleft() if new_group else None
            basis = "name" if old is not None and new is not None else "unmatched"
            pairs.append(NetPair(old, new, basis))

    return NetPairing(tuple(pairs))
