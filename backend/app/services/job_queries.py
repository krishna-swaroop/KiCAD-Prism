"""Read-only lookups of ``ws_jobs`` rows by kind, artifact key or payload field.

Kept beside ``job_service`` (which is at the module size cap) for the job kinds'
end hooks and the readers that ask "how did this feature row's job end?".
"""

from __future__ import annotations

from typing import Any, Sequence

from app.services.job_service import JobService, jobs


def newest_jobs(
    *, kind: str | Sequence[str] = "", artifact_key: str = "", payload_key: str = "", payload_value: str = "",
    statuses: Sequence[str] = (), limit: int = 1, service: JobService = jobs,
) -> list[dict[str, Any]]:
    """The newest jobs matching every given filter, newest first."""

    clauses: list[str] = []
    params: list[Any] = []
    if isinstance(kind, str) and kind:
        clauses.append("kind = %s")
        params.append(kind)
    elif not isinstance(kind, str) and kind:
        clauses.append("kind = ANY(%s)")
        params.append(list(kind))
    if artifact_key:
        clauses.append("artifact_key = %s")
        params.append(artifact_key)
    if payload_key and payload_value:
        clauses.append("payload->>%s = %s")
        params.extend((payload_key, payload_value))
    if statuses:
        clauses.append("status = ANY(%s)")
        params.append(list(statuses))
    service.initialize()
    with service._connect() as conn:
        conn.execute("SET search_path TO workspace, public")
        rows = conn.execute(
            f"SELECT * FROM ws_jobs WHERE {' AND '.join(clauses) or 'TRUE'} ORDER BY updated_at DESC LIMIT %s",
            (*params, limit),
        ).fetchall()
    return [service._decode(row) for row in rows]
