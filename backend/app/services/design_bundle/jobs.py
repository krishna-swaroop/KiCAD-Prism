"""The ``design_bundle`` job (ADR §4.4, cli-spec.md §9.1).

One job runs every stage of one bundle key, in order, and is deduplicated on
the bundle key. It resumes from the stored archive: a stage only moves from
``pending`` to final, so a retried job runs only the stages still pending.

```text
0. generator    prism-kicad version -> generator digest, bundle key
   key          the commit's revision key (effective config, commit index)
   reuse        prism-kicad bundle reuse against a few stored bundles; on a
                hold, an alias row and no build (ADR amendment K2 §3.3).
                Skipped for a forced rebuild.
1. materialize  $JOB/src (LFS, gitlinks); upgrade older boards and schematics
                (cached); effective.json and key-record.json
2. parse        prism-kicad bundle build --stage parse -o <store>
3. refill       pcbnew ZONE_FILLER (cached; not with zone_fills "saved")
4. board        prism-kicad bundle build --stage board --in <store> -o <store>
5. models       kicad-cli pcb export glb (stage_models, cached)
6. models       prism-kicad bundle build --stage models --in <store> -o <store>
```

After every stage the job re-reads ``bundle.json`` and publishes readiness:
the ``ws_design_bundles`` row's stages and the job's progress. A failing KiCad
step or an internal CLI failure is retried; after the last attempt the stage
stays ``pending`` and the job ends failed (bundle-format.md §3.1). The
bundle row is then ``failed``: status reads do not queue it again until
``PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS`` pass, so a polling tab cannot
retry a permanent failure forever; Generate and Regenerate retry at once. A
``complete`` row or an alias whose archive is gone (lost, or rejected and
deleted on open) is not ready: the next request rebuilds it. A project
whose anchor is not in the tree is recorded as absent: no key, no bundle, no
retry.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from app.services.ops import stats as ops_stats
from app.core.config import settings
from app.services import event_log, kicad_libraries, kicad_library_store, kicad_tools, project_revision
from app.services.design_bundle import (
    cli,
    design_keys,
    kicad_steps,
    manifest as manifest_rules,
    materialize,
    reuse,
    rows,
    stage_models,
    store,
)
from app.services.design_bundle.archive import Archive
from app.services.design_bundle.effective_config import ProjectKey, ProjectRef, key_at_commit
from app.services.design_bundle.generator import Generator
from app.services.job_kinds import JobKind, JobSubject, memory_units, repository_lock
from app.services.job_runtime import JobContext, JobResult, PermanentJobError, RetryableJobError

logger = logging.getLogger(__name__)

KIND = "design_bundle"
_STAGE_PERCENT = {"parse": 40, "board": 75, "models": 95}
FLAG_NOTES = ("board-unresolved", "schematic-unresolved", "prism-json-invalid")
#: The paced backfill's requester and priority; anything lower is a user request.
BACKFILL_REQUESTED_BY = "design-bundle-backfill"
BACKFILL_PRIORITY = 300


def _workspace():
    from app.services.workspace_service import workspace

    return workspace


# ------------------------------------------------------------------ keying


def project_key(row: Mapping[str, Any], commit: str | None = None) -> ProjectKey:
    """The project's key at ``commit`` (its checkout's ``HEAD`` when ``None``)."""

    location = project_revision.locate(row)
    return key_at_commit(location.repo_root, ProjectRef.from_row(row), commit or "HEAD")


def flags_of(key: ProjectKey) -> dict[str, str]:
    """What the backfill records about a project at its HEAD (decisions.md, revision key 7)."""

    if key.absent:
        return {"project-absent": f"{key.absent_project_file} is not in the tree"}
    details = {
        "board-unresolved": "the board no longer resolves by the project's anchor; set its path in the project settings",
        "schematic-unresolved": "the root schematic no longer resolves by the project's anchor; set its path",
        "prism-json-invalid": "the committed .prism.json is not a JSON object",
    }
    return {note: details[note] for note in key.notes if note in details}


def artifact_key(project_id: str, bundle_key: str) -> str:
    """The job's dedup key, ``<project_id>:<bundle_key>`` (cli-spec.md §5.1.4).

    The bundle key identifies content, not a project, while bundles are stored
    per project: two projects with identical sources build their own.
    """

    return f"{project_id}:{bundle_key}"


def _archive_stored(project_id: str, row: Mapping[str, Any]) -> bool:
    return store.archive_path(project_id, str(row["revision_key"]), str(row["generator_digest"])).is_file()


def bundle_ready(project_id: str, bundle_key: str, *, connect: rows.Connect | None = None) -> bool:
    """Complete in its row and its archive still on disk: a lost or rejected archive is rebuilt."""

    row = rows.get_bundle(project_id, bundle_key, connect=connect)
    return bool(row and row["state"] == "complete" and _archive_stored(project_id, row))


def _alias_serves(project_id: str, alias: Mapping[str, Any], *, connect: rows.Connect | None = None) -> bool:
    """Whether an alias still points at a stored archive (the target may be lost or rejected)."""

    target = rows.get_bundle(project_id, str(alias["bundle_key"]), connect=connect)
    return bool(target and _archive_stored(project_id, target))


def _failure_holds(row: Mapping[str, Any] | None) -> bool:
    """A failed bundle stays failed until a deliberate retry or ``PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS`` passes.

    A source KiCad cannot read stays failed until a deliberate retry.

    Status reads poll; without this each read would queue a new job with a
    fresh attempt budget, retrying a permanent failure forever.
    """

    if not row or row["state"] != "failed":
        return False
    # KiCad rejected a source: only a different generator (a new bundle key)
    # or a deliberate Regenerate can change that.
    if str(row.get("error") or "").startswith(kicad_steps.UNREADABLE_PREFIX):
        return True
    delay = settings.PRISM_DESIGN_BUNDLE_FAILED_RETRY_SECONDS
    if delay <= 0:
        return True
    updated = row.get("updated_at")
    if updated is None:
        return True
    return (datetime.now(timezone.utc) - updated).total_seconds() < delay


def start_design_bundle_job(
    project_id: str,
    *,
    commit: str | None = None,
    requested_by: str = "",
    priority: int | None = None,
    head: bool = False,
    force: bool = False,
    retry_failed: bool = False,
    refresh_models: bool = False,
) -> str | None:
    """Queue the bundle of ``project_id`` at ``commit`` (default ``HEAD``) on demand.

    Returns the job id; ``None`` when the project is absent at that commit,
    its bundle is already complete or served through an alias, or its last
    build failed and no retry is due (``retry_failed`` is a deliberate retry).
    A complete row or alias whose archive is gone is rebuilt. ``force``
    queues a build that skips reuse (a regenerate). ``refresh_models`` queues
    the models stage alone over a stored bundle, because a KiCad library its
    board uses changed; it leaves the rest of the archive and keeps serving
    it, and a recent failure still holds it back. Raises
    ``cli.CliUnavailable`` when ``prism-kicad`` is not installed.
    """

    row = _workspace().get_project_by_id(project_id)
    if not row:
        return None
    key = project_key(row, commit)
    if key.absent:
        rows.record_absence(project_id, str(key.commit), str(key.absent_project_file))
        return None
    generator = cli.generator()
    revision_key = key.key.revision_key  # type: ignore[union-attr]
    bundle_key = generator.bundle_key(revision_key)
    if not force:
        if not refresh_models:
            if bundle_ready(project_id, bundle_key):
                return None
            alias = rows.get_alias(project_id, revision_key, generator.digest)
            if alias is not None:
                if _alias_serves(project_id, alias):
                    return None
                rows.delete_aliases(project_id, revision_keys=[revision_key])
        if not retry_failed and _failure_holds(rows.get_bundle(project_id, bundle_key)):
            return None
    queued = DESIGN_BUNDLE.enqueue(
        {
            "project_id": project_id,
            "commit": key.commit,
            "revision_key": revision_key,
            "bundle_key": bundle_key,
            "project_file_rel": str(row.get("project_file_rel") or ""),
            "head": bool(head or commit is None),
            "force": bool(force),
            "refresh_models": bool(refresh_models),
        },
        subject=JobSubject.of_project(row, project_id),
        artifact_key=artifact_key(project_id, bundle_key),
        requested_by=requested_by,
        priority=priority,
    )
    if not queued.get("deduplicated") and not queued.get("cache_hit"):
        _preempt_backfill(str(queued["job_id"]), requested_by=requested_by, priority=priority)
    rows.upsert_bundle(
        bundle_key=bundle_key, project_id=project_id, revision_key=revision_key, generator_digest=generator.digest,
        commit=key.commit, state="queued", job_id=str(queued["job_id"]),
    )
    return str(queued["job_id"])


def _preempt_backfill(interactive_job_id: str, *, requested_by: str, priority: int | None) -> None:
    """Cancel a queued or running backfill build so an interactive request does not wait behind it.

    The backfill holds the one ``design_bundle`` slot for minutes on a large
    board. Only the backfill's own jobs are preempted: another interactive
    request, another kind, or a user's forced rebuild is left alone.
    """

    if requested_by == BACKFILL_REQUESTED_BY:
        return
    if (DESIGN_BUNDLE.priority if priority is None else priority) >= BACKFILL_PRIORITY:
        return
    from app.services.job_service import jobs as job_service

    cancelled_by = requested_by or "interactive"
    for backfill_job_id in job_service.active_job_ids(
        KIND, requested_by=BACKFILL_REQUESTED_BY, exclude_job_id=interactive_job_id
    ):
        status = job_service.request_cancel(backfill_job_id, requested_by=cancelled_by)
        if status in ("cancelled", "cancel_requested"):
            logger.info("Preempted backfill design bundle job %s for interactive job %s", backfill_job_id, interactive_job_id)


def queue_for_head(project_id: str, *, requested_by: str = "") -> str | None:
    """After an import or a sync: the HEAD bundle, when ``PRISM_DESIGN_BUNDLE_AUTO_BUILD`` is on."""

    if not settings.PRISM_DESIGN_BUNDLE_AUTO_BUILD:
        return None
    return start_design_bundle_job(project_id, requested_by=requested_by, head=True)


# ------------------------------------------------------------- sources


@dataclass(frozen=True)
class PreparedSources:
    """One revision's design sources as stage parse reads them (cli-spec.md §9.1 step 1)."""

    src: Path
    effective: Path
    key_record: Path
    upgraded: list[dict[str, Any]]
    materialized: materialize.Materialized


