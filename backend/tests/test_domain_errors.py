"""The typed domain errors and the one handler that renders them (AC-10)."""

from __future__ import annotations

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.errors import install_error_handlers  # noqa: E402
from app.core import errors


def _client(raise_error) -> TestClient:
    app = FastAPI()
    install_error_handlers(app)
    errors.install_error_handlers(app)

    @app.get("/boom")
    def boom():
        raise_error()

    return TestClient(app, raise_server_exceptions=False)


class DomainErrorClassesTest(unittest.TestCase):
    def test_each_class_fixes_the_status(self) -> None:
        cases = [
            (errors.BadRequest, 400, "bad_request"),
            (errors.Forbidden, 403, "forbidden"),
            (errors.NotFound, 404, "not_found"),
            (errors.Conflict, 409, "conflict"),
            (errors.StaleVersion, 412, "stale_version"),
            (errors.Invalid, 422, "invalid"),
            (errors.PreconditionRequired, 428, "precondition_required"),
            (errors.UpstreamFailure, 502, "upstream_failure"),
            (errors.Unavailable, 503, "unavailable"),
        ]
        for cls, status, code in cases:
            with self.subTest(cls=cls.__name__):
                error = cls("message")
                self.assertEqual(error.status_code, status)
                # D15: every typed error carries a machine code.
                self.assertEqual(error.body(), {"detail": "message", "code": code})
                self.assertEqual(str(error), "message")

    def test_the_bridge_gives_every_status_a_code(self) -> None:
        self.assertEqual(errors.caller_error(ValueError("x"), 400).body(), {"detail": "x", "code": "bad_request"})
        self.assertEqual(errors.caller_error(ValueError("x"), 500).body(), {"detail": "x", "code": "error"})

    def test_a_code_and_extras_sit_beside_detail(self) -> None:
        error = errors.Forbidden("no", code="publication_required", requiredRole="designer")
        self.assertEqual(error.body(), {"detail": "no", "code": "publication_required", "requiredRole": "designer"})

    def test_overrides_do_not_leak_into_the_class(self) -> None:
        error = errors.Conflict("x", code="revision_conflict", status_code=412, currentRevision=3)
        self.assertEqual(error.status_code, 412)
        self.assertEqual(error.body(), {"detail": "x", "code": "revision_conflict", "currentRevision": 3})
        self.assertEqual((errors.Conflict.status_code, errors.Conflict.code), (409, "conflict"))

    def test_client_detail_can_differ_from_the_internal_message(self) -> None:
        error = errors.NotFound("sys-123", detail="Not found")
        self.assertEqual(str(error), "sys-123")
        self.assertEqual(error.body()["detail"], "Not found")

    def test_empty_message_falls_back_to_the_class_default(self) -> None:
        self.assertEqual(errors.NotFound().body()["detail"], "Not found")


class HandlerTest(unittest.TestCase):
    def test_renders_body_status_and_headers(self) -> None:
        def raise_stale():
            raise errors.StaleVersion("System has changed; reload it", headers={"ETag": '"sys:s:4"'})

        response = _client(raise_stale).get("/boom")
        self.assertEqual(response.status_code, 412)
        self.assertEqual(response.headers["etag"], '"sys:s:4"')
        self.assertEqual(response.json(), {"detail": "System has changed; reload it", "code": "stale_version"})

    def test_subclasses_defined_by_services_use_the_same_handler(self) -> None:
        class PasswordTooShort(errors.Invalid, ValueError):
            code = "password_policy"

        def raise_custom():
            raise PasswordTooShort("Password must be at least 12 characters")

        response = _client(raise_custom).get("/boom")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "password_policy")

    def test_untyped_exceptions_never_reach_the_client(self) -> None:
        def raise_untyped():
            raise RuntimeError("postgresql://ci:secret@db/prism refused")

        response = _client(raise_untyped).get("/boom")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("secret", response.text)

    def test_the_application_installs_the_handler(self) -> None:
        import os
        from unittest.mock import patch

        from app.core.config import settings

        with patch.dict(os.environ, {"AUTH_ENABLED": "false"}), patch.object(
            settings, "AUTH_ENABLED_OVERRIDE", False
        ):
            from app.main import app

        self.assertIn(errors.DomainError, app.exception_handlers)
        from fastapi.exceptions import RequestValidationError
        from starlette.exceptions import HTTPException as StarletteHTTPException

        self.assertIs(app.exception_handlers[RequestValidationError], errors._validation_error_handler)
        self.assertIs(app.exception_handlers[StarletteHTTPException], errors._http_exception_handler)


