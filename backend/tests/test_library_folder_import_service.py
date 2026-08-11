from __future__ import annotations

import sys
import hashlib
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.catalog_job_service import CatalogJobService, _loads  # noqa: E402
from app.services.library_folder_import_service import (  # noqa: E402
    _footprint_identity,
    _properties,
    _resolve_linked_file,
    configured_import_roots,
    build_folder_proposals,
    resolve_server_import_path,
)
from app.services.local_artifact_store import LocalArtifactStore  # noqa: E402
from app.services.component_catalog_domain import ComponentCatalogDomainService  # noqa: E402


class LibraryFolderImportTests(unittest.TestCase):
    def test_symbol_metadata_keeps_custom_fields(self) -> None:
        fields = _properties(
            '(symbol "Part" (property "Value" "10k") '
            '(property "Manufacturer Part Number" "ACME-10K") '
            '(property "Voltage Rating" "50V"))'
        )
        self.assertEqual(fields["Value"], "10k")
        self.assertEqual(fields["Manufacturer Part Number"], "ACME-10K")
        self.assertEqual(fields["Voltage Rating"], "50V")

    def test_pretty_directory_defines_footprint_library(self) -> None:
        self.assertEqual(
            _footprint_identity("footprints/Resistor_SMD.pretty/R_0603.kicad_mod"),
            ("Resistor_SMD", "R_0603"),
        )

    def test_model_reference_resolves_by_unique_filename(self) -> None:
        model = {"relative_path": "3d/Package.pretty/Body.step", "suffix": ".step"}
        resolved = _resolve_linked_file(
            "${KICAD9_3DMODEL_DIR}/Package.pretty/Body.step",
            footprint_relative_path="footprints/Package.pretty/Body.kicad_mod",
            files_by_relative={str(model["relative_path"]).casefold(): model},
            files_by_name={"body.step": [model]},
        )
        self.assertIs(resolved, model)

    def test_snapshot_paths_reject_parent_traversal(self) -> None:
        with self.assertRaises(ValueError):
            LocalArtifactStore.normalize_relative_path("../secrets/file.kicad_sym")
        self.assertEqual(
            LocalArtifactStore.normalize_relative_path("Libraries\\symbols\\part.kicad_sym"),
            "Libraries/symbols/part.kicad_sym",
        )

    def test_server_roots_are_named_and_subpaths_cannot_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "team-library").mkdir()
            with mock.patch(
                "app.services.library_folder_import_service.settings.CATALOG_IMPORT_ROOTS",
                f"engineering={root}",
            ):
                self.assertEqual(configured_import_roots()["engineering"], root.resolve())
                self.assertEqual(
                    resolve_server_import_path("engineering", "team-library"),
                    (root / "team-library").resolve(),
                )
                with self.assertRaises(ValueError):
                    resolve_server_import_path("engineering", "../outside")

    def test_job_json_decoder_accepts_native_jsonb_objects(self) -> None:
        self.assertEqual(_loads({"index": 3}, {}), {"index": 3})
        decoded = CatalogJobService()._decode(
            {
                "id": "job-1",
                "job_type": "folder_library_import",
                "status": "queued",
                "payload_json": {"snapshot_id": "snapshot-1"},
                "result_json": {"proposal_count": 4},
                "checkpoint_json": {},
                "progress": 25,
                "lease_expires_at": None,
                "heartbeat_at": None,
                "run_after": None,
                "created_at": None,
                "updated_at": None,
                "started_at": None,
                "completed_at": None,
            }
        )
        self.assertEqual(decoded["payload"]["snapshot_id"], "snapshot-1")
        self.assertEqual(decoded["proposal_count"], 4)
        self.assertEqual(decoded["percent"], 25)

    def test_folder_snapshot_correlates_symbol_footprint_and_model(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            symbol = root / "source.kicad_sym"
            symbol.write_text(
                '(kicad_symbol_lib (version 20231120) (generator "test") '
                '(symbol "Part" (property "Value" "Sensor") '
                '(property "Footprint" "Package:Body") '
                '(property "Manufacturer" "Acme") '
                '(property "Manufacturer Part Number" "ACME-1") '
                '(property "Description" "Sensor") '
                '(property "Datasheet" "https://example.test/part.pdf") '
                '(property "Voltage Rating" "5V")))',
                encoding="utf-8",
            )
            footprint = root / "Body.kicad_mod"
            footprint.write_text(
                '(footprint "Body" (model "${KICAD9_3DMODEL_DIR}/Package.3dshapes/Body.step"))',
                encoding="utf-8",
            )
            model = root / "Body.step"
            model.write_bytes(b"STEP bytes")

            objects: dict[str, Path] = {}
            files = []
            for relative_path, source in (
                ("symbols/Devices.kicad_sym", symbol),
                ("footprints/Package.pretty/Body.kicad_mod", footprint),
                ("3d/Package.3dshapes/Body.step", model),
            ):
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                objects[digest] = source
                files.append(
                    {
                        "relative_path": relative_path,
                        "sha256": digest,
                        "size_bytes": source.stat().st_size,
                        "object_path": str(source),
                    }
                )

            def put_stream(stream: object, **_kwargs: object) -> SimpleNamespace:
                payload = stream.read()  # type: ignore[attr-defined]
                digest = hashlib.sha256(payload).hexdigest()
                path = root / "objects" / digest
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
                objects[digest] = path
                return SimpleNamespace(sha256=digest, size_bytes=len(payload), path=path)

            def materialize(digest: str, destination: Path) -> Path:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(objects[digest], destination)
                return destination

            fake_store = SimpleNamespace(
                get_snapshot=lambda _snapshot_id: {
                    "id": "snapshot-1",
                    "status": "ready",
                    "manifest_sha256": "manifest-1",
                },
                snapshot_files=lambda _snapshot_id: files,
                put_stream=put_stream,
                materialize=materialize,
            )
            # Proposal construction only needs the domain's pure KiCad symbol helpers;
            # persistence is deliberately outside this unit test.
            service = ComponentCatalogDomainService.__new__(ComponentCatalogDomainService)
            service._store_root = root / "catalog"  # type: ignore[attr-defined]
            service._store_root.mkdir(parents=True, exist_ok=True)  # type: ignore[attr-defined]
            with (
                mock.patch("app.services.library_folder_import_service.artifact_store", fake_store),
                mock.patch("app.services.library_folder_import_service.catalog_service", service),
            ):
                proposals = build_folder_proposals("snapshot-1", "session-1")

            self.assertEqual(len(proposals), 1)
            proposal = proposals[0]
            self.assertEqual(proposal["metadata"]["manufacturer_part_number"], "ACME-1")
            self.assertEqual(proposal["metadata"]["fields"]["Voltage Rating"], "5V")
            self.assertEqual(
                {asset["asset_type"] for asset in proposal["assets"]},
                {"symbol", "footprint", "3dmodel"},
            )
            self.assertFalse(proposal["findings"])


if __name__ == "__main__":
    unittest.main()
