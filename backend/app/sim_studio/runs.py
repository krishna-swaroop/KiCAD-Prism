"""Simulation runs: submit a frozen setup, and the ``sim_run`` job that runs it.

The handler stages a workspace for prism-sim-studio's engine runner
(sim-adr-0003): it links the commit's design bundle in (``board_source``),
writes the frozen setup (pinned to that bundle) and a ``prism.sim.job`` for
the engine that runs the analysis's kind, then runs ``sim-worker`` and relays
its ``prism.sim.progress`` lines. The engine's ``prism.sim.result`` and
artifacts stay in the run's directory and are served from there; the meshes it
keeps for re-runs stay per project under ``sim/meshes``.
"""

from __future__ import annotations

import hashlib
import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Mapping, Optional

from app.core import errors
from app.core.config import settings
from app.services.job_kinds import JobKind, JobSubject, memory_units
from app.services.job_runtime import JobCancelled, JobContext, JobResult
from app.sim_studio import board_source, validation
from app.sim_studio.run_store import TERMINAL, RunStore, public
from app.sim_studio.service import canonical_sha256, parse_setup
from app.sim_studio.store import SetupStore

class SetupNotReady(errors.Invalid):
    code = "sim_setup_not_ready"


class BoardNotSimulatable(errors.Conflict):
    """The commit's board is not ready, or its schematic and board disagree."""

    code = "sim_board_not_ready"


def sim_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "sim"


def run_dir(run_id: str) -> Path:
    return sim_root() / "runs" / run_id


def mesh_cache_dir(project_id: str) -> Path:
    """Where engines keep a project's meshes for re-runs (``SimJob.mesh_cache_dir``)."""

    return sim_root() / "meshes" / project_id


def binary(name: str) -> Path:
    path = Path(settings.PRISM_SIM_BIN_DIR) / name
    if not path.is_file():
        raise RuntimeError(f"{name} is not installed in {settings.PRISM_SIM_BIN_DIR}")
    return path


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def engine_descriptors() -> list[dict[str, Any]]:
    """What the installed ``sim-worker`` reports; empty when it is not installed."""

    try:
        completed = subprocess.run([str(binary("sim-worker")), "engines"], capture_output=True, text=True,
                                   timeout=30, check=False)
        return list(json.loads(completed.stdout)) if completed.returncode == 0 else []
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired):
        return []


def engine_for(kind: str, descriptors: list[dict[str, Any]] | None = None) -> str:
    """The engine that runs analyses of ``kind``: the preferred one when it does, else the first that does."""

    descriptors = engine_descriptors() if descriptors is None else descriptors
    able = [str(item["id"]) for item in descriptors if kind in (item.get("analyses") or [])]
    if settings.PRISM_SIM_ENGINE in able:
        return settings.PRISM_SIM_ENGINE
    if not able:
        raise RuntimeError(f"no installed engine runs {kind} analyses")
    return able[0]


def _analysis_kind(setup: Mapping[str, Any], analysis_id: str) -> str:
    for item in setup.get("analyses") or []:
        if item.get("id") == analysis_id:
            return str(item.get("kind"))
    raise RuntimeError(f"the setup has no analysis {analysis_id!r}")


# ---------------------------------------------------------------------------
# Submit


def _require_board(project_id: str, commit: Optional[str], actor: str) -> None:
    """Refuse a run the engine could not start: no board yet, or schematic and board disagree."""

    state = board_source.board_state(project_id, commit, requested_by=actor)
    if state.state != "ready":
        raise BoardNotSimulatable(board_source.BoardNotReady(state.state, state.detail).args[0],
                                  code="sim_board_not_ready", board_state=state.state)
    if state.cross_check == "failed":
        raise BoardNotSimulatable(
            f"The schematic and the board disagree, so pads cannot be trusted to join the right nets: {state.first_error}",
            code="sim_board_cross_check_failed",
        )
    if state.cross_check == "skipped":
        raise BoardNotSimulatable("The project has no schematic, so its board cannot be cross-checked.",
                                  code="sim_board_no_schematic")


