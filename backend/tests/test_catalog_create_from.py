"""Create a catalog component from a released component: links copied, metadata from the request."""

from __future__ import annotations

import base64
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import NotFound  # noqa: E402
from app.services.catalog.conflicts import CatalogConflict  # noqa: E402
from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

ACTOR = "designer@example.com"
ALIGNMENT = {"offsetMm": [1.0, 2.0, 0.5], "rotationDeg": [0.0, 0.0, 90.0], "scale": 1.0}


class CreateRouteTests(unittest.TestCase):
    """The route passes ``source`` through and keeps the typed status of a refusal."""

    def _call(self, side_effect: object, **fields: object) -> object:
        from types import SimpleNamespace

        from app.api import catalog_admin

        payload = catalog_admin.CreateManualComponentRequest(
            value="4k7", description="d", datasheet="", manufacturer="M", manufacturer_part_number="P", **fields,
        )
        with patch.object(catalog_admin.catalog_service, "create_manual_component", side_effect=side_effect) as create:
            catalog_admin.create_catalog_component(payload, user=SimpleNamespace(email=ACTOR))
        return create

    def test_source_reaches_the_service_only_when_given(self) -> None:
        create = self._call([{}], source={"component_id": "c1", "expected_revision_id": "r1"})
        self.assertEqual(create.call_args.kwargs["source"], {"component_id": "c1", "expected_revision_id": "r1"})
        self.assertNotIn("source", self._call([{}]).call_args.kwargs)

    def test_a_typed_refusal_keeps_its_status_and_a_plain_one_is_400(self) -> None:
        from app.core.errors import BadRequest

        for error, status in (
            (CatalogConflict("not released", code="source_not_released"), 409),
            (CatalogConflict(), 412),
            (NotFound("Source component not found"), 404),
            (ValueError("A component with this manufacturer-part identity already exists"), 400),
        ):
            with self.subTest(status=status), self.assertRaises((CatalogConflict, NotFound, BadRequest)) as refused:
                self._call(error, source={"component_id": "c1", "expected_revision_id": "r1"})
            self.assertEqual(refused.exception.status_code, status)


