"""The diagnostic evidence a failed or cancelled Release Studio build keeps.

A small, deterministic archive (``failure.json``, ``build-evidence.json`` and
a log) published as the attempt's evidence artifact, with credential-shaped
text redacted before it reaches immutable storage.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping, Sequence

from app.release_studio.canonical import write_deterministic_archive
from app.release_studio.canonical.json import canonical_json_bytes
from app.core import redaction
from app.services.job_artifact_service import JobArtifactService
from app.services.job_runtime import JobContext

logger = logging.getLogger(__name__)

# The shared redactor (ADR scripting-and-mcp §11, D22); kept under the old names.
redact_text = redaction.redact_text
_redact_value = redaction.redact_value


def publish(
    *,
    artifacts: JobArtifactService,
    context: JobContext,
    build: Mapping[str, Any],
    candidate: Mapping[str, Any],
    error_code: str,
    error: BaseException | str,
    pipeline: Mapping[str, Any] | None,
    timings: Sequence[Mapping[str, Any]] = (),
) -> str | None:
    """Publish the small, deterministic diagnostic archive for a failed run.

    It intentionally contains no editable configuration, closure paths, or job
    payload.  The pipeline snapshot supplies the completed step/log index; all
    free text is redacted before it reaches immutable artifact storage.
    """

    message = redact_text(error)
    payload = {
        "schema_version": "release-studio.failure-evidence.v1",
        "failure": {"code": error_code, "message": message},
        "build": {
            "id": str(build.get("id") or ""),
            "candidate_id": str(candidate.get("id") or build.get("candidate_id") or ""),
            "commit_sha": str(candidate.get("commit_sha") or ""),
            "config_key": str(candidate.get("config_key") or ""),
            "variant": str(candidate.get("variant") or ""),
        },
        "pipeline": _redact_value(dict(pipeline or {})),
        "timings": _redact_value(list(timings)),
    }
    steps = {
        str(step.get("id") or ""): {
            "step_type": str(step.get("id") or ""),
            "returncode": None,
            "elapsed_ms": int(step.get("elapsed_ms") or 0),
            "skipped_reason": str(step.get("message") or "")
            if step.get("status") == "skipped"
            else "",
            "status": str(step.get("status") or "queued"),
        }
        for job in (pipeline or {}).get("jobs", [])
        for step in job.get("steps", [])
        if step.get("id")
    }
    steps["build-failure"] = {
        "step_type": "diagnostic",
        "returncode": None,
        "elapsed_ms": 0,
        "skipped_reason": "",
        "status": "cancelled" if error_code == "cancelled" else "failure",
    }
    evidence_index = {
        "schema_version": "release-studio.build-evidence.v1",
        "steps": steps,
        "timings": _redact_value(list(timings)),
        "diagnostics": payload["failure"],
        "pipeline": payload["pipeline"],
    }
    archive = write_deterministic_archive(
        {
            "build-evidence.json": canonical_json_bytes(evidence_index),
            "failure.json": canonical_json_bytes(payload),
            "logs/build-failure.log": (message + "\n").encode("utf-8"),
        }
    )
    from app.services.release_studio_build_service import GENERATOR_BUILD

    staged = context.staging_dir / "build-failure-evidence.tar.gz"
    staged.write_bytes(archive)
    artifact = artifacts.prepare_file(
        context,
        staged,
        kind="release_build_evidence",
        artifact_key=f"release-evidence-failure:{build['id']}",
        media_type="application/gzip",
        generator_version=GENERATOR_BUILD,
        allow_cancel_requested=error_code == "cancelled",
    )
    artifact_ids = context.service.register_fenced_artifacts(
        context.job_id,
        context.worker_id,
        context.fence,
        (artifact.__dict__,),
        allowed_statuses=("running", "cancel_requested")
        if error_code == "cancelled"
        else ("running",),
    )
    if artifact_ids is None:
        logger.warning(
            "Release Studio failure evidence was not registered because the fence is stale",
            extra={"build_id": build.get("id")},
        )
        return None
    return str(artifact_ids[0])


def publish_or_none(**kwargs: Any) -> str | None:
    """Failure evidence must not hide the build error when publication itself fails."""

    try:
        return publish(**kwargs)
    except Exception:  # noqa: BLE001 - failed attempt remains visible either way
        logger.exception("Could not publish Release Studio failure evidence")
        return None