def submit(
    project: Any, setup_id: str, expected_revision: Optional[int], analysis_id: str, actor: str,
    facts_loader: Any, setups: SetupStore | None = None, runs: RunStore | None = None,
) -> dict[str, Any]:
    """Freeze the setup's current revision, preflight it, and queue one analysis."""

    setups = setups or SetupStore()
    runs = runs or RunStore()
    row = setups.read(str(project.id), setup_id)
    if expected_revision is not None and expected_revision != int(row["revision"]):
        from app.sim_studio.store import StaleSetup

        raise StaleSetup(setup_id, int(row["revision"]))
    setup = parse_setup(row["document"])
    if setup.document()["analyses"] and not any(item.id == analysis_id for item in setup.analyses):
        raise errors.Invalid(f"The setup has no analysis {analysis_id!r}.", code="sim_unknown_analysis")
    issues = validation.preflight(setup, facts_loader(project, row.get("source_commit")))
    report = validation.report("preflight", canonical_sha256(row["document"]), issues)
    if not report["ok"]:
        raise SetupNotReady("Preflight found errors; fix them before running.", report=report)
    _require_board(str(project.id), row.get("source_commit"), actor)
    run_id = runs.new_id()
    # The run exists before its job can be claimed: the handler's first act is
    # reading it. Its job id is filled in once the job is queued.
    created = runs.create({
        "run_id": run_id, "project_id": str(project.id), "setup_id": setup_id,
        "setup_revision": int(row["revision"]), "setup_sha256": report["setup_sha256"],
        "setup_document": row["document"], "analysis_id": analysis_id,
        "source_commit": row.get("source_commit"), "project_path": row["project_path"],
        "job_id": "", "created_by": actor,
    })
    try:
        job = SIM_RUN.enqueue(
            {"run_id": run_id, "project_id": str(project.id)},
            subject=JobSubject(project_id=str(project.id)),
            requested_by=actor,
        )
    except Exception:
        runs.update(run_id, status="failed", message="The run could not be queued")
        raise
    runs.update(run_id, job_id=str(job["job_id"]))
    return public({**created, "job_id": str(job["job_id"])})


# ---------------------------------------------------------------------------
# The job


def _stage(run: Mapping[str, Any], workspace: Path, log: list[str]) -> tuple[dict[str, Any], dict[str, str]]:
    """The run's job (written to ``job.json``) and the board staged for it."""

    inputs = workspace / "input"
    inputs.mkdir(parents=True, exist_ok=True)
    board = board_source.stage_board(run, inputs, log)
    bundle_sha = board["sha256"]
    setup = dict(run["setup_document"])
    setup["bundle"] = {**setup.get("bundle", {}), "sha256": bundle_sha}
    setup_bytes = json.dumps(setup, sort_keys=True, indent=2).encode("utf-8")
    (inputs / "setup.json").write_bytes(setup_bytes)
    job = {
        "schema": "prism.sim.job", "version": "a0", "job_id": str(run["job_id"]),
        "engine": {"id": engine_for(_analysis_kind(setup, str(run["analysis_id"])))},
        "bundle": {"path": board["path"], "sha256": bundle_sha},
        "setup": {"path": "input/setup.json", "sha256": hashlib.sha256(setup_bytes).hexdigest()},
        "analysis_id": str(run["analysis_id"]),
        "mesh_cache_dir": str(mesh_cache_dir(str(run["project_id"]))),
    }
    (workspace / "job.json").write_text(json.dumps(job, indent=2), encoding="utf-8")
    return job, board


def _relay(line: str, context: JobContext, log: list[str]) -> Optional[dict[str, Any]]:
    try:
        event = json.loads(line)
    except ValueError:
        log.append(line)
        return None
    kind = event.get("event")
    if kind == "stage":
        context.progress(stage=f"engine:{event.get('stage')}", message=f"Engine: {event.get('stage')}")
    elif kind == "progress":
        context.progress(percent=40 + 55 * float(event.get("fraction") or 0), message=str(event.get("message") or ""))
    elif kind in {"log", "failed"}:
        log.append(f"{kind}: {event.get('message')}")
    return event


class EngineTimeout(RuntimeError):
    """sim-worker ran past ``PRISM_SIM_TIMEOUT_SECONDS``."""


#: How often the run checks its deadline and cancellation while the engine is quiet.
_ENGINE_POLL_SECONDS = 1.0


