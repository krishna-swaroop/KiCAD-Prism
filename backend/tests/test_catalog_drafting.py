"""Draft assets: staged uploads, draft checks, attach and reuse (ADR scripting-and-mcp §12).

The routes run against a mocked catalog service, so what is under test is the
contract a JSON-only client meets: a signed upload slot, one source per call,
the ``If-Match`` it forwards, and the stage route's token scopes. The draft
check runs real ``kicad-cli`` only when it is installed.
"""

from __future__ import annotations

import io
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import catalog_admin, catalog_drafting  # noqa: E402
from app.core import errors, policy  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import AuthenticatedUser, require_catalog_reader, require_catalog_writer  # noqa: E402
from app.services.catalog import draft_checks, staged_uploads, workflow_policy  # noqa: E402
from app.services.catalog.staged_uploads import StagedUploadError, StagedUploads  # noqa: E402
from app.services.kicad_tools import ToolResult, locate_kicad_cli  # noqa: E402
from test_catalog_typed_responses import _component  # noqa: E402

SECRET = "test-secret-at-least-32-characters-long-x"
DESIGNER = AuthenticatedUser(email="designer@example.test", name="Designer", role="designer")

SYMBOL = """(kicad_symbol_lib (version 20241209) (generator "tests")
  (symbol "BUF1" (pin_names (offset 1.016)) (in_bom yes) (on_board yes)
    (property "Reference" "U" (at 0 5.08 0) (effects (font (size 1.27 1.27))))
    (property "Value" "BUF1" (at 0 -5.08 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "BUF1_0_1"
      (rectangle (start -5.08 2.54) (end 5.08 -2.54) (stroke (width 0.254) (type default)) (fill (type background)))
    )
    (symbol "BUF1_1_1"
      (pin input line (at -7.62 0 0) (length 2.54) (name "A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin output line (at 7.62 0 180) (length 2.54) (name "Y" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )
)
"""

FOOTPRINT = """(footprint "TEST_2PAD" (version 20241229) (generator "tests") (layer "F.Cu")
  (property "Reference" "REF**" (at 0 -2 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (property "Value" "TEST_2PAD" (at 0 2 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
  (attr smd)
  (fp_rect (start -1.5 -1) (end 1.5 1) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd"))
  (pad "1" smd roundrect (at -0.8 0) (size 0.8 1) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "2" smd roundrect (at 0.8 0) (size 0.8 1) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
)
"""


DERIVED_LIBRARY = SYMBOL.replace(
    "\n)\n",
    """
  (symbol "BUF1X" (extends "BUF1")
    (property "Reference" "U" (at 0 5.08 0) (effects (font (size 1.27 1.27))))
    (property "Value" "BUF1X" (at 0 -5.08 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
  )
)
""",
)


class DerivedSymbolExtractionTests(unittest.TestCase):
    def test_a_derived_symbol_is_stored_flattened(self) -> None:
        from app.services.catalog.asset_files import CatalogAssetFiles
        from app.services.kicad_library_reader import symbol_names

        stored = CatalogAssetFiles.single_symbol_payload(DERIVED_LIBRARY, "BUF1X").decode()
        self.assertNotIn("(extends", stored)
        self.assertEqual(symbol_names(stored), ["BUF1X"])
        self.assertIn('(symbol "BUF1X_1_1"', stored)
        self.assertIn('(name "Y"', stored)
        self.assertIn('"Value" "BUF1X"', stored)

    def test_a_missing_parent_is_refused(self) -> None:
        from app.services.catalog.asset_files import CatalogAssetFiles

        orphan = DERIVED_LIBRARY.replace('(extends "BUF1")', '(extends "GONE")')
        with self.assertRaises(ValueError):
            CatalogAssetFiles.single_symbol_payload(orphan, "BUF1X")

    def test_a_plain_symbol_is_unchanged(self) -> None:
        from app.services.catalog.asset_files import CatalogAssetFiles

        stored = CatalogAssetFiles.single_symbol_payload(DERIVED_LIBRARY, "BUF1").decode()
        self.assertIn('(symbol "BUF1_1_1"', stored)
        self.assertNotIn("BUF1X", stored)


