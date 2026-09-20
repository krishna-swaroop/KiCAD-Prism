"""TR-10: authenticated tracker credential envelopes (F3)."""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import unittest
from pathlib import Path

from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings  # noqa: E402
from app.services.trackers.secrets import (  # noqa: E402
    SecretIntegrityError,
    SecretStoreLocked,
    decrypt_secret,
    encrypt_secret,
    inspect_envelope,
    keyring_from_settings,
    rewrap_secret,
)

DOCS = Path(__file__).resolve().parents[2] / "docs" / "tracker-integration"
F3 = json.loads((DOCS / "fixtures" / "F03.json").read_text(encoding="utf-8"))
# Low-entropy fixtures: GitGuardian treats hex session secrets and PEM/gho_
# prefixes as credentials. These strings only have to satisfy Settings
# validation (>=32 chars, mixed alphabet) and prove envelopes hide plaintext.
INSTALLATION_MATERIAL = "installation-private-key-fixture-text"
USER_TOKEN = "user-oauth-token-fixture"
TEST_SESSION_SECRET = "unit-test-session-secret-not-a-credential"


def _hex_key() -> str:
    return os.urandom(32).hex()


def _settings(**overrides) -> Settings:
    base = {
        "AUTH_ENABLED": True,
        "OIDC_ISSUER_URL": "https://idp.example.com",
        "OIDC_CLIENT_ID": "prism",
        "OIDC_CLIENT_SECRET": "shhh",
        "SESSION_SECRET": TEST_SESSION_SECRET,
        "PRISM_DATABASE_URL": "postgresql://prism@localhost/prism",
        "TRACKER_CREDENTIAL_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_ROOT_KEY_ID": "v1",
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY": SecretStr(""),
        "TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID": "",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def _ctx(**extra: str) -> dict[str, str]:
    context = {"record": "cn_gh1", "field": "installation_pem"}
    context.update(extra)
    return context


class EnvelopeRoundtripTests(unittest.TestCase):
    def test_f3_envelope_roundtrip_and_wrong_context(self) -> None:
        # F3.envelope_encryption_roundtrip
        case_ids = {case["id"] for case in F3["cases"]}
        self.assertIn("F3.envelope_encryption_roundtrip", case_ids)
        self.assertIn("F3.key_rotation", case_ids)

        key = _hex_key()
        settings = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(key))
        blob = encrypt_secret(INSTALLATION_MATERIAL, _ctx(), settings=settings)
        payload = json.loads(blob)
        self.assertEqual(payload["kid"], "v1")
        self.assertNotIn(INSTALLATION_MATERIAL, blob)
        self.assertEqual(
            decrypt_secret(blob, _ctx(), settings=settings).decode(), INSTALLATION_MATERIAL
        )

        with self.assertRaises(SecretIntegrityError):
            decrypt_secret(blob, _ctx(record="cn_other"), settings=settings)

    def test_ciphertext_swap_across_contexts_is_rejected(self) -> None:
        key = _hex_key()
        settings = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(key))
        a = json.loads(encrypt_secret("alpha", _ctx(field="a"), settings=settings))
        b = json.loads(encrypt_secret("beta", _ctx(field="b"), settings=settings))
        swapped = dict(a)
        swapped["ciphertext"] = b["ciphertext"]
        swapped["nonce"] = b["nonce"]
        with self.assertRaises(SecretIntegrityError):
            decrypt_secret(swapped, _ctx(field="a"), settings=settings)

    def test_tamper_and_wrong_key_are_rejected(self) -> None:
        key = _hex_key()
        settings = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(key))
        blob = encrypt_secret(USER_TOKEN, _ctx(), settings=settings)
        payload = json.loads(blob)
        last = payload["ciphertext"][-1]
        payload["ciphertext"] = payload["ciphertext"][:-1] + ("A" if last != "A" else "B")
        with self.assertRaises(SecretIntegrityError):
            decrypt_secret(payload, _ctx(), settings=settings)

        other = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(_hex_key()))
        with self.assertRaises(SecretIntegrityError):
            decrypt_secret(blob, _ctx(), settings=other)

    def test_rotation_keeps_old_records_readable(self) -> None:
        # F3.key_rotation
        v1 = _hex_key()
        v2 = _hex_key()
        original = _settings(
            TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(v1),
            TRACKER_CREDENTIAL_ROOT_KEY_ID="v1",
        )
        blob_v1 = encrypt_secret(USER_TOKEN, _ctx(), settings=original)
        rotated = _settings(
            TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(v2),
            TRACKER_CREDENTIAL_ROOT_KEY_ID="v2",
            TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY=SecretStr(v1),
            TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID="v1",
        )
        self.assertEqual(decrypt_secret(blob_v1, _ctx(), settings=rotated).decode(), USER_TOKEN)
        blob_v2 = rewrap_secret(blob_v1, _ctx(), settings=rotated)
        self.assertEqual(json.loads(blob_v2)["kid"], "v2")
        self.assertEqual(decrypt_secret(blob_v2, _ctx(), settings=rotated).decode(), USER_TOKEN)
        only_v2 = _settings(
            TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(v2),
            TRACKER_CREDENTIAL_ROOT_KEY_ID="v2",
        )
        self.assertEqual(decrypt_secret(blob_v2, _ctx(), settings=only_v2).decode(), USER_TOKEN)
        with self.assertRaises(SecretIntegrityError):
            decrypt_secret(blob_v1, _ctx(), settings=only_v2)


