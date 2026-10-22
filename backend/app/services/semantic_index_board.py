"""The board facts the semantic index needs, without a full board model.

The index ties pads, tracks, arcs, vias and zones to components and nets by
UUID. That is all it reads from the board, yet a Python board model of a
57 MB board took 42 s and 2.6 GB of memory to provide it, more than the rest
of the index build together. ``prism-bundle board-refs`` (the Rust parser
that also builds board.prism) reads the same facts in about a second.

Both sources are reduced to one shape (``prism.board_refs.a0``):

* ``footprints``: ``{"uuid", "reference", "pads": [[uuid, number, net], ...]}``
* ``segments``, ``arcs``, ``vias``, ``zones``: ``[[uuid, net], ...]``

where ``net`` is ``[code, name]``. Items keep board order.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

BOARD_REFS_SCHEMA = "prism.board_refs.a0"
BOARD_REFS_TIMEOUT_SECONDS = 300
ROUTED_COLLECTIONS = ("segments", "arcs", "vias", "zones")


def _string(value: object) -> str:
    return "" if value is None else str(value)


def _tool() -> Path:
    return Path(settings.PRISM_SIM_BIN_DIR) / "prism-bundle"


def refs_from_tool(board_path: Path, footprints_board: Path | None = None) -> dict[str, Any] | None:
    """``prism-bundle board-refs`` of ``board_path``, or None when it is unavailable or fails.

    With ``footprints_board`` it also writes there the board cut down to its
    footprints' properties, attributes and variant records (no pads, graphics,
    tracks or zones), which the variant assembly reads through a board model.
    """

    tool = _tool()
    if not tool.is_file() or not board_path.is_file():
        return None
    command = [str(tool), "board-refs", str(board_path)]
    if footprints_board is not None:
        command += ["--footprints-board", str(footprints_board)]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            timeout=BOARD_REFS_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("prism-bundle board-refs could not run on %s: %s", board_path, exc)
        return None
    if completed.returncode != 0:
        # An older prism-bundle without the command, or a board it cannot read:
        # the Python model still can, just slowly.
        logger.warning(
            "prism-bundle board-refs failed on %s: %s",
            board_path,
            completed.stderr.decode("utf-8", "replace").strip()[-500:],
        )
        return None
    refs = json.loads(completed.stdout)
    return refs if refs.get("schema") == BOARD_REFS_SCHEMA else None


def footprints_board_model(path: Path) -> Any:
    """A kicad-monkey board model of a footprints-only board from :func:`refs_from_tool`."""

    from kicad_monkey.kicad_pcb import KiCadPcb

    return KiCadPcb(path)


def refs_from_pcb(pcb: Any) -> dict[str, Any]:
    """The same facts from a kicad-monkey Python board model (one a caller already parsed)."""

    net_table = _net_table(pcb)

    def net(item: object) -> list[Any]:
        return [_net_code(item), _net_name(pcb, item, net_table)]

    footprints = []
    for footprint in getattr(pcb, "footprints", ()) or ():
        footprints.append(
            {
                "uuid": _string(getattr(footprint, "uuid", "")),
                "reference": _property_map(footprint).get("Reference", ""),
                "pads": [
                    [_string(getattr(pad, "uuid", "")), _string(getattr(pad, "number", "")), net(pad)]
                    for pad in getattr(footprint, "pads", ()) or ()
                ],
            }
        )
    refs: dict[str, Any] = {"schema": BOARD_REFS_SCHEMA, "footprints": footprints}
    for collection in ROUTED_COLLECTIONS:
        refs[collection] = [
            [_string(getattr(item, "uuid", "")), net(item)] for item in getattr(pcb, collection, ()) or ()
        ]
    return refs


def _property_map(footprint: object) -> dict[str, str]:
    result: dict[str, str] = {}
    for prop in getattr(footprint, "properties", ()) or ():
        name = _string(getattr(prop, "name", ""))
        if name:
            result[name] = _string(getattr(prop, "value", ""))
    return result


def _net_table(pcb: object) -> object | None:
    """Snapshot the board's net table, when the installed kicad-monkey has one.

    Without it every ``resolve_net_name`` call rebuilds the whole mapping, so
    projecting a board costs O(elements x nets). Older releases lack
    ``net_table``; there the per-call path below still works, just slowly.
    """

    build = getattr(pcb, "net_table", None)
    if not callable(build):
        return None
    try:
        return build()
    except Exception:  # pragma: no cover - fall back to per-call resolution
        return None


def _net_name(pcb: object, item: object, net_table: object | None = None) -> str:
    net = getattr(item, "net", None)
    if net_table is not None:
        return _string(net_table.name_of(net))
    resolver = getattr(pcb, "resolve_net_name", None)
    if callable(resolver):
        return _string(resolver(net))
    return _string(getattr(net, "name", ""))


def _net_code(item: object) -> int | None:
    ordinal = getattr(getattr(item, "net", None), "ordinal", None)
    return int(ordinal) if isinstance(ordinal, int) else None


__all__ = ["BOARD_REFS_SCHEMA", "footprints_board_model", "refs_from_pcb", "refs_from_tool"]