def prepare_sources(
    repo: Path,
    key: ProjectKey,
    generator: Generator,
    work: Path,
    *,
    cancel: Callable[[], None],
    upgrade_cache: kicad_steps.UpgradeCache | None = None,
) -> PreparedSources:
    """Materialize the key's source set into ``work/src``, upgrade older files, write the config and key record.

    The design-bundle job's parse step and Design Comparison's source-tree mode
    both use it, so a source tree ``compare`` reads is the tree stage parse
    would read. A source that cannot be materialized, or a KiCad upgrade that
    fails, is retryable. ``upgrade_cache`` lets the two revisions of one
    comparison upgrade a shared file once.
    """

    src = work / "src"
    record = key.record()
    config = dict(key.config or {})
    try:
        done = materialize.materialize(repo, record, src)
        upgraded = kicad_steps.upgrade_sources(
            src, config, generator.kicad_file_formats, cancel=cancel, cache=upgrade_cache
        )
    except kicad_steps.KicadSourceUnreadable as error:
        raise PermanentJobError(str(error), code="source-unreadable") from error
    except (materialize.SourceUnavailable, kicad_steps.KicadStepFailed) as error:
        raise RetryableJobError(str(error), code="sources-unavailable", retry_after_seconds=30) from error
    effective, key_record = work / "effective.json", work / "key-record.json"
    effective.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    key_record.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    return PreparedSources(src, effective, key_record, list(upgraded), done)


