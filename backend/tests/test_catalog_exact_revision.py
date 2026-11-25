"""The remote provider serves an exact released revision, never a draft (issue #698, D4/D5)."""

from __future__ import annotations

import asyncio
import base64
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.remote_provider import PROVIDER_VERSION, provider_metadata  # noqa: E402
from app.core.errors import NotFound  # noqa: E402
from app.services import kicad_library_reader, provider_revisions  # noqa: E402
from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

ACTOR = "designer@example.com"


class ProviderVersionTests(unittest.TestCase):
    def test_discovery_advertises_the_bumped_contract(self) -> None:
        with (
            patch("app.api.remote_provider._provider_origin", return_value="http://localhost:8000"),
            patch("app.api.remote_provider.provider_auth_service.provider_auth_enabled", return_value=False),
        ):
            metadata = asyncio.run(provider_metadata(object()))
        self.assertEqual((metadata["provider_version"], PROVIDER_VERSION), ("0.4.0", "0.4.0"))


class ComponentDetailRouteTests(unittest.TestCase):
    def test_detail_lists_released_revisions_and_carries_the_choice_into_placement_urls(self) -> None:
        from app.api import remote_provider as rp

        component = {
            "id": "c1", "slug": "c1", "name": "R", "manufacturer": "", "mpn": "", "description": "",
            "package_name": "", "category": "", "datasheet_url": "", "summary": "", "version": "1.0.0",
            "library_name": "L", "symbol_name": "R", "representations": [], "assets": [], "previews": [],
            "availability_state": "place_ready", "missing_assets": [], "place_enabled": True, "revision_id": "r1",
        }
        released = [{"revision_id": "r2", "version": 2, "released_at": ""}, {"revision_id": "r1", "version": 1,
                                                                          "released_at": ""}]
        with (
            patch.object(rp, "_provider_origin", return_value="https://prism.example"),
            patch.object(rp.provider_revisions, "released_component", return_value=component) as chosen,
            patch.object(rp.provider_revisions, "released_revisions", return_value=released),
        ):
            payload = asyncio.run(rp.get_component("c1", object(), representation="", revision="r1", user=None))
        chosen.assert_called_once_with("c1", "r1")
        self.assertEqual(payload["released_revisions"], released)
        self.assertEqual(payload["revision_id"], "r1")
        self.assertTrue(payload["manifest_url"].endswith("/api/remote-provider/parts/c1?revision=r1"))
        self.assertTrue(payload["inline_url"].endswith("/components/c1/inline?revision=r1"))
        from fastapi.encoders import jsonable_encoder

        from app.api import remote_provider_models as models

        typed = models.ComponentDetail.model_validate(payload).model_dump(
            mode="json", by_alias=True, exclude_unset=True
        )
        self.assertEqual(typed, jsonable_encoder(payload))


