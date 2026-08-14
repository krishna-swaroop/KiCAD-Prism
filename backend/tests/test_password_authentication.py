from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import auth_service  # noqa: E402
from app.services.password_credential_service import PasswordVerification  # noqa: E402


def _ok(must_change: bool = False) -> PasswordVerification:
    return PasswordVerification(ok=True, must_change=must_change)


def _bad() -> PasswordVerification:
    return PasswordVerification(ok=False)


class AuthenticatePasswordTests(unittest.TestCase):
    """Authorization logic around password verification, with the store mocked."""

    def _run(
        self,
        *,
        verification: PasswordVerification,
        role: str | None = "viewer",
        allowed_users: tuple[str, ...] = (),
        allowed_domains: tuple[str, ...] = (),
        email: str = "user@example.com",
        password: str = "a valid password",
    ):
        with patch.object(auth_service.password_credential_service, "verify_password", return_value=verification), \
             patch.object(auth_service.access_service, "ensure_default_viewer_assignment"), \
             patch.object(auth_service.access_service, "resolve_user_role", return_value=role), \
             patch.object(auth_service.settings, "ALLOWED_USERS_STR", ",".join(allowed_users)), \
             patch.object(auth_service.settings, "ALLOWED_DOMAINS_STR", ",".join(allowed_domains)):
            return auth_service.authenticate_password(email, password)

    def test_success_returns_resolved_user(self) -> None:
        result = self._run(verification=_ok(), role="designer")
        self.assertEqual(result.user.email, "user@example.com")
        self.assertEqual(result.user.role, "designer")
        self.assertEqual(result.user.name, "user")  # email local-part
        self.assertFalse(result.must_change_password)

    def test_must_change_flag_carries_through(self) -> None:
        result = self._run(verification=_ok(must_change=True))
        self.assertTrue(result.must_change_password)

    def test_wrong_password_is_generic_401(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._run(verification=_bad())
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Invalid email or password.")

    def test_empty_credentials_are_generic_401(self) -> None:
        for email, password in (("", "pw"), ("user@example.com", "")):
            with self.assertRaises(HTTPException) as ctx:
                self._run(verification=_ok(), email=email, password=password)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertEqual(ctx.exception.detail, "Invalid email or password.")

    def test_unknown_email_and_wrong_password_are_indistinguishable(self) -> None:
        # Both surface as the same 401 with the same message, so a caller cannot
        # tell whether the account exists.
        with self.assertRaises(HTTPException) as unknown:
            self._run(verification=_bad(), email="nobody@example.com")
        with self.assertRaises(HTTPException) as wrong:
            self._run(verification=_bad(), email="user@example.com")
        self.assertEqual(unknown.exception.detail, wrong.exception.detail)
        self.assertEqual(unknown.exception.status_code, wrong.exception.status_code)

    def test_allowlist_blocks_after_password_matches(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._run(verification=_ok(), allowed_users=("someone-else@example.com",))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_domain_allowlist_blocks_wrong_domain(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._run(verification=_ok(), allowed_domains=("allowed.com",), email="user@notallowed.com")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_domain_allowlist_permits_right_domain(self) -> None:
        result = self._run(verification=_ok(), allowed_domains=("example.com",))
        self.assertEqual(result.user.role, "viewer")

    def test_no_role_assignment_is_403(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._run(verification=_ok(), role=None)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_email_is_normalized_before_verification(self) -> None:
        captured: dict[str, str] = {}

        def fake_verify(email: str, password: str) -> PasswordVerification:
            captured["email"] = email
            return _ok()

        with patch.object(auth_service.password_credential_service, "verify_password", side_effect=fake_verify), \
             patch.object(auth_service.access_service, "ensure_default_viewer_assignment"), \
             patch.object(auth_service.access_service, "resolve_user_role", return_value="viewer"), \
             patch.object(auth_service.settings, "ALLOWED_USERS_STR", ""), \
             patch.object(auth_service.settings, "ALLOWED_DOMAINS_STR", ""):
            auth_service.authenticate_password("  MixedCase@Example.COM ", "a valid password")
        self.assertEqual(captured["email"], "mixedcase@example.com")


if __name__ == "__main__":
    unittest.main()
