from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.project_component_asset_extractor import (  # noqa: E402
    ContentAddressedAssetStager,
    build_project_asset_index,
    extract_component_assets,
)


class ProjectComponentAssetExtractorTests(unittest.TestCase):
    def test_extracts_embedded_symbol_footprint_and_local_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "board.step").write_bytes(b"step-model")
            (root / "main.kicad_sch").write_text(
                """(kicad_sch
  (lib_symbols
    (symbol "Acme:Controller"
      (property "Reference" "U" (at 0 0 0))
      (symbol "Controller_1_1" (pin input line (at 0 0 0) (length 2.54)))
    )
  )
  (symbol
    (lib_id "Acme:Controller")
    (uuid "symbol-uuid")
    (property "Reference" "U12" (at 0 0 0))
  )
)""",
                encoding="utf-8",
            )
            (root / "main.kicad_pcb").write_text(
                """(kicad_pcb
  (footprint "Acme:Controller_QFN"
    (layer "F.Cu")
    (uuid "footprint-uuid")
    (at 10 20 90)
    (property "Reference" "U12" (at 0 0 0) (layer "F.SilkS"))
    (property "Value" "Controller" (at 0 1 0) (layer "F.Fab"))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 4 "VCC") (uuid "pad-uuid"))
    (model "${KIPRJMOD}/board.step" (offset (xyz 0 0 0)))
  )
)""",
                encoding="utf-8",
            )
            component = {
                "reference": "U12",
                "value": "Controller",
                "footprint": "Acme:Controller_QFN",
                "schematicRefs": [{"symbolUuid": "symbol-uuid"}],
                "pcbRefs": [{"footprintUuid": "footprint-uuid"}],
            }

            assets, findings, resolved = extract_component_assets(root, component, staging_dir=root / "staging")

            self.assertEqual([asset["asset_type"] for asset in assets], ["symbol", "footprint", "3dmodel"])
            self.assertEqual(findings, [])
            self.assertEqual(resolved["symbol_lib_id"], "Acme:Controller")
            symbol = Path(assets[0]["staged_path"]).read_text(encoding="utf-8")
            self.assertIn('(symbol "Controller"', symbol)
            self.assertNotIn('(symbol "Acme:Controller"', symbol)
            footprint = Path(assets[1]["staged_path"]).read_text(encoding="utf-8")
            self.assertIn('(property "Reference" "REF**"', footprint)
            self.assertNotIn('(net 4 "VCC")', footprint)
            self.assertNotIn('(uuid "footprint-uuid")', footprint)
            self.assertNotIn('(at 10 20 90)', footprint)

    def test_reports_unresolved_assets_without_discarding_component(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            component = {
                "reference": "U12",
                "footprint": "Acme:Missing",
                "schematicRefs": [{"symbolUuid": "missing"}],
                "pcbRefs": [{"footprintUuid": "missing"}],
            }
            assets, findings, _ = extract_component_assets(root, component, staging_dir=root / "staging")
            self.assertEqual(assets, [])
            self.assertEqual(
                {finding["code"] for finding in findings},
                {"symbol_not_resolved", "footprint_not_resolved"},
            )

    def test_snapshot_is_scanned_once_and_shared_assets_are_staged_once(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "shared.step").write_bytes(b"shared-model")
            (root / "main.kicad_sch").write_text(
                """(kicad_sch
  (lib_symbols
    (symbol "Acme:Shared"
      (property "Reference" "U" (at 0 0 0))
      (symbol "Shared_1_1" (pin input line (at 0 0 0) (length 2.54)))
    )
  )
  (symbol (lib_id "Acme:Shared") (uuid "symbol-1") (property "Reference" "U1" (at 0 0 0)))
  (symbol (lib_id "Acme:Shared") (uuid "symbol-2") (property "Reference" "U2" (at 0 0 0)))
)""",
                encoding="utf-8",
            )
            (root / "main.kicad_pcb").write_text(
                """(kicad_pcb
  (footprint "Acme:Shared_QFN"
    (layer "F.Cu") (uuid "footprint-1") (at 10 20 0)
    (property "Reference" "U1" (at 0 0 0) (layer "F.SilkS"))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 4 "VCC") (uuid "pad-1"))
    (model "${KIPRJMOD}/shared.step" (offset (xyz 0 0 0)))
  )
  (footprint "Acme:Shared_QFN"
    (layer "F.Cu") (uuid "footprint-2") (at 30 40 0)
    (property "Reference" "U2" (at 0 0 0) (layer "F.SilkS"))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 5 "GND") (uuid "pad-2"))
    (model "${KIPRJMOD}/shared.step" (offset (xyz 0 0 0)))
  )
)""",
                encoding="utf-8",
            )
            components = [
                {
                    "reference": reference,
                    "footprint": "Acme:Shared_QFN",
                    "schematicRefs": [{"symbolUuid": f"symbol-{index}"}],
                    "pcbRefs": [{"footprintUuid": f"footprint-{index}"}],
                }
                for index, reference in ((1, "U1"), (2, "U2"))
            ]
            original_rglob = Path.rglob
            original_read_text = Path.read_text
            original_read_bytes = Path.read_bytes
            with (
                mock.patch.object(
                    Path,
                    "rglob",
                    autospec=True,
                    side_effect=lambda path, pattern: original_rglob(path, pattern),
                ) as rglob,
                mock.patch.object(
                    Path,
                    "read_text",
                    autospec=True,
                    side_effect=lambda path, *args, **kwargs: original_read_text(path, *args, **kwargs),
                ) as read_text,
                mock.patch.object(
                    Path,
                    "read_bytes",
                    autospec=True,
                    side_effect=lambda path: original_read_bytes(path),
                ) as read_bytes,
            ):
                index = build_project_asset_index(root, staging_dir=root / "staging")
                first_assets, first_findings, _ = index.extract_component_assets(components[0])
                second_assets, second_findings, _ = index.extract_component_assets(components[1])

            self.assertEqual(rglob.call_count, 1)
            source_reads = [
                call.args[0]
                for call in read_text.call_args_list
                if call.args[0].suffix in {".kicad_sch", ".kicad_pcb"}
            ]
            self.assertEqual([path.name for path in source_reads].count("main.kicad_sch"), 1)
            self.assertEqual([path.name for path in source_reads].count("main.kicad_pcb"), 1)
            self.assertEqual(
                [call.args[0].name for call in read_bytes.call_args_list].count("shared.step"),
                1,
            )
            self.assertEqual(first_findings, [])
            self.assertEqual(second_findings, [])
            self.assertEqual(
                [asset["staged_path"] for asset in first_assets],
                [asset["staged_path"] for asset in second_assets],
            )
            self.assertEqual(len([path for path in (root / "staging").rglob("*") if path.is_file()]), 3)

    def test_content_stager_hard_links_same_bytes_with_different_logical_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            stager = ContentAddressedAssetStager(Path(tmp))
            first = stager.stage(filename="first.step", payload=b"same-model")
            repeated = stager.stage(filename="first.step", payload=b"same-model")
            alias = stager.stage(filename="second.step", payload=b"same-model")

            self.assertEqual(first, repeated)
            self.assertNotEqual(first, alias)
            self.assertTrue(first.samefile(alias))


if __name__ == "__main__":
    unittest.main()
