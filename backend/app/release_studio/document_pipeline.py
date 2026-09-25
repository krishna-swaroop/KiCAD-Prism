"""Gather document inputs and compose Stage 2 sheets as a member-producing step.

The Documentation Engine is a member producer: it adds files under the
``documentation`` domain and changes nothing else. Projection gathering and
sheet composition live here so the build service can stay an orchestrator.
Artwork subprocesses stay behind :func:`acquire_views`.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Mapping, Sequence

from app.release_studio import dossier as dossier_module
from app.release_studio.documents.artwork import ArtworkError
from app.release_studio.documents.engine import compose_documents
from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY
from app.release_studio.documents.inputs import DocumentInputs
from app.release_studio.pipeline import PipelineTracker
from app.release_studio.steps import DOCUMENT_STEP_SPEC, StepOutput

logger = logging.getLogger(__name__)


def with_documents(
    outputs: Sequence[StepOutput],
    *,
    closure_root: Path,
    config: Mapping[str, Any],
    candidate: Mapping[str, Any],
    output_root: Path,
    cli_path: str | None,
    staging: Path,
    cruncher_path: str | None = None,
    repo_root: Path | None = None,
    project_relpath: str | None = None,
    assembly_views: Mapping[str, Any] | None = None,
    assembly_error: BaseException | None = None,
    timings: list[dict[str, Any]] | None = None,
    tracker: PipelineTracker | None = None,
    repo_url: str = "",
) -> tuple[list[StepOutput], list[str], dict[str, Any]]:
    """Compose the Stage 2 sheets and append them as a member-producing step.

    The Documentation Engine is a member producer: it adds files under the
    ``documentation`` domain and changes nothing else.  A compose failure is a
    failed documents step (returncode 1, no sheet members). Manufacturing
    outputs already produced still assemble.

    Every degradation is returned so it can be recorded on the build row.  A
    log line is not enough: this runs in a job subprocess, so a document set
    that silently vanished looked exactly like one that was never configured.
    """

    # Callers still pass the project path; composition reads it from config.

    try:
        inputs, warnings, projections = _gather_document_inputs(
            outputs,
            closure_root=closure_root,
            config=config,
            candidate=candidate,
            output_root=output_root,
            cli_path=cli_path,
            cruncher_path=cruncher_path,
            staging=staging,
            repo_root=repo_root,
            repo_url=repo_url,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Release Studio projections failed before compose")
        warnings = [f"documentation: no sheets were composed ({exc})"]
        return [
            *outputs,
            _documents_step(output_root, returncode=1, skipped_reason=f"compose failed: {exc}"),
        ], warnings, {}

    last_step = {"id": None}

    def _on_document_progress(step: str, message: str, percent: float) -> None:
        if tracker is None:
            print(f"[{step}] {message} ({percent:.0f}%)", flush=True)
            return
        previous = last_step["id"]
        if previous and previous != step:
            tracker.succeed(previous, percent=percent)
        tracker.start(step, message=message, percent=percent)
        last_step["id"] = step

    _skip_optional_sources(tracker, inputs, candidate)

    compose_kwargs: dict[str, Any] = {"on_progress": _on_document_progress}
    if assembly_error is not None:

        def _failed_assembly(*_args, **_kwargs):
            raise ArtworkError(str(assembly_error)) from assembly_error

        compose_kwargs["assembly_acquirer"] = _failed_assembly
    elif assembly_views is not None:
        compose_kwargs["assembly_acquirer"] = lambda *_args, **_kwargs: assembly_views

    compose_started = time.perf_counter()
    try:
        document_set = compose_documents(inputs, **compose_kwargs)
        if tracker is not None and last_step["id"]:
            tracker.succeed(last_step["id"], percent=79)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Documentation Engine produced no sheets")
        warnings.append(f"documentation: no sheets were composed ({exc})")
        elapsed_ms = int((time.perf_counter() - compose_started) * 1000)
        if timings is not None:
            timings.append({"name": "compose", "elapsed_ms": elapsed_ms})
        return [
            *outputs,
            _documents_step(
                output_root,
                returncode=1,
                skipped_reason=f"compose failed: {exc}",
                elapsed_ms=elapsed_ms,
            ),
        ], warnings, projections
    if timings is not None:
        timings.append(
            {
                "name": "compose",
                "elapsed_ms": round((time.perf_counter() - compose_started) * 1000, 1),
            }
        )

    for warning in document_set.warnings:
        logger.warning("Documentation Engine: %s", warning)
        warnings.append(f"documentation: {warning}")

    written: list[Path] = []
    for relative, payload in sorted(document_set.files().items()):
        target = output_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        written.append(target)

    if not written:
        warnings.append("documentation: the engine composed no sheets")
        return [
            *outputs,
            _documents_step(
                output_root,
                returncode=1,
                skipped_reason="the engine composed no sheets",
            ),
        ], warnings, projections

    return [
        *outputs,
        _documents_step(output_root, files=written),
    ], warnings, projections


def _skip_optional_sources(
    tracker: PipelineTracker | None,
    inputs: DocumentInputs,
    candidate: Mapping[str, Any],
) -> None:
    if tracker is None:
        return
    impedance_supplied = bool(candidate.get("_impedance_supplied"))
    stackup_supplied = bool(candidate.get("_stackup_supplied"))
    if not inputs.impedance_rows:
        tracker.skip(
            "documents-impedance",
            reason=(
                "the uploaded impedance CSV produced no rows"
                if impedance_supplied
                else "no impedance CSV uploaded"
            ),
        )
    if not inputs.stackup_pdf:
        tracker.skip(
            "documents-stackup",
            reason=(
                "the uploaded stackup PDF could not be read"
                if stackup_supplied
                else "no stackup PDF uploaded"
            ),
        )
    if not inputs.bom_rows:
        tracker.skip("documents-bom", reason="no BOM CSV produced")


def _gather_document_inputs(
    outputs: Sequence[StepOutput],
    *,
    closure_root: Path,
    config: Mapping[str, Any],
    candidate: Mapping[str, Any],
    output_root: Path,
    cli_path: str | None,
    cruncher_path: str | None,
    staging: Path,
    repo_root: Path | None,
    repo_url: str,
) -> tuple[DocumentInputs, list[str], dict[str, Any]]:
    """Project board facts into a typed document-input record."""

    from app.release_studio.projections import (
        board_designators,
        load_board_model,
        project_board_stats_file,
        project_population,
        project_testpoints,
        project_stackup,
        project_variants,
    )
    from app.release_studio.semantic import semantic_scope_projections
    from app.services import semantic_index_service

    warnings: list[str] = []
    board_rel = str(config.get("board") or "")
    board = closure_root / board_rel if board_rel else None

    def _project(label: str, fn, default):
        """Run one projection; a failure costs that table, not the sheet set."""

        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Release Studio projection %s unavailable: %s", label, exc)
            warnings.append(f"documentation: the {label} projection is unavailable ({exc})")
            return default

    stats_file = output_root / "fabrication/board-stats.json"
    stats = (
        _project("board_stats", lambda: project_board_stats_file(stats_file), {})
        if stats_file.is_file()
        else {}
    )

    stackup: dict[str, Any] = {}
    variants: dict[str, Any] = {}
    testpoints: dict[str, Any] = {}
    population: dict[str, Any] = {}
    designators: tuple[str, ...] = ()
    parsed_pcb = None
    fallback_reason = None
    if board is not None and board.is_file():
        # One parse for both projections.  On a 35 MB board this is over two
        # minutes of work, and doing it twice for the same file was the
        # single largest avoidable cost in a build.
        model = _project("board model", lambda: load_board_model(board), (None, None))
        stackup = _project("stackup", lambda: project_stackup(board, model=model), {})
        if stackup.get("source") == "kicad_monkey.fallback":
            warnings.append(
                "documentation: stackup used the kicad_monkey targeted fallback "
                f"({stackup.get('fallback_reason') or 'typed model rejected the board'})"
            )
        # Schematic variants live in the *project* file, not the schematic:
        # `schematic_settings.cpp:266` reads them from `.kicad_pro`.
        project_file = board.with_suffix(".kicad_pro")
        # Only a *typed* model can answer the variant question; the targeted
        # stackup fallback has no footprints, so that case re-parses.
        parsed_pcb, fallback_reason = model
        variants = _project(
            "variants",
            lambda: project_variants(
                board,
                project_file if project_file.is_file() else None,
                pcb=None if fallback_reason else parsed_pcb,
            ),
            {},
        )
        testpoints = _project(
            "testpoints", lambda: project_testpoints(board, model=model), {}
        )
        population = _project(
            "population", lambda: project_population(board, model=model), {}
        )
        designators = _project(
            "designators", lambda: board_designators(board, model=model), ()
        )

    placements = _placements(output_root / "assembly/positions.csv")
    projections: dict[str, Any] = {
        "board_stats": stats,
        "stackup": stackup,
        "variants": variants,
        "placements": placements,
        "testpoints": testpoints,
        "population": population,
    }

    project_file = board.with_suffix(".kicad_pro") if board is not None else None
    if project_file is not None and project_file.is_file():
        semantic_index = _project(
            "semantic index",
            lambda: semantic_index_service.build_semantic_index(
                project_file,
                source_revision_key=(
                    semantic_index_service.source_revision_key_for_project_file(project_file)
                ),
                commit=str(candidate.get("commit_sha") or "") or None,
                pcb=None if fallback_reason else parsed_pcb,
            ),
            {},
        )
        if semantic_index:
            projections["semantic"] = semantic_scope_projections(semantic_index)

    # The cover lists the members produced so far; it cannot list itself.
    existing = dossier_module.build_members(list(outputs))
    member_rows = [
        {
            "path": member.path,
            "canonicalizer": member.canonicalizer,
            "released_digest": member.released_digest,
        }
        for member in existing
    ]

    revision_history = _cover_revision_history(
        repo_url=repo_url,
        config=config,
        candidate=candidate,
        repo_root=repo_root,
    )

    typography = str(config.get("typography") or DEFAULT_TYPOGRAPHY)
    logger.info("Release Studio using typography %s", typography)

    impedance_rows = list(candidate.get("_impedance_rows") or [])
    stackup_pdf = candidate.get("_stackup_pdf") or None
    bom_headers, bom_rows = _bom_schedule(outputs)

    inputs = DocumentInputs(
        context={
            "title": str(config.get("title") or config.get("document_number") or "RELEASE"),
            "document_name": str(config.get("document_number") or ""),
            "document_number": str(config.get("document_number") or ""),
            "revision": str(config.get("revision") or ""),
            "commit_sha": str(candidate.get("commit_sha") or ""),
            "variant": str(candidate.get("variant") or ""),
            "commit_date": _commit_date(
                repo_root or closure_root, str(candidate.get("commit_sha") or "")
            ),
            "release_date": str(config.get("release_date") or ""),
        },
        stats=stats,
        stackup=stackup,
        variants=variants,
        placements=placements,
        members=member_rows,
        testpoints=testpoints,
        population=population,
        designators=designators,
        notes=config.get("notes") or {},
        fields=config.get("fields") or {},
        typography=typography,
        revision_history=revision_history,
        impedance_rows=impedance_rows,
        stackup_pdf=stackup_pdf if isinstance(stackup_pdf, (bytes, bytearray)) else None,
        bom_headers=bom_headers,
        bom_rows=bom_rows,
        board=board if board and board.is_file() else None,
        cli_path=cli_path,
        cruncher_path=cruncher_path,
        workdir=staging / "artwork",
    )
    return inputs, warnings, projections


def _documents_step(
    output_root: Path,
    *,
    files: Sequence[Path] = (),
    returncode: int = 0,
    skipped_reason: str = "",
    elapsed_ms: int = 0,
) -> StepOutput:
    return StepOutput(
        step_id=DOCUMENT_STEP_SPEC.step_id,
        step_type=DOCUMENT_STEP_SPEC.step_type,
        normalized_argv=("prism", "compose", "documents"),
        returncode=returncode,
        files=tuple(files),
        root=output_root,
        spec=DOCUMENT_STEP_SPEC,
        skipped_reason=skipped_reason,
        elapsed_ms=elapsed_ms,
    )


def _placements(positions_csv: Path) -> list[dict[str, Any]]:
    """Read side information out of the position file, if one was produced."""

    if not positions_csv.is_file():
        return []
    import csv

    rows: list[dict[str, Any]] = []
    try:
        text = positions_csv.read_text(encoding="utf-8", errors="replace")
        for row in csv.DictReader(text.splitlines()):
            side = (row.get("Side") or row.get("side") or "").strip().lower()
            rows.append(
                {
                    "side": side,
                    "ref": (row.get("Ref") or row.get("ref") or "").strip(),
                    # Carried for the testpoint schedule, which is a table of
                    # where to put a probe and is useless without coordinates.
                    "x": (row.get("PosX") or row.get("posx") or "").strip(),
                    "y": (row.get("PosY") or row.get("posy") or "").strip(),
                    "rotation": (row.get("Rot") or row.get("rot") or "").strip(),
                }
            )
    except Exception:  # noqa: BLE001 - the sheet degrades to a zero count
        return []
    return rows


def _commit_date(repo_root: Path, commit: str) -> str:
    """The commit's author date -- a property of the revision, not of the render."""

    if not commit:
        return ""
    try:
        import subprocess

        result = subprocess.run(
            ["git", "-C", str(repo_root), "show", "-s", "--format=%as", commit],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return ""
    return (result.stdout or "").strip() if result.returncode == 0 else ""


def _cover_revision_history(
    *,
    repo_url: str,
    config: Mapping[str, Any],
    candidate: Mapping[str, Any],
    repo_root: Path | None,
) -> list[dict[str, Any]]:
    """This release first, then prior GitHub/GitLab Releases. API failure → current only."""

    from app.services import forge_publish_service as forge

    tag = str(config.get("revision") or "").strip()
    notes = str(config.get("release_notes") or "").strip()
    date = str(config.get("release_date") or "")
    if not date and repo_root:
        date = _commit_date(repo_root, str(candidate.get("commit_sha") or ""))
    current = {
        "tag": tag or "untagged",
        "date": date,
        "commit_hash": str(candidate.get("commit_sha") or ""),
        "message": notes.splitlines()[0] if notes else "",
    }
    prior = forge.list_releases(repo_url or None) if repo_url else []
    history = [current]
    for row in prior:
        if str(row.get("tag") or "") == tag:
            continue
        history.append(row)
    return history


def _bom_schedule(outputs: Sequence[Any]) -> tuple[list[str], list[list[str]]]:
    import csv
    import io

    for output in outputs:
        if getattr(output, "step_id", "") != "bom":
            continue
        for path in getattr(output, "files", ()) or ():
            candidate = Path(path)
            if candidate.suffix.lower() != ".csv" or not candidate.is_file():
                continue
            reader = csv.reader(io.StringIO(candidate.read_text(encoding="utf-8", errors="replace")))
            rows = [list(row) for row in reader if any(cell.strip() for cell in row)]
            if not rows:
                return [], []
            return [str(cell) for cell in rows[0]], rows[1:]
    return [], []
