"""The KiCad steps the job runs around ``prism-kicad`` (cli-spec.md §9.2, §9.4).

The CLI never runs KiCad. Before stage parse, older boards and schematics are
upgraded by KiCad itself (``kicad-seeded-upgrade-a0``); before stage board,
the board's zones are refilled by pcbnew (``pcbnew-zone-filler-a0``), unless
the project's configuration says ``zone_fills: "saved"``. Both scripts are the
spec's, verbatim. A failing step raises :class:`KicadStepFailed`, which the
job retries; it is never recorded in a bundle and never replaced by the saved
fills.

Both results depend only on their inputs, so each cache persists under
``KICAD_PROJECTS_ROOT/.kicad-prism``: ``upgrade-cache`` keeps upgraded bytes
keyed by the file, its project file, the script and the worker's KiCad, and
``refill-cache`` keeps a refilled board keyed by the board, its project and
rules files, the script and the worker's KiCad. The in-memory
:class:`UpgradeCache` still de-duplicates one job's shared files, so a cold
disk cache upgrades each file once.
"""

from __future__ import annotations

import contextvars
import hashlib
import os
import re
import shutil
import tempfile
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from typing import Callable, Mapping

from app.core.file_touch import touch_used
from app.core.config import settings
from app.services import kicad_tools

# pcbnew.LoadBoard answers None for a board its parser rejects, and handing
# that None on segfaults with nothing on stderr. Loading again through the IO
# manager lets the parse error escape as an uncaught PARSE_ERROR, whose text
# (file, line, what was expected) libstdc++ prints before aborting.
_LOAD_BOARD = (
    "board = pcbnew.LoadBoard(sys.argv[1])\n"
    "if board is None:\n"
    "    pcbnew.PCB_IO_MGR.Load(pcbnew.PCB_IO_MGR.KICAD_SEXP, sys.argv[1])\n"
    "    sys.exit('PARSE_ERROR: pcbnew could not load the board')\n"
)
UPGRADE_BOARD_SCRIPT = (
    "import sys, pcbnew\n"
    "pcbnew.KIID.SeedGenerator(0x50524953)\n"
    + _LOAD_BOARD
    + "pcbnew.SaveBoard(sys.argv[1], board)\n"
)
REFILL_SCRIPT = (
    "import sys, pcbnew\n"
    + _LOAD_BOARD
    + "pcbnew.ZONE_FILLER(board).Fill(board.Zones())\n"
    "pcbnew.SaveBoard(sys.argv[1], board)\n"
)
#: What a schematic upgrade runs instead of a pcbnew script; part of its cache key.
SCHEMATIC_UPGRADE_ARGS = ("sch", "upgrade")
_VERSION = re.compile(rb"\(\s*version\s+(\d+)\s*\)")
_SHEET_FILE = re.compile(r'\(property\s+"Sheet\s?file"\s+"((?:[^"\\]|\\.)*)"')
_HEAD_BYTES = 4096


class KicadStepFailed(RuntimeError):
    """A KiCad step failed or timed out; retried by the job, never recorded."""


#: How an unreadable-source failure's message starts; a failed bundle carrying
#: it is not rebuilt on a timer (the same KiCad would reject it again).
UNREADABLE_PREFIX = "KiCad cannot read "


class KicadSourceUnreadable(KicadStepFailed):
    """KiCad's parser rejects a source file: the same KiCad fails the same way every time."""


_RELEASE = re.compile(r"(\d+)\.(\d+)\.(\d+)")


def worker_kicad_version() -> str:
    """The worker's ``kicad-cli version`` as ``X.Y.Z``: what ``--refill-tool`` and ``--models-tool`` state.

    The CLI accepts any patch release of the generator's major.minor
    (decisions.md, KiCad patch releases), so K reports the KiCad that ran.
    """

    tool = kicad_tools.kicad_cli()
    match = _RELEASE.search(tool.version() if tool.available() else "")
    if match is None:
        raise KicadStepFailed("kicad-cli did not report a release version")
    return match.group(0)


