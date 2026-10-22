"""Spike: classify a board's nets and parts for the power tree with a System One model.

``power_tree`` reads roles from names and pin types with regular expressions
(ground, control, regulator, connector, supply pins). This module asks a
System One decision model the same questions instead, one typed question per
net and per active part, and keeps the answer's calibrated confidence so the
setup canvas can propose the sure answers and ask about the rest.

It speaks the TypeSafe ``POST /v1/systemone`` wire format, so any compatible
server can answer: a local H2O-Lightning-4B (``tools/system-one-mlx``), Jev,
or another open model. Topology (inductors across switch nodes, filtered
sub-rails, ground pads) stays in ``power_tree``; only the roles move here.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Iterable

from app.sim_studio.board_facts import BoardFacts

DEFAULT_URL = os.environ.get("PRISM_SYSTEM_ONE_URL", "http://127.0.0.1:8741")

NET_ROLES = {
    "supply_rail": "Carries DC power that chips draw from: a supply rail, a regulator's output or input, a battery or "
                   "bus voltage, or a filtered sub-rail such as VDDA behind a ferrite.",
    "ground": "A ground, return or 0 V reference, analog or digital.",
    "switch_node": "A switching converter's switch node (SW, LX, phase) between its switch and its inductor.",
    "power_control": "A regulator's or power switch's feedback, enable, power-good, soft-start, bootstrap, "
                     "compensation, current-limit or sense net. It names a rail but carries no load current.",
    "signal": "A logic, data, clock, reset, interrupt, LED or analog signal line, even when its name states a voltage.",
}

PART_ROLES = {
    "switching_regulator": "A switching DC-DC converter (buck, boost, buck-boost, PMIC channel, PoE or isolated "
                           "module) that makes one rail from another.",
    "linear_regulator": "A linear regulator or LDO that makes one rail from another.",
    "power_switch": "A load switch, eFuse, hot-swap controller, ideal diode or power mux that passes a rail through "
                    "to another net without changing its voltage.",
    "power_input": "A connector, battery or power jack where supply power enters the board.",
    "load": "A chip, module or device that draws supply current from the board's rails.",
    "signal_connector": "A connector, header or test point that carries only signals, or that the board itself "
                        "powers, so power does not enter through it.",
    "other": "None of these: a passive network, a protection part, mechanical or a placeholder.",
}

#: Voltages a rail is offered when its name states none.
RAIL_VOLTAGES = ("0.75", "0.8", "0.85", "0.9", "1.0", "1.05", "1.1", "1.2", "1.35", "1.5", "1.8", "2.5", "2.8",
                 "3.0", "3.3", "3.6", "4.2", "5.0", "9.0", "12", "15", "19", "20", "24", "48", "unknown")

_PREFIX = re.compile(r"^[A-Za-z]+")
_PASSIVE = frozenset({"R", "C", "L", "FB", "D", "LED", "TP", "H", "MH", "FID", "JP", "F", "Y", "NT", "RN", "RV"})
#: How many pins a net record lists before it summarises the rest.
_NET_PIN_LIMIT = 24
_PART_PIN_LIMIT = 40


@dataclass(frozen=True)
class Decision:
    subject: str
    question: str
    answer: str
    confidence: float
    probabilities: dict[str, float]


def _prefix(ref: str) -> str:
    match = _PREFIX.match(ref)
    return match.group(0).upper() if match else ""


def _leaf(net: str) -> str:
    return net.rsplit("/", 1)[-1]


class _Index:
    def __init__(self, facts: BoardFacts) -> None:
        self.facts = facts
        self.pins: dict[str, list[tuple[str, str, str, str]]] = defaultdict(list)
        for key, net in sorted(facts.pad_nets.items()):
            ref, _, pad = key.partition(".")
            name, kind = facts.pins.get(key, ("", ""))
            self.pins[ref].append((pad, name, kind, net))

    def part_label(self, ref: str) -> str:
        part = self.facts.parts.get(ref, {})
        bits = [ref, part.get("value", "")]
        library = part.get("library_ref", "")
        if library and library.rsplit(":", 1)[-1] != part.get("value", ""):
            bits.append(f"[{library}]")
        return " ".join(b for b in bits if b)

    def other_net(self, ref: str, net: str) -> str | None:
        """A two-pad part's net on its other side."""

        pins = self.pins.get(ref, [])
        if len(pins) != 2:
            return None
        return next((p[3] for p in pins if p[3] != net), None)


def net_state(index: _Index, net: str) -> dict[str, Any]:
    """The record a net's question reads: its name, sheet-free, and what touches it."""

    facts = index.facts
    active: dict[str, int] = {}
    passive: dict[str, list[str]] = defaultdict(list)
    for key in facts.net_pads.get(net, ()):
        ref, _, pad = key.partition(".")
        name, kind = facts.pins.get(key, ("", ""))
        if _prefix(ref) in _PASSIVE:
            if ref in {r.split(" ", 1)[0] for r in passive[_prefix(ref)]}:
                continue
            value = facts.parts.get(ref, {}).get("value", "")
            other = index.other_net(ref, net)
            passive[_prefix(ref)].append(f"{ref} {value}" + (f" to {_leaf(other)}" if other else ""))
        else:
            pin = name if name and name != pad else f"pin {pad}"
            line = f"{index.part_label(ref)}: {pin} ({kind.lower() or 'unknown'})"
            active[line] = active.get(line, 0) + 1
    active = [line if n == 1 else f"{line} x{n}" for line, n in active.items()]
    state: dict[str, Any] = {"net": _leaf(net), "pads": len(facts.net_pads.get(net, ()))}
    if active:
        state["pins"] = active[:_NET_PIN_LIMIT] + ([f"... {len(active) - _NET_PIN_LIMIT} more"] if len(active) > _NET_PIN_LIMIT else [])
    for kind, rows in sorted(passive.items()):
        state[f"{kind} parts"] = rows[:6] + ([f"... {len(rows) - 6} more"] if len(rows) > 6 else [])
    return state


