import datetime
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Optional

from app.core.config import settings
from app.services import path_config_service
from app.services.job_service import jobs
from app.services.semantic_viewer_runtime import find_viewer_repo_root, pythonpath as semantic_viewer_pythonpath

SCHEMA = "prism.visualizer_bundle.a0"
GENERATOR_NAME = "kicad-prism-webgpu-3d"
GENERATOR_VERSION = "0.2.0"


def _compute_build_fingerprint() -> str:
    base = f"{GENERATOR_NAME}-{GENERATOR_VERSION}-semantic-gltf-a0-stackup-a2-prism-host-a0"
    try:
        from app.services.semantic_viewer_runtime import find_viewer_repo_root
        viewer_root = find_viewer_repo_root()
        inputs = [
            "pipeline/topology_compiler/__main__.py",
            "pipeline/topology_compiler/compiler.py",
            "pipeline/topology_compiler/context.py",
            "pipeline/topology_compiler/copper_geometry.py",
            "pipeline/topology_compiler/pcb_extract.py",
            # Every pad and track outline is built here, so a change to it has
            # to invalidate cached bundles the same way pcb_extract does.
            "pipeline/topology_compiler/pcb_geometry.py",
            "pipeline/topology_compiler/semantic_gltf.py",
            "pipeline/topology_compiler/kicad_cli_export.py",
            "pipeline/topology_compiler/exporter.py",
            "package.json",
            "package-lock.json",
            "requirements-runtime.txt",
            "pyproject.toml",
            "viewer/app.js",
            "viewer/styles.css",
            "viewer/viewer.template.html",
        ]
        hasher = hashlib.sha256()
        hasher.update(base.encode("utf-8"))
        hasher.update(os.environ.get("PRISM_COPPER_EMIT_ENABLED", "").encode("utf-8"))
        hasher.update(os.environ.get("PRISM_KICAD_MONKEY_SOURCE", "").encode("utf-8"))
        for rel_path in inputs:
            path = viewer_root / rel_path
            if path.is_file():
                hasher.update(path.read_bytes())
        monkey_spec = importlib.util.find_spec("kicad_monkey")
        if monkey_spec and monkey_spec.origin:
            copper_module = Path(monkey_spec.origin).parent / "kicad_copper_geometry.py"
            if copper_module.is_file():
                hasher.update(copper_module.read_bytes())
        return f"{base}_{hasher.hexdigest()[:8]}"
    except Exception:
        return base


BUILD_FINGERPRINT = _compute_build_fingerprint()
_BUILD_LOCKS: dict[str, threading.Lock] = {}
_BUILD_LOCKS_GUARD = threading.Lock()


def _prune_stale_bundles(project_id: str, source_hash: str, *, keep_build: str = BUILD_FINGERPRINT) -> list[str]:
    parent = bundle_dir(project_id, source_hash, keep_build).parent
    keep_dir = bundle_dir(project_id, source_hash, keep_build).resolve()
    removed: list[str] = []
    if not parent.is_dir():
        return removed
    for path in parent.iterdir():
        if not path.is_dir() or path.resolve() == keep_dir:
            continue
        shutil.rmtree(path)
        removed.append(path.name.rsplit("_", 1)[-1])
    return removed


SOURCE_SUFFIXES = {
    ".kicad_pro",
    ".kicad_sch",
    ".kicad_pcb",
    ".kicad_sym",
    ".kicad_mod",
    ".kicad_jobset",
    ".lib",
    ".dcm",
    ".wrl",
    ".step",
    ".stp",
    ".glb",
    ".json",
}
MESHOPT_LEVELS = {"low", "medium", "high"}
ARTIFACT_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$")


def semantic_store_root() -> Path:
    root = Path(settings.KICAD_PROJECTS_ROOT) / ".kicad-prism" / "semantic-visualizer"
    root.mkdir(parents=True, exist_ok=True)
    return root


def semantic_compiler_cache_root() -> Path:
    configured = os.environ.get("PRISM_SEMANTIC_VIEWER_CACHE", "").strip()
    root = Path(configured).expanduser() if configured else semantic_store_root() / ".cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def semantic_meshopt_level() -> str:
    level = os.environ.get("PRISM_SEMANTIC_GLTF_MESHOPT_LEVEL", "medium").strip().lower()
    return level if level in MESHOPT_LEVELS else "medium"


def semantic_tile_size_mm() -> str:
    configured = os.environ.get("PRISM_SEMANTIC_GLTF_TILE_SIZE_MM", "auto").strip().lower()
    if configured == "auto":
        return "auto"
    try:
        value = float(configured)
    except ValueError:
        return "auto"
    return str(value) if 1.0 <= value <= 1000.0 else "auto"


