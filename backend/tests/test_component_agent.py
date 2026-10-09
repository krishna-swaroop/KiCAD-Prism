from __future__ import annotations
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
import asyncio
import json
from types import SimpleNamespace
from app.api import component_agent as api
from app.core.security import AuthenticatedUser, get_current_user
from app.services.catalog.component_candidates import checked_candidates
from app.services.catalog.component_agent import run_component_agent
from app.services.job_runtime import JobCancelled


class TestClient:
    """Exercise ASGI routes without adding a second HTTP client dependency."""
    def __init__(self, app): self.app = app
    def request(self, method, path, json=None, headers=None):
        import json as codec
        messages = []
        raw = codec.dumps(json).encode() if json is not None else b""
        async def receive(): return {"type": "http.request", "body": raw, "more_body": False}
        async def send(message): messages.append(message)
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "", "headers": [(b"content-type", b"application/json")] + [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()], "client": ("127.0.0.1", 1234), "server": ("test", 80)}
        asyncio.run(self.app(scope, receive, send))
        status = next(m["status"] for m in messages if m["type"] == "http.response.start")
        content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
        return SimpleNamespace(status_code=status, json=lambda: codec.loads(content))
    def post(self, path, **kwargs): return self.request("POST", path, **kwargs)
    def get(self, path, **kwargs): return self.request("GET", path, **kwargs)


def spec():
    evidence = {"source_id": "ds", "page": 1}
    return {"schema_version": "component-spec/v1", "identity": {"manufacturer": "Test", "mpn": "TEST-4", "package_variant": "QFN"},
            "sources": [{"id": "ds", "url": "https://example.com/ds.pdf", "sha256": "a" * 64}],
            "pins": [{"number": str(i), "name": f"PIN{i}", "electrical_type": "input", "evidence": evidence} for i in range(1, 5)],
            "units": [{"name": "I/O", "pin_numbers": ["1", "2"]}, {"name": "Power", "pin_numbers": ["3", "4"]}],
            "package": {"family": "QFN", "body_x_mm": 3, "body_y_mm": 3, "pitch_mm": .5, "evidence": {key: evidence for key in ("body_x_mm", "body_y_mm", "pitch_mm")}},
            "pads": [{"number": str(i), "kind": "electrical", "x_mm": (-1.5 if i < 3 else 1.5), "y_mm": (i % 2) * .75, "shape": "rect", "size_x_mm": .4, "size_y_mm": .5,
                      "size_evidence": {"size_x_mm": evidence, "size_y_mm": evidence}, "evidence": evidence} for i in range(1, 5)], "metadata": {}}


