"""The ``prism`` CLI against canned API answers. Standard library only."""

from __future__ import annotations

import csv
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from prism import cli  # noqa: E402
from prism import Client  # noqa: E402

BOM = {
    "commit": "abc123",
    "designKey": "design-key",
    "columns": ["Reference", "Qty", "Value"],
    "lines": [
        {
            "key": "value:10k",
            "quantity": 2,
            "references": ["R1", "R2"],
            "fields": {"Value": "10k"},
        }
    ],
}


class FakeTransport:
    def __init__(self, body, status: int = 200):
        self.body = body
        self.status = status
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "headers": dict(headers), "body": body})
        return self.status, {"content-type": "application/json"}, json.dumps(self.body).encode("utf-8")


class QueueTransport:
    """One canned answer per request, for commands that poll or make several calls."""

    def __init__(self, *bodies):
        self.bodies = list(bodies)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "headers": dict(headers), "body": body})
        if not self.bodies:
            raise AssertionError(f"unexpected request: {method} {url}")
        answer = self.bodies.pop(0)
        status, payload = answer if isinstance(answer, tuple) else (200, answer)
        return status, {"content-type": "application/json"}, json.dumps(payload).encode("utf-8")


COMMENT = {
    "id": "c1",
    "status": "open",
    "author": "Ana",
    "content": "R1 is 10k",
    "elementRef": "R1",
    "link": "https://prism.example/project/p1?comment=c1",
}


def run(argv, transport):
    client = Client("https://prism.example", token="t", transport=transport)
    stdout, stderr = io.StringIO(), io.StringIO()
    with patch.object(cli, "Client", lambda: client):
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = cli.main(argv)
    return code, stdout.getvalue(), stderr.getvalue()


class BomTests(unittest.TestCase):
    def test_bom_csv_writes_the_table(self) -> None:
        code, stdout, _stderr = run(["bom", "p1", "--csv"], FakeTransport(BOM))
        self.assertEqual(code, 0)
        rows = list(csv.reader(io.StringIO(stdout)))
        self.assertEqual(rows[0], ["Reference", "Qty", "Value"])
        self.assertEqual(rows[1], ["R1, R2", "2", "10k"])

    def test_bom_json_is_the_raw_body(self) -> None:
        code, stdout, _stderr = run(["bom", "p1", "--json"], FakeTransport(BOM))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout), BOM)

    def test_human_table_is_the_default(self) -> None:
        code, stdout, _stderr = run(["bom", "p1"], FakeTransport(BOM))
        self.assertEqual(code, 0)
        self.assertIn("Reference", stdout)
        self.assertIn("R1, R2", stdout)


class CommandTests(unittest.TestCase):
    def test_projects_list(self) -> None:
        body = [{"id": "p1", "name": "board", "path": "/boards/board"}]
        code, stdout, _stderr = run(["projects", "list", "--json"], FakeTransport(body))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout), body)

    def test_design_search(self) -> None:
        body = {
            "revision": {"commit": "abc", "designKey": "k"},
            "query": "R1",
            "results": [
                {"kind": "component", "reference": "R1", "value": "10k", "matched": "reference"}
            ],
        }
        code, stdout, _stderr = run(
            ["design", "search", "p1", "R1", "--revision", "abc"], FakeTransport(body)
        )
        self.assertEqual(code, 0)
        self.assertIn("R1", stdout)

    def test_job_wait(self) -> None:
        body = {"job_id": "j1", "status": "completed", "kind": "design_bundle"}
        code, stdout, _stderr = run(["job", "j1", "--wait", "--json"], FakeTransport(body))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout), body)


