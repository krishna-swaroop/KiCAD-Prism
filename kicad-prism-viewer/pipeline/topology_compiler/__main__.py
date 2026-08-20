from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import sys
import time
from contextlib import contextmanager
from pathlib import Path

from .compiler import compile_topology
from .context import PrismCompilationContext
from .exporter import export_viewer_html
from .kicad_cli_export import export_project_geometry_assets, finalize_project_geometry
from .semantic_gltf import build_semantic_gltf_scene

_STAGE_TIMINGS_MS: dict[str, float] = {}
_PROFILE_EVENTS: list[dict] = []
REQUIRED_FROM_PROJECT_TIMINGS = (
    "design_load_ms",
    "netlist_ms",
    "design_json_topology_ms",
    "pcb_ir_ms",
    "pcb_ir_to_dict_ms",
    "pcb_metadata_unified_ms",
    "copper_emit_ms",
    "pcb_metadata_copper_ms",
    "board_compilation_ms",
)


def _progress(message: str) -> None:
    print(f"[semantic-visualizer] {time.strftime('%H:%M:%S')} {message}", flush=True)


def _profile(scope: str):
    def emit(key: str, values: dict) -> None:
        event = {"stage": f"{scope}.{key}", **values}
        _PROFILE_EVENTS.append(event)
        _progress(f"PROFILE {json.dumps(event, sort_keys=True, separators=(',', ':'))}")

    return emit


@contextmanager
def _stage(label: str):
    started = time.perf_counter()
    _progress(f"START {label}")
    try:
        yield
    finally:
        elapsed = time.perf_counter() - started
        key = _stage_metric_key(label)
        if key:
            _STAGE_TIMINGS_MS[key] = elapsed * 1000.0
        _progress(f"DONE {label} ({elapsed:.1f}s)")


