"""Accepted divergences: the only way a member may differ from its golden.

Each producer owns ``divergences/<member>.md`` (the prose: case, why the new
output is right, affected consumer; ADR §7) and ``divergences/<member>.json``
(what the runner applies). An entry::

    {
      "id": "D7",                      # the id the .md file and the field map use
      "summary": "...",
      "cases": ["*"],                  # case ids, or "*" for every case
      "rule": "route-metrics/via-spans-used-layers",   # optional: a built-in transform
      "patches": [                     # optional: exact RFC 6902 edits of the golden
        {"case": "rs-cynthion", "op": "replace", "path": "/nets/3/usedLayers", "value": ["B.Cu", "F.Cu"]}
      ],
      "ignore": ["/nets/*/usedLayers"] # optional: pointer patterns removed on both sides
    }

Order of application per case and member: non-semantic fields removed
(``members.py``), then every matching entry in file order: its rule, then its
patches, then its ignores. The report says which entries changed the outcome.
Patches are preferred to ignores: an ignore also hides a regression.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from . import jsonvalue

DIVERGENCES_SCHEMA = "prism.parity.divergences.a0"


@dataclass
class Divergence:
    id: str
    summary: str
    cases: list[str]
    rule: str | None = None
    patches: list[dict] = field(default_factory=list)
    ignore: list[str] = field(default_factory=list)

    def applies_to(self, case: str) -> bool:
        return "*" in self.cases or case in self.cases


def load(directory: Path, stem: str) -> list[Divergence]:
    path = directory / f"{stem}.json"
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schema") != DIVERGENCES_SCHEMA or doc.get("member") != stem:
        raise SystemExit(f"{path}: expected schema {DIVERGENCES_SCHEMA} for member {stem}")
    out = []
    for item in doc.get("accepted", []):
        entry = Divergence(
            id=item["id"],
            summary=item.get("summary", ""),
            cases=list(item.get("cases", ["*"])),
            rule=item.get("rule"),
            patches=list(item.get("patches", [])),
            ignore=list(item.get("ignore", [])),
        )
        if entry.rule and entry.rule not in RULES:
            raise SystemExit(f"{path}: {entry.id}: unknown rule {entry.rule!r}; known: {', '.join(sorted(RULES))}")
        out.append(entry)
    return out


@dataclass
class Applied:
    id: str
    effect: str  # changed-golden | ignored-fields | no-effect


def apply(
    divergences: list[Divergence],
    case: str,
    golden: Any,
    member: Any,
    siblings: dict[str, Any],
) -> tuple[Any, Any, list[Applied]]:
    """Return (expected, actual, applied) after applying every matching divergence."""

    expected = copy.deepcopy(golden)
    actual = copy.deepcopy(member)
    applied = []
    for entry in divergences:
        if not entry.applies_to(case):
            continue
        before = copy.deepcopy(expected)
        if entry.rule:
            expected = RULES[entry.rule](expected, siblings)
        for patch in entry.patches:
            if patch.get("case") not in (None, "*", case):
                continue
            expected = jsonvalue.apply_patch(expected, {k: v for k, v in patch.items() if k != "case"})
        removed = 0
        for pattern in entry.ignore:
            removed += jsonvalue.remove_pattern(expected, pattern)
            removed += jsonvalue.remove_pattern(actual, pattern)
        if not jsonvalue.equal(before, expected) and not entry.ignore:
            effect = "changed-golden"
        elif removed:
            effect = "ignored-fields"
        elif not jsonvalue.equal(before, expected):
            effect = "changed-golden"
        else:
            effect = "no-effect"
        applied.append(Applied(entry.id, effect))
    return expected, actual, applied


# ------------------------------------------------------------- built-in rules
#
# A rule rewrites the golden from the golden's own data (and the same case's
# other goldens, ``siblings``), for a divergence that is a rule rather than a
# list of values. Each names the field map row it implements.


def _route_metrics_via_spans_used_layers(golden: dict, siblings: dict[str, Any]) -> dict:
    """route-metrics D7 (decisions.md, Route metrics 2): a via adds every copper layer
    it spans, in the board's copper order, to its net's ``usedLayers``.

    The copper order is the stackup golden's ``copperLayers`` (``stackup.md`` rule 7,
    which route-metrics R6 cites). ``usedLayers`` stays sorted in code point order.
    """

    if not any(net["viaSpans"] for net in golden["nets"]):
        return golden  # nothing to add (no vias, or a case without a board)
    stackup = siblings.get("stackup")
    if not stackup:
        raise ValueError("route-metrics/via-spans-used-layers needs the case's stackup golden")
    copper = stackup["copperLayers"]
    for net in golden["nets"]:
        layers = set(net["usedLayers"])
        for span in net["viaSpans"]:
            start, stop = span["startLayer"], span["stopLayer"]
            if start in copper and stop in copper:
                low, high = sorted((copper.index(start), copper.index(stop)))
                layers.update(copper[low : high + 1])
            else:
                layers.update((start, stop))
        net["usedLayers"] = sorted(layers)
    return golden


def _semantic_index_envelope_a2(golden: dict, siblings: dict[str, Any]) -> dict:
    """semantic-index D1 (field map, "Envelope"): the bundle writes the a2 envelope.

    The goldens hold the a1 envelope until they are recaptured; a2 changes the
    schema id and renames the key (``sourceRevisionKey`` -> ``designKey``), which
    the comparison already ignores as non-semantic (``members.py``).
    """

    if golden.get("schema") == "prism.semantic_index.a1":
        golden["schema"] = "prism.semantic_index.a2"
    return golden


RULES: dict[str, Callable[[Any, dict[str, Any]], Any]] = {
    "route-metrics/via-spans-used-layers": _route_metrics_via_spans_used_layers,
    "semantic-index/envelope-a2": _semantic_index_envelope_a2,
}
