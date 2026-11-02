"""Release Studio configurations: the committed registry, publishing, and reads at a commit.

A release configuration is authored in Git under the project's
``.prism/release-studio/configurations/*.yaml``. This module keeps the
``ws_release_configurations`` registry in step with the checkout, publishes an
edited configuration to the tracked branch (temporary clone, leased push, then
a fast-forward of Prism's mirror), and reads configurations as they were at a
commit for candidates and builds. The build itself lives in
``release_studio_build_service``.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Mapping

import yaml

from app.release_studio.canonical import sha256_canonical
from app.release_studio.config import (
    configuration_relpath,
    list_configuration_keys,
    list_configuration_keys_at_commit,
    load_configuration_at_commit,
    load_configuration_from_checkout,
    technical_config_digest,
    validate_configuration_for_checkout,
)
from app.release_studio.git_publish import GitPublishError, run_git
from app.services import project_revision
from app.services import release_studio_service as store
from app.services.git_failures import strip_url_credentials
from app.services.job_kinds import JobKind, repository_lock
from app.services.job_runtime import JobContext, JobResult
from app.services.release_studio_build_service import BuildError

logger = logging.getLogger(__name__)


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

    try:
        checkout = project_revision.locate_id(project_id).checkout
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
    from app.release_studio.documents.style import DEFAULT_SHEET_STYLE

    rows = store.list_configurations(project_id)
    for row in rows:
        loaded = loaded_configs.get(str(row.get("config_key") or ""))
        if loaded is not None:
            row["typography"] = loaded.get("typography", DEFAULT_TYPOGRAPHY)
            row["sheet_style"] = loaded.get("sheet_style", DEFAULT_SHEET_STYLE)
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

    from app.services.git_remote_access import git_env

    location = project_revision.locate_id(project_id)
    repo_root = location.repo_root
    checkout = location.checkout
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
        raise BuildError(
            strip_url_credentials(
                fetched.stderr or fetched.stdout or "failed to fetch the configuration branch"
            ).strip()
        )

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
            detail = strip_url_credentials(
                pushed.stderr or pushed.stdout or "the remote rejected the configuration commit"
            ).strip()
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
    from app.release_studio.documents.style import DEFAULT_SHEET_STYLE

    location = project_revision.locate_id(project_id)
    repo_root, project_path = location.repo_root, location.relative_path
    rows: list[dict[str, Any]] = []
    for config_key in list_configuration_keys_at_commit(
        repo_root, commit_sha, project_path=project_path
    ):
        try:
            config = load_configuration_at_commit(
                repo_root, commit_sha, config_key, project_path=project_path
            )
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
                "sheet_style": config.get("sheet_style", DEFAULT_SHEET_STYLE),
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
        try:
            location = project_revision.locate(row)
        except project_revision.ProjectNotInRepository as exc:
            raise BuildError("project repository is unavailable for committed configuration") from exc
        config = load_configuration_at_commit(
            location.repo_root,
            _candidate_commit(candidate),
            str(candidate.get("config_key") or "default"),
            project_path=location.relative_path,
        )

    digest = technical_config_digest(config)
    if digest != str(candidate.get("technical_config_digest") or ""):
        raise BuildError("candidate configuration snapshot does not match its technical digest")
    return config


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


# Registered for completeness; nothing enqueues it today.
RELEASE_CONFIGURATION_PUBLISH = JobKind(
    "release_studio_configuration_publish",
    run_release_studio_configuration_publish_job,
    lock=repository_lock("write"),
)
JOB_KINDS = (RELEASE_CONFIGURATION_PUBLISH,)


__all__ = [
    "RELEASE_CONFIGURATION_PUBLISH",
    "configuration_for_candidate",
    "list_configurations_at_commit",
    "run_release_studio_configuration_publish_job",
    "save_configuration",
    "sync_configurations",
]
