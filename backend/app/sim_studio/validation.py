"""Checks a setup against the board it names (``validate``) and as a power tree (``preflight``).

Each finding is a ``SetupIssue`` with a stable code and a JSON Pointer, so the
setup UI can attach it to the field and a script can act on it.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Iterable

from app.sim_studio.board_facts import BoardFacts, split_pin_ref, split_ref
from app.sim_studio.models import SetupIssue, SimSetup


class _Issues:
    def __init__(self) -> None:
        self.items: list[SetupIssue] = []

    def error(self, code: str, path: str, message: str, *refs: str) -> None:
        self.items.append(SetupIssue(severity="error", code=code, path=path, message=message, refs=list(refs) or None))

    def warning(self, code: str, path: str, message: str, *refs: str) -> None:
        self.items.append(SetupIssue(severity="warning", code=code, path=path, message=message, refs=list(refs) or None))


_COLLECTIONS = ("rails", "terminals", "sources", "loads", "converters", "probes", "analyses")


def _duplicate_ids(setup: SimSetup, issues: _Issues) -> None:
    for collection in _COLLECTIONS:
        items = getattr(setup, collection)
        counts = Counter(item.id for item in items)
        for position, item in enumerate(items):
            if counts[item.id] > 1:
                issues.error("duplicate-id", f"/{collection}/{position}/id", f"{collection} id {item.id!r} is used more than once.")


def _board(ref: str, facts: BoardFacts, path: str, issues: _Issues) -> bool:
    board = ref.partition(":")[0]
    if board != facts.board_id:
        issues.error("unknown-board", path, f"{ref} names board {board!r}; this setup's board is {facts.board_id!r}.", ref)
        return False
    return True


def _pin_net(ref: str, facts: BoardFacts, path: str, issues: _Issues) -> str | None:
    if not _board(ref, facts, path, issues):
        return None
    _, refdes, pad = split_pin_ref(ref)
    key = f"{refdes}.{pad}"
    if key not in facts.pad_nets:
        issues.error("unknown-pin", path, f"{ref} is not a pad on the board.", ref)
        return None
    net = facts.pad_nets[key]
    if not net:
        issues.warning("pin-without-net", path, f"{ref} is not connected to any net.", ref)
    return net


def _check_references(setup: SimSetup, facts: BoardFacts, issues: _Issues) -> dict[str, str]:
    """Board references; returns rail id -> net name for the rails that resolve."""

    if setup.bundle.board_id != facts.board_id:
        issues.error("unknown-board", "/bundle/board_id", f"This project's board is {facts.board_id!r}.")
    rail_nets: dict[str, str] = {}
    for position, rail in enumerate(setup.rails):
        path = f"/rails/{position}/net"
        if not _board(rail.net, facts, path, issues):
            continue
        net = split_ref(rail.net)[1]
        if net not in facts.nets:
            issues.error("unknown-net", path, f"{rail.net} is not a net on the board.", rail.net)
            continue
        rail_nets[rail.id] = net
    for ref in setup.components:
        path = f"/components/{_escape(ref)}"
        if _board(ref, facts, path, issues) and split_ref(ref)[1] not in facts.components:
            issues.error("unknown-component", path, f"{ref} is not a component on the board.", ref)
    for collection in ("sources", "loads", "converters"):
        for position, item in enumerate(getattr(setup, collection)):
            ref = item.component
            path = f"/{collection}/{position}/component"
            if ref and _board(ref, facts, path, issues) and split_ref(ref)[1] not in facts.components:
                issues.error("unknown-component", path, f"{ref} is not a component on the board.", ref)
    for ref in setup.materials.slices:
        _board(ref, facts, f"/materials/slices/{_escape(ref)}", issues)
    return rail_nets


def _escape(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def _terminal_nets(setup: SimSetup, facts: BoardFacts, issues: _Issues) -> dict[str, tuple[set[str], set[str]]]:
    """terminal id -> (nets of positive pads, nets of reference pads)."""

    nets: dict[str, tuple[set[str], set[str]]] = {}
    for position, terminal in enumerate(setup.terminals):
        positive: set[str] = set()
        reference: set[str] = set()
        for side, target in (("positive", positive), ("reference", reference)):
            for index, ref in enumerate(getattr(terminal, side)):
                net = _pin_net(ref, facts, f"/terminals/{position}/{side}/{index}", issues)
                if net:
                    target.add(net)
        if len(reference) > 1:
            issues.warning("mixed-reference-nets", f"/terminals/{position}/reference",
                           f"Terminal {terminal.id!r} has reference pads on several nets: {', '.join(sorted(reference))}.")
        if positive & reference:
            issues.error("reference-on-positive-net", f"/terminals/{position}/reference",
                         f"Terminal {terminal.id!r} has reference pads on its own positive net.")
        nets[terminal.id] = (positive, reference)
    return nets


def _on_rail(kind: str, owner: str, path: str, terminal: str, rail: str,
             terminals: dict[str, tuple[set[str], set[str]]], rail_nets: dict[str, str],
             setup: SimSetup, issues: _Issues) -> None:
    rail_ids = {item.id for item in setup.rails}
    if terminal not in terminals and terminal not in {item.id for item in setup.terminals}:
        issues.error("unknown-terminal", f"{path}/terminal" if kind != "input" else f"{path}/input_terminal",
                     f"{owner} refers to terminal {terminal!r}, which is not defined.")
        return
    if rail not in rail_ids:
        issues.error("unknown-rail", f"{path}/rail" if kind != "input" else f"{path}/input_rail",
                     f"{owner} refers to rail {rail!r}, which is not defined.")
        return
    net = rail_nets.get(rail)
    positive = terminals.get(terminal, (set(), set()))[0]
    stray = sorted(positive - {net}) if net else []
    if stray:
        issues.error("terminal-not-on-rail", f"{path}",
                     f"{owner}: terminal {terminal!r} has positive pads on {', '.join(stray)}, not on rail {rail!r} ({net}).")


def validate(setup: SimSetup, facts: BoardFacts) -> list[SetupIssue]:
    issues = _Issues()
    _duplicate_ids(setup, issues)
    rail_nets = _check_references(setup, facts, issues)
    terminals = _terminal_nets(setup, facts, issues)
    for collection in ("sources", "loads"):
        for position, item in enumerate(getattr(setup, collection)):
            _on_rail(collection, f"{collection[:-1].capitalize()} {item.id!r}", f"/{collection}/{position}",
                     item.terminal, item.rail, terminals, rail_nets, setup, issues)
    for position, source in enumerate(setup.sources):
        if source.sense_terminal and source.sense_terminal not in terminals:
            issues.error("unknown-terminal", f"/sources/{position}/sense_terminal",
                         f"Source {source.id!r} senses at {source.sense_terminal!r}, which is not defined.")
    source_ids = {source.id for source in setup.sources}
    for position, converter in enumerate(setup.converters):
        if (converter.kind or "switching") == "switching" and converter.efficiency is None:
            issues.error("missing-efficiency", f"/converters/{position}/efficiency",
                         f"Switching converter {converter.id!r} needs its efficiency.")
        if converter.output_source not in source_ids:
            issues.error("unknown-source", f"/converters/{position}/output_source",
                         f"Converter {converter.id!r} outputs through {converter.output_source!r}, which is not a source.")
        _on_rail("input", f"Converter {converter.id!r}", f"/converters/{position}",
                 converter.input_terminal, converter.input_rail, terminals, rail_nets, setup, issues)
    for position, probe in enumerate(setup.probes):
        if probe.terminal not in terminals:
            issues.error("unknown-terminal", f"/probes/{position}/terminal",
                         f"Probe {probe.id!r} refers to terminal {probe.terminal!r}, which is not defined.")
    _check_analyses(setup, issues)
    return issues.items


def _check_analyses(setup: SimSetup, issues: _Issues) -> None:
    rail_ids = {rail.id for rail in setup.rails}
    for position, analysis in enumerate(setup.analyses):
        path = f"/analyses/{position}"
        if not analysis.rails:
            issues.error("analysis-without-rails", f"{path}/rails", f"Analysis {analysis.id!r} solves no rails yet; pick at least one.")
        for index, rail in enumerate(analysis.rails):
            if rail not in rail_ids:
                issues.error("unknown-rail", f"{path}/rails/{index}", f"Analysis {analysis.id!r} solves rail {rail!r}, which is not defined.")
        mesh = analysis.settings.mesh if analysis.settings else None
        if mesh and mesh.min_element_um and mesh.max_element_um and mesh.min_element_um > mesh.max_element_um:
            issues.error("mesh-size-order", f"{path}/settings/mesh", "min_element_um is larger than max_element_um.")


def preflight(setup: SimSetup, facts: BoardFacts) -> list[SetupIssue]:
    """``validate``, then whether each solved rail is a complete power tree."""

    issues = _Issues()
    issues.items.extend(validate(setup, facts))
    for position, analysis in enumerate(setup.analyses):
        _power_tree(setup, analysis.id, analysis.rails, f"/analyses/{position}", issues)
    issues.warning("connectivity-not-checked", "/analyses",
                   "Copper connectivity from loads to sources is checked when the engine meshes the board; "
                   "this preflight checks nets and the power tree only.")
    return issues.items


def _power_tree(setup: SimSetup, analysis_id: str, rails: Iterable[str], path: str, issues: _Issues) -> None:
    solved = set(rails)
    for rail in sorted(solved):
        sources = [source for source in setup.sources if source.rail == rail]
        # A converter fed from the rail draws from it like a load.
        loads = [load for load in setup.loads if load.rail == rail] + [
            converter for converter in setup.converters if converter.input_rail == rail
        ]
        if not sources:
            issues.error("rail-without-source", path, f"{analysis_id}: rail {rail!r} has no source.")
        if not loads:
            issues.warning("rail-without-load", path, f"{analysis_id}: rail {rail!r} has no load, so no current flows on it.")
        if len(sources) > 1:
            issues.warning("parallel-sources", path, f"{analysis_id}: rail {rail!r} has {len(sources)} sources; they share the load by copper resistance alone.")
    by_output = {converter.output_source: converter for converter in setup.converters}
    for source in setup.sources:
        converter = by_output.get(source.id)
        if source.rail in solved and converter and converter.input_rail not in solved:
            issues.warning("converter-input-not-solved", path,
                           f"{analysis_id}: converter {converter.id!r} feeds {source.rail!r} from {converter.input_rail!r}, "
                           f"which this analysis does not solve; its input current is not modelled.")


def report(stage: str, setup_sha256: str, items: list[SetupIssue]) -> dict[str, Any]:
    return {
        "schema": "prism.sim.setup-report",
        "version": "a0",
        "stage": stage,
        "setup_sha256": setup_sha256,
        "ok": not any(item.severity == "error" for item in items),
        "issues": [item.model_dump(mode="json", exclude_none=True) for item in items],
    }