class StagedUploadTests(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(settings, "SESSION_SECRET", SECRET)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.uploads = StagedUploads(Path(self.tmp.name))

    def _write(self, slot: dict, data: bytes = b"ISO-10303-21;") -> dict:
        return self.uploads.write(
            slot["upload_id"], expires_at=slot["expires_at"], signature=slot["signature"], stream=io.BytesIO(data)
        )

    def test_a_slot_takes_one_write_and_reads_back_for_its_owner(self) -> None:
        slot = self.uploads.open(owner="a@example.test", file_name="part model.step")
        receipt = self._write(slot)
        self.assertEqual(receipt["size_bytes"], 13)
        staged = self.uploads.read(slot["upload_id"], owner="a@example.test")
        self.assertEqual((staged.file_name, staged.payload), ("part_model.step", b"ISO-10303-21;"))
        with self.assertRaises(StagedUploadError) as raised:
            self._write(slot)
        self.assertEqual(raised.exception.status_code, 409)

    def test_another_person_cannot_read_a_slot(self) -> None:
        slot = self.uploads.open(owner="a@example.test", file_name="x.step")
        self._write(slot)
        with self.assertRaises(StagedUploadError) as raised:
            self.uploads.read(slot["upload_id"], owner="b@example.test")
        self.assertEqual(raised.exception.status_code, 404)

    def test_a_wrong_or_expired_signature_is_refused(self) -> None:
        slot = self.uploads.open(owner="a@example.test", file_name="x.step")
        with self.assertRaises(StagedUploadError) as raised:
            self._write({**slot, "signature": "forged"})
        self.assertEqual(raised.exception.status_code, 403)
        with self.assertRaises(StagedUploadError) as raised:
            self._write({**slot, "expires_at": int(time.time()) - 1})
        self.assertEqual(raised.exception.status_code, 403)

    def test_an_oversized_or_empty_upload_leaves_the_slot_empty(self) -> None:
        slot = self.uploads.open(owner="a@example.test", file_name="x.step")
        with patch.object(staged_uploads, "UPLOAD_MAX_BYTES", 4):
            with self.assertRaises(StagedUploadError) as raised:
                self._write(slot, b"12345")
        self.assertEqual(raised.exception.status_code, 413)
        with self.assertRaises(StagedUploadError):
            self._write(slot, b"")
        with self.assertRaises(StagedUploadError) as raised:
            self.uploads.read(slot["upload_id"], owner="a@example.test")
        self.assertEqual(raised.exception.status_code, 409)

    def test_ids_are_checked_before_any_path_is_built(self) -> None:
        with self.assertRaises(StagedUploadError):
            self.uploads.read("../../etc", owner="a@example.test")

    def test_expired_slots_are_purged_when_a_new_one_opens(self) -> None:
        old = self.uploads.open(owner="a@example.test", file_name="x.step")
        self.uploads.purge_expired(now=time.time() + staged_uploads.UPLOAD_TTL_SECONDS + 1)
        self.assertFalse((Path(self.tmp.name) / old["upload_id"]).exists())


class UnbalancedTests(unittest.TestCase):
    def test_complete_files_pass(self) -> None:
        self.assertEqual(draft_checks.unbalanced(SYMBOL), "")
        self.assertEqual(draft_checks.unbalanced('(a "x)\\"(" (b))'), "")

    def test_truncation_and_stray_parentheses_are_named(self) -> None:
        self.assertIn("2 unclosed", draft_checks.unbalanced('(footprint "F" (pad "1"'))
        self.assertIn("line 2", draft_checks.unbalanced("(a)\n)"))
        self.assertIn("quoted string", draft_checks.unbalanced('(a "open'))


class StubKicad:
    """Answers every kicad-cli call with ``result`` and records the arguments."""

    name = "kicad-cli"

    def __init__(self, result: ToolResult) -> None:
        self.result = result
        self.calls: list[list[str]] = []

    def run(self, args, *, timeout, cwd=None, env=None, tee=False) -> ToolResult:
        self.calls.append(list(args))
        return self.result


class DraftCheckTests(unittest.TestCase):
    def test_a_truncated_file_never_reaches_kicad(self) -> None:
        kicad = StubKicad(ToolResult(0))
        result = draft_checks.check_draft(
            kicad, asset_type="footprint", file_name="f.kicad_mod", payload=b'(footprint "F" (pad'
        )
        self.assertFalse(result["readable"])
        self.assertIn("truncated", result["kicad_message"])
        self.assertEqual(kicad.calls, [])

    def test_kicad_s_read_error_is_returned(self) -> None:
        kicad = StubKicad(ToolResult(2, stderr="Unable to load library"))
        result = draft_checks.check_draft(
            kicad, asset_type="symbol", file_name="s.kicad_sym", payload=SYMBOL.encode()
        )
        self.assertFalse(result["readable"])
        self.assertEqual(result["kicad_message"], "Unable to load library")
        self.assertEqual(kicad.calls[0][:3], ["sym", "upgrade", "--force"])

    def test_only_symbols_and_footprints_are_checked(self) -> None:
        with self.assertRaises(ValueError):
            draft_checks.check_draft(StubKicad(ToolResult(0)), asset_type="3dmodel", file_name="m.step", payload=b"x")


def _kicad_and_cairo() -> bool:
    if locate_kicad_cli() is None:
        return False
    try:
        import cairosvg  # noqa: F401
    except Exception:  # noqa: BLE001 - native Cairo missing is an environment skip
        return False
    return True


@unittest.skipUnless(_kicad_and_cairo(), "kicad-cli and cairosvg are required")
class DraftCheckWithKicadTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.services.kicad_tools import kicad_cli

        self.kicad = kicad_cli()

    def test_a_symbol_renders_one_png_per_unit(self) -> None:
        result = draft_checks.check_draft(
            self.kicad, asset_type="symbol", file_name="buf.kicad_sym", payload=SYMBOL.encode()
        )
        self.assertTrue(result["readable"], result["kicad_message"])
        self.assertEqual((result["name"], result["names"]), ("BUF1", ["BUF1"]))
        self.assertEqual([preview["unit"] for preview in result["previews"]], [1])
        self.assertIn(result["klc"]["status"], {"passed", "warning", "failed", "skipped"})

    def test_a_footprint_renders(self) -> None:
        result = draft_checks.check_draft(
            self.kicad, asset_type="footprint", file_name="f.kicad_mod", payload=FOOTPRINT.encode()
        )
        self.assertTrue(result["readable"], result["kicad_message"])
        self.assertEqual(result["name"], "TEST_2PAD")
        self.assertEqual(len(result["previews"]), 1)

    def test_a_derived_symbol_is_checked_as_it_would_be_stored(self) -> None:
        result = draft_checks.check_draft(
            self.kicad, asset_type="symbol", file_name="lib.kicad_sym", payload=DERIVED_LIBRARY.encode(), name="BUF1X"
        )
        self.assertTrue(result["readable"], result["kicad_message"])
        self.assertEqual(result["names"], ["BUF1", "BUF1X"])
        self.assertEqual(len(result["previews"]), 1)

    def test_an_unknown_symbol_name_is_reported(self) -> None:
        result = draft_checks.check_draft(
            self.kicad, asset_type="symbol", file_name="buf.kicad_sym", payload=SYMBOL.encode(), name="NOPE"
        )
        self.assertFalse(result["readable"])
        self.assertIn("NOPE", result["kicad_message"])


class DraftRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        for patcher in (patch.object(settings, "SESSION_SECRET", SECRET), patch.object(settings, "PUBLIC_BASE_URL", "")):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.service = MagicMock()
        self.service.runtime.store_root = Path(self.tmp.name) / "components"
        patcher = patch.object(catalog_drafting, "catalog_service", self.service)
        patcher.start()
        self.addCleanup(patcher.stop)
        app = FastAPI()
        errors.install_error_handlers(app)
        app.include_router(catalog_drafting.router)
        self.user = DESIGNER
        app.dependency_overrides[require_catalog_writer] = lambda: self.user
        self.client = TestClient(app, raise_server_exceptions=False)

    def _staged(self, data: bytes, file_name: str = "model.step") -> str:
        slot = self.client.post("/api/catalog/uploads", json={"file_name": file_name})
        self.assertEqual(slot.status_code, 201, slot.text)
        body = slot.json()
        self.assertTrue(body["upload_url"].startswith("http://testserver/api/v1/catalog/uploads/"))
        query = parse_qs(urlparse(body["upload_path"]).query)
        written = self.client.put(
            f"/api/catalog/uploads/{body['upload_id']}",
            params={"exp": query["exp"][0], "sig": query["sig"][0]},
            content=data,
        )
        self.assertEqual(written.status_code, 200, written.text)
        self.assertEqual(written.json()["size_bytes"], len(data))
        return body["upload_id"]

    def test_a_staged_model_attaches_and_its_slot_is_discarded(self) -> None:
        upload_id = self._staged(b"ISO-10303-21;")
        self.service.attach_auxiliary_asset.return_value = {"component": _component()}
        response = self.client.post(
            "/api/catalog/components/cmp-1/assets/3dmodel/attach",
            json={"upload_id": upload_id},
            headers={"If-Match": '"component:cmp-1:rev-7"'},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["mode"], "imported")
        self.assertEqual(response.json()["component"]["id"], "cmp-1")
        kwargs = self.service.attach_auxiliary_asset.call_args.kwargs
        self.assertEqual(
            (kwargs["payload"], kwargs["upload_name"], kwargs["expected_revision_id"], kwargs["actor"]),
            (b"ISO-10303-21;", "model.step", "rev-7", DESIGNER.email),
        )
        again = self.client.post(
            "/api/catalog/components/cmp-1/assets/3dmodel/attach", json={"upload_id": upload_id}
        )
        self.assertEqual(again.status_code, 404)

    def test_an_inline_symbol_goes_through_the_symbol_import(self) -> None:
        self.service.import_symbol_library.return_value = {
            "mode": "imported", "discovered_symbols": ["BUF1"], "selected_symbol": "BUF1",
            "component": _component(),
        }
        response = self.client.post(
            "/api/catalog/components/cmp-1/assets/symbol/attach",
            json={"content": SYMBOL, "file_name": "buf.kicad_sym", "counterpart_asset_id": "fp-1"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["selected"], "BUF1")
        kwargs = self.service.import_symbol_library.call_args.kwargs
        self.assertEqual(kwargs["payload"], SYMBOL.encode())
        self.assertEqual(kwargs["counterpart_asset_id"], "fp-1")
        self.assertEqual(kwargs["target_library"], "cmp-1")
        self.assertEqual(kwargs["expected_revision_id"], "")

    def test_exactly_one_source_is_required(self) -> None:
        for body in ({}, {"content": "x", "upload_id": "upl_" + "0" * 32}):
            with self.subTest(body=body):
                response = self.client.post("/api/catalog/components/cmp-1/assets/footprint/attach", json=body)
                self.assertEqual(response.status_code, 400)

    def test_another_person_s_upload_is_not_found(self) -> None:
        upload_id = self._staged(b"ISO-10303-21;")
        self.user = AuthenticatedUser(email="other@example.test", name="Other", role="designer")
        response = self.client.post(
            "/api/catalog/components/cmp-1/assets/3dmodel/attach", json={"upload_id": upload_id}
        )
        self.assertEqual(response.status_code, 404)

    def test_a_forged_upload_signature_is_refused(self) -> None:
        slot = self.client.post("/api/catalog/uploads", json={"file_name": "x.step"}).json()
        response = self.client.put(
            f"/api/catalog/uploads/{slot['upload_id']}", params={"exp": slot["expires_at"], "sig": "nope"}, content=b"x"
        )
        self.assertEqual(response.status_code, 403)

    def test_the_check_route_runs_the_draft_check(self) -> None:
        with patch.object(catalog_drafting, "check_draft", return_value={
            "asset_type": "footprint", "name": "F", "names": ["F"], "name_count": 1, "sha256": "s", "readable": False,
            "kicad_message": "bad", "klc": None, "previews": [],
        }) as checked, patch.object(catalog_drafting, "kicad_cli"):
            response = self.client.post(
                "/api/catalog/drafts/check", json={"asset_type": "footprint", "content": FOOTPRINT}
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(checked.call_args.kwargs["file_name"], "draft.kicad_mod")
        self.assertEqual(checked.call_args.kwargs["payload"], FOOTPRINT.encode())

    def test_reuse_links_the_stored_file_by_its_store_path(self) -> None:
        root = Path(self.tmp.name) / "components" / "footprints"
        self.service.get_asset_by_id.return_value = {
            "asset_type": "footprint",
            "canonical_path": str(root / "Prism_Footprints.pretty" / "R_0603.kicad_mod"),
            "target_library": "Prism_Footprints",
            "target_name": "R_0603",
        }
        self.service.link_library_asset.return_value = {"component": _component()}
        with patch.object(catalog_drafting.CatalogAssetFiles, "asset_root", return_value=root):
            response = self.client.post(
                "/api/catalog/components/cmp-1/assets/footprint/reuse", json={"asset_id": "a-1"}
            )
        self.assertEqual(response.status_code, 200, response.text)
        args = self.service.link_library_asset.call_args
        self.assertEqual(
            args.args, ("cmp-1", "footprint", "Prism_Footprints.pretty/R_0603.kicad_mod", "Prism_Footprints", "R_0603")
        )

    def test_reuse_refuses_an_asset_of_another_type(self) -> None:
        self.service.get_asset_by_id.return_value = {"asset_type": "symbol", "canonical_path": "/x"}
        response = self.client.post(
            "/api/catalog/components/cmp-1/assets/footprint/reuse", json={"asset_id": "a-1"}
        )
        self.assertEqual(response.status_code, 404)


class StageScopeTests(unittest.TestCase):
    """Moving a component's stage needs catalog:write; a sign-off needs catalog:qa."""

    def setUp(self) -> None:
        self.service = MagicMock()
        self.service.set_release_status.return_value = _component()
        patcher = patch.object(catalog_admin, "catalog_service", self.service)
        patcher.start()
        self.addCleanup(patcher.stop)
        app = FastAPI()
        errors.install_error_handlers(app)
        app.include_router(catalog_admin.router)
        self.app = app

    def move(self, user: AuthenticatedUser, current: str, stage: str) -> int:
        self.service.get_component.return_value = {"id": "cmp-1", "workflow_stage": current}
        self.app.dependency_overrides[require_catalog_reader] = lambda: user
        client = TestClient(self.app, raise_server_exceptions=False)
        return client.post("/api/catalog/components/cmp-1/release", json={"workflow_stage": stage}).status_code

    def bearer(self, role: str, scopes: list[str], auth_type: str = "pat") -> AuthenticatedUser:
        return AuthenticatedUser(
            email=f"{role}@example.test", name=role, role=role, auth_type=auth_type, scopes=scopes
        )

    def test_a_read_only_token_cannot_move_a_component(self) -> None:
        self.assertEqual(self.move(self.bearer("designer", ["api:read"]), "open", "in_progress"), 403)

    def test_a_catalog_write_token_sends_work_to_review(self) -> None:
        self.assertEqual(self.move(self.bearer("designer", ["catalog:write"]), "open", "in_progress"), 200)
        self.assertEqual(self.move(self.bearer("designer", ["catalog:write"]), "in_progress", "qa_review"), 200)

    def test_a_sign_off_needs_catalog_qa(self) -> None:
        self.assertEqual(self.move(self.bearer("qa", ["catalog:write"]), "qa_review", "done"), 403)
        self.assertEqual(self.move(self.bearer("qa", ["catalog:qa"]), "qa_review", "done"), 200)

    def test_an_mcp_client_never_signs_off(self) -> None:
        user = self.bearer("admin", ["catalog:write", "catalog:qa"], auth_type=policy.MCP_AUTH_TYPE)
        self.assertEqual(self.move(user, "qa_review", "done"), 403)
        self.assertEqual(self.move(user, "done", "released"), 403)

    def test_a_session_keeps_its_role_rules(self) -> None:
        self.assertEqual(self.move(DESIGNER, "done", "released"), 200)
        self.assertEqual(self.move(DESIGNER, "qa_review", "done"), 403)

    def test_the_action_for_each_stage(self) -> None:
        self.assertEqual(
            {stage: workflow_policy.transition_action(stage) for stage in workflow_policy.WORKFLOW_STAGES},
            {
                "open": "catalog_write",
                "in_progress": "catalog_write",
                "qa_review": "catalog_write",
                "done": "catalog_qa",
                "released": "catalog_qa",
                "archived": "catalog_write",
            },
        )


if __name__ == "__main__":
    unittest.main()
