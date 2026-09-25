"""Structured build progress for the Release Studio UI.

The worker already reports a single ``stage`` / ``message`` / ``percent``
triple. That is enough for a spinner and not enough for a GitHub Actions-style
jobs list. This module owns the jobs/steps tree that is written into the job
payload as ``pipeline`` and never into a fingerprint or the manifest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Sequence

ProgressFn = Callable[..., None]


@dataclass(frozen=True, slots=True)
class PipelineStepSpec:
    id: str
    name: str


@dataclass(frozen=True, slots=True)
class PipelineJobSpec:
    id: str
    name: str
    steps: tuple[PipelineStepSpec, ...]


def pipeline_skeleton(
    *,
    vendor_ids: Sequence[str] = (),
    include_schematic: bool = True,
) -> dict[str, Any]:
    """Return the queued jobs/steps graph the UI can render before work starts."""

    jobs = [_job_payload(spec) for spec in _job_specs(vendor_ids, include_schematic)]
    return {"jobs": jobs}


def _job_specs(
    vendor_ids: Sequence[str],
    include_schematic: bool,
) -> tuple[PipelineJobSpec, ...]:
    vendor_steps = tuple(
        PipelineStepSpec(id=f"vendor-{vendor_id}", name=f"Vendor {vendor_id}")
        for vendor_id in vendor_ids
    )
    artwork_steps = [
        PipelineStepSpec("gerbers", "Gerbers"),
        PipelineStepSpec("drill", "Drill"),
    ]
    if include_schematic:
        artwork_steps.append(PipelineStepSpec("schematic_pdf", "Schematic PDF"))
    return (
        PipelineJobSpec(
            "closure",
            "Closure",
            (PipelineStepSpec("closure", "Materialize input closure"),),
        ),
        PipelineJobSpec(
            "checks",
            "Checks",
            (
                PipelineStepSpec("drc", "DRC"),
                PipelineStepSpec("erc", "ERC"),
                PipelineStepSpec("board_stats", "Board stats"),
            ),
        ),
        PipelineJobSpec(
            "assembly",
            "Assembly",
            (
                PipelineStepSpec("positions", "Positions"),
                PipelineStepSpec("bom", "Bill of materials"),
                PipelineStepSpec("cruncher-assembly", "Assembly views"),
                *vendor_steps,
            ),
        ),
        PipelineJobSpec("artwork", "Artwork", tuple(artwork_steps)),
        PipelineJobSpec(
            "documents",
            "Documents",
            (
                PipelineStepSpec("documents-cover", "Cover page"),
                PipelineStepSpec("documents-fabrication", "Fabrication drawings"),
                PipelineStepSpec("documents-impedance", "Controlled impedance table"),
                PipelineStepSpec("documents-stackup", "Append manufacturer stackup"),
                PipelineStepSpec("documents-assembly", "Assembly drawings"),
                PipelineStepSpec("documents-testpoint", "Testpoint drawings"),
                PipelineStepSpec("documents-drill", "Drill drawing"),
                PipelineStepSpec("documents-bom", "Bill of materials PDF"),
                PipelineStepSpec("documents", "Finish documentation"),
            ),
        ),
        PipelineJobSpec(
            "package",
            "Package",
            (PipelineStepSpec("package", "Canonicalize, fingerprint, record"),),
        ),
    )


def _job_payload(spec: PipelineJobSpec) -> dict[str, Any]:
    return {
        "id": spec.id,
        "name": spec.name,
        "status": "queued",
        "steps": [
            {"id": step.id, "name": step.name, "status": "queued"}
            for step in spec.steps
        ],
    }


class PipelineTracker:
    """Mutate a pipeline tree and push it to the job payload on every flip."""

    def __init__(
        self,
        progress: ProgressFn | None,
        *,
        vendor_ids: Sequence[str] = (),
        include_schematic: bool = True,
    ) -> None:
        self._progress = progress
        self._pipeline = pipeline_skeleton(
            vendor_ids=vendor_ids,
            include_schematic=include_schematic,
        )
        self._step_index = {
            step["id"]: (job, step)
            for job in self._pipeline["jobs"]
            for step in job["steps"]
        }

    @property
    def snapshot(self) -> dict[str, Any]:
        return self._pipeline

    def seed(self, *, percent: float = 0, message: str = "Queued") -> None:
        self._emit(stage="queued", message=message, percent=percent)

    def start(self, step_id: str, *, message: str | None = None, percent: float | None = None) -> None:
        self._set_step(step_id, "in_progress")
        self._emit(
            stage=step_id,
            message=message or f"Running {self._step_name(step_id)}",
            percent=percent,
        )

    def succeed(
        self,
        step_id: str,
        *,
        elapsed_ms: int | None = None,
        log: str = "",
        message: str | None = None,
        percent: float | None = None,
    ) -> None:
        extra: dict[str, Any] = {}
        if elapsed_ms is not None:
            extra["elapsed_ms"] = elapsed_ms
        if log:
            extra["log"] = log[-4000:]
        self._set_step(step_id, "success", **extra)
        self._emit(
            stage=step_id,
            message=message or f"Finished {self._step_name(step_id)}",
            percent=percent,
        )

    def fail(
        self,
        step_id: str,
        *,
        message: str,
        log: str = "",
        elapsed_ms: int | None = None,
        percent: float | None = None,
    ) -> None:
        extra: dict[str, Any] = {"message": message}
        if elapsed_ms is not None:
            extra["elapsed_ms"] = elapsed_ms
        if log:
            extra["log"] = log[-4000:]
        self._set_step(step_id, "failure", **extra)
        self._emit(stage=step_id, message=message, percent=percent)

    def skip(self, step_id: str, *, reason: str = "") -> None:
        extra = {"message": reason} if reason else {}
        self._set_step(step_id, "skipped", **extra)
        self._emit(stage=step_id, message=reason or f"Skipped {self._step_name(step_id)}")

    def catalogue_event(
        self,
        step_id: str,
        status: str,
        *,
        elapsed_ms: int | None = None,
        log: str = "",
        message: str = "",
        percent: float | None = None,
    ) -> None:
        if status == "in_progress":
            self.start(step_id, message=message or None, percent=percent)
            return
        if status == "success":
            self.succeed(
                step_id,
                elapsed_ms=elapsed_ms,
                log=log,
                message=message or None,
                percent=percent,
            )
            return
        if status == "skipped":
            self.skip(step_id, reason=message)
            return
        self.fail(
            step_id,
            message=message or f"{step_id} failed",
            log=log,
            elapsed_ms=elapsed_ms,
            percent=percent,
        )

    def _step_name(self, step_id: str) -> str:
        pair = self._step_index.get(step_id)
        if pair is None:
            return step_id
        return str(pair[1].get("name") or step_id)

    def _set_step(self, step_id: str, status: str, **extra: Any) -> None:
        pair = self._step_index.get(step_id)
        if pair is None:
            return
        job, step = pair
        step["status"] = status
        step.update(extra)
        job["status"] = _job_status(job["steps"])

    def _emit(
        self,
        *,
        stage: str,
        message: str,
        percent: float | None = None,
    ) -> None:
        if self._progress is None:
            return
        kwargs: dict[str, Any] = {
            "stage": stage,
            "message": message,
            "payload_updates": {"pipeline": self._pipeline},
            "force": True,
        }
        if percent is not None:
            kwargs["percent"] = percent
        line = f"[{stage}] {message}"
        if percent is not None:
            line = f"{line} ({percent:.0f}%)"
        print(line, flush=True)
        self._progress(**kwargs)


def _job_status(steps: Sequence[Mapping[str, Any]]) -> str:
    statuses = [str(step.get("status") or "queued") for step in steps]
    if any(status == "failure" for status in statuses):
        return "failure"
    if all(status in {"success", "skipped"} for status in statuses):
        return "success"
    if any(status == "in_progress" for status in statuses):
        return "in_progress"
    if any(status == "success" for status in statuses):
        return "in_progress"
    return "queued"


__all__ = [
    "PipelineJobSpec",
    "PipelineStepSpec",
    "PipelineTracker",
    "pipeline_skeleton",
]
