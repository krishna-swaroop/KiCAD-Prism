from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import catalog_worker_tasks  # noqa: E402


class CatalogValidationResumeTests(unittest.TestCase):
    def test_resume_uses_checkpoint_worklist_not_live_listing(self) -> None:
        validated_ids: list[str] = []

        def list_page(**kwargs: object) -> dict[str, object]:
            return {
                "items": [{"id": "NEW"}, {"id": "A"}, {"id": "B"}],
                "page": 1,
                "pages": 1,
                "total": 3,
            }

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            return {"component": {"id": component_id}}

        with (
            patch.object(catalog_worker_tasks.catalog_service, "list_components", side_effect=list_page) as listed,
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                side_effect=validate,
            ),
        ):
            result = catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": None},
                    "checkpoint": {"index": 1, "component_ids": ["A", "B"]},
                    "result": {},
                },
                lambda **fields: True,
            )

        listed.assert_not_called()

        self.assertEqual(validated_ids, ["B"])
        self.assertEqual(result["validated"], 2)
        self.assertEqual(result["total"], 2)

    def test_resume_records_a_removed_id_without_shifting_later_work(self) -> None:
        validated_ids: list[str] = []

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            if component_id == "gone":
                raise ValueError("Component not found")
            return {"component": {"id": component_id}}

        with patch.object(
            catalog_worker_tasks.catalog_service,
            "validate_component_klc",
            side_effect=validate,
        ):
            result = catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": None},
                    "checkpoint": {"index": 1, "component_ids": ["A", "gone", "C"]},
                    "result": {},
                },
                lambda **fields: True,
            )

        self.assertEqual(validated_ids, ["gone", "C"])
        self.assertEqual(result["validated"], 3)
        self.assertEqual(
            result["errors"],
            [{"component_id": "gone", "error": "Component not found"}],
        )

    def test_reordered_live_catalog_does_not_change_checkpoint_order(self) -> None:
        validated_ids: list[str] = []

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            return {"component": {"id": component_id}}

        with (
            patch.object(
                catalog_worker_tasks.catalog_service,
                "list_components",
                return_value={"items": [{"id": "B"}, {"id": "A"}], "page": 1, "pages": 1},
            ) as listed,
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                side_effect=validate,
            ),
        ):
            catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": None},
                    "checkpoint": {"index": 0, "component_ids": ["A", "B"]},
                    "result": {},
                },
                lambda **fields: True,
            )

        listed.assert_not_called()
        self.assertEqual(validated_ids, ["A", "B"])

    def test_explicit_payload_ids_are_frozen_and_not_relisted(self) -> None:
        validated_ids: list[str] = []
        list_calls: list[object] = []
        checkpoints: list[object] = []

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            return {"component": {"id": component_id}}

        with (
            patch.object(
                catalog_worker_tasks.catalog_service,
                "list_components",
                side_effect=lambda **kwargs: list_calls.append(kwargs) or {"items": [], "pages": 1},
            ),
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                side_effect=validate,
            ),
        ):
            catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": ["X", "Y"]},
                    "checkpoint": {},
                    "result": {},
                },
                lambda **fields: checkpoints.append(fields.get("checkpoint")) or True,
            )

        self.assertEqual(list_calls, [])
        self.assertEqual(validated_ids, ["X", "Y"])
        self.assertEqual(checkpoints[0]["component_ids"], ["X", "Y"])
        self.assertEqual(checkpoints[0]["index"], 0)

    def test_first_catalog_wide_run_persists_the_listed_worklist(self) -> None:
        checkpoints: list[object] = []

        with (
            patch.object(
                catalog_worker_tasks.catalog_service,
                "list_components",
                return_value={
                    "items": [{"id": "cmp-1"}, {"id": "cmp-2"}],
                    "page": 1,
                    "pages": 1,
                    "total": 2,
                },
            ),
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                return_value={"component": {"id": "cmp-1"}},
            ),
        ):
            catalog_worker_tasks.run_validation(
                {"payload": {"component_ids": None}, "checkpoint": {}, "result": {}},
                lambda **fields: checkpoints.append(fields.get("checkpoint")) or True,
            )

        self.assertEqual(checkpoints[0]["component_ids"], ["cmp-1", "cmp-2"])
        self.assertEqual(checkpoints[0]["index"], 0)

    def test_index_zero_repeat_is_at_least_once_not_exact_once(self) -> None:
        validated_ids: list[str] = []

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            return {"component": {"id": component_id}}

        with patch.object(
            catalog_worker_tasks.catalog_service,
            "validate_component_klc",
            side_effect=validate,
        ):
            catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": ["A", "B"]},
                    "checkpoint": {"index": 0, "component_ids": ["A", "B"]},
                    "result": {},
                },
                lambda **fields: True,
            )

        self.assertEqual(validated_ids, ["A", "B"])

    def test_completed_checkpoint_does_not_rerun_or_relist(self) -> None:
        validated_ids: list[str] = []

        with (
            patch.object(
                catalog_worker_tasks.catalog_service,
                "list_components",
                side_effect=AssertionError("completed jobs must not relist"),
            ),
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                side_effect=lambda component_id: validated_ids.append(component_id) or {},
            ),
        ):
            result = catalog_worker_tasks.run_validation(
                {
                    "payload": {"component_ids": None},
                    "checkpoint": {"index": 2, "component_ids": ["A", "B"]},
                    "result": {"errors": []},
                },
                lambda **fields: True,
            )

        self.assertEqual(validated_ids, [])
        self.assertEqual(result["validated"], 2)
        self.assertEqual(result["total"], 2)


if __name__ == "__main__":
    unittest.main()