def find_kicad_project(project_path: str) -> Path:
    root = Path(project_path)
    config = path_config_service.get_path_config(project_path)
    configured = getattr(config, "project", None) or getattr(config, "project_file", None)
    if configured:
      candidate = (root / str(configured)).resolve()
      if candidate.is_file() and candidate.suffix == ".kicad_pro":
          return candidate
    direct = sorted(root.glob("*.kicad_pro"))
    if direct:
        return direct[0]
    nested = sorted(path for path in root.rglob("*.kicad_pro") if ".git" not in path.parts)
    if nested:
        return nested[0]
    raise ValueError(".kicad_pro file not found")


def source_fingerprint(project_path: str) -> str:
    return source_fingerprint_for_root(Path(project_path))


def source_fingerprint_for_root(
    project_root: Path,
    profile_callback: Callable[[str, Dict[str, Any]], None] | None = None,
) -> str:
    root = project_root.resolve()
    digest = hashlib.sha256()
    started = time.perf_counter()
    files = 0
    bytes_read = 0
    metadata_only_files = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.name == ".prism.json":
            continue
        if path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        rel = path.relative_to(root).as_posix()
        stat = path.stat()
        files += 1
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        if stat.st_size > 32 * 1024 * 1024:
            digest.update(f"large:{stat.st_size}:{int(stat.st_mtime_ns)}".encode("utf-8"))
            metadata_only_files += 1
        else:
            digest.update(path.read_bytes())
            bytes_read += stat.st_size
        digest.update(b"\0")
    if profile_callback:
        profile_callback(
            "source_fingerprint",
            {
                "elapsed_ms": (time.perf_counter() - started) * 1000.0,
                "files": files,
                "bytes_read": bytes_read,
                "metadata_only_files": metadata_only_files,
            },
        )
    return digest.hexdigest()[:32]


def source_fingerprint_for_project_file(project_file: Path) -> str:
    return source_fingerprint_for_root(project_file.resolve().parent)


def _artifact_segment(value: object, label: str) -> str:
    segment = str(value or "")
    if not ARTIFACT_SEGMENT_PATTERN.fullmatch(segment):
        raise ValueError(f"Invalid {label}")
    return segment


def bundle_dir(project_id: str, source_hash: str, build_hash: str = BUILD_FINGERPRINT) -> Path:
    project_segment = _artifact_segment(project_id, "project ID")
    source_segment = _artifact_segment(source_hash, "source revision key")
    build_segment = _artifact_segment(build_hash, "generator build")
    return semantic_store_root() / project_segment / source_segment / build_segment


def bundle_path(project_id: str, source_hash: str, build_hash: str = BUILD_FINGERPRINT) -> Path:
    return bundle_dir(project_id, source_hash, build_hash) / "bundle.json"


def bundle_url(project_id: str, source_hash: str, build_hash: str = BUILD_FINGERPRINT) -> str:
    return f"/api/projects/{project_id}/webgpu-3d/assets/{source_hash}/{build_hash}/bundle.json"


def _build_lock(project_id: str, source_hash: str) -> threading.Lock:
    key = f"{project_id}:{source_hash}"
    with _BUILD_LOCKS_GUARD:
        lock = _BUILD_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _BUILD_LOCKS[key] = lock
        return lock


def get_status(project: Any, commit: str | None = None) -> Dict[str, Any]:
    if commit:
        return get_status_for_commit(project, commit)
    current_source = source_fingerprint(project.path)
    return get_status_for_source(project, current_source)


def get_status_fast(project: Any, commit: str | None = None) -> Dict[str, Any]:
    """Read readiness metadata only; never scan sources or invoke git."""

    resolved_commit: str | None = None
    unresolved_ref = False
    if commit:
        normalized_commit = commit.strip().lower()
        if re.fullmatch(r"[0-9a-f]{40}", normalized_commit):
            resolved_commit = normalized_commit
            selector = f"commit:{resolved_commit}"
            cached = jobs.get_webgpu_ready(
                str(project.id),
                selector,
                BUILD_FINGERPRINT,
            )
        elif re.fullmatch(r"[0-9a-f]{7,39}", normalized_commit):
            cached = jobs.find_webgpu_ready_by_commit_prefix(
                str(project.id),
                BUILD_FINGERPRINT,
                normalized_commit,
            )
            if cached and cached.get("commit"):
                resolved_commit = str(cached["commit"])
                selector = str(
                    cached.get("status_selector") or f"commit:{resolved_commit}"
                )
            else:
                selector = f"commit:{normalized_commit}"
        else:
            # Symbolic refs require git; keep the fast path O(1) and let
            # diagnostic=true callers resolve through get_status().
            unresolved_ref = True
            selector = f"ref:{commit.strip()}"
            cached = None
    else:
        selector = f"workspace:{getattr(project, 'last_modified', '') or ''}"
        cached = jobs.get_webgpu_ready(
            str(project.id),
            selector,
            BUILD_FINGERPRINT,
        )
    if cached:
        return cached
    payload: Dict[str, Any] = {
        "schema": "prism.webgpu_3d_status_a0",
        "project_id": project.id,
        "source_fingerprint": None,
        "sourceRevisionKey": None,
        "build_fingerprint": BUILD_FINGERPRINT,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": BUILD_FINGERPRINT,
        },
        "artifactScope": "3d-semantic",
        "status": "missing",
        "available": False,
        "bundle_url": None,
        "status_selector": selector,
    }
    if resolved_commit:
        payload["commit"] = resolved_commit
    elif commit:
        payload["commit"] = commit.strip()
    if unresolved_ref:
        payload["unresolved_ref"] = True
    return payload


