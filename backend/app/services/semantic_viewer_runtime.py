from __future__ import annotations

import os
import sys
from pathlib import Path


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
    # We only include the viewer root. Pinned libraries (kicad-monkey, kicad-cruncher)
    # are installed natively in the python environment.
    paths = [viewer_root]
    
    # Optional local fallback lookup for legacy active development checkouts
    dev_ref_monkey = viewer_root / "references" / "kicad_monkey" / "src" / "py"
    dev_ref_cruncher = viewer_root / "references" / "kicad_cruncher" / "src" / "py"
    if dev_ref_monkey.exists():
        paths.append(dev_ref_monkey)
    if dev_ref_cruncher.exists():
        paths.append(dev_ref_cruncher)
        
    return paths


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
