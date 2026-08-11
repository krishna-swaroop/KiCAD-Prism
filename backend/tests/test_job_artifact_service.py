from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services.job_artifact_service import JobArtifactService


class JobArtifactServiceTests(unittest.TestCase):
    def test_prepare_file_fsyncs_and_publishes_content_addressed_object(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            staging = root / "staging" / "job" / "7"
            staging.mkdir(parents=True)
            source = staging / "result.json"
            source.write_bytes(b'{"ready":true}')
            context = SimpleNamespace(
                staging_dir=staging,
                check_cancelled=mock.Mock(),
            )
            service = JobArtifactService(root)

            artifact = service.prepare_file(
                context,
                source,
                kind="test",
                artifact_key="key",
                media_type="application/json",
            )

            self.assertFalse(source.exists())
            self.assertTrue(Path(artifact.object_path).is_file())
            self.assertEqual(Path(artifact.object_path).read_bytes(), b'{"ready":true}')
            self.assertEqual(
                Path(artifact.object_path).name,
                artifact.digest,
            )
            context.check_cancelled.assert_called_once()

    def test_failed_promotion_never_returns_an_authoritative_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            staging = root / "staging" / "job" / "7"
            staging.mkdir(parents=True)
            source = staging / "result.bin"
            source.write_bytes(b"payload")
            context = SimpleNamespace(
                staging_dir=staging,
                check_cancelled=mock.Mock(),
            )
            service = JobArtifactService(root)

            with mock.patch(
                "app.services.job_artifact_service.os.replace",
                side_effect=OSError("disk full"),
            ):
                with self.assertRaisesRegex(OSError, "disk full"):
                    service.prepare_file(
                        context,
                        source,
                        kind="test",
                        artifact_key="key",
                    )

            self.assertTrue(source.exists())
            self.assertEqual(
                [path for path in service.objects.rglob("*") if path.is_file()],
                [],
            )

    def test_existing_digest_is_reused_without_mutating_the_object(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            staging = root / "staging" / "job" / "7"
            staging.mkdir(parents=True)
            context = SimpleNamespace(
                staging_dir=staging,
                check_cancelled=mock.Mock(),
            )
            service = JobArtifactService(root)
            first = staging / "first.bin"
            first.write_bytes(b"same")
            first_artifact = service.prepare_file(
                context,
                first,
                kind="test",
                artifact_key="key",
            )
            second = staging / "second.bin"
            second.write_bytes(b"same")

            second_artifact = service.prepare_file(
                context,
                second,
                kind="test",
                artifact_key="key",
            )

            self.assertEqual(first_artifact.digest, second_artifact.digest)
            self.assertEqual(first_artifact.object_path, second_artifact.object_path)
            self.assertFalse(second.exists())
            self.assertEqual(Path(first_artifact.object_path).read_bytes(), b"same")

    def test_reconcile_invalidates_missing_and_out_of_root_objects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            service = JobArtifactService(root)
            valid = service.objects / "aa" / "bb" / ("a" * 64)
            valid.parent.mkdir(parents=True)
            valid.write_bytes(b"valid")
            metadata = [
                {"id": "valid", "object_path": str(valid)},
                {"id": "missing", "object_path": str(service.objects / "missing")},
                {"id": "outside", "object_path": str(root / "outside")},
            ]
            fake_jobs = SimpleNamespace(
                list_ready_artifacts=mock.Mock(return_value=metadata),
                invalidate_artifact=mock.Mock(return_value=True),
            )

            result = service.reconcile_registered_artifacts(service=fake_jobs)

            self.assertEqual(result, {"checked": 3, "invalidated": 2})
            self.assertEqual(
                fake_jobs.invalidate_artifact.call_args_list,
                [
                    mock.call("missing", reason="object_missing"),
                    mock.call("outside", reason="object_path_outside_artifact_root"),
                ],
            )

    def test_garbage_collection_preserves_referenced_and_recent_objects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            service = JobArtifactService(root)
            referenced = service.objects / "aa" / "aa" / ("a" * 64)
            orphan = service.objects / "bb" / "bb" / ("b" * 64)
            recent = service.objects / "cc" / "cc" / ("c" * 64)
            for path in (referenced, orphan, recent):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(path.name.encode())
            old = time.time() - 7200
            for path in (referenced, orphan):
                path.touch()
                import os

                os.utime(path, (old, old))
            fake_jobs = SimpleNamespace(
                referenced_object_paths=mock.Mock(return_value={str(referenced)})
            )

            result = service.collect_unreferenced_objects(
                service=fake_jobs,
                grace_seconds=3600,
            )

            self.assertTrue(referenced.exists())
            self.assertFalse(orphan.exists())
            self.assertTrue(recent.exists())
            self.assertEqual(result["objects_removed"], 1)

    def test_staging_cleanup_preserves_active_fence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            service = JobArtifactService(root)
            active = root / "staging" / "active-job" / "2"
            stale = root / "staging" / "stale-job" / "1"
            active.mkdir(parents=True)
            stale.mkdir(parents=True)
            old = time.time() - 7200
            import os

            os.utime(active, (old, old))
            os.utime(stale, (old, old))
            fake_jobs = SimpleNamespace(
                active_execution_keys=mock.Mock(return_value={("active-job", 2)})
            )

            result = service.cleanup_stale_staging(
                service=fake_jobs,
                grace_seconds=3600,
            )

            self.assertTrue(active.exists())
            self.assertFalse(stale.exists())
            self.assertEqual(result["staging_directories_removed"], 1)


if __name__ == "__main__":
    unittest.main()
