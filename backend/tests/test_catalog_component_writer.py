"""Pure contracts for metadata patch merging and remote-head payload shaping."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.component_writer import (  # noqa: E402
    METADATA_PATCH_COLUMNS,
    merge_metadata_patch,
    metadata_matches_revision,
)
from app.services.catalog.metadata_normalization import (  # noqa: E402
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
)
from app.services.catalog.remote_heads import remote_head_payload  # noqa: E402


def _revision(**overrides: object) -> dict[str, object]:
    base = {
        "name": "R1",
        "value": "10k",
        "description": "Resistor",
        "datasheet_url": "https://prism.example/r1.pdf",
        "manufacturer": "Prism",
        "mpn": "PG-R-1",
        "normalized_manufacturer": "prism",
        "normalized_mpn": "pg-r-1",
        "mpn_source": "manufacturer",
        "category": "Passives",
        "package_name": "0402",
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
        "summary": "Resistor",
        "extra_fields": '{"Tolerance": "1%"}',
    }
    base.update(overrides)
    return base


class MergeMetadataPatchTests(unittest.TestCase):
    def test_patch_only_touches_supplied_keys_and_keeps_extra_fields(self) -> None:
        component = {"identity_kind": IDENTITY_KIND_MPN, "identity_source": ""}
        merged = merge_metadata_patch(component, _revision(), {"value": "22k", "vendor": None})
        self.assertEqual(merged["value"], "22k")
        self.assertEqual(merged["vendor"], "")
        self.assertEqual(merged["mpn"], "PG-R-1")
        self.assertEqual(merged["extra_fields"], {"Tolerance": "1%"})
        self.assertEqual(merged["identity_kind"], IDENTITY_KIND_MPN)

    def test_provisional_component_is_promoted_when_an_mpn_arrives(self) -> None:
        component = {
            "identity_kind": IDENTITY_KIND_PROVISIONAL_IPN,
            "identity_source": "legacy-db",
            "normalized_part_number": "ipn-42",
        }
        without_mpn = merge_metadata_patch(component, _revision(mpn=""), {"value": "1k"})
        self.assertEqual(without_mpn["identity_kind"], IDENTITY_KIND_PROVISIONAL_IPN)
        self.assertEqual(without_mpn["identity_source"], "legacy-db")
        promoted = merge_metadata_patch(component, _revision(mpn=""), {"mpn": "PG-NEW"})
        self.assertEqual(promoted["identity_kind"], IDENTITY_KIND_MPN)
        self.assertEqual(promoted["identity_source"], "")
        self.assertEqual(promoted["mpn"], "PG-NEW")

    def test_unchanged_patch_is_detected_against_the_revision(self) -> None:
        component = {"identity_kind": IDENTITY_KIND_MPN, "identity_source": ""}
        revision = _revision()
        self.assertTrue(metadata_matches_revision(revision, merge_metadata_patch(component, revision, {})))
        self.assertFalse(
            metadata_matches_revision(revision, merge_metadata_patch(component, revision, {"value": "33k"}))
        )
        self.assertFalse(
            metadata_matches_revision(
                revision, merge_metadata_patch(component, revision, {"extra_fields": {"Tolerance": "5%"}})
            )
        )

    def test_patch_columns_cover_every_editable_field(self) -> None:
        self.assertNotIn("name", METADATA_PATCH_COLUMNS)
        self.assertNotIn("extra_fields", METADATA_PATCH_COLUMNS)
        self.assertEqual(set(METADATA_PATCH_COLUMNS), set(METADATA_PATCH_COLUMNS.values()))


class RemoteHeadPayloadTests(unittest.TestCase):
    def _row(self, **overrides: object) -> dict[str, object]:
        row = {
            "component_id": "c1",
            "slug": "pg-r-1",
            "name": "R1",
            "identity_kind": IDENTITY_KIND_MPN,
            "manufacturer": "Prism",
            "mpn": "PG-R-1",
            "description": "Resistor",
            "package_name": "0402",
            "category": "Passives",
            "datasheet_url": "",
            "summary": "",
            "version": 3,
            "has_symbol": 1,
            "has_footprint": 1,
            "symbol_library": "Prism_Sym",
            "symbol_name": "R_Test",
            "symbol_preview_id": "p-sym",
            "footprint_preview_id": "",
            "inventory_sources": "[]",
            "default_representation_id": "rep-1",
            "representation_count": 1,
            "symbol_variant_count": 1,
            "footprint_variant_count": 1,
            "extra_fields": '{"Tolerance": "1%"}',
        }
        row.update(overrides)
        return row

    def test_complete_head_is_place_ready(self) -> None:
        payload = remote_head_payload(self._row())
        self.assertEqual(payload["version"], "3.0.0")
        self.assertEqual(payload["availability_state"], "place_ready")
        self.assertTrue(payload["place_enabled"])
        self.assertEqual(payload["missing_assets"], [])
        self.assertEqual([a["asset_type"] for a in payload["assets"]], ["symbol", "footprint"])
        self.assertEqual(payload["assets"][0]["target_name"], "R_Test")
        self.assertEqual(payload["previews"], [
            {"id": "p-sym", "kind": "symbol", "status": "ready", "file_path": "projected", "generation_error": ""}
        ])
        self.assertEqual(payload["release_status"], "released")
        self.assertEqual(payload["extra_fields"], {"Tolerance": "1%"})

    def test_partial_and_provisional_heads_are_not_placeable(self) -> None:
        partial = remote_head_payload(self._row(has_footprint=0))
        self.assertEqual(partial["availability_state"], "files_partial")
        self.assertEqual(partial["missing_assets"], ["footprint"])
        self.assertFalse(partial["place_enabled"])
        provisional = remote_head_payload(self._row(identity_kind=IDENTITY_KIND_PROVISIONAL_IPN))
        self.assertEqual(provisional["availability_state"], "place_ready")
        self.assertFalse(provisional["place_enabled"])
        empty = remote_head_payload(self._row(has_symbol=0, has_footprint=0))
        self.assertEqual(empty["availability_state"], "metadata_only")
        self.assertEqual(empty["assets"], [])

    def test_inventory_locations_are_aggregated_by_policy(self) -> None:
        payload = remote_head_payload(
            self._row(
                inventory_sources=json.dumps(
                    [
                        {
                            "source": "csv",
                            "location_key": "a",
                            "quantity": 2,
                            "uom": "pcs",
                            "inventory_status": "available",
                            "fetch_status": "ok",
                            "fetched_at": "2026-01-01T00:00:00Z",
                        },
                        {
                            "source": "csv",
                            "location_key": "b",
                            "quantity": 3,
                            "uom": "g",
                            "inventory_status": "available",
                            "fetch_status": "ok",
                            "fetched_at": "2026-01-01T00:00:00Z",
                        },
                        {
                            "source": "inventree",
                            "location_key": "main",
                            "quantity": 10,
                            "uom": "pcs",
                            "inventory_status": "available",
                            "fetch_status": "ok",
                            "fetched_at": "2026-01-01T00:00:00Z",
                        },
                    ]
                )
            )
        )
        sources = payload["supply"]["sources"]
        self.assertEqual([source["id"] for source in sources], ["inventree", "csv"])
        self.assertEqual(sources[0]["stock"], 10.0)
        self.assertFalse(sources[0]["mixed_units"])
        self.assertTrue(sources[1]["mixed_units"])
        self.assertEqual(sources[1]["stock"], 0.0)
        self.assertEqual(sources[1]["display_name"], "CSV")


if __name__ == "__main__":
    unittest.main()
