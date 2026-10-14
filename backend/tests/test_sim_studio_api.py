"""Simulation Studio setup API: routing, the feature flag, roles, ETags and storage in PostgreSQL."""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import FastAPI, HTTPException

from app.api import sim_studio as sim_api
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER
from app.sim_studio.service import SimStudioService
from app.sim_studio.store import LayoutStore, SetupStore
from support.postgres import requires_scratch_postgres, scratch_schema, seed_project, seed_repository
from test_sim_studio_setup import facts
from test_system_api import _request

PROJECT = SimpleNamespace(id="prj_sim", name="board", project_file="board.kicad_pro")
PROJECT_PATH = "/api/projects/prj_sim"
SETUPS = PROJECT_PATH + "/sim/a0/setups"


def _app() -> FastAPI:
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(sim_api.router, prefix="/api")
    return app


def _visible(project_id: str, role: str):
    if project_id != PROJECT.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return PROJECT


class RoutingTest(unittest.TestCase):
    def test_main_registers_the_router(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('app.include_router(sim_studio_router, prefix="/api", tags=["sim-studio"])', source)
        paths = set(_app().openapi()["paths"])
        for path in ("/api/sim/a0/catalog", "/api/sim/a0/engines",
                     "/api/projects/{project_id}/sim/a0/setups",
                     "/api/projects/{project_id}/sim/a0/setups/{setup_id}",
                     "/api/projects/{project_id}/sim/a0/setups/{setup_id}/validate",
                     "/api/projects/{project_id}/sim/a0/setups/{setup_id}/preflight"):
            self.assertIn(path, paths)

    def test_everything_is_hidden_when_the_flag_is_off(self) -> None:
        with mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", False):
            self.assertEqual(_request(_app(), "GET", "/api/sim/a0/catalog", user="admin").status, 404)
            self.assertEqual(_request(_app(), "GET", SETUPS, user="admin").status, 404)

    def test_catalog_lists_dc_drop_as_available(self) -> None:
        with mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", True):
            response = _request(_app(), "GET", "/api/sim/a0/catalog", user="viewer")
        self.assertEqual(response.status, 200)
        kinds = {entry["kind"]: entry["status"] for entry in response.json["entries"]}
        self.assertEqual(kinds["dc-drop"], "available")
        self.assertEqual(kinds["ac-pdn"], "planned")


@requires_scratch_postgres("Simulation Studio API tests")
class SetupApiTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = scratch_schema(self, "sim_api", ledgers=(WORKSPACE_LEDGER,))
        seed_repository(scratch.conn, "repo_sim")
        seed_project(scratch.conn, PROJECT.id, "repo_sim")
        scratch.conn.commit()
        service = SimStudioService(
            SetupStore(scratch.connection), facts=lambda project, commit: facts(),
            layouts=LayoutStore(scratch.connection),
        )
        for patcher in (
            mock.patch.object(settings, "PRISM_SIM_STUDIO_ENABLED", True),
            mock.patch.object(sim_api, "sim_studio", service),
            mock.patch.object(sim_api, "get_project_for_role_or_404", _visible),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = _app()

    def call(self, method: str, path: str, **kwargs):
        return _request(self.app, method, path, **kwargs)

    def draft(self) -> dict:
        response = self.call("POST", SETUPS, body={"kind": "dc-drop", "name": "Max load"})
        self.assertEqual(response.status, 201, response.text)
        self.assertEqual(response.headers["etag"], response.json["etag"])
        return response.json

    def test_draft_read_and_list(self) -> None:
        record = self.draft()
        self.assertEqual(record["revision"], 1)
        self.assertEqual(record["setup"]["rails"][0]["inferred"], True)
        self.assertEqual(record["source"], {"project_path": "board.kicad_pro"})
        read = self.call("GET", f"{SETUPS}/{record['setup_id']}", user="viewer")
        self.assertEqual((read.status, read.json["setup"]), (200, record["setup"]))
        listed = self.call("GET", SETUPS, user="viewer").json
        self.assertEqual([item["setup_id"] for item in listed], [record["setup_id"]])

    def test_roles(self) -> None:
        self.assertEqual(self.call("POST", SETUPS, body={"kind": "dc-drop", "name": "x"}, user="viewer").status, 403)
        record = self.draft()
        path = f"{SETUPS}/{record['setup_id']}"
        self.assertEqual(self.call("POST", path + "/validate", user="viewer").status, 200)
        response = self.call("PATCH", path, body=[], headers={"If-Match": record["etag"]}, user="viewer")
        self.assertEqual(response.status, 403)

    def test_patch_is_guarded_and_validated(self) -> None:
        record = self.draft()
        path = f"{SETUPS}/{record['setup_id']}"
        operations = [
            {"op": "add", "path": "/terminals/-", "value": {"id": "vrm", "positive": ["main:U5.2"], "reference": ["main:U5.3"]}},
            {"op": "add", "path": "/terminals/-", "value": {"id": "mcu", "positive": ["main:U1.12"], "reference": ["main:U1.13"]}},
            {"op": "add", "path": "/sources/-", "value": {"id": "vrm", "rail": "3v3", "terminal": "vrm"}},
            {"op": "add", "path": "/loads/-", "value": {"id": "mcu", "rail": "3v3", "terminal": "mcu", "current_a": 0.5, "distribution": "uniform"}},
            {"op": "replace", "path": "/analyses/0/rails", "value": ["3v3"]},
        ]
        self.assertEqual(self.call("PATCH", path, body=operations).status, 428)
        patched = self.call("PATCH", path, body=operations, headers={"If-Match": record["etag"]})
        self.assertEqual(patched.status, 200, patched.text)
        self.assertEqual(patched.json["revision"], 2)
        stale = self.call("PATCH", path, body=operations, headers={"If-Match": record["etag"]})
        self.assertEqual(stale.status, 412)
        self.assertEqual(stale.headers["etag"], patched.json["etag"])
        bad = self.call("PATCH", path, body=[{"op": "replace", "path": "/loads/0/current_a", "value": -1}],
                        headers={"If-Match": patched.json["etag"]})
        self.assertEqual((bad.status, bad.json["code"]), (422, "sim_setup_invalid"))
        self.assertIn("/loads/0/current_a", bad.json["detail"])
        broken = self.call("PATCH", path, body=[{"op": "remove", "path": "/nope"}], headers={"If-Match": patched.json["etag"]})
        self.assertEqual((broken.status, broken.json["code"]), (422, "sim_setup_patch_failed"))
        self.assertEqual(self.call("GET", path).json["revision"], 2)

        report = self.call("POST", path + "/preflight", user="viewer").json
        self.assertEqual(report["ok"], True, report)
        self.assertEqual(report["stage"], "preflight")

    def test_replace_and_delete(self) -> None:
        record = self.draft()
        path = f"{SETUPS}/{record['setup_id']}"
        document = dict(record["setup"], name="Idle")
        replaced = self.call("PUT", path, body=document, headers={"If-Match": record["etag"]})
        self.assertEqual((replaced.status, replaced.json["setup"]["name"]), (200, "Idle"))
        self.assertEqual(self.call("DELETE", path, headers={"If-Match": record["etag"]}).status, 412)
        self.assertEqual(self.call("DELETE", path, headers={"If-Match": replaced.json["etag"]}).status, 204)
        self.assertEqual(self.call("GET", path).status, 404)

    def test_validate_reports_what_is_missing(self) -> None:
        record = self.draft()
        report = self.call("POST", f"{SETUPS}/{record['setup_id']}/validate").json
        self.assertEqual(report["ok"], False)
        self.assertEqual([issue["code"] for issue in report["issues"]], ["analysis-without-rails"])

    def test_power_tree_and_layout(self) -> None:
        tree = self.call("GET", PROJECT_PATH + "/sim/a0/power-tree", user="viewer")
        self.assertEqual(tree.status, 200, tree.text)
        self.assertEqual(set(tree.json), {"rails", "terminals", "sources", "loads", "converters", "analysis_rails", "notes"})
        self.assertEqual(self.call("GET", PROJECT_PATH + "/sim/a0/power-tree?commit=nope", user="viewer").status, 422)
        record = self.draft()
        path = f"{SETUPS}/{record['setup_id']}/layout"
        self.assertEqual(self.call("GET", path, user="viewer").json, {})
        layout = {"nodes": {"rail:3v3": {"x": 10, "y": 20}}}
        self.assertEqual(self.call("PUT", path, body=layout, user="viewer").status, 403)
        self.assertEqual(self.call("PUT", path, body=layout).json, layout)
        self.assertEqual(self.call("GET", path, user="viewer").json, layout)
        self.assertEqual(self.call("GET", f"{SETUPS}/{record['setup_id']}", user="viewer").json["revision"], 1)
        self.assertEqual(self.call("GET", f"{SETUPS}/nope/layout", user="viewer").status, 404)

    def test_unavailable_kind_is_refused(self) -> None:
        response = self.call("POST", SETUPS, body={"kind": "ac-pdn", "name": "x"})
        self.assertEqual((response.status, response.json["code"]), (422, "sim_kind_unavailable"))


if __name__ == "__main__":
    unittest.main()
