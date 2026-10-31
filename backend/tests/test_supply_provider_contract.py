"""What every registered provider must offer, and every built-in web adapter, and the template, through the contract kit
(``supply_provider_kit``).

DigiKey, Mouser, Farnell and TME replay what the live services answered. Avnet and Arrow replay answers shaped by their
documentation (no key was available to record them); replace them with recordings as soon as one is.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.supply.providers import arrow, avnet, digikey, farnell, mouser, registry, template, tme  # noqa: E402
from app.services.supply.providers.base import CAPABILITIES, CAP_OFFERS, CAP_SEARCH, ProviderConfig  # noqa: E402
from supply_provider_kit import ContractChecks, load_recording  # noqa: E402
from test_supply_arrow import answer as arrow_answer, item as arrow_item, source as arrow_source, source_part  # noqa: E402
from test_supply_avnet import PRICE_PATH, line as avnet_line  # noqa: E402
from test_supply_digikey_farnell import dk_details, dk_product, variation  # noqa: E402


SECRET = "s3cr3t-value-0123456789"


def build(spec):
    credentials = {field.name: SECRET for field in spec.credential_fields}
    storefront = spec.storefronts[0] if spec.storefronts else ""
    return spec.factory(ProviderConfig(connector_id="c1", storefront=storefront, currency="EUR", credentials=credentials))


class ProviderContractTests(unittest.TestCase):
    def specs(self):
        registry.load_plugins()
        return registry.list_specs(include_dev=True)

    def test_there_are_providers_to_check(self) -> None:
        self.assertGreaterEqual({spec.key for spec in self.specs()} & {"tme", "mouser", "digikey", "farnell", "lcsc", "csv", "fake"}, {"tme", "mouser", "digikey", "farnell", "lcsc", "csv", "fake"})

    def test_every_spec_describes_itself_completely(self) -> None:
        for spec in self.specs():
            with self.subTest(provider=spec.key):
                self.assertTrue(spec.label.strip())
                self.assertTrue(spec.capabilities <= CAPABILITIES)
                self.assertIn(CAP_OFFERS, spec.capabilities, "a provider that cannot read offers has no use")
                self.assertGreaterEqual(spec.max_batch, 1)
                self.assertIn(spec.stock_pooling, ("pooled", "separate"))
                self.assertEqual(len(spec.storefronts), len(set(spec.storefronts)), "storefronts repeat")
                self.assertTrue(all(field.label.strip() for field in spec.credential_fields))
                self.assertEqual(spec.required_credentials, tuple(field.name for field in spec.credential_fields))
                if not spec.metered:
                    self.assertEqual(spec.default_daily_budget, 0, "a free provider has no call budget")
                if spec.metered and not spec.dev_only:
                    self.assertTrue(spec.hosts, "a provider that calls out names the hosts it calls")
                if spec.csv_fed:
                    self.assertEqual(spec.hosts, (), "a file upload calls nothing")

    def test_every_factory_builds_without_touching_the_network(self) -> None:
        for spec in self.specs():
            with self.subTest(provider=spec.key):
                provider = build(spec)
                for method in ("lookup_mpn", "get_offers", "get_part_data"):
                    self.assertTrue(callable(getattr(provider, method, None)), method)
                if CAP_SEARCH in spec.capabilities:
                    self.assertTrue(callable(provider.lookup_mpn))

    def test_credentials_never_show_in_a_config_or_a_provider_repr(self) -> None:
        for spec in self.specs():
            with self.subTest(provider=spec.key):
                config = ProviderConfig(connector_id="c1", credentials={field.name: SECRET for field in spec.credential_fields})
                self.assertNotIn(SECRET, repr(config))
                self.assertNotIn(SECRET, repr(build(spec)))


def _tme_recording() -> dict:
    """The TME answers recorded on 11 Oct 2026, in the order the kit asks: search, the two offers calls, part data."""

    live = load_recording("tme_live_lm358dr.json")
    return {"name": "tme_live_lm358dr.json", "provider": "tme", "mpn": "LM358DR", "calls": [
        {"method": "GET", "path": "/products", "answer": live["products_lookup"]},
        {"method": "GET", "path": "/products", "answer": live["products"]},
        {"method": "GET", "path": "/products/data", "answer": live["products_data"]},
        {"method": "GET", "path": "/products", "answer": live["products"]},
    ]}


def _digikey_pages() -> dict:
    """A search of 13 products over two pages, then one details call per offer read and one for the part data."""

    products = [dk_product([variation(sku=f"{n}-ND")]) for n in range(13)]
    keyword = "/products/v4/search/keyword"

    def details(n: int) -> dict:
        return {"method": "GET", "path": f"/products/v4/search/{n}-ND/productdetails", "answer": dk_details(products[n])}

    return {"name": "two search pages", "provider": "digikey", "mpn": "LM358DR", "calls": [
        {"method": "POST", "path": keyword, "answer": {"ExactMatches": [], "Products": products[:10], "ProductsCount": 13}},
        {"method": "POST", "path": keyword, "answer": {"ExactMatches": [], "Products": products[10:], "ProductsCount": 13}},
        details(0), details(1), details(2), details(0),
    ]}


def _avnet_recording() -> dict:
    asked = "CR0402-FX-1003GLF"
    return {"name": "avnet documented", "provider": "avnet", "mpn": asked, "calls": [
        {"method": "POST", "path": PRICE_PATH, "answer": [avnet_line(asked)]},
        {"method": "POST", "path": PRICE_PATH, "answer": [avnet_line(asked)]},
    ]}


def _arrow_recording() -> dict:
    found = arrow_item(sources=[arrow_source("ACNA", parts=[source_part("V72:1"), source_part("V72:2", containerType="Cut Tape")])])
    path = "/itemservice/v4/en/search/list"
    return {"name": "arrow documented", "provider": "arrow", "mpn": "BAV99", "calls": [
        {"method": "GET", "path": path, "answer": arrow_answer(found)},
        {"method": "GET", "path": path, "answer": arrow_answer(found)},
    ]}


class TemplateContract(ContractChecks, unittest.TestCase):
    spec = template.SPEC
    build = staticmethod(template.ExampleProvider)
    recordings = ("template_live_lm358dr.json",)
    currency = "EUR"

    def test_both_pages_are_read(self) -> None:
        run = self.replay("template_live_lm358dr.json")
        self.assertEqual([match.sku for match in run.matches], ["EX-LM358DR-CT", "EX-LM358DR-RL"])
        self.assertEqual(run.offer_calls, 1)
        self.assertEqual(run.data.parameters, (("Channels", "2"), ("Supply voltage", "3 V to 32 V")))


class DigiKeyContract(ContractChecks, unittest.TestCase):
    spec = digikey.SPEC
    build = staticmethod(digikey.DigiKeyProvider)
    recordings = ("digikey_live_calls_lm358dr.json", "digikey_live_abs07_32_768khz_7_t.json", _digikey_pages())
    storefront = "IT"


class MouserContract(ContractChecks, unittest.TestCase):
    spec = mouser.SPEC
    build = staticmethod(mouser.MouserProvider)
    recordings = ("mouser_live_calls_lm358dr.json", "mouser_live_abs07_32_768khz_7_t.json")


class FarnellContract(ContractChecks, unittest.TestCase):
    spec = farnell.SPEC
    build = staticmethod(farnell.FarnellProvider)
    recordings = ("farnell_live_calls_lm358dr.json",)
    storefront = "il.farnell.com"
    currency = "EUR"


class TmeContract(ContractChecks, unittest.TestCase):
    spec = tme.SPEC
    build = staticmethod(tme.TmeProvider)
    recordings = (_tme_recording(),)
    storefront = "AT"


class AvnetContract(ContractChecks, unittest.TestCase):
    spec = avnet.SPEC
    build = staticmethod(avnet.AvnetProvider)
    recordings = (_avnet_recording(),)


class ArrowContract(ContractChecks, unittest.TestCase):
    spec = arrow.SPEC
    build = staticmethod(arrow.ArrowProvider)
    recordings = (_arrow_recording(),)
    credentials = {"remote_ip": "198.51.100.7"}


CONTRACTS = (DigiKeyContract, MouserContract, FarnellContract, TmeContract, AvnetContract, ArrowContract)


class EveryAdapterTests(unittest.TestCase):
    def test_every_registered_web_adapter_has_a_contract_test(self) -> None:
        web = {spec.key for spec in registry.list_specs(include_dev=True) if spec.hosts}
        self.assertEqual(web, {case.spec.key for case in CONTRACTS})

    def test_the_rest_call_nothing(self) -> None:
        for spec in registry.list_specs(include_dev=True):
            if not spec.hosts:
                with self.subTest(provider=spec.key):
                    self.assertTrue(spec.csv_fed or spec.dev_only, "an adapter without hosts reads a file or makes figures up")

    def test_the_template_is_not_registered(self) -> None:
        with self.assertRaises(registry.UnknownProvider):
            registry.get_spec(template.KEY)


if __name__ == "__main__":
    unittest.main()
