"""Whether two manufacturer spellings are one maker, on the spellings distributors really gave for the dev parts."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply.makers import canonical_key, same_maker  # noqa: E402


class SameMakerTests(unittest.TestCase):
    def test_spellings_of_one_maker(self) -> None:
        for one, two in [
            ("STANLEY", "STANLEY ELECTRIC CO., LTD."), ("Stanley Electric", "Stanley Electric Co"),
            ("KOA", "KOA Speer Electronics, Inc."), ("KOA Speer", "KOA"),
            ("TE Connectivity", "TE Connectivity / Holsworthy"), ("TE Connectivity", "TE Connectivity Passive Product"),
            ("ADI", "Analog Devices"), ("ADI", "Analog Devices Inc."), ("Analog Devices Inc.", "ANALOG DEVICES"),
            ("TI", "Texas Instruments"), ("Texas Instruments Inc.", "TEXAS INSTRUMENTS"),
            ("Nexperia", "Nexperia USA Inc."), ("DIODES", "Diodes Incorporated"), ("DIODES INC.", "DIODES INCORPORATED"),
            ("SKYWORKS", "Skyworks Solutions, Inc."), ("ECS", "ECS INC INTERNATIONAL"), ("muRata", "Murata Electronics"),
            ("onsemi", "ONSEMI"), ("onsemi", "ON Semiconductor"), ("Vishay", "Vishay Siliconix"), ("Siliconix", "Vishay Siliconix"),
            ("Maxim Integrated", "Analog Devices Inc./Maxim Integrated"),
            ("Renesas", "Renasas"), ("W" + chr(0xFFFD) + "rth Elektronik", "Wurth Elektronik"), ("W" + chr(0xFC) + "rth Elektronik", "Wurth Elektronik"),
            ("KYOCERA AVX", "AVX"),
        ]:
            self.assertTrue(same_maker(one, two), f"{one} / {two}")

    def test_different_makers_stay_different(self) -> None:
        for one, two in [
            ("onsemi", "UMW"), ("onsemi", "TECH PUBLIC"), ("muRata", "RFMi"), ("Nexperia", "NXP USA Inc."),
            ("Texas Instruments", "Thomas Industries"), ("TI", "Thomas Industries"), ("Semiconductor", "ON Semiconductor"),
            ("Linear Technology", "Analog Devices"), ("Maxim", "Analog Devices"), ("", "Acme"), ("Acme", ""),
            ("Diodes", "Rohm Semiconductor"), ("Rohm", "Roam"), ("UMW", "TI"), ("Power Integrations", "Monolithic Power Systems"),
        ]:
            self.assertFalse(same_maker(one, two), f"{one} / {two}")

    def test_a_callers_own_aliases_count(self) -> None:
        self.assertFalse(same_maker("Linear Technology", "Analog Devices"))
        self.assertTrue(same_maker("Linear Technology", "Analog Devices", {"linear technology": "ad", "analog devices": "ad"}))
        self.assertEqual(canonical_key("ADI"), canonical_key("Analog Devices Inc."))


if __name__ == "__main__":
    unittest.main()
