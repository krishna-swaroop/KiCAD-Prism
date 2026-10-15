"""Infer a board's power tree from its netlist: rails, sources, converters, loads.

Everything here is a proposal for the setup canvas. It reads names and the
schematic symbols' pin electrical types, never datasheets, so currents and
efficiencies stay unset for the user to fill in (validation flags them).

- Rails: nets whose name states a voltage (``drafting.rail_voltage``).
- Converters: a part whose output pin (``power_out``, or named SW/LX/PHASE/
  OUT/... on a regulator or on a pin not typed as a logic signal) lands on a
  rail directly (linear) or through a two-pad inductor (switching). Its input
  is the rail on its VIN/IN pins, else its highest other rail.
- Sources: a connector on a rail that no converter feeds, else a converter
  with no input rail (a PoE or isolated module fed off-rail).
- Supplies whose name states no voltage are noted for the user to add.
- Loads: parts with ``power_in`` pins on a rail, and connectors on fed rails.
  A rail filtered through a ferrite or inductor into a sub-net is lumped as
  one load on the parent rail at the filter's pad until series elements are
  modelled.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.sim_studio.board_facts import BoardFacts
from app.sim_studio.drafting import _CONTROL, _GROUND, _SIGNAL, _slug, rail_voltage

_PREFIX = re.compile(r"^[A-Za-z]+")
_PASSIVE = frozenset({"R", "C", "L", "FB", "D", "LED", "TP", "H", "MH", "FID", "JP", "F", "Y", "NT", "SW", "RN", "RV"})
_CONNECTOR = frozenset({"J", "P", "CN", "CON", "X"})
_SERIES = frozenset({"L", "FB"})
_OUTPUT_PIN = re.compile(
    r"^(?:P?SW\d*|SW_\w+|LX\d*|LX_\w+|PH\d*|PHASE\w*|V?OUT[_\d]*|VO|VO_\w+|REG_?OUT|.*_SW|.*_RG|VREG\w*|(?:HV)?LDO\d*)$",
    re.IGNORECASE,
)
# Logic outputs are named OUT too; a name alone makes one a supply output only on a regulator.
_SIGNAL_PIN_TYPES = frozenset({"INPUT", "OUTPUT", "BIDIRECTIONAL", "TRI_STATE", "OPEN_COLLECTOR", "OPEN_EMITTER"})
_INPUT_PIN = re.compile(r"^(?:P?VIN\w*|AVIN|IN[_\d]*|\w*_IN|VCC_?IN|VSUP\w*|VBAT|VS)$", re.IGNORECASE)
_ZERO_OHM = re.compile(r"^0(?:R|E|Ω|\s*ohms?)?(?:$|[_\s@])", re.IGNORECASE)
_REGULATOR = re.compile(r"regulator|buck|boost|step[- ]?(?:down|up)|ldo|dc[- ]?dc|converter|pmic", re.IGNORECASE)
_BATTERY = frozenset({"BT", "BAT"})
_CLAMP = re.compile(r"zener|tvs|esd|clamp", re.IGNORECASE)


def _auto_named(net: str) -> bool:
    return net.rsplit("/", 1)[-1].startswith("Net-(")


@dataclass
class Draft:
    rails: list[dict[str, Any]] = field(default_factory=list)
    terminals: list[dict[str, Any]] = field(default_factory=list)
    sources: list[dict[str, Any]] = field(default_factory=list)
    loads: list[dict[str, Any]] = field(default_factory=list)
    converters: list[dict[str, Any]] = field(default_factory=list)
    analysis_rails: list[str] = field(default_factory=list)
    notes: list[dict[str, Any]] = field(default_factory=list)

    def document(self) -> dict[str, Any]:
        return {
            "rails": self.rails, "terminals": self.terminals, "sources": self.sources,
            "loads": self.loads, "converters": self.converters,
            "analysis_rails": self.analysis_rails, "notes": self.notes,
        }


@dataclass(frozen=True)
class _Pin:
    pad: str
    name: str
    type: str
    net: str


def _prefix(ref: str) -> str:
    match = _PREFIX.match(ref)
    return match.group(0).upper() if match else ""


def _is_connector(ref: str, part: dict[str, str]) -> bool:
    library = part.get("library_ref", "")
    if _prefix(ref) == "TP" or "testpoint" in library.lower().replace("_", ""):
        return False
    if "connector" in library.lower():
        return True
    # "X" is a connector in some libraries and an oscillator in others.
    # "J" refdes variants ("JFBP1", "JTAG1") are connectors too; "JP" is a jumper.
    prefix = _prefix(ref)
    if prefix.startswith("J") and not prefix.startswith("JP"):
        return True
    return prefix in _CONNECTOR and not (_prefix(ref) == "X" and "osc" in (library + part.get("description", "")).lower())


def _is_passive(ref: str) -> bool:
    return _prefix(ref) in _PASSIVE


def _regulator(part: dict[str, str]) -> bool:
    return bool(_REGULATOR.search(" ".join((part.get("library_ref", ""), part.get("value", ""), part.get("description", "")))))


class _Board:
    def __init__(self, facts: BoardFacts) -> None:
        self.facts = facts
        self.pins: dict[str, list[_Pin]] = {}
        for key, net in sorted(facts.pad_nets.items()):
            ref, _, pad = key.partition(".")
            name, kind = facts.pins.get(key, ("", ""))
            self.pins.setdefault(ref, []).append(_Pin(pad, name, kind, net))
        self.grounds = {net for net in facts.nets if _GROUND.search(net.rsplit("/", 1)[-1])}
        #: The board's main return: the ground with the most pads.
        self.main_ground = max(sorted(self.grounds), key=lambda n: len(facts.net_pads.get(n, ())), default=None)

    def on(self, ref: str, net: str) -> list[str]:
        return [self.facts.pin_ref(ref, pin.pad) for pin in self.pins.get(ref, ()) if pin.net == net]

    def ground_pads(self, ref: str) -> list[str]:
        """``ref``'s return pads on one ground: the main one if it has a pin there, else its most used.

        Split grounds (GNDA, GND_CRYSTAL) join the main ground through a net tie, not copper, so a
        terminal spanning two would return current into an island the solve cannot reach.
        """

        pins = [pin for pin in self.pins.get(ref, ()) if pin.net in self.grounds]
        if not pins:
            return []
        counts = Counter(pin.net for pin in pins)
        pick = self.main_ground if self.main_ground in counts else max(sorted(counts), key=counts.__getitem__)
        return [self.facts.pin_ref(ref, pin.pad) for pin in pins if pin.net == pick]

    def components_on(self, net: str) -> list[str]:
        return sorted({key.partition(".")[0] for key in self.facts.net_pads.get(net, ())})

    def series_across(self, net: str, links: bool = False) -> list[tuple[str, str, str]]:
        """Two-pad inductors and ferrites touching ``net``: (ref, pad on net, other net).

        With ``links``, 0 ohm resistors count too.
        """

        found = []
        for ref in self.components_on(net):
            pins = self.pins.get(ref, [])
            series = _prefix(ref) in _SERIES or (
                links and _prefix(ref) == "R" and _ZERO_OHM.match(self.facts.parts.get(ref, {}).get("value", ""))
            )
            if series and len(pins) == 2 and pins[0].net != pins[1].net:
                here, there = (pins[0], pins[1]) if pins[0].net == net else (pins[1], pins[0])
                found.append((ref, here.pad, there.net))
        return found

    def reach(self, net: str, ref: str, depth: int = 3) -> list[str]:
        """Nets reached through series part ``ref`` from ``net``, on through unnamed passive-only nets (pi filters)."""

        pins = self.pins.get(ref, [])
        if len(pins) != 2:
            return []
        other = next((p.net for p in pins if p.net != net), "")
        if not other or other in self.grounds:
            return []
        if depth <= 1 or not _auto_named(other) or self.consumers(other):
            return [other]
        onward = [r for r, _, _ in self.series_across(other, links=True) if r != ref]
        return [other, *(n for r in onward for n in self.reach(other, r, depth - 1))]

    def signal_only(self, net: str) -> bool:
        """Every active part's pin on ``net`` is a logic signal (a level-shifted line named for its voltage)."""

        pins = [
            p for ref in self.components_on(net)
            if not _is_passive(ref) and not _is_connector(ref, part := self.facts.parts.get(ref, {})) and not _regulator(part)
            for p in self.pins.get(ref, ()) if p.net == net
        ]
        supply_named = any(_INPUT_PIN.match(p.name) or _OUTPUT_PIN.match(p.name) for p in pins)
        return bool(pins) and not supply_named and all(p.type in _SIGNAL_PIN_TYPES for p in pins)

    def diode_feeds(self, net: str) -> list[str]:
        """Diodes whose cathode is on ``net`` and anode on another live net (diode-OR inputs), not clamps."""

        found = []
        for ref in self.components_on(net):
            part = self.facts.parts.get(ref, {})
            pins = self.pins.get(ref, [])
            if _prefix(ref) != "D" or len(pins) != 2 or _CLAMP.search(part.get("library_ref", "") + " " + part.get("value", "")):
                continue
            here = next((p for p in pins if p.net == net), None)
            there = next((p for p in pins if p.net != net), None)
            if here and there and there.net and there.net not in self.grounds and here.name.upper() in {"K", "CATHODE", "C"}:
                found.append(ref)
        return found

    def consumers(self, net: str) -> list[str]:
        return [
            ref for ref in self.components_on(net)
            if not _is_passive(ref) and any(p.net == net and p.type == "POWER_IN" for p in self.pins.get(ref, ()))
        ]