class CandidateTests(unittest.TestCase):
    def test_compact_single_unit_keeps_every_terminal_when_grouping_sides(self):
        candidate = spec()
        candidate["units"] = [{"name": "Main", "pin_numbers": ["1", "2", "3", "4"]}]
        for pin, name, electrical_type in zip(candidate["pins"], ["CTRL", "FLT", "IN", "GND"], ["input", "open_collector", "power_in", "power_in"]):
            pin.update(name=name, electrical_type=electrical_type)
        output = checked_candidates(candidate)
        text = output["files"]["symbol"]["content"]
        self.assertFalse(output["findings"])
        self.assertNotIn('"TEST-4_2_1"', text)
        self.assertEqual(text.count('(pin '), 4)
        for i in range(1, 5):
            self.assertEqual(text.count(f'(number "{i}"'), 1)

    def test_deterministic_multiunit_candidate_preserves_every_pin(self):
        output = checked_candidates(spec())
        self.assertFalse(output["findings"])
        self.assertEqual(output, checked_candidates(copy.deepcopy(spec())))
        text = output["files"]["symbol"]["content"]
        for i in range(1, 5):
            self.assertEqual(text.count(f'(number "{i}"'), 1)
        self.assertIn('"TEST-4_2_1"', text)
        self.assertEqual(output["files"]["footprint"]["content"].count("(pad "), 4)
        self.assertEqual(output["klc"], "not_run")
        self.assertTrue(output["review_required"])

    def test_equal_counts_with_duplicate_unit_pin_are_rejected(self):
        candidate = spec(); candidate["units"][0]["pin_numbers"] = ["1", "1"]
        output = checked_candidates(candidate)
        self.assertIn("UNIT_COVERAGE", {f["code"] for f in output["findings"]})
        self.assertEqual(output["files"], {})

    def test_unfetched_source_and_out_of_range_page_are_rejected(self):
        docs = [{"sha256": "b" * 64, "url": "https://example.com/ds.pdf", "pages": 1}]
        self.assertEqual(checked_candidates(spec(), documents=docs)["files"], {})
        docs[0]["sha256"] = "a" * 64
        candidate = spec(); candidate["pins"][0]["evidence"] = {"source_id": "ds", "page": 2}
        self.assertEqual(checked_candidates(candidate, documents=docs)["files"], {})

    def test_missing_land_dimensions_produces_only_symbol(self):
        candidate = spec(); candidate["pads"][0].pop("size_x_mm")
        self.assertEqual(set(checked_candidates(candidate)["files"]), {"symbol"})

    def test_large_multiunit_symbol_preserves_900_ball_identifiers(self):
        candidate = spec()
        candidate["pins"] = [dict(candidate["pins"][0], number=f"A{i}", name=f"IO_{i}") for i in range(900)]
        candidate["units"] = [{"name": f"Bank {bank}", "pin_numbers": [f"A{i}" for i in range(bank * 50, (bank + 1) * 50)]} for bank in range(18)]
        candidate["pads"] = [dict(candidate["pads"][0], number=f"A{i}", x_mm=None, y_mm=None) for i in range(900)]
        output = checked_candidates(candidate)
        self.assertEqual(set(output["files"]), {"symbol"})
        text = output["files"]["symbol"]["content"]
        self.assertEqual(text.count('(pin input line'), 900)
        for i in range(900): self.assertEqual(text.count(f'(number "A{i}"'), 1)
        self.assertIn('"TEST-4_18_1"', text)

    def test_overlapping_lands_generate_draft_with_review_warning(self):
        candidate = spec(); candidate["pads"][1].update(x_mm=-1.5, y_mm=.75)
        output = checked_candidates(candidate)
        self.assertEqual(set(output["files"]), {"symbol", "footprint"})
        self.assertIn("FOOTPRINT_PAD_OVERLAP", {f["code"] for f in output["warnings"]})

    def test_unsupported_rotation_produces_symbol_only(self):
        candidate = spec(); candidate["pads"][1]["rotation_deg"] = 90
        output = checked_candidates(candidate)
        self.assertEqual(set(output["files"]), {"symbol"})
        self.assertTrue(output["findings"])

    def test_estimated_geometry_generates_both_files_without_land_diagram(self):
        candidate = spec(); estimated = {"status": "estimated", "method": "Symmetry and provisional terminal clearance"}
        candidate["package"]["evidence"] = {k: estimated for k in ("body_x_mm", "body_y_mm", "pitch_mm")}
        for pad in candidate["pads"]:
            pad["evidence"] = estimated
            pad.pop("size_evidence")
        output = checked_candidates(candidate, documents=[{"sha256": "a" * 64, "url": "https://example.com/ds.pdf", "pages": 1}])
        self.assertEqual(output["findings"], [])
        self.assertEqual(set(output["files"]), {"symbol", "footprint"})
        self.assertIn("GEOMETRY_ESTIMATED", {f["code"] for f in output["warnings"]})
        self.assertIn("LAND_SIZE_REVIEW", {f["code"] for f in output["warnings"]})
        self.assertTrue(output["review_required"])


    def test_malformed_spec_never_reaches_generator(self):
        for candidate in (None, [], {"identity": []}, {"sources": [{"sha256": []}]}):
            self.assertEqual(checked_candidates(candidate)["files"], {})

    def test_nonfinite_and_wrong_identity_are_rejected(self):
        candidate = spec(); candidate["package"]["pitch_mm"] = float("nan")
        self.assertEqual(checked_candidates(candidate)["files"], {})
        self.assertEqual(checked_candidates(spec(), identity={"manufacturer": "Test", "mpn": "OTHER"})["files"], {})


class AgentStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_terminal_stream_preserves_trace_and_closes(self):
        trace = [{"id": "m", "content": [{"type": "text", "text": "Partial response"}]}]
        with patch.object(api, "agent_job", return_value={"status": "completed", "result": {"trace": trace}}):
            events = [event async for event in api.agent_activity_events("task")]
        self.assertEqual(json.loads(events[0].split("data: ")[1])["trace"], trace)
        self.assertEqual(events[-1], "event: end\ndata: {}\n\n")


class AgentApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI(); app.include_router(api.router)
        self.role = "designer"
        app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(email="engineer@test", name="Engineer", role=self.role)
        self.client = TestClient(app)

    def test_writer_identity_is_authenticated_and_unknown_fields_forbidden(self):
        with patch.object(api.component_agent, "enabled", return_value=True), patch.object(api.catalog_jobs, "enqueue", return_value={"id": "job", "status": "queued"}) as enqueue:
            response = self.client.post("/api/catalog/agent-tasks", json={"manufacturer": "Test", "mpn": "TEST-4"})
            self.assertEqual(response.status_code, 202)
            self.assertEqual(enqueue.call_args.kwargs["created_by"], "engineer@test")
            self.assertEqual(enqueue.call_args.kwargs["max_attempts"], 1)
            self.assertEqual(self.client.post("/api/catalog/agent-tasks", json={"manufacturer": "Test", "mpn": "TEST-4", "actor": "someone_else"}).status_code, 422)
            self.role = "viewer"
            self.assertEqual(self.client.post("/api/catalog/agent-tasks", json={"manufacturer": "Test", "mpn": "TEST-4"}).status_code, 403)

    def test_revision_conflict_prevents_queued_work(self):
        with patch.object(api.component_agent, "enabled", return_value=True), patch.object(api.catalog_service, "get_component", return_value={"current_revision_id": "new"}), patch.object(api.catalog_jobs, "enqueue") as enqueue:
            response = self.client.post("/api/catalog/agent-tasks", json={"manufacturer": "Test", "mpn": "TEST-4", "component_id": "c", "expected_revision_id": "old"})
            self.assertEqual(response.status_code, 409); enqueue.assert_not_called()

    def test_internal_spec_tool_requires_service_auth(self):
        with patch.object(api.component_agent, "internal_authorized", side_effect=lambda value: value == "secret"):
            self.assertEqual(self.client.post("/api/catalog/agent-internal/check-spec", json={"spec": spec()}).status_code, 401)
            self.assertEqual(self.client.post("/api/catalog/agent-internal/check-spec", headers={"Authorization": "Bearer secret"}, json={"spec": spec()}).status_code, 200)

    def test_unknown_task_and_cancel_role(self):
        with patch.object(api.catalog_jobs, "get", return_value=None):
            self.assertEqual(self.client.get("/api/catalog/agent-tasks/unknown").status_code, 404)
            self.role = "qa"
            self.assertEqual(self.client.post("/api/catalog/agent-tasks/unknown/cancel").status_code, 403)

    def test_attach_uses_existing_revision_guard_and_session_actor(self):
        result = {"spec": spec(), "documents": [{"sha256": "a" * 64, "url": "https://example.com/ds.pdf", "pages": 1}], "candidates": checked_candidates(spec())}
        job = {"status": "completed", "payload": {"component_id": "c", "mpn": "TEST-4", "manufacturer": "Test"}, "result": result}
        with patch.object(api.catalog_jobs, "get", return_value=job), patch.object(api.catalog_service, "get_component", return_value={"mpn": "TEST-4", "manufacturer": "Test"}), patch.object(api.catalog_service, "import_symbol_library", return_value={"mode": "imported"}) as importer:
            response = self.client.post("/api/catalog/agent-tasks/j/attach/symbol", json={"expected_revision_id": "current"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(importer.call_args.kwargs["actor"], "engineer@test")
            self.assertEqual(importer.call_args.kwargs["expected_revision_id"], "current")
            self.assertEqual(importer.call_args.kwargs["selected_symbol"], "TEST-4")


class AgentWorkerTests(unittest.TestCase):
    def test_submission_failure_cancels_a_possibly_admitted_remote_task(self):
        from app.services.job_runtime import PermanentJobError
        calls = []
        def runtime(method, path, payload=None):
            calls.append((method, path))
            if path == "/tasks": raise PermanentJobError("Connection closed", code="component_agent_unavailable")
            return {}
        with patch("app.services.catalog.component_agent.enabled", return_value=True), patch("app.services.catalog.component_agent.runtime_request", side_effect=runtime):
            with self.assertRaises(PermanentJobError):
                run_component_agent({"id": "job", "payload": {"manufacturer": "Test", "mpn": "TEST-4"}}, lambda **kw: True)
        self.assertIn(("POST", "/tasks/job/cancel"), calls)

    def test_cancellation_interrupts_remote_loop(self):
        calls = []
        def runtime(method, path, payload=None):
            calls.append((method, path)); return {"status": "running"}
        count = 0
        def progress(**fields):
            nonlocal count
            count += 1
            if count == 2: raise JobCancelled()
            return True
        with patch("app.services.catalog.component_agent.enabled", return_value=True), patch("app.services.catalog.component_agent.runtime_request", side_effect=runtime):
            with self.assertRaises(JobCancelled): run_component_agent({"id": "job", "payload": {"manufacturer": "Test", "mpn": "TEST-4"}}, progress)
        self.assertIn(("POST", "/tasks/job/cancel"), calls)

    def test_completed_spec_is_checked_without_catalog_mutation(self):
        task = {"status": "completed", "proposal": {"decision": "propose", "spec": spec()}, "documents": [{"sha256": "a" * 64, "url": "https://example.com/ds.pdf", "pages": 1}]}
        with patch("app.services.catalog.component_agent.enabled", return_value=True), patch("app.services.catalog.component_agent.runtime_request", return_value=task):
            result = run_component_agent({"id": "job", "payload": {"manufacturer": "Test", "mpn": "TEST-4"}}, lambda **kwargs: True)
        self.assertTrue(result["review_required"])
        self.assertEqual(set(result["candidates"]["files"]), {"symbol", "footprint"})

if __name__ == "__main__": unittest.main()
