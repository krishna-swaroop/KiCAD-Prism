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

from .copper_geometry import native_helper_path, pcb_geometry_backend


DEFAULT_KICAD_CLI = Path("/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
# a7: the solder mask comes from soldermask.py, not the kicad-cli board export.
BOARD_CONTEXT_CACHE_VERSION = "board-context-no-mask-a7"
NATIVE_BOARD_CONTEXT_CACHE_VERSION = "native-board-body-a0"


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
    # Board-mm mask polygons per side (soldermask.soldermask_polygons), or None.
    soldermask: dict[str, Any] | None = None


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
        if pcb_geometry_backend() == "rust":
            result = _run_native_board_export(
                pcb_file,
                geometry_dir,
                cache_dir=cache_dir,
                cache_key=f"{pcb_hash}-{NATIVE_BOARD_CONTEXT_CACHE_VERSION}",
                progress=progress,
            )
        else:
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

    def build_mask() -> dict[str, Any] | None:
        # The default backend builds the PCB IR in-process and the mask is made
        # from it in finalize_project_geometry. The others never parse the board
        # in Python, so the mask parses it here, in its own process so parsing
        # and clipping do not contend for the GIL with the topology compile.
        if pcb_geometry_backend() == "legacy":
            return None
        if _soldermask_cache_path(cache_dir, pcb_hash).is_file():
            return None
        from .soldermask import soldermask_polygons_from_file

        started = time.perf_counter()
        try:
            with concurrent.futures.ProcessPoolExecutor(max_workers=1) as mask_pool:
                polygons = mask_pool.submit(soldermask_polygons_from_file, str(pcb_file)).result()
        except Exception as exc:
            # The board still renders without a mask; say why it is missing.
            if progress:
                progress(f"warning: solder mask not built: {exc}")
            return None
        if profile_callback:
            profile_callback(
                "soldermask.polygons",
                {"elapsed_ms": (time.perf_counter() - started) * 1000.0},
            )
        return polygons

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
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            board_future = pool.submit(export_board)
            component_future = pool.submit(export_components)
            mask_future = pool.submit(build_mask)
            board_export = board_future.result()
            component_export = component_future.result()
            soldermask = mask_future.result()
    else:
        board_export = export_board()
        component_export = export_components()
        soldermask = build_mask()
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
        soldermask=soldermask,
    )


