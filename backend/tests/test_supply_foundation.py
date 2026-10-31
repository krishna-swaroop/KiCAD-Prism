"""Supply foundation: vocabulary, models, the simulated provider, egress and quota.

No database and no network. The resolver and clock are injected.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import quota  # noqa: E402
from app.services.supply.egress import EgressDenied, host_allowed, validate_url  # noqa: E402
from app.services.supply.models import Incoming, Offer, PriceBreak  # noqa: E402
from app.services.supply.providers import registry  # noqa: E402
from app.services.supply.providers.base import (  # noqa: E402
    CAP_SEARCH,
    CredentialField,
    ProviderConfig,
    ProviderSpec,
)
from app.services.supply.providers.fake import FakeProvider  # noqa: E402
from app.services.supply.vocabulary import Lifecycle, Packaging  # noqa: E402

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


class ModelTests(unittest.TestCase):
    def _offer(self, **overrides) -> Offer:
        values = dict(provider="p", sku="s", mpn="m", manufacturer="x", stock=1, fetched_at=NOW)
        values.update(overrides)
        return Offer(**values)

    def test_valid_offer(self) -> None:
        offer = self._offer(
            price_breaks=(PriceBreak(1, Decimal("1.0")), PriceBreak(10, Decimal("0.9"))),
            currency="EUR",
            incoming=(Incoming(100),),
        )
        self.assertEqual(offer.price_breaks[1].quantity, 10)

    def test_rejects_naive_time(self) -> None:
        with self.assertRaises(ValueError):
            self._offer(fetched_at=datetime(2026, 3, 1))

    def test_rejects_negative_stock_and_bad_moq(self) -> None:
        with self.assertRaises(ValueError):
            self._offer(stock=-1)
        with self.assertRaises(ValueError):
            self._offer(moq=0)

    def test_price_breaks_need_currency_and_order(self) -> None:
        with self.assertRaises(ValueError):
            self._offer(price_breaks=(PriceBreak(1, Decimal("1")),))
        with self.assertRaises(ValueError):
            self._offer(
                price_breaks=(PriceBreak(10, Decimal("1")), PriceBreak(1, Decimal("2"))),
                currency="EUR",
            )
        with self.assertRaises(ValueError):
            self._offer(price_breaks=(PriceBreak(1, Decimal("1")),), currency="eur")

    def test_price_break_rejects_bad_values(self) -> None:
        with self.assertRaises(ValueError):
            PriceBreak(0, Decimal("1"))
        with self.assertRaises(ValueError):
            PriceBreak(1, Decimal("-1"))


class FakeProviderTests(unittest.TestCase):
    def _provider(self, when: datetime = NOW) -> FakeProvider:
        return FakeProvider(ProviderConfig(connector_id="c1", currency="EUR"), clock=lambda: when)

    def test_lookup_and_unknown(self) -> None:
        provider = self._provider()
        matches = provider.lookup_mpn(" abc 123 ", "ST")
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].sku, "FAKE-ABC123-CT")
        self.assertEqual(matches[0].manufacturer, "ST")
        self.assertEqual(provider.lookup_mpn("NONE-1"), [])
        self.assertEqual(provider.lookup_mpn("  "), [])

    def test_offers_are_deterministic(self) -> None:
        skus = ["FAKE-ABC123-CT", "FAKE-ABC123-RL"]
        self.assertEqual(self._provider().get_offers(skus), self._provider().get_offers(skus))

    def test_packaging_variants_share_one_stock_pool(self) -> None:
        cut, reel = self._provider().get_offers(["FAKE-ABC123-CT", "FAKE-ABC123-RL"])
        self.assertEqual(cut.stock, reel.stock)
        self.assertEqual(cut.packaging, Packaging.CUT_TAPE)
        self.assertEqual(reel.packaging, Packaging.TAPE_REEL)
        self.assertEqual(reel.moq, 1000)
        self.assertEqual(cut.currency, "EUR")
        self.assertLess(reel.price_breaks[0].unit_price, cut.price_breaks[0].unit_price)

    def test_unknown_skus_are_skipped(self) -> None:
        offers = self._provider().get_offers(["OTHER-1", "FAKE-NONE-9-CT", "FAKE-ABC123-CT"])
        self.assertEqual([offer.sku for offer in offers], ["FAKE-ABC123-CT"])

    def test_scenarios(self) -> None:
        provider = self._provider()
        oos, eol, nrnd = provider.get_offers(["FAKE-OOS-1-CT", "FAKE-EOL-1-CT", "FAKE-NRND-1-CT"])
        self.assertEqual(oos.stock, 0)
        self.assertEqual(oos.lead_time_days, 112)
        self.assertEqual(eol.lifecycle, Lifecycle.OBSOLETE)
        self.assertEqual(nrnd.lifecycle, Lifecycle.NRND)
        self.assertGreater(nrnd.stock, 0)

    def test_normal_part_restocks(self) -> None:
        start = datetime(2026, 2, 1, tzinfo=timezone.utc)
        stocks = [
            self._provider(start + timedelta(days=day)).get_offers(["FAKE-ABC123-CT"])[0].stock
            for day in range(90)
        ]
        self.assertTrue(any(later > earlier for earlier, later in zip(stocks, stocks[1:])))
        self.assertTrue(any(later < earlier for earlier, later in zip(stocks, stocks[1:])))

    def test_drain_part_empties_and_stays_empty(self) -> None:
        start = datetime(2026, 1, 2, tzinfo=timezone.utc)
        early = self._provider(start).get_offers(["FAKE-DRAIN-1-CT"])[0]
        late = self._provider(start + timedelta(days=200)).get_offers(["FAKE-DRAIN-1-CT"])[0]
        self.assertGreater(early.stock, 0)
        self.assertEqual(late.stock, 0)
        self.assertIsNotNone(late.lead_time_days)

    def test_part_data(self) -> None:
        provider = self._provider()
        data = provider.get_part_data(provider.lookup_mpn("ABC123")[0])
        self.assertEqual(data.package_name, "0603")
        self.assertTrue(data.datasheet_url.startswith("https://"))


class RegistryTests(unittest.TestCase):
    def test_fake_is_registered_but_hidden_by_default(self) -> None:
        self.assertEqual(registry.get_spec("fake").key, "fake")
        self.assertNotIn("fake", [spec.key for spec in registry.list_specs()])
        self.assertIn("fake", [spec.key for spec in registry.list_specs(include_dev=True)])

    def test_unknown_provider(self) -> None:
        with self.assertRaises(registry.UnknownProvider):
            registry.get_spec("nope")

    def test_duplicate_registration_needs_replace(self) -> None:
        with self.assertRaises(ValueError):
            registry.register(registry.get_spec("fake"))
        registry.register(registry.get_spec("fake"), replace=True)

    def test_spec_validation(self) -> None:
        def make(**overrides):
            values = dict(
                key="demo", label="Demo", capabilities=frozenset({CAP_SEARCH}), max_batch=1,
                stock_pooling="pooled", credential_fields=(), factory=lambda config: None,
            )
            values.update(overrides)
            return ProviderSpec(**values)

        make()
        for bad in (
            dict(key="Bad Key"),
            dict(capabilities=frozenset({"teleport"})),
            dict(max_batch=0),
            dict(credential_fields=(CredentialField("k", "K"), CredentialField("k", "K"))),
        ):
            with self.assertRaises(ValueError, msg=str(bad)):
                make(**bad)

    def test_config_repr_hides_credentials(self) -> None:
        config = ProviderConfig(connector_id="c1", credentials={"api_key": "hunter2"})
        self.assertNotIn("hunter2", repr(config))


def _resolver(*addresses: str):
    return lambda host: list(addresses)


class EgressTests(unittest.TestCase):
    def test_accepts_allowed_public_host(self) -> None:
        target = validate_url(
            "https://api.digikey.com/products/v4/search",
            allowed_hosts=["digikey.com"],
            resolve=_resolver("93.184.216.34"),
        )
        self.assertEqual(target.host, "api.digikey.com")
        self.assertEqual(target.addresses, ("93.184.216.34",))

    def test_any_public_host_when_no_allowlist(self) -> None:
        validate_url("https://example.org/ds.pdf", resolve=_resolver("93.184.216.34"))

    def test_rejects_bad_shapes(self) -> None:
        public = _resolver("93.184.216.34")
        for url in (
            "http://example.org/",
            "ftp://example.org/",
            "https://user:pw@example.org/",
            "https://example.org:8443/",
            "https://93.184.216.34/",
            "https://[2001:db8::1]/",
            "https:///path",
            "not a url",
        ):
            with self.assertRaises(EgressDenied, msg=url):
                validate_url(url, resolve=public)

    def test_allowlist_matches_whole_labels_only(self) -> None:
        self.assertTrue(host_allowed("api.digikey.com", ["digikey.com"]))
        self.assertTrue(host_allowed("DigiKey.com.", ["digikey.com"]))
        self.assertFalse(host_allowed("digikey.com.evil.test", ["digikey.com"]))
        self.assertFalse(host_allowed("evildigikey.com", ["digikey.com"]))
        with self.assertRaises(EgressDenied):
            validate_url(
                "https://evildigikey.com/", allowed_hosts=["digikey.com"],
                resolve=_resolver("93.184.216.34"),
            )

    def test_rejects_non_public_resolution(self) -> None:
        for address in ("10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "::ffff:10.0.0.1", "0.0.0.0"):
            with self.assertRaises(EgressDenied, msg=address):
                validate_url("https://example.org/", resolve=_resolver(address))

    def test_one_private_address_among_public_ones_is_enough_to_reject(self) -> None:
        with self.assertRaises(EgressDenied):
            validate_url("https://example.org/", resolve=_resolver("93.184.216.34", "10.0.0.5"))

    def test_rejects_unresolvable(self) -> None:
        with self.assertRaises(EgressDenied):
            validate_url("https://example.org/", resolve=_resolver())


class QuotaTests(unittest.TestCase):
    def _at(self, hour: int, minute: int = 0) -> datetime:
        return datetime(2026, 3, 1, hour, minute, tzinfo=timezone.utc)

    def test_background_spreads_across_the_day(self) -> None:
        state = quota.QuotaState(daily_budget=1000, spent_today=0, interactive_spent_today=0)
        self.assertEqual(quota.background_allowance(state, self._at(0)), 90)
        self.assertEqual(quota.background_allowance(state, self._at(12)), 495)
        self.assertEqual(quota.background_allowance(state, self._at(23, 59)), 900)

    def test_background_subtracts_what_it_spent(self) -> None:
        state = quota.QuotaState(daily_budget=1000, spent_today=400, interactive_spent_today=0)
        self.assertEqual(quota.background_allowance(state, self._at(12)), 95)

    def test_interactive_spending_does_not_eat_the_background_plan(self) -> None:
        state = quota.QuotaState(daily_budget=1000, spent_today=50, interactive_spent_today=50)
        self.assertEqual(quota.background_allowance(state, self._at(12)), 495)

    def test_never_exceeds_the_day(self) -> None:
        state = quota.QuotaState(daily_budget=100, spent_today=100, interactive_spent_today=0)
        self.assertEqual(quota.background_allowance(state, self._at(23, 59)), 0)
        self.assertEqual(quota.interactive_allowance(state), 0)

    def test_interactive_reserve(self) -> None:
        state = quota.QuotaState(daily_budget=1000, spent_today=0, interactive_spent_today=0)
        self.assertEqual(quota.interactive_allowance(state), 100)
        used = quota.QuotaState(daily_budget=1000, spent_today=100, interactive_spent_today=100)
        self.assertEqual(quota.interactive_allowance(used), 0)

    def test_state_validation(self) -> None:
        with self.assertRaises(ValueError):
            quota.QuotaState(daily_budget=10, spent_today=1, interactive_spent_today=2)
        with self.assertRaises(ValueError):
            quota.QuotaState(daily_budget=10, spent_today=0, interactive_spent_today=0, reserve_pct=60)
        with self.assertRaises(ValueError):
            quota.background_allowance(quota.QuotaState(10, 0, 0), datetime(2026, 3, 1))


if __name__ == "__main__":
    unittest.main()
