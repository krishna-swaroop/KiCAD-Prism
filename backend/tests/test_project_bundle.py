import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from app.services import project_bundle


def _archive(path: Path, members: dict[str, bytes], *, cross_check: dict | None = None, lie: str = "") -> Path:
    manifest = {
        "members": [
            {"path": name, "sha256": hashlib.sha256(b"tampered" if name == lie else data).hexdigest()}
            for name, data in members.items()
        ],
        "cross_check": cross_check or {"status": "passed"},
    }
    with zipfile.ZipFile(path, "w") as bundle:
        bundle.writestr("bundle.json", json.dumps(manifest))
        for name, data in members.items():
            bundle.writestr(name, data)
    return path


class ProjectBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.members = {
            "viewer/bundle.json": b"{}",
            "viewer/scene-gltf/layer-4-tile-0-0.glb": b"glTF",
            "materialization/board.kmpack": b"PACK",
            "sources/b.kicad_pcb": b"(kicad_pcb)",
            "design.json": b"{}",
        }

    def test_unpacks_the_viewer_files_and_the_pack_only(self) -> None:
        archive = _archive(self.root / "build.prism", self.members)
        target = self.root / "build"
        project_bundle.unpack_into(archive, target)
        self.assertEqual((target / "scene-gltf" / "layer-4-tile-0-0.glb").read_bytes(), b"glTF")
        self.assertEqual((target / "board.kmpack").read_bytes(), b"PACK")
        self.assertFalse((target / "sources").exists())
        self.assertFalse((target / "design.json").exists())
        self.assertTrue((target / project_bundle.MANIFEST_FILE).is_file())
        self.assertEqual(project_bundle.archive_path(target), archive)

    def test_a_member_that_does_not_match_its_hash_is_refused(self) -> None:
        archive = _archive(self.root / "build.prism", self.members, lie="viewer/bundle.json")
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            project_bundle.unpack_into(archive, self.root / "build")
        self.assertFalse((self.root / "build").exists())

    def test_a_member_cannot_escape_the_directory(self) -> None:
        archive = _archive(self.root / "build.prism", {"viewer/../../evil": b"x"})
        with self.assertRaisesRegex(RuntimeError, "escapes"):
            project_bundle.unpack_into(archive, self.root / "build")

    def test_simulation_is_gated_on_the_cross_check(self) -> None:
        self.assertIsNone(project_bundle.simulation_gate({"cross_check": {"status": "passed-with-warnings"}}))
        self.assertIn("no schematic", project_bundle.simulation_gate({"cross_check": {"status": "skipped"}}))
        failed = {"cross_check": {"status": "failed", "errors": [
            {"code": "net-conflict", "message": "R2201 pad 1: board net A, schematic net B"},
            {"code": "net-conflict", "message": "second"},
        ]}}
        self.assertEqual(
            project_bundle.simulation_gate(failed),
            "The schematic and board disagree: R2201 pad 1: board net A, schematic net B (and 1 more)",
        )


class StaleBuildTests(unittest.TestCase):
    def test_other_builds_archives_go_with_their_folders(self) -> None:
        from unittest import mock

        from app.services import semantic_visualizer_service as visualizer

        root = Path(tempfile.mkdtemp())
        source = root / "prj" / "src"
        for name in ("build-old", "build-new"):
            (source / name).mkdir(parents=True)
            (source / f"{name}.prism").write_bytes(b"PK")
        (source / "notes.txt").write_text("kept")
        with mock.patch.object(visualizer, "semantic_store_root", return_value=root):
            visualizer._prune_stale_bundles("prj", "src", keep_build="build-new")
        self.assertEqual(sorted(path.name for path in source.iterdir()), ["build-new", "build-new.prism", "notes.txt"])


class SourceKeyTests(unittest.TestCase):
    def test_a_checkout_of_the_same_sources_has_the_same_key(self) -> None:
        import os
        import shutil

        from app.services.semantic_visualizer_service import source_fingerprint_for_root

        root = Path(tempfile.mkdtemp())
        working = root / "working"
        working.mkdir()
        (working / "b.kicad_pro").write_text("{}")
        (working / "b.kicad_pcb").write_bytes(b"(kicad_pcb)" * 1000)
        checkout = root / "checkout"
        shutil.copytree(working, checkout)
        os.utime(checkout / "b.kicad_pcb", (1, 1))
        key = source_fingerprint_for_root(working, project_file_rel="b.kicad_pro")
        self.assertEqual(source_fingerprint_for_root(checkout, project_file_rel="b.kicad_pro"), key)
        (checkout / "b.kicad_pcb").write_bytes(b"(kicad_pcb edited)")
        self.assertNotEqual(source_fingerprint_for_root(checkout, project_file_rel="b.kicad_pro"), key)


if __name__ == "__main__":
    unittest.main()