class ProviderJsonResponseModelTests(unittest.TestCase):
    """Search, categories, the part manifest and the inline bundle serialize unchanged."""

    HEAD = {
        "id": "c1", "slug": "c1", "name": "R", "identity_kind": "mpn", "manufacturer": "Acme",
        "mpn": "R-1", "description": "", "package_name": "0402", "category": "Resistors",
        "datasheet_url": "", "summary": "", "version": "1.0.0", "library_name": "L",
        "symbol_name": "R", "representations": [], "assets": [], "previews": [],
        "availability_state": "place_ready", "missing_assets": [], "place_enabled": True,
        "release_status": "released", "workflow_stage": "released", "supply": {"sources": []},
        "default_representation_id": "", "revision_id": "r1",
    }

    def test_the_page_categories_manifest_and_inline_bundle_match_their_models(self) -> None:
        from fastapi.encoders import jsonable_encoder

        from app.api import remote_provider as rp
        from app.api import remote_provider_models as models

        request = SimpleNamespace(headers={})
        with (
            patch.object(rp, "_provider_origin", return_value="https://prism.example"),
            patch.object(rp.catalog_service, "remote_projection_version", return_value="7"),
            patch.object(
                rp.catalog_service,
                "list_remote_component_heads",
                return_value={
                    "items": [self.HEAD], "total": 1, "has_more": False,
                    "page": 1, "pages": 1, "page_size": 50,
                },
            ),
            patch.object(
                rp.catalog_service,
                "list_remote_categories",
                return_value={"categories": [{"name": "Resistors", "count": 1}], "projection_version": "7"},
            ),
        ):
            search = asyncio.run(rp.search_components(request, q="r", page=1, page_size=50, include_total=True, user=None))
            page = json.loads(search.body)
            self.assertEqual(
                models.ComponentPage.model_validate(page).model_dump(mode="json", by_alias=True, exclude_unset=True),
                jsonable_encoder(page),
            )
            categories = asyncio.run(rp.list_categories(request, user=None))
            category_body = json.loads(categories.body)
            self.assertEqual(category_body, {"categories": [{"name": "Resistors", "count": 1}]})
            self.assertEqual(
                models.CategoryList.model_validate(category_body).model_dump(
                    mode="json", by_alias=True, exclude_unset=True
                ),
                jsonable_encoder(category_body),
            )

        manifest = {
            "part_id": "c1", "display_name": "R", "summary": "", "license": "Managed in KiCAD Prism",
            "representation_id": "rep1", "library_name": "L", "symbol_name": "R",
            "assets": [{
                "asset_type": "symbol", "name": "R.kicad_sym", "target_library": "L",
                "target_name": "R", "content_type": "application/x-kicad-symbol", "size_bytes": 12,
                "sha256": "f" * 64, "required": True, "download_url": "https://prism.example/a",
            }],
        }
        inline = {
            "part_id": "c1", "display_name": "R", "representation_id": "rep1", "library": "L",
            "symbol_name": "R", "compression": "NONE", "data": "e30=",
        }
        with (
            patch.object(rp, "_provider_origin", return_value="https://prism.example"),
            patch.object(rp.catalog_service, "build_manifest", return_value=manifest),
            patch.object(rp.catalog_service, "build_inline_bundle", return_value=inline),
        ):
            response = asyncio.run(rp.get_part_manifest("c1", request, representation="", revision="", user=None))
            body = json.loads(response.body)
            self.assertEqual(
                models.PartManifest.model_validate(body).model_dump(mode="json", by_alias=True, exclude_unset=True),
                jsonable_encoder(body),
            )
            response = asyncio.run(rp.get_inline_component("c1", representation="", revision="", user=None))
            body = json.loads(response.body)
            self.assertEqual(
                models.InlineBundle.model_validate(body).model_dump(mode="json", by_alias=True, exclude_unset=True),
                jsonable_encoder(body),
            )