# --------------------------------------------------------------------- run


class _Run:
    """One attempt of one bundle key."""

    def __init__(self, context: JobContext, row: Mapping[str, Any], key: ProjectKey, generator: Generator) -> None:
        self.context = context
        self.project_id = str(row["id"])
        self.repo = project_revision.locate(row).repo_root
        self.key = key
        self.config: dict[str, Any] = dict(key.config or {})
        self.revision_key = key.key.revision_key  # type: ignore[union-attr]
        self.generator = generator
        self.bundle_key = generator.bundle_key(self.revision_key)
        # ``bundle.built`` names this job's completion, once, not every stage publish.
        self._built_recorded = False
        self.work = context.staging_dir
        self.archive_path = store.prepare(self.project_id, self.revision_key, generator.digest)
        self.details: dict[str, Any] = {
            "project_id": self.project_id,
            "commit": key.commit,
            "revision_key": self.revision_key,
            "bundle_key": self.bundle_key,
            "generator_digest": generator.digest,
            "config_digest": key.key.config_digest,  # type: ignore[union-attr]
            "invocations": [],
            "stderr": [],
        }

    def cancel(self) -> None:
        self.context.check_cancelled()

    def open(self) -> Archive | None:
        return store.open_bundle(self.project_id, self.revision_key, self.generator.digest, self.bundle_key)

    def cli(self, args: list[str], stage: str) -> cli.CliRun:
        # The CLI creates no directory for -o. The worker's retention sweep
        # removes empty revision directories, and its first pass runs while
        # the first job materializes sources, so the directory made when the
        # run began may be gone by now: make it again right before each build.
        store.prepare(self.project_id, self.revision_key, self.generator.digest)
        try:
            done = cli.run(args, timeout_seconds=cli.outer_timeout(stage), expect="prism.cli.build_result.a0", cancel=self.cancel)
        except cli.CliFailure as failure:
            self.details["invocations"].append({"command": f"bundle build {stage}", "exit": failure.exit_code})
            if failure.retryable:
                if stage != "parse" and failure.exit_code == 1:
                    # Exit 1 is the CLI's internal category. A later stage
                    # reads the stored archive, and a retry resumed
                    # from the same archive failed the same way three times
                    # where a fresh build passed (CMBD, v5.0.1), so the next
                    # attempt rebuilds the archive instead of reading it again.
                    logger.warning("Rebuilding %s after stage %s failed: %s", self.archive_path, stage, failure)
                    store.delete(self.project_id, self.revision_key, self.generator.digest)
                raise RetryableJobError(f"prism-kicad stage {stage}: {failure}", code=failure.code) from failure
            raise PermanentJobError(f"prism-kicad stage {stage}: {failure}", code=failure.code) from failure
        self.details["invocations"].append({**done.summary(), "stage": stage})
        self.details["stderr"].extend(line for line in done.stderr_lines if not isinstance(line, dict) or line.get("severity") != "info")
        return done

    def verify(self, archive: Archive, stage: str) -> Archive:
        """Run ``bundle verify`` once for the archive's manifest, before it is published (C2r §2 item 9).

        A marker naming this manifest means another attempt already verified it;
        step 6 still ties every later read to the bytes that verify accepted.
        """

        if archive.verified:
            return archive
        try:
            done = cli.run(
                ["bundle", "verify", str(self.archive_path)],
                timeout_seconds=cli.verify_outer_timeout(),
                expect="prism.cli.verify_report.a0",
                cancel=self.cancel,
            )
        except cli.CliFailure as failure:
            self.details["invocations"].append({"command": "bundle verify", "exit": failure.exit_code})
            if failure.retryable:
                raise RetryableJobError(f"prism-kicad bundle verify: {failure}", code=failure.code) from failure
            raise PermanentJobError(f"prism-kicad bundle verify: {failure}", code=failure.code) from failure
        self.details["invocations"].append({**done.summary(), "stage": stage})
        self.details["stderr"].extend(
            line for line in done.stderr_lines if not isinstance(line, dict) or line.get("severity") != "info"
        )
        report = done.document or {}
        if done.exit_code == 8 or report.get("status") == "invalid":
            findings = report.get("findings") or []
            first = findings[0] if findings else {}
            reason = str(first.get("message") or "the archive is invalid")
            if first.get("code"):
                reason = f"{first['code']}: {reason}"
            logger.error("Deleting bundle %s that failed its own verify: %s", self.archive_path, reason)
            store.delete(self.project_id, self.revision_key, self.generator.digest)
            raise RetryableJobError(f"prism-kicad bundle verify: {reason}", code="bundle-verify-failed")
        if done.exit_code != 0:
            raise RetryableJobError(
                f"prism-kicad bundle verify exited {done.exit_code}", code=f"exit-{done.exit_code}"
            )
        store.write_marker(archive, self.project_id, self.revision_key, self.generator.digest)
        archive.verified = True
        return archive

    def publish(self, archive: Archive, stage: str) -> None:
        archive = self.verify(archive, stage)
        statuses = manifest_rules.statuses(archive.manifest)
        state = "complete" if manifest_rules.all_final(archive.manifest) else "building"
        rows.upsert_bundle(
            bundle_key=self.bundle_key, project_id=self.project_id, revision_key=self.revision_key,
            generator_digest=self.generator.digest, commit=self.key.commit, state=state, stages=statuses,
            job_id=self.context.job_id, archive_bytes=self.archive_path.stat().st_size,
            error=manifest_rules.failure_reasons(archive.manifest),
        )
        if state == "complete" and not self._built_recorded:
            self._built_recorded = True
            event_log.record_quietly(
                "bundle.built", project_id=self.project_id,
                payload={"commit": self.key.commit, "revisionKey": self.revision_key},
            )
        if stage == "parse":
            self.details["design_key"] = design_keys.record(self.project_id, self.bundle_key, archive)
        self.details["stages"] = statuses
        self.context.progress(
            stage=f"bundle-{stage}", message=f"Design bundle: stage {stage} {statuses[stage]}",
            percent=_STAGE_PERCENT[stage], force=True,
        )

    def _kicad_step(self, step: str, runs: list[dict[str, Any]]) -> None:
        """Record what a KiCad step's processes cost, as ``invocations`` does for prism-kicad.

        A cache hit runs nothing and records nothing. The stage memory caps
        bound prism-kicad only; these numbers are what the worker's memory
        budget also has to hold.
        """

        if not runs:
            return
        self.details.setdefault("kicad_steps", []).append({
            "step": step,
            "runs": len(runs),
            "exit": max((run["exit"] for run in runs), key=abs),
            "elapsed_ms": sum(run["elapsed_ms"] for run in runs),
            "peak_rss_bytes": max(run["peak_rss_bytes"] for run in runs),
        })

    # -- stages ---------------------------------------------------------------

    def parse(self) -> Archive | None:
        self.context.progress(stage="bundle-materialize", message="Materializing design sources", percent=5, force=True)
        upgrades = kicad_steps.UpgradeCache()
        with kicad_tools.recording() as runs:
            try:
                prepared = prepare_sources(
                    self.repo, self.key, self.generator, self.work, cancel=self.cancel, upgrade_cache=upgrades
                )
            finally:
                self._kicad_step("upgrade", runs)
        src, effective, key_record, upgraded = prepared.src, prepared.effective, prepared.key_record, prepared.upgraded
        done = prepared.materialized
        self.details.update(
            files=done.files, lfs_hydrated=done.lfs_hydrated, unavailable_models=done.unavailable_models,
            unavailable_gitlinks=done.unavailable_gitlinks, upgraded=upgraded,
            upgrade_cache_hits=upgrades.hits, upgrade_cache_misses=upgrades.misses,
        )
        ops_stats.incr("bundle.upgrade_cache.hit", upgrades.hits)
        ops_stats.incr("bundle.upgrade_cache.miss", upgrades.misses)
        self.context.progress(stage="bundle-parse", message="Design bundle: stage parse", percent=15, force=True)
        args = [
            "bundle", "build", str(src / self.config["project_file"]), "--stage", "parse",
            "--source-root", str(src), "-o", str(self.archive_path), "--revision-key", self.revision_key,
            "--key-record", str(key_record), "--config", str(effective), *cli.upgraded_args(upgraded),
            *cli.limits("parse"),
            "--threads", str(settings.PRISM_DESIGN_BUNDLE_THREADS),
        ]
        done_cli = self.cli(args, "parse")
        if done_cli.exit_code == 10:
            return None
        return self._reopen("parse")

    def board(self, archive: Archive) -> Archive:
        args = ["bundle", "build", "--stage", "board", "--in", str(self.archive_path), "-o", str(self.archive_path),
                "--revision-key", self.revision_key, *cli.limits("board")]
        if self.config.get("zone_fills") != "saved":
            sources = self._sources(archive, self._board_inputs(archive))
            self.context.progress(stage="bundle-refill", message="Refilling zones with pcbnew", percent=50, force=True)
            try:
                with kicad_tools.recording() as runs:
                    try:
                        refilled, refill_hit = kicad_steps.refill_board(
                            sources, self.config, self.work / "refill", cancel=self.cancel
                        )
                    finally:
                        self._kicad_step("refill", runs)
            except kicad_steps.KicadSourceUnreadable as error:
                raise PermanentJobError(str(error), code="source-unreadable") from error
            except kicad_steps.KicadStepFailed as error:
                raise RetryableJobError(str(error), code="zone-refill-failed", retry_after_seconds=30) from error
            self.details["refill_cache_hit"] = refill_hit
            ops_stats.incr("bundle.refill_cache.hit" if refill_hit else "bundle.refill_cache.miss")
            args += ["--refilled-board", str(refilled), "--refill-tool", self._tool_version()]
        self.cli(args, "board")
        return self._reopen("board")

    def models(self, archive: Archive) -> Archive:
        sources = self._sources(archive, ["sources/"])
        self.context.progress(stage="bundle-glb", message="Exporting component models", percent=85, force=True)
        # One answer to "which library is behind each path variable" for the whole stage: the key,
        # the export, prism-kicad's --model-dir and the record all read it, so a library that
        # publishes meanwhile is seen as a change by the next read and never half-applied here.
        with kicad_libraries.pinned(kicad_libraries.current()) as libraries:
            found = stage_models.referenced_variables(archive)
            fingerprints = libraries.fingerprints(found.variables)
            try:
                with kicad_tools.recording() as runs:
                    try:
                        glb, hit = stage_models.export_components_glb(
                            sources, self.key.record(), self.generator, self.work, cancel=self.cancel,
                            libraries=fingerprints,
                        )
                    finally:
                        self._kicad_step("glb", runs)
            except kicad_steps.KicadStepFailed as error:
                raise RetryableJobError(str(error), code="glb-export-failed", retry_after_seconds=30) from error
            self.details["models_cache_hit"] = hit
            ops_stats.incr("bundle.models_cache.hit" if hit else "bundle.models_cache.miss")
            args = ["bundle", "build", "--stage", "models", "--in", str(self.archive_path), "-o", str(self.archive_path),
                    "--models-glb", str(glb), "--models-tool", self._tool_version(), "--revision-key", self.revision_key,
                    *stage_models.hlr_args(), *cli.limits("models")]
            self.cli(args, "models")
            store.write_models_record(self.project_id, self.revision_key, self.generator.digest, {
                "variables": fingerprints,
                "sheets": libraries.fingerprints(found.sheets),
                "models": dict(found.models),
                "sheetRefs": dict(found.sheets),
                "missing": stage_models.missing_models(archive, libraries),
            })
        self._record_variable_usage(found)
        return self._reopen("models")

    def _record_variable_usage(self, found: Any) -> None:
        """What this project's boards need from KiCad path variables, for the libraries console.

        A hint for administrators, never an input to a rebuild: failing to write it changes nothing.
        """

        try:
            kicad_library_store.replace_usage(self.project_id, self.revision_key, dict(found.models), dict(found.sheets))
        except Exception:  # noqa: BLE001 - a console hint must not fail a build
            logger.warning("Could not record the path variables project %s uses", self.project_id, exc_info=True)

    def _tool_version(self) -> str:
        try:
            return kicad_steps.worker_kicad_version()
        except kicad_steps.KicadStepFailed as error:
            raise RetryableJobError(str(error), code="kicad-version-unknown", retry_after_seconds=30) from error

    def _board_inputs(self, archive: Archive) -> list[str]:
        project = str(self.config["project_file"])
        wanted = [f"sources/{self.config['board']}", f"sources/{project}"]
        rules = f"sources/{project[: -len('.kicad_pro')]}.kicad_dru"
        return wanted + ([rules] if archive.member(rules) else [])

    def _sources(self, archive: Archive, paths: list[str]) -> Path:
        base = store.extract(archive, self.project_id, self.revision_key, self.generator.digest, paths)
        return base / "sources"

    def _reopen(self, stage: str) -> Archive:
        archive = self.open()
        if archive is None:
            raise RetryableJobError(f"stage {stage} left no valid archive", code="archive-invalid")
        self.publish(archive, stage)
        return archive


