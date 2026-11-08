"""Provider authorization codes and bootstrap tokens are single-use.

The exchange paths run under concurrent requests, so a code or a bootstrap jti
is claimed with one atomic statement. A check-then-act pair would let two
exchanges both succeed.
"""

from __future__ import annotations

import json
import secrets
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services import provider_auth_service  # noqa: E402
from app.services.catalog.provider_tokens import CatalogProviderTokens  # noqa: E402

SECRET = "test-secret-at-least-32-characters-long-x"


class _Result:
    def __init__(self, row=None) -> None:
        self._row = row

    def fetchone(self):
        return self._row


class _AuthCodeConn:
    """An ``oauth_auth_codes`` table that refuses a read before the claim."""

    def __init__(self, rows: dict) -> None:
        self.rows = dict(rows)

    def execute(self, sql: str, params=()):
        statement = " ".join(sql.split()).upper()
        if statement.startswith("SELECT"):
            raise AssertionError("consume_auth_code must delete and read in one statement")
        if statement.startswith("DELETE FROM OAUTH_AUTH_CODES WHERE CODE = %S RETURNING"):
            return _Result(self.rows.pop(params[0], None))
        if statement.startswith("DELETE FROM OAUTH_AUTH_CODES WHERE EXP <= %S"):
            self.rows = {code: row for code, row in self.rows.items() if int(row["exp"]) > params[0]}
            return _Result()
        raise AssertionError(f"unexpected statement: {statement}")


class _RevocationConn:
    def __init__(self) -> None:
        self.claimed: set[str] = set()

    def execute(self, sql: str, params=()):
        statement = " ".join(sql.split()).upper()
        assert statement.startswith("INSERT INTO OAUTH_REVOKED_TOKENS")
        assert "ON CONFLICT (JTI) DO NOTHING" in statement
        assert "RETURNING 1" in statement
        jti = params[0]
        if jti in self.claimed:
            return _Result()
        self.claimed.add(jti)
        return _Result({"1": 1})


class _FakeRevocationDb:
    def __init__(self) -> None:
        self.revoked: set[str] = set()

    def is_token_revoked(self, jti: str) -> bool:
        return jti in self.revoked

    def claim_revocation(self, jti: str, exp: int) -> bool:
        if jti in self.revoked:
            return False
        self.revoked.add(jti)
        return True

    def add_revoked_token(self, jti: str, exp: int) -> None:
        self.revoked.add(jti)


class AuthorizationCodeTests(unittest.TestCase):
    def test_an_authorization_code_is_consumed_once(self) -> None:
        conn = _AuthCodeConn(
            {"abc": {"grant_json": json.dumps({"email": "d@example.com"}), "exp": 200}}
        )
        tokens = CatalogProviderTokens()
        self.assertEqual(
            tokens.consume_auth_code(conn, "abc", now=100), {"email": "d@example.com"}
        )
        self.assertIsNone(tokens.consume_auth_code(conn, "abc", now=100))

    def test_an_expired_authorization_code_is_refused_and_swept(self) -> None:
        conn = _AuthCodeConn(
            {
                "expired": {"grant_json": "{}", "exp": 100},
                "live": {"grant_json": "{}", "exp": 300},
            }
        )
        tokens = CatalogProviderTokens()
        self.assertIsNone(tokens.consume_auth_code(conn, "expired", now=150))
        self.assertEqual(len(conn.rows), 1)
        self.assertIn("live", conn.rows)

    def test_the_expired_sweep_runs_after_the_claim(self) -> None:
        conn = _AuthCodeConn(
            {"stale": {"grant_json": "{}", "exp": 50}, "abc": {"grant_json": "{}", "exp": 200}}
        )
        self.assertIsNotNone(CatalogProviderTokens.consume_auth_code(conn, "abc", now=100))
        self.assertNotIn("stale", conn.rows)


class ClaimRevocationTests(unittest.TestCase):
    def test_only_the_first_claim_wins(self) -> None:
        conn = _RevocationConn()
        tokens = CatalogProviderTokens()
        self.assertTrue(tokens.claim_revocation(conn, "jti-1", 200))
        self.assertFalse(tokens.claim_revocation(conn, "jti-1", 200))
        self.assertTrue(tokens.claim_revocation(conn, "jti-2", 200))


class BootstrapTokenTests(unittest.TestCase):
    def _token(self, **overrides) -> str:
        payload = {
            "type": "bootstrap",
            "email": "d@example.com",
            "name": "D",
            "picture": "",
            "role": "designer",
            "next_url": "https://prism.example/",
            "jti": secrets.token_urlsafe(12),
            "exp": provider_auth_service._now() + 120,
        }
        payload.update(overrides)
        return provider_auth_service._encode_payload(payload)

    def test_a_bootstrap_token_is_consumed_once(self) -> None:
        db = _FakeRevocationDb()
        with patch.object(settings, "SESSION_SECRET", SECRET), patch.object(
            provider_auth_service, "_db", return_value=db
        ):
            token = self._token()
            self.assertEqual(
                provider_auth_service.consume_bootstrap_token(token)["email"], "d@example.com"
            )
            with self.assertRaises(HTTPException) as ctx:
                provider_auth_service.consume_bootstrap_token(token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_a_lost_revocation_claim_is_refused(self) -> None:
        class _AlreadyClaimedDb(_FakeRevocationDb):
            def is_token_revoked(self, jti: str) -> bool:
                return False

            def claim_revocation(self, jti: str, exp: int) -> bool:
                return False

        with patch.object(settings, "SESSION_SECRET", SECRET), patch.object(
            provider_auth_service, "_db", return_value=_AlreadyClaimedDb()
        ):
            token = self._token()
            with self.assertRaises(HTTPException) as ctx:
                provider_auth_service.consume_bootstrap_token(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid bootstrap token")

    def test_a_bootstrap_token_without_a_jti_is_refused(self) -> None:
        with patch.object(settings, "SESSION_SECRET", SECRET), patch.object(
            provider_auth_service, "_db", return_value=_FakeRevocationDb()
        ):
            token = self._token(jti="")
            with self.assertRaises(HTTPException) as ctx:
                provider_auth_service.consume_bootstrap_token(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid bootstrap token")


if __name__ == "__main__":
    unittest.main()