def _run_engine(workspace: Path, context: JobContext, log: list[str]) -> Optional[dict[str, Any]]:
    """Runs sim-worker; returns its last event (``completed`` or ``failed``).

    The engine's output is pumped on a thread, so the deadline and
    cancellation hold while the engine is quiet or hung; on either the engine
    is killed and reaped. Events are relayed on this thread.
    """

    process = subprocess.Popen(
        [str(binary("sim-worker")), "run", str(workspace / "job.json")],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    lines: queue.Queue[Optional[str]] = queue.Queue()

    def pump() -> None:
        assert process.stdout is not None
        for raw in process.stdout:
            lines.put(raw)
        lines.put(None)

    threading.Thread(target=pump, name="sim-worker-output", daemon=True).start()
    deadline = time.monotonic() + settings.PRISM_SIM_TIMEOUT_SECONDS
    last = None
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise EngineTimeout(f"The engine ran past {settings.PRISM_SIM_TIMEOUT_SECONDS} s and was stopped")
            try:
                raw = lines.get(timeout=min(remaining, _ENGINE_POLL_SECONDS))
            except queue.Empty:
                context.check_cancelled()
                continue
            if raw is None:
                break
            if raw.strip():
                last = _relay(raw.strip(), context, log) or last
        try:
            process.wait(timeout=max(deadline - time.monotonic(), 0.1))
        except subprocess.TimeoutExpired:
            raise EngineTimeout(f"The engine ran past {settings.PRISM_SIM_TIMEOUT_SECONDS} s and was stopped") from None
    except BaseException:
        process.kill()
        process.wait()
        raise
    return last


def run_sim_job(context: JobContext, runs: RunStore | None = None) -> JobResult:
    runs = runs or RunStore()
    run = runs.read(str(context.payload["run_id"]))
    workspace = run_dir(str(run["run_id"]))
    shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True)
    log: list[str] = []
    runs.update(run["run_id"], status="running")
    try:
        context.progress(stage="bundle", message="Staging the board...", percent=5, force=True)
        job, board = _stage(run, workspace, log)
        runs.update(run["run_id"], bundle_sha256=job["bundle"]["sha256"], solved_commit=board.get("commit") or None)
        context.progress(stage="engine", message="Running the engine...", percent=40, force=True)
        last = _run_engine(workspace, context, log)
        result_path = workspace / "out" / "result.json"
        result = json.loads(result_path.read_text(encoding="utf-8")) if result_path.is_file() else None
        succeeded = bool(last and last.get("event") == "completed" and result and result.get("status") == "succeeded")
        message = "Completed" if succeeded else str((last or {}).get("message") or "The engine failed")
        runs.update(run["run_id"], status="succeeded" if succeeded else "failed", message=message, result=result)
        if not succeeded:
            raise RuntimeError(message)
        return JobResult(message="Simulation completed", details={"run_id": run["run_id"], "logs": log[-40:]})
    except JobCancelled:
        # A cancelled job must not settle the run as failed: settling never
        # rewrites a terminal row, so the run would read "failed" forever.
        runs.update(run["run_id"], status="cancelled", message="Cancelled")
        raise
    except Exception as exc:
        runs.update(run["run_id"], status="failed", message=str(exc)[:500])
        raise


def settle_run(job: Mapping[str, Any]) -> bool:
    status = str(job.get("status") or "")
    if status not in {"failed", "cancelled"}:
        return False
    RunStore().settle_job(str(job["job_id"]), status, str(job.get("error") or job.get("message") or status))
    return True


def _unsettled_runs() -> list[str]:
    return RunStore().unsettled_job_ids()


SIM_RUN = JobKind(
    "sim_run",
    run_sim_job,
    # The engine is a child process; 1024 MiB is an estimate (the sim slot
    # already runs one at a time; the weight keeps it from sharing a wave with
    # a bundle or release build on a small worker).
    resources={"prism_worker": 1, "sim": 1, **memory_units(1024)},
    max_attempts=1,
    settle=settle_run,
    orphans=_unsettled_runs,
)
JOB_KINDS = (SIM_RUN,)


# ---------------------------------------------------------------------------
# Reading results


def result_file(run: Mapping[str, Any], relative: str) -> Path:
    """A file the engine wrote, listed in the run's result (never an arbitrary path)."""

    listed = {artifact.get("path") for artifact in (run.get("result") or {}).get("artifacts", [])}
    if relative not in listed:
        raise errors.NotFound("No such result file")
    path = run_dir(str(run["run_id"])) / relative
    if not path.is_file():
        raise errors.NotFound("The result file is missing")
    return path


def materialization(run: Mapping[str, Any]) -> bytes:
    """The analytic pack the run ran on, so the viewer draws the exact geometry the engine solved."""

    return board_source.materialization(run)


__all__ = ["JOB_KINDS", "SIM_RUN", "TERMINAL", "materialization", "result_file", "submit"]
