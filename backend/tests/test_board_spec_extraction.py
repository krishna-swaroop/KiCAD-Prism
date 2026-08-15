from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import board_spec_service as bss  # noqa: E402


def _write_board(
    *,
    copper_layers: int = 2,
    thickness: float | None = 1.6,
    outline: tuple[float, float] | None = (100.0, 80.0),
) -> str:
    """Build a minimal but valid .kicad_pcb with kiutils and return its path."""
    from kiutils.board import Board
    from kiutils.items.brditems import LayerToken
    from kiutils.items.common import Position
    from kiutils.items.gritems import GrLine

    board = Board.create_new()

    layers = [LayerToken(ordinal=0, name="F.Cu", type="signal")]
    for i in range(1, copper_layers - 1):
        layers.append(LayerToken(ordinal=i, name=f"In{i}.Cu", type="signal"))
    layers.append(LayerToken(ordinal=31, name="B.Cu", type="signal"))
    layers.append(LayerToken(ordinal=32, name="B.Mask", type="user"))  # non-copper noise
    board.layers = layers

    if thickness is not None and board.general is not None:
        board.general.thickness = thickness

    if outline is not None:
        w, h = outline
        for x1, y1, x2, y2 in [(0, 0, w, 0), (w, 0, w, h), (w, h, 0, h), (0, h, 0, 0)]:
            board.graphicItems.append(
                GrLine(start=Position(x1, y1), end=Position(x2, y2), layer="Edge.Cuts")
            )

    handle = tempfile.NamedTemporaryFile("w", suffix=".kicad_pcb", delete=False, encoding="utf-8")
    handle.close()
    board.to_file(handle.name)
    return handle.name


class BoardSpecExtractionTests(unittest.TestCase):
    """Extraction is read-only and needs no database."""

    def setUp(self) -> None:
        self._paths: list[str] = []

    def tearDown(self) -> None:
        for path in self._paths:
            try:
                os.unlink(path)
            except OSError:
                pass

    def _board(self, **kwargs) -> str:
        path = _write_board(**kwargs)
        self._paths.append(path)
        return path

    def test_extracts_layer_count_ignoring_non_copper(self) -> None:
        spec = bss.extract_board_spec(self._board(copper_layers=4))
        self.assertEqual(spec["layer_count"], 4)  # F, In1, In2, B — not B.Mask

    def test_two_layer_board(self) -> None:
        spec = bss.extract_board_spec(self._board(copper_layers=2))
        self.assertEqual(spec["layer_count"], 2)

    def test_extracts_thickness(self) -> None:
        spec = bss.extract_board_spec(self._board(thickness=0.8))
        self.assertEqual(spec["board_thickness_mm"], 0.8)

    def test_extracts_board_dimensions_from_edge_cuts(self) -> None:
        spec = bss.extract_board_spec(self._board(outline=(120.5, 60.0)))
        self.assertEqual(spec["board_width_mm"], 120.5)
        self.assertEqual(spec["board_height_mm"], 60.0)

    def test_omits_dimensions_when_no_outline(self) -> None:
        spec = bss.extract_board_spec(self._board(outline=None))
        self.assertNotIn("board_width_mm", spec)  # absent, not guessed

    def test_missing_file_returns_empty(self) -> None:
        self.assertEqual(bss.extract_board_spec("/no/such/board.kicad_pcb"), {})

    def test_unparseable_file_returns_empty(self) -> None:
        handle = tempfile.NamedTemporaryFile("w", suffix=".kicad_pcb", delete=False, encoding="utf-8")
        handle.write("this is not an s-expression board")
        handle.close()
        self._paths.append(handle.name)
        self.assertEqual(bss.extract_board_spec(handle.name), {})


if __name__ == "__main__":
    unittest.main()
