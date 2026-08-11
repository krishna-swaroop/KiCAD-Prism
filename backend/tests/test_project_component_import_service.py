from __future__ import annotations

import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.project_component_import_service import (  # noqa: E402
    _matches_selection,
    _merge_proposal,
    _proposal,
    run_project_import_session,
)
from app.services import project_service  # noqa: E402


class ProjectComponentImportServiceTests(unittest.TestCase):
    def test_project_lookup_uses_authoritative_workspace_registry(self) -> None:
        row = {
            "id": "prj_workspace",
            "name": "Power Board",
            "display_name": "Power Board",
            "description": "Workspace project",
            "path": "/projects/power-board",
            "last_modified": "2026-07-13",
            "relative_path": ".",
            "parent_repo": "power-board",
            "repo_url": "https://example.test/power-board.git",
            "import_type": "type1",
        }
        with (
            mock.patch.object(project_service.workspace, "get_project_by_id", return_value=row),
            mock.patch.object(
                project_service,
                "get_registered_project_records",
                side_effect=AssertionError("legacy registry should not be read"),
            ),
        ):
            project = project_service.get_project_by_id("prj_workspace")

        self.assertIsNotNone(project)
        self.assertEqual(project.id, "prj_workspace")  # type: ignore[union-attr]
        self.assertEqual(project.path, "/projects/power-board")  # type: ignore[union-attr]

    def _component(self, reference: str, *, component_uid: str) -> dict:
        return {
            "componentUid": component_uid,
            "reference": reference,
            "value": "10k",
            "footprint": "Resistor_SMD:R_0603_1608Metric",
            "fields": {
                "Manufacturer": "Acme",
                "Manufacturer Part Number": "ACME-R-10K",
                "Description": "10k resistor",
            },
            "schematicRefs": [{"symbolUuid": f"symbol-{reference}"}],
            "pcbRefs": [{"footprintUuid": f"footprint-{reference}"}],
        }

    def test_project_references_with_same_part_identity_dedupe(self) -> None:
        first = _proposal(self._component("R1", component_uid="cmp-1"), project_id="p1", source_revision="abc")
        second = _proposal(self._component("R8", component_uid="cmp-8"), project_id="p2", source_revision="def")
        self.assertEqual(first["dedupe_key"], second["dedupe_key"])

        _merge_proposal(first, second)
        self.assertEqual(first["metadata"]["references"], ["R1", "R8"])
        self.assertEqual(len(first["provenance"]), 2)

    def test_incomplete_part_identities_do_not_dedupe_across_projects(self) -> None:
        missing_manufacturer = self._component("R1", component_uid="cmp-1")
        missing_manufacturer["fields"]["Manufacturer"] = ""
        same_project = self._component("R8", component_uid="cmp-8")
        same_project["fields"]["Manufacturer"] = ""
        other_project = self._component("R9", component_uid="cmp-9")
        other_project["fields"]["Manufacturer"] = ""

        first = _proposal(missing_manufacturer, project_id="p1", source_revision="abc")
        same = _proposal(same_project, project_id="p1", source_revision="abc")
        other = _proposal(other_project, project_id="p2", source_revision="def")

        self.assertEqual(first["dedupe_key"], same["dedupe_key"])
        self.assertNotEqual(first["dedupe_key"], other["dedupe_key"])

    def test_merge_preserves_conflicting_metadata_alternatives_with_provenance(self) -> None:
        first_component = self._component("R1", component_uid="cmp-1")
        first_component["value"] = "10k"
        first_component["footprint"] = "Acme:R_0603"
        first_component["fields"].update(
            {"Description": "Precision resistor", "Datasheet": "https://example.test/a", "Tolerance": "1%"}
        )
        second_component = self._component("R8", component_uid="cmp-8")
        second_component["value"] = "12k"
        second_component["footprint"] = "Acme:R_0805"
        second_component["fields"].update(
            {
                "Description": "General resistor",
                "Datasheet": "https://example.test/b",
                "Tolerance": "5%",
                "Voltage Rating": "50V",
            }
        )
        first = _proposal(first_component, project_id="p1", source_revision="abc")
        second = _proposal(second_component, project_id="p2", source_revision="def")

        _merge_proposal(first, second)

        warning_codes = {finding["code"] for finding in first["findings"]}
        self.assertTrue(
            {
                "conflicting_metadata_value",
                "conflicting_metadata_description",
                "conflicting_metadata_datasheet",
                "conflicting_metadata_footprint",
                "conflicting_metadata_fields_tolerance",
            }.issubset(warning_codes)
        )
        alternatives = first["metadata"]["alternatives"]
        self.assertEqual({item["value"] for item in alternatives["value"]}, {"10k", "12k"})
        self.assertEqual(
            {
                source["projectId"]
                for item in alternatives["value"]
                for source in item["sources"]
            },
            {"p1", "p2"},
        )
        self.assertEqual(
            {item["value"] for item in alternatives["fields.Tolerance"]},
            {"1%", "5%"},
        )
        self.assertEqual(first["metadata"]["fields"]["Voltage Rating"], "50V")

    def test_merge_ignores_instance_uuid_and_sheet_context(self) -> None:
        first_component = self._component("C1", component_uid="cmp-1")
        second_component = self._component("C2", component_uid="cmp-2")
        first_component["fields"].update(
            {
                "Datasheet": "https://example.test/c.pdf",
                "kicad_instance_uuid": "symbol-c1",
                "Sheetname": "Power",
                "kicad_sheet_path_names": "/Power/",
                "kicad_sheet_path_uuids": "/sheet-power/",
            }
        )
        second_component["fields"].update(
            {
                "Datasheet": "https://example.test/c.pdf",
                "kicad_instance_uuid": "symbol-c2",
                "Sheetname": "Control",
                "kicad_sheet_path_names": "/Control/",
                "kicad_sheet_path_uuids": "/sheet-control/",
            }
        )

        first = _proposal(first_component, project_id="p1", source_revision="abc")
        second = _proposal(second_component, project_id="p1", source_revision="abc")
        _merge_proposal(first, second)

        warning_codes = {finding["code"] for finding in first["findings"]}
        self.assertFalse(any("sheet" in code or "uuid" in code for code in warning_codes))
        self.assertNotIn("Sheetname", first["metadata"]["fields"])
        self.assertNotIn("kicad_sheet_path_names", first["metadata"]["fields"])

    def test_selected_component_can_resolve_by_any_stable_anchor(self) -> None:
        component = self._component("R1", component_uid="cmp-1")
        self.assertTrue(_matches_selection(component, {"component_uid": "cmp-1"}))
        self.assertTrue(_matches_selection(component, {"reference": "R1"}))
        self.assertTrue(_matches_selection(component, {"schematic_uuid": "symbol-R1"}))
        self.assertTrue(_matches_selection(component, {"pcb_footprint_uuid": "footprint-R1"}))
        self.assertFalse(_matches_selection(component, {"reference": "R2"}))

    def test_import_session_builds_one_asset_index_for_all_project_components(self) -> None:
        components = [
            self._component("R1", component_uid="cmp-1"),
            self._component("R8", component_uid="cmp-8"),
        ]
        session = {
            "id": "session-1",
            "scope": "project",
            "selection": {},
            "project_ids": ["project-1"],
            "project_revisions": {"project-1": "revision-1"},
        }

        @contextmanager
        def project_file_for_revision(*_args: object, **_kwargs: object):
            yield Path(tmp) / "main.kicad_pro", None

        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch("app.services.project_component_import_service.catalog_service") as catalog,
                mock.patch(
                    "app.services.project_component_import_service.project_service.get_project_by_id",
                    return_value={"id": "project-1"},
                ),
                mock.patch(
                    "app.services.project_component_import_service.semantic_index_service.get_or_build",
                    return_value={"components": components},
                ),
                mock.patch(
                    "app.services.project_component_import_service.semantic_index_service._project_file_for_revision",
                    side_effect=project_file_for_revision,
                ),
                mock.patch(
                    "app.services.project_component_import_service.build_project_asset_index"
                ) as build_index,
            ):
                catalog.get_project_import_session.return_value = session
                catalog.store_root = Path(tmp) / "catalog"
                asset_index = build_index.return_value
                asset_index.extract_component_assets.return_value = ([], [], {})

                run_project_import_session("session-1")

            build_index.assert_called_once()
            self.assertEqual(asset_index.extract_component_assets.call_count, 2)
            catalog.index_project_component_usage.assert_called_once()
            catalog.stage_project_import_proposals.assert_called_once()
            self.assertEqual(catalog.stage_project_import_proposals.call_args.args[0], "session-1")


if __name__ == "__main__":
    unittest.main()
