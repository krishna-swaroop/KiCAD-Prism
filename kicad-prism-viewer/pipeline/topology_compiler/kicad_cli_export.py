from __future__ import annotations

import concurrent.futures
import json
import hashlib
import os
import re
import shutil
import struct
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


DEFAULT_KICAD_CLI = Path("/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
BOARD_CONTEXT_CACHE_VERSION = "board-context-no-pads-a6"


@dataclass
class ExportResult:
    label: str
    command: list[str]
    path: Path
    elapsed_ms: int
    stdout: str
    stderr: str

    def to_dict(self, base_dir: Path) -> dict[str, Any]:
        return {
            "label": self.label,
            "path": self.path.relative_to(base_dir).as_posix(),
            "bytes": self.path.stat().st_size if self.path.exists() else 0,
            "elapsed_ms": self.elapsed_ms,
            "command": self.command,
            "warnings": _warning_lines(self.stdout + "\n" + self.stderr),
        }


@dataclass
class GeometryExportArtifacts:
    project_file: Path
    pcb_file: Path
    output_dir: Path
    cli: Path
    cli_version: str
    pcb_hash: str
    exports: list[ExportResult]
    elapsed_ms: float


def find_kicad_cli() -> Path:
    configured = os.environ.get("KICAD_CLI")
    if configured:
        path = Path(configured)
        if path.exists():
            return path
    resolved = shutil.which("kicad-cli")
    if resolved:
        return Path(resolved)
    if DEFAULT_KICAD_CLI.exists():
        return DEFAULT_KICAD_CLI
    raise FileNotFoundError("Could not find kicad-cli. Set KICAD_CLI or install KiCad 10+.")


def export_project_geometry(
    project_file: Path,
    topology: dict[str, Any],
    output_dir: Path,
    *,
    strict_components: bool = False,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Export KiCad-owned 3D geometry and a semantic sidecar."""

    artifacts = export_project_geometry_assets(
        project_file,
        output_dir,
        strict_components=strict_components,
        progress=progress,
        profile_callback=profile_callback,
    )
    return finalize_project_geometry(
        topology,
        artifacts,
        progress=progress,
        profile_callback=profile_callback,
    )


def export_project_geometry_assets(
    project_file: Path,
    output_dir: Path,
    *,
    strict_components: bool = False,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> GeometryExportArtifacts:
    """Export board and component GLBs without waiting for topology compilation."""

    lane_started = time.perf_counter()
    cli = find_kicad_cli()
    pcb_file = project_file.with_suffix(".kicad_pcb")
    if not pcb_file.exists():
        raise FileNotFoundError(f"KiCad PCB file not found: {pcb_file}")

    geometry_dir = output_dir / "geometry"
    cache_dir = output_dir.parent / ".cache" / "geometry"
    geometry_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    pcb_bytes = pcb_file.read_bytes()
    pcb_hash = hashlib.sha256(pcb_bytes).hexdigest()
    if profile_callback:
        profile_callback(
            "pcb_hash",
            {"elapsed_ms": (time.perf_counter() - started) * 1000.0, "bytes": len(pcb_bytes)},
        )
    started = time.perf_counter()
    cli_version = _cli_version(cli)
    if profile_callback:
        profile_callback("version", {"elapsed_ms": (time.perf_counter() - started) * 1000.0})
    if progress:
        progress(f"kicad-cli version={cli_version} pcb={pcb_file.name}")

    board_export_args = _board_context_export_args(geometry_dir, pcb_file)
    component_export_args = [
        "pcb",
        "export",
        "glb",
        "--force",
        "--output",
        str(geometry_dir / "components.glb"),
        "--no-board-body",
        str(pcb_file),
    ]

    def export_board() -> ExportResult:
        result = _run_cached_export(
            "board_context",
            cli,
            board_export_args,
            cache_dir=cache_dir,
            cache_key=f"{pcb_hash}-{cli_version}-{BOARD_CONTEXT_CACHE_VERSION}",
            progress=progress,
        )
        if progress:
            progress(
                "MILESTONE board-ready "
                f"path=geometry/base_board.glb bytes={result.path.stat().st_size if result.path.exists() else 0}"
            )
        return result

    def export_components() -> ExportResult:
        result = _run_cached_export(
            "components",
            cli,
            component_export_args,
            check=strict_components,
            cache_dir=cache_dir,
            cache_key=f"{pcb_hash}-{cli_version}-components",
            progress=progress,
        )
        if progress and result.path.exists():
            progress(
                "MILESTONE components-ready "
                f"path=geometry/components.glb bytes={result.path.stat().st_size}"
            )
        return result

    parallel_exports = os.environ.get("PRISM_KICAD_EXPORT_PARALLEL", "1").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    export_started = time.perf_counter()
    if parallel_exports:
        if progress:
            progress("kicad-cli exports: guarded parallel mode")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            board_future = pool.submit(export_board)
            component_future = pool.submit(export_components)
            board_export = board_future.result()
            component_export = component_future.result()
    else:
        board_export = export_board()
        component_export = export_components()
    if profile_callback:
        profile_callback(
            "exports.wall",
            {
                "elapsed_ms": (time.perf_counter() - export_started) * 1000.0,
                "parallel": parallel_exports,
            },
        )

    exports = [board_export, component_export]
    if profile_callback:
        profile_callback("export.board_context", _export_profile(board_export))
    if profile_callback:
        profile_callback("export.components", _export_profile(component_export))
    if strict_components and not component_export.path.exists():
        raise RuntimeError("Component GLB export failed in strict component mode")

    return GeometryExportArtifacts(
        project_file=project_file,
        pcb_file=pcb_file,
        output_dir=output_dir,
        cli=cli,
        cli_version=cli_version,
        pcb_hash=pcb_hash,
        exports=exports,
        elapsed_ms=(time.perf_counter() - lane_started) * 1000.0,
    )


def finalize_project_geometry(
    topology: dict[str, Any],
    artifacts: GeometryExportArtifacts,
    *,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Join completed KiCad exports with topology-dependent semantic metadata."""

    output_dir = artifacts.output_dir
    geometry_dir = output_dir / "geometry"
    project_file = artifacts.project_file
    pcb_file = artifacts.pcb_file
    cli = artifacts.cli
    cli_version = artifacts.cli_version
    pcb_hash = artifacts.pcb_hash
    exports = artifacts.exports

    connected_nets = [
        net
        for net in topology.get("nets", [])
        if str(net.get("name") or "") and not str(net.get("name") or "").startswith("unconnected-")
    ]
    if progress:
        progress(f"semantic geometry metadata connected_nets={len(connected_nets)} components={len(topology.get('components', []) or [])}")
    started = time.perf_counter()
    components = _component_nodes(geometry_dir / "components.glb")
    if profile_callback:
        profile_callback(
            "inspect.components_glb",
            {"elapsed_ms": (time.perf_counter() - started) * 1000.0, "components": len(components)},
        )
    manifest = {
        "schema": "prism.semantic_geometry_a0",
        "generator": "kicad-cli",
        "packing_mode": "semantic-pcb-ir",
        "connected_net_count": len(connected_nets),
        "kicad_cli": str(cli),
        "kicad_cli_version": cli_version,
        "pcb_sha256": pcb_hash,
        "project": str(project_file),
        "pcb": str(pcb_file),
        "coordinate_system": {
            "runtime_axes": "glTF",
            "board_plane": "X/Z",
            "thickness_axis": "Y",
            "top_view_camera": "+Y orthographic",
        },
        "assets": {
            "base_board_glb": "geometry/base_board.glb",
            "components_glb": "geometry/components.glb",
        },
        "exports": [item.to_dict(output_dir) for item in exports],
        "components": components,
        "visibility_groups": [
            {"id": "board", "label": "Board", "asset": "geometry/base_board.glb", "mesh_name_contains": ["_PCB"]},
            {"id": "silkscreen", "label": "Silkscreen", "asset": "geometry/base_board.glb", "mesh_name_contains": ["_silkscreen"]},
            {"id": "components", "label": "Components", "asset": "geometry/components.glb", "mesh_name_contains": []},
        ],
    }
    manifest_path = output_dir / "semantic_geometry.json"
    started = time.perf_counter()
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if profile_callback:
        profile_callback(
            "write.semantic_geometry",
            {"elapsed_ms": (time.perf_counter() - started) * 1000.0, "bytes": manifest_path.stat().st_size},
        )
    return manifest


def _export_profile(result: ExportResult) -> dict[str, Any]:
    return {
        "elapsed_ms": float(result.elapsed_ms),
        "cache_hit": result.stdout == "cache hit",
        "bytes": result.path.stat().st_size if result.path.exists() else 0,
        "warnings": len(_warning_lines(result.stdout + "\n" + result.stderr)),
    }


def _board_context_export_args(geometry_dir: Path, pcb_file: Path) -> list[str]:
    return [
        "pcb",
        "export",
        "glb",
        "--force",
        "--output",
        str(geometry_dir / "base_board.glb"),
        "--no-components",
        "--include-silkscreen",
        "--include-soldermask",
        str(pcb_file),
    ]


def _cli_version(cli: Path) -> str:
    proc = subprocess.run([str(cli), "--version"], text=True, capture_output=True)
    value = (proc.stdout or proc.stderr).strip()
    return _slug(value)[:80] or "unknown"


def _run_cached_export(
    label: str,
    cli: Path,
    args: list[str],
    *,
    cache_dir: Path,
    cache_key: str,
    check: bool = True,
    progress: Callable[[str], None] | None = None,
) -> ExportResult:
    output_path = Path(args[args.index("--output") + 1])
    cache_path = cache_dir / f"{_slug(cache_key)}{output_path.suffix}"
    if cache_path.exists() and cache_path.stat().st_size:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cache_path, output_path)
        if progress:
            progress(f"kicad-cli export {label}: cache hit ({output_path.stat().st_size / 1_000_000:.1f} MB)")
        return ExportResult(label, [str(cli), *args], output_path, 0, "cache hit", "")
    if progress:
        progress(f"kicad-cli export {label}: start")
    result = _run_export(label, cli, args, check=check)
    if result.path.exists() and result.path.stat().st_size:
        shutil.copy2(result.path, cache_path)
    if progress:
        size_mb = result.path.stat().st_size / 1_000_000 if result.path.exists() else 0.0
        progress(f"kicad-cli export {label}: done {result.elapsed_ms / 1000:.1f}s ({size_mb:.1f} MB)")
    return result


def _run_export(label: str, cli: Path, args: list[str], *, check: bool = True) -> ExportResult:
    command = [str(cli), *args]
    output_path = Path(args[args.index("--output") + 1]) if "--output" in args else Path()
    started = time.perf_counter()
    proc = subprocess.run(command, text=True, capture_output=True)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"kicad-cli export failed for {label} with exit code {proc.returncode}\n"
            f"stdout:\n{proc.stdout}\n\nstderr:\n{proc.stderr}"
        )
    if check and (not output_path.exists() or output_path.stat().st_size == 0):
        raise RuntimeError(f"kicad-cli export for {label} did not create {output_path}")
    return ExportResult(label, command, output_path, elapsed_ms, proc.stdout, proc.stderr)