def part_state(index: _Index, ref: str) -> dict[str, Any]:
    """The record a part's question reads: what it is and where each of its pins goes."""

    part = index.facts.parts.get(ref, {})
    by_net: dict[str, list[str]] = defaultdict(list)
    for pad, name, kind, net in index.pins.get(ref, ()):
        by_net[net or "(no net)"].append(f"{name or pad} ({kind.lower() or 'unknown'})")
    pins = [f"{', '.join(names[:6])}{' ...' if len(names) > 6 else ''} -> {_leaf(net)}" for net, names in sorted(by_net.items())]
    state: dict[str, Any] = {"ref": ref, "value": part.get("value", ""), "library": part.get("library_ref", "")}
    for key in ("description", "sheet"):
        if part.get(key):
            state[key] = part[key]
    state["pins"] = pins[:_PART_PIN_LIMIT] + ([f"... {len(pins) - _PART_PIN_LIMIT} more nets"] if len(pins) > _PART_PIN_LIMIT else [])
    return state


def candidate_nets(facts: BoardFacts) -> list[str]:
    """Nets worth a question: two or more pads, one of them an active part's pin. Nets only passives touch are
    not rails or loads."""

    index = _Index(facts)
    return sorted({net for ref, pins in index.pins.items() if _prefix(ref) not in _PASSIVE for *_, net in pins
                   if net and len(facts.net_pads.get(net, ())) >= 2})


def candidate_parts(facts: BoardFacts) -> list[str]:
    return sorted(ref for ref in facts.components if _prefix(ref) not in _PASSIVE and ref in _Index(facts).pins)


class SystemOne:
    """A ``/v1/systemone`` client.

    ``url`` is a server base (``.../v1/systemone`` is appended) or a full endpoint ending in ``/systemone``.
    ``model`` goes in the body when a gateway serves several (OpenCode Zen: ``jev-1.13-free``); ``api_key``
    becomes a bearer token.
    """

    def __init__(self, url: str = DEFAULT_URL, timeout: float = 120.0, workers: int = 1,
                 model: str | None = None, api_key: str | None = None) -> None:
        url = url.rstrip("/")
        self.url = url if url.endswith("/systemone") else url + "/v1/systemone"
        self.timeout = timeout
        self.workers = workers
        self.model = model
        self.api_key = api_key

    def ask(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        payload: dict[str, Any] = {"state": state, "questions": questions}
        if self.model:
            payload["model"] = self.model
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(self.url, json.dumps(payload).encode(), headers)
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return json.load(response)["answers"]

    def many(self, items: Iterable[tuple[str, Any, dict[str, dict[str, Any]]]]) -> dict[str, dict[str, dict[str, Any]]]:
        items = list(items)
        with ThreadPoolExecutor(self.workers) as pool:
            answers = pool.map(lambda item: self.ask(item[1], item[2]), items)
            return {subject: answer for (subject, *_), answer in zip(items, answers)}


def _choice(instructions: str, criteria: dict[str, str]) -> dict[str, Any]:
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def _decision(subject: str, question: str, answer: dict[str, Any]) -> Decision:
    return Decision(subject, question, answer["choice"], float(answer["confidence"]),
                    {k: round(float(v), 4) for k, v in answer["probabilities"].items()})


def classify(facts: BoardFacts, client: SystemOne, nets: Iterable[str] | None = None,
             parts: Iterable[str] | None = None) -> dict[str, list[Decision]]:
    """Every candidate net's role and every active part's role, with confidences."""

    index = _Index(facts)
    nets = candidate_nets(facts) if nets is None else list(nets)
    parts = candidate_parts(facts) if parts is None else list(parts)
    net_q = {"role": _choice("This is one net of a PCB, with the pins and parts on it. What does the net carry?", NET_ROLES)}
    part_q = {"role": _choice("This is one part on a PCB, with the nets its pins connect to. What is its role in "
                              "the board's power tree?", PART_ROLES)}
    net_answers = client.many((net, net_state(index, net), net_q) for net in nets)
    part_answers = client.many((ref, part_state(index, ref), part_q) for ref in parts)
    return {
        "nets": [_decision(net, "role", net_answers[net]["role"]) for net in nets],
        "parts": [_decision(ref, "role", part_answers[ref]["role"]) for ref in parts],
    }


def rail_voltages(facts: BoardFacts, client: SystemOne, rails: Iterable[str]) -> list[Decision]:
    """A voltage for supply rails whose name states none, read from the parts that feed and draw from them."""

    index = _Index(facts)
    criteria = {v: ("Not determinable from the record" if v == "unknown" else f"{v} V") for v in RAIL_VOLTAGES}
    question = {"volts": _choice("This is a supply rail of a PCB, with the parts on it. What DC voltage is it?", criteria)}
    rails = list(rails)
    answers = client.many((net, net_state(index, net), question) for net in rails)
    return [_decision(net, "volts", answers[net]["volts"]) for net in rails]
