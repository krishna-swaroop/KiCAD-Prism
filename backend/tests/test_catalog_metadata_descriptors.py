"""Built-in metadata descriptors stay aligned with normalize, CSV, and API models."""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.catalog_admin import (  # noqa: E402
    CreateManualComponentRequest,
    UpdateComponentMetadataRequest,
)
from app.services.catalog.component_writer import (  # noqa: E402
    METADATA_INSERT_COLUMNS,
    METADATA_PATCH_COLUMNS,
)
from app.services.catalog.metadata_csv import (  # noqa: E402
    CSV_REQUIRED_COLUMNS,
    CatalogMetadataCsv,
)
from app.services.catalog.metadata_descriptors import (  # noqa: E402
    BUILTIN_METADATA_DESCRIPTORS,
    BUILTIN_METADATA_FIELDS,
    PROJECT_IMPORT_KNOWN_LABEL_GAPS,
    SYMBOL_METADATA_FIELD_ORDER,
    SYMBOL_METADATA_LABEL_TO_KEY,
    builtin_metadata_mapping_gaps,
)
from app.services.catalog.metadata_normalization import (  # noqa: E402
    IDENTITY_KIND_PROVISIONAL_IPN,
    normalize_metadata,
)
from app.services.catalog.placement_payloads import (  # noqa: E402
    SYMBOL_METADATA_FIELD_ORDER as PLACEMENT_FIELD_ORDER,
)
from app.services.catalog.project_import_acceptance import (  # noqa: E402
    PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY,
)
from app.services.catalog.project_import_assets import (  # noqa: E402
    IMPORT_UNCHANGED_METADATA_FIELDS,
)
from app.services.catalog.revision_comparison import (  # noqa: E402
    REVISION_DIFF_METADATA_FIELDS,
)


def _required_payload(**overrides: str) -> dict[str, str]:
    payload = {
        "value": "10k",
        "description": "Resistor",
        "datasheet": "https://example.test/r.pdf",
        "manufacturer": "Prism",
        "manufacturer_part_number": "PG-R-1",
    }
    payload.update(overrides)
    return payload