@requires_scratch_postgres("exact revision placement tests")
class ExactRevisionTests(unittest.TestCase):
    def setUp(self) -> None:
        for target, value in (
            ("app.core.config.settings.CATALOG_KLC_ENABLED", False),
            ("app.core.config.settings.CATALOG_KLC_RELEASE_GATE", "warn"),
            ("app.core.config.settings.SESSION_SECRET", "exact-revision-test-secret"),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.service = ComponentCatalogPostgresService(store_root=Path(tmp.name) / "components", database_url=CATALOG_URL)
        self.service.initialize()
        self.addCleanup(self.service.close)
        self.token = uuid.uuid4().hex[:10]
        patcher = patch("app.services.provider_revisions.catalog_service", self.service)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _release(self, component_id: str) -> dict:
        self.service.set_release_status(component_id, "in_progress", actor=ACTOR)
        review = self.service.set_release_status(component_id, "qa_review", actor=ACTOR)
        approved = self.service.set_release_status(
            component_id, "done", actor="qa@example.com", actor_role="qa",
            expected_revision_id=review["revision_id"], expected_manifest_hash=review["manifest_hash"],
        )
        return self.service.set_release_status(
            component_id, "released", actor=ACTOR, actor_role="designer",
            expected_revision_id=approved["revision_id"], expected_manifest_hash=approved["manifest_hash"],
        )

    def _part(self) -> tuple[dict, dict, dict]:
        """``(v1, v2, draft)``: two releases with different descriptions, then an open draft."""
        created = self.service.create_manual_component(
            value="10k", description="first", datasheet="https://example.com/r.pdf",
            manufacturer="Prism Exact", manufacturer_part_number=f"EXACT-{self.token}", actor=ACTOR,
        )
        component_id = str(created["id"])
        self.addCleanup(self.service.deactivate_component, component_id, actor="exact-test@local", reason="cleanup")
        self.service.import_symbol_library(
            component_id, upload_name="R_Exact.kicad_sym",
            # Laid out as KiCad writes it: without kicad-cli (CI) the upload is kept as given.
            payload=(
                '(kicad_symbol_lib (version 20231120) (generator "test")\n'
                '  (symbol "R_Exact"\n'
                '    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                '    (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                "  )\n"
                ")\n"
            ).encode(),
            target_library=f"Exact_{self.token}", selected_symbol="R_Exact", actor=ACTOR,
        )
        self.service.import_footprint(
            component_id, upload_name="R_Exact.kicad_mod",
            payload=f'(footprint "R_Exact" (version 20240108) (generator "test") (descr "{self.token}"))'.encode(),
            target_library=f"Exact_{self.token}", selected_footprint="R_Exact", actor=ACTOR,
        )
        first = self._release(component_id)
        self.service.update_component_metadata(
            component_id, {"description": "second"}, actor=ACTOR, expected_revision_id=first["revision_id"]
        )
        second = self._release(component_id)
        draft = self.service.update_component_metadata(
            component_id, {"description": "draft"}, actor=ACTOR, expected_revision_id=second["revision_id"]
        )
        self.assertNotIn(draft["revision_id"], {first["revision_id"], second["revision_id"]})
        return first, second, draft

    def _inline_symbol(self, component_id: str, revision_id: str = "") -> dict[str, str]:
        bundle = self.service.build_inline_bundle(component_id, "", revision_id)
        entries = json.loads(base64.b64decode(bundle["data"]))
        [symbol] = [entry for entry in entries if entry["type"] == "symbol"]
        return kicad_library_reader.symbol_properties(base64.b64decode(symbol["content"]).decode("utf-8"))

    def test_an_older_released_revision_is_served_and_stamped_exactly(self) -> None:
        first, second, _draft = self._part()
        component_id = str(first["id"])

        latest = self._inline_symbol(component_id)
        older = self._inline_symbol(component_id, first["revision_id"])

        self.assertEqual((latest["Prism_Revision"], latest["Description"]), (second["revision_id"], "second"))
        self.assertEqual((older["Prism_Revision"], older["Description"]), (first["revision_id"], "first"))
        manifest = self.service.build_manifest(component_id, "https://prism.example", "", first["revision_id"])
        [symbol] = [asset for asset in manifest["assets"] if asset["asset_type"] == "symbol"]
        query = parse_qs(urlsplit(symbol["download_url"]).query)
        self.assertEqual(query["rev"], [first["revision_id"]])
        downloaded = self.service.get_asset_by_id(
            urlsplit(symbol["download_url"]).path.rsplit("/", 1)[-1], revision_id=query["rev"][0]
        )
        self.assertEqual(downloaded["sha256"], symbol["sha256"])

    def test_a_draft_or_foreign_revision_is_never_served(self) -> None:
        first, _second, draft = self._part()
        component_id = str(first["id"])
        for revision_id in (draft["revision_id"], str(uuid.uuid4())):
            for build in (
                lambda: self.service.build_inline_bundle(component_id, "", revision_id),
                lambda: self.service.build_manifest(component_id, "https://prism.example", "", revision_id),
                lambda: provider_revisions.released_component(component_id, revision_id),
            ):
                with self.subTest(revision_id=revision_id), self.assertRaises(NotFound) as refused:
                    build()
                self.assertEqual(refused.exception.code, "revision_not_released")

    def test_released_revisions_list_newest_first_and_drop_archived_ones(self) -> None:
        first, second, _draft = self._part()
        component_id = str(first["id"])
        listed = provider_revisions.released_revisions(component_id)
        self.assertEqual([item["revision_id"] for item in listed], [second["revision_id"], first["revision_id"]])
        self.assertEqual([item["version"] for item in listed], [second["revision"], first["revision"]])
        detail = provider_revisions.released_component(component_id, first["revision_id"])
        self.assertEqual((detail["revision_id"], detail["description"]), (first["revision_id"], "first"))

        with self.service.connection() as conn:
            conn.execute("UPDATE component_revisions SET release_status = 'archived' WHERE id = %s",
                         (first["revision_id"],))
            conn.commit()
        self.assertEqual([item["revision_id"] for item in provider_revisions.released_revisions(component_id)],
                         [second["revision_id"]])
        with self.assertRaises(NotFound):
            self.service.build_inline_bundle(component_id, "", first["revision_id"])

    def test_archiving_a_reopened_part_withdraws_its_release_from_kicad(self) -> None:
        """Released -> Open -> Archived leaves nothing placeable (issue #1201)."""
        first, second, draft = self._part()
        component_id = str(first["id"])
        mpn = f"EXACT-{self.token}"
        self.assertEqual(len(self.service.list_remote_component_heads(query=mpn)["items"]), 1)

        self.service.set_release_status(component_id, "archived", actor=ACTOR)

        self.assertEqual(self.service.list_remote_component_heads(query=mpn)["items"], [])
        for revision_id in ("", first["revision_id"], second["revision_id"]):
            with self.subTest(revision_id=revision_id):
                self.assertIsNone(provider_revisions.released_component(component_id, revision_id))
        with self.service.connection() as conn:
            statuses = {
                str(row["id"]): str(row["release_status"])
                for row in conn.execute(
                    "SELECT id, release_status FROM component_revisions WHERE id IN (%s, %s)",
                    (second["revision_id"], draft["revision_id"]),
                ).fetchall()
            }
            conn.rollback()
        self.assertEqual(statuses, {second["revision_id"]: "archived", draft["revision_id"]: "archived"})


if __name__ == "__main__":
    unittest.main()
