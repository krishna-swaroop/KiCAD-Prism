"""What a setup may refer to on a board: components, pads and their nets.

Built from the project's semantic index (``semantic_index_service``), which is
cached per source revision and works for any commit. Version 1 setups name one
board, ``main``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

BOARD_ID = "main"


@dataclass(frozen=True)
class BoardFacts:
    board_id: str
    #: "REF.PAD" -> net name ("" when the pad has no net)
    pad_nets: dict[str, str]
    components: frozenset[str]
    nets: frozenset[str]
    #: net name -> sorted "REF.PAD" keys on it
    net_pads: dict[str, tuple[str, ...]] = field(default_factory=dict)
    #: "REF.PAD" -> (pin name, electrical type), from the schematic symbol
    pins: dict[str, tuple[str, str]] = field(default_factory=dict)
    #: refdes -> {"value", "library_ref", "description"}
    parts: dict[str, dict[str, str]] = field(default_factory=dict)

    def pin_ref(self, refdes: str, pad: str) -> str:
        return f"{self.board_id}:{refdes}.{pad}"

    def net_ref(self, net: str) -> str:
        return f"{self.board_id}:{net}"


def from_semantic_index(index: dict[str, Any], board_id: str = BOARD_ID) -> BoardFacts:
    pad_nets: dict[str, str] = {}
    net_pads: dict[str, list[str]] = {}
    pins: dict[str, tuple[str, str]] = {}
    for terminal in index.get("terminals") or ():
        reference = str(terminal.get("reference") or "")
        pin = str(terminal.get("pin") or "")
        if not reference or not pin or not terminal.get("pcbPadUuid"):
            continue
        net = str(terminal.get("netName") or "")
        key = f"{reference}.{pin}"
        pad_nets[key] = net
        pins[key] = (str(terminal.get("pinName") or ""), str(terminal.get("pinType") or "").upper())
        if net:
            net_pads.setdefault(net, []).append(key)
    components = frozenset(
        str(component.get("reference"))
        for component in index.get("components") or ()
        if component.get("reference") and component.get("pcbRefs")
    )
    nets = frozenset(str(net.get("name")) for net in index.get("nets") or () if net.get("name"))
    parts = {
        str(component.get("reference")): {
            "value": str(component.get("value") or ""),
            "library_ref": str(component.get("libraryRef") or ""),
            "description": str((component.get("fields") or {}).get("Description") or ""),
        }
        for component in index.get("components") or ()
        if component.get("reference") and component.get("pcbRefs")
    }
    return BoardFacts(
        board_id=board_id,
        pad_nets=pad_nets,
        components=components,
        nets=nets,
        net_pads={net: tuple(sorted(pads)) for net, pads in net_pads.items()},
        pins=pins,
        parts=parts,
    )


def split_pin_ref(ref: str) -> tuple[str, str, str]:
    """``main:U1.5`` -> ("main", "U1", "5"). The pad may itself contain dots."""

    board, _, rest = ref.partition(":")
    refdes, _, pad = rest.partition(".")
    return board, refdes, pad


def split_ref(ref: str) -> tuple[str, str]:
    board, _, rest = ref.partition(":")
    return board, rest
