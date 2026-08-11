#!/usr/bin/env python3
"""Benchmark a cold Design Comparison build without the Prism API server.

The command uses an isolated cache by default, then writes a structured JSON
timeline suitable for comparing revisions of Prism and kicad-monkey.  Pass
``--warm`` to immediately repeat the revision phase against the populated
cache and quantify cache-read latency separately.

``--repeat N`` runs the whole cold pipeline N times, each against its own
cache, and rolls the runs up into a per-stage table with the median and the
band between runs.  That table is the M0 baseline of the Design Comparison
revamp: no later milestone's numbers mean anything until the *current*
pipeline can be measured repeatably, so the script reports two verdicts.

Determinism is the hard one.  Change counts, object counts and serialized
sizes are pure functions of the commit pair, so any drift between two runs is
a bug and exits non-zero -- that is what stops a later milestone looking
faster because it quietly produced a different answer.

Timing is reported as a band, not asserted.  Measured on the reference host,
cold-run stage times vary by 12-30% peak to peak on identical input, with CPU
time tracking wall clock almost exactly; that is real work variance and host
state, not scheduler noise, and no amount of harness care removes it.  So
milestone comparisons should use the median of several runs and count an
improvement only when it clears that band.  ``--strict-timing`` restores a
hard failure against ``--tolerance-pct`` for anyone measuring on a quiet host.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable


# Hash randomisation is a measurable term in this pipeline, not a curiosity:
# pinning it took the netlist compile's run-to-run spread from 29.9% to 1.1%.
# It has to be set before the interpreter starts, so re-exec once if the
# caller did not set it.
if os.environ.get("PYTHONHASHSEED") is None:
    os.environ["PYTHONHASHSEED"] = "0"
    os.execv(sys.executable, [sys.executable, *sys.argv])


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = (
    REPOSITORY_ROOT
    if (REPOSITORY_ROOT / "app").is_dir()
    else REPOSITORY_ROOT / "backend"
)
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import design_compare_service, semantic_index_service  # noqa: E402
from app.services.design_compare_benchmark import DesignCompareBenchmark  # noqa: E402


SCHEMA = "prism.design_compare_baseline_m0"


def _git(repo: Path, *arguments: str) -> str:
    process = subprocess.run(
        ["git", "-C", str(repo), *arguments],
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        raise SystemExit(process.stderr.strip() or "git command failed")
    return process.stdout.strip()


def _resolve_project(project_file: Path) -> tuple[Path, str | None]:
    repo = Path(_git(project_file.parent, "rev-parse", "--show-toplevel"))
    try:
        relative_parent = project_file.parent.relative_to(repo)
    except ValueError as exc:
        raise SystemExit(f"Project is outside its Git repository: {project_file}") from exc
    relative_path = relative_parent.as_posix()
    return repo, None if relative_path == "." else relative_path


def _snapshot_stats(root: Path) -> dict[str, int]:
    files = [path for path in root.rglob("*") if path.is_file()]
    return {
        "files": len(files),
        "bytes": sum(path.stat().st_size for path in files),
        "schematics": sum(path.suffix == ".kicad_sch" for path in files),
        "boards": sum(path.suffix == ".kicad_pcb" for path in files),
    }


def _encoded_bytes(payload: Any) -> int:
    """Serialized size, in the same compact encoding the cache writes."""

    return len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def _revision_artifact(cache_dir: Path, revision: dict[str, Any]) -> dict[str, Any]:
    """What one cached revision costs on disk after the parser cutover."""

    semantic = revision.get("semantic") or {}
    revision_json = cache_dir / "revision.json"
    initial_json = cache_dir / "initial.json"
    total_bytes = _encoded_bytes(revision)
    return {
        "revisionJsonBytes": revision_json.stat().st_size if revision_json.exists() else None,
        "initialJsonBytes": initial_json.stat().st_size if initial_json.exists() else None,
        "encodedBytes": total_bytes,
        "geometryBytes": 0,
        "geometrySharePct": 0,
        "objects": {
            "schematicGeometry": 0,
            "pcbGeometry": 0,
            "semanticComponents": len(semantic.get("components") or []),
            "semanticNets": len(semantic.get("nets") or []),
            "semanticTerminals": len(semantic.get("terminals") or []),
            "semanticSheetInstances": len(semantic.get("sheetInstances") or []),
            "semanticBuses": len(semantic.get("buses") or []),
            "bomRows": len(revision.get("bom_rows") or []),
            "sources": len(revision.get("sources") or []),
        },
    }


def _document_diff_stats(result: dict[str, Any]) -> dict[str, Any]:
    """Size and change-id health of the artifact the viewer actually consumes.

    ``uniqueChangeIds`` against ``changeEntries`` is the inflation ratio the
    Phase 0B measurement tracked: a reused hierarchical sheet shares symbol
    UUIDs across its instances, so ids that omit the sheet instance path
    collapse distinct components onto one entry.
    """

    document_diff = result.get("document_diff") or {}
    documents = (document_diff.get("project") or {}).get("documents") or []
    entries = 0
    unique: set[tuple[str, str, str]] = set()
    duplicate_targets = 0
    bbox_fields = 0
    zero_bboxes = 0

    def walk(document_path: str, changes: list[dict[str, Any]]) -> None:
        # A change and its retained-reference children are separate entries,
        # so the walk has to descend when checking identity and bbox fields.
        nonlocal entries, bbox_fields, zero_bboxes, duplicate_targets
        for change in changes:
            entries += 1
            key = (
                document_path,
                str(change.get("id")),
                str(change.get("sourceSide")),
            )
            if key in unique:
                duplicate_targets += 1
            unique.add(key)
            if change.get("bbox") is not None:
                bbox_fields += 1
                if change.get("bbox") == [0, 0, 0, 0]:
                    zero_bboxes += 1
            walk(document_path, change.get("children") or [])

    for document in documents:
        walk(str(document.get("path") or ""), document.get("changes") or [])
    return {
        "encodedBytes": _encoded_bytes(document_diff),
        "documents": len(documents),
        "changeEntries": entries,
        "uniqueChangeIds": len(unique),
        "inflation": round(entries / len(unique), 4) if unique else None,
        "duplicateChangeTargets": duplicate_targets,
        "bboxFields": bbox_fields,
        "zeroBboxes": zero_bboxes,
        "navigationEntries": len(document_diff.get("navigation") or {}),
        "diagnostics": len(document_diff.get("diagnostics") or []),
    }


def _normalized_scope(scope: str) -> str:
    """Collapse ``revision:<sha>:initial`` down to ``revision.initial``.

    Two revisions build concurrently, so a stage row has to aggregate over
    commits; keeping the sha in the key would make every run's table
    unjoinable with every other run's.
    """

    parts = scope.split(":")
    if parts and parts[0] == "revision":
        return ".".join(["revision", *parts[2:]])
    return scope.replace(":", ".")


def _stage_rows(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """One row per pipeline stage.

    Both ``sumMs`` and ``maxMs`` are kept. The revision stages run in parallel
    workers, so the sum is the work done and the max is that stage's share of
    the critical path; reporting only one of them misleads in one direction or
    the other.
    """

    rows: dict[str, dict[str, Any]] = {}
    for event in payload.get("events") or []:
        if event.get("elapsedMs", 0) <= 0 and event.get("status") == "ok":
            # marks (cache hits) carry no duration; they are recorded in the
            # raw timeline but would only add zero rows to the table.
            continue
        key = f"{_normalized_scope(str(event.get('scope')))}.{event.get('phase')}"
        row = rows.setdefault(
            key,
            {"occurrences": 0, "sumMs": 0.0, "maxMs": 0.0, "cpuMs": 0.0},
        )
        row["occurrences"] += 1
        row["sumMs"] = round(row["sumMs"] + float(event.get("elapsedMs") or 0.0), 3)
        row["maxMs"] = max(row["maxMs"], float(event.get("elapsedMs") or 0.0))
        row["cpuMs"] = round(row["cpuMs"] + float(event.get("cpuMs") or 0.0), 3)
    return rows


def _spread_pct(values: list[float]) -> float | None:
    """Peak-to-peak spread as a percentage of the median.

    The median rather than the mean, because it is also the statistic
    milestone comparisons should quote and the two should share a
    denominator.
    """

    if len(values) < 2:
        return None
    middle = statistics.median(values)
    if middle <= 0:
        return None
    return round((max(values) - min(values)) * 100 / middle, 2)


def _trimmed_band_pct(values: list[float]) -> float | None:
    """Peak-to-peak after discarding the fastest and slowest run.

    Five runs of input A came in at 20.4, 19.2, 20.2, 19.3 and 14.1 s. The
    raw spread is 33%, driven entirely by the one run that happened to catch
    a quiet host; the other four sit inside 6%. Peak-to-peak therefore
    describes the tail rather than the measurement, so the band a milestone
    must clear is quoted after trimming. Needs five runs to mean anything.
    """

    if len(values) < 5:
        return None
    trimmed = sorted(values)[1:-1]
    return _spread_pct(trimmed)


def _determinism(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Outputs that must be *identical*, not merely close.

    A timing gate alone cannot tell an improvement from a pipeline that
    quietly produced a different answer. Change counts, artifact sizes and the
    change-id inflation ratio are pure functions of the inputs, so any drift
    between two runs of the same commit pair is a bug, not noise.
    """

    def fingerprint(run: dict[str, Any]) -> dict[str, Any]:
        document_diff = run["artifacts"]["documentDiff"]
        return {
            "counts": {
                key: run["summary"][key]
                for key in ("schematicChanges", "pcbChanges", "bomChanges")
            },
            "documentDiff": {
                key: value
                for key, value in document_diff.items()
                if key != "encodedBytes"
            },
            "objects": {
                revision: artifact["objects"]
                for revision, artifact in run["artifacts"]["revisions"].items()
            },
        }

    fingerprints = [fingerprint(run) for run in runs]
    first = fingerprints[0]
    divergent = [
        key
        for key in first
        if any(other[key] != first[key] for other in fingerprints[1:])
    ]

    # Serialized size is *nearly* deterministic: identical object counts, a
    # handful of bytes apart. That is float repr drift in coordinates, not a
    # different answer, so it is reported with its own spread rather than
    # failing the run.
    sizes: dict[str, list[int]] = {}
    for run in runs:
        for revision, artifact in run["artifacts"]["revisions"].items():
            sizes.setdefault(revision, []).append(int(artifact["encodedBytes"]))
        sizes.setdefault("documentDiff", []).append(
            int(run["artifacts"]["documentDiff"]["encodedBytes"])
        )
    byte_jitter = {
        key: {
            "bytes": values,
            "spreadPct": _spread_pct([float(value) for value in values]),
        }
        for key, values in sizes.items()
    }

    return {
        "fingerprint": first,
        "divergent": divergent,
        "byteJitter": byte_jitter,
        "pass": not divergent,
    }


