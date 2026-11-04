"""How a consumer reads bundle members (bundle-format.md §3.3, §8, §9).

A consumer names the revision and the members it needs. :func:`open_revision`
keys the revision, opens the archive that serves it (its own, else the one an
alias row points to, ADR amendment K2 §3.6) and answers readiness per member; ``read_json`` and ``extract`` return
verified bytes or files. Nothing here builds a bundle: ``queue=True`` asks for
one when the archive is missing or pending, deduplicated on the bundle key.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from app.services import kicad_libraries
from app.services.design_bundle import cli, jobs, reuse, rows, stage_models, store
from app.services.design_bundle.archive import Archive
from app.services.design_bundle.manifest import Readiness, readiness

logger = logging.getLogger(__name__)

_ACTIVE = ("queued", "running", "retry_wait", "cancel_requested")


@dataclass
class OpenedRevision:
    """A revision as a consumer reads it.

    ``revision_key`` is the key asked for, which is what a consumer reports.
    ``bundle_key`` names the archive that serves it, built for
    ``archive_revision_key``: another revision's when ``aliased``.
    """

    project_id: str
    commit: str | None
    revision_key: str | None
    generator_digest: str
    bundle_key: str | None
    archive: Archive | None
    job_active: bool
    absent: bool = False
    archive_revision_key: str | None = None
    aliased: bool = False
    #: The error of a build that ended failed and is not being retried; ``None`` otherwise.
    failure: str | None = None
    #: A no-commit request served HEAD while the checkout held uncommitted
    #: changes in the files the bundle reads (``consumer.BundleRead``).
    working_tree_dirty: bool = False

    def readiness(self, paths: Iterable[str]) -> dict[str, Readiness]:
        manifest = self.archive.manifest if self.archive is not None else None
        return {path: readiness(manifest, path, job_active=self.job_active) for path in paths}

    def _need(self) -> Archive:
        if self.archive is None:
            raise LookupError("the bundle is not stored yet")
        if self.bundle_key:
            rows.touch_bundle(self.project_id, self.bundle_key)
        if self.aliased and self.revision_key:
            rows.touch_alias(self.project_id, self.revision_key, self.generator_digest)
        return self.archive

    def read(self, path: str) -> bytes:
        """A member's bytes, checked for size, SHA-256 and schema (§9 steps 6-7)."""

        return self._need().read(path)

    def read_json(self, path: str) -> Any:
        return json.loads(self.read(path).decode("utf-8"))

    def extract(self, paths: Iterable[str]) -> Path:
        """Members as files in the archive's verified version directory (§8)."""

        archive = self._need()
        stored_as = self.archive_revision_key or self.revision_key
        assert stored_as is not None
        return store.extract(archive, self.project_id, stored_as, self.generator_digest, paths)


def _working_tree_dirty(row: Mapping[str, Any], key: Any) -> bool:
    """Whether the checkout's read set differs from HEAD's (uncommitted changes).

    Only names: ``git status`` lists what ``git add -A`` would touch, and a name
    is compared against the HEAD key's selected entries or the §5.2 name rules.
    A bundle is never built from a dirty tree; the caller serves HEAD and says so.
    """

    if key.absent or key.key is None or key.config is None:
        return False
    from app.services import project_revision
    from app.services.design_bundle import revision_key as rk

    repo = project_revision.locate(row).repo_root
    selected = {entry["path"].encode("utf-8") for entry in key.key.entries}
    excluded = [str(directory).encode("utf-8") for directory in key.config.get("excluded_dirs") or ()]
    for path in rk.worktree_changes(repo):
        if path in selected:
            return True
        if any(path == directory or path.startswith(directory + b"/") for directory in excluded):
            continue
        if rk.category_of(path.rsplit(b"/", 1)[-1], "regular") is not None:
            return True
    return False


def open_revision(project_id: str, commit: str | None = None, *, queue: bool = False, requested_by: str = "") -> OpenedRevision:
    """The stored bundle of ``project_id`` at ``commit`` (``HEAD`` when ``None``), as far as it got."""

    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise LookupError(f"Project '{project_id}' not found")
    key = jobs.project_key(row, commit)
    dirty = False
    if commit is None:
        try:
            dirty = _working_tree_dirty(row, key)
        except Exception:  # noqa: BLE001 - a status read must not lose the bundle
            logger.warning("design bundle: could not read %s's working tree", project_id, exc_info=True)
    generator = cli.generator()
    if key.absent:
        return OpenedRevision(project_id, key.commit, None, generator.digest, None, None, False, absent=True)
    revision_key = key.key.revision_key  # type: ignore[union-attr]
    bundle_key, stored_as, aliased, archive = _stored(project_id, revision_key, generator)
    bundle = rows.get_bundle(project_id, bundle_key)
    active = bool(bundle and rows.job_status(bundle.get("job_id")) in _ACTIVE)
    complete = archive is not None and all(
        archive.manifest["stages"][stage]["status"] != "pending" for stage in ("parse", "board", "models")
    )
    if queue and not active and not complete:
        # An aliased archive's later stages are its own revision's job.
        build_commit = (bundle or {}).get("commit_sha") if aliased else key.commit
        active = bool(jobs.start_design_bundle_job(project_id, commit=build_commit or key.commit, requested_by=requested_by))
    failure = None
    if not active and not complete and bundle and bundle["state"] == "failed":
        failure = str(bundle.get("error") or "the design bundle build failed")
    return OpenedRevision(
        project_id, key.commit, revision_key, generator.digest, bundle_key, archive, active,
        archive_revision_key=stored_as, aliased=aliased, failure=failure, working_tree_dirty=dirty,
    )


