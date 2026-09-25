"""CAD availability is the default representation pair, not any attached assets."""

from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.asset_types import PLACE_REQUIRED_ASSET_TYPES  # noqa: E402
from app.services.catalog.component_queries import (  # noqa: E402
    CatalogComponentQueries,
    REPRESENTATION_ASSET_COLUMNS,
    default_rep_slot_present,
    default_representation_has_asset,
)
from app.services.catalog.component_read_models import (  # noqa: E402
    CatalogComponentReadModels,
    cad_availability,
    remote_place_enabled,
)
from app.services.catalog.metadata_normalization import (  # noqa: E402
    IDENTITY_KIND_MPN,
    IDENTITY_KIND_PROVISIONAL_IPN,
)


def _summary_rows() -> tuple[dict[str, object], dict[str, object], list[dict[str, str]]]:
    component = {
        "id": "c1",
        "slug": "c1",
        "source": "manual",
        "identity_kind": IDENTITY_KIND_MPN,
        "is_active": 1,
        "updated_at": "t",
    }
    revision = {
        "id": "r1",
        "name": "R",
        "value": "",
        "manufacturer": "M",
        "mpn": "P",
        "description": "",
        "package_name": "",
        "category": "",
        "datasheet_url": "",
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
        "extra_fields": "{}",
        "summary": "",
        "version": 1,
        "release_status": "draft",
        "updated_at": "t",
        "created_by": "",
    }
    assets = [
        {
            "id": "sym-default",
            "asset_type": "symbol",
            "target_library": "Def",
            "target_name": "S1",
        },
        {
            "id": "sym-other",
            "asset_type": "symbol",
            "target_library": "Other",
            "target_name": "S2",
        },
        {
            "id": "fp-other",
            "asset_type": "footprint",
            "target_library": "Other",
            "target_name": "F2",
        },
    ]
    return component, revision, assets


class CadAvailabilityContractTests(unittest.TestCase):
    def test_pair_completeness_matches_named_states(self) -> None:
        self.assertEqual(cad_availability(False, False), ("metadata_only", ["symbol", "footprint"]))
        self.assertEqual(cad_availability(True, False), ("files_partial", ["footprint"]))
        self.assertEqual(cad_availability(False, True), ("files_partial", ["symbol"]))
        self.assertEqual(cad_availability(True, True), ("place_ready", []))
        self.assertEqual(cad_availability(False, False)[1], list(PLACE_REQUIRED_ASSET_TYPES))

    def test_place_enabled_stays_distinct_from_cad_completeness(self) -> None:
        complete: list[str] = []
        self.assertTrue(
            remote_place_enabled(
                is_active=True,
                identity_kind=IDENTITY_KIND_MPN,
                missing_assets=complete,
                release_status="released",
            )
        )
        self.assertFalse(
            remote_place_enabled(
                is_active=True,
                identity_kind=IDENTITY_KIND_MPN,
                missing_assets=complete,
                release_status="in_progress",
            )
        )
        self.assertFalse(
            remote_place_enabled(
                is_active=False,
                identity_kind=IDENTITY_KIND_MPN,
                missing_assets=complete,
                release_status="released",
            )
        )
        self.assertFalse(
            remote_place_enabled(
                is_active=True,
                identity_kind=IDENTITY_KIND_PROVISIONAL_IPN,
                missing_assets=complete,
                release_status="released",
            )
        )
        self.assertFalse(
            remote_place_enabled(
                is_active=True,
                identity_kind=IDENTITY_KIND_MPN,
                missing_assets=["footprint"],
                release_status="released",
            )
        )