def file_version(path: Path) -> int | None:
    """A KiCad s-expression file's ``(version N)``, from its head."""

    try:
        with path.open("rb") as handle:
            head = handle.read(_HEAD_BYTES)
    except OSError:
        return None
    match = _VERSION.search(head)
    return int(match.group(1)) if match else None


#: A rule-area placement written by KiCad nightlies in early 2024, before 9.0
#: settled on ``(placement (enabled yes) (sheetname ...))``. No released KiCad
#: reads it, and the board's header still claims the 8.0 format.
_NIGHTLY_PLACEMENT = re.compile(rb"\(placement\s*\(expr\b")


def _unreadable_hint(board: Path, reason: str) -> str:
    """What the owner can do about a parse error Prism recognises, or ``""``."""

    if "sheetname" not in reason:
        return ""
    try:
        content = board.read_bytes()
    except OSError:
        return ""
    count = len(_NIGHTLY_PLACEMENT.findall(content))
    if not count:
        return ""
    return (
        f"The board has {count} rule-area placement(s) in the (placement (expr ...)) form a 2024 "
        "KiCad nightly wrote, which no released KiCad reads; change each to "
        '(placement (enabled yes) (sheetname "<sheet path>")) and commit the board again'
    )


def _run_python(script: str, board: Path, *, timeout: float, cancel: Callable[[], None] | None) -> None:
    """KiCad's Python, isolated like kicad-cli (its own temp and runtime directories)."""

    python = kicad_tools.LocalTool(
        "kicad-python", lambda: kicad_tools.locate_kicad_python(settings), isolate=True, cancel=cancel
    )
    try:
        result = python.run(["-I", "-c", script, str(board)], timeout=timeout)
    except kicad_tools.ToolError as error:
        raise KicadStepFailed(f"KiCad's Python failed on {board.name}: {error}") from error
    if not result.ok:
        lines = [line.strip() for line in result.detail().splitlines() if line.strip()]
        if "PARSE_ERROR" in result.detail():
            what = next((line.removeprefix("what():").strip() for line in lines if line.startswith("what():")), "")
            reason = (what or lines[-1])[:400]
            hint = _unreadable_hint(board, reason)
            if hint:
                reason = f"{reason.rstrip('.')}. {hint}"
            raise KicadSourceUnreadable(f"{UNREADABLE_PREFIX}{board.name}: {reason}")
        detail = lines[-1] if lines else "no output"
        if result.returncode < 0:
            detail = f"crashed with signal {-result.returncode} ({detail})"
        raise KicadStepFailed(f"KiCad's Python failed on {board.name}: {detail[:400]}")


# ------------------------------------------------------------------ upgrade


def closure_documents(src: Path, config: Mapping[str, object]) -> list[str]:
    """The board and the schematics reachable from the root schematic, as repository paths.

    Sheets are followed through their ``Sheetfile`` property, relative to the
    referencing sheet's directory, then to the project directory; only files
    present under ``src`` count. A name that matches one schematic only when
    letter case is ignored is that schematic, as stage parse reads it
    (cli-spec.md §5.2.2), whatever the worker's file system. Reading a file's
    header and sheet names is all this does; the parse is the CLI's.
    """

    found: list[str] = []
    if isinstance(config.get("board"), str) and (src / str(config["board"])).is_file():
        found.append(str(config["board"]))
    project_dir = PurePosixPath(str(config["project_file"])).parent
    queue = [str(config["root_schematic"])] if isinstance(config.get("root_schematic"), str) else []
    seen: set[str] = set()
    schematics = {path.relative_to(src).as_posix() for path in src.rglob("*.kicad_sch") if path.is_file()}
    while queue:
        sheet = queue.pop(0)
        if sheet in seen or not (src / sheet).is_file():
            continue
        seen.add(sheet)
        found.append(sheet)
        text = (src / sheet).read_text(encoding="utf-8", errors="replace")
        for raw in _SHEET_FILE.findall(text):
            name = raw.replace('\\"', '"').replace("\\\\", "\\")
            for base in (PurePosixPath(sheet).parent, project_dir):
                candidate = _present(_normalized(base / name), schematics)
                if candidate is not None:
                    queue.append(candidate)
                    break
    return found


