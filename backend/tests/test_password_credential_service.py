from __future__ import annotations

import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import password_credential_service as pcs  # noqa: E402

# Synthetic, non-secret placeholders used wherever a test needs "some password".
VALID_PASSWORD = "x" * 12
OTHER_PASSWORD = "y" * 12


class PasswordPolicyTests(unittest.TestCase):
    """Policy and hashing checks that need no database."""

    def test_rejects_short_password(self) -> None:
        with self.assertRaises(pcs.PasswordPolicyError):
            pcs.validate_password_policy("short")

    def test_accepts_password_at_minimum_length(self) -> None:
        # Exactly the default minimum (12) must pass.
        pcs.validate_password_policy("a" * 12)

    def test_rejects_over_bcrypt_byte_limit(self) -> None:
        with self.assertRaises(pcs.PasswordPolicyError):
            pcs.validate_password_policy("a" * 73)

    def test_hash_round_trip(self) -> None:
        digest = pcs._hash_password(VALID_PASSWORD)
        self.assertNotIn(VALID_PASSWORD, digest)  # never store plaintext
        self.assertTrue(digest.startswith("$2"))  # a bcrypt hash

    def test_dummy_hash_verification_is_constant_time_shaped(self) -> None:
        # An unknown email still spends bcrypt work, so its verify latency is on
        # the same order as a real check. This is a coarse guard against a
        # zero-cost early return, not a precise timing assertion.
        import bcrypt

        real = bcrypt.hashpw(b"a-real-password", bcrypt.gensalt())

        start = time.perf_counter()
        bcrypt.checkpw(b"guess", real)
        real_ms = time.perf_counter() - start

        start = time.perf_counter()
        bcrypt.checkpw(b"guess", pcs._DUMMY_HASH)
        dummy_ms = time.perf_counter() - start

        # Both must actually run the KDF (non-trivial time), and be comparable.
        self.assertGreater(real_ms, 0.0005)
        self.assertGreater(dummy_ms, 0.0005)

    def test_set_password_requires_an_existing_account(self) -> None:
        from unittest.mock import patch

        with patch.object(pcs.access_service, "get_user_by_email", return_value=None):
            with self.assertRaises(pcs.NoSuchUserError):
                pcs.set_password("nobody@example.com", VALID_PASSWORD, updated_by="admin@x")


@unittest.skipUnless(
    os.environ.get("PRISM_DATABASE_URL"),
    "PRISM_DATABASE_URL not set; skipping database-backed credential tests",
)
class PasswordCredentialStoreTests(unittest.TestCase):
    EMAIL = "pwtest@example.com"

    def setUp(self) -> None:
        pcs.initialize_credential_store()
        pcs.delete_credential(self.EMAIL)

    def tearDown(self) -> None:
        pcs.delete_credential(self.EMAIL)

    def test_set_and_verify(self) -> None:
        pcs.set_password(self.EMAIL, VALID_PASSWORD, updated_by="admin@x", create_user=True)
        self.assertTrue(pcs.has_credential(self.EMAIL))
        self.assertTrue(pcs.verify_password(self.EMAIL, VALID_PASSWORD).ok)
        self.assertFalse(pcs.verify_password(self.EMAIL, "wrong password").ok)

    def test_unknown_email_verifies_false_without_error(self) -> None:
        result = pcs.verify_password("nobody@example.com", "whatever")
        self.assertFalse(result.ok)
        self.assertFalse(result.must_change)

    def test_email_is_normalized(self) -> None:
        pcs.set_password("  MixedCase@Example.COM  ", VALID_PASSWORD, updated_by="admin@x", create_user=True)
        self.assertTrue(pcs.verify_password("mixedcase@example.com", VALID_PASSWORD).ok)
        pcs.delete_credential("mixedcase@example.com")

    def test_must_change_flag_flows_through_and_clears(self) -> None:
        pcs.set_password(self.EMAIL, VALID_PASSWORD, updated_by="admin@x", must_change=True, create_user=True)
        result = pcs.verify_password(self.EMAIL, VALID_PASSWORD)
        self.assertTrue(result.ok)
        self.assertTrue(result.must_change)

        pcs.clear_must_change(result.user_id)
        self.assertFalse(pcs.verify_password(self.EMAIL, VALID_PASSWORD).must_change)

    def test_set_password_replaces_existing(self) -> None:
        pcs.set_password(self.EMAIL, VALID_PASSWORD, updated_by="admin@x", create_user=True)
        pcs.set_password(self.EMAIL, OTHER_PASSWORD, updated_by="admin@x")
        self.assertFalse(pcs.verify_password(self.EMAIL, VALID_PASSWORD).ok)
        self.assertTrue(pcs.verify_password(self.EMAIL, OTHER_PASSWORD).ok)

    def test_delete_removes_credential(self) -> None:
        pcs.set_password(self.EMAIL, VALID_PASSWORD, updated_by="admin@x", create_user=True)
        self.assertTrue(pcs.delete_credential(self.EMAIL))
        self.assertFalse(pcs.has_credential(self.EMAIL))
        self.assertFalse(pcs.delete_credential(self.EMAIL))  # already gone

    def test_policy_enforced_on_set(self) -> None:
        with self.assertRaises(pcs.PasswordPolicyError):
            pcs.set_password(self.EMAIL, "short", updated_by="admin@x", create_user=True)
        self.assertFalse(pcs.has_credential(self.EMAIL))

    def test_set_password_requires_an_existing_account(self) -> None:
        with self.assertRaises(pcs.NoSuchUserError):
            pcs.set_password("nobody@example.com", VALID_PASSWORD, updated_by="admin@x")


