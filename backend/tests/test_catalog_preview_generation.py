from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService


class CatalogPreviewGenerationTests(unittest.TestCase):
    def test_footprint_export_uses_sanitized_isolated_filename(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.kicad_mod"
            source.write_text("(footprint \"BAT_VARTA_V 364 MF\")", encoding="utf-8")
            service = ComponentCatalogPostgresService(
                store_root=root / "store",
                database_url="postgresql://unused",
            )

            def export(args: list[str]) -> tuple[bool, str]:
                selector = args[args.index("--footprint") + 1]
                self.assertEqual(selector, "BAT_VARTA_V_364_MF")
                output = Path(args[args.index("--output") + 1]) / f"{selector}.svg"
                output.write_bytes(b"<svg/>")
                return True, ""

            with patch.object(service, "_run_kicad_cli", side_effect=export):
                status, payload = service._generate_footprint_preview(
                    {
                        "canonical_path": str(source),
                        "target_name": "BAT_VARTA_V 364 MF",
                    }
                )

            self.assertEqual(status, "ready")
            self.assertEqual(payload, b"<svg/>")


if __name__ == "__main__":
    unittest.main()
