"""Run registered vendor generators and turn their files into step outputs."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from app.release_studio.steps import StepOutput

from .jlcpcb import VendorGenerateError
from .registry import (
    CruncherRunner,
    VendorArtifacts,
    profile_by_id,
    resolve_vendor_ids,
    vendor_step_spec,
)


def design_file_for(board: Path) -> Path:
    """Prefer the project file when Cruncher needs variants and text variables."""

    project = board.with_suffix(".kicad_pro")
    return project if project.is_file() else board


def generate_vendor_outputs(
    *,
    config: Mapping[str, Any],
    closure_root: Path,
    output_root: Path,
    variant: str = "",
    cruncher_path: str | None,
    runner: CruncherRunner | None = None,
    timeout_seconds: int = 900,
) -> tuple[tuple[StepOutput, ...], dict[str, bytes]]:
    """Run every configured vendor profile.

    Returns member-producing ``StepOutput``s (CSV only) and extra evidence
    bytes (XLSX and other opaque vendor files) keyed by archive-relative path.
    A missing Cruncher skips the vendors rather than failing the build — the
    signed dossier is still complete without a fab-house pack.
    """

    vendor_ids = resolve_vendor_ids(config)
    if not vendor_ids:
        return (), {}

    board_rel = str(config.get("board") or "")
    board = (closure_root / board_rel) if board_rel else None
    if board is None or not board.is_file():
        return (), {}

    outputs: list[StepOutput] = []
    extra_evidence: dict[str, bytes] = {}
    if not cruncher_path:
        for vendor_id in vendor_ids:
            spec = vendor_step_spec(vendor_id)
            outputs.append(
                StepOutput(
                    step_id=spec.step_id,
                    step_type=spec.step_type,
                    normalized_argv=(),
                    returncode=0,
                    files=(),
                    root=output_root,
                    spec=spec,
                    skipped_reason="kicad-cruncher is not available",
                )
            )
        return tuple(outputs), extra_evidence

    design = design_file_for(board)
    for vendor_id in vendor_ids:
        spec = vendor_step_spec(vendor_id)
        try:
            profile = profile_by_id(vendor_id)
        except KeyError:
            outputs.append(
                StepOutput(
                    step_id=spec.step_id,
                    step_type=spec.step_type,
                    normalized_argv=(),
                    returncode=0,
                    files=(),
                    root=output_root,
                    spec=spec,
                    skipped_reason=f"unknown vendor profile: {vendor_id}",
                )
            )
            continue
        try:
            artifacts = profile.generate(
                cruncher_path=cruncher_path,
                design_file=design,
                output_root=output_root,
                variant=variant,
                runner=runner,
                timeout_seconds=timeout_seconds,
            )
        except VendorGenerateError as exc:
            outputs.append(
                StepOutput(
                    step_id=spec.step_id,
                    step_type=spec.step_type,
                    normalized_argv=(),
                    returncode=1,
                    files=(),
                    root=output_root,
                    spec=spec,
                    stderr=str(exc),
                    skipped_reason=str(exc)[:400],
                )
            )
            continue
        files = tuple(path for path in artifacts.canonical_files.values() if path.is_file())
        outputs.append(
            StepOutput(
                step_id=spec.step_id,
                step_type=spec.step_type,
                normalized_argv=artifacts.normalized_argv,
                returncode=artifacts.returncode,
                files=files,
                root=output_root,
                spec=spec,
                stdout=artifacts.stdout,
                stderr=artifacts.stderr,
                elapsed_ms=artifacts.elapsed_ms,
            )
        )
        for relative, path in artifacts.evidence_files.items():
            extra_evidence[relative] = path.read_bytes()
    return tuple(outputs), extra_evidence


__all__ = ["design_file_for", "generate_vendor_outputs"]
