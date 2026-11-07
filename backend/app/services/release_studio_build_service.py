"""Orchestration for one Release Studio build (R11).

This is the seam where the technical modules meet: closure → steps → dossier →
persistence.  It owns no digest logic of its own; every digest comes from the
module that defines it, so there is exactly one implementation of each.

The job handler runs under the fenced ``JobContext``, which is what makes the
publication protocol crash-safe: artifacts are written into the fence's staging
directory, promoted to content-addressed objects, and only then committed to
PostgreSQL with the fence re-validated.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any, Mapping

from app.release_studio import bundle_design, dossier as dossier_module
from app.release_studio.canonical import (
    CANONICALIZER_REGISTRY_NAME,
    CANONICALIZER_REGISTRY_VERSION,
    sha256_canonical,
)
from app.release_studio.closure import materialize_input_closure
from app.services.tree_removal import remove_tree
from app.release_studio.config import (
    load_configuration_at_commit,
    technical_config_digest,
    technical_config_payload,
)
from app.release_studio.document_pipeline import with_documents
from app.release_studio.jobset import HERMETIC_STEP_TYPES
from app.release_studio.pipeline import PipelineTracker, run_build_waves
from app.release_studio.steps import (
    DOCUMENT_STEP_SPEC,
    STEP_CATALOGUE,
    StepExecutionError,
    gerber_manifest_gaps,
)
from app.release_studio.vendors import resolve_vendor_ids
from app.services import kicad_libraries, project_revision
from app.services import release_build_attempts as attempts
from app.services import release_build_failure_evidence as failure_evidence
from app.services import release_studio_model_inputs as model_inputs
from app.services import release_studio_service as store
from app.release_studio.bundle_errors import BundleFailed, BundlePending
from app.services.job_artifact_service import JobArtifactService
from app.services.job_kinds import JobKind, memory_units
from app.services.job_runtime import JobCancelled, JobContext, JobResult
from app.services.kicad_tools import KicadTools

logger = logging.getLogger(__name__)

#: Identity of the code that assembles a dossier from a build's outputs.
#:
#: It feeds `toolchain_digest` and therefore `build_key`, so any change to what
#: the manifest contains or how a fingerprint is composed has to move it.  Two
#: builds sharing a `build_key` while producing different manifests is exactly
#: the reproducibility claim the key exists to make.
#: r25 -- vendor-pack members under manufacturing/vendors/{id}/.
GENERATOR_BUILD = "release-studio/r25"
EXECUTOR_IDENTITY_FILE = Path("/etc/prism/kicad-base-image")


class BuildError(RuntimeError):
    """A Release Studio build could not be produced."""


def executor_image() -> str:
    """The pinned OCI image digest baked into the runtime by R00a.

    A version string is not an identity: two 10.0.4 installs can differ in
    build commit, OpenCascade, FreeType, fontconfig, and the bundled KiCad
    libraries, and can produce different STEP/PDF/SVG output.

    An unreadable identity file is a hard failure rather than an empty string.
    Degrading silently would make ``toolchain_digest`` a constant on an
    unpinned host, so two builds from genuinely different KiCad installs would
    share a ``build_key`` -- which is the exact claim the key exists to make,
    quietly turned into a lie.
    """

    try:
        image = EXECUTOR_IDENTITY_FILE.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise BuildError(
            f"the pinned executor image identity is unreadable at "
            f"{EXECUTOR_IDENTITY_FILE}: {exc}. Release Studio cannot identify "
            "its toolchain, and a build key computed without it would be wrong."
        ) from exc
    if not image:
        raise BuildError(
            f"{EXECUTOR_IDENTITY_FILE} is empty; the runtime is not pinned to a "
            "KiCad image and its builds cannot be identified."
        )
    return image


def toolchain_identity(
    bundle_generator: Mapping[str, Any],
    cli_version: str = "",
) -> tuple[dict[str, Any], str]:
    """Return the human-readable toolchain record and its hashed identity.

    The design data comes from ``prism-kicad`` and the bundle's own generator
    record is the provenance (C3f): the Python ``kicad_monkey`` and
    ``kicad_cruncher`` versions described the deleted legacy path, so they are
    neither recorded nor hashed.
    """

    from app.release_studio.documents import RENDERER_VERSION, renderer_resource_digest

    image = executor_image()
    # Fonts and the artwork configurations together: bundled resources that
    # decide what a composed sheet contains.
    resources = renderer_resource_digest()
    record = {
        "kicad_version": cli_version or "10.0.4",
        "executor_image": image,
        "generator_build": GENERATOR_BUILD,
        "canonicalizer_registry": f"{CANONICALIZER_REGISTRY_NAME}/{CANONICALIZER_REGISTRY_VERSION}",
        "renderer": RENDERER_VERSION,
        "resource_bundle_digest": resources,
    }
    identity: dict[str, Any] = {
        "executor_image_digest": image,
        "generator_build": GENERATOR_BUILD,
        "canonicalizer_registry_version": CANONICALIZER_REGISTRY_VERSION,
        # The renderer is part of the toolchain identity: a change that
        # alters composed sheets for unchanged input must move the build key.
        "renderer_version": RENDERER_VERSION,
        "resource_bundle_digest": resources,
    }
    generator = _bundle_generator_identity(bundle_generator)
    record["design_bundle_generator"] = generator
    identity["design_bundle_generator"] = generator
    return record, sha256_canonical(identity)


#: Generator-id fields a release records.  ``member_schemas`` is the member
#: manifest, not a property of the tool that produced it.
_BUNDLE_GENERATOR_FIELDS = (
    "crate_version",
    "engine_version",
    "kicad_version",
    "kicad_file_formats",
    "hlr_procedure",
    "models_procedure",
    "pack_format_version",
    "refill_procedure",
    "upgrade_procedure",
)


def _bundle_generator_identity(generator: Mapping[str, Any]) -> dict[str, Any]:
    """The bundle generator's stable provenance, without its member manifest."""

    return {
        key: generator[key]
        for key in _BUNDLE_GENERATOR_FIELDS
        if key in generator
    }