def _write_outputs(
    topology: dict,
    output_dir: Path,
    semantic_geometry: dict | None = None,
    *,
    emit_standalone_html: bool = True,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    topology_path = output_dir / "topology.json"
    html_path = output_dir / "viewer.html"
    topology_export = dict(topology)
    topology_export["physical_objects"] = [
        {key: value for key, value in item.items() if key != "geometry"}
        for item in topology.get("physical_objects", [])
    ]
    from .exporter import _compact_net_details
    topology_export["net_details"] = _compact_net_details(topology)
    topology_path.write_text(json.dumps(topology_export, indent=2), encoding="utf-8")
    if semantic_geometry:
        (output_dir / "semantic_geometry.json").write_text(json.dumps(semantic_geometry, indent=2), encoding="utf-8")
    if emit_standalone_html:
        export_viewer_html(
            topology_export,
            html_path,
            title=topology["design"].get("project", {}).get("filename", "KiCad 3D Viz"),
            semantic_geometry=semantic_geometry or {},
        )
    else:
        html_path.unlink(missing_ok=True)

def _discover_project_assets(project_file: Path) -> dict:
    root = project_file.parent
    design_outputs = root / "Design-Outputs"
    model_dir = design_outputs / "3DModel"
    glb = []
    step = []
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


def _resolve_semantic_tile_size(requested: str, pcb_metadata: dict) -> float:
    value = str(requested or "auto").strip().lower()
    if value != "auto":
        size = float(value)
        if size <= 0:
            raise ValueError("semantic tile size must be positive")
        return size
    board = pcb_metadata.get("board") if isinstance(pcb_metadata.get("board"), dict) else {}
    bbox = pcb_metadata.get("bbox_mm") or board.get("bbox_mm") or []
    if len(bbox) == 4:
        board_span = max(float(bbox[2]) - float(bbox[0]), float(bbox[3]) - float(bbox[1]))
        for size in (20.0, 40.0, 80.0, 160.0):
            if board_span <= size:
                return size
    return 160.0


def cmd_from_project(args: argparse.Namespace) -> None:
    _STAGE_TIMINGS_MS.clear()
    _PROFILE_EVENTS.clear()
    total_started = time.perf_counter()
    project_file = args.project
    _progress(f"from-project input={project_file} output={args.output}")
    _progress("START parallel KiCad GLB export lane")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as export_pool:
        export_future = export_pool.submit(
            export_project_geometry_assets,
            project_file,
            args.output,
            strict_components=args.strict_components,
            progress=_progress,
            profile_callback=_profile("kicad_cli"),
        )
        context = PrismCompilationContext(
            project_file,
            compatibility_design_json=args.compat_design_json,
            progress=_progress,
            profile=_profile("context"),
        )
        try:
            context.design
            # Overlap copper emit / board compilation with topology JSON work.
            board_future = export_pool.submit(lambda: context.board_compilation)
            design_payload = context.design_payload_for_topology
            board_future.result()
            pcb_metadata = context.pcb_metadata
        except Exception as exc:
            print(f"error: kicad_monkey failed to compile {project_file}: {exc}", file=sys.stderr)
            raise SystemExit(2)
        with _stage("compile topology model"):
            topology = compile_topology(design_payload, [], pcb_metadata, _discover_project_assets(project_file))
        tile_size_mm = _resolve_semantic_tile_size(args.tile_size, pcb_metadata)
        _profile("compiler")(
            "tile_size",
            {
                "requested": args.tile_size,
                "resolved_mm": tile_size_mm,
                "board_bbox_mm": pcb_metadata.get("bbox_mm"),
            },
        )
        try:
            export_artifacts = export_future.result()
            _STAGE_TIMINGS_MS["kicad_glb_ms"] = export_artifacts.elapsed_ms
            _profile("kicad_cli")(
                "lane_total",
                {"elapsed_ms": export_artifacts.elapsed_ms, "overlapped": True},
            )
            _progress(f"DONE parallel KiCad GLB export lane ({export_artifacts.elapsed_ms / 1000.0:.1f}s)")
            semantic_geometry = finalize_project_geometry(
                topology,
                export_artifacts,
                progress=_progress,
                profile_callback=_profile("kicad_cli"),
            )
            with _stage("build semantic GLTF scene tiles"):
                semantic_geometry["semantic_gltf"] = build_semantic_gltf_scene(
                    topology,
                    semantic_geometry,
                    context.semantic_geometry_source,
                    args.output,
                    pad_holes=context.pad_holes,
                    force_rebuild=args.force_rebuild,
                    clean_cache=args.clean_cache,
                    cache_dir=args.cache_dir,
                    meshopt_level=args.meshopt_level,
                    tile_size_mm=tile_size_mm,
                    progress=_progress,
                    profile_callback=_profile("semantic_gltf"),
                )
            semantic_geometry["assets"]["scene_manifest"] = "scene-gltf/scene.manifest.json"
        except Exception as exc:
            print(f"error: semantic PCB geometry export failed for {project_file}: {exc}", file=sys.stderr)
            raise SystemExit(3)
    topology["design"].setdefault("assets", {})["semantic_geometry"] = "semantic_geometry.json"
    topology["design"]["assets"]["geometry_mode"] = "semantic-gltf"
    with _stage("write final viewer bundle files"):
        _write_outputs(
            topology,
            args.output,
            semantic_geometry,
            emit_standalone_html=args.scope == "all",
        )
    artifact_manifest = write_artifact_manifest(args.output)
    _log_artifact_manifest(artifact_manifest)
    _STAGE_TIMINGS_MS.update(context.timings)
    _write_from_project_metrics(project_file, args.output, total_started, artifact_manifest)
    _progress("MILESTONE semantic-ready")
    _progress("from-project complete")


def _stage_metric_key(label: str) -> str | None:
    mapping = {
        "load KiCad project with kicad_monkey": "project_load_ms",
        "compile design JSON and indexes": "design_json_ms",
        "compile topology design JSON": "design_json_topology_ms",
        "emit renderer-ready PCB copper geometry": "copper_emit_ms",
        "derive PCB topology indexes from copper geometry": "pcb_metadata_copper_ms",
        "compile PCB IR": "pcb_ir_ms",
        "materialize PCB IR payload": "pcb_ir_to_dict_ms",
        "derive PCB topology indexes from IR": "pcb_metadata_unified_ms",
        "compile unified PCB artifacts": "board_compilation_ms",
        "export KiCad GLB context and component models": "kicad_glb_ms",
        "build semantic GLTF scene tiles": "semantic_tile_ms",
        "write final viewer bundle files": "final_write_ms",
    }
    return mapping.get(label)


def _write_from_project_metrics(
    project_file: Path,
    output_dir: Path,
    total_started: float,
    artifact_manifest: dict | None = None,
) -> None:
    metrics_path = os.environ.get("PRISM_TOPOLOGY_COMPILER_METRICS_PATH")
    if not metrics_path:
        return
    path = Path(metrics_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema": "prism.from_project_metrics_a0",
                "project": str(project_file),
                "output": str(output_dir),
                "clipperMode": os.environ.get("PRISM_SEMANTIC_CLIPPER", "auto"),
                **{key: _STAGE_TIMINGS_MS.get(key, 0.0) for key in REQUIRED_FROM_PROJECT_TIMINGS},
                **_STAGE_TIMINGS_MS,
                "artifactTotals": (artifact_manifest or {}).get("totalsByFamily", {}),
                "profileEvents": _PROFILE_EVENTS,
                "total_ms": (time.perf_counter() - total_started) * 1000.0,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def cmd_clipper2_info(args: argparse.Namespace) -> None:
    from .prism_clipper2 import prism_clipper2_library_info

    print(json.dumps(prism_clipper2_library_info(args.library), indent=2))


ARTIFACT_MANIFEST_SCHEMA = "prism.artifact_manifest_a0"


def _artifact_family(path: Path) -> str:
    parts = path.parts
    text = path.as_posix()
    if text == "topology.json":
        return "topology"
    if text == "semantic_geometry.json":
        return "semantic_geometry"
    if text == "viewer.html":
        return "viewer"
    if parts and parts[0] == "schematic-world":
        return "schematic_world"
    if parts and parts[0] == "schematic-vector":
        return "schematic_vector"
    if parts and parts[0] == "scene-gltf":
        return "semantic_gltf"
    if parts and parts[0] == "bom":
        return "bom"
    if text.endswith(".glb") or (parts and parts[0] in {"geometry", "source-export"}):
        return "geometry_glb"
    return "other"


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_artifact_manifest(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "artifact-manifest.json"
    files: list[dict] = []
    for path in sorted((item for item in output_dir.rglob("*") if item.is_file()), key=lambda item: item.relative_to(output_dir).as_posix()):
        rel = path.relative_to(output_dir)
        if rel.as_posix() == "artifact-manifest.json":
            continue
        family = _artifact_family(rel)
        files.append(
            {
                "path": rel.as_posix(),
                "bytes": path.stat().st_size,
                "family": family,
                "sha256": _file_sha256(path),
            }
        )
    totals: dict[str, dict[str, int]] = {
        family: {"bytes": 0, "files": 0}
        for family in [
            "topology",
            "semantic_geometry",
            "schematic_world",
            "schematic_vector",
            "semantic_gltf",
            "geometry_glb",
            "bom",
            "viewer",
            "other",
        ]
    }
    for item in files:
        bucket = totals.setdefault(item["family"], {"bytes": 0, "files": 0})
        bucket["bytes"] += int(item["bytes"])
        bucket["files"] += 1
    manifest = {
        "schema": ARTIFACT_MANIFEST_SCHEMA,
        "version": 0,
        "root": str(output_dir),
        "files": files,
        "totalsByFamily": totals,
        "totalBytes": sum(item["bytes"] for item in files),
        "totalFiles": len(files),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def _log_artifact_manifest(manifest: dict) -> None:
    _progress(f"artifact inventory total={manifest.get('totalBytes', 0) / 1_000_000:.2f} MB files={manifest.get('totalFiles', 0)}")
    families = sorted(
        ((family, data) for family, data in (manifest.get("totalsByFamily") or {}).items()),
        key=lambda item: (-int(item[1].get("bytes") or 0), item[0]),
    )
    for family, data in families:
        if not data.get("bytes") and not data.get("files"):
            continue
        _progress(f"artifact family {family}: {int(data.get('bytes') or 0) / 1_000_000:.2f} MB files={int(data.get('files') or 0)}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="topology_compiler")
    sub = parser.add_subparsers(required=True)

    from_project = sub.add_parser("from-project", help="Compile directly from a KiCad project")
    from_project.add_argument("project", type=Path)
    from_project.add_argument("--output", type=Path, required=True)
    from_project.add_argument("--strict-components", action="store_true", help="Fail if component model export cannot complete")
    from_project.add_argument("--force-rebuild", action="store_true", help="Ignore cached generated viewer assets")
    from_project.add_argument("--clean-cache", action="store_true", help="Ignore and replace persistent compiler caches")
    from_project.add_argument("--cache-dir", type=Path, help="Persistent compiler cache directory")
    from_project.add_argument(
        "--compat-design-json",
        action="store_true",
        help="Use the legacy indexed design JSON payload for topology compilation",
    )
    from_project.add_argument(
        "--scope",
        choices=["3d", "all"],
        default="all",
        help="Generate WebGPU 3D assets, or also emit the standalone viewer HTML",
    )
    from_project.add_argument(
        "--meshopt-level",
        choices=["low", "medium", "high"],
        default="medium",
        help="Meshoptimizer compression level for semantic GLTF tiles",
    )
    from_project.add_argument(
        "--tile-size",
        default="auto",
        help="Semantic GLTF tile edge length in millimetres, or auto for a board-adaptive size",
    )
    from_project.set_defaults(func=cmd_from_project)

    clipper2_info = sub.add_parser("clipper2-info", help="Print bundled Prism Clipper2 library diagnostics")
    clipper2_info.add_argument("--library", type=Path, help="Explicit libprism_clipper2 shared library path")
    clipper2_info.set_defaults(func=cmd_clipper2_info)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