def _warning_lines(text: str) -> list[str]:
    warnings = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if "warning" in lower or "error" in lower or "could not" in lower or "skipped" in lower:
            warnings.append(stripped)
    return warnings


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "unnamed"


def _glb_json(path: Path) -> dict[str, Any]:
    if not path.exists() or path.stat().st_size < 20:
        return {}
    data = path.read_bytes()
    if data[:4] != b"glTF":
        return {}
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        return {}
    return json.loads(data[20 : 20 + chunk_len].decode("utf-8"))


def _component_nodes(path: Path) -> list[dict[str, Any]]:
    gltf = _glb_json(path)
    nodes = gltf.get("nodes", []) or []
    meshes = gltf.get("meshes", []) or []
    designator_re = re.compile(r"^[A-Z]+[0-9]+[A-Z]?$")
    components = []
    for index, node in enumerate(nodes):
        name = str(node.get("name") or "")
        if not designator_re.match(name):
            continue
        child_meshes = []
        for child in node.get("children", []) or []:
            child_meshes.extend(_collect_mesh_names(nodes, meshes, int(child)))
        components.append({"designator": name, "node_index": index, "mesh_names": sorted(set(child_meshes))})
    return components


def _collect_mesh_names(nodes: list[dict[str, Any]], meshes: list[dict[str, Any]], node_index: int) -> list[str]:
    if node_index < 0 or node_index >= len(nodes):
        return []
    node = nodes[node_index]
    names = []
    mesh_index = node.get("mesh")
    if isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes):
        names.append(str(meshes[mesh_index].get("name") or f"mesh_{mesh_index}"))
    for child in node.get("children", []) or []:
        names.extend(_collect_mesh_names(nodes, meshes, int(child)))
    return names