def prepare_candidate(
    *,
    project_id: str,
    repository_id: str,
    repo_root: Path,
    commit_sha: str,
    config_key: str,
    variant: str,
    workspace_root: Path,
    created_by: str = "",
    project_relpath: str = ".",
    configuration: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Materialize the closure and register (or reuse) a candidate.

    Idempotent on ``build_key``: asking twice for the same commit, variant,
    configuration and toolchain returns the same candidate rather than a
    duplicate.
    """

    if configuration is not None:
        config = dict(configuration)
        selected_variant = variant or str(config.get("default_variant") or "")
    else:
        config = load_configuration_at_commit(
            repo_root, commit_sha, config_key, project_path=project_relpath
        )
        selected_variant = variant or str(config.get("default_variant") or "")
        declared_variants = {str(item) for item in config.get("variants") or ()}
        if declared_variants and selected_variant not in declared_variants:
            raise BuildError(
                f"variant {selected_variant!r} is not declared by committed configuration "
                f"{config_key!r}"
            )
    config_digest = technical_config_digest(config)

    # One readiness answer for the whole build.  A pending or failed bundle
    # waits or fails here, before a closure or candidate exists; a build with
    # no resolved commit cannot be keyed by a bundle and fails here too.
    design = bundle_design.readiness(
        project_id, commit_sha, requested_by=created_by
    )

    closure_root = workspace_root / "closure"
    model_stage = workspace_root / "models"
    for stale in (closure_root, model_stage):
        if stale.exists():
            remove_tree(stale)
    closure = materialize_input_closure(
        repo_root,
        commit_sha,
        closure_root,
        relative_path=project_relpath,
        # The cover render and the assembly views inherit this environment, so
        # a model outside the closure is hashed the way they will find it,
        # and staged so they read the bytes that were hashed.
        model_env=kicad_libraries.current().env(),
        model_stage=model_stage,
        # C3d: the closure's documents and path references come from
        # prism.project.a0, so no KiCad text is parsed in Python.
        bundle_project=design.project_references(),
    )

    hermetic, reasons = _hermeticity(closure_root, config)
    # A reference the closure could resolve into neither itself nor the pinned
    # toolchain is a hermeticity finding, not a materialization failure.
    closure_reasons = closure.non_hermetic_reasons()
    if closure_reasons:
        hermetic = False
        reasons = [*reasons, *closure_reasons]
    # 3D models missing from the closure are reported rather than counted
    # against hermeticity: every worker sees the same absence.
    advisory = closure.advisory_reasons()
    if advisory:
        logger.info(
            "Release Studio closure carries %d advisory reference(s)", len(advisory)
        )
    _toolchain, toolchain_digest = toolchain_identity(
        bundle_generator=design.generator
    )
    model_rows = model_inputs.closure_model_rows(closure)

    candidate = store.create_candidate(
        project_id=project_id,
        repository_id=repository_id,
        config_key=config_key,
        commit_sha=closure.commit_sha,
        variant=selected_variant,
        technical_config_digest=config_digest,
        input_closure_digest=closure.input_closure_digest,
        toolchain_digest=toolchain_digest,
        generator_build=GENERATOR_BUILD,
        hermetic=hermetic,
        non_hermetic_reasons=reasons,
        closure_inputs=_closure_rows(closure),
        model_inputs=model_rows,
        self_contained=model_inputs.is_self_contained(hermetic, model_rows),
        policy_snapshot_captured=False,
        policy_document=None,
        configuration_snapshot_captured=True,
        configuration_document=config,
        created_by=created_by,
    )
    candidate["_closure_root"] = str(closure_root)
    candidate["_config"] = config
    candidate["_advisory_reasons"] = advisory
    # The readiness answer the whole build reads its design files from (C3c,
    # C3b, C3f).  Not persisted: it is this attempt's opened bundle.
    candidate["_bundle_design"] = design
    # An input that resolved outside the closure is recorded on the candidate,
    # but the person reading Outputs sees the build. Carry the reasons across
    # so a non-hermetic closure is visible where the release is inspected.
    candidate["_non_hermetic_reasons"] = list(closure_reasons)
    candidate["project_relpath"] = project_relpath
    return candidate


def _hermeticity(_closure_root: Path, _config: Mapping[str, Any]) -> tuple[bool, list[str]]:
    """Classify the catalogue that actually runs.

    Release Studio does not execute a project's ``.kicad_jobset``. Exports come
    from the pinned step catalogue, whose types are hermetic by construction.
    The closure has already refused any input that resolves outside it.
    """

    reasons: list[str] = []
    for spec in STEP_CATALOGUE:
        if spec.optional:
            continue
        if spec.step_type not in HERMETIC_STEP_TYPES:
            reasons.append(
                f"catalogue step {spec.step_id} ({spec.step_type}) is not a "
                "hermetic KiCad type"
            )
    return not reasons, reasons


def _closure_rows(closure) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in closure.repository_inputs:
        rows.append(
            {
                "kind": "repository",
                "path": item.path,
                "git_object_id": item.git_object_id,
                "mode": item.mode,
                "object_type": item.type,
                "materialized_digest": item.materialized_digest,
            }
        )
    for item in closure.submodule_inputs:
        rows.append(
            {
                "kind": "submodule",
                "path": item.path,
                "git_object_id": item.gitlink_sha,
                "materialized_digest": item.resolved_tree_digest,
                "details": {"recursive": item.recursive},
            }
        )
    for item in closure.lfs_inputs:
        rows.append(
            {
                "kind": "lfs",
                "path": item.path,
                "git_object_id": item.pointer_blob_sha,
                "lfs_oid": item.lfs_oid,
                "materialized_digest": item.materialized_digest,
            }
        )
    for item in closure.toolchain_resources:
        rows.append(
            {"kind": "toolchain", "path": item.name, "materialized_digest": item.digest}
        )
    for item in closure.env_bindings:
        rows.append({"kind": "env", "path": item.name, "details": {"value": item.value}})
    return rows


def execute_build(
    context: JobContext,
    *,
    candidate: Mapping[str, Any],
    closure_root: Path,
    config: Mapping[str, Any],
    artifacts: JobArtifactService | None = None,
    tools: KicadTools | None = None,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    """Run the catalogue, assemble the dossier, and publish it under the fence.

    ``tools`` defaults to the installed kicad-cli. Every run polls the job's
    polls the job's cancellation, so a cancelled build stops its current tool.
    ``repo_root`` is the source repository.  The closure is materialized from
    Git objects and has no ``.git`` of its own, so anything that needs commit
    metadata -- the date a sheet states -- has to ask the repository.
    """

    # The one readiness answer: preparation already resolved it; a direct
    # caller gets the same check rather than a half-readable bundle.  It runs
    # before the attempt starts, so waiting for design data is a job retry, not
    # a failed build.
    design = bundle_design.for_candidate(candidate)
    if candidate.get("_bundle_design") is not design:
        candidate = {**candidate, "_bundle_design": design}

    artifact_service = artifacts or JobArtifactService()
    tools = (tools or KicadTools.resolve()).with_cancel(context.check_cancelled)
    build = attempts.start_build(
        candidate["id"], job_id=context.job_id, fence=context.fence
    )
    tracker: PipelineTracker | None = None
    timings: list[dict[str, Any]] = []
    try:
        output_root = context.staging_dir / "outputs"
        output_root.mkdir(parents=True, exist_ok=True)
        vendor_ids = resolve_vendor_ids(config)
        include_schematic = bool(str(config.get("schematic") or "").strip())
        tracker = PipelineTracker(
            context.progress,
            vendor_ids=vendor_ids,
            include_schematic=include_schematic,
        )
        tracker.succeed("closure", percent=8)

        waves = run_build_waves(
            tracker,
            progress=context.progress,
            tools=tools,
            closure_root=closure_root,
            output_root=output_root,
            artwork_root=context.staging_dir / "artwork" / "cruncher",
            config=config,
            variant=str(candidate.get("variant") or ""),
            timings=timings,
            candidate=candidate,
            design=design,
        )
        build_warnings = _gerber_set_warnings(waves.by_step)
        if not include_schematic:
            tracker.skip("schematic_pdf", reason="no schematic in the configuration")
        tracker.start("documents-cover", message="Composing documentation", percent=70)
        outputs, document_warnings, projections = with_documents(
            waves.outputs,
            closure_root=closure_root,
            config=config,
            candidate=candidate,
            output_root=output_root,
            cli=tools.cli,
            staging=context.staging_dir,
            repo_root=repo_root,
            project_relpath=str(candidate.get("project_relpath") or "") or None,
            assembly_views=waves.assembly_views,
            assembly_error=waves.assembly_error,
            artwork_sheet_size=waves.artwork_sheet_size,
            artwork_paper_scale=waves.artwork_paper_scale,
            timings=timings,
            tracker=tracker,
            repo_url=str(candidate.get("repo_url") or ""),
        )
        # The release *is* the documentation set. A dossier that reached
        # packaging with a failed compose would be a succeeded, publishable
        # build whose zip holds gerbers and no drawings, so the compose failure
        # has to end the attempt rather than ride along in evidence.
        composed = next(
            (
                output
                for output in outputs
                if getattr(output, "step_id", "") == DOCUMENT_STEP_SPEC.step_id
            ),
            None,
        )
        if composed is not None and composed.returncode != 0:
            raise BuildError(
                "document composition produced no sheets: "
                f"{composed.skipped_reason or 'compose failed'}"
            )
        outputs = (*outputs, *waves.vendor_outputs)

        tracker.start("package", message="Canonicalizing and packaging", percent=75)

        toolchain, toolchain_digest = toolchain_identity(
            bundle_generator=design.generator
        )
        assembled = dossier_module.assemble(
            outputs=outputs,
            commit_sha=str(candidate["commit_sha"]),
            variant=str(candidate.get("variant") or ""),
            config_key=str(candidate["config_key"]),
            technical_config_digest=str(candidate["technical_config_digest"]),
            input_closure_digest=str(candidate["input_closure_digest"]),
            toolchain=toolchain,
            toolchain_digest=toolchain_digest,
            build_key=str(candidate["build_key"]),
            config_fragments=technical_config_payload(config),
            projections=projections,
            archive_mtime=_commit_timestamp(
                repo_root, str(candidate.get("commit_sha") or "")
            ),
            timings=timings,
            extra_evidence=waves.extra_evidence,
        )

        # DRC/ERC are evidence, not a gate -- a release is allowed to carry
        # violations, and deciding which ones block is the archived governance
        # work. What must not happen is publishing a board with errors without
        # anyone being told, so the count is stated on the build.
        for record in assembled.evidence:
            errors = int((record.get("counts") or {}).get("error") or 0)
            if errors:
                kind = str(record.get("kind") or "check").upper()
                build_warnings.append(
                    f"{kind}: {errors} error-severity violation"
                    f"{'' if errors == 1 else 's'} in this release"
                )

        dossier_artifact = _publish(
            artifact_service, context, assembled.dossier_bytes,
            name="dossier.tar.gz", kind="release_dossier",
            artifact_key=f"release-dossier:{candidate['build_key']}",
        )
        evidence_artifact = _publish(
            artifact_service, context, assembled.evidence_bytes,
            name="build-evidence.tar.gz", kind="release_build_evidence",
            artifact_key=f"release-evidence:{candidate['build_key']}",
        )

        context.progress(stage="record", message="Recording the build", percent=92)
        artifact_ids = context.service.register_fenced_artifacts(
            context.job_id,
            context.worker_id,
            context.fence,
            (dossier_artifact.__dict__, evidence_artifact.__dict__),
        )
        if artifact_ids is None:
            raise BuildError(
                "the build's fence is no longer authoritative; artifacts were "
                "not registered"
            )
        completion = dict(
            build_id=build["id"],
            dossier=assembled,
            toolchain=toolchain,
            dossier_artifact_id=artifact_ids[0],
            evidence_artifact_id=artifact_ids[1],
            fence=context.fence,
            actor=str(context.payload.get("author") or ""),
            projections=projections,
            timings=timings,
            warnings=[
                *(
                    f"closure: {reason}"
                    for reason in candidate.get("_non_hermetic_reasons") or ()
                ),
                *(
                    f"closure: {reason}"
                    for reason in candidate.get("_advisory_reasons") or ()
                ),
                *(candidate.get("_input_warnings") or ()),
                *build_warnings,
                *document_warnings,
            ],
        )
        tracker.succeed("package", percent=100)
        return {
            "build": {
                "id": build["id"],
                "manifest_digest": assembled.manifest_digest,
                "dossier_digest": assembled.dossier_digest,
            },
            "dossier": assembled,
            "artifacts": (dossier_artifact, evidence_artifact),
            "pipeline": tracker.snapshot,
            # The build row succeeds inside the job's completion transaction
            # (JobResult.settle), never before the job is known to complete.
            "settle": lambda conn: attempts.complete_build(conn=conn, **completion),
        }
    except JobCancelled as exc:
        evidence_artifact_id = failure_evidence.publish_or_none(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="cancelled",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        attempts.cancel_build(
            build["id"],
            message=failure_evidence.redact_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise
    except StepExecutionError as exc:
        evidence_artifact_id = failure_evidence.publish_or_none(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="step_failed",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        attempts.fail_build(
            build["id"],
            error_code="step_failed",
            error_message=failure_evidence.redact_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise BuildError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - the build row must not stay running
        evidence_artifact_id = failure_evidence.publish_or_none(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="build_failed",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        attempts.fail_build(
            build["id"],
            error_code="build_failed",
            error_message=failure_evidence.redact_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise


def _gerber_set_warnings(by_step: Mapping[str, Any]) -> list[str]:
    """Refuse an incomplete Gerber set; warn when it cannot be checked.

    An incomplete Gerber set is the one omission that costs a fab run, and it
    is invisible downstream: the vendor pack only asks whether *any* gerber is
    present.
    """

    gerbers = by_step.get("gerbers")
    if gerbers is None or not gerbers.ran:
        return []
    has_manifest, missing_plots = gerber_manifest_gaps(gerbers.files)
    if missing_plots:
        raise BuildError(
            "the Gerber export is incomplete: its job file lists "
            f"{', '.join(missing_plots)}, which {'was' if len(missing_plots) == 1 else 'were'} "
            "not written"
        )
    if has_manifest:
        return []
    return [
        "fabrication: the Gerber export wrote no readable .gbrjob "
        "manifest, so the layer set could not be checked for "
        "completeness"
    ]


def _commit_timestamp(repo_root: Path, commit: str) -> int:
    """Commit author time as an archive-safe epoch, or the neutral epoch."""

    if not commit:
        return 0
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "show", "-s", "--format=%at", commit],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return 0
    if result.returncode != 0:
        return 0
    try:
        return max(0, int(result.stdout.strip()))
    except ValueError:
        return 0


def _publish(
    artifacts: JobArtifactService,
    context: JobContext,
    payload: bytes,
    *,
    name: str,
    kind: str,
    artifact_key: str,
    allow_cancel_requested: bool = False,
):
    staged = context.staging_dir / name
    staged.write_bytes(payload)
    return artifacts.prepare_file(
        context,
        staged,
        kind=kind,
        artifact_key=artifact_key,
        media_type="application/gzip",
        generator_version=GENERATOR_BUILD,
        allow_cancel_requested=allow_cancel_requested,
    )


def run_release_studio_build_job(context: JobContext) -> JobResult:
    """Job handler: ``release_studio_build``."""

    from app.services import workspace_service

    payload = context.payload
    project_id = str(payload["project_id"])
    config_key = str(payload.get("config_key") or "release")
    variant = str(payload.get("variant") or "")
    commit_sha = str(payload.get("commit_sha") or "HEAD")
    author = str(payload.get("author") or "anonymous")
    identity = payload.get("identity") if isinstance(payload.get("identity"), dict) else {}
    manufacturing = payload.get("manufacturing") if isinstance(payload.get("manufacturing"), dict) else {}
    board = str(payload.get("board") or "")
    schematic = str(payload.get("schematic") or "")
    bom_preset = str(payload.get("bom_preset") or "")

    row = workspace_service.workspace.get_project_by_id(project_id)
    if not row:
        raise BuildError("project not found")
    repository_id = str(row.get("repo_id") or "")
    try:
        location = project_revision.locate(row)
        repo_root, relative_path = location.repo_root, location.relative_path or "."
    except project_revision.ProjectNotInRepository:
        # Let preparation fail inside the retained-failure path below.
        repo_root = Path(str(row.get("path") or ""))
        relative_path = str(row.get("relative_path") or ".")

    context.progress(stage="closure", message="Materializing the input closure", percent=5)
    tracker = PipelineTracker(
        context.progress,
        vendor_ids=(),
        include_schematic=True,
    )
    tracker.start("closure", message="Materializing the input closure", percent=5)
    synthesized = None
    if board and schematic:
        from app.release_studio.inputs import synthesize_configuration

        synthesized = synthesize_configuration(
            board=board,
            schematic=schematic,
            variant=variant,
            document_name=str(identity.get("document_name") or ""),
            tag=str(identity.get("tag") or ""),
            date=str(identity.get("date") or ""),
            notes=str(identity.get("notes") or ""),
            manufacturing=manufacturing,
            vendors=list(manufacturing.get("vendors") or payload.get("vendors") or []),
            bom_preset=bom_preset,
            title=str(identity.get("document_name") or identity.get("tag") or ""),
        )
        config_key = "release"
    try:
        candidate = prepare_candidate(
            project_id=project_id,
            repository_id=repository_id,
            repo_root=repo_root,
            commit_sha=commit_sha,
            config_key=config_key,
            variant=variant,
            workspace_root=context.staging_dir,
            created_by=author,
            project_relpath=relative_path,
            configuration=synthesized,
        )
    except JobCancelled:
        # Cancellation is a terminal worker decision, never a failed
        # preparation diagnostic. A build that has started is handled by
        # execute_build's dedicated cancelled path below.
        raise
    except (
        BundlePending,
        BundleFailed,
    ):
        # A bundle-mode build that is waiting for design data (or whose design
        # data failed) has not produced an attempt.  The job runtime owns the
        # retry/permanent answer; recording a retained failed build here would
        # make a queued wait look like a release that ran and failed.
        raise
    except Exception as exc:
        # Preparation historically failed before a candidate/build existed,
        # making accepted jobs disappear from release history. Retain an
        # explicit failed attempt without altering a successful candidate's
        # immutable identity.
        try:
            tracker.fail("closure", message=failure_evidence.redact_text(exc))
        except Exception:  # noqa: BLE001 - retain the failure even if progress is stale
            logger.debug("Could not report failed closure progress", exc_info=True)
        failed_build = attempts.record_prepare_failure(
            project_id=project_id,
            repository_id=repository_id,
            config_key=config_key,
            commit_sha=commit_sha,
            variant=variant,
            job_id=context.job_id,
            fence=context.fence,
            author=author,
            error=failure_evidence.redact_text(exc),
        )
        failure_candidate = {
            "id": failed_build.get("candidate_id") or "",
            "commit_sha": commit_sha,
            "config_key": config_key,
            "variant": variant,
        }
        evidence_artifact_id = failure_evidence.publish_or_none(
            artifacts=JobArtifactService(),
            context=context,
            build=failed_build,
            candidate=failure_candidate,
            error_code="prepare_failed",
            error=exc,
            pipeline=tracker.snapshot,
        )
        attempts.fail_build(
            str(failed_build["id"]),
            error_code="prepare_failed",
            error_message=failure_evidence.redact_text(exc),
            actor=author,
            evidence_artifact_id=evidence_artifact_id,
        )
        raise
    tracker.succeed("closure", percent=8)

    if not board:
        from app.release_studio.source import discover_source

        try:
            discovered = discover_source(
                repo_root, candidate["commit_sha"], relative_path, project_id=project_id
            )
        except Exception:
            discovered = {}
        board = str(discovered.get("board") or "")
        schematic = schematic or str(discovered.get("schematic") or "")

    from app.release_studio.impedance import parse_impedance_csv

    candidate["repo_url"] = str(row.get("repo_url") or "")
    # Track what the user actually attached, separately from what survived
    # parsing. Without this a CSV whose header did not match, and a CSV that
    # was never uploaded, both reach the UI as "no impedance CSV uploaded".
    impedance_csv = str(payload.get("impedance_csv") or "")
    stackup_b64 = str(payload.get("stackup_pdf_b64") or "")
    input_warnings: list[str] = []
    candidate["_impedance_supplied"] = bool(impedance_csv.strip())
    candidate["_stackup_supplied"] = bool(stackup_b64.strip())
    candidate["_impedance_rows"] = parse_impedance_csv(impedance_csv)
    if candidate["_impedance_supplied"] and not candidate["_impedance_rows"]:
        input_warnings.append(
            "inputs: the uploaded controlled-impedance CSV produced no rows; its "
            "header must match the template columns, including \"Target Z (Ω)\""
        )
    if stackup_b64:
        import base64

        try:
            candidate["_stackup_pdf"] = base64.b64decode(stackup_b64)
        except Exception as exc:  # noqa: BLE001 - the miss must not be silent
            candidate["_stackup_pdf"] = None
            input_warnings.append(
                f"inputs: the uploaded stackup PDF could not be decoded ({exc}); "
                "the fabrication PDF was composed without it"
            )
    candidate["_input_warnings"] = input_warnings

    result = execute_build(
        context,
        candidate=candidate,
        closure_root=Path(candidate["_closure_root"]),
        config=candidate["_config"],
        repo_root=repo_root,
    )
    build = result["build"]
    return JobResult(
        message="Release Studio build completed",
        details={
            "project_id": project_id,
            "config_key": config_key,
            "candidate_id": candidate["id"],
            "build_id": build["id"],
            "commit": str(candidate.get("commit_sha") or ""),
            "manifest_digest": build["manifest_digest"],
            "dossier_digest": build["dossier_digest"],
            "pipeline": result.get("pipeline"),
        },
        artifact=result["artifacts"][0],
        sidecar_artifacts=(result["artifacts"][1],),
        settle=result["settle"],
    )


RELEASE_BUILD = JobKind(
    "release_studio_build",
    run_release_studio_build_job,
    # A build runs kicad-cli and a Cruncher board load; two of them on one
    # worker have been measured at 6.4 GiB peak RSS, so each reserves about
    # half of that: a second build (and a design_bundle beside it) waits.
    resources={"prism_worker": 1, **memory_units(3328)},
    settle=attempts.settle_build_job,
    orphans=attempts.orphaned_jobs,
)
JOB_KINDS = (RELEASE_BUILD,)


__all__ = [
    "GENERATOR_BUILD",
    "RELEASE_BUILD",
    "BuildError",
    "execute_build",
    "executor_image",
    "prepare_candidate",
    "run_release_studio_build_job",
    "toolchain_identity",
]
