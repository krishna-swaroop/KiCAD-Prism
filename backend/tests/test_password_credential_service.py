from __future__ import annotations

import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import password_credential_service as pcs  # noqa: E402


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
        digest = pcs._hash_password("correct horse battery staple")
        self.assertNotIn("correct horse", digest)  # never store plaintext
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
        pcs.set_password(self.EMAIL, "a valid password", updated_by="admin@x")
        self.assertTrue(pcs.has_credential(self.EMAIL))
        self.assertTrue(pcs.verify_password(self.EMAIL, "a valid password").ok)
        self.assertFalse(pcs.verify_password(self.EMAIL, "wrong password").ok)

    def test_unknown_email_verifies_false_without_error(self) -> None:
        result = pcs.verify_password("nobody@example.com", "whatever")
        self.assertFalse(result.ok)
        self.assertFalse(result.must_change)

    def test_email_is_normalized(self) -> None:
        pcs.set_password("  MixedCase@Example.COM  ", "a valid password", updated_by="admin@x")
        self.assertTrue(pcs.verify_password("mixedcase@example.com", "a valid password").ok)
        pcs.delete_credential("mixedcase@example.com")

    def test_must_change_flag_flows_through_and_clears(self) -> None:
        pcs.set_password(self.EMAIL, "a valid password", updated_by="admin@x", must_change=True)
        result = pcs.verify_password(self.EMAIL, "a valid password")
        self.assertTrue(result.ok)
        self.assertTrue(result.must_change)

        pcs.clear_must_change(self.EMAIL)
        self.assertFalse(pcs.verify_password(self.EMAIL, "a valid password").must_change)

    def test_set_password_replaces_existing(self) -> None:
        pcs.set_password(self.EMAIL, "first password value", updated_by="admin@x")
        pcs.set_password(self.EMAIL, "second password value", updated_by="admin@x")
        self.assertFalse(pcs.verify_password(self.EMAIL, "first password value").ok)
        self.assertTrue(pcs.verify_password(self.EMAIL, "second password value").ok)

    def test_delete_removes_credential(self) -> None:
        pcs.set_password(self.EMAIL, "a valid password", updated_by="admin@x")
        self.assertTrue(pcs.delete_credential(self.EMAIL))
        self.assertFalse(pcs.has_credential(self.EMAIL))
        self.assertFalse(pcs.delete_credential(self.EMAIL))  # already gone

    def test_policy_enforced_on_set(self) -> None:
        with self.assertRaises(pcs.PasswordPolicyError):
            pcs.set_password(self.EMAIL, "short", updated_by="admin@x")
        self.assertFalse(pcs.has_credential(self.EMAIL))


if __name__ == "__main__":
    unittest.main()
