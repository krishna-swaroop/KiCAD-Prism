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
import os
import re
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from importlib import metadata
from pathlib import Path
from typing import Any, Mapping, Sequence

import yaml

from app.release_studio import dossier as dossier_module
from app.release_studio.git_publish import GitPublishError, run_git
from app.release_studio.canonical import (
    CANONICALIZER_REGISTRY_NAME,
    CANONICALIZER_REGISTRY_VERSION,
    sha256_canonical,
    write_deterministic_archive,
)
from app.release_studio.canonical.json import canonical_json_bytes
from app.release_studio.closure import materialize_input_closure
from app.release_studio.config import (
    list_configuration_keys,
    list_configuration_keys_at_commit,
    load_configuration_at_commit,
    load_configuration_from_checkout,
    technical_config_digest,
    technical_config_payload,
    validate_configuration_for_checkout,
    configuration_relpath,
)
from app.release_studio.document_pipeline import with_documents
from app.release_studio.jobset import HERMETIC_STEP_TYPES
from app.release_studio.pipeline import PipelineTracker
from app.release_studio.steps import (
    CATALOGUE_WAVE_ARTWORK,
    CATALOGUE_WAVE_BOM,
    CATALOGUE_WAVE_CHECKS,
    CATALOGUE_WAVE_POSITIONS,
    DOCUMENT_STEP_SPEC,
    STEP_CATALOGUE,
    StepExecutionError,
    StepOutput,
    gerber_manifest_gaps,
    resolve_cli_path,
    resolve_cruncher_path,
    run_step_catalogue,
)
from app.release_studio.vendors import generate_vendor_outputs, resolve_vendor_ids
from app.services import release_studio_service as store
from app.services.job_artifact_service import JobArtifactService
from app.services.job_runtime import JobCancelled, JobContext, JobResult

logger = logging.getLogger(__name__)

_FAILURE_SECRET = re.compile(
    r"(?i)\b(password|passwd|secret|token|api[_-]?key|authorization|cookie)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_FAILURE_SECRET_KEY = re.compile(
    r"(?i)(password|passwd|secret|token|api[_-]?key|authorization|cookie)"
)
_AUTH_HEADER = re.compile(r"(?im)\b(authorization|cookie)(\s*[:=]\s*)[^\r\n]+")
_URL_CREDENTIAL = re.compile(r"://([^/\s:@]+):([^@\s/]+)@")

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


def _redact_failure_text(value: object) -> str:
    """Keep operator diagnostics useful without preserving credential-shaped text."""

    text = str(value).replace("\x00", " ")[:4000]
    text = _URL_CREDENTIAL.sub("://[REDACTED]@", text)
    text = _AUTH_HEADER.sub(r"\1\2[REDACTED]", text)
    return _FAILURE_SECRET.sub(r"\1\2[REDACTED]", text)


