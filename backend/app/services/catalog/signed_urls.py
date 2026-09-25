"""HMAC-signed, time-limited download URLs for remote-provider assets."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

from app.core.config import settings


DEFAULT_SIGNED_URL_TTL_SECONDS = 300


class CatalogAssetUrlSigner:
    """Sign and verify ``asset:revision:representation:expiry`` messages.

    Signatures are bound to the exact revision and representation so a URL
    minted for one placement cannot fetch another revision's file.
    """

    @staticmethod
    def sign(message: str) -> str:
        if not settings.SESSION_SECRET:
            raise RuntimeError("SESSION_SECRET is required to sign catalog asset URLs")
        secret = settings.SESSION_SECRET.encode("utf-8")
        digest = hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    @classmethod
    def build_signed_asset_url(
        cls,
        asset_id: str,
        revision_id: str,
        base_url: str,
        ttl_seconds: int = DEFAULT_SIGNED_URL_TTL_SECONDS,
        *,
        representation_id: str = "",
    ) -> str:
        expires_at = int(time.time()) + ttl_seconds
        signature = cls.sign(f"{asset_id}:{revision_id}:{representation_id}:{expires_at}")
        return (
            f"{base_url.rstrip('/')}/api/remote-provider/assets/{asset_id}?rev={revision_id}"
            f"&representation={representation_id}&exp={expires_at}&sig={signature}"
        )

    @classmethod
    def validate_asset_signature(
        cls,
        asset_id: str,
        revision_id: str,
        expires_at: int,
        signature: str,
        representation_id: str = "",
    ) -> bool:
        if expires_at <= int(time.time()):
            return False
        return hmac.compare_digest(
            cls.sign(f"{asset_id}:{revision_id}:{representation_id}:{expires_at}"), signature
        )


__all__ = ["DEFAULT_SIGNED_URL_TTL_SECONDS", "CatalogAssetUrlSigner"]
