"""The external KiCad tools Prism runs: where they are and how each run is bounded.

Every caller that runs ``kicad-cli`` goes through a :class:`KicadTool`. The
tool owns what used to be repeated, unevenly, at each call site:

- **discovery** — ``Settings.KICAD_CLI_PATH``, then ``PATH``, then the usual
  install locations;
- **isolation** — each kicad-cli process gets its own temp/runtime directory,
  because KiCad takes an instance lock keyed on it;
- **a timeout** — every run states one; an expired run is killed and raises
  :class:`ToolTimeout`;
- **output capture and tee** — stdout/stderr are captured, and optionally
  echoed line by line to the worker log as they arrive;
- **cancellation** — a ``cancel`` callable (``JobContext.check_cancelled``) is
  polled while the process runs; when it raises, the process is killed and
  the exception propagates;
- **a version probe** — ``--version``, cached per executable.

Two adapters satisfy the interface: :class:`LocalTool` runs the real binary,
and ``app.services.kicad_tool_replay.ReplayTool`` answers from a recording.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Iterator, Mapping, Protocol, Sequence

from app.services import kicad_libraries
from app.services.process_tree import group_popen_kwargs, kill_tree

if TYPE_CHECKING:  # pragma: no cover
    from app.core.config import Settings


KICAD_CLI = "kicad-cli"
VERSION_TIMEOUT_SECONDS = 10
_CANCEL_POLL_SECONDS = 1.0

CancelCheck = Callable[[], None]


class ToolError(RuntimeError):
    """A KiCad tool could not be run to completion."""


class ToolUnavailable(ToolError):
    """The tool is not installed where Prism looks, or could not be executed."""


class ToolTimeout(ToolError):
    """The tool ran past its timeout and was killed."""

    def __init__(self, message: str, timeout_seconds: float) -> None:
        super().__init__(message)
        self.timeout_seconds = timeout_seconds


@dataclass(frozen=True, slots=True)
class ToolResult:
    """One finished run. A non-zero exit is a result, not an exception."""

    returncode: int
    stdout: str = ""
    stderr: str = ""
    elapsed_ms: int = 0
    #: The process's peak resident memory (``wait4``'s ``ru_maxrss``); 0 where
    #: the platform does not report it.
    peak_rss_bytes: int = 0

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    def detail(self) -> str:
        """Both streams, stripped: kicad-cli reports argument errors on stdout."""

        return " ".join(
            part.strip() for part in (self.stderr, self.stdout) if part and part.strip()
        )


class KicadTool(Protocol):
    """One external KiCad tool, as every caller sees it."""

    name: str

    def available(self) -> bool: ...

    def executable(self) -> str: ...

    def version(self) -> str: ...

    def with_cancel(self, cancel: CancelCheck | None) -> "KicadTool": ...

    def run(
        self,
        args: Sequence[str],
        *,
        timeout: float,
        cwd: Path | str | None = None,
        env: Mapping[str, str] | None = None,
        tee: bool = False,
    ) -> ToolResult: ...


# -- recording ----------------------------------------------------------------

#: The runs of the code inside ``recording()``; ``None`` outside one.
_recorded: ContextVar[list[dict[str, Any]] | None] = ContextVar("kicad_tool_runs", default=None)


@contextmanager
def recording() -> Iterator[list[dict[str, Any]]]:
    """Collect every tool run inside the block: its tool, exit, wall time and peak memory.

    A job wraps a step with it to report what the KiCad processes cost; worker
    threads the step starts see it when they run in a copy of the context.
    """

    runs: list[dict[str, Any]] = []
    token = _recorded.set(runs)
    try:
        yield runs
    finally:
        _recorded.reset(token)


def _record(name: str, result: "ToolResult") -> "ToolResult":
    runs = _recorded.get()
    if runs is not None:
        runs.append({
            "tool": name,
            "exit": result.returncode,
            "elapsed_ms": result.elapsed_ms,
            "peak_rss_bytes": result.peak_rss_bytes,
        })
    return result


# -- discovery ----------------------------------------------------------------


def _settings(settings: "Settings | None") -> "Settings":
    if settings is not None:
        return settings
    from app.core.config import settings as configured

    return configured


def kicad_cli_install_candidates() -> tuple[str, ...]:
    """Where a KiCad install puts kicad-cli when it is not on PATH."""

    system = platform.system()
    if system == "Darwin":
        return (
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"),
        )
    if system == "Windows":
        root = Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "KiCad"
        versions = sorted((d for d in root.iterdir() if d.is_dir()), reverse=True) if root.is_dir() else []
        return tuple(str(version / "bin" / "kicad-cli.exe") for version in versions)
    return ("/usr/bin/kicad-cli", "/usr/local/bin/kicad-cli")


def locate_kicad_python(settings: "Settings | None" = None) -> str | None:
    """``PRISM_KICAD_PYTHON``, else the Python that ships with KiCad; ``None`` if absent.

    A configured value is used as given, like ``KICAD_CLI_PATH``.
    """

    configured = _settings(settings).PRISM_KICAD_PYTHON.strip()
    if configured:
        return configured
    system = platform.system()
    if system == "Linux":
        return "/usr/bin/python3"
    cli = locate_kicad_cli(settings)
    if not cli:
        return None
    folder = Path(cli).parent
    if system == "Windows":
        candidate = folder / "python.exe"
    else:
        candidate = folder.parent / "Frameworks/Python.framework/Versions/Current/bin/python3"
    return str(candidate) if candidate.is_file() else None


def locate_kicad_cli(settings: "Settings | None" = None) -> str | None:
    """``KICAD_CLI_PATH``, then PATH, then the install locations; ``None`` if absent.

    A configured path is used as given, without falling back: a deployment that
    pins its CLI must not silently run a different one.
    """

    configured = _settings(settings).KICAD_CLI_PATH.strip()
    if configured:
        return configured
    found = shutil.which(KICAD_CLI)
    if found:
        return found
    return next((path for path in kicad_cli_install_candidates() if Path(path).is_file()), None)


def isolated_env(scratch: Path, base: Mapping[str, str] | None = None) -> dict[str, str]:
    """Point temp and runtime directories at ``scratch`` for KiCad's instance lock."""

    env = dict(base if base is not None else os.environ)
    for key in ("TMPDIR", "TMP", "TEMP", "XDG_RUNTIME_DIR"):
        env[key] = str(scratch)
    return env


