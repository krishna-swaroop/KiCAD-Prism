"""Which files in a snapshot are the design.

A KiCad checkout also holds backups, autosaves and generated output. These
helpers answer "is this part of the design, and where is its root document",
which both the revision builder and the stackup reader need to know before they
can read anything.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional


_GENERATED_PARTS = {
    ".cache",
    ".kicad-prism",
    "archive",
    "autosave",
    "backup",
    "backups",
}


def _is_generated_kicad_path(path: Path, root: Path) -> bool:
    try:
        relative = path.relative_to(root)
    except ValueError:
        relative = path
    parts = [part.casefold() for part in relative.parts]
    name = path.name.casefold()
    return (
        any(part in _GENERATED_PARTS or part.endswith("-backups") for part in parts[:-1])
        or name.startswith(("~", "._"))
        or "-backup-" in name
        or name.endswith((".bak", ".lck"))
    )


def _list_kicad_sources(root: Path) -> List[Dict[str, str]]:
    out = []
    for path in sorted(root.rglob("*")):
        if (
            path.suffix in {".kicad_sch", ".kicad_pcb", ".kicad_pro"}
            and path.is_file()
            and not _is_generated_kicad_path(path, root)
        ):
            out.append(
                {
                    "filename": path.name,
                    "path": str(path.relative_to(root)).replace("\\", "/"),
                }
            )
    return out


def _find_pro(root: Path) -> Optional[Path]:
    pros = [path for path in root.rglob("*.kicad_pro") if not _is_generated_kicad_path(path, root)]
    if not pros:
        return None
    # Prefer shallowest
    pros.sort(key=lambda p: len(p.parts))
    return pros[0]


def _find_pcb(root: Path) -> Optional[Path]:
    boards = [
        path for path in root.rglob("*.kicad_pcb")
        if not _is_generated_kicad_path(path, root)
    ]
    if not boards:
        return None
    return min(boards, key=lambda path: (len(path.parts), str(path)))
