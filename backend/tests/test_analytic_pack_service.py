import hashlib
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services import analytic_pack_service

FAKE_HELPER = """#!/bin/sh
# emit-pack --pcb BOARD --output OUT
[ "$1" = emit-pack ] || exit 2
printf 'PACK' > "$5"
echo '{"operations":3,"chunks":1,"pack_bytes":4,"total_ms":1.0}'
"""

FAILING_HELPER = """#!/bin/sh
printf 'partial' > "$5"
echo 'materialize board: bad zone' >&2
exit 1
"""


class AnalyticPackServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.project = self.root / "board.kicad_pro"
        self.project.write_text("{}", encoding="utf-8")
        (self.root / "board.kicad_pcb").write_text("(kicad_pcb)", encoding="utf-8")
        self.output = self.root / "out"
        self.output.mkdir()

    def _helper(self, body: str) -> Path:
        helper = self.root / "prism-kicad-native"
        helper.write_text(body, encoding="utf-8")
        helper.chmod(helper.stat().st_mode | stat.S_IEXEC)
        return helper

    def test_writes_pack_and_bundle_entry(self) -> None:
        helper = self._helper(FAKE_HELPER)
        log: list[str] = []
        with mock.patch.object(settings, "PRISM_KICAD_NATIVE_PATH", str(helper)):
            entry = analytic_pack_service.write_pack(self.project, self.output, log)
        self.assertEqual(
            entry,
            {
                "schema": "kicad_monkey.materialization.a0",
                "path": "board.kmpack",
                "bytes": 4,
                "sha256": hashlib.sha256(b"PACK").hexdigest(),
                "operations": 3,
            },
        )
        analytic_pack_service.validate_entry(self.output, entry)

    def test_helper_failure_leaves_no_pack(self) -> None:
        helper = self._helper(FAILING_HELPER)
        log: list[str] = []
        with mock.patch.object(settings, "PRISM_KICAD_NATIVE_PATH", str(helper)):
            entry = analytic_pack_service.write_pack(self.project, self.output, log)
        self.assertIsNone(entry)
        self.assertFalse((self.output / "board.kmpack").exists())
        self.assertIn("bad zone", log[-1])

    def test_missing_board_is_skipped(self) -> None:
        (self.root / "board.kicad_pcb").unlink()
        log: list[str] = []
        self.assertIsNone(analytic_pack_service.write_pack(self.project, self.output, log))
        self.assertIn("no board file", log[-1])

    def test_validate_rejects_missing_or_resized_pack(self) -> None:
        analytic_pack_service.validate_entry(self.output, None)
        entry = {"path": "board.kmpack", "bytes": 4}
        with self.assertRaises(RuntimeError):
            analytic_pack_service.validate_entry(self.output, entry)
        (self.output / "board.kmpack").write_bytes(b"PACKED")
        with self.assertRaises(RuntimeError):
            analytic_pack_service.validate_entry(self.output, entry)

    def test_fingerprint_changes_only_when_enabled(self) -> None:
        def digest() -> str:
            hasher = hashlib.sha256()
            analytic_pack_service.update_fingerprint(hasher)
            return hasher.hexdigest()

        with mock.patch.object(settings, "PRISM_ANALYTIC_PCB_ENABLED", False):
            disabled = digest()
        with mock.patch.object(settings, "PRISM_ANALYTIC_PCB_ENABLED", True):
            enabled = digest()
        self.assertEqual(disabled, hashlib.sha256().hexdigest())
        self.assertNotEqual(enabled, disabled)


if __name__ == "__main__":
    unittest.main()
