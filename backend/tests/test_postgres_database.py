"""Connection setup for a PostgreSQL that is not on this machine.

Prism is deployed with the database on a managed instance or another host as
often as not. In that arrangement an idle connection can be dropped by a NAT
gateway or load balancer without either end being told, and the failure shows
up as a job dying on a connection the pool believed was fine.
"""

import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services import postgres_database


class ConnectionKeywordTests(unittest.TestCase):
    DSN = "postgresql://prism:secret@db.internal:5432/kicad_prism"

    def test_keepalives_and_a_connect_timeout_are_applied(self) -> None:
        kwargs = postgres_database.connection_kwargs(self.DSN)

        self.assertEqual(kwargs["keepalives"], 1)
        self.assertEqual(
            kwargs["keepalives_idle"], settings.PRISM_DATABASE_KEEPALIVE_IDLE_SECONDS
        )
        self.assertEqual(
            kwargs["connect_timeout"],
            settings.PRISM_DATABASE_CONNECT_TIMEOUT_SECONDS,
        )
        self.assertGreater(kwargs["keepalives_count"], 0)

    def test_rows_come_back_as_dictionaries_inside_a_transaction(self) -> None:
        """Every caller in the codebase reads columns by name and commits itself."""
        kwargs = postgres_database.connection_kwargs(self.DSN)

        self.assertFalse(kwargs["autocommit"])
        self.assertIsNotNone(kwargs["row_factory"])

    def test_a_value_set_in_the_dsn_is_not_overridden(self) -> None:
        """An operator who tuned the DSN for their network keeps their tuning."""
        kwargs = postgres_database.connection_kwargs(
            f"{self.DSN}?connect_timeout=42&keepalives_idle=600"
        )

        self.assertNotIn("connect_timeout", kwargs)
        self.assertNotIn("keepalives_idle", kwargs)
        # Untouched defaults still apply.
        self.assertEqual(kwargs["keepalives"], 1)

    def test_an_unparseable_dsn_still_yields_usable_defaults(self) -> None:
        """Reporting the bad DSN is psycopg's job; this must not raise first."""
        kwargs = postgres_database.connection_kwargs("this is not a dsn")

        self.assertEqual(kwargs["keepalives"], 1)
        self.assertIn("connect_timeout", kwargs)


class PoolConstructionTests(unittest.TestCase):
    def test_the_pool_checks_a_connection_before_lending_it(self) -> None:
        """Without this the pool hands out connections a middlebox already killed."""
        recorded = {}

        class FakePool:
            @staticmethod
            def check_connection(connection):
                pass

            def __init__(self, **kwargs):
                recorded.update(kwargs)

            def open(self, wait=False):
                pass

        database = postgres_database.PostgresDatabase()
        with patch.dict(
            "sys.modules",
            {"psycopg_pool": type("m", (), {"ConnectionPool": FakePool})},
        ), patch.object(
            postgres_database,
            "postgres_dsn",
            return_value="postgresql://prism@db.internal/kicad_prism",
        ):
            database.pool()

        self.assertIsNotNone(recorded.get("check"))
        self.assertEqual(
            recorded["max_lifetime"],
            settings.PRISM_DATABASE_POOL_MAX_LIFETIME_SECONDS,
        )
        self.assertEqual(recorded["kwargs"]["keepalives"], 1)


if __name__ == "__main__":
    unittest.main()