# -- the local adapter ----------------------------------------------------------


_versions: dict[str, str] = {}
_versions_lock = threading.Lock()


class LocalTool:
    """Runs the installed binary, located afresh on every call.

    Locating per call is cheap and lets a long-lived process pick up a tool
    installed after it started.
    """

    def __init__(
        self,
        name: str,
        locate: Callable[[], str | None],
        *,
        isolate: bool,
        cancel: CancelCheck | None = None,
        libraries: "kicad_libraries.Snapshot | None" = None,
    ) -> None:
        self.name = name
        self._locate = locate
        self._isolate = isolate
        self._cancel = cancel
        # None: the job's pinned snapshot of the KiCad path libraries. NO_LIBRARIES opts out.
        self._libraries = libraries

    def __repr__(self) -> str:
        return f"LocalTool({self.name!r})"

    def available(self) -> bool:
        return bool(self._locate())

    def executable(self) -> str:
        path = self._locate()
        if not path:
            raise ToolUnavailable(f"{self.name} is not available on PATH")
        return path

    def with_cancel(self, cancel: CancelCheck | None) -> "LocalTool":
        return LocalTool(self.name, self._locate, isolate=self._isolate, cancel=cancel, libraries=self._libraries)

    def version(self) -> str:
        """``--version`` output; ``unavailable``/``unknown`` when it cannot be read.

        Only a resolved release is cached: a transient probe failure must not
        pin ``unknown`` for the life of the process.
        """

        path = self._locate()
        if not path:
            return "unavailable"
        with _versions_lock:
            cached = _versions.get(path)
        if cached is not None:
            return cached
        # A discovery probe, not work: it runs once per process, so recording it
        # would charge whichever step asked first (a refill cache hit then
        # looked like a refill run).
        token = _recorded.set(None)
        try:
            result = self.run(["--version"], timeout=VERSION_TIMEOUT_SECONDS)
            version = (result.stdout or result.stderr or "").strip() or "unknown"
        except ToolError:
            version = "unknown"
        finally:
            _recorded.reset(token)
        if version != "unknown":
            with _versions_lock:
                _versions[path] = version
        return version

    def run(
        self,
        args: Sequence[str],
        *,
        timeout: float,
        cwd: Path | str | None = None,
        env: Mapping[str, str] | None = None,
        tee: bool = False,
    ) -> ToolResult:
        argv = [self.executable(), *(str(part) for part in args)]
        base = (self._libraries or kicad_libraries.current()).env(os.environ)
        base.update(env or {})
        if not self._isolate:
            return _record(
                self.name, _run_process(argv, cwd=cwd, env=base, timeout=timeout, tee=tee, cancel=self._cancel)
            )
        with tempfile.TemporaryDirectory(prefix=f"{self.name}-") as scratch:
            return _record(self.name, _run_process(
                argv, cwd=cwd, env=isolated_env(Path(scratch), base),
                timeout=timeout, tee=tee, cancel=self._cancel,
            ))


