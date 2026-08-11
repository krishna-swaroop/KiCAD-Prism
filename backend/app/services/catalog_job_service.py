from __future__ import annotations

import json
from typing import Any

from app.services.job_service import jobs


KICAD_HEAVY_JOB_TYPES = frozenset(
    {
        "catalog_validation",
        "catalog_preview_generation",
        "folder_library_import",
        "project_component_import",
    }
)


def _loads(value: Any, default: Any) -> Any:
    if value is None or value == "":
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except (TypeError, ValueError):
        return default


class CatalogJobService:
    """Compatibility facade over the unified fenced workspace job queue."""

    def initialize(self) -> None:
        jobs.initialize()

    def enqueue(
        self,
        job_type: str,
        payload: dict[str, Any] | None = None,
        *,
        created_by: str = "",
        idempotency_key: str = "",
        max_attempts: int = 3,
    ) -> dict[str, Any]:
        resources = {"catalog_worker": 1}
        if job_type in KICAD_HEAVY_JOB_TYPES:
            resources["catalog_kicad"] = 1
        queued = jobs.enqueue(
            job_type,
            {
                "catalog_payload": dict(payload or {}),
                "catalog_checkpoint": {},
                "catalog_result": {},
                "created_by": created_by,
                "catalog_artifact_key": idempotency_key.strip(),
            },
            worker_pool="catalog",
            artifact_key=idempotency_key.strip(),
            requested_by=created_by,
            max_attempts=max_attempts,
            resources=resources,
        )
        return self._decode(queued)

    def get(self, job_id: str, job_type: str = "") -> dict[str, Any] | None:
        row = jobs.get(job_id)
        if not row or row.get("worker_pool") != "catalog":
            return None
        if job_type and row.get("kind") != job_type:
            return None
        return self._decode(row)

    def events(self, job_id: str) -> list[dict[str, Any]]:
        return jobs.events(job_id, limit=1000)

    def request_cancel(self, job_id: str, *, requested_by: str = "") -> str | None:
        return jobs.request_cancel(job_id, requested_by=requested_by)

    @staticmethod
    def _decode(row: dict[str, Any]) -> dict[str, Any]:
        if "job_id" not in row and "payload_json" in row:
            payload = _loads(row.get("payload_json"), {})
            result = _loads(row.get("result_json"), {})
            checkpoint = _loads(row.get("checkpoint_json"), {})
            percent = float(row.get("progress") or 0)
            return {
                **row,
                **result,
                "job_id": str(row["id"]),
                "payload": payload,
                "result": result,
                "checkpoint": checkpoint,
                "percent": percent,
            }
        envelope = dict(row.get("payload") or {})
        result = dict(envelope.get("catalog_result") or {})
        if row.get("status") == "completed":
            result.update(dict(row.get("result_metadata") or {}))
        decoded = {
            **row,
            "id": row["job_id"],
            "job_type": row["kind"],
            "payload": dict(envelope.get("catalog_payload") or {}),
            "result": result,
            "checkpoint": dict(envelope.get("catalog_checkpoint") or {}),
            "created_by": str(envelope.get("created_by") or row.get("requested_by") or ""),
            "attempts": int(row.get("attempt") or 0),
            "progress": float(row.get("percent") or 0),
        }
        return {**decoded, **result}


catalog_jobs = CatalogJobService()
