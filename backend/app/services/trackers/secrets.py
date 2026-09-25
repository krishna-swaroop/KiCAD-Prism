"""Authenticated tracker credential envelopes (C3, F3).

Root keys stay outside Postgres. Each record is wrapped with its own data
key; AES-GCM AAD binds the ciphertext to a caller-supplied context so a
blob copied onto another connector or field will not decrypt. There is no
plaintext fallback: missing or invalid root keys raise ``SecretStoreLocked``.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Any, Mapping, Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import BaseModel, ConfigDict, SecretStr

ENVELOPE_VERSION = 1
ENVELOPE_ALG = "A256GCM"
_AAD_PREFIX = b"prism.tracker.credential.v1"
_NONCE_LEN = 12
_DEK_LEN = 32
_ROOT_LEN = 32
_WEAK_ROOT_KEYS = {
    "change-me",
    "changeme",
    "secret",
    "kicad-prism",
    "kicad-prism-local",
    "your-session-secret",
    "replace-with-a-long-random-string",
}


class SecretStoreLocked(RuntimeError):
    """Root key absent or unusable. Helpers must not store plaintext instead."""


class SecretIntegrityError(RuntimeError):
    """Tamper, wrong context, or unknown key. The plaintext is not returned."""


class RedactedSecret(BaseModel):
    """API/log DTO. Never carries ciphertext or key material."""

    model_config = ConfigDict(extra="forbid")

    keyId: str
    configured: bool
    alg: str = ENVELOPE_ALG
    status: str = "ready"

    def __repr__(self) -> str:
        return (
            f"RedactedSecret(keyId={self.keyId!r}, configured={self.configured}, "
            f"status={self.status!r})"
        )

    def __str__(self) -> str:
        return repr(self)

    def to_dto(self) -> dict:
        return self.model_dump()


class CredentialKeyring:
    """In-memory root keys keyed by id. Bytes never appear in repr or logs."""

    def __init__(self, keys: Mapping[str, bytes], current_kid: str) -> None:
        if not current_kid or current_kid not in keys:
            raise SecretStoreLocked("Tracker credential encryption is locked: current key id is missing.")
        self._keys = {str(kid): bytes(material) for kid, material in keys.items()}
        self.current_kid = str(current_kid)

    def __repr__(self) -> str:
        return f"CredentialKeyring(kids={sorted(self._keys)}, current={self.current_kid!r})"

    def __str__(self) -> str:
        return repr(self)

    def encrypt(self, plaintext: bytes | str, context: Mapping[str, str]) -> str:
        data = plaintext.encode("utf-8") if isinstance(plaintext, str) else bytes(plaintext)
        aad = _aad(context)
        dek = os.urandom(_DEK_LEN)
        wrap_nonce = os.urandom(_NONCE_LEN)
        wrapped = AESGCM(self._keys[self.current_kid]).encrypt(wrap_nonce, dek, aad)
        nonce = os.urandom(_NONCE_LEN)
        ciphertext = AESGCM(dek).encrypt(nonce, data, aad)
        envelope = {
            "v": ENVELOPE_VERSION,
            "kid": self.current_kid,
            "alg": ENVELOPE_ALG,
            "wrapNonce": _b64(wrap_nonce),
            "wrappedDek": _b64(wrapped),
            "nonce": _b64(nonce),
            "ciphertext": _b64(ciphertext),
        }
        return json.dumps(envelope, separators=(",", ":"), sort_keys=True)

    def decrypt(self, envelope: str | Mapping[str, Any], context: Mapping[str, str]) -> bytes:
        parsed = _parse_envelope(envelope)
        kid = parsed["kid"]
        root = self._keys.get(kid)
        if root is None:
            raise SecretIntegrityError("Tracker credential envelope uses an unknown key id.")
        aad = _aad(context)
        try:
            dek = AESGCM(root).decrypt(_unb64(parsed["wrapNonce"]), _unb64(parsed["wrappedDek"]), aad)
            return AESGCM(dek).decrypt(_unb64(parsed["nonce"]), _unb64(parsed["ciphertext"]), aad)
        except (InvalidTag, ValueError) as exc:
            raise SecretIntegrityError(
                "Tracker credential envelope failed authentication."
            ) from exc

    def rewrap(self, envelope: str | Mapping[str, Any], context: Mapping[str, str]) -> str:
        plaintext = self.decrypt(envelope, context)
        return self.encrypt(plaintext, context)

    def inspect(self, envelope: str | Mapping[str, Any]) -> RedactedSecret:
        parsed = _parse_envelope(envelope)
        return RedactedSecret(
            keyId=parsed["kid"],
            configured=parsed["kid"] in self._keys,
            alg=parsed.get("alg") or ENVELOPE_ALG,
            status="ready" if parsed["kid"] in self._keys else "unknown_key",
        )


def root_key_problem(raw: str) -> Optional[str]:
    """Short operator-facing reason a root key cannot be used, or None if valid.

    The returned string never includes the supplied material.
    """

    text = (raw or "").strip()
    if not text:
        return "value is empty"
    if text.lower() in _WEAK_ROOT_KEYS:
        return "value is a well-known placeholder"
    try:
        parse_root_key_material(text)
    except ValueError:
        return "value is not a 32-byte key (64 hex characters or standard base64)"
    return None


def parse_root_key_material(raw: str) -> bytes:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty root key")
    if text.lower() in _WEAK_ROOT_KEYS:
        raise ValueError("placeholder root key")
    if len(text) == 64 and all(c in "0123456789abcdefABCDEF" for c in text):
        return bytes.fromhex(text)
    try:
        material = base64.b64decode(text, validate=True)
    except Exception:
        material = b""
    if len(material) == _ROOT_LEN:
        return material
    try:
        padded = text + "=" * ((4 - len(text) % 4) % 4)
        material = base64.urlsafe_b64decode(padded)
    except Exception as exc:
        raise ValueError("root key is not 32 bytes") from exc
    if len(material) != _ROOT_LEN:
        raise ValueError("root key is not 32 bytes")
    return material


def keyring_from_settings(settings: Any | None = None) -> CredentialKeyring:
    """Build a keyring or raise ``SecretStoreLocked``. Never returns a plaintext store."""

    if settings is None:
        from app.core.config import settings as loaded

        settings = loaded
    errors = list(settings.tracker_credential_key_errors())
    status = settings.tracker_credential_status()
    if status == "disabled":
        raise SecretStoreLocked(
            "Tracker credential encryption is disabled: TRACKER_CREDENTIAL_ROOT_KEY is not set."
        )
    if status == "locked" or errors:
        raise SecretStoreLocked("Tracker credential encryption is locked: root key is invalid.")
    current = _secret_text(settings.TRACKER_CREDENTIAL_ROOT_KEY)
    current_id = str(settings.TRACKER_CREDENTIAL_ROOT_KEY_ID or "").strip()
    keys = {current_id: parse_root_key_material(current)}
    previous = _secret_text(settings.TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY)
    previous_id = str(settings.TRACKER_CREDENTIAL_PREVIOUS_ROOT_KEY_ID or "").strip()
    if previous:
        keys[previous_id] = parse_root_key_material(previous)
    return CredentialKeyring(keys, current_id)


def encrypt_secret(
    plaintext: bytes | str,
    context: Mapping[str, str],
    *,
    settings: Any | None = None,
) -> str:
    return keyring_from_settings(settings).encrypt(plaintext, context)


def decrypt_secret(
    envelope: str | Mapping[str, Any],
    context: Mapping[str, str],
    *,
    settings: Any | None = None,
) -> bytes:
    return keyring_from_settings(settings).decrypt(envelope, context)


def rewrap_secret(
    envelope: str | Mapping[str, Any],
    context: Mapping[str, str],
    *,
    settings: Any | None = None,
) -> str:
    return keyring_from_settings(settings).rewrap(envelope, context)


def inspect_envelope(
    envelope: str | Mapping[str, Any],
    *,
    settings: Any | None = None,
) -> RedactedSecret:
    parsed = _parse_envelope(envelope)
    kid = str(parsed["kid"])
    status = "unknown_key"
    configured = False
    try:
        ring = keyring_from_settings(settings)
        configured = kid in ring._keys
        status = "ready" if configured else "unknown_key"
    except SecretStoreLocked:
        status = "locked"
    return RedactedSecret(
        keyId=kid,
        configured=configured,
        alg=str(parsed.get("alg") or ENVELOPE_ALG),
        status=status,
    )


def _secret_text(value: SecretStr | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, SecretStr):
        return value.get_secret_value().strip()
    return str(value).strip()


def _aad(context: Mapping[str, str]) -> bytes:
    if not context:
        raise ValueError("credential context binding is required")
    canonical = json.dumps(
        {str(key): str(value) for key, value in sorted(context.items())},
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return _AAD_PREFIX + b"|" + canonical.encode("utf-8")


def _parse_envelope(envelope: str | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(envelope, Mapping):
        payload = dict(envelope)
    else:
        try:
            payload = json.loads(str(envelope))
        except json.JSONDecodeError as exc:
            raise SecretIntegrityError("Tracker credential envelope is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise SecretIntegrityError("Tracker credential envelope is not an object.")
    required = ("v", "kid", "wrapNonce", "wrappedDek", "nonce", "ciphertext")
    missing = [key for key in required if key not in payload]
    if missing:
        raise SecretIntegrityError("Tracker credential envelope is incomplete.")
    if int(payload["v"]) != ENVELOPE_VERSION:
        raise SecretIntegrityError("Tracker credential envelope version is unsupported.")
    if not str(payload["kid"]).strip():
        raise SecretIntegrityError("Tracker credential envelope is missing a key id.")
    return payload


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _unb64(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:
        raise SecretIntegrityError("Tracker credential envelope encoding is invalid.") from exc
