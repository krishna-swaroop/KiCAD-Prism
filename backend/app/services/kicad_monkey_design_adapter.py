"""Narrow adapter over kicad-monkey's ``KiCadDesign`` for semantic indexing.

Prism supports two shapes of the upstream ``to_json`` projection:

* the pinned release, ``to_json(include_indexes=True, *, compiled_schematic_graph=None)``,
  whose PnP section lazily parses the whole ``.kicad_pcb``; and
* the local optimized tree, ``to_json(include_indexes=True, *, include_pcb=True)``,
  which can skip board data outright.

Which one is installed is decided here by inspecting the bound method's
signature, never by calling it and reading a ``TypeError`` message. A
``TypeError`` raised from inside upstream code therefore propagates as the
defect it is instead of being mistaken for an unsupported argument.

The adapter also owns board injection. A caller that already parsed the board
(Release Studio projections) hands it in once; the adapter attaches it to the
design and guarantees the design neither re-parses nor discards it, including
on the schematic-only path where an un-injected board is detached so the
upstream projection does not pay for a parse nobody asked for.
"""

from __future__ import annotations

import inspect
from typing import Any


class KiCadMonkeyDesign:
    """A loaded ``KiCadDesign`` plus the compatibility decisions Prism makes about it."""

    def __init__(self, design: Any, *, board: Any = None) -> None:
        self._design = design
        self._board_injected = board is not None
        if board is not None:
            # Attach the already-parsed board so ``design.pcb`` returns it
            # instead of parsing ``pcb_path`` again.
            design._pcb = board

    @property
    def native(self) -> Any:
        """The wrapped ``KiCadDesign`` for projections that read its hierarchy."""
        return self._design

    @property
    def board_injected(self) -> bool:
        return self._board_injected

    def netlist(self) -> Any:
        """Compile the netlist when the installed design exposes ``to_netlist``."""
        compile_netlist = getattr(self._design, "to_netlist", None)
        return compile_netlist() if callable(compile_netlist) else None

    def board(self) -> Any:
        """The design's board, parsing lazily unless one was injected."""
        return self._design.pcb

    @property
    def supports_board_switch(self) -> bool:
        """Whether ``to_json`` accepts ``include_pcb``."""
        return _accepts_keyword(self._design.to_json, "include_pcb")

    def to_json(self, *, include_indexes: bool = True, include_pcb: bool = True) -> dict[str, Any]:
        """Project the design to JSON, honouring ``include_pcb`` on either upstream shape."""
        if self.supports_board_switch:
            return self._design.to_json(include_indexes=include_indexes, include_pcb=include_pcb)
        if not include_pcb and not self._board_injected:
            # The pinned upstream has no board switch, so its PnP projection
            # would lazily parse the whole ``.kicad_pcb`` even though this
            # caller wants no board data; that parse is the single largest
            # cost of a schematic-only build. Detach the board and clear
            # ``pcb_path`` so ``design.pcb`` returns None instead of parsing.
            # An injected board stays attached: the caller paid to parse it.
            self._design._pcb = None
            self._design.pcb_path = None
        return self._design.to_json(include_indexes=include_indexes)


def _accepts_keyword(callable_: Any, keyword: str) -> bool:
    """True when ``callable_`` declares ``keyword`` (or ``**kwargs``) in its signature."""
    try:
        parameters = inspect.signature(callable_).parameters
    except (TypeError, ValueError):
        # Builtins and some extension callables have no introspectable
        # signature; treat them as the older shape rather than guessing.
        return False
    parameter = parameters.get(keyword)
    if parameter is not None and parameter.kind in (
        inspect.Parameter.KEYWORD_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
    ):
        return True
    return any(item.kind is inspect.Parameter.VAR_KEYWORD for item in parameters.values())