def _reproducibility(
    runs: list[dict[str, Any]],
    *,
    floor_pct: float,
    tolerance_pct: float,
) -> dict[str, Any]:
    """Do consecutive cold runs agree closely enough to trust later deltas?

    Only stages worth at least ``floor_pct`` of total wall clock are gated.
    That threshold is deliberately a *share of the headline number* rather
    than an absolute duration: the gate exists so a later milestone's claimed
    improvement can be told apart from noise, and a stage too small to move
    the total cannot invalidate such a claim however erratic it is. Sub-second
    stages here swing by more than 100% run to run in both directions, which
    is GC landing inside one span or another in a process holding two 32 MB
    revision payloads — real, but not something a milestone will be judged on.
    """

    totals = [float(run["summary"]["totalReadyMs"]) for run in runs]
    total_median = statistics.median(totals)
    floor_ms = total_median * floor_pct / 100

    keys = sorted({key for run in runs for key in run["stages"]})
    stages: list[dict[str, Any]] = []
    for key in keys:
        wall = [
            float((run["stages"].get(key) or {}).get("sumMs") or 0.0) for run in runs
        ]
        cpu = [
            float((run["stages"].get(key) or {}).get("cpuMs") or 0.0) for run in runs
        ]
        median = statistics.median(wall)
        gated = median >= floor_ms and all(value > 0 for value in wall)
        spread = _trimmed_band_pct(wall)
        if spread is None:
            spread = _spread_pct(wall)
        stages.append(
            {
                "stage": key,
                "runsMs": [round(value, 3) for value in wall],
                "medianMs": round(median, 3),
                "rawSpreadPct": _spread_pct(wall),
                "cpuMedianMs": round(statistics.median(cpu), 3),
                # CPU and wall spread differing would mean the noise is
                # scheduling; measured, they track each other, which is what
                # makes the band real rather than an artefact of the host.
                "cpuSpreadPct": _trimmed_band_pct(cpu) or _spread_pct(cpu),
                "sharePct": (
                    round(median * 100 / total_median, 2) if total_median else None
                ),
                "spreadPct": spread,
                "gated": gated,
                "withinTolerance": (
                    (not gated) or spread is None or spread <= tolerance_pct
                ),
            }
        )
    total_spread = _trimmed_band_pct(totals) or _spread_pct(totals)
    outside = [stage for stage in stages if not stage["withinTolerance"]]
    gated_spreads = [
        stage["spreadPct"]
        for stage in stages
        if stage["gated"] and stage["spreadPct"] is not None
    ]
    return {
        "gateFloorPct": floor_pct,
        "gateFloorMs": round(floor_ms, 3),
        "tolerancePct": tolerance_pct,
        "runs": len(runs),
        "totalReadyMs": [round(value, 3) for value in totals],
        "totalMedianMs": round(total_median, 3),
        "totalSpreadPct": total_spread,
        "totalRawSpreadPct": _spread_pct(totals),
        # The band a later milestone has to clear to claim an improvement.
        "observedBandPct": round(max(gated_spreads), 2) if gated_spreads else None,
        "stages": stages,
        "outsideTolerance": [stage["stage"] for stage in outside],
        "withinTolerance": (
            len(runs) >= 2
            and not outside
            and total_spread is not None
            and total_spread <= tolerance_pct
        ),
    }