def _run_process(
    argv: Sequence[str],
    *,
    cwd: Path | str | None,
    env: Mapping[str, str],
    timeout: float,
    tee: bool,
    cancel: CancelCheck | None,
) -> ToolResult:
    started = time.perf_counter()
    try:
        process = subprocess.Popen(
            list(argv),
            cwd=str(cwd) if cwd is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=dict(env),
            close_fds=True,
            **group_popen_kwargs(),
        )
    except OSError as exc:
        raise ToolUnavailable(f"{Path(argv[0]).name} could not be executed: {exc}") from exc

    chunks: dict[str, list[str]] = {"stdout": [], "stderr": []}

    def _pump(stream: Any, bucket: list[str]) -> None:
        for line in iter(stream.readline, ""):
            bucket.append(line)
            if tee:
                print(line, end="", flush=True)

    readers = [
        threading.Thread(target=_pump, args=(process.stdout, chunks["stdout"]), daemon=True),
        threading.Thread(target=_pump, args=(process.stderr, chunks["stderr"]), daemon=True),
    ]
    for reader in readers:
        reader.start()

    deadline = time.monotonic() + timeout
    peak_rss_bytes = 0
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ToolTimeout(
                    f"{Path(argv[0]).name} timed out after {timeout:g}s: "
                    f"{' '.join(str(part) for part in argv[1:4])}",
                    timeout,
                )
            finished = wait_process(process, min(remaining, _CANCEL_POLL_SECONDS))
            if finished is not None:
                returncode, peak_rss_bytes = finished
                break
            if cancel is not None:
                cancel()
    except BaseException:
        kill_tree(process)
        raise
    finally:
        for reader in readers:
            reader.join(timeout=5)
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                stream.close()
    return ToolResult(
        returncode=returncode,
        stdout="".join(chunks["stdout"]),
        stderr="".join(chunks["stderr"]),
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        peak_rss_bytes=peak_rss_bytes,
    )


#: How often a waiting run checks whether its process has exited.
_WAIT_POLL_SECONDS = 0.05