class CatalogAvailabilityQueryTests(unittest.TestCase):
    def test_sql_columns_cover_required_asset_types(self) -> None:
        self.assertEqual(set(REPRESENTATION_ASSET_COLUMNS), set(PLACE_REQUIRED_ASSET_TYPES))
        symbol_sql = default_representation_has_asset("cr", "symbol", "alias_sym")
        self.assertIn("revision_representations alias_sym", symbol_sql)
        self.assertIn("alias_sym.is_default = 1", symbol_sql)
        self.assertIn("COALESCE(alias_sym.symbol_asset_id, '') <> ''", symbol_sql)
        self.assertNotIn("revision_assets", symbol_sql)
        self.assertEqual(
            default_rep_slot_present("footprint"),
            "COALESCE(default_rep.footprint_asset_id, '') <> ''",
        )

    def test_filters_encode_each_availability_state(self) -> None:
        queries = CatalogComponentQueries(component_read_models=object())  # type: ignore[arg-type]
        ready = queries.prepare_list_components(availability_state="place_ready")
        self.assertIn(
            "COALESCE(rr_avail_symbol.symbol_asset_id, '') <> ''",
            ready.where_sql,
        )
        self.assertIn(
            "COALESCE(rr_avail_footprint.footprint_asset_id, '') <> ''",
            ready.where_sql,
        )
        self.assertIn("AND", ready.where_sql)
        self.assertNotIn("revision_assets", ready.where_sql)

        partial = queries.prepare_list_components(availability_state="files_partial")
        self.assertIn("<>", partial.where_sql)
        self.assertNotIn("NOT EXISTS", partial.where_sql)

        empty = queries.prepare_list_components(availability_state="metadata_only")
        self.assertIn("NOT EXISTS", empty.where_sql)
        self.assertIn("AND NOT EXISTS", empty.where_sql)

    def test_availability_sort_reads_the_joined_default_representation(self) -> None:
        queries = CatalogComponentQueries(component_read_models=object())  # type: ignore[arg-type]
        plan = queries.prepare_list_components(sort_by="availability_state")
        self.assertIn("COALESCE(default_rep.symbol_asset_id, '') <> ''", plan.order_sql)
        self.assertIn("COALESCE(default_rep.footprint_asset_id, '') <> ''", plan.order_sql)
        self.assertNotIn("EXISTS", plan.order_sql)
        self.assertNotIn("revision_assets", plan.order_sql)
        self.assertTrue(plan.order_sql.endswith(", c.id"))


class CatalogAvailabilitySummaryTests(unittest.TestCase):
    def test_summary_follows_an_incomplete_default_despite_attached_assets(self) -> None:
        models = CatalogComponentReadModels(revision_kernel=object())  # type: ignore[arg-type]
        component, revision, assets = _summary_rows()
        payload = models.component_summary_payload(
            component,
            revision,
            assets,
            default_symbol_asset_id="sym-default",
            default_footprint_asset_id="",
        )
        self.assertEqual(payload["availability_state"], "files_partial")
        self.assertEqual(payload["missing_assets"], ["footprint"])
        self.assertFalse(payload["place_enabled"])
        self.assertEqual(payload["library_name"], "Def")
        self.assertEqual(payload["symbol_name"], "S1")

    def test_summary_lib_id_is_empty_without_a_default_symbol(self) -> None:
        models = CatalogComponentReadModels(revision_kernel=object())  # type: ignore[arg-type]
        component, revision, assets = _summary_rows()
        payload = models.component_summary_payload(
            component,
            revision,
            assets,
            default_symbol_asset_id="",
            default_footprint_asset_id="",
        )
        self.assertEqual(payload["availability_state"], "metadata_only")
        self.assertEqual(payload["missing_assets"], ["symbol", "footprint"])
        self.assertEqual(payload["library_name"], "")
        self.assertEqual(payload["symbol_name"], "")

    def test_availability_rejects_the_historical_assets_argument(self) -> None:
        models = CatalogComponentReadModels(revision_kernel=object())  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            models.availability(  # type: ignore[misc]
                [{"id": "a1", "asset_type": "symbol"}],
                "released",
                True,
            )


if __name__ == "__main__":
    unittest.main()
