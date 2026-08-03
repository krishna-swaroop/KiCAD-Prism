import unittest

from app.services import document_diff_service


class DocumentDiffServiceTests(unittest.TestCase):
    def test_builds_strict_kicad_documents_and_navigation(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[
                {
                    "id": "prism-sch-u1",
                    "kind": "changed",
                    "domain": "schematic",
                    "reference": "U1",
                    "source_id_base": "old-u1",
                    "source_id_compare": "new-u1",
                    "fields": {"Value": {"old": "A", "new": "B"}},
                    "geometry": {
                        "kind": "symbol",
                        "page": "Sheets/Power.kicad_sch",
                        "bounds": [10.0, 20.0, 4.0, 5.0],
                    },
                }
            ],
            pcb_changes=[
                {
                    "id": "prism-pcb-track",
                    "kind": "removed",
                    "domain": "pcb",
                    "net": "VCC",
                    "source_id_base": "track-old",
                    "source_id_compare": None,
                    "oldGeometry": {
                        "kind": "track",
                        "bounds": [1.0, 2.0, 3.0, 4.0],
                    },
                }
            ],
            files={
                "base": [
                    {
                        "filename": "board.kicad_pcb",
                        "path": "Hardware/board.kicad_pcb",
                    }
                ],
                "head": [],
            },
        )

        self.assertEqual(result["provider"], "prism-semantic")
        documents = {
            document["path"]: document
            for document in result["project"]["documents"]
        }
        schematic = documents["Sheets/Power.kicad_sch"]
        self.assertEqual(schematic["docType"], "kicad_sch")
        self.assertEqual(schematic["changes"][0]["id"], "/new-u1")
        self.assertEqual(schematic["changes"][0]["kind"], "modified")
        self.assertNotIn("bbox", schematic["changes"][0])
        self.assertEqual(
            schematic["changes"][0]["properties"][0],
            {
                "name": "Value",
                "before": {"type": "string", "v": "A"},
                "after": {"type": "string", "v": "B"},
            },
        )

        pcb = documents["Hardware/board.kicad_pcb"]
        self.assertEqual(pcb["changes"][0]["id"], "/track-old")
        self.assertEqual(pcb["changes"][0]["kind"], "removed")
        self.assertNotIn("bbox", pcb["changes"][0])
        self.assertEqual(
            result["navigation"]["prism-sch-u1"],
            {
                "documentPath": "Sheets/Power.kicad_sch",
                "changeId": "/new-u1",
                "changeIds": ["/new-u1"],
            },
        )

    def test_emits_multi_target_change_as_one_native_tree(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[{
                "id": "pf-01-count",
                "kind": "changed",
                "domain": "schematic",
                "category": "nets",
                "net": "PF_01",
                "details": {
                    "visualTargets": [
                        {
                            "side": "reference",
                            "status": "removed",
                            "sourceId": "label-a",
                            "page": "root.kicad_sch",
                            "role": "label",
                        },
                        {
                            "side": "reference",
                            "status": "removed",
                            "sourceId": "label-b",
                            "page": "root.kicad_sch",
                            "role": "label",
                        },
                    ],
                },
            }],
            pcb_changes=[],
            files={},
        )

        root = result["project"]["documents"][0]["changes"][0]
        self.assertEqual(root["id"], "/label-a")
        self.assertEqual(root["kind"], "removed")
        self.assertEqual(root["sourceSide"], "reference")
        self.assertEqual([child["id"] for child in root["children"]], ["/label-b"])
        self.assertEqual(
            result["navigation"]["pf-01-count"]["changeIds"],
            ["/label-a", "/label-b"],
        )

    def test_reports_non_renderable_semantic_only_changes(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[
                {
                    "id": "semantic-net",
                    "kind": "changed",
                    "domain": "schematic",
                    "net": "VCC",
                }
            ],
            pcb_changes=[],
            files={},
        )

        self.assertEqual(result["project"]["documents"], [])
        self.assertEqual(
            result["diagnostics"],
            [{"changeId": "semantic-net", "reason": "missing-source-id"}],
        )

    def test_structured_review_only_changes_do_not_create_fake_diagnostics(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[],
            pcb_changes=[{
                "id": "net-class-usb",
                "kind": "changed",
                "domain": "pcb",
                "category": "nets",
                "source_id_compare": "net-class-usb",
                "fields": {"Track width": {"old": 0.18, "new": 0.2}},
                "details": {"reviewOnly": True, "visualTargets": []},
            }],
            files={},
        )

        self.assertEqual(result["project"]["documents"], [])
        self.assertEqual(result["diagnostics"], [])

    def test_hydrates_field_only_changes_from_the_semantic_geometry_index(
        self,
    ) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[
                {
                    "id": "field-only-u1",
                    "kind": "changed",
                    "domain": "schematic",
                    "source_id_base": "u1",
                    "source_id_compare": "u1",
                    "page": "root.kicad_sch",
                    "fields": {"Value": {"old": "A", "new": "B"}},
                }
            ],
            pcb_changes=[],
            files={},
            geometry={
                "base": {"schematic": {}, "pcb": {}},
                "head": {
                    "schematic": {
                        "u1": {
                            "kind": "symbol",
                            "page": "root.kicad_sch",
                            "bounds": [10, 20, 4, 5],
                        }
                    },
                    "pcb": {},
                },
            },
        )

        item = result["project"]["documents"][0]["changes"][0]
        self.assertEqual(item["typeName"], "SCH_SYMBOL")
        self.assertNotIn("bbox", item)

    def test_reference_sourced_modified_change_preserves_source_side(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[
                {
                    "id": "duplicate-count-down",
                    "kind": "changed",
                    "domain": "schematic",
                    "source_side": "reference",
                    "source_id_base": "removed-duplicate",
                    "source_id_compare": None,
                    "page": "root.kicad_sch",
                    "fields": {"instanceCount": {"old": 2, "new": 1}},
                    "oldGeometry": {
                        "kind": "symbol",
                        "page": "root.kicad_sch",
                        "bounds": [10, 20, 4, 5],
                    },
                }
            ],
            pcb_changes=[],
            files={},
        )

        item = result["project"]["documents"][0]["changes"][0]
        self.assertEqual(item["kind"], "modified")
        self.assertEqual(item["id"], "/removed-duplicate")
        self.assertEqual(item["sourceSide"], "reference")

    def test_native_geometry_page_overrides_human_hierarchy_and_folds_siblings(self) -> None:
        hierarchy = "/S32G399/Ethernet & PCIe Section/USB/"
        native_page = "Subsheets/USB.kicad_sch"
        result = document_diff_service.build_project_diff(
            schematic_changes=[{
                "id": "usb-data0",
                "kind": "changed",
                "domain": "schematic",
                "category": "nets",
                "net": "USB_ULPI_DATA0",
                "details": {
                    "visualTargets": [
                        {
                            "side": "comparison",
                            "status": "modified",
                            "sourceId": "wire-a",
                            "page": native_page,
                            "role": "wire",
                        },
                        {
                            "side": "comparison",
                            "status": "modified",
                            "sourceId": "label-a",
                            "page": hierarchy,
                            "role": "label",
                        },
                    ],
                },
            }],
            pcb_changes=[],
            files={},
            geometry={
                "base": {"schematic": {}, "pcb": {}},
                "head": {
                    "schematic": {
                        "wire-a": {"kind": "wire", "page": native_page},
                        "label-a": {"kind": "label", "page": native_page},
                    },
                    "pcb": {},
                },
            },
        )

        self.assertEqual(
            [document["path"] for document in result["project"]["documents"]],
            [native_page],
        )
        # wire-a is named by a native path, so it has no hierarchy prefix to
        # contribute; label-a is named by its sheet instance and keeps it, so
        # the same label in another instance of this sheet stays distinct.
        self.assertEqual(
            result["navigation"]["usb-data0"]["changeIds"],
            ["/wire-a", f"{hierarchy.rstrip('/')}/label-a"],
        )

    def test_unresolved_hierarchy_does_not_create_an_unloadable_document(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[{
                "id": "unresolved-label",
                "kind": "changed",
                "domain": "schematic",
                "details": {
                    "visualTargets": [{
                        "side": "comparison",
                        "status": "modified",
                        "sourceId": "label-a",
                        "page": "/Human/Hierarchy/",
                        "role": "label",
                    }],
                },
            }],
            pcb_changes=[],
            files={},
        )

        self.assertEqual(result["project"]["documents"], [])
        self.assertEqual(
            result["diagnostics"],
            [{"changeId": "unresolved-label", "reason": "unresolved-schematic-hierarchy"}],
        )

    @staticmethod
    def _reused_sheet_changes() -> list[dict]:
        """Two components in two instances of one reused hierarchical sheet.

        A reused sheet is a single file, so both instances hold the very same
        symbol UUID. Only the sheet instance path separates R680 from R688.
        """
        native_page = "Subsheets/1000BaseT_PHY.kicad_sch"
        symbol_uuid = "01f6c458-c7c6-453e-b528-f72664fb7651"
        return [
            {
                "id": f"sch-comp-changed-cmp:{digest}",
                "kind": "changed",
                "domain": "schematic",
                "category": "components",
                "reference": reference,
                "page": instance,
                "fields": {"MANUFACTURER": {"old": "", "new": "Vishay Dale"}},
                # Shaped as design_compare_service emits them: `page` already
                # rewritten to the loadable file, hierarchy kept in `sheetPath`.
                "details": {
                    "visualTargets": [
                        {
                            "side": side,
                            "status": "modified",
                            "sourceId": symbol_uuid,
                            "page": native_page,
                            "sheetPath": instance,
                            "role": "component",
                        }
                        for side in ("reference", "comparison")
                    ],
                },
                "geometry": {"kind": "symbol", "page": native_page},
            }
            for reference, instance, digest in (
                ("R680", "/SJA_EthernetSwitches/1000BaseT_PHY_A/", "233d4f83"),
                ("R688", "/SJA_EthernetSwitches/1000BaseT_PHY_B/", "72b6dc52"),
            )
        ]

    def test_reused_sheet_instances_keep_distinct_change_ids(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=self._reused_sheet_changes(),
            pcb_changes=[],
            files={},
        )

        document = result["project"]["documents"][0]
        self.assertEqual(document["path"], "Subsheets/1000BaseT_PHY.kicad_sch")

        ids = [change["id"] for change in document["changes"]]
        self.assertEqual(
            ids,
            [
                "/SJA_EthernetSwitches/1000BaseT_PHY_A/"
                "01f6c458-c7c6-453e-b528-f72664fb7651",
                "/SJA_EthernetSwitches/1000BaseT_PHY_B/"
                "01f6c458-c7c6-453e-b528-f72664fb7651",
            ],
        )
        # The viewer resolves a native item from the last KIID_PATH segment, so
        # both instances must still name the one symbol that the file paints.
        self.assertEqual(
            {change_id.rsplit("/", 1)[-1] for change_id in ids},
            {"01f6c458-c7c6-453e-b528-f72664fb7651"},
        )

    def test_reused_sheet_net_targets_keep_distinct_change_ids(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[{
                "id": "shared-label-change",
                "kind": "changed",
                "domain": "schematic",
                "category": "nets",
                "net": "SENSE",
                "details": {
                    "visualTargets": [
                        {
                            "side": "comparison",
                            "status": "modified",
                            "sourceId": "label-shared",
                            "page": "shared.kicad_sch",
                            "sheetPath": path,
                            "role": "label",
                        }
                        for path in ("/channel-a/", "/channel-b/")
                    ]
                },
            }],
            pcb_changes=[],
            files={},
        )

        self.assertEqual(
            result["navigation"]["shared-label-change"]["changeIds"],
            ["/channel-a/label-shared", "/channel-b/label-shared"],
        )

    def test_overlapping_semantic_and_parser_changes_share_one_native_target(self) -> None:
        target = {
            "side": "comparison",
            "status": "modified",
            "sourceId": "label-a",
            "page": "root.kicad_sch",
            "role": "label",
        }
        result = document_diff_service.build_project_diff(
            schematic_changes=[
                {
                    "id": change_id,
                    "kind": "changed",
                    "domain": "schematic",
                    "details": {"visualTargets": [target]},
                }
                for change_id in ("parser-label-change", "semantic-net-change")
            ],
            pcb_changes=[],
            files={},
        )

        document = result["project"]["documents"][0]
        self.assertEqual(len(document["changes"]), 1)
        self.assertEqual(document["changes"][0]["id"], "/label-a")
        self.assertEqual(
            result["navigation"]["parser-label-change"]["changeId"],
            "/label-a",
        )
        self.assertEqual(
            result["navigation"]["semantic-net-change"]["changeId"],
            "/label-a",
        )

    def test_change_ids_are_unique_per_side_within_a_document(self) -> None:
        """Colliding ids silently destroy selection targets in the viewer.

        The presentation index assigns rather than appends, so two changes
        sharing an id and a side leave only the last one resolvable -- clicking
        either component would focus whichever happened to be indexed last.

        Identity is (id, sourceSide), not id alone: one change legitimately
        emits the same item on both sides, as a root plus a retained-reference
        child, and the viewer keys those separately.
        """
        result = document_diff_service.build_project_diff(
            schematic_changes=self._reused_sheet_changes(),
            pcb_changes=[],
            files={},
        )

        for document in result["project"]["documents"]:
            keys: list[tuple[str, str]] = []

            def collect(change: dict) -> None:
                keys.append((change["id"], change["sourceSide"]))
                for child in change["children"]:
                    collect(child)

            for change in document["changes"]:
                collect(change)

            duplicates = sorted({key for key in keys if keys.count(key) > 1})
            self.assertEqual(
                duplicates,
                [],
                f"duplicate change targets in {document['path']}: {duplicates}",
            )

    def test_pcb_change_ids_keep_the_bare_source_id(self) -> None:
        """Footprints have no sheet hierarchy, so nothing should be prefixed."""
        result = document_diff_service.build_project_diff(
            schematic_changes=[],
            pcb_changes=[{
                "id": "pcb-changed-cmp:abc",
                "kind": "changed",
                "domain": "pcb",
                "reference": "R680",
                "page": "/SJA_EthernetSwitches/1000BaseT_PHY_A/",
                "source_id_base": "fp-uuid",
                "source_id_compare": "fp-uuid",
                "geometry": {"kind": "footprint"},
            }],
            files={"head": [{"path": "Hardware/board.kicad_pcb"}]},
        )

        document = result["project"]["documents"][0]
        self.assertEqual(document["changes"][0]["id"], "/fp-uuid")

    def test_pcb_segment_targets_are_native_tracks_on_both_revisions(self) -> None:
        result = document_diff_service.build_project_diff(
            schematic_changes=[],
            pcb_changes=[{
                "id": "pmod-a10-route",
                "kind": "changed",
                "domain": "pcb",
                "category": "nets",
                "net": "/Expansion/PMOD_A10",
                "fields": {
                    "Net": {
                        "old": "/Expansion/PMOD_A7",
                        "new": "/Expansion/PMOD_A10",
                    }
                },
                "details": {
                    "visualTargets": [
                        {
                            "side": side,
                            "status": "modified",
                            "sourceId": "track-1",
                            "kind": "segment",
                            "role": "segment",
                        }
                        for side in ("reference", "comparison")
                    ]
                },
            }],
            files={
                "head": [{"path": "board.kicad_pcb"}],
                "base": [{"path": "board.kicad_pcb"}],
            },
        )

        root = result["project"]["documents"][0]["changes"][0]
        self.assertEqual(root["typeName"], "PCB_TRACK")
        self.assertEqual(root["sourceSide"], "reference")
        self.assertEqual(len(root["children"]), 1)
        self.assertEqual(root["children"][0]["typeName"], "PCB_TRACK")
        self.assertEqual(root["children"][0]["sourceSide"], "comparison")
        self.assertEqual(
            result["navigation"]["pmod-a10-route"]["changeIds"],
            ["/track-1", "/track-1"],
        )


if __name__ == "__main__":
    unittest.main()
