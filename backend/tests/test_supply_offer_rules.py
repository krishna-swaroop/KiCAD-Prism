"""The rules read off a part's counted offers: one lead time, one RoHS verdict, one count of holders."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import offer_rules, stock  # noqa: E402


def offer(lead=None, stock_=100, marketplace=False, rohs=None, connector="c1", pool=None) -> dict:
    return {"connector_id": connector, "pool": pool, "lead_time_days": lead, "stock": stock_, "marketplace": marketplace, "rohs": rohs, "packaging": None}


class LeadTimeTests(unittest.TestCase):
    def test_the_shortest_wait_of_a_distributor_holding_stock_else_of_any(self) -> None:
        self.assertEqual(offer_rules.lead_time_of([offer(30), offer(7, stock_=0)]), 30)
        self.assertEqual(offer_rules.lead_time_of([offer(30, stock_=0), offer(7, stock_=0)]), 7)

    def test_marketplace_stock_and_a_zero_say_nothing(self) -> None:
        self.assertEqual(offer_rules.lead_time_of([offer(3, marketplace=True), offer(0), offer(42, stock_=0)]), 42)
        self.assertIsNone(offer_rules.lead_time_of([offer(None), offer(0)]))


class RohsTests(unittest.TestCase):
    def test_the_verdict_from_what_distributors_say(self) -> None:
        self.assertEqual(offer_rules.rohs_verdict([offer(rohs=True), offer(rohs=None)]), "compliant")
        self.assertEqual(offer_rules.rohs_verdict([offer(rohs=False)]), "not_compliant")
        self.assertEqual(offer_rules.rohs_verdict([offer(rohs=True), offer(rohs=False)]), "disputed")
        self.assertEqual(offer_rules.rohs_verdict([offer()]), "unknown")

    def test_the_stated_status_decides_only_when_no_offer_says(self) -> None:
        self.assertEqual(offer_rules.rohs_verdict([offer(rohs=True)], ["not_compliant"]), "compliant")
        self.assertEqual(offer_rules.rohs_verdict([offer()], ["not_compliant", "unknown"]), "not_compliant")
        self.assertEqual(offer_rules.rohs_verdict([], ["compliant_exemption"]), "compliant")
        self.assertEqual(offer_rules.rohs_verdict([], ["compliant", "not_compliant"]), "disputed")
        self.assertEqual(offer_rules.rohs_verdict([], ["not_applicable"]), "not_applicable")
        self.assertEqual(offer_rules.rohs_verdict([], ["not_applicable", "compliant"]), "compliant")
        self.assertEqual(offer_rules.rohs_verdict([], ["unknown"]), "unknown")


class HolderTests(unittest.TestCase):
    def test_storefronts_on_one_account_hold_once_and_an_empty_or_marketplace_offer_holds_nothing(self) -> None:
        rows = [offer(connector="uk", pool="acct"), offer(connector="de", pool="acct"), offer(connector="m"), offer(connector="x", stock_=0),
                offer(connector="y", marketplace=True)]
        self.assertEqual(stock.holders(rows), 2)


if __name__ == "__main__":
    unittest.main()