def get_status_for_source(
    project: Any,
    source_hash: str,
    *,
    commit: str | None = None,
    project_rel: str | None = None,
) -> Dict[str, Any]:
    current_bundle = bundle_path(project.id, source_hash)
    available = current_bundle.exists()
    status = "ready" if available else "missing"
    payload: Dict[str, Any] = {
        "schema": "prism.webgpu_3d_status_a0",
        "project_id": project.id,
        "source_fingerprint": source_hash,
        "sourceRevisionKey": source_hash,
        "build_fingerprint": BUILD_FINGERPRINT,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": BUILD_FINGERPRINT,
        },
        "artifactScope": "3d-semantic",
        "status": status,
        "available": available,
        "bundle_url": bundle_url(project.id, source_hash) if available else None,
    }
    if commit:
        payload["commit"] = commit
    if project_rel:
        payload["project_path"] = project_rel
    if available:
        try:
            bundle = json.loads(current_bundle.read_text(encoding="utf-8"))
            readiness = bundle.get("readiness") or {
                "schema": "prism.visualizer_readiness.a0",
                "stage": "semantic-ready",
                "progress": 100,
                "available_assets": ["board", "components", "semantic-geometry", "topology"],
                "revision": str(bundle.get("generated_at") or "legacy-ready"),
                "updated_at": bundle.get("generated_at"),
            }
            payload["readiness"] = readiness
            semantic_ready = readiness.get("stage") == "semantic-ready"
            payload["status"] = "ready" if semantic_ready else "building"
            payload["available"] = True
            payload["bundle_url"] = bundle_url(project.id, source_hash)
            payload["generated_at"] = bundle.get("generated_at")
            payload["capabilities"] = bundle.get("capabilities", {})
            _validate_bundle_assets(current_bundle.parent, bundle)
        except Exception as exc:
            payload["status"] = "invalid"
            payload["available"] = False
            payload["error"] = str(exc)
    return payload


def get_status_for_commit(project: Any, commit: str, project_rel: str | None = None) -> Dict[str, Any]:
    repo_root = _repo_root(Path(project.path))
    resolved_commit = _resolve_commit(repo_root, commit)
    rel = project_rel or _project_relative_path(repo_root, Path(project.path))
    indexed = lookup_commit_source(project.id, resolved_commit, rel)
    if indexed:
        indexed_status = get_status_for_source(project, indexed["source_fingerprint"], commit=resolved_commit, project_rel=rel)
        indexed_status["source_tree_fingerprint"] = indexed.get("source_tree_fingerprint")
        return indexed_status

    with tempfile.TemporaryDirectory(prefix="semantic-status-") as tmp:
        checkout = Path(tmp) / "checkout"
        _archive_checkout(repo_root, resolved_commit, checkout)
        project_file = checkout / rel
        if not project_file.is_file():
            raise ValueError(f"KiCad project file not found in commit {resolved_commit}: {rel}")
        source_hash = source_fingerprint_for_project_file(project_file)
        source_tree = git_project_tree_fingerprint(repo_root, resolved_commit, rel)
        record_commit_source(
            project.id,
            resolved_commit,
            rel,
            source_hash,
            source_tree_fingerprint=source_tree,
        )
        status = get_status_for_source(project, source_hash, commit=resolved_commit, project_rel=rel)
        status["source_tree_fingerprint"] = source_tree
        return status


def _validate_bundle_assets(root: Path, bundle: Dict[str, Any]) -> None:
    semantic_geometry_path = root / str(bundle.get("semantic_geometry") or "semantic_geometry.json")
    if not semantic_geometry_path.is_file():
        raise RuntimeError(f"Missing semantic geometry asset: {semantic_geometry_path.name}")
    semantic_geometry = json.loads(semantic_geometry_path.read_text(encoding="utf-8"))
    scene_manifest_rel = (
        semantic_geometry.get("semantic_gltf", {}).get("path")
        or semantic_geometry.get("assets", {}).get("scene_manifest")
    )
    if not scene_manifest_rel:
        return
    scene_manifest_path = root / str(scene_manifest_rel)
    if not scene_manifest_path.is_file():
        raise RuntimeError(f"Missing semantic GLTF manifest: {scene_manifest_rel}")
    scene_manifest = json.loads(scene_manifest_path.read_text(encoding="utf-8"))
    missing_tiles = [
        str(tile.get("path") or "")
        for tile in scene_manifest.get("tiles", [])
        if not (scene_manifest_path.parent / str(tile.get("path") or "")).is_file()
    ]
    if missing_tiles:
        preview = ", ".join(missing_tiles[:8])
        suffix = "" if len(missing_tiles) <= 8 else f", ... +{len(missing_tiles) - 8} more"
        raise RuntimeError(f"Semantic GLTF manifest references missing tile files: {preview}{suffix}")


