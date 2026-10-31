"""Compliance and trade facts from DigiKey and Mouser, change notices and substances: reading, not storing.

Shapes follow DigiKey's ProductSearch v4 and Product Change Notifications v3 Swagger files and Mouser's V1 answer
recorded live (``ProductCompliance``) and its V1 description (``REACH-SVHC``).
"""

from __future__ import annotations

import json
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply import facts, pcn  # noqa: E402
from app.services.supply.providers import digikey, mouser, unrecognised  # noqa: E402
from app.services.supply.providers.base import AuthError, NotFound  # noqa: E402
from test_supply_digikey_farnell import NOW, dk_details, dk_product, dk_provider  # noqa: E402
from test_supply_distributors import FakeClient, mouser_provider  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "supply"
PCN_PATH = "/ChangeNotifications/v3/Products/{}"


class WordingTests(unittest.TestCase):
    def test_rohs_wording(self) -> None:
        cases = {
            "ROHS3 Compliant": "compliant", "RoHS Compliant": "compliant", "RoHS Compliant By Exemption": "compliant_exemption",
            "RoHS non-compliant": "not_compliant", "Non-RoHS": "not_compliant", "Not Applicable": "not_applicable",
            "Vendor undefined": "unknown", "None": "unknown", "": "unknown",
        }
        for text, expected in cases.items():
            self.assertEqual(facts.rohs_class(text), expected, text)

    def test_reach_wording(self) -> None:
        cases = {"REACH Unaffected": "unaffected", "REACH Affected": "affected", "Not Applicable": "not_applicable", "Vendor undefined": "unknown"}
        for text, expected in cases.items():
            self.assertEqual(facts.reach_class(text), expected, text)

    def test_clean_keeps_the_first_of_each_name_and_drops_odd_names_and_blanks(self) -> None:
        self.assertEqual(facts.clean([("eccn", " EAR99 "), ("eccn", "3A001"), ("Bad Name", "x"), ("msl", "  ")]), {"eccn": "EAR99"})

    def test_notice_kinds_from_a_distributors_wording(self) -> None:
        cases = {"EOL": "end_of_life", "Obsolescence": "end_of_life", "Product Discontinuance": "end_of_life",
                 "Last Time Buy": "last_time_buy", "NRND": "nrnd", "Packaging": "change", "Datasheet": "change"}
        for text, expected in cases.items():
            self.assertEqual(pcn.kind_from_text(text), expected, text)

    def test_the_same_notice_has_the_same_key(self) -> None:
        a = pcn.external_key("https://media.digikey.com/pdf/PCN/X.pdf", "EOL", "one", None)
        self.assertEqual(a, pcn.external_key("HTTPS://media.digikey.com/pdf/PCN/X.pdf", "Other", "two", date(2026, 1, 1)))
        self.assertNotEqual(pcn.external_key("", "EOL", "one", None), pcn.external_key("", "EOL", "two", None))


class DigiKeyFactsTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_classifications_and_the_last_buy_date_come_with_the_offer(self) -> None:
        product = dk_product() | {"DateLastBuyChance": "2027-03-31T00:00:00Z"}
        product["Classifications"] |= {"MoistureSensitivityLevel": "1  (Unlimited)", "ExportControlClassNumber": "EAR99", "HtsusCode": "8542.33.0001"}
        client = FakeClient({"/v1/oauth2/token": [{"access_token": "t", "expires_in": 599}],
                             "/products/v4/search/296-1395-1-ND/productdetails": [dk_details(product)]})
        (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
        self.assertEqual(dict(offer.facts), {
            "category": "Linear - Amplifiers", "rohs_status": "ROHS3 Compliant", "reach_status": "REACH Unaffected",
            "msl": "1  (Unlimited)", "eccn": "EAR99", "hts_us": "8542.33.0001", "last_buy_date": "2027-03-31", "mfr_lead_weeks": "14",
        })

    def test_stocking_terms_and_the_factory_stock_come_with_the_offer(self) -> None:
        product = dk_product() | {
            "ManufacturerPublicQuantity": 1505000, "ManufacturerLeadWeeks": "13", "NormallyStocking": True, "Ncnr": False, "BackOrderNotAllowed": True,
        }
        client = FakeClient({"/v1/oauth2/token": [{"access_token": "t", "expires_in": 599}],
                             "/products/v4/search/296-1395-1-ND/productdetails": [dk_details(product)]})
        (offer,) = dk_provider(client).get_offers(["296-1395-1-ND"])
        found = dict(offer.facts)
        self.assertEqual(
            (found["factory_stock"], found["mfr_lead_weeks"], found["normally_stocking"], found["ncnr"], found["backorder_allowed"]),
            ("1505000", "13", "Yes", "No", "No"),
        )

    def test_the_category_is_the_most_specific_name_in_the_chain(self) -> None:
        from app.services.supply.providers import digikey

        nested = {"Name": "Integrated Circuits (ICs)", "ChildCategories": [{"Name": "Linear", "ChildCategories": [{"Name": "Amplifiers"}]}]}
        self.assertEqual(digikey._leaf_category(nested), "Amplifiers")
        self.assertEqual(digikey._leaf_category({"Name": "Only"}), "Only")
        self.assertEqual(digikey._leaf_category(None), "")

    def test_change_notices_need_a_user_token_and_a_404_means_none(self) -> None:
        with self.assertRaises(AuthError):
            dk_provider(FakeClient({})).change_notices("296-1395-1-ND", "")
        client = FakeClient({PCN_PATH.format("296-1395-1-ND"): [NotFound("none")]})
        self.assertEqual(dk_provider(client).change_notices("296-1395-1-ND", "user-token"), [])
        self.assertEqual(client.calls[0]["headers"]["Authorization"], "Bearer user-token")

    def test_change_notices_are_read_as_written(self) -> None:
        answer = {"DigiKeyPartNumber": "296-1395-1-ND", "ProductChangeNotifications": [
            {"DigiKeyPartNumber": "296-1395-1-ND", "PcnChangeDate": "2026-10-12T19:22:00Z", "PcnTypeId": "3", "PcnType": "EOL",
             "PcnDescription": "Obsolescence of LM358DR 4/Nov/2025", "PcnLink": "https://media.digikey.com/pdf/PCN/TI/x.pdf"},
            {"PcnType": "Packaging", "PcnDescription": "Reel change", "PcnLink": "http://insecure.example/x.pdf"},
        ]}
        (eol, packaging) = dk_provider(FakeClient({PCN_PATH.format("296-1395-1-ND"): [answer]})).change_notices("296-1395-1-ND", "tok")
        self.assertEqual((eol.kind_text, eol.published_on, eol.url), ("EOL", date(2025, 11, 4), "https://media.digikey.com/pdf/PCN/TI/x.pdf"))
        self.assertEqual((packaging.kind_text, packaging.url, packaging.published_on), ("Packaging", "", None), "only HTTPS links are kept")

    def test_the_release_date_comes_from_the_description_not_the_record_date(self) -> None:
        from app.services.supply.providers import digikey

        self.assertEqual(digikey._description_day("Label Chg 12/Mar/2017"), date(2017, 3, 12))
        self.assertEqual(digikey._description_day("All Dev Label Chgs 2/Aug/2020"), date(2020, 8, 2))
        self.assertIsNone(digikey._description_day("Assembly site change"))
        self.assertIsNone(digikey._description_day("Odd 31/Feb/2020"))


class MouserFactsTests(unittest.TestCase):
    def setUp(self) -> None:
        unrecognised._seen.clear()

    def test_the_recorded_answer_gives_rohs_and_trade_codes(self) -> None:
        recorded = json.loads((FIXTURES / "mouser_live_lm358dr.json").read_text(encoding="utf-8"))
        part = next(item for item in _parts(recorded) if item["MouserPartNumber"] == "595-LM358DR")
        found = dict(mouser._facts(part))
        self.assertEqual(found["rohs_status"], "RoHS Compliant")
        self.assertEqual((found["hts_us"], found["hts_eu"], found["eccn"]), ("8542330001", "8542339000", "EAR99"))
        self.assertNotIn("suggested_replacement", found, "an empty replacement is left out")

    def test_the_country_of_origin_and_the_factory_stock_are_kept_whatever_the_language(self) -> None:
        recorded = json.loads((FIXTURES / "mouser_live_lm358dr.json").read_text(encoding="utf-8"))
        part = next(item for item in _parts(recorded) if item["MouserPartNumber"] == "595-LM358DR")
        found = dict(mouser._facts(part))
        self.assertEqual(found["origin_country"], "Messico")
        self.assertEqual(found["factory_stock"], "0")
        english = {"TradeCompliance": [{"ComplianceName": "Country of Origin", "ComplianceValue": "Mexico"}]}
        self.assertEqual(dict(mouser._facts(english))["origin_country"], "Mexico")

    def test_an_unknown_compliance_name_is_kept_under_its_own_name_and_logged(self) -> None:
        self.assertEqual(mouser._trade_facts([{"ComplianceName": "ZZHTS", "ComplianceValue": "8542"}]), (("trade_zzhts", "8542"),))
        self.assertEqual(len(unrecognised._seen), 1)

    def test_substances_come_with_the_version_1_offer(self) -> None:
        part = {"MouserPartNumber": "595-LM358DR", "AvailabilityInStock": "10", "REACH-SVHC": ["Lead  (CAS 7439-92-1)", " "]}
        self.assertEqual(mouser._offer("595-LM358DR", part, NOW).substances, ("Lead (CAS 7439-92-1)",))
        self.assertEqual(mouser._offer("595-LM358DR", {**part, "REACH-SVHC": []}, NOW).substances, (), "none listed")
        without = {key: value for key, value in part.items() if key != "REACH-SVHC"}
        self.assertIsNone(mouser._offer("595-LM358DR", without, NOW).substances, "nothing stated")

    def test_mouser_makes_no_substances_call(self) -> None:
        self.assertFalse(hasattr(mouser.MouserProvider, "substances"))


def _parts(recorded):
    stack = [recorded]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if "MouserPartNumber" in item:
                yield item
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)


if __name__ == "__main__":
    unittest.main()