def finalize_project_geometry(
    topology: dict[str, Any],
    artifacts: GeometryExportArtifacts,
    *,
    soldermask_source: Callable[[], dict[str, Any] | None] | None = None,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Join completed KiCad exports with topology-dependent semantic metadata.

    ``soldermask_source`` builds the mask polygons from an IR the caller already
    has; it is only called when no cached mask exists for this board.
    """

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
    native_board = any(item.label == "native_board_context" for item in exports)
    visibility_groups = [
        {
            "id": "board",
            "label": "Board",
            "asset": "geometry/base_board.glb",
            "mesh_name_contains": ["_PCB"],
        },
        {
            "id": "silkscreen",
            "label": "Silkscreen",
            "asset": "geometry/base_board.glb",
            "mesh_name_contains": ["_silkscreen"],
        },
        {
            "id": "components",
            "label": "Components",
            "asset": "geometry/components.glb",
            "mesh_name_contains": [],
        },
    ]
    manifest = {
        "schema": "prism.semantic_geometry_a0",
        "generator": (
            "prism-native-board+kicad-cli-components"
            if native_board else "kicad-cli"
        ),
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
        "visibility_groups": visibility_groups,
    }
    soldermask_asset = _write_soldermask_glb(
        topology,
        artifacts,
        soldermask_source=soldermask_source,
        progress=progress,
        profile_callback=profile_callback,
    )
    if soldermask_asset:
        manifest["assets"]["soldermask_glb"] = soldermask_asset
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
        "backend": "native" if result.label == "native_board_context" else "kicad-cli",
        "elapsed_ms": float(result.elapsed_ms),
        "cache_hit": result.stdout == "cache hit",
        "bytes": result.path.stat().st_size if result.path.exists() else 0,
        "warnings": len(_warning_lines(result.stdout + "\n" + result.stderr)),
    }


def _soldermask_cache_path(cache_dir: Path, pcb_hash: str) -> Path:
    """Cached mask GLB for a board, keyed by the code that builds it too."""

    from .soldermask import SOLDERMASK_VERSION

    here = Path(__file__).resolve()
    code = hashlib.sha256()
    for source in (
        here.parent / "soldermask.py",
        here.parent / "pcb_geometry.py",
        here.parents[2] / "tools" / "semantic-gltf" / "build.mjs",
    ):
        if source.is_file():
            code.update(source.read_bytes())
    return cache_dir / f"soldermask-{pcb_hash}-{SOLDERMASK_VERSION}-{code.hexdigest()[:12]}.glb"


def _write_soldermask_glb(
    topology: dict[str, Any],
    artifacts: GeometryExportArtifacts,
    *,
    soldermask_source: Callable[[], dict[str, Any] | None] | None = None,
    progress: Callable[[str], None] | None = None,
    profile_callback: Callable[[str, dict[str, Any]], None] | None = None,
) -> str | None:
    """Place the mask at its stackup height and pack it; the asset path or None."""

    from .soldermask import place_soldermask

    geometry_dir = artifacts.output_dir / "geometry"
    output_path = geometry_dir / "soldermask.glb"
    cache_path = _soldermask_cache_path(artifacts.output_dir.parent / ".cache" / "geometry", artifacts.pcb_hash)
    if cache_path.is_file() and cache_path.stat().st_size:
        shutil.copy2(cache_path, output_path)
        if progress:
            progress(f"solder mask: cache hit ({output_path.stat().st_size / 1_000_000:.1f} MB)")
        return "geometry/soldermask.glb"

    started = time.perf_counter()
    polygons = artifacts.soldermask
    if polygons is None and soldermask_source is not None:
        try:
            polygons = soldermask_source()
        except Exception as exc:
            # The board still renders without a mask; say why it is missing.
            if progress:
                progress(f"warning: solder mask not built: {exc}")
            return None
        if profile_callback:
            profile_callback(
                "soldermask.polygons",
                {"elapsed_ms": (time.perf_counter() - started) * 1000.0},
            )
    document = place_soldermask(polygons, topology)
    if not document:
        return None
    started = time.perf_counter()
    input_path = geometry_dir / "soldermask.json"
    input_path.write_text(json.dumps(document), encoding="utf-8")
    tool = Path(__file__).resolve().parents[2] / "tools" / "semantic-gltf" / "build.mjs"
    try:
        packed = subprocess.run(
            ["node", str(tool), str(input_path), str(geometry_dir)],
            text=True,
            capture_output=True,
            timeout=float(os.environ.get("PRISM_KICAD_NATIVE_TIMEOUT_SECONDS", "300")),
        )
    finally:
        input_path.unlink(missing_ok=True)
    if packed.returncode != 0 or not output_path.is_file():
        if progress:
            detail = packed.stderr.strip() or packed.stdout.strip() or "no diagnostic output"
            progress(f"warning: solder mask GLB not written: {detail}")
        return None
    if profile_callback:
        profile_callback(
            "soldermask.glb",
            {"elapsed_ms": (time.perf_counter() - started) * 1000.0, "bytes": output_path.stat().st_size},
        )
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output_path, cache_path)
    except OSError:
        pass
    return "geometry/soldermask.glb"


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
        str(pcb_file),
    ]


def _run_native_board_export(
    pcb_file: Path,
    geometry_dir: Path,
    *,
    cache_dir: Path,
    cache_key: str,
    progress: Callable[[str], None] | None = None,
) -> ExportResult:
    helper = native_helper_path()
    if not helper.is_file() or not os.access(helper, os.X_OK):
        raise RuntimeError(f"native board helper is unavailable or not executable: {helper}")
    output_path = geometry_dir / "base_board.glb"
    helper_version = _native_helper_version(helper)
    cache_path = cache_dir / f"{_slug(f'{cache_key}-{helper_version}')}.glb"
    command = [
        str(helper),
        "compile-board-body",
        "--pcb",
        str(pcb_file),
        "--output",
        str(geometry_dir / ".native-board-pack"),
        "--mesh-tolerance-mm",
        "0.005",
    ]
    if cache_path.is_file() and cache_path.stat().st_size:
        shutil.copy2(cache_path, output_path)
        if progress:
            progress(
                f"native board export: cache hit ({output_path.stat().st_size / 1_000_000:.1f} MB)"
            )
        return ExportResult(
            "native_board_context", command, output_path, 0, "cache hit", ""
        )
    if progress:
        progress("native board export: start")
    pack_dir = geometry_dir / ".native-board-pack"
    shutil.rmtree(pack_dir, ignore_errors=True)
    started = time.perf_counter()
    timeout = float(os.environ.get("PRISM_KICAD_NATIVE_TIMEOUT_SECONDS", "300"))
    output_path.unlink(missing_ok=True)
    try:
        compiled = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        if compiled.returncode != 0:
            detail = (
                compiled.stderr.strip()
                or compiled.stdout.strip()
                or "no diagnostic output"
            )
            raise RuntimeError(
                f"native board compiler failed with exit code {compiled.returncode}: {detail}"
            )
        metadata_path = pack_dir / "board-mesh-pack.json"
        if not metadata_path.is_file():
            raise RuntimeError("native board compiler did not write board-mesh-pack.json")
        tool = Path(__file__).resolve().parents[2] / "tools" / "semantic-gltf" / "build.mjs"
        packed = subprocess.run(
            ["node", str(tool), str(metadata_path), str(geometry_dir)],
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        if (
            packed.returncode != 0
            or not output_path.is_file()
            or not output_path.stat().st_size
        ):
            detail = packed.stderr.strip() or packed.stdout.strip() or "no diagnostic output"
            raise RuntimeError(f"native board GLB packer failed: {detail}")
    finally:
        shutil.rmtree(pack_dir, ignore_errors=True)
    shutil.copy2(output_path, cache_path)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if progress:
        progress(
            f"native board export: done {elapsed_ms / 1000:.2f}s "
            f"({output_path.stat().st_size / 1_000_000:.1f} MB)"
        )
    return ExportResult(
        "native_board_context",
        command,
        output_path,
        elapsed_ms,
        compiled.stdout,
        "\n".join(value for value in (compiled.stderr, packed.stderr) if value),
    )


def _native_helper_version(helper: Path) -> str:
    completed = subprocess.run(
        [str(helper), "--version"], text=True, capture_output=True, timeout=15
    )
    if completed.returncode != 0:
        raise RuntimeError(f"could not query native board helper version: {completed.stderr}")
    digest = hashlib.sha256(helper.read_bytes()).hexdigest()[:16]
    return _slug(f"{completed.stdout.strip()}-{digest}")[:120]


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
