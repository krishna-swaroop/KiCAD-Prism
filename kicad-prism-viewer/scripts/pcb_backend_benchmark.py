#!/usr/bin/env python3
"""Benchmark Prism's three PCB geometry backends on identical cold builds."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import resource
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


SCHEMA = "prism.pcb_backend_benchmark.v2"
VIEWER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = VIEWER_ROOT.parent
BACKENDS = ("legacy", "python-copper", "rust")


def _rss_bytes(value: int) -> int:
    return int(value if sys.platform == "darwin" else value * 1024)


def _run_trial(
    project: Path,
    backend: str,
    helper: Path,
    output_root: Path,
    trial: int,
    *,
    semantic_only: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
    logs = output_root / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"{project.stem}-{backend}-", dir=output_root) as temp:
        run_root = Path(temp)
        artifact_dir = run_root / "artifact"
        metrics_path = run_root / "metrics.json"
        cache_dir = run_root / "cache"
        log_path = logs / f"{project.stem}-{backend}-{trial}.log"
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join(
            value
            for value in (str(VIEWER_ROOT), env.get("PYTHONPATH", ""))
            if value
        )
        env["PRISM_PCB_GEOMETRY_BACKEND"] = backend
        env["PRISM_KICAD_NATIVE_PATH"] = str(helper)
        env["PRISM_TOPOLOGY_COMPILER_METRICS_PATH"] = str(metrics_path)
        command = [
            sys.executable,
            "-m",
            "pipeline.topology_compiler",
            "semantic-copper" if semantic_only else "from-project",
            str(project),
            "--output",
            str(artifact_dir),
            "--cache-dir",
            str(cache_dir),
        ]
        if not semantic_only:
            command.extend(["--scope", "3d", "--force-rebuild", "--clean-cache"])
        started = time.perf_counter()
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command,
                cwd=REPO_ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            while True:
                child, status, usage = os.wait4(process.pid, os.WNOHANG)
                if child:
                    process.returncode = os.waitstatus_to_exitcode(status)
                    break
                time.sleep(0.02)
        wall_ms = (time.perf_counter() - started) * 1000.0
        if process.returncode != 0:
            raise RuntimeError(
                f"{backend} trial {trial} failed with exit code {process.returncode}; see {log_path}"
            )
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        manifest = json.loads(
            (artifact_dir / "scene-gltf" / "scene.manifest.json").read_text(encoding="utf-8")
        )
        inventory_path = artifact_dir / "artifact-manifest.json"
        inventory = (
            json.loads(inventory_path.read_text(encoding="utf-8"))
            if inventory_path.is_file()
            else {}
        )
        node_metrics = next(
            (
                event.get("node_metrics") or {}
                for event in metrics.get("profileEvents", [])
                if event.get("stage")
                in {"semantic_gltf.node_builder", "semantic_gltf.packed_node_builder"}
            ),
            {},
        )
        geometry_stats = dict(node_metrics.get("geometry_stats") or {})
        input_json_bytes = next(
            (
                int(event.get("input_json_bytes") or 0)
                for event in metrics.get("profileEvents", [])
                if event.get("stage") == "semantic_gltf.serialize_input"
            ),
            0,
        )
        packed_event = next(
            (
                event
                for event in metrics.get("profileEvents", [])
                if event.get("stage") == "semantic_gltf.packed_node_builder"
            ),
            {},
        )
        packed_metadata_bytes = int(packed_event.get("packed_metadata_bytes") or 0)
        packed_tile_bytes = int(packed_event.get("packed_tile_bytes") or 0)
        result = {
            "backend": backend,
            "trial": trial,
            "wall_ms": wall_ms,
            "semantic_copper_ready_ms": float(
                metrics.get("semantic_copper_ready_ms") or wall_ms
            ),
            "cpu_ms": (usage.ru_utime + usage.ru_stime) * 1000.0,
            "peak_rss_bytes": _rss_bytes(usage.ru_maxrss),
            "source_bytes": project.with_suffix(".kicad_pcb").stat().st_size,
            "intermediate_bytes": input_json_bytes or packed_metadata_bytes,
            "packed_metadata_bytes": packed_metadata_bytes,
            "packed_tile_bytes": packed_tile_bytes,
            "feature_count": len(manifest.get("objectFeatures") or ()) - 1,
            "net_count": len(manifest.get("nets") or ()) - 1,
            "layer_count": len(manifest.get("layers") or ()),
            "final_asset_bytes": int(inventory.get("totalBytes") or 0)
            or sum(int(tile.get("bytes") or 0) for tile in manifest.get("tiles") or ()),
            "mesh_bytes": int(geometry_stats.get("output_bytes") or 0),
            "source_polygons": int(geometry_stats.get("source_polygons") or 0),
            "triangles": int(geometry_stats.get("triangles") or 0),
            "timings_ms": {
                key: value
                for key, value in metrics.items()
                if key.endswith("_ms") and isinstance(value, (int, float))
            },
            "native_metrics": next(
                (
                    event
                    for event in metrics.get("profileEvents", [])
                    if event.get("stage") == "context.rust_geometry_contract"
                ),
                None,
            ),
            "log": str(log_path),
        }
        return result, manifest


def _signature(manifest: dict[str, Any]) -> dict[tuple[str, str, str, str], list[float] | None]:
    net_names = {int(item["id"]): str(item.get("name") or "") for item in manifest["nets"]}
    layer_names = {int(item["id"]): str(item.get("name") or "") for item in manifest["layers"]}
    return {
        (
            str(item.get("sourceUid") or ""),
            str(item.get("kind") or ""),
            net_names.get(int(item.get("netId") or 0), ""),
            layer_names.get(int(item.get("layerId") or 0), ""),
        ): item.get("boundsMm")
        for item in manifest["objectFeatures"][1:]
    }


def _parity(reference: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    left = _signature(reference)
    right = _signature(candidate)
    shared = left.keys() & right.keys()
    bound_differences = [
        (
            max(
                abs(float(a) - float(b))
                for a, b in zip(left[key] or (), right[key] or ())
            ),
            key,
            left[key],
            right[key],
        )
        for key in shared
        if left[key] and right[key]
    ]
    bound_differences.sort(key=lambda item: item[0], reverse=True)
    bound_deltas = [item[0] for item in bound_differences]
    reference_only = sorted(left.keys() - right.keys())
    candidate_only = sorted(right.keys() - left.keys())
    reference_blank = sum(
        not str(item.get("sourceUid") or "") for item in reference["objectFeatures"][1:]
    )
    candidate_blank = sum(
        not str(item.get("sourceUid") or "") for item in candidate["objectFeatures"][1:]
    )
    reference_net_names = {
        str(item.get("name") or "") for item in reference.get("nets", [])
    }
    candidate_net_names = {
        str(item.get("name") or "") for item in candidate.get("nets", [])
    }
    net_names_match = reference_net_names == candidate_net_names
    layer_names_match = [item.get("name") for item in reference["layers"]] == [
        item.get("name") for item in candidate["layers"]
    ]

    def barrel_identities(manifest: dict[str, Any]) -> set[tuple[str, str, str]]:
        net_names = {
            int(item.get("id") or 0): str(item.get("name") or "")
            for item in manifest.get("nets", [])
        }
        return {
            (
                str(item.get("sourceUid") or ""),
                str(item.get("kind") or ""),
                net_names.get(int(item.get("netId") or 0), ""),
            )
            for item in manifest.get("barrels", [])
        }

    barrel_identity_match = barrel_identities(reference) == barrel_identities(candidate)
    return {
        "passed": not reference_only
        and not candidate_only
        and max(bound_deltas, default=0.0) <= 0.005
        and net_names_match
        and layer_names_match
        and barrel_identity_match,
        "shared_identities": len(shared),
        "reference_only_count": len(reference_only),
        "candidate_only_count": len(candidate_only),
        "reference_only_examples": [list(item) for item in reference_only[:50]],
        "candidate_only_examples": [list(item) for item in candidate_only[:50]],
        "reference_blank_source_identity_count": reference_blank,
        "candidate_blank_source_identity_count": candidate_blank,
        "max_shared_bounds_delta_mm": max(bound_deltas, default=0.0),
        "largest_shared_bounds_differences": [
            {
                "delta_mm": delta,
                "identity": list(key),
                "legacy_bounds_mm": legacy_bounds,
                "rust_bounds_mm": rust_bounds,
            }
            for delta, key, legacy_bounds, rust_bounds in bound_differences[:20]
        ],
        # Numeric IDs and table order are document-local. Semantic parity is
        # the canonical net-name set plus feature/barrel bindings by name.
        "net_names_match": net_names_match,
        "layer_names_match": layer_names_match,
        "barrel_identities_match": barrel_identity_match,
    }


def _git_revision(path: Path) -> str | None:
    working_directory = path if path.is_dir() else path.parent
    completed = subprocess.run(
        ["git", "-C", str(working_directory), "rev-parse", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return None
    return completed.stdout.strip() or None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _python_monkey_identity() -> dict[str, str | None]:
    spec = importlib.util.find_spec("kicad_monkey")
    module_path = Path(spec.origin).resolve() if spec and spec.origin else None
    revision = _git_revision(module_path) if module_path else None
    return {
        "module": str(module_path) if module_path else None,
        "revision": revision,
    }


def _helper_identity(helper: Path) -> str:
    completed = subprocess.run(
        [str(helper), "--version"],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _median(trials: list[dict[str, Any]]) -> dict[str, Any]:
    keys = (
        "wall_ms",
        "semantic_copper_ready_ms",
        "cpu_ms",
        "peak_rss_bytes",
        "source_bytes",
        "intermediate_bytes",
        "packed_metadata_bytes",
        "packed_tile_bytes",
        "feature_count",
        "net_count",
        "layer_count",
        "final_asset_bytes",
        "mesh_bytes",
        "source_polygons",
        "triangles",
    )
    result = {key: statistics.median(float(item[key]) for item in trials) for key in keys}
    timing_keys = sorted({key for item in trials for key in item["timings_ms"]})
    result["timings_ms"] = {
        key: statistics.median(float(item["timings_ms"].get(key, 0.0)) for item in trials)
        for key in timing_keys
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("projects", nargs="+", type=Path)
    parser.add_argument("--helper", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--project-revision",
        help="Source revision for an exported/archived project tree without its own .git directory",
    )
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--trials", type=int, default=5)
    parser.add_argument(
        "--semantic-only",
        action="store_true",
        help="Measure through semantic-copper-ready without invoking kicad-cli GLB export",
    )
    args = parser.parse_args()
    if args.warmups < 0:
        parser.error("--warmups must not be negative")
    if args.trials < 1:
        parser.error("--trials must be at least 1")
    helper = args.helper.resolve()
    if not helper.is_file() or not os.access(helper, os.X_OK):
        parser.error(f"helper is not executable: {helper}")
    projects = [project.resolve() for project in args.projects]
    missing_boards = [
        project for project in projects if not project.with_suffix(".kicad_pcb").is_file()
    ]
    if missing_boards:
        parser.error(
            "benchmark inputs must be PCB-backed projects with a same-stem .kicad_pcb: "
            + ", ".join(str(project) for project in missing_boards)
        )
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    reports = []
    for project in projects:
        trials: dict[str, list[dict[str, Any]]] = {backend: [] for backend in BACKENDS}
        manifests: dict[str, dict[str, Any]] = {}
        failures: list[dict[str, Any]] = []
        failed_backends: set[str] = set()
        total_rounds = args.warmups + args.trials
        for run_index in range(total_rounds):
            measured_run = run_index >= args.warmups
            trial = run_index - args.warmups
            # Rotate the order on every round so backend position cannot own a
            # stable thermal or filesystem-cache advantage.
            offset = run_index % len(BACKENDS)
            order = BACKENDS[offset:] + BACKENDS[:offset]
            for backend in order:
                if backend in failed_backends:
                    continue
                try:
                    result, manifest = _run_trial(
                        project,
                        backend,
                        helper,
                        output,
                        run_index,
                        semantic_only=args.semantic_only,
                    )
                except Exception as exc:
                    failed_backends.add(backend)
                    failures.append(
                        {
                            "backend": backend,
                            "run": run_index,
                            "error": str(exc),
                        }
                    )
                    print(f"{project.name} {backend} FAILED: {exc}", flush=True)
                    continue
                manifests[backend] = manifest
                if measured_run:
                    trials[backend].append(result)
                print(
                    f"{project.name} {backend} "
                    f"{'trial ' + str(trial + 1) + '/' + str(args.trials) if measured_run else 'warm-up'}: "
                    f"{result['wall_ms']:.1f} ms",
                    flush=True,
                )
        medians = {
            backend: _median(values)
            for backend, values in trials.items()
            if len(values) == args.trials
        }
        metric_key = "semantic_copper_ready_ms" if args.semantic_only else "wall_ms"
        legacy_wall = medians.get("legacy", {}).get(metric_key)
        improvements = (
            {
                backend: ((legacy_wall - values[metric_key]) / legacy_wall) * 100.0
                for backend, values in medians.items()
                if backend != "legacy"
            }
            if legacy_wall
            else {}
        )
        reports.append(
            {
                "project": str(project),
                "project_revision": args.project_revision
                or (_git_revision(project) if (project.parent / ".git").exists() else None),
                "pcb_sha256": _sha256(project.with_suffix(".kicad_pcb")),
                "trials": trials,
                "medians": medians,
                "failures": failures,
                "wall_improvement_percent_vs_legacy": improvements,
                "parity_vs_legacy": {
                    backend: _parity(manifests["legacy"], manifests[backend])
                    for backend in BACKENDS
                    if backend != "legacy"
                    and "legacy" in manifests
                    and backend in manifests
                },
            }
        )
    report = {
        "schema": SCHEMA,
        "environment": {
            "platform": platform.platform(),
            "python": sys.version,
            "helper": str(helper),
            "helper_identity": _helper_identity(helper),
            "python_monkey": _python_monkey_identity(),
        },
        "methodology": {
            "warmups": args.warmups,
            "trials": args.trials,
            "backends": list(BACKENDS),
            "cache": "fresh compiler and semantic scene cache per run; forced artifact rebuild",
            "order": "interleaved and rotated per round",
            "semantic_only": args.semantic_only,
            "comparison_metric": (
                "semantic_copper_ready_ms" if args.semantic_only else "wall_ms"
            ),
        },
        "boards": reports,
    }
    destination = output / "pcb-backend-benchmark.json"
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
