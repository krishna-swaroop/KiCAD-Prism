"""Build waves and structured build progress for the Release Studio UI.

``run_build_waves`` orders a build's tool work: checks, positions, BOM, the
assembly Cruncher, vendor packs, then artwork. The waves are sequential on
purpose (see the comments in it); documents and packaging follow in
``execute_build``.

The worker already reports a single ``stage`` / ``message`` / ``percent``
triple. That is enough for a spinner and not enough for a GitHub Actions-style
jobs list. ``PipelineTracker`` owns the jobs/steps tree that is written into the
job payload as ``pipeline`` and never into a fingerprint or the manifest.
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Mapping, Sequence

from app.release_studio.config.schema import DEFAULT_ARTWORK_LINE_WEIGHTS
from app.release_studio.steps import (
    CATALOGUE_WAVE_ARTWORK,
    CATALOGUE_WAVE_BOARD,
    CATALOGUE_WAVE_BOM,
    CATALOGUE_WAVE_CHECKS,
    STEP_CATALOGUE,
    StepOutput,
    run_step_catalogue,
)
from app.release_studio.vendors import (
    generate_vendor_outputs,
    resolve_vendor_ids,
)
from app.services.kicad_tools import KicadTool, KicadTools
from app.services.tree_removal import remove_tree

if TYPE_CHECKING:
    from app.release_studio.bundle_design import BundleDesign

logger = logging.getLogger(__name__)

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


def settle_pipeline_steps(pipeline: Mapping[str, Any] | None, status: str) -> bool:
    """End the steps a dead build left open; whether anything changed.

    The step that was running takes ``status`` (``failure`` or ``cancelled``);
    steps that never started become ``cancelled`` whatever the job's end, so one
    failed step does not read as dozens. Each job's status is then recomputed
    from its steps, keeping a real ``failure`` on cancel.
    """

    if not isinstance(pipeline, Mapping):
        return False
    changed = False
    for job in pipeline.get("jobs") or []:
        if not isinstance(job, dict):
            continue
        steps = [step for step in job.get("steps") or [] if isinstance(step, dict)]
        job_changed = False
        for step in steps:
            current = str(step.get("status") or "queued")
            if current == "in_progress":
                step["status"] = status
                job_changed = True
            elif current == "queued":
                step["status"] = "cancelled"
                job_changed = True
        if job_changed:
            job["status"] = _job_status(steps)
            changed = True
    return changed


def _job_status(steps: Sequence[Mapping[str, Any]]) -> str:
    statuses = [str(step.get("status") or "queued") for step in steps]
    if any(status == "failure" for status in statuses):
        return "failure"
    if any(status == "cancelled" for status in statuses) and not any(
        status in {"queued", "in_progress"} for status in statuses
    ):
        return "cancelled"
    if all(status in {"success", "skipped"} for status in statuses):
        return "success"
    if any(status == "in_progress" for status in statuses):
        return "in_progress"
    if any(status == "success" for status in statuses):
        return "in_progress"
    return "queued"


@dataclass(frozen=True)
class WaveOutputs:
    """What the tool waves produced, before documents and packaging."""

    #: Catalogue outputs in ``STEP_CATALOGUE`` order.
    outputs: tuple[StepOutput, ...]
    by_step: Mapping[str, StepOutput]
    assembly_views: dict[str, Any] | None
    assembly_error: BaseException | None
    vendor_outputs: tuple[StepOutput, ...]
    extra_evidence: dict[str, bytes]
    #: In `paper` line-weight mode, the sheet size and ratio the artwork was
    #: drawn at, so the document engine places it at exactly that ratio.
    artwork_sheet_size: str | None = None
    artwork_paper_scale: float | None = None


def run_build_waves(
    tracker: PipelineTracker,
    *,
    progress: ProgressFn,
    tools: KicadTools,
    closure_root: Path,
    output_root: Path,
    artwork_root: Path,
    config: Mapping[str, Any],
    variant: str,
    timings: list[dict[str, Any]],
    candidate: Mapping[str, Any] | None = None,
    vendor_cli: KicadTool | None = None,
    design: "BundleDesign",
) -> WaveOutputs:
    """Run the catalogue waves, the assembly views and the vendor packs, in order.

    The assembly and testpoint views come from ``prism-kicad artwork`` over the
    build's ready design bundle; the vendor packs come from ``prism-kicad vendor
    run`` over the same archive (``vendor_cli`` overrides the located
    ``prism-kicad`` for tests). Each wave appends its wall time to ``timings``
    (evidence, never hashed).

    ``design`` is the build's one ready-bundle answer.  Every board and
    schematic input is the bundle's own file (C3c), so no step reads the
    checkout's board.
    """

    def _timed(name: str, fn):
        started = time.perf_counter()
        try:
            return fn()
        finally:
            timings.append(
                {
                    "name": name,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
                }
            )

    board_rel = str(config.get("board") or "")
    schematic_rel = str(config.get("schematic") or "") or None
    bom_preset = str(config.get("bom_preset") or "")
    project_relpath = str((candidate or {}).get("project_relpath") or "")
    design_board_path: Path | None = None
    design_schematic_path: Path | None = None
    design_board_label: str | None = None
    design_schematic_label: str | None = None
    design_board_path = design.board_path(board_rel, project_relpath)
    design_board_label = design.board_member(board_rel, project_relpath)
    if schematic_rel:
        design_schematic_path = design.schematic_path(
            schematic_rel, project_relpath
        )
        design_schematic_label = design.schematic_member(
            schematic_rel, project_relpath
        )
    assembly_views: dict[str, Any] | None = None
    assembly_error: BaseException | None = None

    board_project = _board_project(design, design_board_path, output_root.parent / "board-project")

    def _catalogue(
        timing_name: str,
        only: tuple[str, ...],
        *,
        with_bom_preset: bool = False,
        project_dir: Path | None = None,
    ):
        return _timed(
            timing_name,
            lambda: run_step_catalogue(
                closure_root=closure_root,
                board_rel=board_rel,
                schematic_rel=schematic_rel,
                output_root=output_root,
                variant=variant,
                tool=tools.cli,
                only=only,
                progress=lambda **kwargs: progress(**kwargs),
                on_step=tracker.catalogue_event,
                bom_preset=bom_preset if with_bom_preset else "",
                board_path=design_board_path,
                schematic_path=design_schematic_path,
                board_label=design_board_label,
                schematic_label=design_schematic_label,
                project_dir=project_dir,
            ),
        )

    # The board outputs first, from one board load (DRC leads, so a board that
    # will not open fails early), then ERC, BOM and artwork, one wave at a
    # time: parallel kicad-cli loads have died with std::bad_alloc.
    outputs_board = _catalogue("catalogue-wave-board", CATALOGUE_WAVE_BOARD, project_dir=board_project)
    outputs_checks = _catalogue("catalogue-wave-checks", CATALOGUE_WAVE_CHECKS)
    outputs_bom = _catalogue(
        "catalogue-wave-bom",
        CATALOGUE_WAVE_BOM,
        with_bom_preset=True,
    )
    tracker.start("cruncher-assembly", message="Rendering assembly views")
    bundle_archive = design.archive_path
    artwork_sheet_size: str | None = None
    artwork_paper_scale: float | None = None
    try:
        artwork_sheet_size, artwork_paper_scale = _artwork_scale(
            config, output_root, candidate
        )
        from app.release_studio.documents.artwork_bundle import (
            acquire_bundle_views,
        )

        assembly_views = _timed(
            "cruncher-assembly",
            lambda: acquire_bundle_views(
                bundle_archive,
                artwork_root / "bundle",
                variant=variant,
                paper_scale=artwork_paper_scale,
            ),
        )
        tracker.succeed("cruncher-assembly")
    except Exception as exc:  # noqa: BLE001 - compose records the miss
        assembly_error = exc
        logger.warning(
            "Release Studio assembly views unavailable: %s", exc
        )
        tracker.fail("cruncher-assembly", message=str(exc))
    # Vendor generators read the same design bundle; run them after the
    # artwork so the two heavy loads are not overlapped.
    vendor_outputs, extra_evidence = _timed(
        "vendors",
        lambda: _run_vendors(
            config=config,
            closure_root=closure_root,
            output_root=output_root,
            variant=variant,
            tracker=tracker,
            vendor_cli=vendor_cli,
            design=design,
        ),
    )
    outputs_artwork = _catalogue("catalogue-wave-artwork", CATALOGUE_WAVE_ARTWORK)

    combined = {
        output.step_id: output
        for output in (*outputs_board, *outputs_checks, *outputs_bom, *outputs_artwork)
    }
    return WaveOutputs(
        outputs=tuple(
            combined[spec.step_id] for spec in STEP_CATALOGUE if spec.step_id in combined
        ),
        by_step=combined,
        assembly_views=assembly_views,
        assembly_error=assembly_error,
        vendor_outputs=vendor_outputs,
        extra_evidence=extra_evidence,
        artwork_sheet_size=artwork_sheet_size,
        artwork_paper_scale=artwork_paper_scale,
    )


def _board_project(design: Any, board: Path | None, root: Path) -> Path | None:
    """A scratch project directory the board steps run in, or ``None``.

    The bundle's ``sources/`` tree hard-linked (copied where linking fails)
    under ``root``, with the board the steps read (the refilled one) in place
    of the saved board. The board jobset needs the project file named after
    the board, and DRC's schematic parity needs the schematics beside it.
    """

    config = getattr(design, "config", None) or {}
    project_file = str(config.get("project_file") or "")
    board_file = str(config.get("board") or "")
    if board is None or not project_file or not board_file:
        return None
    try:
        sources = design.sources_dir()
        remove_tree(root, ignore_errors=True)
        shutil.copytree(sources, root, copy_function=_link_or_copy)
        target = root / board_file
        # A hard link shares the extraction's bytes: unlink before writing.
        target.unlink(missing_ok=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(board, target)
    except (OSError, AttributeError) as exc:
        logger.warning("Release Studio board steps run without a project tree: %s", exc)
        return None
    project_dir = target.parent
    if (project_dir / f"{target.stem}.kicad_pro").is_file() and (root / project_file).parent == project_dir:
        return project_dir
    return None


def _link_or_copy(source: str, destination: str) -> None:
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def _artwork_scale(
    config: Mapping[str, Any],
    output_root: Path,
    candidate: Mapping[str, Any] | None = None,
) -> tuple[str | None, float | None]:
    """The sheet size and ratio the set will use, when line weights follow paper.

    ``drawing`` (the default) keeps today's board-millimetre artwork, so the
    sheet chooses its own ratio. ``paper`` needs the ratio before the CLI runs:
    it is the same :func:`package_scale` the document engine calls, from the
    board extents the sheets already use.
    """

    if (
        str(config.get("artwork_line_weights") or DEFAULT_ARTWORK_LINE_WEIGHTS)
        .strip()
        .lower()
        != "paper"
    ):
        return None, None
    import json

    from app.release_studio.documents import notes as note_templates
    from app.release_studio.documents.artwork import ArtworkError
    from app.release_studio.documents.engine import board_extent
    from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY
    from app.release_studio.documents.sheets import package_scale, title_block_height
    from app.release_studio.documents.style import DEFAULT_SHEET_STYLE

    stats_path = output_root / "fabrication" / "board-stats.json"
    try:
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ArtworkError(
            "artwork_line_weights: paper needs the board statistics, which "
            f"could not be read: {stats_path}"
        ) from error
    width, height = board_extent(stats)
    if width <= 0 or height <= 0:
        raise ArtworkError(
            "artwork_line_weights: paper needs the board extents, which the "
            "board statistics do not state"
        )
    # The title block's height changes the artwork window, and with it the
    # sheet size and ratio. Resolve the configured fields the way the document
    # engine does rather than assuming the default height.
    candidate = candidate or {}
    context = {
        "title": str(config.get("title") or config.get("document_number") or "RELEASE"),
        "document_name": str(config.get("document_number") or ""),
        "document_number": str(config.get("document_number") or ""),
        "revision": str(config.get("revision") or ""),
        "commit_sha": str(candidate.get("commit_sha") or ""),
        "variant": str(candidate.get("variant") or ""),
        # The engine fills this from the repository; a field that prints the
        # commit date is still counted here because the key exists.
        "commit_date": "",
        "release_date": str(config.get("release_date") or ""),
    }
    typography = str(config.get("typography") or DEFAULT_TYPOGRAPHY)
    fields = config.get("fields") or {}
    substitutions = note_templates.substitution_context(context, fields=fields, stats=stats)
    title_fields, _warnings = note_templates.resolve_fields(
        fields, substitutions, typography=typography
    )
    return package_scale(
        width,
        height,
        title_height=title_block_height(context, title_fields),
        sheet_style=str(config.get("sheet_style") or DEFAULT_SHEET_STYLE),
    )





def _run_vendors(
    *,
    config: Mapping[str, Any],
    closure_root: Path,
    output_root: Path,
    variant: str,
    tracker: PipelineTracker,
    vendor_cli: KicadTool | None = None,
    design: "BundleDesign",
) -> tuple[tuple[StepOutput, ...], dict[str, bytes]]:
    """Generate configured vendor packs from the build's design bundle.

    The pack comes from ``prism-kicad vendor run`` over the archive the build
    already resolved, so a vendor pack cannot switch source halfway through a
    build.
    """

    vendor_ids = resolve_vendor_ids(config)
    if not vendor_ids:
        return (), {}
    for vendor_id in vendor_ids:
        tracker.start(f"vendor-{vendor_id}", message=f"Generating {vendor_id} pack")

    bundle = design.archive_path
    if vendor_cli is None:
        from app.release_studio.vendors.cli import prism_kicad

        located = prism_kicad()
        vendor_cli = located if located.available() else None
    outputs, extra_evidence = generate_vendor_outputs(
        config=config,
        closure_root=closure_root,
        output_root=output_root,
        variant=variant,
        cli=vendor_cli,
        bundle=bundle,
    )
    by_id = {output.step_id: output for output in outputs}
    for vendor_id in vendor_ids:
        step_id = f"vendor-{vendor_id}"
        output = by_id.get(step_id)
        if output is None:
            tracker.skip(step_id, reason="vendor generator produced no output")
            continue
        log = "\n".join(part for part in (output.stdout, output.stderr) if part)
        if output.skipped_reason:
            tracker.skip(step_id, reason=output.skipped_reason)
        elif output.returncode != 0:
            tracker.fail(
                step_id,
                message=output.stderr or output.skipped_reason or f"{vendor_id} failed",
                log=log,
                elapsed_ms=output.elapsed_ms,
            )
        else:
            tracker.succeed(step_id, elapsed_ms=output.elapsed_ms, log=log)
    return outputs, extra_evidence


__all__ = [
    "PipelineJobSpec",
    "PipelineStepSpec",
    "PipelineTracker",
    "WaveOutputs",
    "pipeline_skeleton",
    "run_build_waves",
]
