"""The Manufacturing HTTP surface: request validation, auth wiring, evidence rules.

Route handlers are called directly (the pattern ``test_release_studio_api.py`` uses)
so behaviour is exercised without standing up OIDC or a database; the service layer is
mocked.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402


@dataclass
class _User:
    email: str = "designer@x"
    role: str = "designer"
    auth_type: str = "session"
    scopes: list = field(default_factory=list)


def _run(coro):
    return asyncio.run(coro)


class ManufacturingRequestValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.api import manufacturing as api

        self.api = api

    def test_manufacturer_name_required(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.ManufacturerRequest(name="")

    def test_run_quantity_cannot_be_negative(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.RunRequest(project_id="prj_1", quantity_ordered=-1)

    def test_defect_affects_at_least_one_unit(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.DefectRequest(quantity_affected=0)

    def test_run_update_omits_unset_fields(self) -> None:
        # exclude_none is how the router avoids overwriting untouched columns.
        payload = self.api.RunUpdateRequest(notes="ordered").model_dump(exclude_none=True)
        self.assertEqual(payload, {"notes": "ordered"})

    def test_status_is_not_part_of_the_general_run_update(self) -> None:
        # Status moved to its own QA-gated endpoint, so it is not a general edit field.
        self.assertNotIn("status", self.api.RunUpdateRequest.model_fields)
        self.assertIn("status", self.api.RunStatusRequest.model_fields)

    def test_run_carries_an_optional_spec_id(self) -> None:
        self.assertIn("spec_id", self.api.RunRequest.model_fields)

    def test_attach_requires_a_manufacturer_id(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.AttachManufacturerRequest(manufacturer_id="")

    def test_project_spec_create_requires_name_and_manufacturer(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.ProjectSpecCreateRequest(manufacturer_id="m1", name="")
        with self.assertRaises(ValidationError):
            self.api.ProjectSpecCreateRequest(manufacturer_id="", name="Default")

    def test_manufacturer_carries_capabilities(self) -> None:
        req = self.api.ManufacturerRequest(name="JLCPCB", capabilities={"min_track_width": 0.127})
        self.assertEqual(req.capabilities, {"min_track_width": 0.127})
        # Defaults to an empty dict when omitted.
        self.assertEqual(self.api.ManufacturerRequest(name="X").capabilities, {})


class ManufacturingRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.api import manufacturing as api

        self.api = api

    def test_create_run_records_the_caller_as_creator(self) -> None:
        with patch.object(self.api.mfg, "create_run", return_value="run_new") as create:
            request = self.api.RunRequest(project_id="prj_1", quantity_ordered=50)
            result = _run(self.api.create_run(request, user=_User(email="me@x")))
        self.assertEqual(result, {"id": "run_new"})
        self.assertEqual(create.call_args.kwargs["created_by"], "me@x")

    def test_create_run_forwards_spec_id_and_lets_service_freeze(self) -> None:
        with patch.object(self.api.mfg, "create_run", return_value="run_new") as create:
            request = self.api.RunRequest(project_id="prj_1", manufacturer_id="m1", spec_id="spec_1", quantity_ordered=5)
            _run(self.api.create_run(request, user=_User()))
        self.assertEqual(create.call_args.kwargs["spec_id"], "spec_1")
        # An empty snapshot becomes None so the service freezes the chosen spec.
        self.assertIsNone(create.call_args.kwargs["spec_snapshot"])

    def test_attach_manufacturer_calls_through(self) -> None:
        with patch.object(self.api.mfg, "attach_manufacturer", return_value=True) as attach:
            request = self.api.AttachManufacturerRequest(manufacturer_id="m1")
            result = _run(self.api.attach_manufacturer("prj_1", request))
        self.assertEqual(result, {"status": "success"})
        self.assertEqual(attach.call_args.args, ("prj_1", "m1"))

    def test_detach_missing_link_404(self) -> None:
        with patch.object(self.api.mfg, "detach_manufacturer", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.detach_manufacturer("prj_1", "m1"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_create_project_spec_records_the_author(self) -> None:
        with patch.object(self.api.mfg, "create_project_spec", return_value="spec_new") as create:
            request = self.api.ProjectSpecCreateRequest(manufacturer_id="m1", name="Default")
            result = _run(self.api.create_project_spec("prj_1", request, user=_User(email="d@x")))
        self.assertEqual(result, {"id": "spec_new"})
        self.assertEqual(create.call_args.kwargs["updated_by"], "d@x")

    def test_get_project_spec_404_when_absent(self) -> None:
        with patch.object(self.api.mfg, "get_project_spec", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.get_project_spec("spec_missing"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_create_manufacturer_forwards_capabilities(self) -> None:
        with patch.object(self.api.mfg, "create_manufacturer", return_value="mfr_new") as create:
            request = self.api.ManufacturerRequest(name="JLCPCB", capabilities={"min_track_width": 0.127})
            _run(self.api.create_manufacturer(request))
        # capabilities is the 5th positional arg to the service.
        self.assertEqual(create.call_args.args[4], {"min_track_width": 0.127})

    def test_pcb_rule_fields_endpoint_returns_the_schema(self) -> None:
        result = _run(self.api.get_pcb_rule_fields())
        keys = {f["key"] for f in result["fields"]}
        self.assertIn("min_track_width", keys)

    def test_extract_pcb_rules_reads_the_project_board(self) -> None:
        project = {"pcb_rel": "board.kicad_pcb", "path": "/tmp/proj"}
        with patch.object(self.api.workspace, "get_project_by_id", return_value=project), patch.object(
            self.api.pcb_rules_service, "extract_pcb_rules", return_value={"min_track_width": 0.1}
        ):
            result = _run(self.api.extract_pcb_rules("prj_1"))
        self.assertEqual(result, {"rules": {"min_track_width": 0.1}})

    def test_extract_pcb_rules_404_for_unknown_project(self) -> None:
        with patch.object(self.api.workspace, "get_project_by_id", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.extract_pcb_rules("prj_missing"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_service_error_becomes_400(self) -> None:
        from app.services import manufacturing_service as mfg

        with patch.object(self.api.mfg, "create_run", side_effect=mfg.ManufacturingError("nope")):
            request = self.api.RunRequest(project_id="prj_missing", quantity_ordered=1)
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.create_run(request, user=_User()))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_get_run_404_when_absent(self) -> None:
        with patch.object(self.api.mfg, "get_run", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.get_run("run_x"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_log_defect_records_the_caller_as_logger(self) -> None:
        with patch.object(self.api.mfg, "log_defect", return_value="def_1") as log:
            request = self.api.DefectRequest(category="soldering", severity="major", quantity_affected=3)
            result = _run(self.api.log_defect("run_1", request, user=_User(email="qa@x", role="qa")))
        self.assertEqual(result, {"id": "def_1"})
        self.assertEqual(log.call_args.kwargs["logged_by"], "qa@x")

    def test_delete_run_also_drops_evidence(self) -> None:
        with patch.object(self.api.mfg, "delete_run", return_value=True), \
             patch.object(self.api.derived_assets, "discard_run_evidence") as discard:
            _run(self.api.delete_run("run_1"))
        discard.assert_called_once_with("run_1")


class EvidenceUploadTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.api import manufacturing as api

        self.api = api

    def _upload(self, *, content_type: str, data: bytes = b"x"):
        class _File:
            def __init__(self, ct: str, payload: bytes):
                self.content_type = ct
                self.filename = "evidence.bin"
                self._payload = payload

            async def read(self, _n=None):
                return self._payload

        return _File(content_type, data)

    def test_rejects_disallowed_media_type(self) -> None:
        from app.services import derived_assets

        defect = {"run_id": "run_1", "evidence": []}
        with patch.object(self.api.mfg, "get_defect", return_value=defect), \
             patch.object(self.api.derived_assets, "store_evidence",
                          side_effect=derived_assets.EvidenceError("bad type")):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.upload_evidence(
                    "def_1", file=self._upload(content_type="text/html"), user=_User()
                ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_stored_evidence_is_appended_to_the_defect(self) -> None:
        defect = {"run_id": "run_1", "evidence": []}
        with patch.object(self.api.mfg, "get_defect", return_value=defect), \
             patch.object(self.api.derived_assets, "store_evidence",
                          return_value=("digest123", "image/jpeg", 42)), \
             patch.object(self.api.mfg, "set_defect_evidence") as save:
            descriptor = _run(self.api.upload_evidence(
                "def_1", file=self._upload(content_type="image/jpeg"), user=_User()
            ))
        self.assertEqual(descriptor["kind"], "photo")
        self.assertEqual(descriptor["digest"], "digest123")
        # The router persisted the appended descriptor list.
        saved_list = save.call_args.args[1]
        self.assertEqual(len(saved_list), 1)

    def test_pdf_is_classified_as_a_report(self) -> None:
        defect = {"run_id": "run_1", "evidence": []}
        with patch.object(self.api.mfg, "get_defect", return_value=defect), \
             patch.object(self.api.derived_assets, "store_evidence",
                          return_value=("d", "application/pdf", 10)), \
             patch.object(self.api.mfg, "set_defect_evidence"):
            descriptor = _run(self.api.upload_evidence(
                "def_1", file=self._upload(content_type="application/pdf"), user=_User()
            ))
        self.assertEqual(descriptor["kind"], "report")

    def test_upload_to_missing_defect_404(self) -> None:
        with patch.object(self.api.mfg, "get_defect", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                _run(self.api.upload_evidence(
                    "def_x", file=self._upload(content_type="image/png"), user=_User()
                ))
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