def infer(facts: BoardFacts) -> Draft:
    board = _Board(facts)
    draft = Draft()
    named = _named_rails(board)

    converters, orphans = _converters(board, named, draft)
    fed = {conv["output_net"] for conv in converters}
    filtered = _filtered_rails(board, named, fed | set(orphans))
    # Ids are unique within each collection, as the setup contract requires.
    taken_rails: set[str] = set()
    taken_sources: set[str] = set()
    taken_converters: set[str] = set()
    taken_loads: set[str] = set()
    rail_id = {net: _slug(net.rsplit("/", 1)[-1].lstrip("+"), taken_rails) for net in sorted(named)}
    terminal_ids: set[str] = set()

    def terminal(name: str, positive: list[str], reference: list[str]) -> str:
        tid = _slug(name, terminal_ids)
        draft.terminals.append({"id": tid, "positive": positive, "reference": reference})
        return tid

    for net in sorted(named, key=lambda n: (-named[n], n)):
        if net in filtered:
            continue
        draft.rails.append({"id": rail_id[net], "net": facts.net_ref(net), "voltage_v": named[net], "inferred": True})

    sourced: set[str] = set()
    for net in sorted(named, key=lambda n: (-named[n], n)):
        if net in fed or net in filtered:
            continue
        connectors = [ref for ref in board.components_on(net) if _is_connector(ref, facts.parts.get(ref, {}))]
        if not connectors and net in orphans:
            # A module fed off-rail (PoE, isolated): its output is where the rail starts.
            ref, (pad_ref, pads) = orphans[net]
            tid = terminal(f"{ref}-{rail_id[net]}-out", [facts.pin_ref(pad_ref, pad) for pad in pads], board.ground_pads(ref))
            draft.sources.append({"id": _slug(f"{ref}-{rail_id[net]}", taken_sources), "rail": rail_id[net], "terminal": tid,
                                  "component": f"{facts.board_id}:{ref}"})
            draft.notes.append(_note("converter-as-source", f"{ref} feeds {net} from no rail on the board; it is the rail's source.",
                                     [facts.net_ref(net), f"{facts.board_id}:{ref}"]))
            sourced.add(net)
            continue
        diodes = [] if connectors else board.diode_feeds(net)
        if diodes:
            # Diode-OR: current enters the rail at the cathodes.
            pads = [pad for ref in diodes for pad in board.on(ref, net)]
            tid = terminal(f"{diodes[0]}-{rail_id[net]}-in", pads, [])
            draft.sources.append({"id": _slug(f"{diodes[0]}-{rail_id[net]}", taken_sources), "rail": rail_id[net],
                                  "terminal": tid, "component": f"{facts.board_id}:{diodes[0]}"})
            draft.notes.append(_note("diode-or-source", f"{net} is fed through {', '.join(diodes)}; the source is at their cathodes.",
                                     [facts.net_ref(net), *(f"{facts.board_id}:{ref}" for ref in diodes)]))
            sourced.add(net)
            continue
        if not connectors:
            if board.consumers(net):
                draft.notes.append(_note("rail-without-source", f"{net} has loads but no converter or connector feeds it.", [facts.net_ref(net)]))
            continue
        ref = connectors[0]
        tid = terminal(f"{ref}-{rail_id[net]}-in", board.on(ref, net), board.ground_pads(ref))
        draft.sources.append({"id": _slug(f"{ref}-{rail_id[net]}", taken_sources), "rail": rail_id[net], "terminal": tid,
                              "component": f"{facts.board_id}:{ref}"})
        sourced.add(net)

    by_component: dict[str, list[dict[str, Any]]] = {}
    for conv in converters:
        ref, out_net, in_net = conv["ref"], conv["output_net"], conv["input_net"]
        out_rail, in_rail = rail_id[out_net], rail_id[in_net]
        cid = _slug(f"{ref}-{out_rail}", taken_converters)
        out_ref, out_pads = conv["output_pads"]
        out_tid = terminal(f"{cid}-out", [facts.pin_ref(out_ref, pad) for pad in out_pads], board.ground_pads(ref))
        source_id = _slug(f"{cid}-out", taken_sources)
        draft.sources.append({"id": source_id, "rail": out_rail, "terminal": out_tid, "component": f"{facts.board_id}:{ref}"})
        in_tid = terminal(f"{cid}-in", board.on(ref, in_net), board.ground_pads(ref))
        entry = {"id": cid, "component": f"{facts.board_id}:{ref}", "input_rail": in_rail,
                 "input_terminal": in_tid, "output_source": source_id, "kind": conv["kind"]}
        if conv["kind"] == "linear":
            entry["quiescent_current_a"] = 0.0
        draft.converters.append(entry)
        by_component.setdefault(ref, []).append(conv)
        sourced.add(out_net)

    for net in sorted(named, key=lambda n: (-named[n], n)):
        if net not in sourced:
            continue
        for ref in board.components_on(net):
            part = facts.parts.get(ref, {})
            mine = by_component.get(ref, [])
            if mine and _regulator(part):
                continue
            pins = [p for p in board.pins.get(ref, ()) if p.net == net]
            if any(c["output_net"] == net for c in mine):
                # A chip's own regulator feeding its other supply pins.
                pins = [p for p in pins if p.type == "POWER_IN" and not _OUTPUT_PIN.match(p.name)]
                if not pins:
                    continue
            connector = _is_connector(ref, part)
            if net not in fed and connector:
                continue
            if _prefix(ref) in _SERIES or (_prefix(ref) == "R" and _ZERO_OHM.match(part.get("value", ""))):
                _filtered_branch(board, draft, net, ref, rail_id[net], taken_loads, terminal)
                continue
            if _is_passive(ref) or not (connector or any(p.type == "POWER_IN" for p in pins)):
                continue
            lid = _slug(f"{ref}-{rail_id[net]}", taken_loads)
            pads = [facts.pin_ref(ref, p.pad) for p in pins] if mine else board.on(ref, net)
            tid = terminal(f"{lid}-t", pads, board.ground_pads(ref))
            draft.loads.append({"id": lid, "rail": rail_id[net], "terminal": tid, "current_a": 0.0,
                                "distribution": "uniform", "component": f"{facts.board_id}:{ref}"})

    for net in _unnamed_supplies(board, named):
        feeds = [ref for ref in board.components_on(net)
                 if _is_connector(ref, facts.parts.get(ref, {})) or any(p.net == net and p.type == "POWER_OUT" for p in board.pins.get(ref, ()))]
        draft.notes.append(_note(
            "rail-voltage-unknown",
            f"{_leaf(net)} looks like a supply (fed by {', '.join(feeds)}; powers {', '.join(board.consumers(net)[:4])}) "
            "but its name states no voltage; add it as a rail and set the voltage.",
            [facts.net_ref(net)],
        ))

    for conv in converters:
        if conv["input_net"] not in sourced:
            draft.notes.append(_note(
                "converter-input-unsourced",
                f"{conv['ref']} draws from {conv['input_net']}, which nothing feeds yet.",
                [facts.net_ref(conv["input_net"]), f"{facts.board_id}:{conv['ref']}"],
            ))
    seen: set[tuple[str, ...]] = set()
    draft.notes = [n for n in draft.notes if not ((key := (n["code"], *n["refs"])) in seen or seen.add(key))]
    draft.analysis_rails = [rail_id[net] for net in sorted(named, key=lambda n: (-named[n], n)) if net in sourced]
    return draft


