"""The projections a golden exists for (ADR §6) and their comparison rules.

Each entry names the bundle path, the schema id and root model of the frozen
contract, the producer WP, and the contract's documented non-semantic fields
(the field map's "Parity note" column, conventions.md §14). Nothing else is
ever excluded from a comparison: every other difference is either an accepted
divergence (``divergences/<member>.json``) or a failure.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Member:
    stem: str
    schema_id: str
    root_model: str
    producer: str
    field_map: str
    non_semantic: tuple[str, ...] = ()
    # Extra checks the runner applies after value equality (compare.py).
    checks: tuple[str, ...] = field(default_factory=tuple)

    @property
    def bundle_path(self) -> str:
        return f"projections/{self.stem}.json"

    @property
    def golden_name(self) -> str:
        return f"{self.stem}.json"


MEMBERS: dict[str, Member] = {
    member.stem: member
    for member in (
        Member(
            "semantic-index",
            "prism.semantic_index.a1",
            "SemanticIndexA1",
            "P1",
            "field-maps/semantic-index.md",
            # The bundle (a2) writes its design key; the golden holds the a1
            # envelope and its sourceRevisionKey until it is recaptured (field
            # map, "How a golden is produced", step 2). The comparison ignores
            # both names (field map, "Comparison").
            non_semantic=("/sourceRevisionKey", "/designKey"),
        ),
        Member(
            "board-objects",
            "prism.board_objects.a0",
            "BoardObjectsA0",
            "P2",
            "field-maps/board-objects.md",
            # Compared separately against G's reference implementation (field map step 4).
            non_semantic=("/documents/*/objects/*/contentDigest",),
            checks=("content-digest",),
        ),
        Member("occurrences", "prism.occurrences.a0", "OccurrencesA0", "P2", "field-maps/occurrences.md"),
        Member("stackup", "prism.stackup.a0", "StackupA0", "P3", "field-maps/stackup.md"),
        Member("route-metrics", "prism.route_metrics.a0", "RouteMetricsA0", "P2", "field-maps/route-metrics.md"),
        Member("placements", "prism.placements.a0", "PlacementsA0", "P3", "field-maps/placements.md"),
        Member("project", "prism.project.a0", "ProjectA0", "P4", "field-maps/project.md"),
        Member(
            "system-interface",
            "prism.system_interface.v1",
            "SystemInterfaceV1",
            "P5",
            "field-maps/system-interface.md",
            # P5 acceptance (1): the digest is byte-exact; value equality is weaker.
            checks=("digest-self",),
        ),
    )
}


def resolve(names: str | None) -> list[Member]:
    """``None``/``"all"`` → every member; otherwise a comma-separated list of stems."""

    if not names or names == "all":
        return list(MEMBERS.values())
    out = []
    for name in names.split(","):
        name = name.strip()
        if name not in MEMBERS:
            raise SystemExit(f"unknown member {name!r}; known: {', '.join(MEMBERS)}")
        out.append(MEMBERS[name])
    return out
