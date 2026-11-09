"""Unpadded URL-safe base64 helpers and the PKCE S256 challenge shared by the auth services."""

import base64
import hashlib


def b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def b64_decode(value: str) -> bytes:
    pad = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + pad).encode("ascii"))


def pkce_challenge(code_verifier: str) -> str:
    return b64_encode(hashlib.sha256(code_verifier.encode("utf-8")).digest())
