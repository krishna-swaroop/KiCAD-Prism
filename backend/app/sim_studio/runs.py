"""Simulation runs: submit a frozen setup, and the ``sim_run`` job that runs it.

The handler stages a workspace for prism-sim-studio's engine runner
(sim-adr-0003): it materializes the project revision, builds or reuses the
``.prism`` bundle with ``prism-bundle``, writes the frozen setup (pinned to
that bundle) and a ``prism.sim.job``, then runs ``sim-worker`` and relays its
``prism.sim.progress`` lines. The engine's ``prism.sim.result`` and artifacts
stay in the run's directory and are served from there.
"""

from __future__ import annotations

import contextlib
import functools
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Iterator, Mapping, Optional

from app.core import errors
from app.core.config import settings
from app.services import project_revision
from app.services.job_kinds import JobKind, JobSubject
from app.services.job_runtime import JobContext, JobResult
from app.sim_studio import validation
from app.sim_studio.run_store import TERMINAL, RunStore, public
from app.sim_studio.service import canonical_sha256, parse_setup
from app.sim_studio.store import SetupStore

MATERIALIZATION_MEMBER = "materialization/board.kmpack"


class SetupNotReady(errors.Invalid):
    code = "sim_setup_not_ready"


def sim_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "sim"


def run_dir(run_id: str) -> Path:
    return sim_root() / "runs" / run_id


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


# ---------------------------------------------------------------------------
# Submit


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
    run_id = runs.new_id()
    job = SIM_RUN.enqueue(
        {"run_id": run_id, "project_id": str(project.id)},
        subject=JobSubject(project_id=str(project.id)),
        requested_by=actor,
    )
    return public(runs.create({
        "run_id": run_id, "project_id": str(project.id), "setup_id": setup_id,
        "setup_revision": int(row["revision"]), "setup_sha256": report["setup_sha256"],
        "setup_document": row["document"], "analysis_id": analysis_id,
        "source_commit": row.get("source_commit"), "project_path": row["project_path"],
        "job_id": str(job["job_id"]), "created_by": actor,
    }))


# ---------------------------------------------------------------------------
# The job


@contextlib.contextmanager
def _project_sources(run: Mapping[str, Any]) -> Iterator[Path]:
    """The project directory at the run's revision (a private checkout, or the working copy)."""

    location = project_revision.locate_id(str(run["project_id"]))
    if run.get("source_commit"):
        with project_revision.checkout(
            location, str(run["source_commit"]), source_set=project_revision.COMPARE_INPUTS, prefix="sim-run-",
        ) as revision:
            yield revision.project_dir
    else:
        yield location.checkout


def _build_bundle(project_file: Path, target: Path, log: list[str]) -> None:
    """``prism-bundle build`` into ``target``, refilling zones with the worker's kicad-cli."""

    from app.services.kicad_tools import locate_kicad_cli

    command = [str(binary("prism-bundle")), "build", str(project_file), "-o", str(target)]
    cli = locate_kicad_cli()
    command += ["--kicad-cli", cli] if cli else ["--no-refill"]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=900, check=False)
    log.extend(line for line in (completed.stdout + completed.stderr).splitlines() if line.strip())
    if completed.returncode != 0:
        # Report from the first error line on; progress lines before it are in the log.
        lines = [line for line in (completed.stderr or completed.stdout).strip().splitlines() if line.strip()]
        first = next((i for i, line in enumerate(lines) if line.lower().startswith("error")), 0)
        shown = lines[first:first + 8]
        more = len(lines) - first - len(shown)
        raise RuntimeError("prism-bundle failed: " + "\n".join(shown) + (f"\n... and {more} more line(s) in the job log" if more > 0 else ""))


#: Bundles kept for reuse; the oldest beyond this are removed.
BUNDLE_CACHE_SIZE = 20


def bundle_cache_dir() -> Path:
    return sim_root() / "bundle-cache"


@functools.lru_cache(maxsize=4)
def _tool_identity(cli: Optional[str]) -> str:
    """What else decides a bundle: the prism-bundle binary and the kicad-cli that refills zones."""

    parts = [_sha256_file(binary("prism-bundle"))]
    if cli:
        completed = subprocess.run([cli, "version"], capture_output=True, text=True, timeout=60, check=False)
        parts.append(f"{cli}:{completed.stdout.strip()}")
    else:
        parts.append("no-refill")
    return "|".join(parts)