def run_design_bundle_job(context: JobContext) -> JobResult:
    payload = context.payload
    project_id = str(payload["project_id"])
    row = _workspace().get_project_by_id(project_id)
    if not row:
        raise PermanentJobError("Project not found", code="project-not-found")
    if str(row.get("project_file_rel") or "") != str(payload.get("project_file_rel") or ""):
        raise RetryableJobError("Project anchor changed after the design bundle was queued; retry the job")
    commit = str(payload["commit"])
    context.progress(stage="bundle-key", message="Computing the design revision key", percent=1, force=True)
    key = project_key(row, commit)
    if payload.get("head"):
        rows.set_flags(project_id, str(key.commit), flags_of(key))
    if key.absent:
        rows.record_absence(project_id, commit, str(key.absent_project_file))
        return JobResult(
            message="The project is not present at this revision",
            details={"project_id": project_id, "commit": commit, "absent": True, "project_file": key.absent_project_file},
        )
    try:
        generator = cli.generator()
    except cli.CliUnavailable as error:
        raise PermanentJobError(str(error), code="cli-unavailable") from error
    except cli.CliFailure as failure:
        raise RetryableJobError(f"prism-kicad version: {failure}", code=failure.code) from failure
    rows.index_key(project_id, str(key.commit), key.key.config_digest, key.key.revision_key)  # type: ignore[union-attr]
    served = _served_by_reuse(context, row, key, generator)
    if served is not None:
        return served
    run = _Run(context, row, key, generator)
    rows.upsert_bundle(
        bundle_key=run.bundle_key, project_id=project_id, revision_key=run.revision_key,
        generator_digest=generator.digest, commit=key.commit, state="building", job_id=context.job_id,
    )
    archive = run.open()
    if archive is None:
        archive = run.parse()
        if archive is None:  # the CLI found the project absent: the key and the tree disagree
            raise PermanentJobError("prism-kicad reported the project absent although the key selected it", code="project-absent")
    _remove_superseded(run)
    if payload.get("refresh_models") and manifest_rules.models_built(archive.manifest):
        archive = run.models(archive)  # a library changed: the models stage again, nothing else
    while (stage := manifest_rules.next_stage(archive.manifest)) is not None:
        archive = run.board(archive) if stage == "board" else run.models(archive)
    run.publish(archive, "models")
    statuses = manifest_rules.statuses(archive.manifest)
    run.details["stages"] = statuses
    incomplete = manifest_rules.incomplete_stages(statuses)
    run.details["failed_stages"], run.details["partial_stages"] = incomplete["failed"], incomplete["partial"]
    return JobResult(message=completion_message(statuses), details=run.details)


