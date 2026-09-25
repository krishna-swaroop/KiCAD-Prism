from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException

from app.api import project_import_followups as followups
from app.core.security import AuthenticatedUser, get_current_user, require_designer


DESIGNER = AuthenticatedUser(
    email="designer@example.com",
    name="Designer",
    role="designer",
)
VIEWER = AuthenticatedUser(
    email="viewer@example.com",
    name="Viewer",
    role="viewer",
)


async def _post(app, path: str) -> tuple[int, bytes]:
    """Send one ASGI request without adding httpx to Prism's runtime/test lock."""
    messages: list[dict] = []
    request_complete = False

    async def receive() -> dict:
        nonlocal request_complete
        if request_complete:
            return {"type": "http.disconnect"}
        request_complete = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    await app(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "root_path": "",
        },
        receive,
        send,
    )
    start = next(
        message
        for message in messages
        if message["type"] == "http.response.start"
    )
    body = b"".join(
        message.get("body", b"")
        for message in messages
        if message["type"] == "http.response.body"
    )
    return start["status"], body


class ProjectImportFollowUpApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_viewer_is_rejected_before_scheduler(self) -> None:
        app = FastAPI()
        app.include_router(followups.router, prefix="/api/projects")
        app.dependency_overrides[get_current_user] = lambda: VIEWER
        try:
            with patch.object(
                followups.project_import_followups,
                "retry_import_follow_ups",
            ) as retry:
                status, _body = await _post(
                    app,
                    "/api/projects/project-1/import-follow-ups/retry",
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(status, 403)
        retry.assert_not_called()

        route = next(
            route
            for route in followups.router.routes
            if getattr(route, "path", "") == "/{project_id}/import-follow-ups/retry"
        )
        self.assertTrue(
            any(
                dependency.dependency is require_designer
                for dependency in route.dependencies
            )
        )

    async def test_designer_request_reaches_scheduler_with_actor(self) -> None:
        app = FastAPI()
        app.include_router(followups.router, prefix="/api/projects")
        outcomes = [
            {
                "project_id": "project-1",
                "operation": "metadata",
                "status": "queued",
                "job_id": "job-meta",
            },
            {
                "project_id": "project-1",
                "operation": "thumbnail",
                "status": "queued",
                "job_id": "job-thumbnail",
            },
        ]
        app.dependency_overrides[get_current_user] = lambda: DESIGNER
        try:
            with (
                patch.object(followups, "get_project_for_role_or_404"),
                patch.object(
                    followups.project_import_followups,
                    "retry_import_follow_ups",
                    return_value=outcomes,
                ) as retry,
            ):
                status, body = await _post(
                    app,
                    "/api/projects/project-1/import-follow-ups/retry",
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(status, 200)
        self.assertIn(b'"status":"queued"', body)
        retry.assert_called_once_with("project-1", requested_by=DESIGNER.email)

    async def test_hidden_or_missing_project_returns_404_before_scheduler(self) -> None:
        for detail in ("Project not found", "Project hidden"):
            with self.subTest(detail=detail):
                with (
                    patch.object(
                        followups,
                        "get_project_for_role_or_404",
                        side_effect=HTTPException(status_code=404, detail=detail),
                    ),
                    patch.object(
                        followups.project_import_followups,
                        "retry_import_follow_ups",
                    ) as retry,
                ):
                    with self.assertRaises(HTTPException) as caught:
                        await followups.retry_project_import_follow_ups(
                            "project-1",
                            user=DESIGNER,
                        )

                self.assertEqual(caught.exception.status_code, 404)
                retry.assert_not_called()

    async def test_actor_is_forwarded_and_partial_outcomes_are_explicit(self) -> None:
        outcomes = [
            {
                "project_id": "project-1",
                "operation": "metadata",
                "status": "queued",
                "job_id": "job-meta",
            },
            {
                "project_id": "project-1",
                "operation": "thumbnail",
                "status": "failed",
                "error": "queue unavailable",
            },
        ]
        with (
            patch.object(followups, "get_project_for_role_or_404"),
            patch.object(
                followups.project_import_followups,
                "retry_import_follow_ups",
                return_value=outcomes,
            ) as retry,
        ):
            response = await followups.retry_project_import_follow_ups(
                "project-1",
                user=DESIGNER,
            )

        retry.assert_called_once_with("project-1", requested_by=DESIGNER.email)
        self.assertEqual(response["status"], "partial")
        self.assertEqual(response["project_id"], "project-1")
        self.assertEqual(response["follow_ups"], outcomes)
        self.assertEqual(response["job_ids"], ["job-meta"])
        self.assertIn("could not be queued", response["message"])

    async def test_all_failed_outcomes_are_not_reported_as_partial(self) -> None:
        outcomes = [
            {
                "project_id": "project-1",
                "operation": "metadata",
                "status": "failed",
                "error": "metadata queue unavailable",
            },
            {
                "project_id": "project-1",
                "operation": "thumbnail",
                "status": "failed",
                "error": "thumbnail queue unavailable",
            },
        ]
        with (
            patch.object(followups, "get_project_for_role_or_404"),
            patch.object(
                followups.project_import_followups,
                "retry_import_follow_ups",
                return_value=outcomes,
            ),
        ):
            response = await followups.retry_project_import_follow_ups(
                "project-1",
                user=DESIGNER,
            )

        self.assertEqual(response["status"], "failed")


if __name__ == "__main__":
    unittest.main()