def _run_once(
    *,
    args: argparse.Namespace,
    project_file: Path,
    repo: Path,
    relative_path: str | None,
    base: str,
    compare: str,
    cache_root: Path,
    kicad_monkey_path: str,
    run_index: int,
) -> dict[str, Any]:
    # The revision workers are spawned processes, not forks: they re-import
    # this module and read the cache root from the environment. Assigning the
    # parent's module global alone leaves every child writing to the default
    # cache, which is how run 2 of a `--repeat 2` scored an initial-cache-hit
    # against run 1's supposedly isolated cache.
    os.environ["PRISM_DESIGN_COMPARE_CACHE"] = str(cache_root)
    design_compare_service._CACHE_ROOT = cache_root

    recorder = DesignCompareBenchmark(
        job_id=f"cli-{int(time.time())}-{run_index}",
        metadata={
            "project": str(project_file),
            "repo": str(repo),
            "base": base,
            "compare": compare,
            "run": run_index,
            "initialWorkers": args.initial_workers,
            "pcbWorkers": args.pcb_workers,
            "cacheRoot": str(cache_root),
            "semanticGenerator": semantic_index_service.generator_cache_tag(),
            "kicadMonkeyModule": kicad_monkey_path,
        },
    )
    project_id = "benchmark-" + hashlib.sha256(str(project_file).encode()).hexdigest()[:12]
    progress: list[str] = []

    def heartbeat(message: str, _percent: float | None = None) -> None:
        progress.append(message)
        print(message, flush=True)

    cold_started = time.perf_counter()
    with recorder.span("snapshot-pipeline"):
        design_compare_service._prepare_comparison_snapshots(
            project_id,
            repo,
            relative_path,
            base,
            compare,
            heartbeat,
        )
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=1) as parser_executor:
        def build_object_delta() -> dict[str, Any]:
            with recorder.span("ecad-object-delta"):
                return design_compare_service._run_ecad_object_delta(
                    project_id,
                    base,
                    compare,
                )

        object_future = parser_executor.submit(build_object_delta)
        with recorder.span("cold-initial-revision-pipeline"):
            initial_revisions, initial_logs = design_compare_service._build_initial_revisions(
                project_id,
                repo,
                relative_path,
                base,
                compare,
                heartbeat,
                benchmark=recorder,
            )
        object_delta = object_future.result()
    initial_result, assembly_state = design_compare_service._assemble_initial_comparison(
        project_id=project_id,
        base=base,
        head=compare,
        revisions=initial_revisions,
        object_delta=object_delta,
        include_unchanged=False,
        benchmark=recorder,
    )
    initial_ready_ms = round((time.perf_counter() - cold_started) * 1000, 3)
    with recorder.span("cold-pcb-revision-pipeline"):
        revisions, pcb_logs = design_compare_service._build_pcb_revisions(
            project_id,
            base,
            compare,
            initial_revisions,
            heartbeat,
            benchmark=recorder,
        )
    complete_result = design_compare_service._complete_comparison(
        initial_result=initial_result,
        assembly_state=assembly_state,
        base=base,
        head=compare,
        revisions=revisions,
        benchmark=recorder,
    )
    total_ready_ms = round((time.perf_counter() - cold_started) * 1000, 3)
    counts = {
        "schematicChanges": len(complete_result["schematic"]["changes"]),
        "pcbChanges": len(complete_result["pcb"]["changes"]),
        "bomChanges": len((complete_result.get("bom") or {}).get("changes") or []),
        "schematicPositionDeltaGroups": sum(
            group.get("position_delta") is not None
            for group in complete_result["schematic"]["groups"]
        ),
        "pcbPositionDeltaGroups": sum(
            group.get("position_delta") is not None
            for group in complete_result["pcb"]["groups"]
        ),
    }
    ordered_revisions = list(dict.fromkeys((base, compare)))
    snapshots = {
        revision: _snapshot_stats(
            design_compare_service._cache_dir(project_id, revision) / "snapshot"
        )
        for revision in ordered_revisions
    }
    artifacts = {
        "revisions": {
            revision: _revision_artifact(
                design_compare_service._cache_dir(project_id, revision),
                revisions[revision],
            )
            for revision in ordered_revisions
        },
        "documentDiff": _document_diff_stats(complete_result),
    }

    warm_elapsed_ms = None
    if args.warm:
        warm_started = time.perf_counter()
        with recorder.span("warm-initial-revision-pipeline"):
            warm_initial, _ = design_compare_service._build_initial_revisions(
                project_id,
                repo,
                relative_path,
                base,
                compare,
                heartbeat,
                benchmark=recorder,
            )
        with recorder.span("warm-pcb-revision-pipeline"):
            design_compare_service._build_pcb_revisions(
                project_id,
                base,
                compare,
                warm_initial,
                heartbeat,
                benchmark=recorder,
            )
        warm_elapsed_ms = round((time.perf_counter() - warm_started) * 1000, 3)

    payload = recorder.snapshot()
    payload["summary"] = {
        **counts,
        "initialReadyMs": initial_ready_ms,
        "totalReadyMs": total_ready_ms,
        "warmElapsedMs": warm_elapsed_ms,
        "snapshots": snapshots,
        "revisionTimings": {
            revision: revisions[revision].get("timings") or {}
            for revision in ordered_revisions
        },
        "revisionLogs": {
            revision: [
                *(initial_logs.get(revision) or []),
                *(pcb_logs.get(revision) or []),
            ]
            for revision in ordered_revisions
        },
        "progress": progress,
    }
    payload["artifacts"] = artifacts
    payload["stages"] = _stage_rows(payload)
    return payload


