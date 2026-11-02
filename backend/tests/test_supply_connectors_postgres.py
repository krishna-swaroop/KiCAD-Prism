"""Supply schema, connectors and the call ledger against a real PostgreSQL.

Needs ``PRISM_DATABASE_URL``. Each run uses a disposable schema and drops it.
"""

from __future__ import annotations

import os
import sys
import threading
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class SupplyDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from app.services.postgres_database import database
        from app.services.supply import schema as supply_schema
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.providers import registry
        from app.services.supply.providers.base import CredentialField, ProviderSpec
        from app.services.supply.providers.fake import FakeProvider
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database = database
        cls.supply_schema = supply_schema
        cls.registry = registry
        cls.captured = []

        schema = f"supply_test_{uuid.uuid4().hex[:8]}"
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": schema})()
        cls.store.initialize()

        cls.keyring = CredentialKeyring({"t": os.urandom(32)}, "t")

        def keyed_factory(config):
            cls.captured.append(config)
            return FakeProvider(config)

        cls.keyed_spec = ProviderSpec(
            key="demo_keyed", label="Demo keyed", capabilities=frozenset({"search"}),
            max_batch=10, stock_pooling="separate",
            credential_fields=(CredentialField("api_key", "API key"), CredentialField("secret", "Secret")),
            factory=keyed_factory, storefronts=("uk", "it"),
        )
        registry.register(cls.keyed_spec, replace=True)

        cls.service = ConnectorService(cls.store, keyring_factory=lambda: cls.keyring, allow_dev=lambda: True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.registry.unregister("demo_keyed")
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        self.captured.clear()
        with self.store.connection() as conn:
            conn.execute("DELETE FROM supply_connectors")
            conn.execute("DELETE FROM supply_audit_events")

    # --- migrations -------------------------------------------------------

    def test_the_supply_schema_is_one_catalog_ledger_step_and_running_it_again_changes_nothing(self) -> None:
        from app.services.catalog_schema_migrations import CATALOG_LEDGER

        versions = {step.name: step.version for step in CATALOG_LEDGER.steps}
        self.assertLess(versions["supply_tables"], versions["component_parts"], "component_parts refers to supply_parts, so it comes after")
        self.assertLess(versions["inventory_sources"], versions["supply_catalog_links"], "the links need the catalog tables they refer to")
        count = "SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = current_schema()) + (SELECT count(*) FROM supply_maker_seeds) AS n"
        with self.store.connection() as conn:
            before = conn.execute(count).fetchone()["n"]
            self.supply_schema.create_supply_tables(conn)
            after = conn.execute(count).fetchone()["n"]
        self.assertEqual(before, after)

    # --- connectors -------------------------------------------------------

    def _keyed(self, **overrides):
        values = dict(
            actor="ana@example.com", provider="demo_keyed", storefront="uk",
            credentials={"api_key": "KEY-123", "secret": "SECRET-456"}, currency="gbp",
        )
        values.update(overrides)
        return self.service.create(**values)

    def test_create_without_credentials_uses_provider_defaults(self) -> None:
        connector = self.service.create(actor="ana@example.com", provider="fake")
        self.assertEqual(connector["provider"], "fake")
        self.assertEqual(connector["display_name"], "Simulated market")
        self.assertEqual(connector["daily_budget"], 100_000)
        self.assertEqual(connector["credentials"], {})
        self.assertEqual(connector["credentials_status"], "none")
        self.assertEqual(connector["created_by"], "ana@example.com")

    def test_dev_only_provider_needs_the_server_to_allow_it(self) -> None:
        from app.services.supply.connectors import ConnectorError, ConnectorService

        strict = ConnectorService(self.store, keyring_factory=lambda: self.keyring, allow_dev=lambda: False)
        with self.assertRaises(ConnectorError) as raised:
            strict.create(actor="ana@example.com", provider="fake")
        self.assertEqual(raised.exception.code, "provider_disabled")

    def test_credentials_are_sealed_and_never_returned(self) -> None:
        connector = self._keyed()
        self.assertEqual(connector["credentials"], {"api_key": True, "secret": True})
        self.assertEqual(connector["credentials_status"], "ready")
        self.assertEqual(connector["currency"], "GBP")
        self.assertNotIn("KEY-123", repr(connector))
        with self.store.connection() as conn:
            row = conn.execute("SELECT * FROM supply_connectors WHERE id = %s", (connector["id"],)).fetchone()
            audit = conn.execute("SELECT * FROM supply_audit_events").fetchall()
        self.assertNotIn("KEY-123", row["credential_envelope"])
        self.assertNotIn("SECRET-456", row["credential_envelope"])
        self.assertNotIn("KEY-123", repr(audit))

    def test_load_provider_receives_the_decrypted_credentials(self) -> None:
        connector = self._keyed()
        self.service.load_provider(connector["id"])
        config = self.captured[-1]
        self.assertEqual(config.credentials, {"api_key": "KEY-123", "secret": "SECRET-456"})
        self.assertEqual(config.storefront, "uk")
        self.assertEqual(config.currency, "GBP")
        self.assertNotIn("KEY-123", repr(config))

    def test_an_envelope_copied_to_another_connector_will_not_decrypt(self) -> None:
        from app.services.trackers.secrets import SecretIntegrityError

        first = self._keyed(storefront="uk")
        second = self._keyed(storefront="it")
        with self.store.connection() as conn:
            envelope = conn.execute(
                "SELECT credential_envelope FROM supply_connectors WHERE id = %s", (first["id"],)
            ).fetchone()["credential_envelope"]
            conn.execute(
                "UPDATE supply_connectors SET credential_envelope = %s WHERE id = %s", (envelope, second["id"])
            )
        with self.assertRaises(SecretIntegrityError):
            self.service.load_provider(second["id"])

    def test_credential_set_must_match_the_provider(self) -> None:
        from app.services.supply.connectors import ConnectorError

        for bad in ({}, {"api_key": "x"}, {"api_key": "x", "secret": " "}, {"api_key": "x", "secret": "y", "extra": "z"}):
            with self.assertRaises(ConnectorError, msg=str(bad)) as raised:
                self._keyed(credentials=bad)
            self.assertEqual(raised.exception.code, "invalid_credentials")
        with self.assertRaises(ConnectorError):
            self.service.create(actor="ana@example.com", provider="fake", credentials={"api_key": "x"})

    def test_storefront_rules(self) -> None:
        from app.services.supply.connectors import ConnectorError

        for storefront in ("", "de"):
            with self.assertRaises(ConnectorError, msg=repr(storefront)) as raised:
                self._keyed(storefront=storefront)
            self.assertEqual(raised.exception.code, "invalid_storefront")
        with self.assertRaises(ConnectorError):
            self.service.create(actor="ana@example.com", provider="fake", storefront="uk")

    def test_one_connector_per_provider_and_storefront(self) -> None:
        from app.services.supply.connectors import ConnectorError

        self._keyed(storefront="uk")
        self._keyed(storefront="it")
        with self.assertRaises(ConnectorError) as raised:
            self._keyed(storefront="uk")
        self.assertEqual(raised.exception.code, "duplicate")
        self.assertEqual(len(self.service.list()), 2)

    def test_unknown_provider(self) -> None:
        from app.services.supply.connectors import ConnectorError

        with self.assertRaises(ConnectorError) as raised:
            self.service.create(actor="ana@example.com", provider="nope")
        self.assertEqual(raised.exception.code, "unknown_provider")

    def test_actor_is_required(self) -> None:
        with self.assertRaises(ValueError):
            self.service.create(actor="  ", provider="fake")
        connector = self.service.create(actor="ana@example.com", provider="fake")
        with self.assertRaises(ValueError):
            self.service.pause(connector["id"], actor="", reason="x")

    def test_update_validates_and_audits(self) -> None:
        from app.services.supply.connectors import ConnectorError

        connector = self.service.create(actor="ana@example.com", provider="fake")
        updated = self.service.update(
            connector["id"], actor="ben@example.com",
            display_name="  Sim  ", currency="eur", daily_budget=500, interactive_reserve_pct=20, enabled=False,
        )
        self.assertEqual(
            (updated["display_name"], updated["currency"], updated["daily_budget"],
             updated["interactive_reserve_pct"], updated["enabled"]),
            ("Sim", "EUR", 500, 20, False),
        )
        for bad in (
            dict(daily_budget=-1), dict(daily_budget=True), dict(interactive_reserve_pct=60),
            dict(currency="EURO"), dict(enabled="yes"), dict(provider="other"),
        ):
            with self.assertRaises(ConnectorError, msg=str(bad)):
                self.service.update(connector["id"], actor="ben@example.com", **bad)
        with self.store.connection() as conn:
            actions = [row["action"] for row in conn.execute(
                "SELECT action FROM supply_audit_events WHERE subject_id = %s ORDER BY id", (connector["id"],)
            ).fetchall()]
        self.assertEqual(actions, ["connector.create", "connector.update"])

    def test_set_credentials_replaces_the_set_and_audits_names_only(self) -> None:
        connector = self._keyed()
        self.service.set_credentials(
            connector["id"], actor="ben@example.com",
            credentials={"api_key": "NEW-KEY", "secret": "NEW-SECRET"},
        )
        self.service.load_provider(connector["id"])
        self.assertEqual(self.captured[-1].credentials["api_key"], "NEW-KEY")
        with self.store.connection() as conn:
            detail = conn.execute(
                "SELECT detail FROM supply_audit_events WHERE action = 'connector.credentials'"
            ).fetchone()["detail"]
        self.assertEqual(detail, {"names": ["api_key", "secret"]})

    def test_paused_or_disabled_connectors_do_not_load(self) -> None:
        from app.services.supply.connectors import ConnectorError

        connector = self.service.create(actor="ana@example.com", provider="fake")
        self.service.load_provider(connector["id"])
        paused = self.service.pause(connector["id"], actor="ana@example.com", reason="over budget")
        self.assertEqual(paused["paused_reason"], "over budget")
        with self.assertRaises(ConnectorError) as raised:
            self.service.load_provider(connector["id"])
        self.assertEqual(raised.exception.code, "connector_inactive")
        self.service.resume(connector["id"], actor="ana@example.com")
        self.service.load_provider(connector["id"])
        self.service.update(connector["id"], actor="ana@example.com", enabled=False)
        with self.assertRaises(ConnectorError):
            self.service.load_provider(connector["id"])
        with self.assertRaises(ConnectorError):
            self.service.pause(connector["id"], actor="ana@example.com", reason="  ")

    def test_call_results_are_recorded(self) -> None:
        connector = self.service.create(actor="ana@example.com", provider="fake")
        self.service.record_result(connector["id"], "rate_limited")
        failed = self.service.get(connector["id"])
        self.assertEqual(failed["last_error_code"], "rate_limited")
        self.assertIsNotNone(failed["last_error_at"])
        self.service.record_result(connector["id"])
        ok = self.service.get(connector["id"])
        self.assertEqual(ok["last_error_code"], "")
        self.assertIsNotNone(ok["last_ok_at"])

    def test_missing_connector(self) -> None:
        from app.services.supply.connectors import ConnectorNotFound

        for call in (
            lambda: self.service.get("nope"),
            lambda: self.service.update("nope", actor="a", enabled=True),
            lambda: self.service.pause("nope", actor="a", reason="x"),
            lambda: self.service.delete("nope", actor="a"),
            lambda: self.service.load_provider("nope"),
        ):
            with self.assertRaises(ConnectorNotFound):
                call()

    def test_locked_keyring_blocks_storing_but_not_listing(self) -> None:
        from app.services.supply.connectors import ConnectorService
        from app.services.trackers.secrets import SecretStoreLocked

        connector = self._keyed()

        def locked():
            raise SecretStoreLocked("locked")

        service = ConnectorService(self.store, keyring_factory=locked, allow_dev=lambda: True)
        listed = service.list()
        self.assertEqual(listed[0]["credentials_status"], "locked")
        with self.assertRaises(SecretStoreLocked):
            service.create(
                actor="ana@example.com", provider="demo_keyed", storefront="it",
                credentials={"api_key": "a", "secret": "b"},
            )
        with self.assertRaises(SecretStoreLocked):
            service.load_provider(connector["id"])

    def test_removed_provider_plugin_leaves_the_row_visible(self) -> None:
        connector = self._keyed()
        self.registry.unregister("demo_keyed")
        try:
            row = self.service.get(connector["id"])
        finally:
            self.registry.register(self.keyed_spec, replace=True)
        self.assertFalse(row["provider_available"])
        self.assertEqual(row["provider_label"], "demo_keyed")
        self.assertEqual(row["credentials"], {})

    # --- ledger -----------------------------------------------------------

    def test_ledger_enforces_background_and_reserve_budgets(self) -> None:
        from app.services.supply import ledger

        connector = self.service.create(actor="ana@example.com", provider="fake", daily_budget=100)
        noon = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        common = dict(daily_budget=100, reserve_pct=10, now=noon)

        def spend(units: int, interactive: bool = False) -> bool:
            with self.store.connection() as conn:
                return ledger.try_spend(conn, connector["id"], units, interactive=interactive, **common)

        self.assertTrue(spend(50))
        self.assertFalse(spend(1))
        self.assertTrue(spend(10, interactive=True))
        self.assertFalse(spend(1, interactive=True))
        with self.store.connection() as conn:
            state = ledger.get_state(conn, connector["id"], **common)
        self.assertEqual((state.spent_today, state.interactive_spent_today), (60, 10))
        with self.assertRaises(ValueError):
            spend(0)

    def test_ledger_days_are_independent(self) -> None:
        from app.services.supply import ledger

        connector = self.service.create(actor="ana@example.com", provider="fake", daily_budget=100)
        end_of_day = datetime(2026, 3, 1, 23, 59, tzinfo=timezone.utc)
        next_day = datetime(2026, 3, 2, 0, 1, tzinfo=timezone.utc)
        with self.store.connection() as conn:
            self.assertTrue(ledger.try_spend(
                conn, connector["id"], 90, interactive=False, daily_budget=100, reserve_pct=10, now=end_of_day))
        with self.store.connection() as conn:
            self.assertTrue(ledger.try_spend(
                conn, connector["id"], 9, interactive=False, daily_budget=100, reserve_pct=10, now=next_day))

    def test_concurrent_spenders_cannot_overspend(self) -> None:
        from app.services.supply import ledger

        connector = self.service.create(actor="ana@example.com", provider="fake", daily_budget=100)
        noon = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        barrier = threading.Barrier(6)
        results: list[bool] = []
        errors: list[BaseException] = []

        def worker() -> None:
            try:
                barrier.wait()
                with self.store.connection() as conn:
                    results.append(ledger.try_spend(
                        conn, connector["id"], 10, interactive=False,
                        daily_budget=100, reserve_pct=10, now=noon))
            except BaseException as error:  # noqa: BLE001 - reported below
                errors.append(error)

        threads = [threading.Thread(target=worker) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
        self.assertEqual(errors, [])
        # Background allowance at noon is 50: exactly five spends of 10 fit.
        self.assertEqual(sorted(results), [False, True, True, True, True, True])

    def test_deleting_a_connector_removes_its_ledger(self) -> None:
        from app.services.supply import ledger

        connector = self.service.create(actor="ana@example.com", provider="fake", daily_budget=100)
        noon = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        with self.store.connection() as conn:
            ledger.try_spend(conn, connector["id"], 5, interactive=False,
                             daily_budget=100, reserve_pct=10, now=noon)
        self.service.delete(connector["id"], actor="ana@example.com")
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_quota_ledger").fetchone()["n"], 0)
            self.assertEqual(conn.execute(
                "SELECT COUNT(*) AS n FROM supply_audit_events WHERE action = 'connector.delete'"
            ).fetchone()["n"], 1)


if __name__ == "__main__":
    unittest.main()