def completion_message(statuses: Mapping[str, str]) -> str:
    """The job's message: ``ready`` only when no stage failed or is partial."""

    listed = ", ".join(f"{stage} {status}" for stage, status in statuses.items())
    if any(manifest_rules.incomplete_stages(statuses).values()):
        return f"Design bundle incomplete: {listed}"
    return f"Design bundle ready: {listed}"


def _served_by_reuse(context: JobContext, row: Mapping[str, Any], key: ProjectKey, generator: Generator) -> JobResult | None:
    """Alias the key to a stored bundle whose read set holds, instead of building (K2 §3.3).

    Not for a forced rebuild, nor when the key's own archive exists (a build
    to resume). On a hold the queued row of the key's own bundle goes: the
    key is served through the alias.
    """

    project_id = str(row["id"])
    revision_key = key.key.revision_key  # type: ignore[union-attr]
    own = generator.bundle_key(revision_key)
    if context.payload.get("force") or store.open_bundle(project_id, revision_key, generator.digest, own) is not None:
        return None
    context.progress(stage="bundle-reuse", message="Looking for a stored bundle that serves this revision", percent=2, force=True)
    repo = project_revision.locate(row).repo_root
    try:
        served_by = reuse.try_reuse(project_id, repo, key, generator, context.staging_dir, cancel=context.check_cancelled)
    except cli.CliUnavailable as error:
        raise PermanentJobError(str(error), code="cli-unavailable") from error
    if served_by is None:
        return None
    rows.delete_bundles(project_id, [own])
    return JobResult(
        message="Served by a stored bundle whose read set holds",
        details={
            "project_id": project_id, "commit": key.commit, "revision_key": revision_key,
            "bundle_key": served_by, "aliased": True, "generator_digest": generator.digest,
        },
    )


