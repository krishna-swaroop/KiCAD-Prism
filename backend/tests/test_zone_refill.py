import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services import zone_refill

# Stands in for KiCad's Python: the board path is the last argument.
FAKE_KICAD_PYTHON = """#!/bin/sh
for board; do :; done
printf ' (refilled)' >> "$board"
"""


class ZoneRefillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.project = self.root / "board.kicad_pro"
        self.project.write_text("{}", encoding="utf-8")
        (self.root / "board.kicad_pcb").write_text("(kicad_pcb)", encoding="utf-8")
        (self.root / "board.kicad_dru").write_text("(version 1)", encoding="utf-8")

    def _python(self, body: str) -> str:
        path = self.root / "python3"
        path.write_text(body, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
        return str(path)

    def test_refills_a_copy_beside_its_project_and_rules(self) -> None:
        log: list[str] = []
        with mock.patch.object(settings, "PRISM_KICAD_PYTHON", self._python(FAKE_KICAD_PYTHON)):
            copy = zone_refill.refill(self.project, self.root / "scratch", log)
        self.assertEqual(copy.read_text(), "(kicad_pcb) (refilled)")
        self.assertEqual((self.root / "board.kicad_pcb").read_text(), "(kicad_pcb)")
        self.assertTrue((copy.parent / "board.kicad_pro").is_file())
        self.assertTrue((copy.parent / "board.kicad_dru").is_file())

    def test_a_failed_refill_keeps_the_saved_fills(self) -> None:
        log: list[str] = []
        failing = self._python("#!/bin/sh\necho 'pcbnew: bad zone' >&2\nexit 3\n")
        with mock.patch.object(settings, "PRISM_KICAD_PYTHON", failing):
            self.assertIsNone(zone_refill.refill(self.project, self.root / "scratch", log))
        self.assertIn("pcbnew: bad zone", log[-1])

    def test_switched_off_it_does_nothing(self) -> None:
        with mock.patch.object(settings, "PRISM_ZONE_REFILL_ENABLED", False):
            self.assertIsNone(zone_refill.refill(self.project, self.root / "scratch", []))
            hasher = __import__("hashlib").sha256()
            zone_refill.update_fingerprint(hasher)
        self.assertEqual(hasher.hexdigest(), __import__("hashlib").sha256().hexdigest())


if __name__ == "__main__":
    unittest.main()
