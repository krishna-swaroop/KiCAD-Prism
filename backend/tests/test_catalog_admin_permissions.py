from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import catalog_admin  # noqa: E402
from app.api.catalog_admin import _can_transition_workflow  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services.component_catalog_service import ComponentCatalogService  # noqa: E402


class CatalogAdminPermissionTests(unittest.TestCase):
    def test_workflow_transition_permissions_match_component_roles(self) -> None:
        admin = AuthenticatedUser(email="admin@example.com", name="Admin", role="admin")
        designer = AuthenticatedUser(
            email="designer@example.com", name="Designer", role="component_designer"
        )
        qa = AuthenticatedUser(email="qa@example.com", name="QA", role="component_qa")
        read_only = AuthenticatedUser(
            email="viewer@example.com", name="Viewer", role="designer"
        )

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

        def record_update(_job_id: str, **fields: object) -> None:
            updates.append(fields)

        with (
            patch.object(
                catalog_admin.workspace, "update_job", side_effect=record_update
            ),
            patch.object(
                catalog_admin.catalog_service,
                "validate_component_klc",
                return_value={
                    "component": {"id": "cmp-1", "validation": {"status": "passed"}}
                },
            ),
        ):
            catalog_admin._run_validation_job("job-1", ["cmp-1"])

        self.assertEqual(updates[-1]["status"], "completed")
        self.assertEqual(
            updates[-1]["component"],
            {"id": "cmp-1", "validation": {"status": "passed"}},
        )

    def test_generate_missing_previews_skips_ready_and_retries_failed_assets(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            service.initialize()
            component = service.create_manual_component(
                value="10k",
                description="10k resistor",
                datasheet="https://example.com/r.pdf",
                manufacturer="Acme",
                manufacturer_part_number="ACME-R-10K",
                category="Resistors SMD",
                package_name="0603",
            )
            symbol_path = (
                service.store_root / "symbols" / "SharedSymbols" / "R_10K.kicad_sym"
            )
            symbol_path.parent.mkdir(parents=True, exist_ok=True)
            symbol_path.write_text(
                '(kicad_symbol_lib (version 20211014) (symbol "R_10K"))',
                encoding="utf-8",
            )
            footprint_path = (
                service.store_root
                / "footprints"
                / "SharedFootprints.pretty"
                / "R_10K.kicad_mod"
            )
            footprint_path.parent.mkdir(parents=True, exist_ok=True)
            footprint_path.write_text('(footprint "R_10K")', encoding="utf-8")
            ready_preview = root / "ready.svg"
            ready_preview.write_text("<svg />", encoding="utf-8")

            with service._connect() as conn:  # type: ignore[attr-defined]
                symbol_asset = service._register_asset(  # type: ignore[attr-defined]
                    conn,
                    asset_type="symbol",
                    canonical_path=symbol_path,
                    target_library="SharedSymbols",
                    target_name="R_10K",
                )
                footprint_asset = service._register_asset(  # type: ignore[attr-defined]
                    conn,
                    asset_type="footprint",
                    canonical_path=footprint_path,
                    target_library="SharedFootprints",
                    target_name="R_10K",
                )
                service._link_asset_to_revision(
                    conn, component["revision_id"], symbol_asset, required=True
                )  # type: ignore[attr-defined]
                service._link_asset_to_revision(
                    conn, component["revision_id"], footprint_asset, required=True
                )  # type: ignore[attr-defined]
                service._upsert_asset_preview(  # type: ignore[attr-defined]
                    conn,
                    asset_id=symbol_asset["id"],
                    kind="symbol",
                    status="ready",
                    file_path=str(ready_preview),
                )
                service._upsert_asset_preview(  # type: ignore[attr-defined]
                    conn,
                    asset_id=footprint_asset["id"],
                    kind="footprint",
                    status="failed",
                    generation_error="previous failure",
                )
                conn.commit()

            generated_assets: list[str] = []

            def fake_ensure_preview(_conn: object, asset: dict[str, object]) -> None:
                generated_assets.append(str(asset["id"]))
                service._upsert_asset_preview(  # type: ignore[attr-defined]
                    _conn,  # type: ignore[arg-type]
                    asset_id=str(asset["id"]),
                    kind=str(asset["asset_type"]),
                    status="ready",
                    file_path=str(root / f"{asset['id']}.svg"),
                )

            with patch.object(
                service, "_ensure_asset_preview", side_effect=fake_ensure_preview
            ):
                result = service.generate_missing_component_previews()

            self.assertEqual(result["skipped_ready"], 1)
            self.assertEqual(result["generated"], 1)
            self.assertEqual(result["failed"], 0)
            self.assertEqual(generated_assets, [str(footprint_asset["id"])])


if __name__ == "__main__":
    unittest.main()
