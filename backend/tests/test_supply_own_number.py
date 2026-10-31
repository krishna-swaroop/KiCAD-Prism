import unittest
from types import SimpleNamespace

from app.services.supply import discovery
from app.services.supply.identity import match_key


class OwnNumberTests(unittest.TestCase):
    def test_a_part_number_that_is_the_distributors_own_number_counts(self) -> None:
        part = SimpleNamespace(match_key=match_key("C42411"), manufacturer_id="m1", manufacturer_name="Jing Extension")
        match = SimpleNamespace(mpn="912-121A1027D10200", sku="C42411", manufacturer="Other Maker")
        resolution = SimpleNamespace(status="unresolved", manufacturer_id=None)
        self.assertEqual(discovery.classify(part, match, resolution)[0], discovery.EXACT)

    def test_another_number_still_needs_the_same_part_number(self) -> None:
        part = SimpleNamespace(match_key=match_key("LM358"), manufacturer_id="m1", manufacturer_name="TI")
        match = SimpleNamespace(mpn="LM324", sku="C1", manufacturer="TI")
        resolution = SimpleNamespace(status="confirmed", manufacturer_id="m1")
        self.assertEqual(discovery.classify(part, match, resolution)[0], discovery.NEAR)


if __name__ == "__main__":
    unittest.main()
