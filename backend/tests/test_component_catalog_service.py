from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services.component_catalog_service import ComponentCatalogService  # noqa: E402
from app.services.component_catalog_service_sqlite import (  # noqa: E402
    _discover_symbol_names_in_text,
    _rewrite_footprint_payload,
    _rewrite_symbol_payload,
)


class ComponentCatalogServiceHelperTests(unittest.TestCase):
    def _create_released_component(
        self,
        service: ComponentCatalogService,
        *,
        value: str,
        mpn: str,
        category: str = "Resistors SMD",
        package_name: str = "0603",
    ) -> dict:
        component = service.create_manual_component(
            value=value,
            description=f"{value} precision resistor",
            datasheet="https://example.com/r.pdf",
            manufacturer="Acme",
            manufacturer_part_number=mpn,
            category=category,
            package_name=package_name,
        )
        symbol = f"SYM_{mpn.replace(':', '_').replace('-', '_')}"
        symbol_path = (
            service.store_root / "symbols" / "SharedSymbols" / f"{symbol}.kicad_sym"
        )
        symbol_path.parent.mkdir(parents=True, exist_ok=True)
        symbol_path.write_text(
            f'(kicad_symbol_lib (version 20211014) (generator "test")\n'
            f'  (symbol "{symbol}"\n'
            f'    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
            f'    (property "Value" "{value}" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
            f"  )\n"
            f")\n",
            encoding="utf-8",
        )
        footprint_path = (
            service.store_root
            / "footprints"
            / "SharedFootprints.pretty"
            / f"{symbol}.kicad_mod"
        )
        footprint_path.parent.mkdir(parents=True, exist_ok=True)
        footprint_path.write_text(f'(footprint "{symbol}")\n', encoding="utf-8")
        with service._connect() as conn:  # type: ignore[attr-defined]
            revision_id = component["revision_id"]
            symbol_asset = service._register_asset(  # type: ignore[attr-defined]
                conn,
                asset_type="symbol",
                canonical_path=symbol_path,
                target_library="SharedSymbols",
                target_name=symbol,
            )
            footprint_asset = service._register_asset(  # type: ignore[attr-defined]
                conn,
                asset_type="footprint",
                canonical_path=footprint_path,
                target_library="SharedFootprints",
                target_name=symbol,
            )
            service._link_asset_to_revision(
                conn, revision_id, symbol_asset, required=True
            )  # type: ignore[attr-defined]
            service._link_asset_to_revision(
                conn, revision_id, footprint_asset, required=True
            )  # type: ignore[attr-defined]
            conn.commit()
        service.set_release_status(component["id"], "in_progress")
        service.set_release_status(component["id"], "qa_review")
        service.set_release_status(component["id"], "done")
        return service.set_release_status(component["id"], "released")

    def test_symbol_name_discovery_ignores_pin_unit_suffixes(self) -> None:
        text = """
        (kicad_symbol_lib
          (version 20211014)
          (generator "KiCAD Prism")
          (symbol "R"
            (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
          )
          (symbol "R_1_1"
            (pin passive line (at 0 0 0) (length 2.54))
          )
        )
        """
        self.assertEqual(_discover_symbol_names_in_text(text), ["R"])

    def test_symbol_rewrite_injects_metadata_and_footprint(self) -> None:
        payload = b"""(kicad_symbol_lib (version 20211014) (generator \"KiCAD Prism\")\n  (symbol \"R\"\n    (property \"Reference\" \"R\" (at 0 0 0)\n      (effects (font (size 1.27 1.27)))\n    )\n    (property \"Value\" \"OLD\" (at 0 0 0)\n      (effects (font (size 1.27 1.27)))\n    )\n  )\n)\n"""
        component = {
            "value": "10k",
            "description": "General purpose resistor",
            "datasheet_url": "https://example.com/r.pdf",
            "manufacturer": "Acme",
            "mpn": "ACME-R-10K",
            "vendor": "",
            "vendor_part_number": "",
            "mass_g": "",
            "rqjc_c_w": "",
            "rqjc_top_c_w": "",
            "temp_max_c": "",
            "temp_min_c": "",
            "power_dissipation_w": "",
            "rate": "",
            "sap_code": "",
        }
        rendered = _rewrite_symbol_payload(
            payload, "remote_prism_smd:R_0603_1608Metric", component
        ).decode("utf-8")
        self.assertIn('(property "Value" "10k"', rendered)
        self.assertIn('(property "Manufacturer" "Acme"', rendered)
        self.assertIn(
            '(property "Footprint" "remote_prism_smd:R_0603_1608Metric"', rendered
        )
        self.assertIn('(property "SAP Code" ""', rendered)

    def test_footprint_rewrite_points_model_into_remote_library(self) -> None:
        payload = b"""(footprint \"R_0603_1608Metric\"\n  (model \"old/path/to/model.step\")\n)\n"""
        asset = {
            "target_name": "R_0603_1608Metric",
            "name": "R_0603_1608Metric.kicad_mod",
        }
        rendered = _rewrite_footprint_payload(payload, asset).decode("utf-8")
        self.assertIn(
            "${KIPRJMOD}/RemoteLibrary/remote_3d/R_0603_1608Metric.step", rendered
        )

    def test_csv_required_columns_match_manual_mandatory_fields(self) -> None:
        service = ComponentCatalogService()
        normalized = service._normalize_csv_row(  # type: ignore[attr-defined]
            {
                "Value": "10k",
                "Datasheet": "https://example.com/r.pdf",
                "Description": "General purpose resistor",
                "Manufacturer": "Acme",
                "Manufacturer Part Number": "ACME-R-10K",
            },
            2,
        )
        self.assertEqual(normalized["value"], "10k")
        self.assertEqual(normalized["manufacturer_part_number"], "ACME-R-10K")

        with self.assertRaises(ValueError):
            service._normalize_csv_row(  # type: ignore[attr-defined]
                {
                    "Value": "10k",
                    "Datasheet": "",
                    "Description": "General purpose resistor",
                    "Manufacturer": "Acme",
                    "Manufacturer Part Number": "ACME-R-10K",
                },
                3,
            )

    def test_dbl_export_uses_one_symbol_library_file_per_part(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            service.initialize()

            for value, mpn, symbol in (
                ("10k", "ACME:R:10K", "R_10K"),
                ("1k", "ACME:R:1K", "R_1K"),
            ):
                component = service.create_manual_component(
                    value=value,
                    description=f"{value} resistor",
                    datasheet="https://example.com/r.pdf",
                    manufacturer="Acme",
                    manufacturer_part_number=mpn,
                    category="Resistors SMD",
                    package_name="0603",
                )
                symbol_path = (
                    service.store_root
                    / "symbols"
                    / "SharedSymbols"
                    / f"{symbol}.kicad_sym"
                )
                symbol_path.parent.mkdir(parents=True, exist_ok=True)
                symbol_path.write_text(
                    f'(kicad_symbol_lib (version 20211014) (generator "test")\n'
                    f'  (symbol "{symbol}"\n'
                    f'    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                    f'    (property "Value" "{value}" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                    f"  )\n"
                    f")\n",
                    encoding="utf-8",
                )
                footprint_path = (
                    service.store_root
                    / "footprints"
                    / "SharedFootprints.pretty"
                    / f"{symbol}.kicad_mod"
                )
                footprint_path.parent.mkdir(parents=True, exist_ok=True)
                footprint_path.write_text(f'(footprint "{symbol}")\n', encoding="utf-8")
                with service._connect() as conn:  # type: ignore[attr-defined]
                    revision_id = component["revision_id"]
                    symbol_asset = service._register_asset(  # type: ignore[attr-defined]
                        conn,
                        asset_type="symbol",
                        canonical_path=symbol_path,
                        target_library="SharedSymbols",
                        target_name=symbol,
                    )
                    footprint_asset = service._register_asset(  # type: ignore[attr-defined]
                        conn,
                        asset_type="footprint",
                        canonical_path=footprint_path,
                        target_library="SharedFootprints",
                        target_name=symbol,
                    )
                    service._link_asset_to_revision(
                        conn, revision_id, symbol_asset, required=True
                    )  # type: ignore[attr-defined]
                    service._link_asset_to_revision(
                        conn, revision_id, footprint_asset, required=True
                    )  # type: ignore[attr-defined]
                    conn.commit()
                service.set_release_status(component["id"], "in_progress")
                service.set_release_status(component["id"], "qa_review")
                service.set_release_status(component["id"], "done")
                service.set_release_status(component["id"], "released")

            result = service.export_kicad_dbl_bundle()
            export_root = Path(result["export_root"])
            symbol_files = sorted((export_root / "SchLib").glob("*.kicad_sym"))
            self.assertEqual(len(symbol_files), 2)
            self.assertNotEqual(symbol_files[0].name, symbol_files[1].name)

            dbl_text = (export_root / "Prism_Linux.kicad_dbl").read_text(
                encoding="utf-8"
            )
            self.assertIn('"key": "Part Number Nocolon"', dbl_text)
            self.assertIn('"symbols": "LibSymbol"', dbl_text)

            import sqlite3

            with sqlite3.connect(result["sqlite_path"]) as conn:
                rows = conn.execute(
                    'SELECT LibSymbol FROM "Resistors SMD" ORDER BY LibSymbol'
                ).fetchall()
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(row[0].startswith("Prism_ACME_R_") for row in rows))

    def test_remote_search_uses_lightweight_payload_and_full_detail_stays_available(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            service.initialize()
            released = self._create_released_component(
                service, value="10k", mpn="ACME-R-10K"
            )
            self.assertTrue(service._fts_available)  # type: ignore[attr-defined]

            search_result = service.search_components("ACME 10K", page=1, page_size=20)
            self.assertEqual(search_result["total"], 1)
            summary = search_result["items"][0]
            self.assertEqual(summary["id"], released["id"])
            self.assertEqual(summary["assets"], [])
            self.assertEqual(summary["previews"], [])
            self.assertTrue(summary["place_enabled"])

            detail = service.get_component(
                released["id"], include_inactive=False, released_only=True
            )
            self.assertIsNotNone(detail)
            self.assertEqual(len(detail["assets"]), 2)

    def test_klc_junit_report_is_normalized(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            junit_path = root / "report.junit.xml"
            junit_path.write_text(
                """<?xml version='1.0' encoding='utf-8'?>
<testsuites>
  <testsuite name="Footprint KLC Checks" id="klc-fp" tests="2" failures="2">
    <testcase classname="Footprint KLC Checks" name="BadFootprint - Errors" type="Errors">
      <failure message="F5.1: Silkscreen layer requirements" type="FAILURE">F5.1: Silkscreen layer requirements
    https://klc.kicad.org/footprint/f5/f5.1/
    Some silkscreen lines have incorrect width
       - Line on F.SilkS has width 0.16</failure>
    </testcase>
    <testcase classname="Footprint KLC Checks" name="BadFootprint - Warnings" type="Warnings">
      <failure message="F6.3: Pad requirements for SMD footprints" type="WARNING">F6.3: Pad requirements for SMD footprints
    https://klc.kicad.org/footprint/f6/f6.3/
    Pad(s) potentially missing layers</failure>
    </testcase>
  </testsuite>
</testsuites>
""",
                encoding="utf-8",
            )
            findings = service._parse_klc_junit(junit_path)  # type: ignore[attr-defined]
            self.assertEqual(len(findings), 2)
            self.assertEqual(findings[0]["severity"], "error")
            self.assertEqual(findings[0]["rule_code"], "F5.1")
            self.assertEqual(
                findings[0]["rule_url"], "https://klc.kicad.org/footprint/f5/f5.1/"
            )
            self.assertEqual(findings[1]["severity"], "warning")

    def test_klc_block_gate_rejects_unvalidated_release(self) -> None:
        old_gate = settings.CATALOG_KLC_RELEASE_GATE
        try:
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
                    conn.commit()
                service.set_release_status(component["id"], "in_progress")
                service.set_release_status(component["id"], "qa_review")
                service.set_release_status(component["id"], "done")
                settings.CATALOG_KLC_RELEASE_GATE = "block"
                with self.assertRaises(ValueError):
                    service.set_release_status(component["id"], "released")
        finally:
            settings.CATALOG_KLC_RELEASE_GATE = old_gate

    def test_list_components_filters_by_validation_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            service.initialize()
            passed = self._create_released_component(
                service, value="10k", mpn="ACME-R-10K"
            )
            failed = self._create_released_component(
                service, value="1k", mpn="ACME-R-1K"
            )
            not_run = service.create_manual_component(
                value="100nF",
                description="Bypass capacitor",
                datasheet="https://example.com/c.pdf",
                manufacturer="Acme",
                manufacturer_part_number="ACME-C-100N",
                category="Capacitors SMD",
                package_name="0603",
            )

            report_dir = root / "reports"
            report_dir.mkdir()

            def record_runs(component_id: str, statuses: dict[str, str]) -> None:
                component = service.get_component(component_id)
                self.assertIsNotNone(component)
                assert component is not None
                with service._connect() as conn:  # type: ignore[attr-defined]
                    for asset in component["assets"]:
                        status = statuses[str(asset["asset_type"])]
                        run_id = f"run-{component_id}-{asset['asset_type']}"
                        findings = []
                        if status == "failed":
                            findings = [
                                {
                                    "severity": "error",
                                    "rule_code": "S1.1",
                                    "rule_url": "https://klc.kicad.org/symbol/s1/s1.1/",
                                    "message": "Reference designator missing",
                                    "details": [],
                                    "object_name": asset["target_name"],
                                }
                            ]
                        service._store_validation_run(  # type: ignore[attr-defined]
                            conn,
                            run_id=run_id,
                            component_id=component_id,
                            revision_id=component["revision_id"],
                            asset=asset,
                            status=status,
                            findings=findings,
                            exit_code=1 if status == "failed" else 0,
                            report_dir=report_dir,
                            stdout_path=report_dir / f"{run_id}.stdout",
                            stderr_path=report_dir / f"{run_id}.stderr",
                            junit_path=report_dir / f"{run_id}.xml",
                            json_path=report_dir / f"{run_id}.json",
                            raw_output="",
                            tool_version="test",
                            created_at="2026-01-01T00:00:00Z",
                            finished_at="2026-01-01T00:00:01Z",
                        )
                    conn.commit()

            record_runs(passed["id"], {"symbol": "passed", "footprint": "passed"})
            record_runs(failed["id"], {"symbol": "passed", "footprint": "failed"})

            failed_result = service.list_components(
                validation_status="failed", page=1, page_size=10
            )
            self.assertEqual(failed_result["total"], 1)
            self.assertEqual(failed_result["items"][0]["id"], failed["id"])

            passed_result = service.list_components(
                validation_status="passed", page=1, page_size=10
            )
            self.assertEqual(passed_result["total"], 1)
            self.assertEqual(passed_result["items"][0]["id"], passed["id"])

            not_run_result = service.list_components(
                validation_status="not_run", page=1, page_size=10
            )
            self.assertEqual(not_run_result["total"], 1)
            self.assertEqual(not_run_result["items"][0]["id"], not_run["id"])

    def test_catalog_health_counts_all_pages(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = ComponentCatalogService(
                store_root=root / "components",
                database_url=str(root / "prism.sqlite3"),
            )
            calls: list[int] = []

            def fake_list_components(**kwargs: object) -> dict:
                page = int(kwargs["page"])
                calls.append(page)
                if page == 1:
                    items = [
                        {
                            "validation": {"status": "passed"},
                            "availability_state": "place_ready",
                            "release_status": "released",
                            "previews": [],
                        }
                        for _ in range(10000)
                    ]
                else:
                    items = [
                        {
                            "validation": {"status": "failed"},
                            "availability_state": "files_partial",
                            "release_status": "open",
                            "previews": [{"status": "failed"}],
                        }
                    ]
                return {
                    "items": items,
                    "total": 10001,
                    "page": page,
                    "page_size": 10000,
                    "pages": 2,
                }

            service.list_components = fake_list_components  # type: ignore[method-assign]

            health = service.catalog_health()

            self.assertEqual(calls, [1, 2])
            self.assertEqual(health["total_components"], 10001)
            self.assertEqual(health["place_ready"], 10000)
            self.assertEqual(health["missing_files"], 1)
            self.assertEqual(health["preview_failed"], 1)
            self.assertEqual(health["validation"]["passed"], 10000)
            self.assertEqual(health["validation"]["failed"], 1)


if __name__ == "__main__":
    unittest.main()
