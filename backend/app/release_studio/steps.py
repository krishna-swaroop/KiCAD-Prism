"""The Release Studio step catalogue and its evidence capture (R7).

Every released artifact is produced by one entry here, and every entry names
the KiCad 10.0.4 job type it corresponds to so :mod:`app.release_studio.jobset`
can classify its hermeticity.  Steps run against the materialized input
closure, never against a user's working tree.

DRC and ERC are ordinary steps whose *output is the evidence*.  ``kicad-cli``
returns 0 for a board with violations unless ``--exit-code-violations`` is
passed, so violations are recorded rather than aborting the build; only a
genuine tool failure fails the step.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


DEFAULT_CLI_TIMEOUT_SECONDS = 900

# KiCad 10.0.4 `sch export bom --preset` looks up built-in names in the
# temporary vector from BOM_PRESET::BuiltInPresets() and keeps a pointer
# into it (eeschema_jobs_handler.cpp). After the range-for ends that
# vector is gone; copying the preset then throws std::bad_alloc /
# length_error. Translate the built-ins to explicit CLI flags instead.
_CURRENT_BOM_SETTINGS = "Current project settings"
_BUILTIN_BOM_CLI: dict[str, tuple[str, ...]] = {
    "Grouped By Value": (
        "--fields",
        "Reference,QUANTITY,Value,Manufacturer,Manufacturer Part Number,Footprint,Datasheet,DNP",
        "--labels",
        "Reference,Qty,Value,Manufacturer,MPN,Footprint,Datasheet,DNP",
        "--group-by",
        "Value,DNP",
    ),
    "Grouped By Value and Footprint": (
        "--fields",
        "Reference,QUANTITY,Value,Manufacturer,Manufacturer Part Number,Footprint,Datasheet,DNP",
        "--labels",
        "Reference,Qty,Value,Manufacturer,MPN,Footprint,Datasheet,DNP",
        "--group-by",
        "Value,Footprint,DNP",
    ),
    "Attributes": (
        "--fields",
        "Reference,Value,DNP,EXCLUDE_FROM_BOM,EXCLUDE_FROM_BOARD,"
        "EXCLUDE_FROM_SIM,EXCLUDE_FROM_POS_FILES",
        "--labels",
        "Reference,Value,Do Not Place,Exclude from BOM,Exclude from Board,"
        "Exclude from Simulation,Exclude from Position Files",
        "--group-by",
        "Value,Footprint",
    ),
}


def _bom_extra_argv(bom_preset: str) -> tuple[str, ...]:
    name = (bom_preset or "").strip()
    if not name or name == _CURRENT_BOM_SETTINGS:
        return ()
    mapped = _BUILTIN_BOM_CLI.get(name)
    if mapped is not None:
        return mapped
    return ("--preset", name)


#: One `kicad-cli` at a time. Parallel invocations of `sch export bom` have
#: died with `std::bad_alloc` even when DRC/ERC on the same schematic succeed.
_MAX_PARALLEL_STEPS = 1


@dataclass(frozen=True, slots=True)
class StepSpec:
    """One `kicad-cli` invocation and the member class it produces.

    ``argv`` uses ``{board}``, ``{schematic}``, ``{out}`` and ``{variant}``
    placeholders so the recorded argv can be normalized to closure-relative
    text without host paths.
    """

    step_id: str
    step_type: str
    argv: tuple[str, ...]
    source: str  # "board" | "schematic"
    output_kind: str  # "dir" | "file"
    output_name: str
    member_kind: str
    canonicalizer: str
    domains: tuple[str, ...]
    optional: bool = False
    variant_flag: bool = False


@dataclass(frozen=True, slots=True)
class StepOutput:
    """The result of running one catalogue step."""

    step_id: str
    step_type: str
    normalized_argv: tuple[str, ...]
    returncode: int
    files: tuple[Path, ...]
    root: Path
    spec: StepSpec
    stdout: str = ""
    stderr: str = ""
    skipped_reason: str = ""
    #: Wall clock of this invocation. Evidence only — never a fingerprint input.
    elapsed_ms: int = 0

    @property
    def ran(self) -> bool:
        return not self.skipped_reason


# Ordered so cheap validation runs before expensive artwork: a board that
# cannot be opened fails in seconds rather than after a STEP export.
STEP_CATALOGUE: tuple[StepSpec, ...] = (
    StepSpec(
        step_id="drc",
        step_type="pcb_drc",
        argv=("pcb", "drc", "--format", "json", "--severity-all", "--output", "{out}", "{board}"),
        source="board",
        output_kind="file",
        output_name="evidence/drc.json",
        member_kind="drc_report",
        canonicalizer="drc_erc_json",
        domains=("evidence",),
    ),
    StepSpec(
        step_id="erc",
        step_type="sch_erc",
        argv=("sch", "erc", "--format", "json", "--severity-all", "--output", "{out}", "{schematic}"),
        source="schematic",
        output_kind="file",
        output_name="evidence/erc.json",
        member_kind="erc_report",
        canonicalizer="drc_erc_json",
        domains=("evidence",),
    ),
    StepSpec(
        step_id="board_stats",
        step_type="pcb_export_stats",
        argv=("pcb", "export", "stats", "--format", "json", "--output", "{out}", "{board}"),
        source="board",
        output_kind="file",
        output_name="fabrication/board-stats.json",
        member_kind="board_stats",
        canonicalizer="board_stats_json",
        domains=("bare_board",),
    ),
    StepSpec(
        step_id="gerbers",
        step_type="pcb_export_gerbers",
        argv=("pcb", "export", "gerbers", "--output", "{out}", "{board}"),
        source="board",
        output_kind="dir",
        output_name="fabrication/gerbers",
        member_kind="gerber",
        canonicalizer="",  # per-file, resolved by suffix
        domains=("bare_board",),
        variant_flag=True,
    ),
    StepSpec(
        step_id="drill",
        step_type="pcb_export_drill",
        argv=(
            "pcb", "export", "drill",
            "--format", "excellon", "--excellon-units", "mm",
            "--output", "{out}", "{board}",
        ),
        source="board",
        output_kind="dir",
        output_name="fabrication/drill",
        member_kind="drill",
        canonicalizer="",
        domains=("bare_board",),
    ),
    StepSpec(
        step_id="positions",
        step_type="pcb_export_pos",
        argv=(
            "pcb", "export", "pos",
            "--format", "csv", "--units", "mm", "--side", "both",
            "--output", "{out}", "{board}",
        ),
        source="board",
        output_kind="file",
        output_name="assembly/positions.csv",
        member_kind="position",
        canonicalizer="csv",
        domains=("assembly",),
        variant_flag=True,
    ),
    StepSpec(
        step_id="bom",
        step_type="sch_export_bom",
        argv=("sch", "export", "bom", "--output", "{out}", "{schematic}"),
        source="schematic",
        output_kind="file",
        output_name="assembly/bom.csv",
        member_kind="bom",
        canonicalizer="csv",
        domains=("assembly",),
        variant_flag=True,
    ),
    StepSpec(
        step_id="schematic_pdf",
        step_type="sch_export_plot_pdf",
        argv=("sch", "export", "pdf", "--output", "{out}", "{schematic}"),
        source="schematic",
        output_kind="file",
        output_name="documentation/schematic.pdf",
        member_kind="schematic_pdf",
        canonicalizer="pdf",
        domains=("documentation",),
        optional=True,
    ),
)


STEP_BY_ID: Mapping[str, StepSpec] = {spec.step_id: spec for spec in STEP_CATALOGUE}

_CATALOGUE_TITLES: Mapping[str, str] = {
    "drc": "DRC",
    "erc": "ERC",
    "board_stats": "board statistics",
    "gerbers": "Gerbers",
    "drill": "drill files",
    "positions": "pick-and-place positions",
    "bom": "bill of materials",
    "schematic_pdf": "schematic PDF",
}


def _catalogue_title(spec: StepSpec) -> str:
    return _CATALOGUE_TITLES.get(spec.step_id, spec.step_id.replace("_", " "))

#: Checks finish before any assembly `kicad-cli` or Cruncher load.
CATALOGUE_WAVE_CHECKS: tuple[str, ...] = ("drc", "erc", "board_stats")
#: Pick-and-place after Checks. BOM is a later wave so the two never overlap.
CATALOGUE_WAVE_POSITIONS: tuple[str, ...] = ("positions",)
#: Schematic BOM, alone. Parallel `kicad-cli` loads have been dying with
#: ``std::bad_alloc`` on the worker, including BOM overlapping positions.
CATALOGUE_WAVE_BOM: tuple[str, ...] = ("bom",)
#: Artwork the document engine does not itself plot.
CATALOGUE_WAVE_ARTWORK: tuple[str, ...] = ("gerbers", "drill", "schematic_pdf")

# The Documentation Engine's sheets, deliberately *outside* `STEP_CATALOGUE`:
# they are composed in-process rather than by a `kicad-cli` invocation, so they
# have no step type in KiCad's job registry and `run_step_catalogue` must not
# try to execute them. The spec exists so composed sheets travel through the
# same member pipeline as everything else, with the canonicalizer resolved per
# file by suffix.
#
# `optional=False`: a compose failure is a failed documents step, not a
# silently missing document set. Manufacturing members still assemble.
DOCUMENT_STEP_SPEC = StepSpec(
    step_id="documents",
    step_type="prism_compose_documents",
    argv=(),
    source="board",
    output_kind="dir",
    output_name="documentation",
    member_kind="document_sheet",
    canonicalizer="",
    domains=("documentation",),
    optional=False,
)

# Which steps produce release evidence rather than shipped artwork.
EVIDENCE_STEPS: Mapping[str, str] = {"drc": "drc", "erc": "erc"}


class StepExecutionError(RuntimeError):
    """A catalogue step failed for a reason that is not a design violation."""


def resolve_cli_path(explicit: str | None = None) -> str:
    """Return the kicad-cli executable, preferring an explicit override."""

    if explicit:
        return explicit
    configured = os.environ.get("KICAD_CLI_PATH", "").strip()
    if configured:
        return configured
    found = shutil.which("kicad-cli")
    if found:
        return found
    raise StepExecutionError("kicad-cli is not available on PATH")


def resolve_cruncher_path(explicit: str | None = None) -> str:
    """Return the kicad-cruncher executable that renders the assembly views.

    Resolved the same way as ``kicad-cli`` and pinned by the same image, so the
    tool that draws the assembly sheets is identified by ``toolchain_digest``
    like every other part of the toolchain.
    """

    if explicit:
        return explicit
    configured = os.environ.get("KICAD_CRUNCHER_PATH", "").strip()
    if configured:
        return configured
    found = shutil.which("kicad-cruncher")
    if found:
        return found
    raise StepExecutionError("kicad-cruncher is not available on PATH")


def selected_steps(
    *,
    board: Path | None,
    schematic: Path | None,
    only: Sequence[str] | None = None,
) -> tuple[StepSpec, ...]:
    """Return catalogue steps whose source document exists."""

    chosen: list[StepSpec] = []
    for spec in STEP_CATALOGUE:
        if only is not None and spec.step_id not in only:
            continue
        if spec.source == "board" and board is None:
            continue
        if spec.source == "schematic" and schematic is None:
            continue
        chosen.append(spec)
    return tuple(chosen)


def run_step_catalogue(
    *,
    closure_root: Path,
    board_rel: str,
    schematic_rel: str | None,
    output_root: Path,
    variant: str = "",
    cli_path: str | None = None,
    only: Sequence[str] | None = None,
    timeout_seconds: int = DEFAULT_CLI_TIMEOUT_SECONDS,
    progress: Any = None,
    on_step: Any = None,
    runner: Any = None,
    bom_preset: str = "",
) -> tuple[StepOutput, ...]:
    """Run the catalogue against a materialized closure.

    ``runner`` is injected by tests; it defaults to :func:`subprocess.run`.
    """

    cli = resolve_cli_path(cli_path)
    execute = runner or _default_runner
    board = (closure_root / board_rel) if board_rel else None
    schematic = (closure_root / schematic_rel) if schematic_rel else None
    if board is not None and not board.is_file():
        raise StepExecutionError(f"board not found in closure: {board_rel}")
    if schematic is not None and not schematic.is_file():
        schematic = None

    specs = selected_steps(board=board, schematic=schematic, only=only)
    if not specs:
        return ()

    # Every step is an independent `kicad-cli` process. They used to overlap;
    # `sch export bom` then died with std::bad_alloc / basic_string::_M_create
    # while DRC/ERC still held the design. One process at a time.
    run = partial(
        _run_one,
        cli=cli,
        closure_root=closure_root,
        board=board,
        schematic=schematic,
        board_rel=board_rel,
        schematic_rel=schematic_rel or "",
        output_root=output_root,
        variant=variant,
        timeout_seconds=timeout_seconds,
        execute=execute,
        bom_preset=bom_preset,
    )
    results: dict[str, StepOutput] = {}
    completed = 0

    with ThreadPoolExecutor(max_workers=min(len(specs), _MAX_PARALLEL_STEPS)) as pool:
        futures = {}
        for spec in specs:
            title = _catalogue_title(spec)
            print(f"[{spec.step_id}] Running {title}", flush=True)
            if on_step is not None:
                on_step(spec.step_id, "in_progress", message=f"Running {title}")
            futures[pool.submit(run, spec)] = spec
        for future in as_completed(futures):
            spec = futures[future]
            completed += 1
            title = _catalogue_title(spec)
            if progress is not None:
                progress(
                    stage="generate",
                    message=f"Finished {title} ({completed}/{len(specs)})",
                    percent=10 + int(60 * completed / len(specs)),
                )
            # A failing step still raises, exactly as it did serially; the
            # pool's context manager lets the others finish first so a retry
            # is not starting from nothing.
            try:
                output = future.result()
            except Exception as exc:
                if on_step is not None:
                    on_step(spec.step_id, "failure", message=str(exc))
                raise
            results[spec.step_id] = output
            if on_step is not None:
                log = "\n".join(
                    part for part in (output.stdout, output.stderr) if part
                )
                status = "skipped" if output.skipped_reason else "success"
                done = output.skipped_reason or f"Finished {title}"
                print(f"[{spec.step_id}] {done}", flush=True)
                on_step(
                    spec.step_id,
                    status,
                    elapsed_ms=output.elapsed_ms,
                    log=log,
                    message=done,
                )
    # Catalogue order, not completion order: the dossier's member ordering and
    # every digest built from it have to be independent of scheduling.
    return tuple(results[spec.step_id] for spec in specs)


def _run_one(
    spec: StepSpec,
    *,
    cli: str,
    closure_root: Path,
    board: Path | None,
    schematic: Path | None,
    board_rel: str,
    schematic_rel: str,
    output_root: Path,
    variant: str,
    timeout_seconds: int,
    execute: Any,
    bom_preset: str = "",
) -> StepOutput:
    destination = output_root / spec.output_name
    if spec.output_kind == "dir":
        destination.mkdir(parents=True, exist_ok=True)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)

    substitutions = {
        "board": str(board) if board else "",
        "schematic": str(schematic) if schematic else "",
        "out": str(destination),
        "variant": variant,
    }
    # The recorded argv must be host-path independent: it feeds the domain
    # fingerprints, so an identical build from a different checkout directory
    # has to normalize to identical text.
    normalized_substitutions = {
        "board": board_rel,
        "schematic": schematic_rel,
        "out": spec.output_name,
        "variant": variant,
    }
    argv = [cli, *(part.format(**substitutions) for part in spec.argv)]
    normalized = ["kicad-cli", *(part.format(**normalized_substitutions) for part in spec.argv)]
    if spec.variant_flag and variant and variant.casefold() != "default":
        argv.extend(("--variant", variant))
        normalized.extend(("--variant", variant))
    if spec.step_id == "bom":
        extra = _bom_extra_argv(bom_preset)
        argv.extend(extra)
        normalized.extend(extra)

    started = time.perf_counter()
    print(f"[{spec.step_id}] $ {shlex.join(str(part) for part in argv)}", flush=True)
    result = execute(argv, closure_root, timeout_seconds)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    files = _collect_outputs(destination, spec)
    # A directory export writes one file per layer, so "some output exists" says
    # nothing about completeness: a gerber run that dies after F.Cu leaves a
    # non-empty directory behind. Only a single-file step -- DRC and ERC, which
    # exit non-zero precisely *because* they wrote a report of violations -- may
    # treat a produced file as success despite the exit code.
    partial_directory = spec.output_kind == "dir" and result.returncode != 0
    if result.returncode != 0 and (not files or partial_directory):
        message = (result.stderr or result.stdout or "").strip()
        if spec.optional:
            return StepOutput(
                step_id=spec.step_id,
                step_type=spec.step_type,
                normalized_argv=tuple(normalized),
                returncode=result.returncode,
                files=(),
                root=output_root,
                spec=spec,
                stdout=result.stdout,
                stderr=result.stderr,
                skipped_reason=f"optional step failed: {message[:400]}",
                elapsed_ms=elapsed_ms,
            )
        raise StepExecutionError(
            f"step {spec.step_id} ({spec.step_type}) failed with exit code "
            f"{result.returncode}: {message[:800]}"
        )
    return StepOutput(
        step_id=spec.step_id,
        step_type=spec.step_type,
        normalized_argv=tuple(normalized),
        returncode=result.returncode,
        files=files,
        root=output_root,
        spec=spec,
        stdout=result.stdout,
        stderr=result.stderr,
        elapsed_ms=elapsed_ms,
    )


def gerber_manifest_gaps(files: Sequence[Path]) -> tuple[bool, tuple[str, ...]]:
    """Check a Gerber export against the ``.gbrjob`` manifest it wrote.

    Returns ``(manifest_found, missing_paths)``.

    KiCad writes the job file last and lists every plot it produced under
    ``FilesAttributes``, so the manifest is the export's own statement of what
    the set should contain. Comparing against it beats an allowlist of layer
    names: copper layers are renamed freely by the designer -- the boards in
    this repository plot ``TOP``/``GND1``/``BOT`` rather than ``F_Cu``/``B_Cu``
    -- so a fixed expected set would be wrong for most real projects.
    """

    present = {path.name for path in files}
    job = next((path for path in files if path.suffix.casefold() == ".gbrjob"), None)
    if job is None:
        return False, ()
    try:
        manifest = json.loads(job.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return False, ()
    attributes = manifest.get("FilesAttributes") if isinstance(manifest, Mapping) else None
    if not isinstance(attributes, list):
        return False, ()
    missing = [
        str(entry["Path"])
        for entry in attributes
        if isinstance(entry, Mapping)
        and str(entry.get("Path") or "")
        and str(entry["Path"]) not in present
    ]
    return True, tuple(sorted(missing))


def _collect_outputs(destination: Path, spec: StepSpec) -> tuple[Path, ...]:
    if spec.output_kind == "file":
        return (destination,) if destination.is_file() else ()
    if not destination.is_dir():
        return ()
    return tuple(
        sorted(
            (path for path in destination.rglob("*") if path.is_file()),
            key=lambda path: path.as_posix(),
        )
    )


@dataclass(frozen=True, slots=True)
class _RunResult:
    returncode: int
    stdout: str
    stderr: str


def isolated_cli_env(scratch: Path, base: Mapping[str, str] | None = None) -> dict[str, str]:
    """Give each kicad-cli its own temp/runtime dir for the instance lock."""

    env = dict(base if base is not None else os.environ)
    temp = str(scratch)
    env["TMPDIR"] = temp
    env["TMP"] = temp
    env["TEMP"] = temp
    env["XDG_RUNTIME_DIR"] = temp
    return env


def _run_cli_process(
    argv: Sequence[str],
    cwd: Path,
    timeout_seconds: int,
    *,
    env: Mapping[str, str],
    start_new_session: bool = False,
) -> _RunResult:
    try:
        process = subprocess.Popen(
            list(argv),
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=dict(env),
            start_new_session=start_new_session,
            close_fds=True,
        )
    except OSError as exc:
        raise StepExecutionError(f"kicad-cli could not be executed: {exc}") from exc

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []

    def _pump(stream: Any, bucket: list[str]) -> None:
        if stream is None:
            return
        for line in iter(stream.readline, ""):
            bucket.append(line)
            print(line, end="", flush=True)

    readers = (
        threading.Thread(target=_pump, args=(process.stdout, stdout_chunks), daemon=True),
        threading.Thread(target=_pump, args=(process.stderr, stderr_chunks), daemon=True),
    )
    for thread in readers:
        thread.start()
    try:
        returncode = process.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as exc:  # pragma: no cover - timing dependent
        process.kill()
        process.wait()
        raise StepExecutionError(
            f"kicad-cli timed out after {timeout_seconds}s: {' '.join(argv[:4])}"
        ) from exc
    for thread in readers:
        thread.join(timeout=5)
    return _RunResult(returncode, "".join(stdout_chunks), "".join(stderr_chunks))


def _default_runner(argv: Sequence[str], cwd: Path, timeout_seconds: int) -> _RunResult:
    """Run kicad-cli and tee its output to the worker stdout for the live log."""

    with tempfile.TemporaryDirectory(prefix="kicad-cli-") as scratch:
        return _run_cli_process(
            argv,
            cwd,
            timeout_seconds,
            env=isolated_cli_env(Path(scratch)),
        )


def evidence_counts(report: Mapping[str, Any]) -> dict[str, int]:
    """Count violations by severity in a canonicalized DRC/ERC report.

    KiCad nests violations under several keys and, for ERC, under per-sheet
    lists.  Everything is folded into one severity histogram plus a total.
    """

    counts: dict[str, int] = {}
    total = 0
    for item in _iter_violations(report):
        if item.get("excluded") or item.get("ignored") or item.get("waived"):
            continue
        severity = str(item.get("severity") or "unknown").strip().lower() or "unknown"
        counts[severity] = counts.get(severity, 0) + 1
        total += 1
    counts["total"] = total
    return counts


def _iter_violations(report: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    for key in ("violations", "unconnected_items", "schematic_parity"):
        for item in report.get(key) or ():
            if isinstance(item, Mapping):
                yield item
    for sheet in report.get("sheets") or ():
        if isinstance(sheet, Mapping):
            for item in sheet.get("violations") or ():
                if isinstance(item, Mapping):
                    yield item


__all__ = [
    "EVIDENCE_STEPS",
    "STEP_BY_ID",
    "STEP_CATALOGUE",
    "StepExecutionError",
    "StepOutput",
    "StepSpec",
    "evidence_counts",
    "gerber_manifest_gaps",
    "isolated_cli_env",
    "resolve_cli_path",
    "run_step_catalogue",
    "selected_steps",
]