def wait_process(process: subprocess.Popen[Any], seconds: float) -> tuple[int, int] | None:
    """``(exit code, peak resident bytes)`` once ``process`` exits within ``seconds``, else ``None``.

    Where the platform has ``wait4`` the process is reaped with it, so its
    resource usage (peak memory) is read without counting any other child.
    """

    if not hasattr(os, "wait4"):
        try:
            return process.wait(timeout=seconds), 0
        except subprocess.TimeoutExpired:
            return None
    until = time.monotonic() + seconds
    while True:
        pid, status, usage = os.wait4(process.pid, os.WNOHANG)
        if pid:
            returncode = os.waitstatus_to_exitcode(status)
            process.returncode = returncode
            return returncode, rss_bytes(usage.ru_maxrss)
        if time.monotonic() >= until:
            return None
        time.sleep(_WAIT_POLL_SECONDS)


def rss_bytes(maxrss: int) -> int:
    """``ru_maxrss`` in bytes: kilobytes on Linux, bytes on macOS."""

    return maxrss if sys.platform == "darwin" else maxrss * 1024


def kicad_cli(
    settings: "Settings | None" = None, *, libraries: "kicad_libraries.Snapshot | None" = None
) -> LocalTool:
    """The kicad-cli every KiCad job runs, isolated per process.

    It runs with the KiCad path libraries the job pinned (``kicad_libraries.current``).
    A caller whose result must not depend on what this server fetched passes
    ``libraries=kicad_libraries.NO_LIBRARIES``.
    """

    return LocalTool(KICAD_CLI, lambda: locate_kicad_cli(settings), isolate=True, libraries=libraries)


# kicad-cli rewrites a project's local settings when it loads a board or
# schematic beside them (kicad-cli 10 writes layer and visibility state into
# ``.kicad_prl``). Inside a server checkout that edit is a local change, and a
# dirty checkout never fast-forwards on Sync.
PROJECT_STATE_SUFFIXES = (".kicad_prl", ".kicad_pro")


@contextmanager
def project_state_kept(design_file: str | os.PathLike[str]) -> Iterator[None]:
    """Put back the project files kicad-cli rewrites while it reads ``design_file`` in place.

    Each ``.kicad_prl`` and ``.kicad_pro`` beside the file is restored byte for
    byte, with its modification time, when the run changed it; one the run
    created is removed. Runs on a scratch copy of the design do not need this.
    """

    folder = Path(design_file).parent
    kept: dict[Path, tuple[bytes, int]] = {}
    for path in folder.iterdir() if folder.is_dir() else ():
        if path.suffix in PROJECT_STATE_SUFFIXES and path.is_file():
            kept[path] = (path.read_bytes(), path.stat().st_mtime_ns)
    try:
        yield
    finally:
        for path in folder.iterdir() if folder.is_dir() else ():
            if path.suffix in PROJECT_STATE_SUFFIXES and path.is_file() and path not in kept:
                path.unlink(missing_ok=True)
        for path, (data, mtime_ns) in kept.items():
            try:
                if path.is_file() and path.read_bytes() == data:
                    continue
                path.write_bytes(data)
                os.utime(path, ns=(mtime_ns, mtime_ns))
            except OSError:
                continue


# -- the set a job is handed ------------------------------------------------------


@dataclass(frozen=True, slots=True)
class KicadTools:
    """The tools one job runs. ``None`` means not installed: callers degrade."""

    cli: KicadTool | None

    @classmethod
    def resolve(
        cls, settings: "Settings | None" = None, *, libraries: "kicad_libraries.Snapshot | None" = None
    ) -> "KicadTools":
        """Locate the CLI now; a missing one is ``None``."""

        cli = kicad_cli(settings, libraries=libraries)
        return cls(cli=cli if cli.available() else None)

    def with_cancel(self, cancel: CancelCheck | None) -> "KicadTools":
        return replace(
            self,
            cli=self.cli.with_cancel(cancel) if self.cli is not None else None,
        )


__all__ = [
    "KICAD_CLI",
    "CancelCheck",
    "KicadTool",
    "KicadTools",
    "LocalTool",
    "ToolError",
    "ToolResult",
    "ToolTimeout",
    "ToolUnavailable",
    "isolated_env",
    "kicad_cli",
    "kicad_cli_install_candidates",
    "locate_kicad_cli",
    "project_state_kept",
]
