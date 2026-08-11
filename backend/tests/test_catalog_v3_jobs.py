from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.services import catalog_worker_tasks
from app.services.catalog_job_service import CatalogJobService
from app.services.job_runtime import PreparedArtifact, RetryableJobError


class CatalogV3JobTests(unittest.TestCase):
    def test_catalog_enqueue_uses_unified_queue_and_heavy_slot(self) -> None:
        service = CatalogJobService()
        queued = {
            "job_id": "job-1",
            "kind": "catalog_validation",
            "worker_pool": "catalog",
            "status": "queued",
            "payload": {
                "catalog_payload": {"component_ids": ["component-1"]},
                "catalog_checkpoint": {},
                "catalog_result": {},
                "created_by": "qa@example.com",
                "catalog_artifact_key": "validation:component-1",
            },
            "result_metadata": {},
            "percent": 0,
            "attempt": 0,
        }
        with mock.patch(
            "app.services.catalog_job_service.jobs.enqueue",
            return_value=queued,
        ) as enqueue:
            result = service.enqueue(
                "catalog_validation",
                {"component_ids": ["component-1"]},
                created_by="qa@example.com",
                idempotency_key="validation:component-1",
            )

        call = enqueue.call_args
        self.assertEqual(call.kwargs["worker_pool"], "catalog")
        self.assertEqual(call.kwargs["resources"]["catalog_worker"], 1)
        self.assertEqual(call.kwargs["resources"]["catalog_kicad"], 1)
        self.assertEqual(result["id"], "job-1")
        self.assertEqual(result["payload"]["component_ids"], ["component-1"])

    def test_catalog_handler_persists_checkpoint_and_publishes_result(self) -> None:
        progress_updates: list[dict[str, object]] = []
        with tempfile.TemporaryDirectory() as temporary:
            context = SimpleNamespace(
                job_id="job-1",
                job={"kind": "test_catalog_handler"},
                payload={
                    "catalog_payload": {"value": 7},
                    "catalog_checkpoint": {},
                    "catalog_result": {},
                    "created_by": "qa@example.com",
                    "catalog_artifact_key": "catalog-key",
                },
                staging_dir=Path(temporary),
                check_cancelled=mock.Mock(),
                progress=lambda **values: progress_updates.append(values),
            )
            prepared = PreparedArtifact(
                kind="test_catalog_handler",
                artifact_key="catalog-key",
                digest="digest",
                object_path="/objects/digest",
                size_bytes=12,
            )

            def handler(job: dict, progress: object) -> dict:
                self.assertEqual(job["payload"]["value"], 7)
                assert callable(progress)
                progress(
                    progress=50,
                    message="Halfway",
                    checkpoint={"index": 1},
                    result={"processed": 1},
                )
                return {"processed": 2}

            with (
                mock.patch.dict(
                    catalog_worker_tasks.HANDLERS,
                    {"test_catalog_handler": handler},
                ),
                mock.patch.object(
                    catalog_worker_tasks.catalog_service,
                    "initialize",
                ),
                mock.patch.object(
                    catalog_worker_tasks.artifact_store,
                    "initialize",
                ),
                mock.patch.object(
                    catalog_worker_tasks.job_artifacts,
                    "prepare_json",
                    return_value=prepared,
                ) as prepare,
            ):
                result = catalog_worker_tasks.run_catalog_job_v3(context)

        self.assertEqual(result.artifact, prepared)
        self.assertEqual(result.details["processed"], 2)
        update = progress_updates[-1]["payload_updates"]
        self.assertEqual(update["catalog_checkpoint"], {"index": 1})
        self.assertEqual(update["catalog_result"], {"processed": 1})
        prepare.assert_called_once()

    def test_catalog_handler_errors_remain_retryable(self) -> None:
        context = SimpleNamespace(
            job_id="job-1",
            job={"kind": "test_catalog_failure"},
            payload={
                "catalog_payload": {},
                "catalog_checkpoint": {},
                "catalog_result": {},
                "created_by": "",
                "catalog_artifact_key": "",
            },
            check_cancelled=mock.Mock(),
            progress=mock.Mock(),
        )

        def fail(_job: dict, _progress: object) -> dict:
            raise RuntimeError("transient compiler failure")

        with (
            mock.patch.dict(
                catalog_worker_tasks.HANDLERS,
                {"test_catalog_failure": fail},
            ),
            mock.patch.object(catalog_worker_tasks.catalog_service, "initialize"),
            mock.patch.object(catalog_worker_tasks.artifact_store, "initialize"),
        ):
            with self.assertRaisesRegex(
                RetryableJobError,
                "transient compiler failure",
            ):
                catalog_worker_tasks.run_catalog_job_v3(context)


if __name__ == "__main__":
    unittest.main()