def commit_index_path(project_id: str) -> Path:
    return semantic_store_root() / project_id / "commit-index.json"


def lookup_commit_source(project_id: str, commit: str, project_rel: str) -> dict[str, Any] | None:
    path = commit_index_path(project_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    key = _commit_index_key(commit, project_rel)
    entry = (payload.get("entries") or {}).get(key)
    if not isinstance(entry, dict):
        return None
    if entry.get("build_fingerprint") != BUILD_FINGERPRINT:
        return None
    source_hash = entry.get("source_fingerprint")
    if not isinstance(source_hash, str) or not source_hash:
        return None
    return entry


def record_commit_source(
    project_id: str,
    commit: str,
    project_rel: str,
    source_hash: str,
    *,
    source_tree_fingerprint: str | None = None,
) -> None:
    path = commit_index_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        payload = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except Exception:
        payload = {}
    if payload.get("schema") != "prism.semantic_visualizer_commit_index.a0":
        payload = {
            "schema": "prism.semantic_visualizer_commit_index.a0",
            "entries": {},
        }
    entries = payload.setdefault("entries", {})
    entries[_commit_index_key(commit, project_rel)] = {
        "commit": commit,
        "project_path": project_rel,
        "source_fingerprint": source_hash,
        "source_tree_fingerprint": source_tree_fingerprint,
        "build_fingerprint": BUILD_FINGERPRINT,
        "indexed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    tmp_path = path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def git_project_tree_fingerprint(repo_root: Path, commit: str, project_rel: str) -> str | None:
    project_dir = str(Path(project_rel).parent)
    target = f"{commit}:" if project_dir in {"", "."} else f"{commit}:{project_dir}"
    result = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", target],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _commit_index_key(commit: str, project_rel: str) -> str:
    return f"{commit}:{project_rel}:{BUILD_FINGERPRINT}"


def _run_preflight(viewer_root: Path, job: Dict[str, Any], persist: Callable[[], None]) -> None:
    preflight_started = time.perf_counter()
    job["stage"] = "preflight"
    job["message"] = "Checking semantic visualizer compiler runtime..."
    job["percent"] = max(int(job.get("percent") or 0), 10)
    checks = [
        ("viewer compiler", viewer_root / "pipeline" / "topology_compiler" / "__main__.py"),
        ("semantic GLB builder", viewer_root / "pipeline" / "topology_compiler" / "semantic_gltf.py"),
        ("semantic GLB node builder", viewer_root / "tools" / "semantic-gltf" / "build.mjs"),
        ("viewer package", viewer_root / "package.json"),
    ]
    for label, path in checks:
        if not path.is_file():
            raise RuntimeError(f"Missing {label}: {path}")
        job["logs"].append(f"Preflight OK: {label} -> {path}")

    binaries: Dict[str, str] = {}
    for binary in ("kicad-cli", "node", "npm"):
        check_started = time.perf_counter()
        resolved = shutil.which(binary)
        if not resolved:
            raise RuntimeError(f"Missing required executable: {binary}")
        binaries[binary] = resolved
        try:
            result = subprocess.run(
                [resolved, "--version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=10,
                check=False,
            )
            version = (result.stdout or "").strip().splitlines()[0] if result.stdout else "version unavailable"
        except Exception as exc:
            version = f"version check failed: {type(exc).__name__}: {exc}"
        job["logs"].append(f"Preflight OK: {binary} -> {resolved} ({version})")
        _record_perf(job, persist, f"preflight.version.{binary}", check_started)

    node_modules = viewer_root / "node_modules"
    if not node_modules.is_dir():
        raise RuntimeError(
            f"Viewer node dependencies are missing at {node_modules}. "
            "In Docker, restart the backend so the semantic-viewer-node-modules volume can be initialized. "
            "Outside Docker, run npm ci in the kicad-prism-viewer checkout."
        )

    # Validate that all required glTF/polygon processing libraries are resolvable by Node.js
    required_node_pkgs = [
        "@gltf-transform/core",
        "@gltf-transform/extensions",
        "@gltf-transform/functions",
        "earcut",
        "meshoptimizer",
        "polygon-clipping"
    ]
    node_check_script = "; ".join(f"require.resolve('{pkg}')" for pkg in required_node_pkgs)
    node_started = time.perf_counter()
    node_result = subprocess.run(
        [
            binaries["node"],
            "-e",
            node_check_script,
        ],
        cwd=viewer_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=20,
        check=False,
    )
    if node_result.returncode != 0:
        raise RuntimeError(
            "Viewer Node dependencies are not valid for this runtime. "
            f"Failed to resolve core libraries. Output: {(node_result.stdout or '').strip()}"
        )
    job["logs"].append("Preflight OK: Node packages verified (@gltf-transform, earcut, meshoptimizer, polygon-clipping)")
    _record_perf(job, persist, "preflight.node_packages", node_started)

    env = os.environ.copy()
    env["PYTHONPATH"] = semantic_viewer_pythonpath(viewer_root, os.environ.get("PYTHONPATH", ""))
    python_started = time.perf_counter()
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import kicad_monkey; "
                "print('monkey:', getattr(kicad_monkey, '__file__', 'ok'))"
            ),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        timeout=20,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Missing required Python library: kicad_monkey. "
            f"Output: {(result.stdout or '').strip()}"
        )
    job["logs"].append(f"Preflight OK: Python libraries -> {(result.stdout or '').strip()}")
    _record_perf(job, persist, "preflight.python_imports", python_started)
    _record_perf(job, persist, "preflight.total", preflight_started)
    persist()


def _record_perf(
    job: Dict[str, Any],
    persist: Callable[[], None],
    stage: str,
    started: float,
    **details: Any,
) -> None:
    event = {
        "schema": "prism.3d_generation_perf.a0",
        "stage": stage,
        "elapsed_ms": round((time.perf_counter() - started) * 1000.0, 3),
        **details,
    }
    job.setdefault("performance", []).append(event)
    job.setdefault("logs", []).append(f"[perf] {json.dumps(event, sort_keys=True, separators=(',', ':'))}")
    persist()


def _job_profiler(job: Dict[str, Any], persist: Callable[[], None]):
    def emit(stage: str, details: Dict[str, Any]) -> None:
        event = {
            "schema": "prism.3d_generation_perf.a0",
            "stage": stage,
            **details,
        }
        job.setdefault("performance", []).append(event)
        job.setdefault("logs", []).append(f"[perf] {json.dumps(event, sort_keys=True, separators=(',', ':'))}")
        persist()

    return emit


def _readiness(stage: str, available_assets: list[str]) -> Dict[str, Any]:
    progress_by_stage = {
        "board-ready": 35,
        "components-ready": 55,
        "semantic-ready": 100,
    }
    return {
        "schema": "prism.visualizer_readiness.a0",
        "stage": stage,
        "progress": progress_by_stage.get(stage, 0),
        "available_assets": available_assets,
        "revision": str(time.time_ns()),
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def _bundle_document(
    project: Any,
    source_hash: str,
    readiness: Dict[str, Any],
) -> Dict[str, Any]:
    semantic_ready = readiness.get("stage") == "semantic-ready"
    return {
        "schema": SCHEMA,
        "project_id": project.id,
        "project_name": project.display_name or project.name,
        "source_fingerprint": source_hash,
        "sourceRevisionKey": source_hash,
        "build_fingerprint": BUILD_FINGERPRINT,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": BUILD_FINGERPRINT,
        },
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "topology": "topology.json",
        "semantic_geometry": "semantic_geometry.json",
        "asset_base": "./",
        "readiness": readiness,
        "capabilities": {
            "pcb_3d": True,
            "pcb_layer_compare": semantic_ready,
            "component_selection": semantic_ready,
            "net_selection": semantic_ready,
        },
    }


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{threading.get_ident()}.tmp")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary.replace(path)


def _atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{threading.get_ident()}.tmp")
    shutil.copy2(source, temporary)
    temporary.replace(destination)


def _overlay_staged_tree(staging: Path, target: Path) -> None:
    """Promote a full bundle over a partial bundle without a missing-path window."""

    bundle_source = staging / "bundle.json"
    for source in sorted(path for path in staging.rglob("*") if path.is_file()):
        if source == bundle_source:
            continue
        _atomic_copy(source, target / source.relative_to(staging))
    # The bundle is the readiness commit record. Publish it only after every
    # file referenced by the semantic-ready revision is in place.
    _atomic_copy(bundle_source, target / "bundle.json")


def _publish_partial_bundle(
    project: Any,
    output_dir: Path,
    target: Path,
    source_hash: str,
    stage: str,
    job: Dict[str, Any],
    persist: Callable[[], None],
) -> None:
    board_source = output_dir / "geometry" / "base_board.glb"
    component_source = output_dir / "geometry" / "components.glb"
    if not board_source.is_file():
        return

    target.mkdir(parents=True, exist_ok=True)
    available_assets = ["board"]
    _atomic_copy(board_source, target / "geometry" / "base_board.glb")
    assets: Dict[str, str] = {"base_board_glb": "geometry/base_board.glb"}
    if component_source.is_file():
        _atomic_copy(component_source, target / "geometry" / "components.glb")
        assets["components_glb"] = "geometry/components.glb"
        available_assets.append("components")
        stage = "components-ready"

    readiness = _readiness(stage, available_assets)
    topology = {
        "schema": "prism.topology_partial.a0",
        "design": {"name": project.display_name or project.name},
        "components": [],
        "nets": [],
        "readiness": readiness,
    }
    semantic_geometry = {
        "schema": "prism.semantic_geometry_partial.a0",
        "generator": "kicad-cli",
        "packing_mode": "staged-readiness",
        "assets": assets,
        "components": [],
        "readiness": readiness,
    }
    bundle = _bundle_document(project, source_hash, readiness)
    _atomic_write_json(target / "topology.json", topology)
    _atomic_write_json(target / "semantic_geometry.json", semantic_geometry)
    _atomic_write_json(target / "bundle.json", bundle)

    job["stage"] = stage
    job["readiness_stage"] = stage
    job["readiness"] = readiness
    job["sourceRevisionKey"] = source_hash
    job["source_fingerprint"] = source_hash
    job["bundle_url"] = bundle_url(project.id, source_hash)
    job["percent"] = readiness["progress"]
    job["message"] = (
        "Board and components are visible; building semantic layers..."
        if stage == "components-ready"
        else "Board is visible; loading components and semantic layers..."
    )
    job.setdefault("logs", []).append(
        f"Published staged bundle: {stage} ({', '.join(available_assets)})"
    )
    persist()


def sync_staged_webgpu_status(
    *,
    job_id: str,
    fence: int,
    project: Any,
    state: Mapping[str, Any],
) -> None:
    """Mirror an in-flight partial bundle into ws_webgpu_ready for fast status reads."""

    bundle_url_value = str(state.get("bundle_url") or "")
    readiness = state.get("readiness")
    source_hash = str(
        state.get("sourceRevisionKey") or state.get("source_fingerprint") or ""
    )
    selector_key = str(state.get("status_selector") or "")
    if not bundle_url_value or not isinstance(readiness, dict) or not source_hash or not selector_key:
        return
    stage = str(readiness.get("stage") or "")
    semantic_ready = stage == "semantic-ready"
    details: Dict[str, Any] = {
        "schema": "prism.webgpu_3d_status_a0",
        "project_id": str(project.id),
        "source_fingerprint": source_hash,
        "sourceRevisionKey": source_hash,
        "build_fingerprint": BUILD_FINGERPRINT,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "build": BUILD_FINGERPRINT,
        },
        "artifactScope": "3d-semantic",
        "status": "ready" if semantic_ready else "building",
        "available": True,
        "bundle_url": bundle_url_value,
        "readiness": readiness,
        "status_selector": selector_key,
    }
    commit = state.get("commit")
    if commit:
        details["commit"] = commit
    jobs.upsert_webgpu_ready_status(job_id=job_id, fence=fence, details=details)


