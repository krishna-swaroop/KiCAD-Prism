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
    prism_root = root.parent
    platform_root = prism_root.parent
    return [
        *_explicit_paths(),
        root,
        root / "references" / "kicad_monkey",
        root / "references" / "kicad_monkey" / "src" / "py",
        root / "references" / "kicad_cruncher" / "src" / "py",
        root / "references",
        prism_root / "references" / "kicad_monkey" / "src" / "py",
        prism_root / "references" / "kicad_cruncher" / "src" / "py",
        platform_root / "kicad-monkey" / "src" / "py",
        platform_root / "kicad-cruncher" / "src" / "py",
        platform_root / "kicad_monkey" / "src" / "py",
        platform_root / "kicad_cruncher" / "src" / "py",
    ]


def warn_on_ambiguous_kicad_monkey(repo_root: Path | None = None) -> list[Path]:
    """Report every importable kicad-monkey on the search path.

    Two sibling checkouts -- say `kicad-monkey` beside `kicad_monkey` --
    both satisfy `import kicad_monkey`, and the first one silently wins. If
    the loser is the checkout carrying an optional accelerator, the pipeline
    quietly runs the slow path and the only symptom is the clock. Name the
    candidates so the ambiguity is visible rather than inferred from timings.
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
    # The caller's PYTHONPATH goes first. It used to be appended, so a
    # deliberately configured checkout lost to whatever discovery happened
    # to find -- which is the opposite of what setting it means.
    entries = [current] if current else []
    entries.extend(
        str(path) for path in reference_paths(repo_root) if path.exists()
    )
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