def _present(path: str | None, schematics: set[str]) -> str | None:
    """``path`` as spelled in ``schematics``: exactly, or its one letter-case-only match."""

    if path is None or path in schematics:
        return path
    folded = [candidate for candidate in schematics if candidate.casefold() == path.casefold()]
    return folded[0] if len(folded) == 1 else None


def _normalized(path: PurePosixPath) -> str | None:
    parts: list[str] = []
    for part in path.parts:
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                return None
            parts.pop()
        else:
            parts.append(part)
    return "/".join(parts) or None


class UpgradeCache:
    """Upgraded bytes by what determines them, shared by the source sets of one comparison.

    A board's upgrade reads the board and the project file copied beside it; a
    schematic's reads the schematic and the project file of the same stem, if
    any (cli-spec.md §9.4; a sheet's sub-sheets do not change its output). Two
    revisions that share a file at the same content upgrade it once: the
    in-memory futures de-duplicate within one job, and the persistent cache
    under ``upgrade-cache`` serves a later job without running KiCad at all.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._futures: dict[str, Future[bytes]] = {}
        self.hits = 0
        self.misses = 0

    def get(self, key: str, upgrade: Callable[[], bytes], *, suffix: str) -> bytes:
        with self._lock:
            future = self._futures.get(key)
            owner = future is None
            if owner:
                future = self._futures[key] = Future()
        assert future is not None
        if owner:
            try:
                future.set_result(self._load(key, suffix, upgrade))
            except BaseException as error:
                future.set_exception(error)
        return future.result()

    def _load(self, key: str, suffix: str, upgrade: Callable[[], bytes]) -> bytes:
        cached = upgrade_cache_root() / f"{key}.{suffix}"
        upgraded: bytes | None
        try:
            upgraded = cached.read_bytes()
        except OSError:
            upgraded = None
        if upgraded is not None:
            touch_used(cached)
            with self._lock:
                self.hits += 1
            return upgraded
        upgraded = upgrade()
        cached.parent.mkdir(parents=True, exist_ok=True)
        temp = cached.with_name(f".{cached.name}.{os.getpid()}.part")
        temp.write_bytes(upgraded)
        os.replace(temp, cached)
        with self._lock:
            self.misses += 1
        return upgraded


def upgrade_sources(
    src: Path,
    config: Mapping[str, object],
    file_formats: Mapping[str, int],
    *,
    cancel: Callable[[], None] | None = None,
    cache: UpgradeCache | None = None,
) -> list[dict[str, object]]:
    """cli-spec.md §9.4 over the closure's documents; returns ``[{path, upgraded_from_version}]``.

    ``file_formats`` is the generator id's ``kicad_file_formats``: a board or
    schematic older than its kind's format is upgraded. Each file is upgraded
    in its own scratch directory with only the project file it reads, so the
    upgrades run at once (``PRISM_DESIGN_BUNDLE_UPGRADE_WORKERS``) and give the
    bytes the in-place upgrade gives.
    """

    selected: list[tuple[str, int, bool]] = []
    for path in closure_documents(src, config):
        version = file_version(src / path)
        board = path.lower().endswith(".kicad_pcb")
        current = int(file_formats["board" if board else "schematic"])
        if version is None or version >= current:
            continue  # current, newer (stage parse records source-format-unsupported) or unreadable
        selected.append((path, version, board))
    if not selected:
        return []
    cache = cache or UpgradeCache()
    tool_version = worker_kicad_version()

    def upgrade(path: str, board: bool) -> bytes:
        target = src / path
        project = _project_beside(src, config, target, board)
        procedure = UPGRADE_BOARD_SCRIPT if board else "\0".join(SCHEMATIC_UPGRADE_ARGS)
        key = _upgrade_key(
            board, target.read_bytes(), project.read_bytes() if project else None,
            procedure=procedure.encode("utf-8"), tool_version=tool_version,
        )
        suffix = "kicad_pcb" if board else "kicad_sch"
        upgraded = cache.get(key, lambda: _upgrade_isolated(target, project, board, cancel=cancel), suffix=suffix)
        target.write_bytes(upgraded)
        return upgraded

    workers = min(settings.PRISM_DESIGN_BUNDLE_UPGRADE_WORKERS, len(selected))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="kicad-upgrade") as pool:
        # Each in a copy of this context, so a job's ``kicad_tools.recording()`` sees the runs.
        futures = [pool.submit(contextvars.copy_context().run, upgrade, path, board) for path, _, board in selected]
        for future in futures:
            future.result()
    return [{"path": path, "upgraded_from_version": version} for path, version, _ in selected]


def _project_beside(src: Path, config: Mapping[str, object], target: Path, board: bool) -> Path | None:
    """The project file the upgrade of ``target`` reads: the project's for a board, the same stem's for a schematic."""

    project = src / str(config["project_file"]) if board else target.with_suffix(".kicad_pro")
    return project if project.is_file() else None


def _upgrade_key(board: bool, content: bytes, project: bytes | None, *, procedure: bytes, tool_version: str) -> str:
    """What determines an upgraded file: its kind, procedure, worker KiCad, bytes and project bytes."""

    digest = hashlib.sha256(b"board\0" if board else b"schematic\0")
    digest.update(procedure)
    digest.update(b"\0")
    digest.update(tool_version.encode("utf-8"))
    digest.update(b"\0")
    digest.update(hashlib.sha256(content).digest())
    digest.update(hashlib.sha256(project).digest() if project is not None else b"\0")
    return digest.hexdigest()


def _upgrade_isolated(target: Path, project: Path | None, board: bool, *, cancel: Callable[[], None] | None) -> bytes:
    """Upgrade a copy of ``target`` beside a copy of ``project`` named after it; return the upgraded bytes."""

    with tempfile.TemporaryDirectory(prefix="kicad-upgrade-") as scratch:
        work = Path(scratch) / target.name
        shutil.copyfile(target, work)
        if project is not None:
            shutil.copyfile(project, work.with_suffix(".kicad_pro"))
        if board:
            _run_python(UPGRADE_BOARD_SCRIPT, work, timeout=settings.PRISM_DESIGN_BUNDLE_UPGRADE_TIMEOUT_SECONDS, cancel=cancel)
        else:
            _upgrade_schematic(work, cancel=cancel)
        return work.read_bytes()


def _upgrade_schematic(schematic: Path, *, cancel: Callable[[], None] | None) -> None:
    tool = kicad_tools.kicad_cli()
    if not tool.available():
        raise KicadStepFailed("kicad-cli is not installed; an older schematic cannot be upgraded")
    try:
        result = tool.with_cancel(cancel).run(
            [*SCHEMATIC_UPGRADE_ARGS, str(schematic)], timeout=settings.PRISM_DESIGN_BUNDLE_UPGRADE_TIMEOUT_SECONDS
        )
    except kicad_tools.ToolError as error:
        raise KicadStepFailed(f"kicad-cli sch upgrade failed: {error}") from error
    if not result.ok:
        raise KicadStepFailed(f"kicad-cli sch upgrade failed on {schematic.name}: {result.detail()[:400]}")


# ------------------------------------------------------------------- refill


def refill_board(
    sources: Path, config: Mapping[str, object], work: Path, *, cancel: Callable[[], None] | None = None
) -> tuple[Path, bool]:
    """cli-spec.md §9.2: refill a scratch copy; returns ``(path, cache_hit)``.

    ``sources`` holds the bundle's sources at repository paths. The project
    and rules files are named after the board's stem so pcbnew finds them;
    only the board is handed to the CLI. An identical board, project and rules
    file refill to the same bytes, so a hit copies the cached board and runs no
    pcbnew; a miss refills and publishes the result atomically. A failed refill
    publishes nothing.
    """

    board_path = str(config["board"])
    board_name = PurePosixPath(board_path).name
    stem = PurePosixPath(board_name).stem
    work.mkdir(parents=True, exist_ok=False)
    target = work / board_name
    key = _refill_key(sources, config, worker_kicad_version())
    cached = refill_cache_root() / f"{key}.kicad_pcb"
    if cached.is_file():
        shutil.copyfile(cached, target)
        touch_used(cached)
        return target, True
    shutil.copyfile(sources / board_path, target)
    project = sources / str(config["project_file"])
    shutil.copyfile(project, work / f"{stem}.kicad_pro")
    rules = project.with_suffix(".kicad_dru")
    if rules.is_file():
        shutil.copyfile(rules, work / f"{stem}.kicad_dru")
    _run_python(REFILL_SCRIPT, target, timeout=settings.PRISM_ZONE_REFILL_TIMEOUT_SECONDS, cancel=cancel)
    cached.parent.mkdir(parents=True, exist_ok=True)
    temp = cached.with_name(f".{cached.name}.{os.getpid()}.part")
    shutil.copyfile(target, temp)
    os.replace(temp, cached)
    return target, False


def _refill_key(sources: Path, config: Mapping[str, object], tool_version: str) -> str:
    """The board, its project and rules files, the script and the worker's KiCad, NUL-separated."""

    project = sources / str(config["project_file"])
    rules = project.with_suffix(".kicad_dru")
    parts = [
        b"refill-v1",
        REFILL_SCRIPT.encode("utf-8"),
        tool_version.encode("utf-8"),
        hashlib.sha256((sources / str(config["board"])).read_bytes()).digest(),
        hashlib.sha256(project.read_bytes()).digest(),
        hashlib.sha256(rules.read_bytes()).digest() if rules.is_file() else b"",
    ]
    return hashlib.sha256(b"\0".join(parts)).hexdigest()


