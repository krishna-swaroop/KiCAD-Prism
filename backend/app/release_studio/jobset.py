"""Release Studio jobset model, output closures, and hermetic step types."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from types import MappingProxyType
from typing import Any, Iterable, Mapping


# Stable Prism Workflow output ids from assets/Outputs.kicad_jobset.  Keep this
# public mapping immutable: project_service intentionally aliases this object.
WORKFLOW_OUTPUT_IDS: Mapping[str, str] = MappingProxyType(
    {
        "design": "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814",
        "manufacturing": "9e5c254b-cb26-4a49-beea-fa7af8a62903",
        "render": "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6",
    }
)


class StepTypeStatus(str, Enum):
    """R1 status for a KiCad job type in the pinned toolchain."""

    HERMETIC = "hermetic"
    NON_HERMETIC = "non_hermetic"
    UNSUPPORTED = "unsupported"


# KiCad 10.0.4's common/jobs REGISTER_JOB and REGISTER_DEPRECATED_JOB entries
# (tag f7414d419cae5df2d00e7eaacb16fc0e803799bc).  These types do not invoke an
# arbitrary external process themselves.  R2b still has to prove that their
# file and library inputs are inside the release closure or pinned toolchain.
HERMETIC_STEP_TYPES: frozenset[str] = frozenset(
    {
        "pcb_drc",
        "pcb_export_3d",
        "pcb_export_drill",
        "pcb_export_dxf",
        "pcb_export_gencad",
        "pcb_export_gerbers",
        "pcb_export_hpgl",
        "pcb_export_ipc2581",
        "pcb_export_ipcd356",
        "pcb_export_odb",
        "pcb_export_pdf",
        "pcb_export_pos",
        "pcb_export_ps",
        "pcb_export_stats",
        "pcb_export_svg",
        "pcb_render",
        "sch_erc",
        "sch_export_bom",
        "sch_export_netlist",
        "sch_export_plot_dxf",
        "sch_export_plot_hpgl",
        "sch_export_plot_pdf",
        "sch_export_plot_ps",
        "sch_export_plot_svg",
    }
)


# This is deliberately a typed registry, not an allowlist inferred from the
# reference jobset.  A type absent from this mapping is unsupported for the
# pinned KiCad 10.0.4 executor and must never become hermetic by default.
KICAD_10_0_4_STEP_TYPE_STATUS: Mapping[str, StepTypeStatus] = MappingProxyType(
    {
        **{step_type: StepTypeStatus.HERMETIC for step_type in HERMETIC_STEP_TYPES},
        "special_copyfiles": StepTypeStatus.NON_HERMETIC,
        "special_execute": StepTypeStatus.NON_HERMETIC,
    }
)


KICAD_10_0_4_JOB_TYPES: frozenset[str] = frozenset(
    KICAD_10_0_4_STEP_TYPE_STATUS
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
class UnsupportedReason:
    """A job or destination reference Prism cannot safely classify."""

    step_id: str | None
    step_type: str | None
    message: str
    reference: str | None = None


@dataclass(frozen=True)
class StepTypeClassification:
    """The typed R1 classification of one job type."""

    step_type: str
    status: StepTypeStatus
    message: str

    @property
    def reason(self) -> str:
        """Compatibility spelling for consumers that call this a reason."""

        return self.message


@dataclass(frozen=True)
class OutputClosure:
    output_id: str
    jobs: tuple[JobsetJob, ...]
    hermetic: bool
    non_hermetic_reasons: tuple[NonHermeticReason, ...]
    status: StepTypeStatus = StepTypeStatus.HERMETIC
    unsupported_reasons: tuple[UnsupportedReason, ...] = ()
    unresolved_references: tuple[str, ...] = ()

    @property
    def classification(self) -> StepTypeStatus:
        """Return the status consumed by later release gates."""

        return self.status


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
    """Return jobs selected by a KiCad destination.

    KiCad 10.0.4 treats ``only`` as a flat list of job ids.  Missing or empty
    ``only`` means every job, while an unknown id is skipped.  Prism mirrors
    that execution selection here; :func:`classify_output_hermetic` separately
    records skipped ids as ``unsupported`` so they cannot silently make a
    release appear hermetic.
    """

    jobs, _ = _selected_jobs_for_output(model, output_id)
    return jobs


def classify_output_hermetic(
    model: JobsetModel,
    output_id: str,
    *,
    hermetic_step_types: Iterable[str] = HERMETIC_STEP_TYPES,
) -> OutputClosure:
    """Classify an output without conflating unsafe and unsupported inputs."""

    allowed = frozenset(hermetic_step_types)
    jobs, unresolved_references = _selected_jobs_for_output(model, output_id)
    reasons: list[NonHermeticReason] = []
    unsupported_reasons: list[UnsupportedReason] = [
        UnsupportedReason(
            step_id=None,
            step_type=None,
            reference=reference,
            message=(
                f"output {output_id!r} references unknown job id {reference!r}; "
                "KiCad skips it, but Release Studio fails closed"
            ),
        )
        for reference in unresolved_references
    ]
    for job in jobs:
        classification = classify_step_type(job.type)
        if classification.status is StepTypeStatus.UNSUPPORTED:
            unsupported_reasons.append(
                UnsupportedReason(
                    step_id=job.id,
                    step_type=job.type,
                    message=classification.message,
                )
            )
        elif classification.status is StepTypeStatus.NON_HERMETIC:
            reasons.append(
                NonHermeticReason(
                    step_id=job.id,
                    step_type=job.type,
                    message=classification.message,
                )
            )
        elif job.type not in allowed:
            # Keep the old injectable allowlist seam for characterization and
            # callers that intentionally narrow the safe set.  It can never
            # expand the KiCad registry or turn special/unknown types safe.
            reasons.append(
                NonHermeticReason(
                    step_id=job.id,
                    step_type=job.type,
                    message=(
                        f"step type {job.type!r} is outside the supplied "
                        "hermetic_step_types"
                    ),
                )
            )

    if unsupported_reasons:
        status = StepTypeStatus.UNSUPPORTED
    elif reasons:
        status = StepTypeStatus.NON_HERMETIC
    else:
        status = StepTypeStatus.HERMETIC

    return OutputClosure(
        output_id=output_id,
        jobs=jobs,
        hermetic=status is StepTypeStatus.HERMETIC,
        non_hermetic_reasons=tuple(reasons),
        status=status,
        unsupported_reasons=tuple(unsupported_reasons),
        unresolved_references=unresolved_references,
    )


def classify_step_type(step_type: str) -> StepTypeClassification:
    """Classify one KiCad 10.0.4 job type for downstream release gates."""

    status = KICAD_10_0_4_STEP_TYPE_STATUS.get(
        step_type, StepTypeStatus.UNSUPPORTED
    )
    if status is StepTypeStatus.HERMETIC:
        message = f"step type {step_type!r} is process-free in KiCad 10.0.4"
    elif status is StepTypeStatus.NON_HERMETIC:
        if step_type == "special_execute":
            message = (
                "step type 'special_execute' invokes an arbitrary external command"
            )
        else:
            message = (
                "step type 'special_copyfiles' may read arbitrary input paths; "
                "R2b must prove those paths before it can be hermetic"
            )
    else:
        message = (
            f"step type {step_type!r} is not registered by the pinned KiCad "
            "10.0.4 job registry"
        )
    return StepTypeClassification(step_type=step_type, status=status, message=message)


def _selected_jobs_for_output(
    model: JobsetModel, output_id: str
) -> tuple[tuple[JobsetJob, ...], tuple[str, ...]]:
    """Return KiCad-compatible selected jobs and unresolved ``only`` ids."""

    outputs_by_id = model.output_by_id()
    output = outputs_by_id.get(output_id)
    if output is None:
        raise ValueError(f"unknown jobset output id: {output_id!r}")

    # This is KiCad's explicit default in JOBSET::GetJobsForDestination: an
    # omitted or empty `only` list runs every job, including special jobs.
    if not output.only:
        return model.jobs, ()

    jobs_by_id = model.job_by_id()
    selected: list[JobsetJob] = []
    unresolved: list[str] = []
    for reference in output.only:
        # Jobs take precedence by construction. Output ids are not execution
        # references in KiCad and must never trigger invented recursion.
        job = jobs_by_id.get(reference)
        if job is None:
            unresolved.append(reference)
            continue
        selected.append(job)
    return tuple(selected), tuple(unresolved)


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