def _redact_failure_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): (
                "[REDACTED]"
                if _FAILURE_SECRET_KEY.search(str(key))
                else _redact_failure_value(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_failure_value(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_failure_value(item) for item in value]
    if isinstance(value, str):
        return _redact_failure_text(value)
    return value


def _publish_failure_evidence(
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

    message = _redact_failure_text(error)
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
        "pipeline": _redact_failure_value(dict(pipeline or {})),
        "timings": _redact_failure_value(list(timings)),
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
        "timings": _redact_failure_value(list(timings)),
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
    artifact = _publish(
        artifacts,
        context,
        archive,
        name="build-failure-evidence.tar.gz",
        kind="release_build_evidence",
        artifact_key=f"release-evidence-failure:{build['id']}",
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


def toolchain_identity(cli_version: str = "") -> tuple[dict[str, Any], str]:
    """Return the human-readable toolchain record and its hashed identity."""

    from app.release_studio.documents import RENDERER_VERSION, renderer_resource_digest

    image = executor_image()
    monkey_version = _distribution_version("kicad-monkey", "kicad_monkey")
    cruncher_version = _distribution_version("kicad-cruncher", "kicad_cruncher")
    # Fonts and the Cruncher view configuration together: both are bundled
    # resources that decide what a composed sheet contains.
    resources = renderer_resource_digest()
    record = {
        "kicad_version": cli_version or "10.0.4",
        "executor_image": image,
        "generator_build": GENERATOR_BUILD,
        "canonicalizer_registry": f"{CANONICALIZER_REGISTRY_NAME}/{CANONICALIZER_REGISTRY_VERSION}",
        "renderer": RENDERER_VERSION,
        "kicad_monkey_version": monkey_version,
        "kicad_cruncher_version": cruncher_version,
        "resource_bundle_digest": resources,
    }
    digest = sha256_canonical(
        {
            "executor_image_digest": image,
            "generator_build": GENERATOR_BUILD,
            "canonicalizer_registry_version": CANONICALIZER_REGISTRY_VERSION,
            # The renderer is part of the toolchain identity: a change that
            # alters composed sheets for unchanged input must move the build key.
            "renderer_version": RENDERER_VERSION,
            "kicad_monkey_version": monkey_version,
            # Cruncher renders the assembly views, so its version decides
            # what those released sheets look like.
            "kicad_cruncher_version": cruncher_version,
            "resource_bundle_digest": resources,
        }
    )
    return record, digest


def _distribution_version(distribution: str, module_name: str) -> str:
    """Resolve a packaged tool identity without depending on host paths."""

    try:
        return metadata.version(distribution)
    except metadata.PackageNotFoundError:
        try:
            module = __import__(module_name)
        except ImportError:
            return "unavailable"
        return str(getattr(module, "__version__", "unversioned"))


def sync_configurations(project_id: str) -> list[dict[str, Any]]:
    """Reconcile the project's committed configurations into the registry.

    A release configuration is authored in Git under
    ``.prism/release-studio/configurations/*.yaml``; ``ws_release_configurations``
    is a queryable registry of what the working tree currently declares, not a
    second source of truth.  Reconciling on read is what lets a designer commit
    a configuration and immediately see it in the UI, and it keeps the two from
    drifting without a separate sync step to remember.

    A configuration that no longer parses is skipped rather than failing the
    listing: one bad file must not hide the others.
    """

    from app.services.design_compare_service import _repo_paths

    try:
        _repo, _relative, checkout = _repo_paths(project_id)
    except Exception:  # noqa: BLE001 - an unregistered project simply has none
        return store.list_configurations(project_id)

    loaded_configs: dict[str, dict[str, Any]] = {}
    for config_key in list_configuration_keys(checkout):
        try:
            config = load_configuration_from_checkout(checkout, config_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "release studio configuration %s/%s did not load: %s",
                project_id,
                config_key,
                exc,
            )
            continue
        loaded_configs[config_key] = config
        store.upsert_configuration(
            project_id=project_id,
            config_key=config_key,
            title=str(config.get("title") or config_key),
            board_rel=str(config.get("board") or ""),
            schematic_rel=str(config.get("schematic") or ""),
            jobset_rel=str(config.get("jobset") or ""),
            default_variant=str(config.get("default_variant") or ""),
        )
    from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY

    rows = store.list_configurations(project_id)
    for row in rows:
        loaded = loaded_configs.get(str(row.get("config_key") or ""))
        if loaded is not None:
            row["typography"] = loaded.get("typography", DEFAULT_TYPOGRAPHY)
            row["document_number"] = loaded.get("document_number", "")
            row["revision"] = loaded.get("revision", "")
            row["fields"] = loaded.get("fields", {})
            row["notes"] = loaded.get("notes", {})
            row["vendors"] = loaded.get("vendors", [])
            row["variants"] = loaded.get("variants", [])
            row["policy"] = loaded.get("policy")
            row["template"] = loaded.get("template")
            row["sheets"] = loaded.get("sheets")
    return rows


def save_configuration(
    project_id: str,
    config_key: str,
    document: Mapping[str, Any],
    *,
    author_email: str,
    expected_base_commit: str | None = None,
    workspace_root: Path | None = None,
    check_cancelled: Any = None,
) -> dict[str, Any]:
    """Validate and publish one configuration without diverging Prism's mirror.

    The project checkout is deliberately a read-only fast-forward mirror of
    the remote.  Authoring therefore happens in a temporary clone.  The new
    commit is pushed with a lease against the upstream revision we fetched;
    only after that succeeds is the mirror fast-forwarded.  A rejected push
    cannot leave an invisible local-only commit behind.
    """

    from app.services.design_compare_service import _repo_paths
    from app.services.project_import_service import git_env

    repo_root, _relative, checkout = _repo_paths(project_id)
    repo_root = repo_root.resolve()
    checkout = checkout.resolve()
    rel_to_checkout = configuration_relpath(config_key)
    try:
        project_prefix = checkout.relative_to(repo_root)
    except ValueError as exc:
        raise BuildError("project checkout is outside its Git repository") from exc
    repo_rel = (project_prefix / rel_to_checkout).as_posix()

    def git(*args: str, cwd: Path = repo_root, env: Mapping[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        try:
            return run_git(*args, cwd=cwd, env=env, check_cancelled=check_cancelled)
        except GitPublishError as error:
            raise BuildError(str(error)) from error

    def output(*args: str, cwd: Path = repo_root) -> str:
        result = git(*args, cwd=cwd)
        if result.returncode != 0:
            raise BuildError((result.stderr or result.stdout or f"git {' '.join(args)} failed").strip())
        return result.stdout.strip()

    tracked_status = git("status", "--porcelain", "--untracked-files=no")
    if tracked_status.returncode != 0:
        raise BuildError((tracked_status.stderr or "failed to inspect the project mirror").strip())
    if tracked_status.stdout.strip():
        raise BuildError(
            "the project checkout has tracked local changes; Sync or clean the mirror before publishing"
        )

    branch = output("symbolic-ref", "--quiet", "--short", "HEAD")
    upstream = output("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
    if "/" not in upstream:
        raise BuildError(f"branch {branch!r} has no publishable upstream")
    remote_name, remote_branch = upstream.split("/", 1)
    remote_url = output("remote", "get-url", remote_name)
    remote_ref = f"refs/remotes/{remote_name}/{remote_branch}"
    remote_head_ref = f"refs/heads/{remote_branch}"
    network_env = git_env()
    fetched = git("fetch", "--prune", remote_name, remote_branch, env=network_env)
    if fetched.returncode != 0:
        raise BuildError((fetched.stderr or fetched.stdout or "failed to fetch the configuration branch").strip())

    local_head = output("rev-parse", "HEAD")
    upstream_head = output("rev-parse", remote_ref)
    counts = output("rev-list", "--left-right", "--count", f"{local_head}...{upstream_head}").split()
    if len(counts) != 2:
        raise BuildError("could not compare the project mirror with its upstream")
    ahead, behind = (int(counts[0]), int(counts[1]))
    if ahead and behind:
        raise BuildError("the project checkout has diverged from its upstream; reconcile it before publishing")
    if behind:
        advanced = git("merge", "--ff-only", remote_ref)
        if advanced.returncode != 0:
            raise BuildError((advanced.stderr or advanced.stdout or "failed to fast-forward before publishing").strip())
        local_head = upstream_head
    elif ahead:
        # Migration seam for the local-only implementation that preceded this
        # transaction. It is safe to publish only when every unpublished byte
        # belongs to the exact configuration the user is currently saving.
        unpublished_paths = {
            line.strip()
            for line in output("diff", "--name-only", f"{upstream_head}..{local_head}").splitlines()
            if line.strip()
        }
        if not unpublished_paths or unpublished_paths != {repo_rel}:
            raise BuildError(
                "the project checkout contains unpublished commits outside this configuration; "
                "Prism will not push them implicitly"
            )
    if expected_base_commit and expected_base_commit.lower() != local_head.lower():
        # A worker may be retried after its push succeeded but before job
        # completion was recorded. It is safe to converge on the newer remote
        # tip only when that tip already contains this exact normalized
        # configuration. An unpublished local-ahead commit is deliberately
        # excluded: it still has to pass through the leased push below.
        if ahead == 0:
            try:
                requested = validate_configuration_for_checkout(
                    checkout,
                    document,
                    source=rel_to_checkout.as_posix(),
                )
                current = load_configuration_from_checkout(checkout, config_key)
            except Exception:  # noqa: BLE001 - mismatch is reported uniformly below
                requested = None
                current = None
            if (
                requested is not None
                and current is not None
                and sha256_canonical(requested) == sha256_canonical(current)
            ):
                rows = sync_configurations(project_id)
                row = next((item for item in rows if item.get("config_key") == config_key), None)
                if row is not None:
                    return {"configuration": row, "commit_sha": local_head, "path": repo_rel}
        raise BuildError(
            "the tracked branch changed after this configuration was loaded; "
            "refresh Settings before publishing"
        )

    owned_workspace: tempfile.TemporaryDirectory[str] | None = None
    if workspace_root is None:
        owned_workspace = tempfile.TemporaryDirectory(prefix="prism-release-config-")
        staging_root = Path(owned_workspace.name)
    else:
        staging_root = Path(workspace_root)
        staging_root.mkdir(parents=True, exist_ok=True)
    publish_root = staging_root / "configuration-publish"
    if publish_root.exists():
        shutil.rmtree(publish_root)

    try:
        cloned = git("clone", "--shared", "--no-checkout", str(repo_root), str(publish_root))
        if cloned.returncode != 0:
            raise BuildError((cloned.stderr or cloned.stdout or "failed to prepare configuration publication").strip())
        checked_out = git("checkout", "--detach", local_head, cwd=publish_root)
        if checked_out.returncode != 0:
            raise BuildError((checked_out.stderr or checked_out.stdout or "failed to materialize the publication base").strip())
        added_remote = git("remote", "add", "publish", remote_url, cwd=publish_root)
        if added_remote.returncode != 0:
            raise BuildError((added_remote.stderr or "failed to prepare the publication remote").strip())

        isolated_checkout = (publish_root / project_prefix).resolve()
        normalized = validate_configuration_for_checkout(
            isolated_checkout,
            document,
            source=rel_to_checkout.as_posix(),
        )
        target = (isolated_checkout / rel_to_checkout).resolve()
        try:
            target.relative_to(isolated_checkout)
        except ValueError as exc:
            raise BuildError("configuration path escapes the project checkout") from exc
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = yaml.safe_dump(
            normalized,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
        )
        temporary_name = ""
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=target.parent,
                prefix=f".{target.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary.write(payload)
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary_name = temporary.name
            os.replace(temporary_name, target)
        finally:
            if temporary_name and Path(temporary_name).exists():
                Path(temporary_name).unlink()

        staged = git("add", "--", repo_rel, cwd=publish_root)
        if staged.returncode != 0:
            raise BuildError((staged.stderr or "failed to stage the configuration").strip())
        changed = git("diff", "--cached", "--quiet", cwd=publish_root)
        if changed.returncode not in {0, 1}:
            raise BuildError((changed.stderr or "failed to inspect the configuration change").strip())
        if changed.returncode == 1:
            committed = git(
                "-c", "user.name=Prism Release Studio",
                "-c", f"user.email={author_email}",
                "commit", "--no-verify",
                "-m", f"Configure Release Studio ({config_key})",
                cwd=publish_root,
            )
            if committed.returncode != 0:
                raise BuildError((committed.stderr or committed.stdout or "failed to commit the configuration").strip())
        commit_sha = output("rev-parse", "HEAD", cwd=publish_root)
        if check_cancelled is not None:
            check_cancelled()
        pushed = git(
            "push", "--porcelain",
            f"--force-with-lease={remote_head_ref}:{upstream_head}",
            "publish", f"{commit_sha}:{remote_head_ref}",
            cwd=publish_root,
            env=network_env,
        )
        if pushed.returncode != 0:
            detail = (pushed.stderr or pushed.stdout or "the remote rejected the configuration commit").strip()
            raise BuildError(
                f"configuration was not published; the project mirror is unchanged: {detail}"
            )

        refreshed = git("fetch", remote_name, remote_branch, env=network_env)
        if refreshed.returncode != 0:
            raise BuildError(
                f"configuration {commit_sha} was published, but Prism could not refresh its mirror; run Sync"
            )
        mirrored = git("merge", "--ff-only", remote_ref)
        if mirrored.returncode != 0:
            raise BuildError(
                f"configuration {commit_sha} was published, but Prism could not fast-forward its mirror; run Sync"
            )
        if output("rev-parse", "HEAD") != commit_sha:
            raise BuildError("published configuration did not become the mirrored branch tip")
        rows = sync_configurations(project_id)
        row = next((item for item in rows if item.get("config_key") == config_key), None)
        if row is None:
            raise BuildError("published configuration could not be reloaded")
        return {"configuration": row, "commit_sha": commit_sha, "path": repo_rel}
    finally:
        if owned_workspace is not None:
            owned_workspace.cleanup()


def list_configurations_at_commit(
    project_id: str,
    commit_sha: str,
) -> list[dict[str, Any]]:
    """Return configurations as they existed at *commit_sha*, without upserting."""

    from app.release_studio.documents.fonts import DEFAULT_TYPOGRAPHY
    from app.services.design_compare_service import _repo_paths

    repo_root, _relative, _checkout = _repo_paths(project_id)
    rows: list[dict[str, Any]] = []
    for config_key in list_configuration_keys_at_commit(repo_root, commit_sha):
        try:
            config = load_configuration_at_commit(repo_root, commit_sha, config_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "release studio configuration %s/%s at %s did not load: %s",
                project_id,
                config_key,
                commit_sha,
                exc,
            )
            continue
        rows.append(
            {
                "config_key": config_key,
                "title": str(config.get("title") or config_key),
                "board_rel": str(config.get("board") or ""),
                "schematic_rel": str(config.get("schematic") or ""),
                "jobset_rel": str(config.get("jobset") or ""),
                "default_variant": str(config.get("default_variant") or ""),
                "typography": config.get("typography", DEFAULT_TYPOGRAPHY),
                "document_number": config.get("document_number", ""),
                "revision": config.get("revision", ""),
                "fields": config.get("fields", {}),
                "notes": config.get("notes", {}),
                "vendors": config.get("vendors", []),
                "variants": config.get("variants", []),
            }
        )
    return rows


def _candidate_commit(candidate: Mapping[str, Any]) -> str:
    commit = str(candidate.get("commit_sha") or "").strip()
    if not commit:
        raise BuildError("candidate has no immutable commit sha")
    return commit


def configuration_for_candidate(
    project_id: str,
    candidate: Mapping[str, Any],
) -> dict[str, Any]:
    """Return the normalized committed configuration for *candidate*.

    New candidates carry this immutable snapshot.  Old rows are supported by
    reading the exact commit named by the candidate; mutable HEAD/checkouts are
    deliberately never a compatibility fallback.
    """

    if candidate.get("configuration_snapshot_captured"):
        document = candidate.get("configuration_document")
        if not isinstance(document, Mapping):
            raise BuildError("candidate configuration snapshot is unavailable")
        config = dict(document)
    else:
        from app.services import workspace_service

        row = workspace_service.workspace.get_project_by_id(project_id)
        if not row:
            raise BuildError("project not found")
        project_path = Path(str(row["path"] if "path" in row else row.get("clone_path") or ""))
        repo_root = project_path
        for _ in range(6):
            if (repo_root / ".git").exists():
                break
            repo_root = repo_root.parent
        else:
            raise BuildError("project repository is unavailable for committed configuration")
        config = load_configuration_at_commit(
            repo_root,
            _candidate_commit(candidate),
            str(candidate.get("config_key") or "default"),
        )

    digest = technical_config_digest(config)
    if digest != str(candidate.get("technical_config_digest") or ""):
        raise BuildError("candidate configuration snapshot does not match its technical digest")
    return config


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
        config = load_configuration_at_commit(repo_root, commit_sha, config_key)
        selected_variant = variant or str(config.get("default_variant") or "")
        declared_variants = {str(item) for item in config.get("variants") or ()}
        if declared_variants and selected_variant not in declared_variants:
            raise BuildError(
                f"variant {selected_variant!r} is not declared by committed configuration "
                f"{config_key!r}"
            )
    config_digest = technical_config_digest(config)

    closure_root = workspace_root / "closure"
    if closure_root.exists():
        shutil.rmtree(closure_root)
    closure = materialize_input_closure(
        repo_root,
        commit_sha,
        closure_root,
        relative_path=project_relpath,
    )

    hermetic, reasons = _hermeticity(closure_root, config)
    # A reference the closure could resolve into neither itself nor the pinned
    # toolchain is a hermeticity finding, not a materialization failure.
    closure_reasons = closure.non_hermetic_reasons()
    if closure_reasons:
        hermetic = False
        reasons = [*reasons, *closure_reasons]
    # References no build step reads -- 3D models -- are reported rather than
    # counted against hermeticity, so they cannot block a release whose outputs
    # do not depend on them.
    advisory = closure.advisory_reasons()
    if advisory:
        logger.info(
            "Release Studio closure carries %d advisory reference(s)", len(advisory)
        )
    _toolchain, toolchain_digest = toolchain_identity()

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
        policy_snapshot_captured=False,
        policy_document=None,
        configuration_snapshot_captured=True,
        configuration_document=config,
        created_by=created_by,
    )
    candidate["_closure_root"] = str(closure_root)
    candidate["_config"] = config
    candidate["_advisory_reasons"] = advisory
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
    cli_path: str | None = None,
    cruncher_path: str | None = None,
    repo_root: Path | None = None,
) -> dict[str, Any]:
    """Run the catalogue, assemble the dossier, and publish it under the fence.

    ``repo_root`` is the source repository.  The closure is materialized from
    Git objects and has no ``.git`` of its own, so anything that needs commit
    metadata -- the date a sheet states -- has to ask the repository.
    """

    artifact_service = artifacts or JobArtifactService()
    build = store.start_build(
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

        def _on_catalogue_step(
            step_id: str,
            status: str,
            *,
            elapsed_ms: int | None = None,
            log: str = "",
            message: str = "",
        ) -> None:
            tracker.catalogue_event(
                step_id,
                status,
                elapsed_ms=elapsed_ms,
                log=log,
                message=message,
            )

        board_rel = str(config.get("board") or "")
        board_path = closure_root / board_rel if board_rel else None
        assembly_views: dict[str, Any] | None = None
        assembly_error: BaseException | None = None
        cruncher_pool: ThreadPoolExecutor | None = None
        extra_evidence: dict[str, bytes] = {}
        vendor_outputs: tuple[StepOutput, ...] = ()
        schematic_rel = str(config.get("schematic") or "") or None
        variant = str(candidate.get("variant") or "")
        bom_preset = str(config.get("bom_preset") or "")

        def _catalogue(timing_name: str, only: tuple[str, ...], *, with_bom_preset: bool = False):
            return _timed(
                timing_name,
                lambda: run_step_catalogue(
                    closure_root=closure_root,
                    board_rel=board_rel,
                    schematic_rel=schematic_rel,
                    output_root=output_root,
                    variant=variant,
                    cli_path=cli_path,
                    only=only,
                    progress=lambda **kwargs: context.progress(**kwargs),
                    on_step=_on_catalogue_step,
                    bom_preset=bom_preset if with_bom_preset else "",
                ),
            )

        try:
            # Checks first. Positions, then BOM, then Cruncher: each of those
            # used to share the worker with DRC/ERC and with each other, and
            # BOM died with std::bad_alloc.
            outputs_checks = _catalogue("catalogue-wave-checks", CATALOGUE_WAVE_CHECKS)
            outputs_positions = _catalogue("catalogue-wave-positions", CATALOGUE_WAVE_POSITIONS)
            outputs_bom = _catalogue(
                "catalogue-wave-bom",
                CATALOGUE_WAVE_BOM,
                with_bom_preset=True,
            )
            tracker.start("cruncher-assembly", message="Rendering assembly views")
            if cruncher_path and board_path is not None and board_path.is_file():
                from app.release_studio.documents.artwork import acquire_board_views

                cruncher_pool = ThreadPoolExecutor(
                    max_workers=1, thread_name_prefix="rs-cruncher"
                )
                cruncher_future = cruncher_pool.submit(
                    lambda: _timed(
                        "cruncher-assembly",
                        lambda: acquire_board_views(
                            cruncher_path,
                            board_path,
                            context.staging_dir / "artwork" / "cruncher",
                        ),
                    )
                )
            else:
                cruncher_future = None
                tracker.skip(
                    "cruncher-assembly",
                    reason="kicad-cruncher is not available"
                    if not cruncher_path
                    else "no board in the closure",
                )
            if cruncher_future is not None:
                try:
                    assembly_views = cruncher_future.result()
                    tracker.succeed("cruncher-assembly")
                except Exception as exc:  # noqa: BLE001 - compose records the miss
                    assembly_error = exc
                    logger.warning(
                        "Release Studio assembly views unavailable: %s", exc
                    )
                    tracker.fail("cruncher-assembly", message=str(exc))
            # Vendor generators also load the board; run them after the
            # assembly Cruncher so the two parses are not overlapped.
            #
            # Measured, because it looks like free parallelism and is not:
            # overlapping the two on JTYU-OBC took 147.9s against 155.7s
            # serial -- 8s saved -- while peak worker RSS went from 1.68 GiB
            # to 6.41 GiB. Both are Cruncher board loads and both are CPU
            # bound, so concurrency splits the same cores and buys nothing
            # except an OOM risk on a host with less memory than this one.
            vendor_outputs, extra_evidence = _timed(
                "vendors",
                lambda: _run_vendors(
                    config=config,
                    closure_root=closure_root,
                    output_root=output_root,
                    variant=variant,
                    cruncher_path=cruncher_path,
                    tracker=tracker,
                ),
            )
            outputs_artwork = _catalogue("catalogue-wave-artwork", CATALOGUE_WAVE_ARTWORK)
        finally:
            if cruncher_pool is not None:
                cruncher_pool.shutdown(wait=True)

        combined = {
            output.step_id: output
            for output in (*outputs_checks, *outputs_positions, *outputs_bom, *outputs_artwork)
        }
        outputs = tuple(
            combined[spec.step_id]
            for spec in STEP_CATALOGUE
            if spec.step_id in combined
        )
        # An incomplete Gerber set is the one omission that costs a fab run,
        # and it is invisible downstream: the vendor pack only asks whether
        # *any* gerber is present.
        build_warnings: list[str] = []
        gerbers = combined.get("gerbers")
        if gerbers is not None and gerbers.ran:
            has_manifest, missing_plots = gerber_manifest_gaps(gerbers.files)
            if missing_plots:
                raise BuildError(
                    "the Gerber export is incomplete: its job file lists "
                    f"{', '.join(missing_plots)}, which {'was' if len(missing_plots) == 1 else 'were'} "
                    "not written"
                )
            if not has_manifest:
                build_warnings.append(
                    "fabrication: the Gerber export wrote no readable .gbrjob "
                    "manifest, so the layer set could not be checked for "
                    "completeness"
                )
        if not include_schematic:
            tracker.skip("schematic_pdf", reason="no schematic in the configuration")
        tracker.start("documents-cover", message="Composing documentation", percent=70)
        outputs, document_warnings, projections = with_documents(
            outputs,
            closure_root=closure_root,
            config=config,
            candidate=candidate,
            output_root=output_root,
            cli_path=cli_path,
            cruncher_path=cruncher_path,
            staging=context.staging_dir,
            repo_root=repo_root,
            project_relpath=str(candidate.get("project_relpath") or "") or None,
            assembly_views=assembly_views,
            assembly_error=assembly_error,
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
        outputs = (*outputs, *vendor_outputs)

        tracker.start("package", message="Canonicalizing and packaging", percent=75)

        toolchain, toolchain_digest = toolchain_identity()
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
            extra_evidence=extra_evidence,
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
        completed = store.complete_build(
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
        # Completion is terminal and immutable. A best-effort progress update
        # must never turn a committed success into a generic failure/cancel.
        try:
            tracker.succeed("package", percent=100)
        except Exception:
            logger.warning("Release Studio build completed but final progress update failed", exc_info=True)
        return {
            "build": completed,
            "dossier": assembled,
            "artifacts": (dossier_artifact, evidence_artifact),
            "pipeline": tracker.snapshot,
        }
    except JobCancelled as exc:
        evidence_artifact_id = _failure_evidence_id(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="cancelled",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        store.cancel_build(
            build["id"],
            message=_redact_failure_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise
    except StepExecutionError as exc:
        evidence_artifact_id = _failure_evidence_id(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="step_failed",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        store.fail_build(
            build["id"],
            error_code="step_failed",
            error_message=_redact_failure_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise BuildError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - the build row must not stay running
        evidence_artifact_id = _failure_evidence_id(
            artifacts=artifact_service,
            context=context,
            build=build,
            candidate=candidate,
            error_code="build_failed",
            error=exc,
            pipeline=tracker.snapshot if tracker is not None else None,
            timings=timings,
        )
        store.fail_build(
            build["id"],
            error_code="build_failed",
            error_message=_redact_failure_text(exc),
            evidence_artifact_id=evidence_artifact_id,
        )
        raise


def _failure_evidence_id(**kwargs: Any) -> str | None:
    """Failure evidence must not hide the build error when publication itself fails."""

    try:
        return _publish_failure_evidence(**kwargs)
    except Exception:  # noqa: BLE001 - failed attempt remains visible either way
        logger.exception("Could not publish Release Studio failure evidence")
        return None


def _run_vendors(
    *,
    config: Mapping[str, Any],
    closure_root: Path,
    output_root: Path,
    variant: str,
    cruncher_path: str | None,
    tracker: PipelineTracker,
) -> tuple[tuple[StepOutput, ...], dict[str, bytes]]:
    """Generate configured vendor packs after the assembly Cruncher load."""

    vendor_ids = resolve_vendor_ids(config)
    if not vendor_ids:
        return (), {}
    for vendor_id in vendor_ids:
        tracker.start(f"vendor-{vendor_id}", message=f"Generating {vendor_id} pack")
    outputs, extra_evidence = generate_vendor_outputs(
        config=config,
        closure_root=closure_root,
        output_root=output_root,
        variant=variant,
        cruncher_path=cruncher_path,
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


def run_release_studio_configuration_publish_job(context: JobContext) -> JobResult:
    """Publish a configuration under the repository's exclusive job lock."""

    payload = context.payload
    project_id = str(payload["project_id"])
    config_key = str(payload.get("config_key") or "default")
    configuration = payload.get("configuration")
    if not isinstance(configuration, Mapping):
        raise BuildError("configuration payload is missing")
    context.progress(
        stage="validate",
        message="Validating release configuration",
        percent=10,
        force=True,
    )
    context.check_cancelled()
    context.progress(
        stage="publish",
        message="Publishing configuration to the tracked branch",
        percent=35,
        force=True,
    )
    saved = save_configuration(
        project_id,
        config_key,
        configuration,
        author_email=str(payload.get("author") or "prism@example.com"),
        expected_base_commit=str(payload.get("base_commit_sha") or "") or None,
        workspace_root=context.staging_dir,
        check_cancelled=context.check_cancelled,
    )
    context.progress(
        stage="mirror",
        message="Configuration published and mirrored",
        percent=100,
        force=True,
    )
    return JobResult(
        message="Release configuration published",
        details=saved,
    )


def run_release_studio_build_job(context: JobContext) -> JobResult:
    """Job handler: ``release_studio_build``."""

    from app.services import project_service, workspace_service

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
    project_path = Path(str(row["path"] if "path" in row else row.get("clone_path") or ""))
    repository_id = str(row.get("repo_id") or "")
    relative_path = str(row.get("relative_path") or ".")
    repo_root = project_path
    for _ in range(6):
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent

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
    except Exception as exc:
        # Preparation historically failed before a candidate/build existed,
        # making accepted jobs disappear from release history. Retain an
        # explicit failed attempt without altering a successful candidate's
        # immutable identity.
        try:
            tracker.fail("closure", message=_redact_failure_text(exc))
        except Exception:  # noqa: BLE001 - retain the failure even if progress is stale
            logger.debug("Could not report failed closure progress", exc_info=True)
        failed_build = store.record_prepare_failure(
            project_id=project_id,
            repository_id=repository_id,
            config_key=config_key,
            commit_sha=commit_sha,
            variant=variant,
            job_id=context.job_id,
            fence=context.fence,
            author=author,
            error=_redact_failure_text(exc),
        )
        failure_candidate = {
            "id": failed_build.get("candidate_id") or "",
            "commit_sha": commit_sha,
            "config_key": config_key,
            "variant": variant,
        }
        evidence_artifact_id = _failure_evidence_id(
            artifacts=JobArtifactService(),
            context=context,
            build=failed_build,
            candidate=failure_candidate,
            error_code="prepare_failed",
            error=exc,
            pipeline=tracker.snapshot,
        )
        store.fail_build(
            str(failed_build["id"]),
            error_code="prepare_failed",
            error_message=_redact_failure_text(exc),
            actor=author,
            evidence_artifact_id=evidence_artifact_id,
        )
        raise
    tracker.succeed("closure", percent=8)

    if not board:
        from app.release_studio.source import discover_source

        try:
            discovered = discover_source(
                repo_root, candidate["commit_sha"], relative_path
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
        cli_path=_cli_path_or_none(),
        cruncher_path=_cruncher_path_or_none(),
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
            "manifest_digest": build["manifest_digest"],
            "dossier_digest": build["dossier_digest"],
            "pipeline": result.get("pipeline"),
        },
        artifact=result["artifacts"][0],
        sidecar_artifacts=(result["artifacts"][1],),
    )


def _cli_path_or_none() -> str | None:
    try:
        return resolve_cli_path()
    except StepExecutionError:
        return None


def _cruncher_path_or_none() -> str | None:
    """A missing Cruncher costs the assembly views, not the build."""

    try:
        return resolve_cruncher_path()
    except StepExecutionError:
        return None


__all__ = [
    "GENERATOR_BUILD",
    "BuildError",
    "execute_build",
    "executor_image",
    "list_configurations_at_commit",
    "prepare_candidate",
    "run_release_studio_configuration_publish_job",
    "run_release_studio_build_job",
    "save_configuration",
    "toolchain_identity",
]