# ------------------------------------------------------------------- caches


def refill_cache_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "refill-cache"


def upgrade_cache_root() -> Path:
    return Path(settings.KICAD_PROJECTS_ROOT).expanduser() / ".kicad-prism" / "upgrade-cache"


#: A ``.part`` file older than this died before its rename; the GLB cache's grace.
PART_GRACE_SECONDS = 3600


def _prune_cache(root: Path, suffixes: tuple[str, ...], *, unused_before: float, now: float) -> dict[str, int]:
    removed, kept_bytes = 0, 0
    if not root.is_dir():
        return {"removed": 0, "bytes": 0}
    for item in root.iterdir():
        try:
            info = item.stat()
        except OSError:
            continue
        stale_part = item.name.endswith(".part") and info.st_mtime < now - PART_GRACE_SECONDS
        if stale_part or (item.suffix in suffixes and info.st_mtime < unused_before):
            item.unlink(missing_ok=True)
            removed += item.suffix in suffixes
        else:
            kept_bytes += info.st_size
    return {"removed": removed, "bytes": kept_bytes}


def prune_refill_cache(*, unused_before: float, now: float) -> dict[str, int]:
    """Retention's pass over the refill cache: drop entries unused since ``unused_before``.

    Returns the entries removed and the bytes the cache still holds. A cache
    file is only ever copied out, never read in place, so removing one a refill
    is about to copy at worst refills again.
    """

    return _prune_cache(refill_cache_root(), (".kicad_pcb",), unused_before=unused_before, now=now)


def prune_upgrade_cache(*, unused_before: float, now: float) -> dict[str, int]:
    """Retention's pass over the upgrade cache; same rule as the refill cache's."""

    return _prune_cache(upgrade_cache_root(), (".kicad_pcb", ".kicad_sch"), unused_before=unused_before, now=now)