def _write_bundle(project: Any, output_dir: Path, source_hash: str) -> None:
    topology = output_dir / "topology.json"
    semantic_geometry = output_dir / "semantic_geometry.json"
    if not topology.exists() or not semantic_geometry.exists():
        raise ValueError("semantic visualizer build did not produce topology.json and semantic_geometry.json")
    readiness = _readiness(
        "semantic-ready",
        ["board", "components", "semantic-geometry", "topology"],
    )
    bundle = _bundle_document(project, source_hash, readiness)
    (output_dir / "bundle.json").write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    _validate_bundle_assets(output_dir, bundle)


def build_visualizer_bundle(
    project: Any,
    job: Dict[str, Any],
    persist: Callable[[], None],
    *,
    force: bool = False,
) -> Dict[str, Any]:
    total_started = time.perf_counter()
    project_file = find_kicad_project(project.path)
    source_hash = source_fingerprint_for_root(project_file.resolve().parent, _job_profiler(job, persist))
    status = build_visualizer_bundle_from_project_file(
        project,
        project_file,
        job,
        persist,
        force=force,
        source_hash=source_hash,
    )
    _record_perf(job, persist, "request.total", total_started)
    return status


def build_visualizer_bundle_for_commit(
    project: Any,
    commit: str,
    job: Dict[str, Any],
    persist: Callable[[], None],
    *,
    force: bool = False,
) -> Dict[str, Any]:
    total_started = time.perf_counter()
    repo_root = _repo_root(Path(project.path))
    resolved_commit = _resolve_commit(repo_root, commit)
    rel = _project_relative_path(repo_root, Path(project.path))
    indexed = lookup_commit_source(project.id, resolved_commit, rel)
    if indexed and not force:
        status = get_status_for_source(
            project,
            indexed["source_fingerprint"],
            commit=resolved_commit,
            project_rel=rel,
        )
        if status.get("available"):
            job["percent"] = 100
            job["message"] = "Semantic visualizer bundle is already current for selected ref"
            job["logs"].append(f"Using cached commit bundle: {status.get('bundle_url')}")
            persist()
            return status

    with tempfile.TemporaryDirectory(prefix="semantic-commit-") as tmp:
        archive_started = time.perf_counter()
        checkout = Path(tmp) / "checkout"
        _archive_checkout(repo_root, resolved_commit, checkout)
        _record_perf(job, persist, "commit.archive_checkout", archive_started)
        project_file = checkout / rel
        if not project_file.is_file():
            raise ValueError(f"KiCad project file not found in commit {resolved_commit}: {rel}")
        source_hash = source_fingerprint_for_root(project_file.resolve().parent, _job_profiler(job, persist))
        source_tree = git_project_tree_fingerprint(repo_root, resolved_commit, rel)
        record_commit_source(
            project.id,
            resolved_commit,
            rel,
            source_hash,
            source_tree_fingerprint=source_tree,
        )
        status = build_visualizer_bundle_from_project_file(
            project,
            project_file,
            job,
            persist,
            force=force,
            source_hash=source_hash,
        )
        status["commit"] = resolved_commit
        status["project_path"] = rel
        status["source_tree_fingerprint"] = source_tree
        _record_perf(job, persist, "request.total", total_started)
        return status