def _named_rails(board: _Board) -> dict[str, float]:
    """Nets whose name states a voltage, on two or more pads, that are not logic lines."""

    facts = board.facts
    return {
        net: volts for net in facts.nets
        if (volts := rail_voltage(net)) is not None and len(facts.net_pads.get(net, ())) >= 2 and not board.signal_only(net)
    }


def _filtered_rails(board: _Board, named: dict[str, float], fed: set[str]) -> set[str]:
    """Named nets fed only through a ferrite or inductor from a rail with another feed."""

    def feedable(net: str) -> bool:
        return net in fed or any(_is_connector(r, board.facts.parts.get(r, {})) for r in board.components_on(net))

    parents = {net for net in named if feedable(net)}
    filtered: set[str] = set()
    changed = True
    while changed:
        changed = False
        for net in sorted(set(named) - parents - filtered):
            reached = {other for ref, _, _ in board.series_across(net, links=True) for other in board.reach(net, ref)}
            if reached & (parents | filtered):
                filtered.add(net)
                changed = True
    return filtered


def _filtered_branch(board: _Board, draft: Draft, net: str, ref: str, rail: str, taken: set[str], terminal) -> None:
    reached = board.reach(net, ref)
    if not reached:
        return
    other = next((n for n in reached if board.consumers(n)), reached[0])
    downstream = sorted({r for n in reached for r in board.consumers(n) if r != ref})
    if not downstream:
        return
    lid = _slug(f"{ref}-{rail}", taken)
    tid = terminal(f"{lid}-t", board.on(ref, net), [])
    draft.loads.append({"id": lid, "rail": rail, "terminal": tid, "current_a": 0.0,
                        "distribution": "uniform", "component": f"{board.facts.board_id}:{ref}"})
    draft.notes.append(_note(
        "filtered-branch",
        f"{ref} feeds {other.rsplit('/', 1)[-1]} ({', '.join(downstream)}); it is one load on the parent rail.",
        [board.facts.net_ref(other), *(f"{board.facts.board_id}:{r}" for r in downstream)],
    ))


