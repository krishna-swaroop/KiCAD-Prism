"""Systems of systems: resolve a system's occurrence tree (CONTRACTS_P2 §2.2, §5).

Pure over a ``loader``: an assembly instance pins a catalog revision, whose
``source_ref`` names a system snapshot, whose manifest lists that system's
instances, and so on down. ``resolve`` walks that graph once per revision
(snapshots are immutable, so results are memoized) and returns every
occurrence with its path of instance IDs from the root.

Limits (§5.3): depth counts system levels including the root (at most 4);
at most 200 board occurrences when flattened; a system may not reach itself
through any child snapshot. Violations raise ``HierarchyError`` with the
contract's error code, so callers can refuse the change that caused them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Optional, Sequence

MAX_DEPTH = 4
MAX_BOARDS = 200


class HierarchyError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class ChildSystem:
    """What a catalog revision resolves to: the snapshot it was published from."""

    system_id: str
    snapshot_id: str
    name: str
    instances: Sequence[Mapping[str, Any]]  # manifest v1 instances
    exports: Sequence[Mapping[str, Any]] = ()
    links: Sequence[Mapping[str, Any]] = ()  # manifest v1 links (with rows), for system nets
    harnesses: Sequence[Mapping[str, Any]] = ()  # manifest v1 harnesses (with wires), for system nets
    poses: Sequence[Mapping[str, Any]] = ()  # manifest v1 placement.poses: the members' frozen poses


# revision_id -> ChildSystem, or None when the revision or its snapshot cannot be read
Loader = Callable[[str], Optional[ChildSystem]]


@dataclass
class Occurrence:
    path: str                        # "/sin_a/sin_b"
    labels: tuple[str, ...]          # ("CNDH-A", "CMBD")
    instance_id: str
    kind: str                        # board | assembly | module
    depth: int                       # 1 = an instance of the root system
    system_id: str                   # the system this instance belongs to
    project_id: Optional[str] = None
    baseline_commit: Optional[str] = None
    component_id: Optional[str] = None
    revision_id: Optional[str] = None
    child_system_id: Optional[str] = None
    child_snapshot_id: Optional[str] = None
    unresolved: bool = False         # an assembly whose revision or snapshot could not be read
    child: Optional[ChildSystem] = None  # what an assembly resolved to (not serialized)

    @property
    def display_path(self) -> str:
        return " ▸ ".join(self.labels)

    def as_dict(self) -> dict:
        return {
            "path": self.path, "displayPath": self.display_path, "labels": list(self.labels),
            "instanceId": self.instance_id, "kind": self.kind, "depth": self.depth, "systemId": self.system_id,
            "projectId": self.project_id, "baselineCommit": self.baseline_commit,
            "componentId": self.component_id, "revisionId": self.revision_id,
            "childSystemId": self.child_system_id, "childSnapshotId": self.child_snapshot_id,
            "unresolved": self.unresolved,
        }


@dataclass
class Tree:
    root_system_id: str
    occurrences: list[Occurrence] = field(default_factory=list)

    @property
    def boards(self) -> list[Occurrence]:
        return [o for o in self.occurrences if o.kind == "board"]


def _instance_fields(instance: Mapping[str, Any]) -> dict:
    """Accept both store rows (snake_case) and manifest instances (camelCase)."""
    catalog = instance.get("catalog") or {}
    return {
        "id": instance["id"], "label": instance["label"], "kind": instance.get("kind") or "board",
        "project_id": instance.get("project_id") or instance.get("projectId"),
        "baseline_commit": instance.get("baseline_commit") or instance.get("baselineCommit"),
        "component_id": instance.get("catalog_component_id") or catalog.get("componentId"),
        "revision_id": instance.get("catalog_revision_id") or catalog.get("revisionId"),
    }


def resolve(root_system_id: str, instances: Sequence[Mapping[str, Any]], loader: Loader) -> Tree:
    """The occurrence tree below ``root_system_id``. Raises ``HierarchyError`` on a limit or cycle."""

    tree = Tree(root_system_id)
    memo: dict[str, Optional[ChildSystem]] = {}

    def load(revision_id: str) -> Optional[ChildSystem]:
        if revision_id not in memo:
            memo[revision_id] = loader(revision_id)
        return memo[revision_id]

    def walk(system_id: str, members: Sequence[Mapping[str, Any]], prefix: tuple[str, ...],
             labels: tuple[str, ...], ancestors: tuple[str, ...]) -> None:
        depth = len(prefix) + 1
        for raw in sorted(members, key=lambda i: str(i["id"])):
            item = _instance_fields(raw)
            path = prefix + (item["id"],)
            occurrence = Occurrence(
                path="/" + "/".join(path), labels=labels + (item["label"],), instance_id=item["id"],
                kind=item["kind"], depth=depth, system_id=system_id, project_id=item["project_id"],
                baseline_commit=item["baseline_commit"], component_id=item["component_id"],
                revision_id=item["revision_id"],
            )
            tree.occurrences.append(occurrence)
            if item["kind"] == "board":
                if len(tree.boards) > MAX_BOARDS:
                    raise HierarchyError("hierarchy_too_large",
                                         f"more than {MAX_BOARDS} boards when flattened")
                continue
            if item["kind"] != "assembly" or not item["revision_id"]:
                continue
            child = load(item["revision_id"])
            if child is None:
                occurrence.unresolved = True
                continue
            occurrence.child = child
            occurrence.child_system_id = child.system_id
            occurrence.child_snapshot_id = child.snapshot_id
            if child.system_id in ancestors:
                raise HierarchyError("hierarchy_cycle",
                                     f"{occurrence.display_path} contains a system that contains it")
            if depth + 1 > MAX_DEPTH:
                raise HierarchyError("hierarchy_too_deep",
                                     f"{occurrence.display_path} nests deeper than {MAX_DEPTH} system levels")
            walk(child.system_id, child.instances, path, occurrence.labels, ancestors + (child.system_id,))

    walk(root_system_id, instances, (), (), (root_system_id,))
    return tree