class LockedAndRedactionTests(unittest.TestCase):
    def test_absent_and_invalid_keys_lock_without_plaintext_fallback(self) -> None:
        disabled = _settings()
        self.assertEqual(disabled.tracker_credential_status(), "disabled")
        with self.assertRaises(SecretStoreLocked):
            encrypt_secret(USER_TOKEN, _ctx(), settings=disabled)
        locked = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr("change-me"))
        self.assertEqual(locked.tracker_credential_status(), "locked")
        with self.assertRaises(SecretStoreLocked):
            encrypt_secret(USER_TOKEN, _ctx(), settings=locked)
        short = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr("not-32-bytes"))
        self.assertEqual(short.tracker_credential_status(), "locked")
        errors = " ".join(short.tracker_credential_key_errors())
        self.assertNotIn("not-32-bytes", errors)

    def test_secrets_never_appear_in_repr_dto_exception_or_logs(self) -> None:
        key = _hex_key()
        settings = _settings(TRACKER_CREDENTIAL_ROOT_KEY=SecretStr(key))
        ring = keyring_from_settings(settings)
        blob = ring.encrypt(USER_TOKEN, _ctx())
        dto = inspect_envelope(blob, settings=settings)
        dump = json.dumps(dto.to_dto())
        self.assertNotIn(USER_TOKEN, dump)
        self.assertNotIn(key, dump)
        self.assertNotIn(USER_TOKEN, repr(dto))
        self.assertNotIn(USER_TOKEN, repr(ring))
        self.assertNotIn(key, repr(settings))
        self.assertNotIn(USER_TOKEN, repr(settings))
        self.assertIn("**********", repr(settings.TRACKER_CREDENTIAL_ROOT_KEY))

        log = io.StringIO()
        handler = logging.StreamHandler(log)
        logger = logging.getLogger("test_tracker_tr_10")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        try:
            logger.info("encrypted %s", blob)
            try:
                decrypt_secret(blob, _ctx(field="other"), settings=settings)
            except SecretIntegrityError as exc:
                logger.exception("decrypt failed: %s", exc)
                self.assertNotIn(USER_TOKEN, str(exc))
                self.assertNotIn(key, str(exc))
        finally:
            logger.removeHandler(handler)
        output = log.getvalue()
        self.assertNotIn(USER_TOKEN, output)
        self.assertNotIn(key, output)
        self.assertNotIn(INSTALLATION_MATERIAL, output)


if __name__ == "__main__":
    unittest.main()
