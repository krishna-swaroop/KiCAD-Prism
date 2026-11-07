"""The models stage's GLB cache key: what changes the exported parts changes the key."""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services.design_bundle import stage_models

GENERATOR = SimpleNamespace(kicad_version="10.0.6", models_procedure="kicad-cli-glb-a0")


def _record(*, board: str = "b" * 40, model: str = "c" * 40, gitlink: str = "d" * 40) -> dict:
    return {
        "config": {"board": "board/demo.kicad_pcb"},
        "entries": [
            {"path": "board/demo.kicad_pcb", "kind": "blob", "object_id": board, "category": "board"},
            {"path": "lib/models/part.step", "kind": "blob", "object_id": model, "category": "model-3d"},
            {"path": "kicad-libraries", "kind": "gitlink", "object_id": gitlink, "category": "gitlink"},
        ],
    }


class CacheKeyTest(unittest.TestCase):
    def key(self, **changes: str) -> str:
        return stage_models.cache_key(_record(**changes), GENERATOR, "10.0.7")

    def test_the_board_and_repository_models_are_in_the_key(self) -> None:
        self.assertNotEqual(self.key(), self.key(board="e" * 40))
        self.assertNotEqual(self.key(), self.key(model="e" * 40))

    def test_a_submodule_commit_is_in_the_key(self) -> None:
        # Models inside a submodule are expanded only at materialization; the gitlink is their identity.
        self.assertNotEqual(self.key(), self.key(gitlink="e" * 40))

    def test_the_key_is_stable(self) -> None:
        self.assertEqual(self.key(), self.key())


class PruneCacheTest(unittest.TestCase):
    def test_retention_drops_unused_glbs_and_dead_part_files_and_reports_the_rest(self) -> None:
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(stage_models, "cache_root", return_value=root))
        now = time.time()
        old, fresh, part, live_part = root / "old.glb", root / "fresh.glb", root / ".x.glb.1.part", root / ".y.glb.2.part"
        for path, age in ((old, 40 * 86400), (fresh, 60), (part, 7200), (live_part, 60)):
            path.write_bytes(b"x" * 10)
            os.utime(path, (now - age, now - age))
        report = stage_models.prune_cache(unused_before=now - 30 * 86400, now=now)
        self.assertEqual(report, {"removed": 1, "bytes": 20})
        self.assertEqual(sorted(p.name for p in root.iterdir()), [live_part.name, fresh.name])

    def test_no_cache_directory_is_nothing_to_do(self) -> None:
        missing = Path(self.enterContext(tempfile.TemporaryDirectory())) / "none"
        with mock.patch.object(stage_models, "cache_root", return_value=missing):
            self.assertEqual(stage_models.prune_cache(unused_before=0, now=0), {"removed": 0, "bytes": 0})


if __name__ == "__main__":
    unittest.main()


class HlrArgsTest(unittest.TestCase):
    """Stage `models`'s assembly HLR inputs (cli-spec.md §5.2.4, amendment C3 §3.1)."""

    def test_no_geometer_runtime_passes_nothing(self) -> None:
        with mock.patch.object(stage_models.settings, "GEOMETER_EXECUTABLE", ""):
            self.assertEqual(stage_models.hlr_args({"KICAD10_3DMODEL_DIR": "/models"}), [])

    def test_the_runtime_the_cache_and_every_stock_model_library(self) -> None:
        with tempfile.TemporaryDirectory() as root, \
                mock.patch.object(stage_models.settings, "GEOMETER_EXECUTABLE", "/opt/geometer/geometer"), \
                mock.patch.object(stage_models.settings, "KICAD_PROJECTS_ROOT", root):
            stock10, stock9 = str(Path(root) / "3dmodels"), str(Path(root) / "old")
            os.mkdir(stock10)
            os.mkdir(stock9)
            args = stage_models.hlr_args({
                "KICAD10_3DMODEL_DIR": stock10,
                "KICAD9_3DMODEL_DIR": stock9,
                "KICAD10_3DMODEL_DIR_EXTRA": stock10,
                "KICAD8_3DMODEL_DIR": "",
                "KICAD7_3DMODEL_DIR": "/not/a/folder",
                "HOME": root,
            })
        self.assertEqual(args, [
            "--geometer", "/opt/geometer/geometer",
            "--hlr-cache", str(Path(root) / ".kicad-prism" / "hlr-cache"),
            "--model-dir", f"KICAD10_3DMODEL_DIR={stock10}",
            "--model-dir", f"KICAD9_3DMODEL_DIR={stock9}",
        ])