def _remove_superseded(run: _Run) -> None:
    """ADR §5: a revision's bundles of older generators go once a new one is stored."""

    superseded = rows.superseded_generators(run.project_id, run.revision_key, run.generator.digest)
    store.remove_other_generators(run.project_id, run.revision_key, run.generator.digest)
    rows.delete_bundles(run.project_id, superseded)


# ------------------------------------------------------------- end of job


def settle_design_bundle_end(job: Mapping[str, Any]) -> bool:
    """End hook: a bundle whose job ended without completing is marked failed with its error.

    A cancelled backfill build leaves no row: it was preempted by an
    interactive request, so the next tick or request queues it again rather
    than reading a failure (or waiting out the failed retry delay).
    """

    if job.get("status") not in ("failed", "cancelled"):
        return False
    payload = job.get("payload") or {}
    bundle_key, project_id = str(payload.get("bundle_key") or ""), str(payload.get("project_id") or "")
    found = rows.get_bundle(project_id, bundle_key) if bundle_key and project_id else None
    if not found or found["state"] not in ("queued", "building") or found.get("job_id") != str(job.get("id") or job.get("job_id")):
        return False
    if job.get("status") == "cancelled" and str(job.get("requested_by") or "") == BACKFILL_REQUESTED_BY:
        rows.delete_bundles(project_id, [bundle_key])
        return True
    rows.upsert_bundle(
        bundle_key=bundle_key, project_id=found["project_id"], revision_key=found["revision_key"],
        generator_digest=found["generator_digest"], commit=found.get("commit_sha"), state="failed",
        error=str(job.get("error_message") or job.get("status")),
    )
    event_log.record_quietly(
        "bundle.failed", project_id=project_id,
        payload={
            "commit": found.get("commit_sha"),
            "revisionKey": found["revision_key"],
            "reason": str(job.get("error_message") or job.get("status") or ""),
        },
    )
    return True