class CommentCommandTests(unittest.TestCase):
    def test_supply_push_offers_sends_the_file_s_rows(self) -> None:
        import tempfile

        rows = [{"sku": "S1", "mpn": "ABC123", "manufacturer": "Acme", "stock": 4}]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump({"offers": rows}, handle)
        self.addCleanup(os.unlink, handle.name)
        transport = FakeTransport({"received": 1, "kept": 1, "recorded": 0, "pushed_at": "2026-10-30T00:00:00Z"})
        code, stdout, _stderr = run(["supply", "push-offers", "c1", handle.name, "--replace"], transport)
        self.assertEqual(code, 0)
        call = transport.calls[0]
        self.assertEqual((call["method"], call["url"]), ("POST", "https://prism.example/api/v1/supply/connectors/c1/offers"))
        self.assertEqual(json.loads(call["body"]), {"offers": rows, "replace": True})
        self.assertIn("Kept", stdout)

    def test_supply_push_levels_reads_a_plain_list(self) -> None:
        import tempfile

        rows = [{"part": "P1", "mpn": "ABC123", "quantity": 3}]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(rows, handle)
        self.addCleanup(os.unlink, handle.name)
        transport = FakeTransport({"records": 1, "matched": 1, "unmatched": 0})
        code, _stdout, _stderr = run(["supply", "push-levels", "s1", handle.name, "--json"], transport)
        self.assertEqual(code, 0)
        self.assertEqual(transport.calls[0]["url"], "https://prism.example/api/v1/supply/inventory-sources/s1/levels")
        self.assertEqual(json.loads(transport.calls[0]["body"]), {"items": rows})

    def test_comment_add_posts_an_anchored_comment(self) -> None:
        transport = FakeTransport(COMMENT)
        code, stdout, _stderr = run(
            ["comment", "add", "p1", "--component", "R1", "replace with 22k"], transport
        )
        self.assertEqual(code, 0)
        call = transport.calls[0]
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["url"], "https://prism.example/api/v1/projects/p1/comments/anchored")
        self.assertEqual(json.loads(call["body"]), {"content": "replace with 22k", "component": "R1"})
        self.assertIn("c1", stdout)
        self.assertIn(COMMENT["link"], stdout)

    def test_comment_add_sends_optional_fields(self) -> None:
        transport = FakeTransport(COMMENT)
        code, _stdout, _stderr = run(
            [
                "comment",
                "add",
                "p1",
                "--sheet",
                "/",
                "--commit",
                "abc123",
                "--severity",
                "warning",
                "--class",
                "design",
                "note",
            ],
            transport,
        )
        self.assertEqual(code, 0)
        self.assertEqual(
            json.loads(transport.calls[0]["body"]),
            {
                "content": "note",
                "sheet": "/",
                "commit": "abc123",
                "severity": "warning",
                "commentClass": "design",
            },
        )

    def test_comment_add_requires_exactly_one_anchor(self) -> None:
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as both:
                cli.main(
                    ["comment", "add", "p1", "--component", "R1", "--net", "VCC", "text"]
                )
            with self.assertRaises(SystemExit) as neither:
                cli.main(["comment", "add", "p1", "text"])
        self.assertEqual(both.exception.code, 2)
        self.assertEqual(neither.exception.code, 2)

    def test_comment_add_reads_stdin(self) -> None:
        transport = FakeTransport(COMMENT)
        with patch("sys.stdin", io.StringIO("first line\nsecond line")):
            code, _stdout, _stderr = run(
                ["comment", "add", "p1", "--net", "VCC", "-"], transport
            )
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(transport.calls[0]["body"])["content"], "first line\nsecond line")

    def test_comment_reply_posts_to_the_thread(self) -> None:
        body = {"comment": {"id": "c1"}, "reply": {"id": "r1"}}
        transport = FakeTransport(body)
        code, stdout, _stderr = run(["comment", "reply", "p1", "c1", "agreed"], transport)
        self.assertEqual(code, 0)
        call = transport.calls[0]
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["url"], "https://prism.example/api/v1/projects/p1/comments/c1/replies")
        self.assertEqual(json.loads(call["body"]), {"content": "agreed"})
        self.assertIn("r1", stdout)

    def test_comment_list_prints_one_row_per_thread(self) -> None:
        body = {
            "meta": {"version": "1", "generator": "test"},
            "comments": [
                COMMENT,
                {
                    "id": "c2",
                    "status": "resolved",
                    "author": "Ben",
                    "content": "long first line that keeps going\nsecond line",
                    "elementRef": "C4",
                },
            ],
            "cursor": 2,
        }
        transport = FakeTransport(body)
        code, stdout, _stderr = run(["comment", "list", "p1"], transport)
        self.assertEqual(code, 0)
        self.assertEqual(
            transport.calls[0]["url"], "https://prism.example/api/v1/projects/p1/comments"
        )
        self.assertEqual(transport.calls[0]["method"], "GET")
        self.assertIsNone(transport.calls[0]["body"])
        self.assertIn("c1", stdout)
        self.assertIn("open", stdout)
        self.assertIn("Ana", stdout)
        self.assertIn("R1", stdout)
        self.assertNotIn("second line", stdout)

    def test_comment_list_json_is_the_raw_body(self) -> None:
        body = {"meta": {"version": "1", "generator": "test"}, "comments": [COMMENT], "cursor": 1}
        code, stdout, _stderr = run(["comment", "list", "p1", "--json"], FakeTransport(body))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout), body)


class SyncCommandTests(unittest.TestCase):
    def test_sync_wait_polls_the_job_to_completion(self) -> None:
        transport = QueueTransport(
            {"job_id": "j1", "status": "queued", "message": "queued"},
            {"job_id": "j1", "status": "running"},
            {"job_id": "j1", "status": "completed", "kind": "project_sync"},
        )
        code, stdout, _stderr = run(["sync", "p1", "--wait", "--json"], transport)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout)["status"], "completed")
        self.assertEqual(transport.calls[0]["method"], "POST")
        self.assertEqual(transport.calls[0]["url"], "https://prism.example/api/v1/projects/p1/sync")
        self.assertEqual(
            transport.calls[1]["url"], "https://prism.example/api/v1/jobs/j1"
        )
        self.assertEqual(len(transport.calls), 3)

    def test_sync_wait_fails_when_the_job_fails(self) -> None:
        transport = QueueTransport(
            {"job_id": "j1", "status": "queued"},
            {"job_id": "j1", "status": "failed", "error_code": "sync-failed", "error_message": "no remote"},
        )
        code, _stdout, stderr = run(["sync", "p1", "--wait"], transport)
        self.assertEqual(code, 1)
        self.assertIn("sync-failed: no remote", stderr)

    def test_sync_without_wait_reports_the_queued_job(self) -> None:
        transport = FakeTransport({"job_id": "j1", "status": "queued", "message": "queued"})
        code, stdout, _stderr = run(["sync", "p1"], transport)
        self.assertEqual(code, 0)
        self.assertIn("j1", stdout)
        self.assertEqual(len(transport.calls), 1)