def _print_stage_table(report: dict[str, Any]) -> None:
    stages = sorted(
        report["reproducibility"]["stages"],
        key=lambda stage: stage["medianMs"],
        reverse=True,
    )
    width = max((len(stage["stage"]) for stage in stages), default=5)
    print("")
    print(
        f"{'stage'.ljust(width)}  {'median ms':>10}  {'share %':>8}  "
        f"{'band %':>8}  {'cpu band %':>11}  tolerance"
    )
    print("-" * (width + 55))
    for stage in stages:
        band = "—" if stage["spreadPct"] is None else f"{stage['spreadPct']:.2f}"
        cpu_band = (
            "—" if stage["cpuSpreadPct"] is None else f"{stage['cpuSpreadPct']:.2f}"
        )
        share = "—" if stage["sharePct"] is None else f"{stage['sharePct']:.2f}"
        if not stage["gated"]:
            verdict = "below floor"
        else:
            verdict = "within" if stage["withinTolerance"] else "OUTSIDE"
        print(
            f"{stage['stage'].ljust(width)}  {stage['medianMs']:>10.1f}  "
            f"{share:>8}  {band:>8}  {cpu_band:>11}  {verdict}"
        )
    print("")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project", type=Path, help="KiCad .kicad_pro project")
    parser.add_argument("--base", required=True, help="Reference revision")
    parser.add_argument("--compare", required=True, help="Comparison revision")
    parser.add_argument("--output", type=Path, help="Structured JSON output")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        help="Persistent isolated cache. Existing entries are reused, never deleted.",
    )
    parser.add_argument("--warm", action="store_true", help="Also measure an immediate cache-hit run")
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Cold runs to perform, each with its own cache (default: 1). "
        "Use 2 or more to get the reproducibility verdict.",
    )
    parser.add_argument(
        "--tolerance-pct",
        type=float,
        default=10.0,
        help="Band the timing report is judged against, per stage and overall "
        "(default: 10). Reported, not enforced, unless --strict-timing",
    )
    parser.add_argument(
        "--strict-timing",
        action="store_true",
        help="Exit non-zero when the timing band exceeds --tolerance-pct. Off "
        "by default: the measured band on the reference host is 12-30%%, so a "
        "hard timing gate would only ever report the host",
    )
    parser.add_argument(
        "--gate-floor-pct",
        type=float,
        default=5.0,
        help="Stages worth less than this share of total wall clock are "
        "reported but not gated (default: 5)",
    )
    parser.add_argument(
        "--cooldown-seconds",
        type=float,
        default=0.0,
        help="Idle time between cold runs. Back-to-back runs saturate every "
        "core for minutes and the host clocks down, which shows up as a "
        "monotonic slowdown across runs rather than as noise (default: 0)",
    )
    parser.add_argument(
        "--label",
        help="Name for this input pair, carried into the report (e.g. A or B)",
    )
    parser.add_argument(
        "--initial-workers",
        choices=(1, 2),
        type=int,
        default=2,
        help="Schematic+BOM revision workers (default: 2)",
    )
    parser.add_argument(
        "--pcb-workers",
        choices=(1, 2),
        type=int,
        default=2,
        help="PCB+Stackup revision workers (default: 2)",
    )
    args = parser.parse_args()

    if args.repeat < 1:
        raise SystemExit("--repeat must be at least 1")
    if args.repeat > 1 and args.cache_dir is not None:
        raise SystemExit(
            "--repeat needs a cold cache per run; drop --cache-dir or use --repeat 1"
        )

    project_file = args.project.resolve()
    if not project_file.is_file() or project_file.suffix != ".kicad_pro":
        raise SystemExit(f"KiCad project does not exist: {project_file}")
    repo, relative_path = _resolve_project(project_file)
    base = design_compare_service._resolve_revision(repo, args.base)
    compare = design_compare_service._resolve_revision(repo, args.compare)
    output = (
        args.output.resolve()
        if args.output
        else Path(tempfile.gettempdir())
        / f"design-compare-benchmark-{int(time.time())}.json"
    )

    os.environ["PRISM_DESIGN_COMPARE_MAX_INITIAL_WORKERS"] = str(args.initial_workers)
    os.environ["PRISM_DESIGN_COMPARE_MAX_PCB_WORKERS"] = str(args.pcb_workers)
    semantic_index_service._add_kicad_monkey_import_paths()
    import kicad_monkey  # type: ignore[import-not-found]

    kicad_monkey_path = str(Path(kicad_monkey.__file__).resolve())

    runs: list[dict[str, Any]] = []
    cleanups: list[Callable[[], None]] = []
    try:
        for run_index in range(1, args.repeat + 1):
            if args.cache_dir is None:
                temporary_cache = tempfile.TemporaryDirectory(
                    prefix="prism-design-compare-benchmark-"
                )
                cleanups.append(temporary_cache.cleanup)
                cache_root = Path(temporary_cache.name)
            else:
                cache_root = args.cache_dir.resolve()
                cache_root.mkdir(parents=True, exist_ok=True)
            if run_index > 1 and args.cooldown_seconds > 0:
                print(f"cooling down {args.cooldown_seconds:.0f}s…", flush=True)
                time.sleep(args.cooldown_seconds)
            print(f"=== run {run_index}/{args.repeat} ===", flush=True)
            runs.append(
                _run_once(
                    args=args,
                    project_file=project_file,
                    repo=repo,
                    relative_path=relative_path,
                    base=base,
                    compare=compare,
                    cache_root=cache_root,
                    kicad_monkey_path=kicad_monkey_path,
                    run_index=run_index,
                )
            )
            if args.cache_dir is None:
                # Each cold run leaves ~64 MB of snapshots and revision.json
                # behind. Holding all of them until the end made every stage
                # drift upward run over run -- run 3 of 3 was 28% slower than
                # run 1 purely from page-cache pressure, which reads as the
                # pipeline being unreproducible when it is the harness.
                cleanups.pop()()

        report = {
            "schema": SCHEMA,
            "input": {
                "label": args.label,
                "project": str(project_file),
                "repo": str(repo),
                "base": base,
                "compare": compare,
                "initialWorkers": args.initial_workers,
                "pcbWorkers": args.pcb_workers,
            },
            "reproducibility": _reproducibility(
                runs,
                floor_pct=args.gate_floor_pct,
                tolerance_pct=args.tolerance_pct,
            ),
            "determinism": _determinism(runs),
            "artifacts": runs[-1]["artifacts"],
            "counts": {
                key: runs[-1]["summary"][key]
                for key in ("schematicChanges", "pcbChanges", "bomChanges")
            },
            "runs": runs,
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        _print_stage_table(report)
        print(json.dumps(report["artifacts"], indent=2), flush=True)
        print(json.dumps(report["counts"], indent=2), flush=True)
        verdict = report["reproducibility"]
        determinism = report["determinism"]
        if args.repeat < 2:
            print("Timing band not evaluated: pass --repeat 2 or more.", flush=True)
        else:
            band = verdict["observedBandPct"]
            print(
                f"Timing: median total {verdict['totalMedianMs'] / 1000:.2f}s over "
                f"{verdict['runs']} runs, band {verdict['totalSpreadPct']:.2f}%; "
                f"widest gated stage band "
                f"{'n/a' if band is None else format(band, '.2f') + '%'}.",
                flush=True,
            )
            if not verdict["withinTolerance"]:
                print(
                    f"  outside the {args.tolerance_pct:.0f}% tolerance: "
                    + (
                        ", ".join(verdict["outsideTolerance"])
                        or "total wall clock"
                    ),
                    flush=True,
                )
            if band is not None:
                print(
                    "  a later milestone counts as an improvement only if it "
                    f"clears {band:.0f}%.",
                    flush=True,
                )
        if args.repeat >= 2:
            if determinism["pass"]:
                print("Determinism: identical output across runs.", flush=True)
            else:
                print(
                    "NON-DETERMINISTIC output between runs: "
                    + ", ".join(determinism["divergent"]),
                    flush=True,
                )
        print(f"Benchmark written to {output}", flush=True)
        if args.repeat >= 2 and not determinism["pass"]:
            raise SystemExit(1)
        if args.repeat >= 2 and args.strict_timing and not verdict["withinTolerance"]:
            raise SystemExit(1)
    finally:
        for cleanup in cleanups:
            cleanup()


if __name__ == "__main__":
    main()
