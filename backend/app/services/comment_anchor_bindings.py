"""Choose a comment's binding for an explicitly displayed Git revision.

This module does not inspect geometry. A candidate must still be resolved by
the viewer against the loaded PCB/schematic source UUID. In particular, an
unmatched source item must never fall back to an old world coordinate.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any


def select_binding(
    bindings: Iterable[dict[str, Any]],
    displayed_commit: str,
    is_ancestor: Callable[[str, str], bool],
) -> dict[str, Any]:
    """Return the unique most recent ancestral binding or an unresolved state.

    Independent reattachments on two branches remain ambiguous at their merge.
    Reattachments made twice at one commit use the later append-only row.
    """
    applicable = [binding for binding in bindings if is_ancestor(binding["commit"], displayed_commit)]
    if not applicable:
        return {"state": "unresolved", "reason": "outside_history"}

    by_commit: dict[str, dict[str, Any]] = {}
    for binding in applicable:
        commit = binding["commit"]
        if commit not in by_commit or binding.get("sequence", 0) > by_commit[commit].get("sequence", 0):
            by_commit[commit] = binding
    candidates = list(by_commit.values())
    maximal = [
        binding for binding in candidates
        if not any(
            other["commit"] != binding["commit"]
            and is_ancestor(binding["commit"], other["commit"])
            for other in candidates
        )
    ]
    if len(maximal) != 1:
        return {"state": "unresolved", "reason": "ambiguous_merge"}

    selected = maximal[0]
    if not selected.get("elementId") and selected["commit"] != displayed_commit:
        return {
            "state": "unresolved", "reason": "coordinate_review",
            "lastBinding": selected,
        }
    return {"state": "candidate", "binding": selected}
