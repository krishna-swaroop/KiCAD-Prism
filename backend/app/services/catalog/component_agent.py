"""Prism orchestration for an internal, draft-only OpenCode runtime."""
from __future__ import annotations

import json
import http.client
import secrets
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from app.core.config import settings
from app.services.catalog.component_candidates import checked_candidates
from app.services.job_runtime import JobCancelled, LostJobLease, PermanentJobError

JOB_KIND = "component_agent"


def enabled() -> bool:
    return bool(settings.COMPONENT_AGENT_URL.strip() and settings.COMPONENT_AGENT_TOKEN.strip())


def internal_authorized(token: str) -> bool:
    return enabled() and secrets.compare_digest(token, settings.COMPONENT_AGENT_TOKEN)


def runtime_request(method: str, path: str, payload: dict | None = None) -> dict:
    request = urllib.request.Request(
        settings.COMPONENT_AGENT_URL.rstrip("/") + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + settings.COMPONENT_AGENT_TOKEN},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError("Agent response exceeds the limit")
            return json.loads(raw)
    except (http.client.HTTPException, OSError, ValueError) as error:
        raise PermanentJobError("Component agent service is unavailable", code="component_agent_unavailable") from error


def run_component_agent(job: dict[str, Any], progress: Callable[..., bool]) -> dict:
    if not enabled():
        raise PermanentJobError("Component agent is not configured", code="component_agent_disabled")
    payload = job["payload"]
    # A lease reclaim reuses the remote task, never starts another model loop.
    task_id = str(job["id"])
    identity = {key: payload[key] for key in ("manufacturer", "mpn")}
    progress(progress=1, message="Starting component research", checkpoint={"task_id": task_id})
    deadline = time.monotonic() + settings.COMPONENT_AGENT_TIMEOUT_SECONDS if settings.COMPONENT_AGENT_TIMEOUT_SECONDS else float("inf")
    try:
        runtime_request("POST", "/tasks", {"id": task_id, "identity": identity, "source_urls": payload.get("source_urls", []),
                                            "thinking": payload.get("thinking", False), "instructions": payload.get("instructions", "")})
        while time.monotonic() < deadline:
            task = runtime_request("GET", "/tasks/" + task_id)
            message = "Queued; waiting for the model slot" if task.get("status") == "queued" else str(task.get("message") or "Researching manufacturer documents")[:300]
            progress(progress=10, message=message,
                     result={"agent_status": task.get("status"), "task_id": task_id, "trace": task.get("trace", []), "documents": task.get("documents", []), "model": task.get("model"), "thinking": payload.get("thinking", False)})
            if task.get("status") in {"failed", "cancelled"}:
                raise PermanentJobError("Component research stopped: " + str(task.get("error_code") or task["status"]), code="component_agent_failed")
            if task.get("status") == "completed":
                proposal = task.get("proposal")
                if not isinstance(proposal, dict) or proposal.get("decision") not in {"propose", "needs_input"}:
                    raise PermanentJobError("Agent did not return a structured proposal", code="component_agent_invalid_output")
                spec = proposal.get("spec")
                candidates = checked_candidates(spec, identity=identity, documents=task.get("documents", [])) if proposal["decision"] == "propose" else {"findings": [], "files": {}}
                result = {"decision": proposal["decision"], "spec": spec, "question": str(proposal.get("question") or ""),
                          "documents": task.get("documents", []), "session_id": task.get("session_id"),
                          "model": task.get("model"), "trace": task.get("trace", []), "thinking": payload.get("thinking", False),
                          "component_id": payload.get("component_id", ""), "expected_revision_id": payload.get("expected_revision_id", ""),
                          "task_id": task_id, "candidates": candidates, "review_required": True}
                progress(progress=100, message="Candidate ready for engineering review" if candidates.get("files") else "Component research needs input", result=result)
                return result
            time.sleep(1)
        raise PermanentJobError("Component research exceeded its time limit", code="component_agent_timeout")
    except (JobCancelled, LostJobLease, PermanentJobError):
        try:
            runtime_request("POST", "/tasks/" + task_id + "/cancel", {})
        except PermanentJobError:
            pass
        raise
