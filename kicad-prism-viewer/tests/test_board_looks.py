import tempfile
import unittest
from pathlib import Path

from pipeline.topology_compiler.board_looks import MASK_COLORS, board_looks, mask_rgba, stackup_mask_colors

STACKUP = """(kicad_pcb
  (setup
    (stackup
      (layer "F.SilkS" (type "Top Silk Screen") (color "White"))
      (layer "F.Mask" (type "Top Solder Mask") (color "Black") (thickness 0.01))
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "B.Mask" (type "Bottom Solder Mask") (color "#1A2B3CD4") (thickness 0.01))
      (copper_finish "ENIG"))))
"""


class BoardLooksTest(unittest.TestCase):
    def test_reads_each_side_s_mask_colour_from_the_stackup(self) -> None:
        self.assertEqual(stackup_mask_colors(STACKUP), {"front": "Black", "back": "#1A2B3CD4"})

    def test_names_custom_colours_and_kicad_s_default(self) -> None:
        self.assertEqual(mask_rgba("Black"), MASK_COLORS["black"])
        self.assertEqual(mask_rgba(""), MASK_COLORS["green"])
        self.assertEqual(mask_rgba("#1A2B3CD4"), [0.0103, 0.0242, 0.0452, 0.8314])

    def test_a_board_without_mask_colours_is_kicad_green(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            board = Path(root) / "b.kicad_pcb"
            board.write_text("(kicad_pcb (setup (stackup (layer \"F.Mask\" (type \"Top Solder Mask\")))))")
            looks = board_looks(board)
        self.assertEqual(looks["soldermask"], {"front": MASK_COLORS["green"], "back": MASK_COLORS["green"]})


if __name__ == "__main__":
    unittest.main()
