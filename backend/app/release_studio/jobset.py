"""Release Studio jobset model, output closures, and hermetic step types."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping


# Stable Prism Workflow output ids from assets/Outputs.kicad_jobset.
WORKFLOW_OUTPUT_IDS: dict[str, str] = {
    "design": "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814",
    "manufacturing": "9e5c254b-cb26-4a49-beea-fa7af8a62903",
    "render": "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6",
}

# Step types that never invoke an arbitrary external process. Hermeticity of a
# release output still also requires every referenced input to resolve into the
# closure or a pinned toolchain resource (R2b); R1 only classifies step types.
HERMETIC_STEP_TYPES: frozenset[str] = frozenset(
    {
        "sch_export_plot_pdf",
        "sch_export_bom",
        "sch_export_netlist",
        "pcb_export_gerbers",
        "pcb_export_drill",
        "pcb_export_pos",
        "pcb_export_pdf",
        "pcb_export_3d",
        "pcb_export_ipcd356",
        "pcb_export_odb",
        "pcb_drc",
        "pcb_render",
        "sch_erc",
    }
)


@dataclass(frozen=True)
class JobsetJob:
    id: str
    type: str
    description: str = ""
    settings: Mapping[str, Any] = field(default_factory=dict)
    raw: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class JobsetOutput:
    id: str
    type: str
    description: str = ""
    only: tuple[str, ...] = ()
    settings: Mapping[str, Any] = field(default_factory=dict)
    raw: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class JobsetModel:
    jobs: tuple[JobsetJob, ...]
    outputs: tuple[JobsetOutput, ...]
    meta: Mapping[str, Any] = field(default_factory=dict)
    path: Path | None = None

    def job_by_id(self) -> dict[str, JobsetJob]:
        return {job.id: job for job in self.jobs}

    def output_by_id(self) -> dict[str, JobsetOutput]:
        return {output.id: output for output in self.outputs}


@dataclass(frozen=True)
class NonHermeticReason:
    step_id: str
    step_type: str
    message: str


@dataclass(frozen=True)
class OutputClosure:
    output_id: str
    jobs: tuple[JobsetJob, ...]
    hermetic: bool
    non_hermetic_reasons: tuple[NonHermeticReason, ...]


def load_jobset(path: Path | str) -> JobsetModel:
    """Parse a `.kicad_jobset` into a typed model."""

    jobset_path = Path(path)
    payload = json.loads(jobset_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"jobset root must be an object: {jobset_path}")

    jobs_raw = payload.get("jobs")
    outputs_raw = payload.get("outputs")
    if not isinstance(jobs_raw, list):
        raise ValueError(f"jobset jobs must be a list: {jobset_path}")
    if not isinstance(outputs_raw, list):
        raise ValueError(f"jobset outputs must be a list: {jobset_path}")

    jobs: list[JobsetJob] = []
    seen_job_ids: set[str] = set()
    for index, entry in enumerate(jobs_raw):
        if not isinstance(entry, dict):
            raise ValueError(f"jobset jobs[{index}] must be an object")
        job_id = _require_text(entry.get("id"), f"jobs[{index}].id")
        job_type = _require_text(entry.get("type"), f"jobs[{index}].type")
        if job_id in seen_job_ids:
            raise ValueError(f"duplicate job id {job_id!r}")
        seen_job_ids.add(job_id)
        description = entry.get("description") or ""
        if not isinstance(description, str):
            raise ValueError(f"jobs[{index}].description must be a string")
        settings = entry.get("settings") or {}
        if not isinstance(settings, dict):
            raise ValueError(f"jobs[{index}].settings must be an object")
        jobs.append(
            JobsetJob(
                id=job_id,
                type=job_type,
                description=description,
                settings=settings,
                raw=entry,
            )
        )

    outputs: list[JobsetOutput] = []
    seen_output_ids: set[str] = set()
    for index, entry in enumerate(outputs_raw):
        if not isinstance(entry, dict):
            raise ValueError(f"jobset outputs[{index}] must be an object")
        output_id = _require_text(entry.get("id"), f"outputs[{index}].id")
        output_type = _require_text(entry.get("type"), f"outputs[{index}].type")
        if output_id in seen_output_ids:
            raise ValueError(f"duplicate output id {output_id!r}")
        seen_output_ids.add(output_id)
        description = entry.get("description") or ""
        if not isinstance(description, str):
            raise ValueError(f"outputs[{index}].description must be a string")
        only_raw = entry.get("only") or []
        if not isinstance(only_raw, list) or not all(
            isinstance(item, str) and item for item in only_raw
        ):
            raise ValueError(f"outputs[{index}].only must be a list of non-empty strings")
        settings = entry.get("settings") or {}
        if not isinstance(settings, dict):
            raise ValueError(f"outputs[{index}].settings must be an object")
        outputs.append(
            JobsetOutput(
                id=output_id,
                type=output_type,
                description=description,
                only=tuple(only_raw),
                settings=settings,
                raw=entry,
            )
        )

    meta = payload.get("meta") or {}
    if not isinstance(meta, dict):
        raise ValueError("jobset meta must be an object")

    return JobsetModel(
        jobs=tuple(jobs),
        outputs=tuple(outputs),
        meta=meta,
        path=jobset_path,
    )


def step_closure_for_output(model: JobsetModel, output_id: str) -> tuple[JobsetJob, ...]:
    """Return jobs selected by an output, recursively expanding nested outputs.

    Expansion follows each output's ``only`` list. Job ids resolve to jobs;
    output ids resolve to that nested output's closure. Cycles and unknown ids
    raise ``ValueError``.
    """

    jobs_by_id = model.job_by_id()
    outputs_by_id = model.output_by_id()
    if output_id not in outputs_by_id:
        raise ValueError(f"unknown jobset output id: {output_id!r}")

    ordered: list[JobsetJob] = []
    seen_jobs: set[str] = set()
    visiting_outputs: set[str] = set()

    def visit_output(current_output_id: str) -> None:
        if current_output_id in visiting_outputs:
            raise ValueError(
                f"cyclic jobset output closure involving {current_output_id!r}"
            )
        output = outputs_by_id.get(current_output_id)
        if output is None:
            raise ValueError(f"unknown jobset output id: {current_output_id!r}")
        visiting_outputs.add(current_output_id)
        for reference in output.only:
            if reference in outputs_by_id:
                visit_output(reference)
                continue
            job = jobs_by_id.get(reference)
            if job is None:
                raise ValueError(
                    f"output {current_output_id!r} references unknown id {reference!r}"
                )
            if job.id in seen_jobs:
                continue
            seen_jobs.add(job.id)
            ordered.append(job)
        visiting_outputs.remove(current_output_id)

    visit_output(output_id)
    return tuple(ordered)


def classify_output_hermetic(
    model: JobsetModel,
    output_id: str,
    *,
    hermetic_step_types: Iterable[str] = HERMETIC_STEP_TYPES,
) -> OutputClosure:
    """Classify whether an output's recursively selected steps are hermetic."""

    allowed = frozenset(hermetic_step_types)
    jobs = step_closure_for_output(model, output_id)
    reasons: list[NonHermeticReason] = []
    for job in jobs:
        if job.type not in allowed:
            reasons.append(
                NonHermeticReason(
                    step_id=job.id,
                    step_type=job.type,
                    message=(
                        f"step type {job.type!r} is outside HERMETIC_STEP_TYPES"
                    ),
                )
            )
    return OutputClosure(
        output_id=output_id,
        jobs=jobs,
        hermetic=not reasons,
        non_hermetic_reasons=tuple(reasons),
    )


def workflow_output_id(workflow_type: str) -> str:
    """Map a Prism workflow name onto the reference jobset output id."""

    try:
        return WORKFLOW_OUTPUT_IDS[workflow_type]
    except KeyError as exc:
        raise ValueError(f"Unknown workflow type: {workflow_type}") from exc


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value