class _ItemBody(BaseModel):
    name: str
    count: int


class FrameworkErrorsTest(unittest.TestCase):
    """D40: FastAPI's 422 arrays and plain HTTPExceptions use the one flat body too."""

    def _app(self) -> TestClient:
        from fastapi import HTTPException

        app = FastAPI()
        errors.install_error_handlers(app)

        @app.post("/items")
        def create(body: _ItemBody):
            return body

        @app.get("/plain")
        def plain():
            raise HTTPException(status_code=404, detail="Project not found")

        @app.get("/auth")
        def auth():
            raise HTTPException(status_code=401, detail="Authentication required", headers={"WWW-Authenticate": "Basic"})

        @app.get("/payload")
        def payload():
            raise HTTPException(status_code=503, detail={"status": "not_ready"})

        return TestClient(app, raise_server_exceptions=False)

    def test_validation_array_becomes_one_message(self) -> None:
        response = self._app().post("/items", json={"count": "many", "secret": "x"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(),
            {"detail": "name: Field required, count: Input should be a valid integer, unable to parse string as an integer",
             "code": "validation_error"},
        )
        self.assertNotIn("many", response.text)  # the request input is never echoed

    def test_plain_http_exception_gets_the_status_code(self) -> None:
        client = self._app()
        self.assertEqual(client.get("/plain").json(), {"detail": "Project not found", "code": "not_found"})
        response = client.get("/auth")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["www-authenticate"], "Basic")
        self.assertEqual(response.json(), {"detail": "Authentication required", "code": "unauthorized"})

    def test_unknown_route_and_method_are_flat(self) -> None:
        client = self._app()
        self.assertEqual(client.get("/nowhere").json(), {"detail": "Not Found", "code": "not_found"})
        response = client.get("/items")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json(), {"detail": "Method Not Allowed", "code": "method_not_allowed"})

    def test_structured_detail_is_kept_beside_the_code(self) -> None:
        response = self._app().get("/payload")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": {"status": "not_ready"}, "code": "unavailable"})


class ValueErrorBridgeTest(unittest.TestCase):
    def test_bare_value_error_becomes_the_requested_status(self) -> None:
        for status, cls in ((400, errors.BadRequest), (404, errors.NotFound), (422, errors.Invalid)):
            with self.subTest(status=status):
                with self.assertRaises(cls) as caught:
                    with errors.value_errors_as(status):
                        raise ValueError("Unknown sort field")
                self.assertEqual(caught.exception.status_code, status)
                self.assertEqual(caught.exception.body()["detail"], "Unknown sort field")

    def test_typed_value_errors_keep_their_status_only_when_asked(self) -> None:
        class TypedConflict(errors.Conflict, ValueError):
            pass

        with self.assertRaises(TypedConflict):
            with errors.value_errors_as(400, keep_typed=True):
                raise TypedConflict("changed")
        # Without keep_typed the route's status wins, as when the route caught ValueError itself.
        with self.assertRaises(errors.BadRequest) as caught:
            with errors.value_errors_as(400):
                raise TypedConflict("changed")
        self.assertEqual(caught.exception.body(), {"detail": "changed", "code": "bad_request"})

    def test_typed_errors_that_are_not_value_errors_pass_through(self) -> None:
        with self.assertRaises(errors.NotFound):
            with errors.value_errors_as(400):
                raise errors.NotFound("Folder not found")

    def test_other_exceptions_are_not_caught(self) -> None:
        with self.assertRaises(KeyError):
            with errors.value_errors_as(400):
                raise KeyError("x")


