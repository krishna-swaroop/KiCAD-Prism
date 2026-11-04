"""The paced backfill and prebuild of bundles (ADR §8, first deploy; G7; amendments U §3.3, K2).

The prism worker calls :func:`tick` every
``PRISM_DESIGN_BUNDLE_BACKFILL_INTERVAL_SECONDS``. The prebuild keeps warm the
commits :func:`reuse.prebuild_commits` lists: branch heads, each branch's
newest ``PRISM_DESIGN_BUNDLE_PREBUILD_COMMITS`` commits along the first
parent, and every tagged commit. For a commit with no bundle and no alias the
tick keys it (one ``git ls-tree``), then:

- aliases it to a stored bundle whose read set holds (``prism-kicad bundle
  reuse``, no build; K2 §3.3);
- otherwise queues its build while the ``design_bundle`` slot has room:
  ``PRISM_DESIGN_BUNDLE_CONCURRENCY`` builds queued or running at once, so a
  worker given more slots builds that many in parallel. An interactive
  request preempts a queued or running backfill build, which leaves no bundle
  row behind so the next tick queues it again.

A tick takes every project's checked-out HEAD, in id order, before any older
commit, so after a generator change each project gets its HEAD bundle first.
Older commits follow round robin from the project after the one whose build
was queued last; the cursor moves only past projects the tick walked to the
end. A full slot keys nothing it could not queue, and a commit already served,
recorded absent or unkeyable is not keyed again.

On the way it records what keying found about each project's HEAD
(``ws_design_bundle_flags``): a board or root schematic that no longer
resolves now that files are attributed by anchor only, an invalid committed
``.prism.json``, or an anchor missing from the tree. It flags; it never picks
a file (decisions.md, revision key item 7). A HEAD is keyed for its flags again
only when the commit or the project's paths change.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from app.core.config import settings
from app.services import kicad_libraries
from app.services.design_bundle import cli, jobs, reader, reuse, rows
from app.services.design_bundle.effective_config import ProjectRef, key_at_commit
from app.services.design_bundle.revision_key import RevisionKeyError

logger = logging.getLogger(__name__)

#: Most commits keyed in one tick, so a tick stays short on a large workspace.
MAX_KEYS_PER_TICK = 25


@dataclass
class BackfillState:
    """What the worker keeps between ticks.

    ``cursor`` is the project after which the older-commit pass starts;
    ``heads`` the HEAD and paths each project was last keyed for its flags;
    ``unkeyable`` the commits whose keying failed, under those paths.
    """

    cursor: str = ""
    queued: list[str] = field(default_factory=list)
    heads: dict[str, tuple[str, str]] = field(default_factory=dict)
    unkeyable: set[tuple[str, str, str]] = field(default_factory=set)
    # Per project, the HEAD and the KiCad libraries bound when its models were last checked against them.
    libraries: dict[str, tuple[str, tuple[tuple[str, str], ...]]] = field(default_factory=dict)


@dataclass
class _Tick:
    generator: Any
    work: Path
    outcome: dict[str, Any]
    state: BackfillState
    free: int
    connect: rows.Connect | None

    @property
    def busy(self) -> bool:
        return self.free <= 0

    def budget_left(self) -> bool:
        return self.outcome["keyed"] < MAX_KEYS_PER_TICK


def head_commit(repo: Path) -> str | None:
    process = subprocess.run(["git", "-C", str(repo), "rev-parse", "--verify", "HEAD^{commit}"], capture_output=True, text=True, check=False)
    return process.stdout.strip() if process.returncode == 0 else None


def repo_of(project: Mapping[str, Any]) -> Path:
    from app.services.workspace_service import workspace

    return Path(workspace._abs_clone_path(str(project["clone_path"])))


def tick(state: BackfillState, *, connect: rows.Connect | None = None) -> dict[str, Any]:
    """One paced step. Returns what it did (for logs and tests)."""

    outcome: dict[str, Any] = {"queued": None, "builds": [], "keyed": 0, "reused": [], "flagged": {}}
    if not settings.PRISM_DESIGN_BUNDLE_AUTO_BUILD or settings.PRISM_DESIGN_BUNDLE_BACKFILL_INTERVAL_SECONDS <= 0:
        outcome["skipped"] = "disabled"
        return outcome
    try:
        generator = cli.generator()
    except (cli.CliUnavailable, cli.CliFailure) as error:
        outcome["skipped"] = f"prism-kicad unavailable: {error}"
        return outcome
    free = settings.PRISM_DESIGN_BUNDLE_CONCURRENCY - rows.active_jobs(jobs.KIND, connect=connect)
    if free <= 0:
        outcome["busy"] = "every design_bundle slot is taken"
    projects = rows.projects(connect=connect)
    if not projects:
        return outcome
    with tempfile.TemporaryDirectory(prefix="prism-bundle-reuse-") as work:
        run = _Tick(generator, Path(work), outcome, state, free, connect)
        heads = {str(project["id"]): _head_pass(project, run) for project in projects if run.budget_left()}
        if not run.busy and run.budget_left():
            _older_pass(projects, heads, run)
    return outcome


def _paths(project: Mapping[str, Any]) -> str:
    """What keying reads from the project row besides the commit."""

    return repr((project.get("relative_path"), project.get("project_file_rel"), project.get("path_settings")))


def _head_pass(project: Mapping[str, Any], run: _Tick) -> str | None:
    """Key the project's HEAD when it or the paths changed (its flags) or when it needs a build; returns HEAD."""

    project_id = str(project["id"])
    repo = repo_of(project)
    head = head_commit(repo)
    if head is None:
        return None
    seen = (head, _paths(project))
    stale = run.state.heads.get(project_id) != seen
    if not stale and (run.busy or reuse.is_served(project_id, head, run.generator, connect=run.connect)):
        if not run.busy and run.budget_left():
            _refresh_models(project_id, head, run)
        return head
    run.state.heads[project_id] = seen
    _commit(project, repo, head, run, head=True)
    return head


