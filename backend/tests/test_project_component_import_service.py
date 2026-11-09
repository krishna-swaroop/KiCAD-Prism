from __future__ import annotations

import sys
import tempfile
import unittest
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
from app.services.catalog.metadata_fields import CatalogMetadataFields  # noqa: E402
from app.services.catalog.placement_payloads import rewrite_symbol_payload  # noqa: E402


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
        with mock.patch.object(project_service.workspace, "get_project_by_id", return_value=row):
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

    def test_placement_stamp_is_instance_context_in_any_case(self) -> None:
        first_component = self._component("R1", component_uid="cmp-1")
        second_component = self._component("R8", component_uid="cmp-8")
        first_component["fields"].update({"Prism_Component": "c-1", "Prism_Revision": "rev-1"})
        second_component["fields"].update({"PRISM_COMPONENT": "c-1", "prism_revision": "rev-2"})

        first = _proposal(first_component, project_id="p1", source_revision="abc")
        second = _proposal(second_component, project_id="p1", source_revision="abc")
        for proposal in (first, second):
            self.assertFalse(any("prism" in key.casefold() for key in proposal["metadata"]["fields"]))
        _merge_proposal(first, second)

        warning_codes = {finding["code"] for finding in first["findings"]}
        self.assertFalse(any("prism" in code for code in warning_codes))
        self.assertFalse(any("prism" in key.casefold() for key in first["metadata"]["fields"]))
        self.assertFalse(any("prism" in key.casefold() for key in first["metadata"].get("alternatives", {})))

    def test_reference_sheet_file_and_placement_flags_never_become_component_fields(self) -> None:
        placed = {
            "Reference": "C76", "Sheetfile": "indicators_buttons.kicad_sch", "DNP": "No", "In BOM": "Yes",
            "kicad_dnp": "false", "kicad_in_bom": "true", "kicad_on_board": "true",
            "kicad_libsource_lib": "Device", "kicad_libsource_part": "C",
        }
        component = self._component("C76", component_uid="cmp-76")
        component["fields"].update(placed)

        fields = _proposal(component, project_id="p1", source_revision="abc")["metadata"]["fields"]

        self.assertFalse(set(placed) & set(fields))

    def test_a_part_number_under_another_name_fills_the_standard_field(self) -> None:
        component = self._component("C76", component_uid="cmp-76")
        component["fields"].update({"Manufacturer Part Number": "", "Part Number": "CL05A105MQ5NNNC", "MFR": "Samsung"})
        component["fields"].pop("Manufacturer", None)

        proposal = _proposal(component, project_id="p1", source_revision="abc")

        fields = proposal["metadata"]["fields"]
        self.assertEqual(fields["Manufacturer Part Number"], "CL05A105MQ5NNNC")
        self.assertEqual(fields["Manufacturer"], "Samsung")
        self.assertNotIn("Part Number", fields, "a copy of the standard field")
        self.assertNotIn("MFR", fields)
        self.assertEqual(proposal["metadata"]["manufacturer_part_number"], "CL05A105MQ5NNNC")
        self.assertNotIn("missing_metadata_manufacturer_part_number", {finding["code"] for finding in proposal["findings"]})

    def test_an_alias_that_says_something_else_is_kept(self) -> None:
        component = self._component("U1", component_uid="cmp-1")
        component["fields"].update({"Manufacturer Part Number": "TPS62840DLCR", "Part Number": "INT-00042"})

        fields = _proposal(component, project_id="p1", source_revision="abc")["metadata"]["fields"]

        self.assertEqual((fields["Manufacturer Part Number"], fields["Part Number"]), ("TPS62840DLCR", "INT-00042"))

    def test_one_part_on_two_sheets_is_one_proposal(self) -> None:
        power = self._component("C1", component_uid="cmp-1")
        power["fields"].update({"Manufacturer": "", "Reference": "C1", "Sheetfile": "power.kicad_sch"})
        control = self._component("C9", component_uid="cmp-9")
        control["fields"].update({"Manufacturer": "", "Reference": "C9", "Sheetfile": "control.kicad_sch"})

        self.assertEqual(
            _proposal(power, project_id="p1", source_revision="abc")["dedupe_key"],
            _proposal(control, project_id="p1", source_revision="abc")["dedupe_key"],
        )

    def test_placement_stamp_does_not_split_the_fallback_dedupe_key(self) -> None:
        unstamped = self._component("R1", component_uid="cmp-1")
        unstamped["fields"]["Manufacturer"] = ""
        stamped = self._component("R8", component_uid="cmp-8")
        stamped["fields"].update({"Manufacturer": "", "Prism_Component": "c-1", "Prism_Revision": "rev-2"})

        self.assertEqual(
            _proposal(unstamped, project_id="p1", source_revision="abc")["dedupe_key"],
            _proposal(stamped, project_id="p1", source_revision="abc")["dedupe_key"],
        )

    def test_field_creation_harvest_and_placement_agree_on_stamp_names(self) -> None:
        symbol = (
            '(kicad_symbol_lib (version 20231120) (generator "prism")\n'
            '  (symbol "R_Test"\n'
            '    (property "Reference" "R" (at 0 0 0)\n'
            "      (effects (font (size 1.27 1.27)))\n"
            "    )\n"
            '    (property "{name}" "stored" (at 0 0 0)\n'
            "      (effects (font (size 1.27 1.27)) hide)\n"
            "    )\n"
            "  )\n"
            ")\n"
        )
        cases = {
            "Prism_Revision": True,
            "prism revision": True,
            "prism-revision": True,
            "PRISM_REVISION": True,
            "prismrevision": False,
            "prism__revision": False,
        }
        for name, reserved in cases.items():
            with self.subTest(name=name):
                if reserved:
                    with self.assertRaisesRegex(ValueError, "reserved"):
                        CatalogMetadataFields.prepare_create_field({"key": name})
                else:
                    self.assertEqual(CatalogMetadataFields.prepare_create_field({"key": name}).field_key, name)

                component = self._component("R1", component_uid="cmp-1")
                component["fields"].update({name: "custom", "prism_internal_sku": "SKU-7"})
                fields = _proposal(component, project_id="p1", source_revision="abc")["metadata"]["fields"]
                self.assertEqual(name not in fields, reserved)
                self.assertEqual(fields["prism_internal_sku"], "SKU-7")

                catalog = {
                    "id": "c1",
                    "revision_id": "r1",
                    "extra_fields": {name: "custom", "prism_internal_sku": "SKU-7"},
                }
                payload = symbol.replace("{name}", name).encode("utf-8")
                # The catalog field overrides the stored property of the same name.
                kept = f'(property "{name}" "custom"'.encode()
                stamped = rewrite_symbol_payload(payload, "lib:FP", catalog, stamp=True)
                self.assertEqual(kept in stamped, not reserved)
                self.assertEqual(b'"custom"' in stamped, not reserved)
                self.assertNotIn(b'"stored"', stamped)
                self.assertIn(b'(property "prism_internal_sku" "SKU-7"', stamped)
                self.assertEqual(stamped.count(b'(property "Prism_Revision" '), 1)
                self.assertIn(b'(property "Prism_Revision" "r1"', stamped)
                # Unstamped output (DBL) keeps every name, as before the stamp existed.
                unstamped = rewrite_symbol_payload(payload, "lib:FP", catalog)
                self.assertIn(kept, unstamped)
                self.assertIn(b'(property "prism_internal_sku" "SKU-7"', unstamped)
                self.assertNotIn(b'(property "Prism_Revision" "r1"', unstamped)

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

        with tempfile.TemporaryDirectory() as tmp:
            with (
                mock.patch("app.services.project_component_import_service.catalog_service") as catalog,
                mock.patch(
                    "app.services.project_component_import_service.project_service.get_project_by_id",
                    return_value={"id": "project-1"},
                ),
                mock.patch(
                    "app.services.project_component_import_service.semantic_index_service.get_index",
                    return_value={"components": components},
                ),
                mock.patch("app.services.design_bundle.consumer.bundle_read", return_value=object()),
                mock.patch(
                    "app.services.project_component_import_service.ProjectBundleAssetIndex"
                ) as bundle_index,
            ):
                catalog.get_project_import_session.return_value = session
                catalog.store_root = Path(tmp) / "catalog"
                asset_index = bundle_index.return_value
                asset_index.extract_component_assets.return_value = ([], [], {})

                run_project_import_session("session-1")

            bundle_index.assert_called_once()
            self.assertEqual(asset_index.extract_component_assets.call_count, 2)
            catalog.index_project_component_usage.assert_called_once()
            catalog.stage_project_import_proposals.assert_called_once()
            self.assertEqual(catalog.stage_project_import_proposals.call_args.args[0], "session-1")

if __name__ == "__main__":
    unittest.main()
