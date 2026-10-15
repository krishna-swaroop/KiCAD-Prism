import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import semantic_index_service
from app.sim_studio import service as sim_service

INDEX = {
    "components": [{"reference": "R1", "pcbRefs": ["R1"], "value": "10k"}],
    "nets": [{"name": "VCC"}],
    "terminals": [{"reference": "R1", "pin": "1", "pcbPadUuid": "p1", "netName": "VCC"}],
}


class ArtifactFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.path = self.root / "semantic-index.json"
        self.project = SimpleNamespace(id="prj")
        for patcher in (
            mock.patch.object(semantic_index_service, "_revision_identity", return_value=("key", None)),
            mock.patch.object(semantic_index_service, "artifact_path", return_value=self.path),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_builds_only_when_missing_and_never_parses(self) -> None:
        def build(project, commit, key, path):
            semantic_index_service._write_artifact(path, INDEX)

        with mock.patch.object(semantic_index_service, "_build_and_store", side_effect=build) as builder:
            self.assertEqual(semantic_index_service.artifact_file(self.project), (self.path, "key"))
            self.assertEqual(semantic_index_service.artifact_file(self.project), (self.path, "key"))
        builder.assert_called_once()
        # Stored compact: the identity endpoint sends the file as is.
        self.assertNotIn("\n", self.path.read_text())
        self.assertEqual(json.loads(self.path.read_text()), INDEX)


class FactsCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.path = self.root / "semantic-index.json"
        self.path.write_text(json.dumps(INDEX))
        sim_service._FACTS_CACHE.clear()
        patcher = mock.patch(
            "app.services.semantic_index_service.artifact_file", return_value=(self.path, "key")
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_concurrent_requests_share_one_parse_and_a_rebuilt_file_is_read_again(self) -> None:
        with mock.patch.object(sim_service, "from_semantic_index", wraps=sim_service.from_semantic_index) as derive:
            threads = [threading.Thread(target=sim_service.semantic_index_facts, args=(None, None)) for _ in range(4)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            facts = sim_service.semantic_index_facts(None, None)
            self.assertEqual(derive.call_count, 1)
            self.assertEqual(facts.pad_nets, {"R1.1": "VCC"})

            os.utime(self.path, ns=(1, 1))
            sim_service.semantic_index_facts(None, None)
            self.assertEqual(derive.call_count, 2)


if __name__ == "__main__":
    unittest.main()
