"""OAuth authorization codes and revoked tokens for the remote provider.

Both tables live in the catalog database. Expired rows are swept on the
access paths that already touch them; nothing here commits.
"""

from __future__ import annotations

import json
from typing import Any

from app.services.catalog.normalization import json_loads


class CatalogProviderTokens:
    """Single-use authorization codes and the token revocation list."""

    @staticmethod
    def store_auth_code(conn: Any, code: str, grant: dict[str, Any], exp: int) -> None:
        conn.execute(
            """
            INSERT INTO oauth_auth_codes (code, grant_json, exp)
            VALUES (%s, %s, %s)
            ON CONFLICT (code) DO UPDATE SET grant_json = excluded.grant_json, exp = excluded.exp
            """,
            (code, json.dumps(grant, separators=(",", ":")), exp),
        )

    @staticmethod
    def consume_auth_code(conn: Any, code: str, *, now: int) -> dict[str, Any] | None:
        """Delete the code on read so it can only ever be exchanged once."""
        row = conn.execute("SELECT grant_json, exp FROM oauth_auth_codes WHERE code = %s", (code,)).fetchone()
        conn.execute("DELETE FROM oauth_auth_codes WHERE code = %s", (code,))
        conn.execute("DELETE FROM oauth_auth_codes WHERE exp <= %s", (now,))
        if not row or int(row["exp"]) <= now:
            return None
        return dict(json_loads(row["grant_json"], {}))

    @staticmethod
    def add_revoked_token(conn: Any, jti: str, exp: int) -> None:
        conn.execute(
            """
            INSERT INTO oauth_revoked_tokens (jti, exp)
            VALUES (%s, %s)
            ON CONFLICT (jti) DO UPDATE SET exp = excluded.exp
            """,
            (jti, exp),
        )

    @staticmethod
    def is_token_revoked(conn: Any, jti: str, *, now: int) -> bool:
        conn.execute("DELETE FROM oauth_revoked_tokens WHERE exp <= %s", (now,))
        row = conn.execute("SELECT 1 FROM oauth_revoked_tokens WHERE jti = %s", (jti,)).fetchone()
        return bool(row)


__all__ = ["CatalogProviderTokens"]