def _supply_output(pin: _Pin, regulator: bool) -> bool:
    if pin.type == "POWER_OUT":
        return True
    return bool(_OUTPUT_PIN.match(pin.name)) and (regulator or pin.type not in _SIGNAL_PIN_TYPES)


def _converters(
    board: _Board, named: dict[str, float], draft: Draft,
) -> tuple[list[dict[str, Any]], dict[str, tuple[str, tuple[str, list[str]]]]]:
    """Converters with an input rail, and outputs of those without one (net -> (ref, output pads))."""

    found: list[dict[str, Any]] = []
    orphans: dict[str, tuple[str, tuple[str, list[str]]]] = {}
    for ref in sorted(board.pins):
        part = board.facts.parts.get(ref, {})
        if _is_passive(ref) or _is_connector(ref, part):
            continue
        pins = board.pins[ref]
        regulator = _regulator(part)
        outputs: dict[str, tuple[str, tuple[str, list[str]]]] = {}
        for pin in pins:
            if pin.net in board.grounds or not _supply_output(pin, regulator):
                continue
            if pin.net in named:
                outputs.setdefault(pin.net, ("linear", (ref, [p.pad for p in pins if p.net == pin.net])))
                continue
            for series, _, beyond in board.series_across(pin.net):
                if beyond in named:
                    pad = next(p.pad for p in board.pins[series] if p.net == beyond)
                    outputs.setdefault(beyond, ("switching", (series, [pad])))
        for out_net, (kind, output_pads) in outputs.items():
            input_net = _input_rail(pins, out_net, named, board.grounds)
            if input_net is None:
                orphans.setdefault(out_net, (ref, output_pads))
                continue
            found.append({"ref": ref, "output_net": out_net, "input_net": input_net, "kind": kind, "output_pads": output_pads})
    return found, orphans


