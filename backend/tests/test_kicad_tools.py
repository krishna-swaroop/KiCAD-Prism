"""The KiCad tool module: discovery, isolation, timeout, tee, cancellation, version.

The local adapter is exercised against a small executable script standing in
for kicad-cli, so every behaviour here runs a real process.
"""

from __future__ import annotations

import contextvars
import io
import os
import stat
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from app.core.config import Settings
from app.services import kicad_tools
from app.services.kicad_tools import (
    KicadTools,
    LocalTool,
    ToolTimeout,
    ToolUnavailable,
    locate_kicad_cli,
)


def _script(directory: Path, name: str, body: str) -> Path:
    path = directory / name
    path.write_text(f"#!{sys.executable}\nimport os, sys, time\n{body}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


class DiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.on_path = _script(self.root, "kicad-cli", "print('path')")
        patcher = mock.patch.dict(os.environ, {"PATH": str(self.root)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_configured_path_wins_without_fallback(self) -> None:
        settings = Settings(KICAD_CLI_PATH="/opt/pinned/kicad-cli")
        self.assertEqual(locate_kicad_cli(settings), "/opt/pinned/kicad-cli")

    def test_the_legacy_kicad_cli_name_still_configures_it(self) -> None:
        with mock.patch.dict(os.environ, {"KICAD_CLI": "/opt/legacy/kicad-cli"}):
            self.assertEqual(locate_kicad_cli(Settings()), "/opt/legacy/kicad-cli")

    def test_path_comes_before_the_install_locations(self) -> None:
        with mock.patch.object(
            kicad_tools, "kicad_cli_install_candidates", return_value=("/nonexistent",)
        ) as candidates:
            self.assertEqual(locate_kicad_cli(Settings(KICAD_CLI_PATH="")), str(self.on_path))
        candidates.assert_not_called()

    def test_install_locations_are_the_last_resort(self) -> None:
        (self.root / "app").mkdir()
        installed = _script(self.root / "app", "kicad-cli", "")
        with mock.patch.dict(os.environ, {"PATH": "/nonexistent"}), mock.patch.object(
            kicad_tools, "kicad_cli_install_candidates", return_value=("/missing", str(installed))
        ):
            self.assertEqual(locate_kicad_cli(Settings(KICAD_CLI_PATH="")), str(installed))
            with mock.patch.object(kicad_tools, "kicad_cli_install_candidates", return_value=()):
                self.assertIsNone(locate_kicad_cli(Settings(KICAD_CLI_PATH="")))

    def test_resolve_reports_a_missing_tool_as_none(self) -> None:
        with mock.patch.dict(os.environ, {"PATH": "/nonexistent"}), mock.patch.object(
            kicad_tools, "kicad_cli_install_candidates", return_value=()
        ):
            tools = KicadTools.resolve(Settings(KICAD_CLI_PATH=""))
        self.assertIsNone(tools.cli)

    def test_running_a_missing_tool_is_unavailable_not_a_crash(self) -> None:
        tool = LocalTool("kicad-cli", lambda: None, isolate=True)
        self.assertFalse(tool.available())
        self.assertEqual(tool.version(), "unavailable")
        with self.assertRaises(ToolUnavailable):
            tool.run(["--version"], timeout=5)
        broken = LocalTool("kicad-cli", lambda: "/nonexistent/kicad-cli", isolate=True)
        with self.assertRaisesRegex(ToolUnavailable, "could not be executed"):
            broken.run(["--version"], timeout=5)


class LocalRunTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def _tool(self, body: str, *, isolate: bool = True) -> LocalTool:
        path = _script(self.root, f"tool-{len(list(self.root.iterdir()))}", body)
        return LocalTool("kicad-cli", lambda: str(path), isolate=isolate)

    def test_each_isolated_run_gets_its_own_temp_and_runtime_dir(self) -> None:
        tool = self._tool(
            "print(os.environ['TMPDIR'], os.environ['XDG_RUNTIME_DIR'], os.environ['TMP'],"
            " os.environ.get('KIPRJMOD', ''), os.path.isdir(os.environ['TMPDIR']))"
        )
        first = tool.run([], timeout=30, env={"KIPRJMOD": "/project"}).stdout.split()
        second = tool.run([], timeout=30).stdout.split()
        self.assertEqual(first[0], first[1])
        self.assertEqual(first[0], first[2])
        self.assertEqual(first[3], "/project")
        self.assertEqual(first[4], "True")
        self.assertNotEqual(first[0], second[0])
        self.assertNotEqual(first[0], os.environ.get("TMPDIR"))
        self.assertFalse(Path(first[0]).exists(), "the scratch dir is removed afterwards")

    def test_an_unisolated_tool_keeps_the_worker_environment(self) -> None:
        tool = self._tool("print(os.environ.get('TMPDIR', ''))", isolate=False)
        with mock.patch.dict(os.environ, {"TMPDIR": "/worker-tmp"}):
            self.assertEqual(tool.run([], timeout=30).stdout.strip(), "/worker-tmp")

    def test_output_is_captured_and_teed_line_by_line(self) -> None:
        tool = self._tool("print('to stdout'); print('to stderr', file=sys.stderr); sys.exit(3)")
        log = io.StringIO()
        with redirect_stdout(log):
            result = tool.run(["a"], timeout=30, tee=True)
        self.assertEqual(result.returncode, 3)
        self.assertFalse(result.ok)
        self.assertEqual(result.stdout, "to stdout\n")
        self.assertEqual(result.stderr, "to stderr\n")
        self.assertEqual(result.detail(), "to stderr to stdout")
        self.assertIn("to stdout", log.getvalue())
        self.assertIn("to stderr", log.getvalue())
        quiet = io.StringIO()
        with redirect_stdout(quiet):
            tool.run(["a"], timeout=30)
        self.assertEqual(quiet.getvalue(), "")

    def test_a_run_reports_its_own_peak_memory(self) -> None:
        # 64 MiB held by the child: its peak covers that, and is the child's
        # alone, not this test process's.
        tool = self._tool("block = bytearray(64 * 1024 * 1024); block[::4096] = b'x' * len(block[::4096])")
        result = tool.run([], timeout=30)
        self.assertTrue(result.ok, result.detail())
        if hasattr(os, "wait4"):
            self.assertGreater(result.peak_rss_bytes, 64 * 1024 * 1024)
            self.assertLess(result.peak_rss_bytes, 1024 * 1024 * 1024)

    def test_runs_are_recorded_only_inside_a_recording(self) -> None:
        tool = self._tool("sys.exit(2)")
        tool.run([], timeout=30)
        with kicad_tools.recording() as runs:
            tool.run([], timeout=30)
            with ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(contextvars.copy_context().run, tool.run, [], timeout=30).result()
        tool.run([], timeout=30)
        self.assertEqual(len(runs), 2)
        self.assertEqual(set(runs[0]), {"tool", "exit", "elapsed_ms", "peak_rss_bytes"})
        self.assertEqual((runs[0]["tool"], runs[0]["exit"]), ("kicad-cli", 2))

    def test_a_version_probe_is_not_recorded_as_a_run(self) -> None:
        tool = self._tool("print('10.0.7')")
        kicad_tools._versions.pop(tool.executable(), None)
        with kicad_tools.recording() as runs:
            self.assertEqual(tool.version(), "10.0.7")
        self.assertEqual(runs, [])

    def test_a_run_past_its_timeout_is_killed(self) -> None:
        marker = self.root / "finished"
        tool = self._tool(f"time.sleep(5); open({str(marker)!r}, 'w').close()")
        with self.assertRaisesRegex(ToolTimeout, "timed out after 0.5s") as caught:
            tool.run([], timeout=0.5)
        self.assertEqual(caught.exception.timeout_seconds, 0.5)
        import time as clock

        clock.sleep(5.5)
        self.assertFalse(marker.exists(), "the timed-out process kept running")

    def test_cancellation_kills_the_process_and_propagates(self) -> None:
        class Cancelled(Exception):
            pass

        polls: list[int] = []

        def cancel() -> None:
            polls.append(1)
            if len(polls) >= 2:
                raise Cancelled("Cancellation requested")

        marker = self.root / "finished"
        tool = self._tool(f"time.sleep(30); open({str(marker)!r}, 'w').close()").with_cancel(cancel)
        with mock.patch.object(kicad_tools, "_CANCEL_POLL_SECONDS", 0.05):
            with self.assertRaises(Cancelled):
                tool.run([], timeout=60)
        self.assertGreaterEqual(len(polls), 2)
        self.assertFalse(marker.exists())

    def test_the_version_probe_is_cached_per_executable(self) -> None:
        counter = self.root / "count"
        tool = self._tool(
            f"open({str(counter)!r}, 'a').write('x'); print('10.0.4')"
        )
        self.assertEqual(tool.version(), "10.0.4")
        self.assertEqual(tool.version(), "10.0.4")
        self.assertEqual(counter.read_text(), "x")


class CallersShareTheLocatorTests(unittest.TestCase):
    """KICAD_CLI_PATH reaches jobsets and catalog previews (it used not to)."""

    def setUp(self) -> None:
        patcher = mock.patch("app.core.config.settings.KICAD_CLI_PATH", "/opt/pinned/kicad-cli")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.argv: list[list[str]] = []

        def run(argv, **_kwargs):
            self.argv.append(list(argv))
            return kicad_tools.ToolResult(0)

        patcher = mock.patch.object(kicad_tools, "_run_process", side_effect=run)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_jobsets_run_the_configured_cli(self) -> None:
        from types import SimpleNamespace

        from app.services.kicad_jobset_service import execute_kicad_jobset

        with tempfile.TemporaryDirectory() as tmp:
            execute_kicad_jobset(
                SimpleNamespace(check_cancelled=lambda: None, progress=lambda **_: None),
                project_path=tmp, jobset_path=Path(tmp) / "o.kicad_jobset",
                project_file="b.kicad_pro", output_id="out", workflow_type="design",
                routing="artifact",
            )
        self.assertEqual(self.argv[0][0], "/opt/pinned/kicad-cli")

    def test_catalog_previews_run_the_configured_cli(self) -> None:
        from app.services.catalog.collaborators import build_catalog_collaborators
        from app.services.catalog.locking import NoopCatalogLocks

        pipeline = build_catalog_collaborators(catalog_locks=NoopCatalogLocks()).preview_pipeline
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "a.kicad_mod"
            source.write_text('(footprint "A")')
            pipeline.render_footprint({"canonical_path": str(source), "target_name": "A"})
        self.assertEqual(self.argv[0][0], "/opt/pinned/kicad-cli")

    def test_board_stats_default_to_the_pinned_tool(self) -> None:
        from app.services import kicad_board_stats_service

        with tempfile.TemporaryDirectory() as tmp:
            board = Path(tmp) / "b.kicad_pcb"
            board.write_text("(kicad_pcb)")
            with self.assertRaises(kicad_board_stats_service.BoardStatsUnavailable):
                kicad_board_stats_service.export_board_stats(str(board))
        self.assertEqual(self.argv[0][0], "/opt/pinned/kicad-cli")



class ProjectStateKept(unittest.TestCase):
    """kicad-cli rewrites a project's local settings when it loads a board in place (#1122)."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.board = self.folder / "board.kicad_pcb"
        self.board.write_text("(kicad_pcb)", encoding="utf-8")
        self.prl = self.folder / "board.kicad_prl"
        self.prl.write_text('{"layers": "fff"}', encoding="utf-8")
        os.utime(self.prl, ns=(1_000_000_000, 1_000_000_000))

    def test_a_rewritten_kicad_prl_is_put_back_with_its_time(self) -> None:
        with kicad_tools.project_state_kept(self.board):
            self.prl.write_text('{"layers": "000"}', encoding="utf-8")

        self.assertEqual(self.prl.read_text(encoding="utf-8"), '{"layers": "fff"}')
        self.assertEqual(self.prl.stat().st_mtime_ns, 1_000_000_000)

    def test_a_project_file_the_run_creates_is_removed(self) -> None:
        with kicad_tools.project_state_kept(self.board):
            (self.folder / "board.kicad_pro").write_text("{}", encoding="utf-8")

        self.assertFalse((self.folder / "board.kicad_pro").exists())

    def test_an_untouched_file_and_other_files_are_left_alone(self) -> None:
        output = self.folder / "render.png"
        with kicad_tools.project_state_kept(self.board):
            output.write_bytes(b"png")

        self.assertEqual(self.prl.stat().st_mtime_ns, 1_000_000_000)
        self.assertTrue(output.exists())

    def test_the_files_are_put_back_when_the_run_raises(self) -> None:
        with self.assertRaises(RuntimeError):
            with kicad_tools.project_state_kept(self.board):
                self.prl.write_text('{"layers": "000"}', encoding="utf-8")
                raise RuntimeError("kicad-cli failed")

        self.assertEqual(self.prl.read_text(encoding="utf-8"), '{"layers": "fff"}')


if __name__ == "__main__":
    unittest.main()