def _refresh_models(project_id: str, head: str, run: _Tick) -> None:
    """Export a served HEAD's parts again when a KiCad library its board uses changed since they were.

    Only HEAD is refreshed ahead of a request; older commits refresh when someone
    opens them. A HEAD is looked at again only when it or the bound libraries
    changed, so a tick with nothing new costs nothing. Runs under the same slot
    cap and priority as a build, and an interactive request preempts it.
    """

    bound = kicad_libraries.current().bindings
    if not bound:
        return
    seen = (head, tuple(sorted((name, binding.fingerprint) for name, binding in bound.items())))
    if run.state.libraries.get(project_id) == seen:
        return
    run.state.libraries[project_id] = seen
    run.outcome["keyed"] += 1
    try:
        opened = reader.open_revision(project_id, head)
        if not reader.models_outdated(opened):
            return
        job_id = reader.refresh_models(
            opened, requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY, head=True
        )
    except (LookupError, cli.CliUnavailable, cli.CliFailure):
        return
    if job_id:
        run.outcome["refreshed"] = [*run.outcome.get("refreshed", []), {"project_id": project_id, "commit": head, "job_id": job_id}]
        run.state.queued.append(job_id)
        run.free -= 1


def _older_pass(projects: list[Mapping[str, Any]], heads: Mapping[str, str | None], run: _Tick) -> None:
    """Older commits round robin, one build per project, from the project after the cursor, until the slot is full."""

    start = next((i for i, project in enumerate(projects) if str(project["id"]) > run.state.cursor), 0)
    for project in projects[start:] + projects[:start]:
        project_id = str(project["id"])
        repo = repo_of(project)
        for commit in reuse.prebuild_commits(repo):
            if commit == heads.get(project_id) or reuse.is_served(project_id, commit, run.generator, connect=run.connect):
                continue
            if not run.budget_left():
                return  # the cursor stays: the next tick resumes this project
            if _commit(project, repo, commit, run, head=False):
                break  # one build per project, then the next project
        run.state.cursor = project_id
        if run.busy:
            return


def _commit(project: Mapping[str, Any], repo: Path, commit: str, run: _Tick, *, head: bool) -> bool:
    """Key one commit, then alias it to a stored bundle or queue its build when the slot has room.

    Returns whether a build was queued.
    """

    project_id = str(project["id"])
    unkeyable = (project_id, commit, _paths(project))
    if unkeyable in run.state.unkeyable:
        return False
    run.outcome["keyed"] += 1
    try:
        key = key_at_commit(repo, ProjectRef.from_row(project), commit)
    except RevisionKeyError as error:
        logger.warning("Backfill could not key %s@%s: %s", project_id, commit, error)
        run.state.unkeyable.add(unkeyable)
        return False
    if head:
        found = jobs.flags_of(key)
        rows.set_flags(project_id, commit, found, connect=run.connect)
        if found:
            run.outcome["flagged"][project_id] = sorted(found)
    if key.absent:
        rows.record_absence(project_id, commit, str(key.absent_project_file), connect=run.connect)
        return False
    revision_key = key.key.revision_key  # type: ignore[union-attr]
    rows.index_key(project_id, commit, key.key.config_digest, revision_key, connect=run.connect)  # type: ignore[union-attr]
    existing = rows.get_bundle(project_id, run.generator.bundle_key(revision_key), connect=run.connect)
    if existing and existing["state"] in ("complete", "queued", "building", "failed"):
        return False  # stored, on its way, or failed (retried on the next sync or request)
    if rows.get_alias(project_id, revision_key, run.generator.digest, connect=run.connect):
        return False
    served_by = reuse.try_reuse(project_id, repo, key, run.generator, run.work / commit, connect=run.connect)
    if served_by:
        run.outcome["reused"].append({"project_id": project_id, "commit": commit, "bundle_key": served_by})
        return False
    if run.busy:
        return False
    job_id = jobs.start_design_bundle_job(
        project_id, commit=commit, requested_by=jobs.BACKFILL_REQUESTED_BY, priority=jobs.BACKFILL_PRIORITY, head=head
    )
    if not job_id:
        return False
    queued = {"project_id": project_id, "commit": commit, "job_id": job_id}
    run.outcome["queued"] = run.outcome["queued"] or queued
    run.outcome["builds"].append(queued)
    run.state.queued.append(job_id)
    run.free -= 1
    return True
