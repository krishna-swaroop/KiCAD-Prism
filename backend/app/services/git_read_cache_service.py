from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Mapping

from app.core.config import settings
from app.services.postgres_database import database
from app.services.workspace_service import workspace


logger = logging.getLogger(__name__)


def _canonical(value: Mapping[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


class GitReadCacheService:
    """Immutable-ref PostgreSQL cache for bounded Git read endpoints."""

    @property
    def enabled(self) -> bool:
        return bool(settings.PRISM_DATABASE_URL.strip())

    @staticmethod
    def key(
        cache_kind: str,
        repository_key: str,
        resolved_ref_sha: str,
        parameters: Mapping[str, Any],
    ) -> str:
        material = _canonical(
            {
                "schema": "prism.git_read_cache.a0",
                "kind": cache_kind,
                "repository": repository_key,
                "resolved_ref_sha": resolved_ref_sha,
                "parameters": dict(parameters),
            }
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def get(
        self,
        cache_kind: str,
        repository_key: str,
        resolved_ref_sha: str,
        parameters: Mapping[str, Any],
    ) -> Any | None:
        if not self.enabled:
            return None
        cache_key = self.key(
            cache_kind,
            repository_key,
            resolved_ref_sha,
            parameters,
        )
        try:
            workspace.initialize()
            with database.connection() as conn:
                conn.execute("SET search_path TO workspace, public")
                row = conn.execute(
                    """
                    UPDATE ws_git_read_cache
                    SET last_accessed_at = NOW()
                    WHERE cache_key = %s
                    RETURNING payload
                    """,
                    (cache_key,),
                ).fetchone()
                conn.commit()
            if not row:
                return None
            payload = row["payload"]
            return json.loads(payload) if isinstance(payload, str) else payload
        except Exception:
            logger.exception("Git read cache lookup failed; bypassing cache")
            return None

    def put(
        self,
        cache_kind: str,
        repository_key: str,
        resolved_ref_sha: str,
        parameters: Mapping[str, Any],
        payload: Any,
    ) -> None:
        if not self.enabled:
            return
        cache_key = self.key(
            cache_kind,
            repository_key,
            resolved_ref_sha,
            parameters,
        )
        try:
            workspace.initialize()
            with database.connection() as conn:
                conn.execute("SET search_path TO workspace, public")
                conn.execute(
                    """
                    INSERT INTO ws_git_read_cache(
                        cache_key, cache_kind, repository_key,
                        resolved_ref_sha, payload
                    ) VALUES (%s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        payload = EXCLUDED.payload,
                        last_accessed_at = NOW()
                    """,
                    (
                        cache_key,
                        cache_kind,
                        repository_key,
                        resolved_ref_sha,
                        _canonical({"value": payload}),
                    ),
                )
                conn.commit()
        except Exception:
            logger.exception("Git read cache publication failed; continuing uncached")

    def prune(self, *, older_than_days: int = 30) -> int:
        if not self.enabled:
            return 0
        try:
            workspace.initialize()
            with database.connection() as conn:
                conn.execute("SET search_path TO workspace, public")
                cursor = conn.execute(
                    """
                    DELETE FROM ws_git_read_cache
                    WHERE last_accessed_at <
                          NOW() - (%s * INTERVAL '1 day')
                    """,
                    (max(1, int(older_than_days)),),
                )
                conn.commit()
                return int(cursor.rowcount or 0)
        except Exception:
            logger.exception("Git read cache retention failed")
            return 0

    @staticmethod
    def unwrap(payload: Any | None) -> Any | None:
        if isinstance(payload, dict) and set(payload) == {"value"}:
            return payload["value"]
        return payload


git_read_cache = GitReadCacheService()