def _input_rail(pins: Iterable[_Pin], out_net: str, named: dict[str, float], grounds: set[str]) -> str | None:
    candidates = [p for p in pins if p.net in named and p.net != out_net and p.net not in grounds]
    preferred = {p.net for p in candidates if _INPUT_PIN.match(p.name)}
    pool = preferred or {p.net for p in candidates if named[p.net] > named[out_net]}
    return max(pool, key=lambda n: (named[n], n)) if pool else None


def _unnamed_supplies(board: _Board, named: dict[str, float]) -> list[str]:
    """Nets that a connector or a power output feeds and power inputs draw from, with no voltage in the name."""

    found = []
    for net in sorted(board.facts.nets):
        leaf = net.rsplit("/", 1)[-1]
        if (net in named or net in board.grounds or leaf.startswith(("Net-(", "unconnected-"))
                or _CONTROL.search(leaf) or _SIGNAL.search(leaf)):
            continue
        consumers = board.consumers(net)
        feeds = [
            ref for ref in board.components_on(net)
            if _is_connector(ref, board.facts.parts.get(ref, {}))
            or (not _is_passive(ref) and any(p.net == net and p.type == "POWER_OUT" for p in board.pins.get(ref, ())))
        ]
        if consumers and [ref for ref in feeds if ref not in consumers or len(consumers) > 1]:
            found.append(net)
    return found


