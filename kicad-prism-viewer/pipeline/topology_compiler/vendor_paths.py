from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _explicit_paths() -> list[Path]:
    """Locations the operator named, which outrank anything discovered.

    `semantic_index_service` reads the same variable, so one setting steers
    every part of Prism that imports kicad-monkey.
    """
    raw = os.environ.get("KICAD_MONKEY_PYTHONPATH", "").strip()
    return [Path(entry).expanduser() for entry in raw.split(os.pathsep) if entry]


def reference_paths(repo_root: Path | None = None) -> list[Path]:
    root = repo_root or Path(__file__).resolve().parents[2]
    # The compiler root is required for pipeline imports. KiCad tooling comes
    # from the locked environment unless the operator explicitly names source
    # paths; sibling and references/ discovery made host results depend on the
    # directory layout outside this repository.
    return [*_explicit_paths(), root]


def warn_on_ambiguous_kicad_monkey(repo_root: Path | None = None) -> list[Path]:
    """Report every importable kicad-monkey on the search path.

    Several explicitly configured paths can satisfy ``import kicad_monkey``.
    Name them so the ambiguity is visible rather than inferred from timings.
    """
    found = [
        path
        for path in reference_paths(repo_root)
        if (path / "kicad_monkey" / "__init__.py").is_file()
    ]
    if len(found) > 1:
        logger.warning(
            "Multiple kicad-monkey checkouts are importable; using %s and "
            "ignoring %s. Set KICAD_MONKEY_PYTHONPATH to choose explicitly.",
            found[0],
            ", ".join(str(path) for path in found[1:]),
        )
    return found


def pythonpath(repo_root: Path | None = None, current: str | None = None) -> str:
    # The dedicated KiCad override outranks a generic caller PYTHONPATH.
    entries = [str(path) for path in reference_paths(repo_root) if path.exists()]
    if current:
        entries.append(current)
    seen: set[str] = set()
    ordered = [entry for entry in entries if not (entry in seen or seen.add(entry))]
    return os.pathsep.join(ordered)


def ensure_reference_paths(repo_root: Path | None = None) -> None:
    # Iterate in reverse because each insert goes to the front of sys.path.
    for path in reversed(reference_paths(repo_root)):
        if not path.exists():
            continue
        text = str(path)
        if text in sys.path:
            sys.path.remove(text)
        sys.path.insert(0, text)
