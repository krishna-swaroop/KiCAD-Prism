"""Regression tests for the V3 authentication hardening.

These cover the failure modes that would expose customer PCB IP: silently
disabled authentication, an authorization code accepted without the login
transaction that produced it, a token accepted for the wrong audience, and a
session that survives logout or revocation.
"""

from __future__ import annotations

import asyncio
import re
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import security, session  # noqa: E402
from app.core.config import Settings, settings  # noqa: E402
from app.services import auth_service, session_store_service  # noqa: E402

TEST_SECRET = "b8f0c1a2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60"


class AuthConfigurationFailClosedTests(unittest.TestCase):
    """A misconfigured deployment must refuse to start, never serve open access."""

    def _settings(self, **overrides) -> Settings:
        base = {
            "AUTH_ENABLED": True,
            "OIDC_ISSUER_URL": "https://idp.example.com",
            "OIDC_CLIENT_ID": "prism",
            "OIDC_CLIENT_SECRET": "shhh",
            "SESSION_SECRET": TEST_SECRET,
            "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        }
        base.update(overrides)
        # _env_file=None keeps a developer's local .env out of these assertions.
        return Settings(_env_file=None, **base)

    def test_complete_configuration_is_accepted(self) -> None:
        self.assertEqual(self._settings().auth_configuration_errors(), [])

    def test_missing_oidc_secret_blocks_startup_instead_of_disabling_auth(self) -> None:
        # OIDC is partially configured (issuer + client id, no secret) and
        # password auth is off, so this must fail closed rather than serve open.
        broken = self._settings(OIDC_CLIENT_SECRET="")
        # The old behaviour: AUTH_ENABLED silently became False and every caller
        # was served as an admin guest.
        self.assertTrue(broken.AUTH_ENABLED)
        self.assertIn(
            "OIDC_CLIENT_SECRET is required to enable OIDC",
            broken.auth_configuration_errors(),
        )
        with self.assertRaises(RuntimeError):
            broken.validate_auth_configuration()

    def test_password_auth_alone_is_a_valid_method(self) -> None:
        # No OIDC configured, password auth on: a complete, accepted deployment.
        configured = self._settings(
            OIDC_ISSUER_URL="",
            OIDC_CLIENT_ID="",
            OIDC_CLIENT_SECRET="",
            PASSWORD_AUTH_ENABLED=True,
        )
        self.assertTrue(configured.AUTH_ENABLED)
        self.assertEqual(configured.auth_configuration_errors(), [])

    def test_no_method_at_all_blocks_startup(self) -> None:
        # AUTH_ENABLED with neither OIDC nor password is the dangerous case.
        broken = self._settings(
            OIDC_ISSUER_URL="",
            OIDC_CLIENT_ID="",
            OIDC_CLIENT_SECRET="",
            PASSWORD_AUTH_ENABLED=False,
        )
        errors = broken.auth_configuration_errors()
        self.assertTrue(any("requires a login method" in error for error in errors))
        with self.assertRaises(RuntimeError):
            broken.validate_auth_configuration()

    def test_password_and_oidc_can_coexist(self) -> None:
        both = self._settings(PASSWORD_AUTH_ENABLED=True)
        self.assertEqual(both.auth_configuration_errors(), [])

    def test_dev_mode_no_longer_disables_authentication(self) -> None:
        self.assertTrue(self._settings(DEV_MODE=True).AUTH_ENABLED)

    def test_weak_session_secrets_are_rejected(self) -> None:
        for secret in ("", "short", "change-me", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"):
            with self.subTest(secret=secret):
                errors = self._settings(SESSION_SECRET=secret).auth_configuration_errors()
                self.assertTrue(any("SESSION_SECRET" in error for error in errors))

    def test_external_issuer_without_audience_is_rejected(self) -> None:
        errors = self._settings(
            OAUTH_EXTERNAL_JWT_ISSUER_URL="https://issuer.example.com"
        ).auth_configuration_errors()
        self.assertTrue(any("OAUTH_EXTERNAL_JWT_AUDIENCE" in error for error in errors))

    def test_cookie_secure_follows_public_base_url(self) -> None:
        self.assertTrue(self._settings(PUBLIC_BASE_URL="https://prism.example.com").SESSION_COOKIE_SECURE)
        self.assertFalse(self._settings(PUBLIC_BASE_URL="http://127.0.0.1:8080").SESSION_COOKIE_SECURE)
        self.assertTrue(
            self._settings(PUBLIC_BASE_URL="http://127.0.0.1:8080", SESSION_COOKIE_SECURE=True).SESSION_COOKIE_SECURE
        )

    def test_blank_cookie_secure_falls_back_to_public_base_url(self) -> None:
        # docker-compose.yml sends SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-},
        # so leaving it commented out in .env delivers "" rather than nothing at all.
        # That used to raise a pydantic bool_parsing error at import time and the
        # backend never started.
        self.assertTrue(
            self._settings(PUBLIC_BASE_URL="https://prism.example.com", SESSION_COOKIE_SECURE="").SESSION_COOKIE_SECURE
        )
        self.assertFalse(
            self._settings(PUBLIC_BASE_URL="http://127.0.0.1:8080", SESSION_COOKIE_SECURE="   ").SESSION_COOKIE_SECURE
        )

    def test_unparseable_cookie_secure_is_still_rejected(self) -> None:
        # Only blank is treated as unset. A typo must not quietly become False.
        with self.assertRaises(ValidationError):
            self._settings(SESSION_COOKIE_SECURE="ture")

    def test_disabled_authentication_is_fine_on_localhost(self) -> None:
        """The evaluation path the plain-HTTP installer scheme depends on."""
        evaluation = Settings(
            _env_file=None,
            AUTH_ENABLED=False,
            PUBLIC_BASE_URL="http://localhost:8080",
        )
        self.assertEqual(evaluation.auth_configuration_errors(), [])


class OpenAuthOnAReachableHostTests(unittest.TestCase):
    """AUTH_ENABLED=false is for evaluation. Production shape must not start."""

    def _open(self, **overrides) -> Settings:
        return Settings(_env_file=None, AUTH_ENABLED=False, **overrides)

    def test_tls_on_a_routable_name_refuses_to_start(self) -> None:
        errors = self._open(PUBLIC_BASE_URL="https://prism.pixxel.space").auth_configuration_errors()
        self.assertTrue(any("not allowed with PUBLIC_BASE_URL" in error for error in errors))

    def test_admin_guest_on_a_reachable_host_refuses_to_start(self) -> None:
        errors = self._open(
            PUBLIC_BASE_URL="http://prism.internal.example",
            DEV_GUEST_ROLE="admin",
        ).auth_configuration_errors()
        self.assertTrue(any("DEV_GUEST_ROLE=admin" in error for error in errors))

    def test_lan_evaluation_with_a_viewer_guest_still_starts(self) -> None:
        """A LAN demo over plain HTTP stays possible; it just cannot be admin."""
        self.assertEqual(
            self._open(
                PUBLIC_BASE_URL="http://prism.internal.example",
                DEV_GUEST_ROLE="viewer",
            ).auth_configuration_errors(),
            [],
        )

    def test_the_guest_role_default_is_least_privilege(self) -> None:
        # Read the declared default, not a constructed Settings. `_env_file=None`
        # only suppresses the .env file; pydantic-settings still reads the
        # process environment, and the CI backend job exports
        # DEV_GUEST_ROLE=admin for its own fixtures. Asserting the resolved value
        # would test the runner's environment rather than this repository.
        self.assertEqual(Settings.model_fields["DEV_GUEST_ROLE"].default, "viewer")

    def test_an_unparseable_base_url_counts_as_remote(self) -> None:
        self.assertFalse(self._open(PUBLIC_BASE_URL="http://[").BASE_URL_IS_LOCAL)

    def test_an_unset_base_url_does_not_break_an_existing_dev_checkout(self) -> None:
        """Unset is the default, so it describes a checkout, not a deployment.

        Treating it as remote would turn this into a hard startup refusal for
        anyone whose .env already carries DEV_GUEST_ROLE=admin and no
        PUBLIC_BASE_URL -- an upgrade that stops the application, which is
        exactly what the expand-only rule exists to prevent.
        """
        unconfigured = self._open(PUBLIC_BASE_URL="", DEV_GUEST_ROLE="admin")
        self.assertTrue(unconfigured.BASE_URL_IS_LOCAL)
        self.assertEqual(unconfigured.auth_configuration_errors(), [])

    def test_open_authentication_is_always_warned_about(self) -> None:
        warnings = self._open(PUBLIC_BASE_URL="http://localhost:8080").configuration_warnings()
        self.assertTrue(any("AUTH_ENABLED=false" in warning for warning in warnings))

    def test_compose_and_settings_declare_the_same_guest_default(self) -> None:
        """One setting, two defaults, and the Compose one is what runs.

        `DEV_GUEST_ROLE=${DEV_GUEST_ROLE:-...}` in docker-compose.yml overrides
        the field default for every containerised deployment, so lowering the
        Python default alone changed nothing where it mattered. Whoever moves
        one of these has to move the other.
        """
        compose = (Path(__file__).resolve().parents[2] / "docker-compose.yml").read_text(encoding="utf-8")
        declared = re.search(r"DEV_GUEST_ROLE=\$\{DEV_GUEST_ROLE:-(\w+)\}", compose)
        self.assertIsNotNone(declared, "docker-compose.yml no longer defaults DEV_GUEST_ROLE")
        self.assertEqual(declared.group(1), Settings.model_fields["DEV_GUEST_ROLE"].default)

    def test_an_empty_git_import_allowlist_is_warned_about(self) -> None:
        """Import will otherwise clone anything a user names, from this network."""
        warnings = Settings(_env_file=None, IMPORT_ALLOWED_HOSTS_STR="").configuration_warnings()
        self.assertTrue(any("IMPORT_ALLOWED_HOSTS_STR" in warning for warning in warnings))

        configured = Settings(_env_file=None, IMPORT_ALLOWED_HOSTS_STR="github.com")
        self.assertFalse(
            any("IMPORT_ALLOWED_HOSTS_STR" in warning for warning in configured.configuration_warnings())
        )


class SessionTokenTests(unittest.TestCase):
    def setUp(self) -> None:
        self._patcher = patch.object(settings, "SESSION_SECRET", TEST_SECRET)
        self._patcher.start()
        self.addCleanup(self._patcher.stop)

    def test_session_token_round_trip_carries_only_an_opaque_id(self) -> None:
        token = session.create_session_token("session-abc")
        payload = session.decode_session_token(token)
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["sid"], "session-abc")
        # Identity must not be recoverable from the cookie itself.
        self.assertNotIn("email", payload)

    def test_tampered_signature_is_rejected(self) -> None:
        token = session.create_session_token("session-abc")
        version, body, signature = token.split(".")
        forged = f"{version}.{body}.{signature[:-2]}xy"
        self.assertIsNone(session.decode_session_token(forged))

    def test_legacy_v1_identity_cookies_no_longer_authenticate(self) -> None:
        legacy = "v1.eyJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIn0.deadbeef"
        self.assertIsNone(session.decode_session_token(legacy))

    def test_transaction_token_cannot_be_replayed_as_a_session(self) -> None:
        """Domain-separated signing keeps the two token families apart."""
        transaction = session.create_oidc_transaction_token(
            state="s", nonce="n", code_verifier="v", redirect_uri="https://prism/cb"
        )
        self.assertIsNone(session.decode_session_token(transaction))
        self.assertIsNone(session.decode_oidc_transaction_token(session.create_session_token("sid")))

    def test_expired_transaction_token_is_rejected(self) -> None:
        transaction = session.create_oidc_transaction_token(
            state="s", nonce="n", code_verifier="v", redirect_uri="https://prism/cb"
        )
        with patch.object(time, "time", return_value=time.time() + session.OIDC_TRANSACTION_TTL_SECONDS + 5):
            self.assertIsNone(session.decode_oidc_transaction_token(transaction))


class OidcExchangeTests(unittest.TestCase):
    def test_pkce_challenge_matches_rfc7636_s256(self) -> None:
        # Verifier and challenge from RFC 7636 appendix B.
        self.assertEqual(
            auth_service.pkce_code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        )

    def test_authorization_url_always_carries_pkce_and_nonce(self) -> None:
        with patch.object(
            auth_service,
            "get_oidc_metadata",
            return_value={"authorization_endpoint": "https://idp.example.com/authorize"},
        ), patch.object(settings, "OIDC_CLIENT_ID", "prism"):
            url = auth_service.build_oidc_authorization_url(
                redirect_uri="https://prism.example.com/auth/callback",
                state="state-value",
                nonce="nonce-value",
                code_verifier="verifier-value",
            )

        self.assertIn("code_challenge_method=S256", url)
        self.assertIn("nonce=nonce-value", url)
        self.assertIn(
            f"code_challenge={auth_service.pkce_code_challenge('verifier-value')}".replace("=", "=", 1),
            url.replace("%3D", "="),
        )

    def test_exchange_requires_a_login_transaction(self) -> None:
        """Without a server-issued nonce and verifier the callback cannot authenticate."""
        with patch.object(auth_service, "oidc_enabled", return_value=True):
            for nonce, verifier in (("", "verifier"), ("nonce", "")):
                with self.subTest(nonce=nonce, verifier=verifier):
                    with self.assertRaises(HTTPException) as ctx:
                        auth_service.authenticate_oidc_auth_code(
                            code="abc",
                            redirect_uri="https://prism.example.com/auth/callback",
                            expected_nonce=nonce,
                            code_verifier=verifier,
                        )
                    self.assertEqual(ctx.exception.status_code, 400)

    def test_verify_jwt_refuses_to_run_without_an_audience(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            auth_service._verify_jwt("token", issuer="https://idp.example.com", audience="")
        self.assertEqual(ctx.exception.status_code, 500)

    def test_mismatched_nonce_is_rejected(self) -> None:
        with patch.object(auth_service, "oidc_enabled", return_value=True), patch.object(
            auth_service, "_exchange_oidc_code", return_value={"id_token": "signed", "access_token": ""}
        ), patch.object(auth_service, "_verify_jwt", return_value={"sub": "user-1", "nonce": "other"}):
            with self.assertRaises(HTTPException) as ctx:
                auth_service.authenticate_oidc_auth_code(
                    code="abc",
                    redirect_uri="https://prism.example.com/auth/callback",
                    expected_nonce="expected",
                    code_verifier="verifier",
                )
        self.assertEqual(ctx.exception.status_code, 401)

    def test_userinfo_with_a_different_subject_is_rejected(self) -> None:
        """OIDC Core 5.3.2 - a mismatched userinfo subject can substitute an identity."""
        with patch.object(auth_service, "oidc_enabled", return_value=True), patch.object(
            auth_service, "_exchange_oidc_code", return_value={"id_token": "signed", "access_token": "at"}
        ), patch.object(
            auth_service, "_verify_jwt", return_value={"sub": "user-1", "nonce": "expected", "email": "real@example.com"}
        ), patch.object(
            auth_service, "_fetch_userinfo", return_value={"sub": "attacker", "email": "attacker@example.com"}
        ):
            with self.assertRaises(HTTPException) as ctx:
                auth_service.authenticate_oidc_auth_code(
                    code="abc",
                    redirect_uri="https://prism.example.com/auth/callback",
                    expected_nonce="expected",
                    code_verifier="verifier",
                )
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_id_token_is_rejected(self) -> None:
        with patch.object(auth_service, "oidc_enabled", return_value=True), patch.object(
            auth_service, "_exchange_oidc_code", return_value={"access_token": "at"}
        ):
            with self.assertRaises(HTTPException) as ctx:
                auth_service.authenticate_oidc_auth_code(
                    code="abc",
                    redirect_uri="https://prism.example.com/auth/callback",
                    expected_nonce="expected",
                    code_verifier="verifier",
                )
        self.assertEqual(ctx.exception.status_code, 401)


class SessionRevocationTests(unittest.TestCase):
    """get_current_user must consult the session store, not just the cookie."""

    def setUp(self) -> None:
        self._patcher = patch.object(settings, "SESSION_SECRET", TEST_SECRET)
        self._patcher.start()
        self.addCleanup(self._patcher.stop)

    def _request(self, token: str):
        class _Request:
            cookies = {session.SESSION_COOKIE_NAME: token}
            headers: dict[str, str] = {}

        return _Request()

    def test_revoked_session_is_rejected_even_with_a_valid_cookie(self) -> None:
        token = session.create_session_token("revoked-session")
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), patch.object(
            session_store_service, "load_session", return_value=None
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(security.get_current_user(self._request(token)))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_live_session_resolves_identity_from_the_store(self) -> None:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        record = session_store_service.SessionRecord(
            session_id="live-session",
            email="designer@example.com",
            name="Designer",
            picture="",
            created_at=now,
            expires_at=now,
            last_seen_at=now,
        )
        token = session.create_session_token("live-session")
        with patch.object(settings, "AUTH_ENABLED_OVERRIDE", True), patch.object(
            session_store_service, "load_session", return_value=record
        ), patch.object(security, "_resolve_allowed_user_role", return_value="designer"):
            user = asyncio.run(security.get_current_user(self._request(token)))

        self.assertEqual(user.email, "designer@example.com")
        self.assertEqual(user.role, "designer")
        self.assertEqual(user.session_id, "live-session")

    def test_guest_role_is_configurable_and_only_reachable_with_auth_disabled(self) -> None:
        with patch.object(settings, "DEV_GUEST_ROLE", "viewer"):
            self.assertEqual(security.guest_user().role, "viewer")
        with patch.object(settings, "DEV_GUEST_ROLE", "nonsense"):
            self.assertEqual(security.guest_user().role, "viewer")


if __name__ == "__main__":
    unittest.main()
