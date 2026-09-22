from __future__ import annotations

import os
import sys
from pathlib import Path


def update_native_geometry_fingerprint(hasher) -> None:
    """Add the selected PCB backend and native helper identity to a hash."""
    geometry_backend = os.environ.get("PRISM_PCB_GEOMETRY_BACKEND", "legacy")
    helper_path = Path(
        os.environ.get("PRISM_KICAD_NATIVE_PATH", "/usr/local/bin/prism-kicad-native")
    )
    hasher.update(geometry_backend.encode("utf-8"))
    hasher.update(str(helper_path).encode("utf-8"))
    if geometry_backend == "rust" and helper_path.is_file():
        hasher.update(helper_path.read_bytes())


def candidate_roots() -> list[Path]:
    roots: list[Path] = []
    
    # 1. Environment variable override
    explicit = os.environ.get("PRISM_SEMANTIC_VIEWER_REPO", "").strip()
    if explicit:
        roots.append(Path(explicit).expanduser())

    # 2. Hardcoded production path
    roots.append(Path("/opt/kicad-prism-viewer"))

    # 3. Local repo subdirectory search (walk up from app/services/semantic_viewer_runtime.py)
    for parent in Path(__file__).resolve().parents:
        roots.append(parent / "kicad-prism-viewer")
    
    return roots


def find_viewer_repo_root() -> Path:
    for candidate in candidate_roots():
        resolved = candidate.resolve()
        compiler = resolved / "pipeline" / "topology_compiler" / "__main__.py"
        package_json = resolved / "package.json"
        if compiler.is_file() and package_json.is_file():
            return resolved
    raise RuntimeError(
        "Semantic viewer compiler repository not found. "
        "Expected it inside the monorepo at './kicad-prism-viewer' or at '/opt/kicad-prism-viewer'."
    )


def reference_paths(viewer_root: Path) -> list[Path]:
    # Only the compiler itself belongs on PYTHONPATH. Monkey and Cruncher come
    # from the locked Python environment; local source is opt-in through
    # KICAD_MONKEY_PYTHONPATH at the import owner, never auto-discovered here.
    return [viewer_root]


def pythonpath(viewer_root: Path, current: str | None = None) -> str:
    entries = [str(path) for path in reference_paths(viewer_root) if path.exists()]
    if current:
        entries.append(current)
    return os.pathsep.join(entries)


def ensure_import_paths(viewer_root: Path | None = None) -> Path:
    resolved_root = viewer_root or find_viewer_repo_root()
    for path in reversed(reference_paths(resolved_root)):
        if not path.exists():
            continue
        text = str(path)
        if text in sys.path:
            sys.path.remove(text)
        sys.path.insert(0, text)
    return resolved_root
