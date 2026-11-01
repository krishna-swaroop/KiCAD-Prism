"""Reading a release build's BOM out of its stored dossier."""

from __future__ import annotations

import hashlib
import io
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.supply import release_bom, release_source  # noqa: E402

BOM_PATH = "assembly/bom.csv"
SMALL_BOM = "Reference,MPN\nR1,R-1\n"


def _dossier(directory: Path, data: bytes) -> Path:
    target = directory / "dossier.tar.gz"
    info = tarfile.TarInfo(BOM_PATH)
    info.size = len(data)
    with tarfile.open(target, "w:gz") as archive:
        archive.addfile(info, io.BytesIO(data))
    return target


class ReleaseSourceTests(unittest.TestCase):
    def _read(self, dossier: Path, digest: str = "") -> str:
        members = [{"member_kind": "bom", "path": BOM_PATH, "released_digest": digest}]
        with mock.patch("app.services.release_studio_service.get_build", return_value={"id": "b1", "dossier_artifact_id": "a1"}), \
                mock.patch("app.services.release_studio_service.build_members", return_value=members), \
                mock.patch("app.services.release_studio_service.get_artifact", return_value={"object_path": str(dossier)}):
            return release_source.build_bom_text("b1")

    def test_a_small_bom_is_read_and_checked_against_its_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            data = SMALL_BOM.encode()
            dossier = _dossier(Path(directory), data)
            self.assertEqual(self._read(dossier, hashlib.sha256(data).hexdigest()), SMALL_BOM)

    def test_a_bom_over_the_size_limit_is_refused_before_it_is_read(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dossier = _dossier(Path(directory), b"x" * 64)
            with mock.patch.object(release_bom, "MAX_BYTES", 8):
                with self.assertRaises(release_source.NoBuildBom) as caught:
                    self._read(dossier)
            self.assertIn("larger than 8 MB", str(caught.exception))

    def test_a_bom_that_does_not_match_its_record_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dossier = _dossier(Path(directory), SMALL_BOM.encode())
            with self.assertRaises(release_source.NoBuildBom) as caught:
                self._read(dossier, "0" * 64)
            self.assertIn("does not match its record", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
