"""How a Simulation Studio run gets its board (amendment V2 §4, parent ADR C6).

A run solves on the design bundle of its commit, as stored: ``sim-worker``
reads Prism's ``prism.bundle.manifest.a3`` archive directly, so the archive is
hard-linked into the run, not rebuilt (the reference branch built its own
bundle per commit, 223 s on a 12-layer board). The board stage must have
materialized the board; the engine itself refuses a bundle whose schematic and
board disagree, and :func:`board_state` lets submit say so first.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from app.core.file_digest import sha256_file
from app.services.design_bundle import reader, store
from app.services.design_bundle.archive import open_archive

MATERIALIZATION = "materialization/board.kmpack"
#: Where the staged bundle sits in a run's workspace.
INPUT = "input/board.prism"


class BoardNotReady(RuntimeError):
    """The commit's design bundle has no materialized board (yet)."""

    def __init__(self, state: str, detail: str) -> None:
        super().__init__(_explain(state, detail))
        self.state = state


def _explain(state: str, detail: str) -> str:
    if state == "pending":
        return "The board's design data for this commit is still being prepared; run again when it is ready."
    suffix = f" ({detail})" if detail else ""
    return f"The board's design data for this commit is {state}{suffix}."


@dataclass(frozen=True)
class BoardState:
    """Whether a commit's board can be simulated: ``state`` is ``ready`` or a readiness state."""

    state: str
    detail: str = ""
    #: ``passed``, ``passed-with-warnings``, ``failed`` or ``skipped``; None before the board stage.
    cross_check: str | None = None
    first_error: str = ""


def _opened(project_id: str, commit: str | None, *, queue: bool, requested_by: str = "") -> reader.OpenedRevision:
    return reader.open_revision(project_id, commit or None, queue=queue, requested_by=requested_by)


def board_state(project_id: str, commit: str | None, *, requested_by: str = "") -> BoardState:
    """The commit's board readiness, queuing its design bundle when it is not built yet."""

    opened = _opened(project_id, commit, queue=True, requested_by=requested_by)
    answer = opened.readiness([MATERIALIZATION])[MATERIALIZATION]
    if answer.state != "ready" or opened.archive is None:
        return BoardState(answer.state, answer.detail)
    check = opened.archive.manifest["stages"]["board"].get("cross_check") or {}
    errors = check.get("errors") or []
    first = f"{errors[0].get('code')}: {errors[0].get('message')}" if errors else ""
    return BoardState("ready", cross_check=check.get("status"), first_error=first)


def _place(source: Path, target: Path) -> None:
    """Hard-link ``source`` to ``target`` (a copy across file systems)."""

    target.unlink(missing_ok=True)
    try:
        os.link(source, target)
    except OSError:
        shutil.copyfile(source, target)


def stage_board(run: Mapping[str, Any], inputs_dir: Path, log: list[str]) -> dict[str, str]:
    """Place the run's design bundle in ``inputs_dir``; return its ``path`` and ``sha256`` for the job,
    and the ``commit`` it was built for (the run's own, or the branch head it resolved to)."""

    opened = _opened(str(run["project_id"]), run.get("source_commit"), queue=True)
    answer = opened.readiness([MATERIALIZATION])[MATERIALIZATION]
    if answer.state != "ready" or opened.archive is None:
        raise BoardNotReady(answer.state, answer.detail)
    stored_as = opened.archive_revision_key or opened.revision_key
    assert stored_as is not None
    source = store.archive_path(opened.project_id, stored_as, opened.generator_digest)
    target = inputs_dir / Path(INPUT).name
    _place(source, target)
    log.append(f"board: design bundle {opened.bundle_key} (revision {opened.revision_key})")
    return {"path": INPUT, "sha256": sha256_file(target), "commit": opened.commit or ""}


def materialization(run: Mapping[str, Any]) -> bytes:
    """The analytic pack the run solved: the member of the bundle staged into it."""

    from app.sim_studio.runs import run_dir

    staged = run_dir(str(run["run_id"])) / INPUT
    if not staged.is_file():
        raise FileNotFoundError("the run's board is no longer kept")
    return open_archive(staged).read(MATERIALIZATION)
