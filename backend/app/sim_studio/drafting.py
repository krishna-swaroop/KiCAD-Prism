"""The simulation catalog and the first draft of a setup for each kind."""

from __future__ import annotations

import re
from typing import Any

from app.sim_studio.board_facts import BoardFacts
from app.sim_studio.models import CatalogEntry

CATALOG: tuple[CatalogEntry, ...] = (
    CatalogEntry(
        kind="dc-drop",
        display_name="DC IR drop",
        summary="Voltage drop, current density and via currents across power nets, from sources to loads.",
        status="available",
    ),
    CatalogEntry(
        kind="ac-pdn",
        display_name="PDN impedance",
        summary="Impedance of each rail seen from its loads, against a target mask.",
        status="planned",
    ),
    CatalogEntry(
        kind="decoupling",
        display_name="Decoupling",
        summary="Which capacitors a rail needs, and where, to meet its target impedance.",
        status="planned",
    ),
    CatalogEntry(
        kind="thermal",
        display_name="Thermal with DC",
        summary="Board and component temperatures with copper heating from the DC solution.",
        status="planned",
    ),
)

AVAILABLE_KINDS = frozenset(entry.kind for entry in CATALOG if entry.status == "available")

# "+3V3", "3V3", "1V8_CORE", "VBUS_5V", "+12V", "P5V0", "3.3V". The integer
# part must start the name or follow a non-digit, and the volts marker must
# end the name or be followed by a separator.
_VOLTS = re.compile(r"(?:^|[^0-9.])(\d{1,2})(?:V(\d{1,3})|\.(\d{1,3})V|V)(?=$|[_\-/.])", re.IGNORECASE)
# "V3P3", "3P3V", "VDD_1P8": P as the decimal point, with an optional V on either side.
_VOLTS_P = re.compile(r"(?:^|[^0-9A-Z])V?(\d{1,2})P(\d{1,3})V?(?=$|[_\-/.])", re.IGNORECASE)
_GROUND = re.compile(r"^(?:A|D|P|S)?GND|^VSS|^0V$", re.IGNORECASE)
# Regulator control and switching nodes name the rail they serve but carry no
# load current: switch nodes, power-good, enables, feedback, sense, bootstrap.
_CONTROL = re.compile(r"^(?:LX|SW|PG|PGOOD|EN|FB|SENSE|SNS|BST|BOOT|SS|COMP|ILIM|VSEL)(?:[_\-]|$)", re.IGNORECASE)
# Signals that carry a rail's name: "P3V3_EN", "/power/P1V8_PG", "LED_DIN_5V".
_SIGNAL = re.compile(
    r"(?:^|[_\-])(?:EN|ENABLE|PG|PGOOD|PWRGD|POK|FB|SENSE|SNS|DIN|DOUT|DATA|SDA|SCL|RST|RESET|ALERT|IRQ|INT|CTRL)(?:[_\-]|$)",
    re.IGNORECASE,
)


def rail_voltage(net: str) -> float | None:
    """Supply voltage a net's name states, if it states exactly one."""

    leaf = net.rsplit("/", 1)[-1]
    if _GROUND.search(leaf) or _CONTROL.search(leaf) or _SIGNAL.search(leaf):
        return None
    # The P form wins: in "3P3V" the plain form also reads a stray "3V".
    found = {float(f"{whole}.{fraction}") for whole, fraction in _VOLTS_P.findall(leaf)} or {
        float(f"{whole}.{fraction or decimal or 0}")
        for whole, fraction, decimal in _VOLTS.findall(net)
    }
    if len(found) != 1:
        return None
    volts = found.pop()
    return volts if 0 < volts <= 60 else None


def _slug(text: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9._-]+", "-", text.lower()).strip("-._") or "rail"
    base = base[:72]
    slug, counter = base, 2
    while slug in taken:
        slug = f"{base}-{counter}"
        counter += 1
    taken.add(slug)
    return slug


def inferred_rails(facts: BoardFacts) -> list[dict[str, Any]]:
    """A rail for every net whose name states a voltage, that reaches two or more pads and is not a logic line."""

    # Imported here: power_tree builds on this module's name rules.
    from app.sim_studio.power_tree import _Board, _named_rails

    named = _named_rails(_Board(facts))
    taken: set[str] = set()
    rails = []
    for net in sorted(named):
        volts = named[net]
        rails.append({
            "id": _slug(net, taken),
            "net": facts.net_ref(net),
            "voltage_v": volts,
            "inferred": True,
        })
    return rails


def draft(kind: str, name: str, facts: BoardFacts) -> dict[str, Any]:
    """A first setup for ``kind``: everything Prism can propose, nothing it cannot."""

    if kind != "dc-drop":
        raise ValueError(f"No setup flow for {kind!r} yet")
    return {
        "schema": "prism.sim.setup",
        "version": "a0",
        "name": name,
        "bundle": {"board_id": facts.board_id},
        "materials": {"slices": {}},
        "components": {},
        "rails": inferred_rails(facts),
        "terminals": [],
        "sources": [],
        "loads": [],
        "converters": [],
        "probes": [],
        "analyses": [{"id": "dc", "kind": "dc-drop", "rails": []}],
    }