_unaffected: dict[tuple[str, str], None] = {}
_UNAFFECTED_LIMIT = 2048


def models_outdated(opened: OpenedRevision, *, snapshot: kicad_libraries.Snapshot | None = None) -> bool:
    """Whether the stored component GLB was exported with other libraries than are bound now.

    A board's models resolve through KiCad path variables bound to libraries
    fetched at runtime, and a bundle is otherwise never rebuilt. A bundle
    records, for the variables its board uses, what each pointed at when its
    models were exported (``store.write_models_record``); it is outdated when
    any of those differs now. Only the variables the board uses count, so a
    library its board does not use changes nothing. A bundle with no record
    predates this: it is outdated only if a variable its placements name is
    bound now, which is read from the archive once per set of bindings. A
    bundle still being built is not outdated.
    """

    archive = opened.archive
    if archive is None or opened.job_active or not manifest_models_built(archive):
        return False
    stored_as = opened.archive_revision_key or opened.revision_key
    if stored_as is None:
        return False
    taken = snapshot or kicad_libraries.current()
    recorded = store.read_models_record(opened.project_id, stored_as, opened.generator_digest)
    if recorded is not None:
        return taken.fingerprints(recorded["variables"]) != recorded["variables"]
    if not taken.bindings:
        return False
    memo = (archive.manifest_sha256, "|".join(sorted(f"{n}={b.fingerprint}" for n, b in taken.bindings.items())))
    if memo in _unaffected:
        return False
    named = stage_models.referenced_variables(archive).variables
    if any(name in taken.bindings for name in named):
        return True
    if len(_unaffected) >= _UNAFFECTED_LIMIT:
        _unaffected.clear()
    _unaffected[memo] = None
    return False


def manifest_models_built(archive: Archive) -> bool:
    from app.services.design_bundle.manifest import models_built

    return models_built(archive.manifest)


def refresh_models(
    opened: OpenedRevision, *, requested_by: str = "", priority: int | None = None, head: bool = False
) -> str | None:
    """Queue the models stage again over a stored bundle; returns the job id, ``None`` if none was queued.

    An aliased revision's archive is its target's, so the target's commit is
    the one refreshed (once, for every revision aliased to it).
    """

    if opened.bundle_key is None:
        return None
    bundle = rows.get_bundle(opened.project_id, opened.bundle_key)
    commit = (bundle or {}).get("commit_sha") if opened.aliased else opened.commit
    try:
        return jobs.start_design_bundle_job(
            opened.project_id,
            commit=commit or opened.commit,
            requested_by=requested_by,
            priority=priority,
            head=head,
            refresh_models=True,
        )
    except cli.CliUnavailable:
        return None


def _stored(project_id: str, revision_key: str, generator: Any) -> tuple[str, str, bool, Archive | None]:
    """The bundle key, the revision key it is stored under, whether that is an alias, and the archive."""

    resolved = reuse.resolve(project_id, revision_key, generator)
    bundle_key = resolved.bundle_key if resolved else generator.bundle_key(revision_key)
    stored_as = resolved.archive_revision_key if resolved else revision_key
    archive = store.open_bundle(project_id, stored_as, generator.digest, bundle_key)
    return bundle_key, stored_as, bool(resolved and resolved.aliased), archive


def open_revision_key(project_id: str, revision_key: str, generator_digest: str) -> OpenedRevision | None:
    """The stored bundle that serves ``revision_key`` for ``generator_digest``, by key, not commit.

    For URLs that name a revision (a viewer's asset, cached forever): ``None``
    when nothing is stored for it, or the generator is not the running one.
    Nothing is queued.
    """

    generator = cli.generator()
    if generator_digest != generator.digest:
        return None
    bundle_key, stored_as, aliased, archive = _stored(project_id, revision_key, generator)
    if archive is None:
        return None
    return OpenedRevision(
        project_id, None, revision_key, generator.digest, bundle_key, archive, False,
        archive_revision_key=stored_as, aliased=aliased,
    )


def member_states(opened: OpenedRevision, paths: Iterable[str]) -> Mapping[str, str]:
    return {path: answer.state for path, answer in opened.readiness(paths).items()}
