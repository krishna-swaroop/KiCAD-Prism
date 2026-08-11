from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import catalog_admin  # noqa: E402
from app.api.catalog_admin import _can_transition_workflow, _require_field_admin  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services import catalog_worker_tasks  # noqa: E402


class CatalogAdminPermissionTests(unittest.TestCase):
    def test_only_admins_can_manage_metadata_field_definitions(self) -> None:
        admin = AuthenticatedUser(email="admin@example.com", name="Admin", role="admin")
        designer = AuthenticatedUser(
            email="designer@example.com", name="Designer", role="component_designer"
        )

        _require_field_admin(admin)
        with self.assertRaises(HTTPException) as raised:
            _require_field_admin(designer)
        self.assertEqual(raised.exception.status_code, 403)

    def test_metadata_worker_applies_only_requested_items(self) -> None:
        updates: list[dict[str, object]] = []
        expected = {"batch_id": "batch-1", "status": "partial", "applied": 1, "failed": 0}
        with patch.object(catalog_worker_tasks.catalog_service, "apply_metadata_batch", return_value=expected) as apply:
            result = catalog_worker_tasks.run_metadata_batch(
                {
                    "payload": {
                        "batch_id": "batch-1",
                        "actor": "designer@example.com",
                        "item_ids": ["item-2"],
                    }
                },
                lambda **fields: updates.append(fields) or True,
            )

        self.assertEqual(result, expected)
        apply.assert_called_once()
        self.assertEqual(apply.call_args.kwargs["item_ids"], ["item-2"])
        self.assertEqual(updates[-1]["progress"], 100)

    def test_workflow_transition_permissions_match_component_roles(self) -> None:
        admin = AuthenticatedUser(email="admin@example.com", name="Admin", role="admin")
        designer = AuthenticatedUser(email="designer@example.com", name="Designer", role="component_designer")
        qa = AuthenticatedUser(email="qa@example.com", name="QA", role="component_qa")
        read_only = AuthenticatedUser(email="viewer@example.com", name="Viewer", role="designer")

        self.assertTrue(_can_transition_workflow(admin, "qa_review", "done"))
        self.assertFalse(_can_transition_workflow(designer, "qa_review", "done"))
        self.assertTrue(_can_transition_workflow(designer, "in_progress", "qa_review"))
        self.assertTrue(_can_transition_workflow(qa, "qa_review", "done"))
        self.assertTrue(_can_transition_workflow(qa, "qa_review", "in_progress"))
        self.assertTrue(_can_transition_workflow(qa, "qa_review", "archived"))
        self.assertFalse(_can_transition_workflow(qa, "done", "released"))
        self.assertFalse(_can_transition_workflow(read_only, "open", "in_progress"))

    def test_single_component_validation_job_returns_updated_component(self) -> None:
        updates: list[dict[str, object]] = []

        def record_update(**fields: object) -> bool:
            updates.append(fields)
            return True

        with (
            patch.object(
                catalog_worker_tasks.catalog_service,
                "validate_component_klc",
                return_value={"component": {"id": "cmp-1", "validation": {"status": "passed"}}},
            ),
        ):
            result = catalog_worker_tasks.run_validation(
                {"payload": {"component_ids": ["cmp-1"]}, "checkpoint": {}, "result": {}},
                record_update,
            )

        self.assertEqual(updates[-1]["progress"], 100)
        self.assertEqual(result["component"], {"id": "cmp-1", "validation": {"status": "passed"}})

    def test_catalog_validation_job_paginates_every_component(self) -> None:
        updates: list[dict[str, object]] = []
        requested_pages: list[int] = []
        validated_ids: list[str] = []

        def list_page(**kwargs: object) -> dict[str, object]:
            page = int(kwargs["page"])
            requested_pages.append(page)
            items = [{"id": "cmp-1"}, {"id": "cmp-2"}] if page == 1 else [{"id": "cmp-3"}]
            return {"items": items, "page": page, "page_size": 10000, "pages": 2, "total": 3}

        def validate(component_id: str) -> dict[str, object]:
            validated_ids.append(component_id)
            return {"component": {"id": component_id}}

        with (
            patch.object(catalog_worker_tasks.catalog_service, "list_components", side_effect=list_page),
            patch.object(catalog_worker_tasks.catalog_service, "validate_component_klc", side_effect=validate),
        ):
            result = catalog_worker_tasks.run_validation(
                {"payload": {"component_ids": None}, "checkpoint": {}, "result": {}},
                lambda **fields: updates.append(fields) or True,
            )

        self.assertEqual(requested_pages, [1, 2])
        self.assertEqual(validated_ids, ["cmp-1", "cmp-2", "cmp-3"])
        self.assertEqual(updates[-1]["progress"], 100)
        self.assertEqual(result["validated"], 3)
        self.assertEqual(result["total"], 3)

if __name__ == "__main__":
    unittest.main()
