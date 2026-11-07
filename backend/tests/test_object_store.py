from __future__ import annotations

import hashlib
import io
import os
import tempfile
import time
import unittest
from pathlib import Path

from app.services.object_store import ObjectStore, ReferenceOwner


def _age(path: Path, seconds: float) -> None:
    old = time.time() - seconds
    os.utime(path, (old, old))


class ObjectStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.staging = self.base / "staging"
        self.staging.mkdir()
        self.store = ObjectStore(self.base / "objects" / "sha256", owners=[])

    def _object(self, payload: bytes) -> Path:
        return self.store.put_stream(io.BytesIO(payload), staging_dir=self.staging).path

    def test_file_and_stream_puts_share_one_layout(self) -> None:
        source = self.staging / "a.bin"
        source.write_bytes(b"same bytes")

        from_file = self.store.put_file(source)
        from_stream = self.store.put_stream(io.BytesIO(b"same bytes"), staging_dir=self.staging)

        digest = hashlib.sha256(b"same bytes").hexdigest()
        self.assertEqual(from_file.digest, digest)
        self.assertEqual(from_file, from_stream)
        self.assertEqual(from_file.path, self.store.root / digest[:2] / digest[2:4] / digest)
        self.assertEqual(from_file.size_bytes, len(b"same bytes"))
        self.assertFalse(source.exists())
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_reused_object_restarts_its_grace_period(self) -> None:
        path = self._object(b"shared")
        _age(path, 7200)

        self._object(b"shared")
        result = self.store.collect_unreferenced(grace_seconds=3600)

        self.assertTrue(path.is_file())
        self.assertEqual(result["objects_removed"], 0)

    def test_a_corrupt_object_is_replaced_by_the_next_put(self) -> None:
        path = self._object(b"good bytes")
        path.write_bytes(b"corrupt")

        stored = self.store.put_stream(io.BytesIO(b"good bytes"), staging_dir=self.staging)

        self.assertEqual(stored.path, path)
        self.assertEqual(path.read_bytes(), b"good bytes")
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_rejected_stream_publishes_nothing(self) -> None:
        with self.assertRaisesRegex(ValueError, "per-file size limit"):
            self.store.put_stream(io.BytesIO(b"x" * 10), staging_dir=self.staging, max_bytes=4)
        with self.assertRaisesRegex(ValueError, "does not match digest"):
            self.store.put_stream(io.BytesIO(b"x"), staging_dir=self.staging, expected_digest="0" * 64)

        self.assertEqual(list(self.staging.iterdir()), [])
        self.assertFalse(self.store.root.exists() and any(self.store.root.rglob("*")))

    def test_collection_honours_every_owner(self) -> None:
        job_object = self._object(b"job")
        catalog_object = self._object(b"catalog")
        orphan = self._object(b"orphan")
        recent_orphan = self._object(b"recent")
        for path in (job_object, catalog_object, orphan):
            _age(path, 7200)
        owners = [
            ReferenceOwner("jobs", lambda: {str(job_object), str(self.base / "elsewhere")}),
            ReferenceOwner("catalog", lambda: {str(catalog_object)}),
        ]

        result = self.store.collect_unreferenced(grace_seconds=3600, owners=owners)

        self.assertTrue(job_object.is_file())
        self.assertTrue(catalog_object.is_file())
        self.assertTrue(recent_orphan.is_file())
        self.assertFalse(orphan.exists())
        self.assertEqual(result, {"objects_removed": 1, "bytes_reclaimed": len(b"orphan")})

    def test_unreadable_owner_stops_collection(self) -> None:
        orphan = self._object(b"orphan")
        _age(orphan, 7200)

        def outage() -> set[str]:
            raise RuntimeError("database unavailable")

        with self.assertRaisesRegex(RuntimeError, "database unavailable"):
            self.store.collect_unreferenced(
                grace_seconds=0,
                owners=[ReferenceOwner("jobs", lambda: set()), ReferenceOwner("catalog", outage)],
            )
        self.assertTrue(orphan.is_file())

    def test_referenced_paths_can_exclude_the_asking_owner(self) -> None:
        mine = self._object(b"mine")
        theirs = self._object(b"theirs")
        owners = [
            ReferenceOwner("jobs", lambda: {str(theirs)}),
            ReferenceOwner("catalog", lambda: {str(mine)}),
        ]

        self.assertEqual(
            self.store.referenced_paths(owners=owners, exclude="catalog"),
            {theirs.resolve()},
        )

    def test_contains_only_resolves_paths_inside_the_store(self) -> None:
        inside = self._object(b"inside")

        self.assertEqual(self.store.contains(str(inside)), inside.resolve())
        self.assertIsNone(self.store.contains(str(self.base / "outside")))
        self.assertIsNone(self.store.contains(str(self.store.root / ".." / ".." / "escape")))
        self.assertIsNone(self.store.contains(""))


if __name__ == "__main__":
    unittest.main()