def build_visualizer_bundle_from_project_file(
    project: Any,
    project_file: Path,
    job: Dict[str, Any],
    persist: Callable[[], None],
    *,
    force: bool = False,
    source_hash: str | None = None,
) -> Dict[str, Any]:
    project_file = project_file.resolve()
    if not project_file.is_file():
        raise ValueError(f"KiCad project file not found: {project_file}")
    resolved_source = source_hash or source_fingerprint_for_project_file(project_file)
    lock = _build_lock(str(project.id), resolved_source)
    acquired = lock.acquire(blocking=False)
    if not acquired:
        job["logs"].append("Another semantic visualizer generation job is already running for this project; waiting for it to finish")
        persist()
        lock.acquire()
    try:
        return _build_visualizer_bundle_locked(
            project,
            project_file,
            resolved_source,
            job,
            persist,
            force=force,
        )
    finally:
        lock.release()


def _build_visualizer_bundle_locked(
    project: Any,
    project_file: Path,
    source_hash: str,
    job: Dict[str, Any],
    persist: Callable[[], None],
    *,
    force: bool = False,
) -> Dict[str, Any]:
    build_started = time.perf_counter()
    target = bundle_dir(project.id, source_hash)
    existing = target / "bundle.json"
    if existing.exists() and not force:
        try:
            bundle = json.loads(existing.read_text(encoding="utf-8"))
            _validate_bundle_assets(existing.parent, bundle)
            job["percent"] = 100
            job["message"] = "Semantic visualizer bundle is already current"
            job["logs"].append(f"Using cached bundle: {existing}")
            persist()
            return get_status_for_source(project, source_hash)
        except Exception as exc:
            job["logs"].append(f"Cached semantic visualizer bundle is invalid and will be rebuilt: {type(exc).__name__}: {exc}")
            persist()

    job["stage"] = "locate-compiler"
    locate_started = time.perf_counter()
    viewer_root = find_viewer_repo_root()
    _record_perf(job, persist, "locate_compiler", locate_started, viewer_root=str(viewer_root))
    _run_preflight(viewer_root, job, persist)

    job["stage"] = "discover-project"
    kicad_project = project_file
    job["logs"].append(f"Building semantic visualizer for {kicad_project}")
    job["logs"].append(f"Source fingerprint: {source_hash}")
    job["logs"].append(f"Viewer compiler: {viewer_root}")
    compiler_cache = semantic_compiler_cache_root()
    job["logs"].append(f"Compiler cache: {compiler_cache}")
    job["message"] = "Generating semantic viewer assets..."
    job["percent"] = 15
    persist()

    with tempfile.TemporaryDirectory(prefix="semantic-visualizer-") as tmp:
        job["stage"] = "compile-assets"
        output = Path(tmp) / "bundle"
        output.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env["PYTHONPATH"] = semantic_viewer_pythonpath(viewer_root, os.environ.get("PYTHONPATH", ""))
        env["PRISM_TOPOLOGY_COMPILER_METRICS_PATH"] = str(output / "generation-profile.json")
        cmd = [
            sys.executable,
            "-m",
            "pipeline.topology_compiler",
            "from-project",
            str(kicad_project),
            "--output",
            str(output),
            "--cache-dir",
            str(compiler_cache),
            "--meshopt-level",
            semantic_meshopt_level(),
            "--tile-size",
            str(semantic_tile_size_mm()),
            "--scope",
            "3d",
        ]
        if force:
            cmd.append("--force-rebuild")
        job["logs"].append(f"Command: {' '.join(cmd)}")
        persist()
        compile_started = time.perf_counter()
        process = subprocess.Popen(
            cmd,
            cwd=str(viewer_root),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert process.stdout is not None
        compiler_milestones: set[str] = set()
        for line in process.stdout:
            line = line.strip()
            if line:
                job["logs"].append(line)
                persist()
                if "MILESTONE board-ready" in line:
                    compiler_milestones.add("board-ready")
                if "MILESTONE components-ready" in line:
                    compiler_milestones.add("components-ready")
                if "board-ready" in compiler_milestones:
                    partial_stage = (
                        "components-ready"
                        if "components-ready" in compiler_milestones
                        else "board-ready"
                    )
                    current_stage = job.get("readiness_stage")
                    if current_stage != partial_stage:
                        partial_started = time.perf_counter()
                        _publish_partial_bundle(
                            project,
                            output,
                            target,
                            source_hash,
                            partial_stage,
                            job,
                            persist,
                        )
                        _record_perf(
                            job,
                            persist,
                            f"publish.partial.{partial_stage}",
                            partial_started,
                        )
        return_code = process.wait()
        _record_perf(job, persist, "compiler.subprocess", compile_started, return_code=return_code)
        if return_code != 0:
            raise RuntimeError(f"semantic visualizer compiler exited with code {return_code}")

        bundle_started = time.perf_counter()
        _write_bundle(project, output, source_hash)
        _record_perf(job, persist, "bundle.write_and_validate", bundle_started)
        job["stage"] = "publish-assets"
        job["message"] = "Publishing semantic viewer assets..."
        job["percent"] = 85
        persist()
        publish_started = time.perf_counter()
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(
            tempfile.mkdtemp(
                prefix=f"{target.name}.staging.",
                dir=str(target.parent),
            )
        )
        if staging.exists():
            shutil.rmtree(staging)
        copy_started = time.perf_counter()
        shutil.copytree(output, staging)
        _record_perf(job, persist, "publish.copy_to_staging", copy_started)
        validate_started = time.perf_counter()
        bundle = json.loads((staging / "bundle.json").read_text(encoding="utf-8"))
        _validate_bundle_assets(staging, bundle)
        _record_perf(job, persist, "publish.validate_staging", validate_started)
        promote_started = time.perf_counter()
        if target.exists():
            _overlay_staged_tree(staging, target)
            shutil.rmtree(staging)
            promotion_mode = "atomic-file-overlay"
        else:
            staging.rename(target)
            promotion_mode = "directory-rename"
        _record_perf(
            job,
            persist,
            "publish.promote",
            promote_started,
            mode=promotion_mode,
        )
        validate_started = time.perf_counter()
        published_bundle = json.loads((target / "bundle.json").read_text(encoding="utf-8"))
        _validate_bundle_assets(target, published_bundle)
        _record_perf(job, persist, "publish.validate_target", validate_started)
        _record_perf(job, persist, "publish.total", publish_started)
        pruned = _prune_stale_bundles(project.id, source_hash)
        if pruned:
            job["logs"].append(f"Removed stale semantic bundles: {', '.join(pruned)}")

    job["percent"] = 100
    job["stage"] = "semantic-ready"
    job["readiness_stage"] = "semantic-ready"
    job["readiness"] = published_bundle.get("readiness") or {}
    job["bundle_url"] = bundle_url(project.id, source_hash)
    job["message"] = "Semantic visualizer bundle generated"
    job["logs"].append(f"Published bundle: {target / 'bundle.json'}")
    _record_perf(job, persist, "build.total", build_started)
    persist()
    status_started = time.perf_counter()
    status = get_status_for_source(project, source_hash)
    _record_perf(job, persist, "status.final_validation", status_started)
    return status


def _repo_root(project_path: Path) -> Path:
    result = subprocess.run(
        ["git", "-C", str(project_path), "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"Project is not inside a git repository: {project_path}")
    return Path(result.stdout.strip()).resolve()


def _project_relative_path(repo_root: Path, project_path: Path) -> str:
    project_file = find_kicad_project(str(project_path))
    return project_file.resolve().relative_to(repo_root).as_posix()


def _resolve_commit(repo_root: Path, ref: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "--verify", f"{ref}^{{commit}}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"Commit not found: {ref}")
    return result.stdout.strip()


def _archive_checkout(repo_root: Path, commit: str, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    p1 = subprocess.Popen(["git", "archive", "--format=tar", commit], cwd=str(repo_root), stdout=subprocess.PIPE)
    assert p1.stdout is not None
    p2 = subprocess.Popen(["tar", "-x", "-C", str(destination)], stdin=p1.stdout)
    p1.stdout.close()
    p2.wait()
    p1.wait()
    if p1.returncode != 0 or p2.returncode != 0:
        raise ValueError(f"Failed to archive checkout commit {commit}")
