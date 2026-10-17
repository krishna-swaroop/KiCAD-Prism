"""K's CLI adapter against the stub ``prism-kicad`` (cli-spec.md §3, §4, §10), every mode included."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app.services.design_bundle import cli, manifest, schemas
from app.services.design_bundle.archive import open_archive
from app.services.design_bundle.revision_key import CONFIG_SCHEMA
from support.design_bundle_fixtures import PROJECT_FILES, install_stub, set_modes

RK = "faea5ace66f591553c21fdcb2555e5a67e6e2fe73b7d17663375ac6f809206f5"
CONFIG = {
    "schema": CONFIG_SCHEMA,
    "project_file": "board/demo.kicad_pro",
    "root_schematic": "board/demo.kicad_sch",
    "board": "board/demo.kicad_pcb",
    "excluded_dirs": ["board/Design-Outputs"],
}


class StubCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.log = install_stub(self)
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.src = self.tmp / "src"
        for rel, content in PROJECT_FILES.items():
            (self.src / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.src / rel).write_text(content, encoding="utf-8")
        self.out = self.tmp / "store" / "b.prism"
        self.out.parent.mkdir()

    def _config(self, **extra: object) -> Path:
        path = self.tmp / "effective.json"
        path.write_text(json.dumps({**CONFIG, **extra}), encoding="utf-8")
        return path

    def _parse(self, **extra: object) -> cli.CliRun:
        return self._parse_with([], **extra)

    def _parse_with(self, more: list[str], **extra: object) -> cli.CliRun:
        args = ["bundle", "build", *more, str(self.src / "board/demo.kicad_pro"), "--stage", "parse", "--source-root", str(self.src),
                "-o", str(self.out), "--revision-key", RK, "--config", str(self._config(**extra)), *cli.limits("parse")]
        return cli.run(args, timeout_seconds=60, expect="prism.cli.build_result.a0")

    def _board(self, *, refill: bool = True, tool: str = "10.0.6") -> cli.CliRun:
        args = ["bundle", "build", "--stage", "board", "--in", str(self.out), "-o", str(self.out)]
        if refill:
            refilled = self.tmp / "demo.kicad_pcb"
            refilled.write_text("(kicad_pcb (version 20260206) (refilled))\n", encoding="utf-8")
            args += ["--refilled-board", str(refilled), "--refill-tool", tool]
        return cli.run(args, timeout_seconds=60, expect="prism.cli.build_result.a0")

    def _models(self, tool: str = "10.0.6") -> cli.CliRun:
        glb = self.tmp / "components.glb"
        glb.write_bytes(b"glTF\x02\x00\x00\x00" + b"\0" * 12)
        args = ["bundle", "build", "--stage", "models", "--in", str(self.out), "-o", str(self.out),
                "--models-glb", str(glb), "--models-tool", tool]
        return cli.run(args, timeout_seconds=60, expect="prism.cli.build_result.a0")

    def _archive(self):
        archive = open_archive(self.out)
        self.assertEqual(manifest.violations(archive.manifest), [])
        for member in archive.manifest["members"]:
            archive.read(member["path"])  # size, SHA-256 and schema of every member
        return archive

    def test_version_is_the_generator_in_canonical_bytes(self) -> None:
        generator = cli.generator()
        self.assertEqual(generator.digest, "7810c69bd40255d4e0eb7ccbaf09c6d24b76e838ed3e896429e67eb6e7c10300")

    def test_parse_board_models_chain_through_one_archive(self) -> None:
        parsed = self._parse()
        self.assertEqual(parsed.exit_code, 0)
        self.assertGreater(parsed.peak_rss_bytes, 0)
        archive = self._archive()
        self.assertEqual(manifest.statuses(archive.manifest), {"parse": "complete", "board": "pending", "models": "pending"})
        paths = {m["path"] for m in archive.manifest["members"]}
        self.assertIn("sources/board/demo.kicad_dru", paths)
        self.assertNotIn("sources/board/Design-Outputs/old.kicad_pcb", paths)  # excluded_dirs
        self.assertEqual(archive.manifest["bundle_key"], cli.generator().bundle_key(RK))
        self.assertEqual(self._board().exit_code, 0)
        self.assertEqual(manifest.next_stage(self._archive().manifest), "models")
        self.assertEqual(self._models().exit_code, 0)
        final = self._archive()
        self.assertTrue(manifest.all_final(final.manifest))
        self.assertIn("viewer/models/components.glb", {m["path"] for m in final.manifest["members"]})
        verified = cli.run(["bundle", "verify", str(self.out)], timeout_seconds=60, expect="prism.cli.verify_report.a0")
        self.assertEqual(verified.document["status"], "valid")
        target = self.tmp / "x"
        target.mkdir()
        extracted = cli.run(["bundle", "extract", str(self.out), "sources/", "-o", str(target)], timeout_seconds=60,
                            expect="prism.cli.extract_result.a0")
        self.assertTrue((target / "sources/board/demo.kicad_pro").is_file())
        self.assertTrue(extracted.document["members"])
        logged = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual([entry["exit"] for entry in logged][-5:], [0, 0, 0, 0, 0])

    def test_upgraded_sources_are_recorded_and_validated(self) -> None:
        done = self._parse_with(["--upgraded", "board/demo.kicad_pcb=20241229"])
        self.assertEqual(done.exit_code, 0)
        member = self._archive().member("sources/board/demo.kicad_pcb")
        self.assertEqual(member["source"]["upgraded_from_version"], 20241229)
        self.assertNotIn("upgraded_from_version", self._archive().member("sources/board/demo.kicad_sch")["source"])
        self.assertEqual(cli.generator().kicad_file_formats, {"board": 20260206, "schematic": 20260306})
        for bad in ("board/demo.kicad_pcb=20260206", "board/missing.kicad_sch=20230121"):
            with self.subTest(bad=bad):
                with self.assertRaises(cli.CliFailure) as caught:
                    self._parse_with(["--upgraded", bad])
                self.assertEqual((caught.exception.exit_code, caught.exception.code), (3, "upgrade-record-invalid"))
        with self.assertRaises(cli.CliFailure) as caught:
            self._parse_with(["--upgraded", "board/demo.kicad_pro=1"])
        self.assertEqual(caught.exception.exit_code, 2)
        self.assertEqual(cli.upgraded_args([{"path": "a.kicad_pcb", "upgraded_from_version": 20241229}]),
                         ["--upgraded", "a.kicad_pcb=20241229"])

    def test_a_later_patch_release_of_kicad_serves_the_generator(self) -> None:
        """decisions.md, KiCad patch releases: --refill-tool/--models-tool match the generator's major.minor."""

        self._parse()
        with self.assertRaises(cli.CliFailure) as caught:
            self._board(tool="10.1.0")
        self.assertEqual((caught.exception.exit_code, caught.exception.code), (7, "kicad-version-mismatch"))
        self.assertEqual(self._board(tool="10.0.7").exit_code, 0)
        with self.assertRaises(cli.CliFailure) as caught:
            self._models(tool="10.1.0")
        self.assertEqual(caught.exception.code, "kicad-version-mismatch")
        self.assertEqual(self._models(tool="10.0.7").exit_code, 0)

    def test_saved_fills_refuse_a_refilled_board(self) -> None:
        self._parse(zone_fills="saved")
        with self.assertRaises(cli.CliFailure) as caught:
            self._board(refill=True)
        self.assertEqual((caught.exception.exit_code, caught.exception.code), (7, "zone-fills-mismatch"))
        self.assertFalse(caught.exception.retryable)
        self.assertEqual(self._board(refill=False).exit_code, 0)
        board = self._archive().manifest["stages"]["board"]
        self.assertEqual(board["fill_provenance"], "saved")
        self.assertEqual([w["code"] for w in board["warnings"]], ["saved-fills-used"])

    def test_recorded_content_failures_exit_9(self) -> None:
        set_modes("bundle build:parse=failed")
        failed = self._parse()
        self.assertEqual(failed.exit_code, 9)
        record = self._archive().manifest["stages"]
        self.assertEqual((record["parse"]["status"], record["board"]["skip_reason"]), ("failed", "earlier-stage-failed"))
        set_modes("bundle build:parse=partial")
        self.out.unlink()
        partial = self._parse()
        self.assertEqual(partial.exit_code, 9)
        self.assertEqual(self._archive().manifest["stages"]["parse"]["failed_members"][0]["path"], "design.json")
        set_modes("bundle build:board=partial")
        self.assertEqual(self._board().exit_code, 9)
        stages = self._archive().manifest["stages"]
        self.assertEqual((stages["board"]["status"], stages["models"]["status"]), ("partial", "skipped"))

    def test_project_absent_is_exit_10_and_leaves_the_output(self) -> None:
        set_modes("bundle build:parse=absent")
        done = self._parse()
        self.assertEqual((done.exit_code, done.document["code"]), (10, "project-absent"))
        self.assertFalse(self.out.exists())
        set_modes("revision-key=absent")
        absent = cli.run(["revision-key", str(self.tmp), "--commit", "HEAD", "--project", "x.kicad_pro"], timeout_seconds=30,
                         expect="prism.revision_key.record.a1")
        self.assertEqual(absent.exit_code, 10)

    def test_exit_codes_map_to_retry_or_not(self) -> None:
        for code in range(1, 8):
            with self.subTest(exit=code):
                set_modes(f"bundle build:parse=exit:{code}")
                with self.assertRaises(cli.CliFailure) as caught:
                    self._parse()
                failure = caught.exception
                self.assertEqual(failure.exit_code, code)
                self.assertEqual(failure.retryable, code in (1, 5, 6))
                schemas.validate(failure.error, "prism.cli.error.a0")
                self.assertFalse(self.out.exists())  # -o changes only on exit 0 or 9

    def test_crash_hang_and_garbage_stderr(self) -> None:
        set_modes("bundle build:parse=crash")
        with self.assertRaises(cli.CliFailure) as caught:
            self._parse()
        self.assertEqual((caught.exception.exit_code, caught.exception.retryable), (101, True))  # outside §4: internal
        set_modes("bundle build:parse=hang")
        with self.assertRaises(cli.CliFailure) as caught:
            cli.run(["bundle", "build", str(self.src / "board/demo.kicad_pro"), "--stage", "parse", "-o", str(self.out)],
                    timeout_seconds=1.5, expect="prism.cli.build_result.a0")
        self.assertTrue(caught.exception.retryable)
        set_modes("bundle build:parse=garbage-stderr")
        done = self._parse()
        self.assertEqual(done.exit_code, 0)
        self.assertIsInstance(done.stderr_lines[0], str)  # kept verbatim, decided nothing
        self.assertTrue(all(isinstance(line, dict) for line in done.stderr_lines[1:]))

    def test_usage_errors_are_permanent(self) -> None:
        for args in (["bundle", "build", "--stage=parse"], ["bundle", "nope"], ["bundle", "build", "--stage", "board", "-o", "x"]):
            with self.subTest(args=args):
                with self.assertRaises(cli.CliFailure) as caught:
                    cli.run(args, timeout_seconds=30, expect="prism.cli.build_result.a0")
                self.assertEqual(caught.exception.exit_code, 2)
                self.assertFalse(caught.exception.retryable)

    def test_a_missing_binary_is_unavailable(self) -> None:
        from unittest import mock

        from app.core.config import settings

        with mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_CLI_PATH", ""), mock.patch.object(shutil, "which", return_value=None):
            with self.assertRaises(cli.CliUnavailable):
                cli.executable()


if __name__ == "__main__":
    unittest.main()
