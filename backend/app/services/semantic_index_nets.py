"""Reconcile board net identity with the schematic netlist for the semantic index.

The index joins two views of one design: the schematic netlist (kicad-monkey's
connectivity compilation) and the board (KiCad's own net table, materialised
in pads and copper). The board is the authority on which nets exist and what
they are called; the netlist supplies the schematic side. When the two agree
every pad's schematic pin and board net carry the same name and nothing here
runs. When they disagree — a netlister that stops a bus member at a sheet
boundary, for example — the pads they share still identify the net, and this
module folds the netlist's records into the board's so the index stays one
record per net.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def _string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class SplitNetClaims:
    """The pads at which the board and the schematic netlist name a net differently.

    Fed one pad at a time during the board pass, then asked to reconcile the
    records once every board element has been indexed.
    """

    def __init__(self, schematic_nets_by_name: dict[str, Any]) -> None:
        self._schematic_names = set(schematic_nets_by_name)
        # board net name -> schematic net names whose pins sit on it, in
        # first-seen order.
        self.claims: dict[str, dict[str, None]] = {}

    def note_pad(self, board_name: str, schematic_name: str) -> None:
        """Record a pad whose board net is not a netlist net but whose pin is on one."""

        if board_name in self._schematic_names or schematic_name not in self._schematic_names:
            return
        self.claims.setdefault(board_name, {}).setdefault(schematic_name, None)

    def reconcile(
        self,
        nets: list[dict[str, Any]],
        terminals: list[dict[str, Any]],
        indexes: dict[str, dict[str, int]],
    ) -> dict[str, list[str]]:
        merged = reconcile_split_nets(nets, terminals, indexes, self.claims)
        if merged:
            logger.warning(
                "semantic index: folded %d schematic net(s) into %d board net(s) "
                "whose names the netlist did not produce (e.g. %s); the netlister "
                "and the board disagree on this design",
                sum(len(names) for names in merged.values()),
                len(merged),
                next(iter(merged)),
            )
        return merged


def reconcile_split_nets(
    nets: list[dict[str, Any]],
    terminals: list[dict[str, Any]],
    indexes: dict[str, dict[str, int]],
    claims: dict[str, dict[str, None]],
) -> dict[str, list[str]]:
    """Fold a board net and the schematic nets it is the same net as into one record.

    The schematic netlist and the board can disagree on a net's name: a bus
    member that crosses sheet pins is ``/MGMT.D0_P`` on the board while the
    netlist knows it as ``/Managment Port/MGMT.D0_P`` and, when it stops at
    the sheet boundary, ``/SOM/MGMT.D0_P`` too. Left alone that is three
    records: a board-only one holding the copper and pads, and schematic-only
    ones holding the wires, so a selection on either side never reaches the
    other.

    ``claims`` says which schematic nets have pins on which board net. Each
    board net that is claimed absorbs its claimants: the board's name is the
    net's name (it is KiCad's own netlist name, the one the board shows) and
    the schematic names become aliases; the schematic refs, sheets, class and
    pin terminals move over; every name resolves to the one record. A
    schematic net with pins on several board nets is left alone rather than
    guessed at.

    Returns the board names that absorbed something, each with the schematic
    names it took, so the caller can report that the netlister and the board
    disagreed: with a correct netlist this never fires.
    """

    merged: dict[str, list[str]] = {}
    if not claims:
        return merged
    index_by_name = {net["name"]: index for index, net in enumerate(nets)}
    boards_by_schematic: dict[str, set[str]] = {}
    for board_name, schematic_names in claims.items():
        for schematic_name in schematic_names:
            boards_by_schematic.setdefault(schematic_name, set()).add(board_name)

    absorbed: dict[int, int] = {}  # old index of an absorbed record -> board record index
    target_by_absorbed_uid: dict[str, dict[str, Any]] = {}
    for board_name, schematic_names in claims.items():
        board_index = index_by_name.get(board_name)
        if board_index is None:
            continue
        board = nets[board_index]
        for schematic_name in schematic_names:
            schematic_index = index_by_name.get(schematic_name)
            if (
                schematic_index is None
                or schematic_index in absorbed
                or len(boards_by_schematic.get(schematic_name, ())) != 1
            ):
                continue
            schematic = nets[schematic_index]
            absorbed[schematic_index] = board_index
            merged.setdefault(board_name, []).append(schematic_name)
            target_by_absorbed_uid[_string(schematic.get("netUid"))] = board
            aliases = board.setdefault("aliases", [])
            for alias in (schematic_name, *schematic.get("aliases", ())):
                if alias and alias != board["name"] and alias not in aliases:
                    aliases.append(alias)
            board.setdefault("sourceSheets", [])
            for sheet in schematic.get("sourceSheets", ()):
                if sheet not in board["sourceSheets"]:
                    board["sourceSheets"].append(sheet)
            if not board.get("netClass"):
                board["netClass"] = schematic.get("netClass", "")
            board["schematicRefs"].extend(schematic.get("schematicRefs", ()))
    if not absorbed:
        return merged

    # Drop the absorbed records and renumber every net index around them.
    kept: list[dict[str, Any]] = []
    renumbered: dict[int, int] = {}
    for index, net in enumerate(nets):
        if index in absorbed:
            continue
        renumbered[index] = len(kept)
        kept.append(net)
    for index, target in absorbed.items():
        renumbered[index] = renumbered[target]
    nets[:] = kept
    for key in ("netByName", "netByNetCode", "netBySchematicUuid", "netByPcbUuid"):
        indexes[key] = {name: renumbered[index] for name, index in indexes[key].items()}
    for index, net in enumerate(nets):
        for alias in net.get("aliases", ()):
            indexes["netByName"].setdefault(alias, index)
    # Pins on the schematic side only (no pad) still name the old record;
    # the padded ones were already moved by the board pass.
    for terminal in terminals:
        target = target_by_absorbed_uid.get(_string(terminal.get("netUid")))
        if target is not None:
            terminal["netUid"] = target["netUid"]
            terminal["netName"] = target["name"]
    return merged
