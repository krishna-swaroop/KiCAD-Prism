"""What a search answer keeps for the asked number (plan section 14)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.identity import FAMILY_MAX, keep_family  # noqa: E402


def keep(wanted: str, *numbers: str) -> list[str]:
    return keep_family(list(numbers), wanted, lambda item: item)


class KeepFamilyTests(unittest.TestCase):
    def test_the_number_and_its_longer_forms_are_kept_and_other_numbers_are_not(self) -> None:
        self.assertEqual(
            keep("74AHC1G09GV", "EM74AHC1G09GV", "74AHC1G09GV,125", "74AHC1G09GV", "74AHC1G09GV-Q100H", "74AHC1G08GV"),
            ["74AHC1G09GV", "74AHC1G09GV,125", "74AHC1G09GV-Q100H"],
        )

    def test_a_much_longer_number_is_a_different_part(self) -> None:
        self.assertEqual(keep("LM358", "LM358ABCDEFGHIJ"), [])

    def test_there_is_a_limit(self) -> None:
        many = [f"LM358D{n:02d}" for n in range(30)]
        self.assertEqual(len(keep("LM358D", *many)), FAMILY_MAX)


if __name__ == "__main__":
    unittest.main()