class CallerErrorsTest(unittest.TestCase):
    def test_rules_apply_in_order_like_except_clauses(self) -> None:
        class MissingTool(RuntimeError):
            pass

        def scan(error):
            with errors.caller_errors((ValueError, 400), (MissingTool, 503), (RuntimeError, 502)):
                raise error

        for error, status in ((ValueError("bad host"), 400), (MissingTool("ssh-keyscan missing"), 503),
                              (RuntimeError("scan failed"), 502)):
            with self.subTest(status=status):
                with self.assertRaises(errors.DomainError) as caught:
                    scan(error)
                self.assertEqual(caught.exception.status_code, status)
                self.assertEqual(caught.exception.body()["detail"], str(error))

    def test_unexpected_exceptions_get_a_fixed_message_not_their_text(self) -> None:
        with self.assertLogs("app.core.errors", level="ERROR"):
            with self.assertRaises(errors.DomainError) as caught:
                with errors.caller_errors((ValueError, 400), unexpected="Analysis failed"):
                    raise OSError("/srv/prism/secret path")
        self.assertEqual((caught.exception.status_code, caught.exception.body()), (500, {"detail": "Analysis failed", "code": "error"}))

    def test_http_and_domain_errors_are_never_swallowed_as_unexpected(self) -> None:
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            with errors.caller_errors(unexpected="Workflow failed to start"):
                raise HTTPException(status_code=404, detail="Project not found")
        with self.assertRaises(errors.NotFound):
            with errors.caller_errors(unexpected="Workflow failed to start"):
                raise errors.NotFound("Folder not found")


class PreconditionsTest(unittest.TestCase):
    """D13: one conflict shape. ``If-Match`` names the version; 428 when a required one is missing."""

    def test_etag_round_trips(self) -> None:
        from app.core import preconditions

        tag = preconditions.etag("component", "cmp-1", "rev-2")
        self.assertEqual(tag, '"component:cmp-1:rev-2"')
        self.assertEqual(preconditions.parse_if_match(tag, "component", "cmp-1"), "rev-2")
        self.assertEqual(preconditions.parse_if_match('W/"reply:r_1:4"', "reply", "r_1"), "4")

    def test_missing_is_428_when_required_and_none_when_optional(self) -> None:
        from app.core import preconditions

        with self.assertRaises(errors.PreconditionRequired) as caught:
            preconditions.parse_if_match(None, "comment", "c_1")
        self.assertEqual(caught.exception.body(), {"detail": "If-Match is required", "code": "precondition_required"})
        self.assertIsNone(preconditions.parse_if_match("  ", "comment", "c_1", required=False))

    def test_another_resources_tag_is_never_current(self) -> None:
        from app.core import preconditions

        for raw in ('"comment:c_2:3"', '"reply:c_1:3"', "*", "garbage"):
            with self.subTest(raw=raw):
                self.assertEqual(preconditions.parse_if_match(raw, "comment", "c_1"), preconditions.STALE)
        self.assertEqual(preconditions.int_version(preconditions.STALE), -1)
        self.assertEqual(preconditions.int_version("7"), 7)
        self.assertIsNone(preconditions.int_version(None))


class RoutersRenderNoExceptionTextTest(unittest.TestCase):
    """AC-10: ``str(exc)`` left the routers. Remaining uses are not response text."""

    ALLOWED = {
        # Matches an OAuth state code / webhook reason; never sent.
        ("tracker_identity.py", "code = str(exc)"),
        ("tracker_webhooks.py", "reason = str(exc)"),
        # Per-proposal outcome of a catalog service ValueError (caller-facing by convention).
        ("catalog_admin.py", '"error": str(exc)'),
        # Vendor pack readiness in the publish flow (Release Studio, AC-23).
        ("release_studio.py", "is not ready: {exc}"),
        # The wait before a tracked part can be read again (Supply, from the KiCad panel): text written for the caller.
        ("remote_provider.py", "status_code=429, detail=str(exc)"),
    }
    # Supply services raise ValueError and similar errors whose text was written for the caller (a rejected part number, a budget
    # that cannot be set), and its routers return it as the detail. Every supply router is held to that.
    SUPPLY_ROUTERS_PREFIX = "supply_"

    def test_no_router_puts_exception_text_in_a_response(self) -> None:
        import re
        from pathlib import Path

        pattern = re.compile(r"str\((exc|e|error|err)\)|\{(exc|e|error|err)\}")
        api = Path(__file__).resolve().parents[1] / "app" / "api"
        found = []
        for path in sorted(api.glob("*.py")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if pattern.search(line) and not path.name.startswith(self.SUPPLY_ROUTERS_PREFIX) and not any(
                    path.name == name and snippet in line for name, snippet in self.ALLOWED
                ):
                    found.append(f"{path.name}: {line.strip()}")
        self.assertEqual(found, [])


if __name__ == "__main__":
    unittest.main()
