"""Reading the BOM a release build exported."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import release_bom  # noqa: E402


class ReleaseBomTests(unittest.TestCase):
    def test_grouped_rows_give_their_quantity_and_references(self) -> None:
        read = release_bom.lines_from_csv("Reference,Value,Qty,Manufacturer,MPN\nR1 R2 R3,10k,3,Acme,R-10K\nU1,LM358,1,TI,LM358DR\n")
        got = {line.mpn: (line.quantity, line.references, line.manufacturer) for line in read.lines}
        self.assertEqual(got, {"R-10K": (3, "R1 R2 R3", "Acme"), "LM358DR": (1, "U1", "TI")})
        self.assertEqual((read.rows, read.without_number), (2, 0))

    def test_without_a_quantity_column_the_references_are_counted(self) -> None:
        (line,) = release_bom.lines_from_csv("References;MPN;Manufacturer\n\"C1, C2\";C-100N;Acme\n").lines
        self.assertEqual((line.quantity, line.mpn), (2, "C-100N"))

    def test_rows_without_a_number_are_counted_and_do_not_fit_rows_are_left_out(self) -> None:
        read = release_bom.lines_from_csv("Reference,Qty,MPN,Manufacturer,DNP\nJ1,1,,,\nR1,1,R-1,Acme,\nR2,1,R-2,Acme,Yes\n")
        self.assertEqual([line.mpn for line in read.lines], ["R-1"])
        self.assertEqual(read.without_number, 1)

    def test_the_same_part_on_two_rows_is_one_line(self) -> None:
        read = release_bom.lines_from_csv("Reference,Qty,MPN,Manufacturer\nR1,2,R-1,Acme\nR9,3,R-1,Acme\n")
        self.assertEqual([(line.mpn, line.quantity, line.references) for line in read.lines], [("R-1", 5, "R1 R9")])

    def test_the_shipped_part_wins_over_what_the_library_names_today(self) -> None:
        # Built with OLD-MPN; the library has since moved component C1 to NEW-MPN. The release is still the part it shipped with,
        # and C1's alternates (approved for NEW-MPN) no longer apply to it.
        read = release_bom.lines_from_csv(
            "Reference,Qty,MPN,Manufacturer,Prism ID\nR1,1,OLD-MPN,Acme,C1\nR2,1,SAME-1,Acme,C2\nJ1,1,,,C3\n",
            lambda ids: {"C1": ("Acme", "NEW-MPN"), "C2": ("Acme Corp", "SAME-1"), "C3": ("Molex", "J-100")},
        )
        got = {line.references: (line.manufacturer, line.mpn, line.prism_id) for line in read.lines}
        self.assertEqual(got, {
            "R1": ("Acme", "OLD-MPN", ""),
            "R2": ("Acme", "SAME-1", "C2"),
            "J1": ("Molex", "J-100", "C3"),
        })
        self.assertEqual(read.without_number, 0, "a row with no number takes its component's")

    def test_a_file_with_no_rows_or_too_large_is_refused(self) -> None:
        with self.assertRaises(release_bom.BomReadError):
            release_bom.lines_from_csv("Reference,MPN\n")
        with self.assertRaises(release_bom.BomReadError):
            release_bom.lines_from_csv("a,b\n" + "x" * (release_bom.MAX_BYTES + 1))

    def test_more_data_rows_than_the_limit_is_refused_not_cut(self) -> None:
        text = "Reference,MPN\n" + "".join(f"R{index},P{index}\n" for index in range(6))
        with mock.patch.object(release_bom, "MAX_ROWS", 5), self.assertRaises(release_bom.BomReadError) as caught:
            release_bom.lines_from_csv(text)
        self.assertIn("more than 5 rows", str(caught.exception))

    def test_exactly_the_limit_reads_every_row(self) -> None:
        text = "Reference,MPN\n" + "".join(f"R{index},P{index}\n" for index in range(5))
        with mock.patch.object(release_bom, "MAX_ROWS", 5):
            read = release_bom.lines_from_csv(text)
        self.assertEqual([line.mpn for line in read.lines], [f"P{index}" for index in range(5)])
        self.assertEqual(read.rows, 5)


if __name__ == "__main__":
    unittest.main()