class ReleaseCommandTests(unittest.TestCase):
    def test_release_build_wait_posts_the_candidate_body(self) -> None:
        transport = QueueTransport(
            {"job": {"job_id": "j2", "status": "queued"}},
            {"job_id": "j2", "status": "completed", "kind": "release_build"},
        )
        code, stdout, _stderr = run(
            [
                "release",
                "build",
                "p1",
                "--commit",
                "a" * 40,
                "--config",
                "production",
                "--variant",
                "lite",
                "--wait",
                "--json",
            ],
            transport,
        )
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout)["status"], "completed")
        self.assertEqual(
            transport.calls[0]["url"],
            "https://prism.example/api/v1/projects/p1/release-studio/candidates",
        )
        self.assertEqual(
            json.loads(transport.calls[0]["body"]),
            {"commit_sha": "a" * 40, "config_key": "production", "variant": "lite"},
        )

    def test_release_build_wait_fails_when_the_job_fails(self) -> None:
        transport = QueueTransport(
            {"job": {"job_id": "j2", "status": "queued"}},
            {"job_id": "j2", "status": "cancelled"},
        )
        code, _stdout, _stderr = run(
            ["release", "build", "p1", "--commit", "b" * 40, "--wait"], transport
        )
        self.assertEqual(code, 1)


class CompareCommandTests(unittest.TestCase):
    SCH_REVIEW = {
        "jobId": "j3",
        "domain": "sch",
        "groups": [
            {
                "id": "g1",
                "kind": "component.changed",
                "title": "R1 changed",
                "summary": "10k -> 22k",
                "impact": "electrical",
                "section": "components",
                "changeIds": ["c1"],
                "references": ["R1"],
            }
        ],
    }

    def test_compare_wait_prints_the_review_groups(self) -> None:
        transport = QueueTransport(
            {"job_id": "j3"},
            {"job_id": "j3", "status": "completed"},
            self.SCH_REVIEW,
            {"jobId": "j3", "domain": "pcb", "groups": []},
        )
        code, stdout, _stderr = run(
            ["compare", "p1", "base-sha", "head-sha", "--wait", "--json"], transport
        )
        self.assertEqual(code, 0)
        data = json.loads(stdout)
        self.assertEqual(data["jobId"], "j3")
        self.assertEqual(data["reviews"]["schematic"]["groups"][0]["title"], "R1 changed")
        self.assertEqual(data["reviews"]["pcb"]["groups"], [])
        self.assertEqual(
            transport.calls[0]["url"],
            "https://prism.example/api/v1/projects/p1/design-compare",
        )
        self.assertEqual(
            json.loads(transport.calls[0]["body"]), {"base": "base-sha", "head": "head-sha"}
        )
        self.assertEqual(transport.calls[1]["url"], "https://prism.example/api/v1/jobs/j3")
        self.assertIn("domain=sch", transport.calls[2]["url"])
        self.assertIn("domain=pcb", transport.calls[3]["url"])

    def test_compare_wait_after_a_failed_job_exits_nonzero(self) -> None:
        transport = QueueTransport(
            {"job_id": "j3"},
            {"job_id": "j3", "status": "failed", "error_code": "compare-failed", "error_message": "bad revisions"},
        )
        code, _stdout, stderr = run(["compare", "p1", "b", "h", "--wait"], transport)
        self.assertEqual(code, 1)
        self.assertIn("compare-failed: bad revisions", stderr)

    def test_compare_without_wait_reports_the_job(self) -> None:
        transport = FakeTransport({"job_id": "j3"})
        code, stdout, _stderr = run(["compare", "p1", "b", "h"], transport)
        self.assertEqual(code, 0)
        self.assertIn("j3", stdout)
        self.assertEqual(len(transport.calls), 1)


class ExitCodeTests(unittest.TestCase):
    def test_prism_error_exits_one_with_code_and_detail(self) -> None:
        transport = FakeTransport({"detail": "no such project", "code": "project-not-found"}, status=404)
        code, stdout, stderr = run(["project", "missing"], transport)
        self.assertEqual(code, 1)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr.strip(), "project-not-found: no such project")

    def test_missing_base_url_exits_two_without_a_traceback(self) -> None:
        stderr = io.StringIO()
        with patch.dict(os.environ, {}, clear=True):
            with redirect_stderr(stderr):
                code = cli.main(["projects", "list"])
        self.assertEqual(code, 2)
        self.assertIn("PRISM_URL", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