class BuiltinMetadataDescriptorTests(unittest.TestCase):
    def test_live_surfaces_have_no_mapping_gaps(self) -> None:
        normalized = normalize_metadata(_required_payload())
        csv_payload = CatalogMetadataCsv.prepare_import_row(
            {
                "value": "10k",
                "datasheet": "https://example.test/r.pdf",
                "description": "Resistor",
                "manufacturer": "Prism",
                "manufacturer_part_number": "PG-R-1",
            }
        ).payload
        gaps = builtin_metadata_mapping_gaps(
            normalized_keys=normalized,
            create_fields=CreateManualComponentRequest.model_fields,
            update_fields=UpdateComponentMetadataRequest.model_fields,
            symbol_label_to_key=SYMBOL_METADATA_LABEL_TO_KEY,
            csv_payload_keys=csv_payload,
            patch_columns=METADATA_PATCH_COLUMNS,
            insert_columns=METADATA_INSERT_COLUMNS,
            import_label_to_key=PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY,
            import_label_gaps=PROJECT_IMPORT_KNOWN_LABEL_GAPS,
            import_unchanged_keys=IMPORT_UNCHANGED_METADATA_FIELDS,
            revision_diff_keys=REVISION_DIFF_METADATA_FIELDS,
        )
        self.assertEqual(gaps, ())

    def test_mapping_gaps_catch_a_field_missing_from_the_create_api(self) -> None:
        create_fields = set(CreateManualComponentRequest.model_fields) - {
            "manufacturer_part_number"
        }
        gaps = builtin_metadata_mapping_gaps(
            normalized_keys=normalize_metadata(_required_payload()),
            create_fields=create_fields,
            update_fields=UpdateComponentMetadataRequest.model_fields,
            symbol_label_to_key=SYMBOL_METADATA_LABEL_TO_KEY,
            csv_payload_keys=normalize_metadata(_required_payload()),
            patch_columns=METADATA_PATCH_COLUMNS,
        )
        self.assertIn("create API missing manufacturer_part_number", gaps)

    def test_mapping_gaps_catch_a_field_missing_from_insert_columns(self) -> None:
        gaps = builtin_metadata_mapping_gaps(
            normalized_keys=normalize_metadata(_required_payload()),
            create_fields=CreateManualComponentRequest.model_fields,
            update_fields=UpdateComponentMetadataRequest.model_fields,
            symbol_label_to_key=SYMBOL_METADATA_LABEL_TO_KEY,
            csv_payload_keys=normalize_metadata(_required_payload()),
            patch_columns=METADATA_PATCH_COLUMNS,
            insert_columns=set(METADATA_INSERT_COLUMNS) - {"mass_g"},
        )
        self.assertIn("insert columns missing mass_g", gaps)

    def test_project_import_names_sap_code_as_a_known_label_gap(self) -> None:
        common = dict(
            normalized_keys=normalize_metadata(_required_payload()),
            create_fields=CreateManualComponentRequest.model_fields,
            update_fields=UpdateComponentMetadataRequest.model_fields,
            symbol_label_to_key=SYMBOL_METADATA_LABEL_TO_KEY,
            csv_payload_keys=normalize_metadata(_required_payload()),
            import_label_to_key=PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY,
        )
        unnamed = builtin_metadata_mapping_gaps(**common)
        self.assertIn("project import missing 'SAP Code'", unnamed)
        named = builtin_metadata_mapping_gaps(
            **common, import_label_gaps=PROJECT_IMPORT_KNOWN_LABEL_GAPS
        )
        self.assertNotIn("project import missing 'SAP Code'", named)
        dropped_rate = builtin_metadata_mapping_gaps(
            **{
                **common,
                "import_label_to_key": {
                    label: key
                    for label, key in PROJECT_IMPORT_SYMBOL_LABEL_TO_KEY.items()
                    if key != "rate"
                },
            },
            import_label_gaps=PROJECT_IMPORT_KNOWN_LABEL_GAPS,
        )
        self.assertIn("project import missing 'Rate'", dropped_rate)

    def test_mapping_gaps_catch_fields_missing_from_comparison_tuples(self) -> None:
        common = dict(
            normalized_keys=normalize_metadata(_required_payload()),
            create_fields=CreateManualComponentRequest.model_fields,
            update_fields=UpdateComponentMetadataRequest.model_fields,
            symbol_label_to_key=SYMBOL_METADATA_LABEL_TO_KEY,
            csv_payload_keys=normalize_metadata(_required_payload()),
        )
        unchanged_gaps = builtin_metadata_mapping_gaps(
            **common,
            import_unchanged_keys=tuple(
                key for key in IMPORT_UNCHANGED_METADATA_FIELDS if key != "sap_code"
            ),
        )
        self.assertIn("import unchanged-check missing sap_code", unchanged_gaps)
        diff_gaps = builtin_metadata_mapping_gaps(
            **common,
            revision_diff_keys=tuple(
                key for key in REVISION_DIFF_METADATA_FIELDS if key != "mass_g"
            ),
        )
        self.assertIn("revision diff missing mass_g", diff_gaps)

    def test_registry_shape_and_symbol_order_stay_stable(self) -> None:
        self.assertEqual(
            [field["key"] for field in BUILTIN_METADATA_FIELDS],
            [descriptor.key for descriptor in BUILTIN_METADATA_DESCRIPTORS],
        )
        self.assertEqual(
            SYMBOL_METADATA_FIELD_ORDER,
            (
                "Value",
                "Description",
                "Datasheet",
                "Manufacturer",
                "Manufacturer Part Number",
                "Vendor",
                "Vendor Part Number",
                "Mass (g)",
                "RQjC (C/W)",
                "RQjC_top (C/W)",
                "Temp_max (C)",
                "Temp_min (C)",
                "Power Dissipation (W)",
                "Rate",
                "SAP Code",
            ),
        )
        self.assertEqual(PLACEMENT_FIELD_ORDER, SYMBOL_METADATA_FIELD_ORDER)
        self.assertEqual(
            set(CSV_REQUIRED_COLUMNS),
            {
                descriptor.request_csv_field()
                for descriptor in BUILTIN_METADATA_DESCRIPTORS
                if descriptor.required
            },
        )

    def test_aliases_and_provisional_identity_keep_prior_rules(self) -> None:
        normalized = normalize_metadata(_required_payload())
        self.assertEqual(normalized["datasheet_url"], "https://example.test/r.pdf")
        self.assertEqual(normalized["mpn"], "PG-R-1")
        provisional = normalize_metadata(
            _required_payload(
                identity_kind=IDENTITY_KIND_PROVISIONAL_IPN,
                identity_source="import",
                name="R-IPN",
                manufacturer_part_number="",
            )
        )
        self.assertEqual(provisional["identity_kind"], IDENTITY_KIND_PROVISIONAL_IPN)
        self.assertEqual(provisional["mpn"], "")
        self.assertEqual(provisional["source_internal_part_number"], "R-IPN")
        with self.assertRaisesRegex(ValueError, "mpn is required"):
            normalize_metadata(_required_payload(manufacturer_part_number=""))


if __name__ == "__main__":
    unittest.main()