def _note(code: str, message: str, refs: list[str]) -> dict[str, Any]:
    return {"severity": "warning", "code": code, "message": message, "refs": refs}


def candidates(facts: BoardFacts) -> dict[str, list[dict[str, Any]]]:
    """What the canvas offers for each kind of element, best first, with why.

    The same rules ``infer`` uses, kept as lists for a person to pick from:

    - rails: power nets: a voltage in the name, a ``power_in``/``power_out``
      pin on them, or fed through a ferrite, inductor or 0 ohm from a rail.
      Ground, control nets (SW, FB, EN...) and switch nodes are left out.
    - converters: parts whose output reaches a rail (as ``infer`` finds
      them), then regulator-like parts whose rails could not be told.
    - sources: connectors and batteries on a rail, those on rails no
      converter feeds first.
    - loads: a (part, rail) pair per rail a non-passive part has power pads
      on, ``power_in`` pads first; a converter's own output is not a load.

    References and nets are plain (``U3``, ``+3V3``), as the board index has them.
    """

    board = _Board(facts)
    named = _named_rails(board)
    found, _ = _converters(board, named, Draft())
    switch_nodes = {
        pin.net
        for conv in found if conv["kind"] == "switching"
        for pin in board.pins.get(conv["ref"], ()) if pin.type == "POWER_OUT" or _OUTPUT_PIN.match(pin.name)
    } - set(named)
    fed_by: dict[str, list[str]] = {}
    for conv in found:
        fed_by.setdefault(conv["output_net"], []).append(conv["ref"])

    def usable(net: str) -> bool:
        leaf = net.rsplit("/", 1)[-1]
        return (bool(net) and net not in board.grounds and not _CONTROL.search(leaf) and not _SIGNAL.search(leaf)
                and net not in switch_nodes)

    rails: dict[str, dict[str, Any]] = {}
    for net in named:
        rails[net] = {"net": net, "voltage_v": named[net], "reason": "Voltage in the net name"}
    for ref, pins in board.pins.items():
        if _is_passive(ref):
            continue
        for pin in pins:
            if usable(pin.net) and pin.net not in rails and pin.type in ("POWER_IN", "POWER_OUT"):
                kind = "power output" if pin.type == "POWER_OUT" else "power input"
                rails[pin.net] = {"net": pin.net, "voltage_v": None, "reason": f"{ref}.{pin.name or pin.pad} is a {kind}"}
    for net in list(named):
        for ref, _, beyond in board.series_across(net, links=True):
            if usable(beyond) and beyond not in rails and beyond not in board.grounds:
                rails[beyond] = {"net": beyond, "voltage_v": None, "reason": f"Fed from {_leaf(net)} through {ref}"}
    for net, rail in rails.items():
        rail["pads"] = len(facts.net_pads.get(net, ()))
        rail["fed_by"] = fed_by.get(net, [])
        if rail["fed_by"]:
            rail["reason"] = f"{rail['reason']}; fed by {', '.join(rail['fed_by'])}"
        links = [f"{_leaf(other)} through {ref}" for ref, _, other in board.series_across(net, links=True) if other in rails]
        if links and not rail["reason"].startswith("Fed from"):
            rail["reason"] = f"{rail['reason']}; linked to {', '.join(links)}"
    rail_list = sorted(rails.values(), key=lambda r: (r["voltage_v"] is None, -(r["voltage_v"] or 0), -r["pads"], r["net"]))

    def part_row(ref: str) -> dict[str, Any]:
        part = facts.parts.get(ref, {})
        return {"component": ref, "value": part.get("value", ""), "library_ref": part.get("library_ref", "")}

    converters = [
        {**part_row(conv["ref"]), "input_net": conv["input_net"], "output_net": conv["output_net"], "kind": conv["kind"],
         "reason": f"{'Through an inductor to' if conv['kind'] == 'switching' else 'Output pin on'} {_leaf(conv['output_net'])}"}
        for conv in found
    ]
    known = {conv["ref"] for conv in found}
    for ref in sorted(board.pins):
        part = facts.parts.get(ref, {})
        if ref in known or _is_passive(ref) or _is_connector(ref, part):
            continue
        outputs = [p for p in board.pins[ref] if p.net not in board.grounds and (p.type == "POWER_OUT" or _OUTPUT_PIN.match(p.name))]
        # A pin named OUT alone is an oscillator's or a driver's: only a power output on a rail counts.
        if not (_regulator(part) or any(p.type == "POWER_OUT" and p.net in rails for p in outputs)):
            continue
        ins = sorted({p.net for p in board.pins[ref] if p.net in rails and _INPUT_PIN.match(p.name)})
        outs = sorted({p.net for p in outputs if p.net in rails})
        converters.append({**part_row(ref), "input_net": ins[0] if len(ins) == 1 else None,
                           "output_net": outs[0] if len(outs) == 1 else None, "kind": None,
                           "reason": "Regulator in its symbol" if _regulator(part) else "Has a power output pin"})

    sources = []
    for ref in sorted(board.pins):
        part = facts.parts.get(ref, {})
        if not (_is_connector(ref, part) or _prefix(ref) in _BATTERY):
            continue
        for net in sorted({p.net for p in board.pins[ref] if p.net in rails}):
            fed = bool(fed_by.get(net))
            sources.append({**part_row(ref), "net": net, "pads": len(board.on(ref, net)), "fed": fed,
                            "reason": f"On {_leaf(net)}, fed by {', '.join(fed_by[net])}" if fed else f"Feeds {_leaf(net)}; no converter does"})
    sources.sort(key=lambda s: (s["fed"], -s["pads"], s["component"]))

    # A converter's input is the converter's own draw, and a source's rail is fed, not drawn from.
    drawn_by_converter = {(conv["ref"], conv["input_net"]) for conv in found}
    supplied = {(row["component"], row["net"]) for row in sources if not row["fed"]}
    loads = []
    for net in rails:
        for ref in board.components_on(net):
            part = facts.parts.get(ref, {})
            if _is_passive(ref) or (ref, net) in drawn_by_converter or (ref, net) in supplied:
                continue
            pins = [p for p in board.pins.get(ref, ()) if p.net == net]
            if ref in fed_by.get(net, []):
                # A converter's own output: only its separate supply pins draw from it.
                pins = [p for p in pins if p.type == "POWER_IN" and not _OUTPUT_PIN.match(p.name)]
            if not pins:
                continue
            powered = sum(1 for p in pins if p.type == "POWER_IN")
            connector = _is_connector(ref, part)
            loads.append({**part_row(ref), "net": net, "pads": len(pins), "power_in": powered, "connector": connector,
                          "reason": f"{powered} power-input pad{'s' if powered != 1 else ''} on {_leaf(net)}" if powered
                          else f"{len(pins)} pad{'s' if len(pins) != 1 else ''} on {_leaf(net)}"})
    loads.sort(key=lambda l: (l["connector"], -l["power_in"], -l["pads"], l["component"], l["net"]))
    return {"rails": rail_list, "converters": converters, "sources": sources, "loads": loads}


def _leaf(net: str) -> str:
    return net.rsplit("/", 1)[-1]
