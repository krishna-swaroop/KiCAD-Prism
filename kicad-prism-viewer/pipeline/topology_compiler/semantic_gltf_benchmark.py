from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .compiler import compile_topology
from .exporter import export_viewer_html
from .native_clipper import build_native_clip_response
from .kicad_cli_export import export_project_geometry
from .pcb_geometry import extract_pad_holes
from .pcb_extract import extract_pcb_metadata
from .prism_clipper2 import PrismClipper2Library, prism_clipper2_library_info
from .semantic_gltf import SemanticGltfBuilder, TILE_SIZE_MM


SCHEMA = "prism.semantic_gltf_benchmark_a0"


def run_semantic_gltf_benchmark(args: Any) -> dict[str, Any]:
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    fixed_input = _prepare_fixed_input(
        Path(args.project) if args.project else None,
        output,
        tile_size_mm=float(args.tile_size),
        meshopt_level=args.meshopt_level,
        synthetic_fixture=args.synthetic_fixture,
    )
    input_digest = _file_digest(fixed_input)
    environment = _environment_metadata(
        tile_size_mm=float(args.tile_size),
        meshopt_level=args.meshopt_level,
        workers=int(args.workers),
        input_digest=input_digest,
    )
    clipper2_available = bool(prism_clipper2_library_info().get("a2Support"))
    parity: dict[str, Any]
    if clipper2_available:
        try:
            parity = _run_verify_gate(
                fixed_input,
                output,
                workers=int(args.workers),
                meshopt_level=args.meshopt_level,
                backend="clipper2",
            )
        except RuntimeError as exc:
            parity = {
                "passed": False,
                "mode": "verify-clipper2-a2",
                "error": str(exc),
            }
    else:
        parity = {
            "passed": None,
            "skipped": True,
            "reason": "No Prism Clipper2 native library is available; native and verify modes were skipped.",
        }

    modes = ["js"]
    if clipper2_available:
        modes.append("clipper2-a2")
    trials_by_mode: dict[str, list[dict[str, Any]]] = {}
    for mode in modes:
        trials_by_mode[mode] = []
        total_runs = int(args.trials) + int(args.warmups)
        for run_index in range(total_runs):
            measured = run_index >= int(args.warmups)
            trial_index = run_index - int(args.warmups) if measured else -1
            trial = _run_semantic_trial(
                fixed_input,
                output,
                mode=mode,
                run_index=run_index,
                trial_index=trial_index,
                measured=measured,
                workers=int(args.workers),
                meshopt_level=args.meshopt_level,
            )
            if measured:
                trials_by_mode[mode].append(trial)

    report = {
        "schema": SCHEMA,
        "version": 0,
        "input": {
            "path": str(fixed_input),
            "digest": input_digest,
            "bytes": fixed_input.stat().st_size,
            "identity": _input_identity(fixed_input),
        },
        "environment": environment,
        "methodology": {
            "warmups": int(args.warmups),
            "trials": int(args.trials),
            "workers": int(args.workers),
            "meshoptLevel": args.meshopt_level,
            "sceneCache": "disabled",
        },
        "parity": parity,
        "modes": trials_by_mode,
        "summary": _summarize(trials_by_mode),
        "fullFromProject": [],
    }
    if int(args.full_trials) > 0 and args.project and not str(args.project).endswith(".json"):
        report["fullFromProject"] = _run_full_from_project_trials(
            Path(args.project),
            output,
            trials=int(args.full_trials),
            workers=int(args.workers),
            meshopt_level=args.meshopt_level,
        )
    report["comparison"] = _comparison(report)
    (output / "benchmark-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output / "benchmark-report.md").write_text(_markdown_report(report), encoding="utf-8")
    return report


def run_semantic_gltf_suite(args: Any) -> dict[str, Any]:
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    projects = _suite_projects(args)
    if not projects:
        raise RuntimeError("benchmark-semantic-suite requires at least one --project or manifest project")
    reports: list[dict[str, Any]] = []
    for index, project in enumerate(projects):
        project_output = output / _project_slug(project, index)
        benchmark_args = type(
            "BenchmarkArgs",
            (),
            {
                "project": Path(project["path"]),
                "output": project_output,
                "trials": int(args.trials),
                "warmups": int(args.warmups),
                "workers": int(args.workers),
                "meshopt_level": args.meshopt_level,
                "tile_size": float(args.tile_size),
                "synthetic_fixture": None,
                "full_trials": 0,
            },
        )()
        try:
            report = run_semantic_gltf_benchmark(benchmark_args)
            reports.append(
                {
                    "name": project["name"],
                    "path": project["path"],
                    "category": project.get("category"),
                    "failed": False,
                    "output": str(project_output),
                    "report": report,
                    "summary": _suite_project_summary(report),
                }
            )
        except Exception as exc:
            reports.append(
                {
                    "name": project["name"],
                    "path": project["path"],
                    "category": project.get("category"),
                    "failed": True,
                    "output": str(project_output),
                    "error": str(exc),
                }
            )
    suite_report = {
        "schema": "prism.semantic_gltf_benchmark_suite_a0",
        "version": 0,
        "environment": _environment_metadata(
            tile_size_mm=float(args.tile_size),
            meshopt_level=args.meshopt_level,
            workers=int(args.workers),
            input_digest="suite",
        ),
        "methodology": {
            "warmups": int(args.warmups),
            "trials": int(args.trials),
            "workers": int(args.workers),
            "meshoptLevel": args.meshopt_level,
        },
        "projects": reports,
        "aggregate": _suite_aggregate(reports),
    }
    (output / "benchmark-suite-report.json").write_text(json.dumps(suite_report, indent=2), encoding="utf-8")
    (output / "benchmark-suite-report.md").write_text(_suite_markdown_report(suite_report), encoding="utf-8")
    return suite_report


def _prepare_fixed_input(
    project: Path | None,
    output: Path,
    *,
    tile_size_mm: float,
    meshopt_level: str,
    synthetic_fixture: str | None = None,
) -> Path:
    fixed_dir = output / "fixed-input"
    fixed_dir.mkdir(parents=True, exist_ok=True)
    fixed_input = fixed_dir / "semantic-gltf-input.json"
    if synthetic_fixture:
        payload = synthetic_semantic_input(tile_size_mm=tile_size_mm)
        payload["meshoptLevel"] = meshopt_level
        fixed_input.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        return fixed_input
    if project is None:
        raise RuntimeError("benchmark-semantic-gltf requires a project path unless --synthetic-fixture is set")
    if project.suffix == ".json":
        payload = json.loads(project.read_text(encoding="utf-8"))
        payload["tileSizeMm"] = tile_size_mm
        payload["meshoptLevel"] = meshopt_level
        fixed_input.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        return fixed_input

    try:
        from kicad_monkey import KiCadDesign  # type: ignore

        design = KiCadDesign.from_project_file(project)
        design_payload = design.to_json(include_indexes=True)
        pcb_ir = design.to_pcb_ir()
        pad_holes = extract_pad_holes(design.pcb)
        pcb_metadata = extract_pcb_metadata(project)
    except Exception as exc:
        raise RuntimeError(f"failed to prepare benchmark input from KiCad project {project}: {exc}") from exc
    topology = compile_topology(design_payload, [], pcb_metadata, _discover_project_assets(project))
    export_dir = fixed_dir / "source-export"
    semantic_geometry = export_project_geometry(project, topology, export_dir, strict_components=False)
    builder = SemanticGltfBuilder(topology, export_dir / str(semantic_geometry.get("assets", {}).get("base_board_glb") or ""))
    builder.add_pcb_ir(pcb_ir, pad_holes=pad_holes)
    builder.add_component_nodes(semantic_geometry.get("components", []) or [])
    payload = builder.write_input(fixed_input, tile_size_mm=tile_size_mm)
    payload["meshoptLevel"] = meshopt_level
    source_geometry_revision = str(payload["geometryRevision"])
    payload["sourceGeometryRevision"] = source_geometry_revision
    payload["geometryCompiler"] = {
        "compilerVersion": "semantic-gltf-benchmark-a0",
        "protocolVersion": "prism.semantic_geometry_protocol_a1",
        "tileSizeMm": tile_size_mm,
        "meshoptLevel": meshopt_level,
    }
    payload["geometryRevision"] = hashlib.sha256(
        json.dumps(
            {
                "sourceGeometryRevision": source_geometry_revision,
                "geometryCompiler": payload["geometryCompiler"],
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    fixed_input.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return fixed_input


def synthetic_semantic_input(*, tile_size_mm: float = 20.0) -> dict[str, Any]:
    layers = [
        {"id": 1, "name": "F.Cu", "role": "copper", "z_mm": 0.8, "thickness_mm": 0.035},
        {"id": 2, "name": "In1.Cu", "role": "copper", "z_mm": 0.2, "thickness_mm": 0.035},
        {"id": 3, "name": "B.Cu", "role": "copper", "z_mm": -0.8, "thickness_mm": 0.035},
    ]
    nets = [
        {"id": 0, "uid": "", "name": "", "netClass": "", "metrics": {}},
        {"id": 1, "uid": "gnd", "name": "GND", "netClass": "Power", "metrics": {}},
        {"id": 2, "uid": "sig", "name": "SIG", "netClass": "Default", "metrics": {}},
    ]
    features = [{"id": 0, "sourceUid": "", "netId": 0, "layerId": 0, "kind": "none"}]
    objects: list[dict[str, Any]] = []

    def add(layer_id: int, net_id: int, kind: str, outer: list[list[float]], holes: list[list[list[float]]] | None = None) -> None:
        feature_id = len(features)
        record_id = len(objects) + 1
        layer = layers[layer_id - 1]
        features.append({"id": feature_id, "sourceUid": f"{kind}-{record_id}", "netId": net_id, "layerId": layer_id, "kind": kind})
        objects.append(
            {
                "netId": net_id,
                "objectFeatureId": feature_id,
                "layerId": layer_id,
                "layerName": layer["name"],
                "zMm": layer["z_mm"],
                "thicknessMm": layer["thickness_mm"],
                "kindId": 1,
                "polygons": [
                    {
                        "sourcePolygonRecordId": record_id,
                        "sourceOrder": record_id - 1,
                        "outer": outer,
                        "holes": holes or [],
                    }
                ],
            }
        )

    # 1. Small board with mostly single-tile geometry.
    add(1, 2, "small-single", [[1, 1], [8, 1], [8, 8], [1, 8]])
    # 2. Large multi-tile copper zone.
    add(1, 1, "large-zone", [[-15, -10], [78, -10], [78, 55], [-15, 55]])
    # 3 and 9. Copper zone containing multiple holes, including one hole fully inside one tile.
    add(
        2,
        1,
        "holed-zone",
        [[5, 5], [65, 5], [65, 48], [5, 48]],
        [
            [[22, 22], [28, 22], [28, 28], [22, 28]],
            [[42, 10], [52, 10], [52, 16], [42, 16]],
        ],
    )
    # 4. Multi-layer planes.
    add(2, 1, "inner-plane", [[-22, 30], [45, 30], [45, 82], [-22, 82]])
    add(3, 1, "bottom-plane", [[-24, 28], [46, 28], [46, 84], [-24, 84]])
    # 5. Vias and pads crossing tile boundaries.
    add(1, 2, "pad-boundary", [[18, 18], [24, 18], [24, 24], [18, 24]])
    add(3, 2, "via-boundary", [[-2, -2], [2, -2], [2, 2], [-2, 2]], [[[ -0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]])
    # 6. Negative tile coordinates.
    add(1, 2, "negative-tile", [[-39, -21], [-18, -21], [-18, -3], [-39, -3]])
    # 7. Narrow traces and tiny holes.
    add(1, 2, "narrow-trace", [[0, 39.95], [71, 39.95], [71, 40.05], [0, 40.05]])
    add(2, 1, "tiny-hole", [[70, 0], [90, 0], [90, 20], [70, 20]], [[[79.9, 9.9], [80.1, 9.9], [80.1, 10.1], [79.9, 10.1]]])
    # 8. High-fragmentation routing fixture.
    for index in range(16):
        y = 60 + index * 0.7
        add(1, 2, "fragment", [[-5, y], [75, y], [75, y + 0.18], [-5, y + 0.18]])

    revision_source = json.dumps({"layers": layers, "nets": nets, "objects": objects}, sort_keys=True, separators=(",", ":"))
    source_revision = hashlib.sha256(revision_source.encode("utf-8")).hexdigest()
    return {
        "schema": "prism.semantic_gltf_build_a0",
        "tileSizeMm": tile_size_mm,
        "geometryRevision": source_revision,
        "sourceGeometryRevision": source_revision,
        "coordinateSystem": {
            "source": {"axes": {"x": "board-right", "y": "board-down", "z": "stackup-up"}, "units": "millimetres"},
            "gltf": {"axes": {"x": "board-right", "y": "stackup-up", "z": "board-down"}, "units": "millimetres"},
            "runtime": {"axes": {"x": "board-right", "y": "board-up", "z": "stackup-up"}, "sourceToRuntime": ["x", "-y", "z"]},
        },
        "layers": layers,
        "nets": nets,
        "objectFeatures": features,
        "objects": objects,
        "barrels": [],
        "components": [],
    }


def _run_verify_gate(input_path: Path, output: Path, *, workers: int, meshopt_level: str, backend: str) -> dict[str, Any]:
    preclip_path = output / "verify" / f"{backend}-preclip.json"
    preclip_path.parent.mkdir(parents=True, exist_ok=True)
    input_payload = json.loads(input_path.read_text(encoding="utf-8"))
    response, native_timings = build_native_clip_response(
        input_payload,
        library=PrismClipper2Library(),
        protocol="a2",
    )
    mode = "verify-clipper2-a2"
    preclip_path.write_text(json.dumps(response, separators=(",", ":")), encoding="utf-8")
    trial = _run_node_builder(
        input_path,
        output / "verify" / "scene",
        metrics_path=output / "verify" / "metrics.json",
        mode=mode,
        workers=workers,
        meshopt_level=meshopt_level,
        preclip_path=preclip_path,
    )
    return {
        "passed": True,
        "mode": mode,
        "nativeTimings": native_timings,
        "nodeMetrics": trial["metrics"],
    }


def _run_semantic_trial(
    input_path: Path,
    output: Path,
    *,
    mode: str,
    run_index: int,
    trial_index: int,
    measured: bool,
    workers: int,
    meshopt_level: str,
) -> dict[str, Any]:
    label = f"trial-{trial_index:02d}" if measured else f"warmup-{run_index:02d}"
    trial_dir = output / "semantic-tile" / mode / label
    shutil.rmtree(trial_dir, ignore_errors=True)
    trial_dir.mkdir(parents=True, exist_ok=True)
    native_timings: dict[str, Any] = {}
    native_stats: dict[str, Any] = {}
    preclip_path: Path | None = None
    protocol = _protocol_for_mode(mode)
    if protocol:
        input_payload = json.loads(input_path.read_text(encoding="utf-8"))
        if _native_backend_for_benchmark_mode(mode) == "clipper2":
            response, native_timings = build_native_clip_response(
                input_payload,
                library=PrismClipper2Library(),
                protocol="a2",
            )
        else:
            response, native_timings = build_native_clip_response(input_payload, protocol=protocol)
        native_stats = response.get("stats") or {}
        preclip_path = trial_dir / f"{_native_backend_for_benchmark_mode(mode)}-preclip.json"
        preclip_path.write_text(json.dumps(response, separators=(",", ":")), encoding="utf-8")
    node_result = _run_node_builder(
        input_path,
        trial_dir / "scene",
        metrics_path=trial_dir / "metrics.json",
        mode=mode,
        workers=workers,
        meshopt_level=meshopt_level,
        preclip_path=preclip_path,
    )
    metrics = node_result["metrics"]
    if protocol:
        metrics.update(native_timings)
        for key, value in native_stats.items():
            if isinstance(value, (int, float)):
                metrics.setdefault(key, value)
        metrics["semantic_tile_total_ms"] = (
            float(native_timings.get("native_total_ms") or 0) + float(metrics.get("total_ms") or 0)
        )
        metrics["node_pack_total_ms"] = metrics.get("node_pack_total_ms", 0)
    else:
        metrics["semantic_tile_total_ms"] = metrics.get("total_ms", 0)
    geometry_stats = {
        **(metrics.get("geometry_stats") or {}),
        **native_stats,
    }
    return {
        "trial": trial_index,
        "mode": mode,
        "output": str(trial_dir),
        "metrics": metrics,
        "geometryStatistics": geometry_stats,
        "artifactStatistics": _artifact_stats(node_result["manifest"]),
    }


def _protocol_for_mode(mode: str) -> str | None:
    if mode in {"clipper2-a2", "verify", "verify-clipper2-a2"}:
        return "a2"
    return None


def _native_backend_for_benchmark_mode(mode: str) -> str:
    if mode.startswith("clipper2") or mode.startswith("verify-clipper2"):
        return "clipper2"
    if mode == "verify":
        return "clipper2"
    return "js"


def _run_node_builder(
    input_path: Path,
    output_dir: Path,
    *,
    metrics_path: Path,
    mode: str,
    workers: int,
    meshopt_level: str,
    preclip_path: Path | None = None,
) -> dict[str, Any]:
    viewer_root = Path(__file__).resolve().parents[2]
    tool = viewer_root / "tools" / "semantic-gltf" / "build.mjs"
    env = os.environ.copy()
    env.update(
        {
            "PRISM_SEMANTIC_CLIPPER": mode,
            "PRISM_SEMANTIC_GLTF_WORKERS": str(workers),
            "PRISM_SEMANTIC_GLTF_MESHOPT_LEVEL": meshopt_level,
            "PRISM_SEMANTIC_GLTF_METRICS_PATH": str(metrics_path),
        }
    )
    if preclip_path:
        env["PRISM_SEMANTIC_CLIPPED_INPUT"] = str(preclip_path)
    process = subprocess.run(
        ["node", str(tool), str(input_path), str(output_dir)],
        cwd=viewer_root,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if process.returncode != 0:
        tail = "\n".join(process.stdout.splitlines()[-60:])
        raise RuntimeError(f"semantic GLTF node builder failed in {mode} mode with code {process.returncode}:\n{tail}")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    manifest = json.loads((output_dir / "scene.manifest.json").read_text(encoding="utf-8"))
    return {"metrics": metrics, "manifest": manifest, "log": process.stdout}


def _run_full_from_project_trials(
    project: Path,
    output: Path,
    *,
    trials: int,
    workers: int,
    meshopt_level: str,
) -> list[dict[str, Any]]:
    clipper2_available = bool(prism_clipper2_library_info().get("a2Support"))
    modes = ["js"] + (["clipper2-a2"] if clipper2_available else [])
    results: list[dict[str, Any]] = []
    viewer_root = Path(__file__).resolve().parents[2]
    for mode in modes:
        for index in range(trials):
            trial_dir = output / "full-from-project" / mode / f"trial-{index:02d}"
            shutil.rmtree(trial_dir, ignore_errors=True)
            metrics_path = trial_dir / "from-project-metrics.json"
            env = os.environ.copy()
            env.update(
                {
                    "PRISM_SEMANTIC_CLIPPER": mode,
                    "PRISM_SEMANTIC_GLTF_WORKERS": str(workers),
                    "PRISM_TOPOLOGY_COMPILER_METRICS_PATH": str(metrics_path),
                }
            )
            command = [
                sys.executable,
                "-m",
                "pipeline.topology_compiler",
                "from-project",
                str(project),
                "--output",
                str(trial_dir / "bundle"),
                "--force-rebuild",
                "--clean-cache",
                "--cache-dir",
                str(trial_dir / "cache"),
                "--meshopt-level",
                meshopt_level,
            ]
            started = time.perf_counter()
            process = subprocess.run(
                command,
                cwd=viewer_root,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
            )
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            if process.returncode != 0:
                results.append(
                    {
                        "mode": mode,
                        "trial": index,
                        "failed": True,
                        "elapsedMs": elapsed_ms,
                        "logTail": "\n".join(process.stdout.splitlines()[-60:]),
                    }
                )
                continue
            metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
            results.append({"mode": mode, "trial": index, "failed": False, "metrics": metrics, "elapsedMs": elapsed_ms})
    return results


def _summarize(trials_by_mode: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    keys = [
        "semantic_tile_total_ms",
        "total_ms",
        "tile_assignment_ms",
        "candidate_tile_enumeration_ms",
        "source_bounds_ms",
        "source_geometry_clean_ms",
        "single_tile_classification_ms",
        "multi_tile_candidate_span_ms",
        "tile_job_generation_ms",
        "tile_key_allocation_ms",
        "js_clip_ms",
        "request_encode_ms",
        "a1_request_encode_ms",
        "a2_request_encode_ms",
        "native_batch_call_ms",
        "response_decode_validate_ms",
        "preclip_materialize_ms",
        "request_bytes",
        "response_bytes",
        "subject_count",
        "job_count",
        "unique_subject_vertices",
        "a1_equivalent_repeated_vertices",
        "node_pack_total_ms",
        "earcut_ms",
        "gltf_authoring_ms",
        "meshopt_ms",
        "glb_write_ms",
    ]
    for mode, trials in trials_by_mode.items():
        summary[mode] = {}
        for key in keys:
            values = [float(trial.get("metrics", {}).get(key) or 0) for trial in trials if key in trial.get("metrics", {})]
            if values:
                summary[mode][key] = _stats(values)
    return summary


def _stats(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    p90_index = min(len(ordered) - 1, math_ceil(0.9 * len(ordered)) - 1)
    return {
        "minimum": min(values),
        "median": statistics.median(values),
        "mean": statistics.fmean(values),
        "p90": ordered[p90_index],
        "maximum": max(values),
        "standardDeviation": statistics.stdev(values) if len(values) > 1 else 0.0,
    }


def _comparison(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary") or {}
    js_total = _median(summary, "js", "semantic_tile_total_ms")
    clipper2_a2_total = _median(summary, "clipper2-a2", "semantic_tile_total_ms")
    primary_native_total = clipper2_a2_total
    js_clip = _median(summary, "js", "js_clip_ms")
    native_parts = [
        _median(summary, "clipper2-a2", key)
        for key in ["request_encode_ms", "native_batch_call_ms", "response_decode_validate_ms", "preclip_materialize_ms"]
    ]
    native_total = sum(value for value in native_parts if value is not None) if any(value is not None for value in native_parts) else None
    if not js_total or not primary_native_total:
        conclusion = "inconclusive"
    else:
        ratio = js_total / primary_native_total
        if ratio >= 1.05:
            conclusion = "faster"
        elif ratio <= 0.95:
            conclusion = "slower"
        else:
            conclusion = "neutral"
    return {
        "primaryNativeMode": "clipper2-a2",
        "primaryNativeSemanticTileSpeedup": (js_total / primary_native_total) if js_total and primary_native_total else None,
        "clipper2SemanticTileSpeedup": (js_total / clipper2_a2_total) if js_total and clipper2_a2_total else None,
        "nativeClippingOnlySpeedup": (js_clip / native_total) if js_clip and native_total else None,
        "transportOverheadDominates": bool(native_total and _median(summary, "clipper2-a2", "native_batch_call_ms") < (native_total / 2.0)),
        "conclusion": conclusion,
    }


def _median(summary: dict[str, Any], mode: str, key: str) -> float | None:
    value = summary.get(mode, {}).get(key, {}).get("median")
    return float(value) if value is not None else None


def _markdown_report(report: dict[str, Any]) -> str:
    comparison = report.get("comparison") or {}
    summary = report.get("summary") or {}
    lines = [
        "# Prism Semantic GLTF Benchmark",
        "",
        f"- Input digest: `{report['input']['digest']}`",
        f"- Trials: `{report['methodology']['trials']}` measured, `{report['methodology']['warmups']}` warm-up",
        f"- Workers: `{report['methodology']['workers']}`",
        f"- Meshopt: `{report['methodology']['meshoptLevel']}`",
        f"- Parity: `{report['parity'].get('passed')}`",
        f"- Conclusion: `{comparison.get('conclusion')}`",
        "",
        "## Median Timings",
        "",
        "| Phase | JS | Clipper2 A2 |",
        "| --- | ---: | ---: |",
    ]
    for key in [
        "semantic_tile_total_ms",
        "js_clip_ms",
        "request_encode_ms",
        "native_batch_call_ms",
        "response_decode_validate_ms",
        "preclip_materialize_ms",
        "request_bytes",
        "response_bytes",
        "unique_subject_vertices",
        "a1_equivalent_repeated_vertices",
        "node_pack_total_ms",
        "earcut_ms",
        "meshopt_ms",
        "glb_write_ms",
    ]:
        js_value = _median(summary, "js", key)
        clipper2_a2_value = _median(summary, "clipper2-a2", key)
        lines.append(f"| `{key}` | {_fmt(js_value)} | {_fmt(clipper2_a2_value)} |")
    lines.extend(
        [
            "",
            "## Comparison",
            "",
            f"- Primary native semantic-tile speedup: `{_fmt(comparison.get('primaryNativeSemanticTileSpeedup'))}x`",
            f"- Clipper2 A2 semantic-tile speedup: `{_fmt(comparison.get('clipper2SemanticTileSpeedup'))}x`",
            f"- Native clipping-only speedup: `{_fmt(comparison.get('nativeClippingOnlySpeedup'))}x`",
            f"- Native response transport overhead dominates: `{comparison.get('transportOverheadDominates')}`",
            f"- Recommendation: keep Clipper2 A2 as the default when this report concludes `faster` on representative boards.",
        ]
    )
    return "\n".join(lines) + "\n"


def _environment_metadata(*, tile_size_mm: float, meshopt_level: str, workers: int, input_digest: str) -> dict[str, Any]:
    clipper2_info = prism_clipper2_library_info()
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hostOS": platform.platform(),
        "cpuArchitecture": platform.machine(),
        "logicalCpuCount": os.cpu_count(),
        "pythonVersion": platform.python_version(),
        "nodeVersion": _capture(["node", "--version"]),
        "clipper2Library": clipper2_info.get("libraryPath") or os.environ.get("PRISM_CLIPPER2_LIBRARY"),
        "clipper2LibrarySha256": clipper2_info.get("librarySha256"),
        "clipper2Version": clipper2_info.get("version"),
        "clipper2AbiVersion": clipper2_info.get("abiVersion"),
        "clipper2ProtocolVersion": clipper2_info.get("protocolVersion"),
        "clipper2BatchSymbol": clipper2_info.get("batchSymbol"),
        "clipper2InfoError": clipper2_info.get("error"),
        "prismCommitSha": _capture(["git", "rev-parse", "HEAD"]),
        "tileSizeMm": tile_size_mm,
        "meshoptLevel": meshopt_level,
        "workerCount": workers,
        "inputDigest": input_digest,
    }


def _input_identity(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        "schema": payload.get("schema"),
        "geometryRevision": payload.get("geometryRevision"),
        "sourceGeometryRevision": payload.get("sourceGeometryRevision"),
        "tileSizeMm": payload.get("tileSizeMm"),
        "objects": len(payload.get("objects", []) or []),
        "barrels": len(payload.get("barrels", []) or []),
    }


def _artifact_stats(manifest: dict[str, Any]) -> dict[str, int]:
    tiles = manifest.get("tiles", []) or []
    return {
        "tileCount": len(tiles),
        "vertices": sum(int(tile.get("vertices") or 0) for tile in tiles),
        "triangles": sum(int(tile.get("triangles") or 0) for tile in tiles),
        "outputBytes": sum(int(tile.get("bytes") or 0) for tile in tiles),
    }


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _capture(command: list[str]) -> str | None:
    try:
        return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def _discover_project_assets(project_file: Path) -> dict[str, Any]:
    root = project_file.parent
    design_outputs = root / "Design-Outputs"
    model_dir = design_outputs / "3DModel"
    glb: list[str] = []
    step: list[str] = []
    for base in [model_dir, root / "packages3D", root / "RemoteLibrary" / "remote_3d"]:
        if not base.exists():
            continue
        glb.extend(str(path.relative_to(root)) for path in base.rglob("*.glb"))
        step.extend(str(path.relative_to(root)) for path in base.rglob("*.step"))
        step.extend(str(path.relative_to(root)) for path in base.rglob("*.stp"))
    return {
        "project_root": str(root),
        "glb": sorted(set(glb)),
        "step": sorted(set(step)),
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.3f}"
    except (TypeError, ValueError):
        return str(value)


def math_ceil(value: float) -> int:
    return int(-(-value // 1))


def _suite_projects(args: Any) -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    for path in getattr(args, "project", []) or []:
        project_path = Path(path).resolve()
        projects.append({"name": project_path.stem, "path": str(project_path), "category": "unspecified"})
    manifest = getattr(args, "manifest", None)
    if manifest:
        payload = json.loads(Path(manifest).read_text(encoding="utf-8"))
        for item in payload.get("projects", []) or []:
            project_path = Path(str(item.get("path") or "")).resolve()
            projects.append(
                {
                    "name": str(item.get("name") or project_path.stem),
                    "path": str(project_path),
                    "category": item.get("category") or "unspecified",
                }
            )
    return projects


def _project_slug(project: dict[str, Any], index: int) -> str:
    raw = f"{index:02d}-{project.get('name') or Path(str(project.get('path'))).stem}"
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in raw).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or f"project-{index:02d}"


def _suite_project_summary(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary") or {}
    comparison = report.get("comparison") or {}
    parity = report.get("parity") or {}
    input_identity = report.get("input", {}).get("identity") or {}
    artifacts = _first_artifact_statistics(report)
    native_stats = _first_geometry_statistics(report)
    return {
        "jsMedianSemanticTileTotalMs": _median(summary, "js", "semantic_tile_total_ms"),
        "clipper2A2MedianSemanticTileTotalMs": _median(summary, "clipper2-a2", "semantic_tile_total_ms"),
        "clipper2A2SpeedupVsJs": comparison.get("clipper2SemanticTileSpeedup"),
        "verifyPassed": parity.get("passed"),
        "sourcePolygons": native_stats.get("source_polygons"),
        "singleTilePolygons": native_stats.get("single_tile_polygons"),
        "multiTileSubjects": _median(summary, "clipper2-a2", "subject_count"),
        "candidateTiles": native_stats.get("candidate_tiles"),
        "nativeBooleanJobs": native_stats.get("native_boolean_jobs"),
        "requestBytes": _median(summary, "clipper2-a2", "request_bytes"),
        "responseBytes": _median(summary, "clipper2-a2", "response_bytes"),
        "outputBytes": artifacts.get("outputBytes"),
        "tileCount": artifacts.get("tileCount"),
        "vertices": artifacts.get("vertices"),
        "triangles": artifacts.get("triangles"),
        "candidateTileEnumerationMs": _median(summary, "clipper2-a2", "candidate_tile_enumeration_ms"),
        "requestEncodeMs": _median(summary, "clipper2-a2", "request_encode_ms"),
        "nativeBatchCallMs": _median(summary, "clipper2-a2", "native_batch_call_ms"),
        "responseDecodeMs": _median(summary, "clipper2-a2", "response_decode_validate_ms"),
        "nodePackMs": _median(summary, "clipper2-a2", "total_ms"),
        "objectCount": input_identity.get("objects"),
    }


def _first_artifact_statistics(report: dict[str, Any]) -> dict[str, Any]:
    for mode in ["clipper2-a2", "js"]:
        trials = report.get("modes", {}).get(mode) or []
        if trials:
            return trials[0].get("artifactStatistics") or {}
    return {}


def _first_geometry_statistics(report: dict[str, Any]) -> dict[str, Any]:
    trials = report.get("modes", {}).get("clipper2-a2") or report.get("modes", {}).get("js") or []
    return (trials[0].get("geometryStatistics") if trials else {}) or {}


def _suite_aggregate(projects: list[dict[str, Any]]) -> dict[str, Any]:
    speedups = [
        float(project.get("summary", {}).get("a2SpeedupVsJs"))
        for project in projects
        if not project.get("failed") and project.get("summary", {}).get("a2SpeedupVsJs")
    ]
    parity_failures = [
        project["name"]
        for project in projects
        if project.get("failed") or project.get("summary", {}).get("verifyPassed") is False
    ]
    worst = min(speedups) if speedups else None
    if parity_failures or not speedups:
        recommendation = "keep opt-in"
    elif worst is not None and worst < 0.95:
        recommendation = "keep opt-in"
    elif len(projects) >= 5:
        recommendation = "enable auto for benchmarked safe classes"
    else:
        recommendation = "keep opt-in"
    return {
        "geometricMeanSpeedup": _geomean(speedups),
        "worstCaseSpeedup": worst,
        "worstCaseSlowdown": (1.0 / worst) if worst and worst < 1.0 else None,
        "parityFailures": parity_failures,
        "recommendation": recommendation,
    }


def _geomean(values: list[float]) -> float | None:
    positives = [value for value in values if value > 0]
    if not positives:
        return None
    return math.exp(sum(math.log(value) for value in positives) / len(positives))


def _suite_markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Prism Semantic GLTF Benchmark Suite",
        "",
        f"- Projects: `{len(report.get('projects', []))}`",
        f"- Trials: `{report['methodology']['trials']}` measured, `{report['methodology']['warmups']}` warm-up",
        f"- Meshopt: `{report['methodology']['meshoptLevel']}`",
        f"- Geometric mean speedup: `{_fmt(report['aggregate'].get('geometricMeanSpeedup'))}x`",
        f"- Worst-case slowdown: `{_fmt(report['aggregate'].get('worstCaseSlowdown'))}x`",
        f"- Recommendation: `{report['aggregate'].get('recommendation')}`",
        "",
        "| Board | Category | Verify | JS median ms | A2 median ms | Speedup | Candidate ms | Native ms | Request bytes | Output bytes | Tiles | Vertices | Triangles |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for project in report.get("projects", []) or []:
        if project.get("failed"):
            lines.append(
                f"| {project.get('name')} | {project.get('category') or ''} | failed | - | - | - | - | - | - | - | - | - | - |"
            )
            continue
        summary = project.get("summary") or {}
        lines.append(
            "| "
            + " | ".join(
                [
                    str(project.get("name")),
                    str(project.get("category") or ""),
                    str(summary.get("verifyPassed")),
                    _fmt(summary.get("jsMedianSemanticTileTotalMs")),
                    _fmt(summary.get("a2MedianSemanticTileTotalMs")),
                    _fmt(summary.get("a2SpeedupVsJs")),
                    _fmt(summary.get("candidateTileEnumerationMs")),
                    _fmt(summary.get("nativeBatchCallMs")),
                    _fmt(summary.get("requestBytes")),
                    _fmt(summary.get("outputBytes")),
                    _fmt(summary.get("tileCount")),
                    _fmt(summary.get("vertices")),
                    _fmt(summary.get("triangles")),
                ]
            )
            + " |"
        )
    failures = report["aggregate"].get("parityFailures") or []
    lines.extend(["", "## Parity Failures", "", ", ".join(failures) if failures else "None"])
    return "\n".join(lines) + "\n"