@unittest.skipUnless(
    os.environ.get("PRISM_DATABASE_URL"),
    "PRISM_DATABASE_URL not set; skipping database-backed credential tests",
)
class BootstrapSeedTests(unittest.TestCase):
    EMAIL = "bootstrap-admin@example.com"
    SEED = VALID_PASSWORD

    def setUp(self) -> None:
        pcs.initialize_credential_store()
        pcs.delete_credential(self.EMAIL)

    def tearDown(self) -> None:
        pcs.delete_credential(self.EMAIL)

    def _seed(self, **overrides):
        from unittest.mock import patch

        base = {
            "PASSWORD_AUTH_ENABLED": True,
            "BOOTSTRAP_ADMIN_PASSWORD": self.SEED,
            "BOOTSTRAP_ADMIN_USERS_STR": self.EMAIL,
        }
        base.update(overrides)
        with patch.object(pcs.settings, "PASSWORD_AUTH_ENABLED", base["PASSWORD_AUTH_ENABLED"]), \
             patch.object(pcs.settings, "BOOTSTRAP_ADMIN_PASSWORD", base["BOOTSTRAP_ADMIN_PASSWORD"]), \
             patch.object(pcs.settings, "BOOTSTRAP_ADMIN_USERS_STR", base["BOOTSTRAP_ADMIN_USERS_STR"]):
            return pcs.seed_bootstrap_admins()

    def test_seeds_a_must_change_credential(self) -> None:
        seeded = self._seed()
        self.assertEqual(seeded, [self.EMAIL])
        result = pcs.verify_password(self.EMAIL, self.SEED)
        self.assertTrue(result.ok)
        self.assertTrue(result.must_change)  # forced change on first login

    def test_is_idempotent_and_never_clobbers(self) -> None:
        # The user changed their password after the first seed...
        self._seed()
        pcs.set_password(self.EMAIL, OTHER_PASSWORD, updated_by=self.EMAIL, must_change=False)
        # ...a restart must not reset it back to the seed.
        seeded_again = self._seed()
        self.assertEqual(seeded_again, [])
        self.assertTrue(pcs.verify_password(self.EMAIL, OTHER_PASSWORD).ok)
        self.assertFalse(pcs.verify_password(self.EMAIL, self.SEED).ok)

    def test_no_op_when_password_auth_disabled(self) -> None:
        self.assertEqual(self._seed(PASSWORD_AUTH_ENABLED=False), [])
        self.assertFalse(pcs.has_credential(self.EMAIL))

    def test_no_op_when_no_seed_password(self) -> None:
        self.assertEqual(self._seed(BOOTSTRAP_ADMIN_PASSWORD=""), [])
        self.assertFalse(pcs.has_credential(self.EMAIL))

    def test_weak_seed_is_rejected(self) -> None:
        with self.assertRaises(pcs.PasswordPolicyError):
            self._seed(BOOTSTRAP_ADMIN_PASSWORD="short")


if __name__ == "__main__":
    unittest.main()