def bundle_key(project_file: Path, cli: Optional[str]) -> str:
    """The bundle's inputs: the project, board and rules files, every schematic under the
    project (a superset of the sheets the build reaches), and the tools."""

    directory, stem = project_file.parent, project_file.stem
    files = [directory / f"{stem}.{suffix}" for suffix in ("kicad_pro", "kicad_pcb", "kicad_dru")]
    files += sorted(directory.rglob("*.kicad_sch"))
    hasher = hashlib.sha256(_tool_identity(cli).encode("utf-8"))
    for path in files:
        if not path.is_file():
            continue
        hasher.update(f"\0{path.relative_to(directory).as_posix()}\0".encode("utf-8"))
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                hasher.update(chunk)
    return hasher.hexdigest()


def _cached_bundle(project_file: Path, target: Path, log: list[str]) -> None:
    """Build the bundle, or reuse one built from the same sources with the same tools.

    The build is dominated by KiCad's zone refill (minutes on large boards) and depends
    only on the key's inputs, so runs of one revision share it.
    """

    from app.services.kicad_tools import locate_kicad_cli

    cache = bundle_cache_dir()
    key = bundle_key(project_file, locate_kicad_cli())
    cached = cache / f"{key}.prism"
    if cached.is_file():
        log.append(f"bundle cache hit {key[:12]}")
        try:
            target.hardlink_to(cached)
        except OSError:
            shutil.copyfile(cached, target)
        os.utime(cached)
        return
    _build_bundle(project_file, target, log)
    cache.mkdir(parents=True, exist_ok=True)
    partial = cache / f".{key}.{os.getpid()}.partial"
    shutil.copyfile(target, partial)
    os.replace(partial, cached)
    for stale in sorted(cache.glob("*.prism"), key=lambda path: path.stat().st_mtime, reverse=True)[BUNDLE_CACHE_SIZE:]:
        stale.unlink(missing_ok=True)


def _stage(run: Mapping[str, Any], workspace: Path, log: list[str]) -> dict[str, Any]:
    inputs = workspace / "input"
    inputs.mkdir(parents=True, exist_ok=True)
    with _project_sources(run) as project_dir:
        project_file = project_dir / Path(str(run["project_path"])).name
        if not project_file.is_file():
            raise RuntimeError(f"{project_file.name} is not in the project at this revision")
        with tempfile.TemporaryDirectory(prefix="sim-bundle-") as scratch:
            built = Path(scratch) / "board.prism"
            _cached_bundle(project_file, built, log)
            shutil.move(str(built), inputs / "board.prism")
    bundle_sha = _sha256_file(inputs / "board.prism")
    setup = dict(run["setup_document"])
    setup["bundle"] = {**setup.get("bundle", {}), "sha256": bundle_sha}
    setup_bytes = json.dumps(setup, sort_keys=True, indent=2).encode("utf-8")
    (inputs / "setup.json").write_bytes(setup_bytes)
    job = {
        "schema": "prism.sim.job", "version": "a0", "job_id": str(run["job_id"]),
        "engine": {"id": settings.PRISM_SIM_ENGINE},
        "bundle": {"path": "input/board.prism", "sha256": bundle_sha},
        "setup": {"path": "input/setup.json", "sha256": hashlib.sha256(setup_bytes).hexdigest()},
        "analysis_id": str(run["analysis_id"]),
    }
    (workspace / "job.json").write_text(json.dumps(job, indent=2), encoding="utf-8")
    return job


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


def _run_engine(workspace: Path, context: JobContext, log: list[str]) -> Optional[dict[str, Any]]:
    """Runs sim-worker; returns its last event (``completed`` or ``failed``)."""

    process = subprocess.Popen(
        [str(binary("sim-worker")), "run", str(workspace / "job.json")],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    last = None
    assert process.stdout is not None
    for raw in process.stdout:
        if raw.strip():
            last = _relay(raw.strip(), context, log) or last
    process.wait(timeout=settings.PRISM_SIM_TIMEOUT_SECONDS)
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
        context.progress(stage="bundle", message="Building the simulation bundle...", percent=5, force=True)
        job = _stage(run, workspace, log)
        runs.update(run["run_id"], bundle_sha256=job["bundle"]["sha256"])
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
    resources={"prism_worker": 1, "sim": 1},
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
    """The run's bundle materialization, so the viewer draws the exact geometry the engine solved."""

    bundle = run_dir(str(run["run_id"])) / "input" / "board.prism"
    if not bundle.is_file():
        raise errors.NotFound("The run has no bundle")
    with zipfile.ZipFile(bundle) as archive:
        return archive.read(MATERIALIZATION_MEMBER)


__all__ = ["JOB_KINDS", "SIM_RUN", "TERMINAL", "materialization", "result_file", "submit"]