@requires_scratch_postgres("create-from tests")
class CreateFromTests(unittest.TestCase):
    def setUp(self) -> None:
        for target, value in (
            ("app.core.config.settings.CATALOG_KLC_ENABLED", False),
            ("app.core.config.settings.CATALOG_KLC_RELEASE_GATE", "warn"),
            ("app.core.config.settings.SESSION_SECRET", "create-from-test-secret"),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.store_root = Path(tmp.name) / "components"
        self.service = ComponentCatalogPostgresService(store_root=self.store_root, database_url=CATALOG_URL)
        self.service.initialize()
        self.addCleanup(self.service.close)
        self.token = uuid.uuid4().hex[:10]

    def _create(self, mpn: str, *, source: dict | None = None, value: str = "10k") -> dict:
        created = self.service.create_manual_component(
            value=value, description=f"Resistor {value} 0603", datasheet="https://example.com/r.pdf",
            manufacturer="Prism CreateFrom", manufacturer_part_number=mpn, package_name="0603",
            actor=ACTOR, change_summary="Create component",
            **({"source": source} if source is not None else {}),
        )
        component_id = str(created["id"])
        self.addCleanup(self.service.deactivate_component, component_id, actor="create-from@local", reason="cleanup")
        return created

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

    def _source(self, *, release: bool = True) -> dict:
        """A part with a symbol, a footprint that names a STEP model, the model, and its alignment."""
        component_id = str(self._create(f"SRC-{self.token}")["id"])
        library = f"CreateFrom_{self.token}"
        self.service.import_symbol_library(
            component_id, upload_name="R_Series.kicad_sym",
            payload=(
                '(kicad_symbol_lib (version 20231120) (generator "test")\n'
                '  (symbol "R_Series"\n'
                '    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                '    (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                "  )\n"
                ")\n"
            ).encode(),
            target_library=library, selected_symbol="R_Series", actor=ACTOR,
        )
        self.service.import_footprint(
            component_id, upload_name="R_0603.kicad_mod",
            payload=(
                f'(footprint "R_0603" (version 20240108) (generator "test") (descr "{self.token}")\n'
                '  (model "${KICAD8_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0603.step"))\n'
            ).encode(),
            target_library=library, selected_footprint="R_0603", actor=ACTOR,
        )
        attached = self.service.attach_auxiliary_asset(
            component_id, asset_type="3dmodel", upload_name="R_0603.step",
            payload=f"ISO-10303-21;/* {self.token} */END-ISO-10303-21;".encode(),
            target_library=library, actor=ACTOR,
        )["component"]
        [model] = [asset for asset in attached["assets"] if asset["asset_type"] == "3dmodel"]
        self.service.part_relations.set_model_alignment(component_id, str(model["id"]), ALIGNMENT, actor=ACTOR)
        return self._release(component_id) if release else attached

    def _store_files(self) -> set[Path]:
        return {path for path in self.store_root.rglob("*") if path.is_file()}

    @staticmethod
    def _links(component: dict) -> tuple[list[tuple[str, str]], list[tuple[str, str, bool]]]:
        assets = sorted((str(a["asset_type"]), str(a["id"])) for a in component["assets"])
        representations = sorted(
            (str(r.get("symbol_asset_id") or ""), str(r.get("footprint_asset_id") or ""), bool(r.get("is_default")))
            for r in component.get("representations") or []
        )
        return assets, representations

    def _footprint_bytes(self, component_id: str) -> bytes:
        bundle = self.service.build_inline_bundle(component_id, "", "")
        entries = json.loads(base64.b64decode(bundle["data"]))
        [footprint] = [entry for entry in entries if entry["type"] == "footprint"]
        return base64.b64decode(footprint["content"])

    def test_the_new_part_links_the_released_assets_and_keeps_its_own_metadata(self) -> None:
        source = self._source()
        source_id, released_id = str(source["id"]), str(source["revision_id"])
        files_before = self._store_files()

        created = self._create(
            f"NEW-{self.token}", value="4k7",
            source={"component_id": source_id, "expected_revision_id": released_id},
        )
        new_id = str(created["id"])

        self.assertEqual(self._store_files(), files_before)  # links only: no file was written
        self.assertEqual(self._links(created), self._links(source))
        self.assertTrue(self._links(created)[1], "the source's representation must be copied")
        self.assertEqual((created["value"], created["mpn"]), ("4k7", f"NEW-{self.token}"))
        self.assertEqual(created["release_status"], "open")
        self.assertEqual(created["change_kind"], "create_from")

        [model] = self.service.part_relations.list_models(new_id)
        self.assertEqual(
            {key: model["alignment"][key] for key in ALIGNMENT},
            ALIGNMENT,
        )
        [event] = [e for e in self.service.list_component_audit_events(new_id)
                   if str(e.get("event_type") or e.get("eventType")) == "component.created"]
        details = event.get("details") or json.loads(event.get("details_json") or "{}")
        self.assertEqual(
            (details["source_component_id"], details["source_revision_id"], details["change_kind"]),
            (source_id, released_id, "create_from"),
        )
        self.assertTrue(self.service.verify_component_audit_chain(new_id)["valid"])
        self.assertEqual(self.service.part_relations.list_mates_with(new_id), [])

        # Once released, placement gives the same footprint, with the same model.
        self._release(new_id)
        self.assertIn(b"(model ", self._footprint_bytes(new_id))
        self.assertEqual(self._footprint_bytes(new_id), self._footprint_bytes(source_id))

        # A later change to the source does not reach the new part.
        self.service.attach_auxiliary_asset(
            source_id, asset_type="spice", upload_name="R.lib", payload=b"* later\n",
            target_library=f"CreateFrom_{self.token}", actor=ACTOR, expected_revision_id=released_id,
        )
        self.assertEqual(self._links(self.service.get_component(new_id)), self._links(created))

    def test_a_source_without_a_release_is_refused(self) -> None:
        draft = self._source(release=False)
        with self.assertRaises(CatalogConflict) as refused:
            self._create(
                f"NEW-{self.token}",
                source={"component_id": str(draft["id"]), "expected_revision_id": str(draft["revision_id"])},
            )
        self.assertEqual((refused.exception.code, refused.exception.status_code), ("source_not_released", 409))

    def test_a_newer_release_than_the_caller_saw_is_a_revision_conflict(self) -> None:
        source = self._source()
        with self.assertRaises(CatalogConflict) as refused:
            self._create(
                f"NEW-{self.token}",
                source={"component_id": str(source["id"]), "expected_revision_id": str(uuid.uuid4())},
            )
        self.assertEqual((refused.exception.code, refused.exception.status_code), ("revision_conflict", 412))

    def test_a_missing_source_is_not_found(self) -> None:
        with self.assertRaises(NotFound):
            self._create(
                f"NEW-{self.token}",
                source={"component_id": str(uuid.uuid4()), "expected_revision_id": str(uuid.uuid4())},
            )

    def test_an_identity_in_use_creates_nothing(self) -> None:
        source = self._source()
        files_before = self._store_files()
        with self.assertRaisesRegex(ValueError, "already exists"):
            self._create(
                f"SRC-{self.token}",
                source={"component_id": str(source["id"]), "expected_revision_id": str(source["revision_id"])},
            )
        self.assertEqual(self._store_files(), files_before)


if __name__ == "__main__":
    unittest.main()