def _unsettled_bundles() -> list[str]:
    with rows.default_connect() as conn:
        found = conn.execute(
            """SELECT j.id FROM ws_design_bundles b JOIN ws_jobs j ON j.id = b.job_id
               WHERE b.state IN ('queued', 'building') AND j.status IN ('failed', 'cancelled')
               ORDER BY j.updated_at DESC LIMIT 100"""
        ).fetchall()
    return [str(item["id"]) for item in found]


DESIGN_BUNDLE = JobKind(
    KIND,
    run_design_bundle_job,
    # cli-spec.md §7.4: while legacy consumers still run, a bundle build also
    # holds one semantic_compile unit, sharing the legacy memory budget.
    # 2304 MiB is the measured prism-kicad parse peak (2.0-2.1 GiB) with a
    # small margin; the build must not share the worker with a Release Studio
    # build on the 7.75 GiB deployment (see job_kinds.memory_units).
    resources={
        "prism_worker": 1,
        "design_bundle": 1,
        "semantic_compile": 1,
        **memory_units(2304),
    },
    lock=repository_lock("read"),
    max_attempts=settings.PRISM_DESIGN_BUNDLE_MAX_ATTEMPTS,
    priority=150,
    settle=settle_design_bundle_end,
    orphans=_unsettled_bundles,
)
JOB_KINDS = (DESIGN_BUNDLE,)
