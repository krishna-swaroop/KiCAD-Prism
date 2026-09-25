"""VAR-08 acceptance: the variant catalog HTTP surface.

Route handlers are called directly (the pattern ``test_release_studio_api.py``
uses) so auth and response behavior are exercised without standing up OIDC.
The fixture-backed cases go through the real discovery service; the error and
cache cases stub it.
"""

from __future__ import annotations

import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from starlette.requests import Request

from app.api import project_variants as api

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "design_variants"


class _User:
    def __init__(self, role: str = "viewer") -> None:
        self.email = "v@example.com"
        self.name = "Viewer"
        self.role = role


def _run(coro):
    return asyncio.run(coro)


def _request(headers: dict[str, str] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "headers": [
                (key.lower().encode("ascii"), value.encode("ascii"))
                for key, value in (headers or {}).items()
            ],
            "query_string": b"",
            "client": ("127.0.0.1", 12345),
        }
    )


def _row(directory: str, anchor: str):
    return {
        "id": "prj_fixture",
        "name": directory,
        "description": "",
        "path": str(FIXTURES / directory),
        "last_modified": "",
        "relative_path": ".",
        "project_file_rel": anchor,
    }


def _body(response) -> dict:
    return json.loads(response.body)


class VariantCatalogAuthorizationTests(unittest.TestCase):
    def test_unknown_or_hidden_project_is_404_and_discloses_nothing(self) -> None:
        discover = MagicMock()
        with patch.object(api, "get_project_for_role_or_404", side_effect=HTTPException(status_code=404, detail="Project not found")), patch.object(
            api.variant_catalog_service, "discover_variant_catalog", discover
        ):
            with self.assertRaises(HTTPException) as ctx:
                _run(api.get_project_variants("prj", _request(), None, _User()))
        self.assertEqual(ctx.exception.status_code, 404)
        discover.assert_not_called()

    def test_the_role_aware_lookup_is_used(self) -> None:
        from app.api import _helpers

        with patch.object(_helpers.workspace, "get_project_for_role", return_value=None) as lookup:
            with self.assertRaises(HTTPException) as ctx:
                _run(api.get_project_variants("prj", _request(), None, _User(role="qa")))
        self.assertEqual(ctx.exception.status_code, 404)
        lookup.assert_called_once_with("prj", "qa")


class VariantCatalogResponseTests(unittest.TestCase):
    def _read(self, directory: str, anchor: str, *, commit: str | None = None, headers=None):
        project = _Project(FIXTURES / directory, anchor)
        with patch.object(
            api, "get_project_for_role_or_404", return_value=project
        ):
            return _run(
                api.get_project_variants("prj", _request(headers), commit, _User())
            )

    def test_pcb_only_returns_200_with_its_catalog(self) -> None:
        response = self._read("pcb_only", "board_only.kicad_pcb")
        self.assertEqual(response.status_code, 200)
        payload = _body(response)
        self.assertEqual(
            [entry["name"] for entry in payload["variants"]], ["Lite", "Extra"]
        )
        self.assertEqual(payload["variants"][0]["description"], "Board header only")
        self.assertIsNone(payload["commit"])
        self.assertEqual(response.headers["cache-control"], "private, no-cache")
        self.assertIn("etag", {key.lower() for key in response.headers.keys()})

    def test_an_empty_catalog_is_not_an_error(self) -> None:
        response = self._read("no_variants", "plain.kicad_pro")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(_body(response)["variants"], [])
        self.assertEqual(_body(response)["diagnostics"], [])

    def test_a_malformed_source_is_reported_in_a_200(self) -> None:
        response = self._read("malformed", "broken.kicad_pro")
        self.assertEqual(response.status_code, 200)
        payload = _body(response)
        self.assertEqual(
            [entry["name"] for entry in payload["variants"]], ["Lite"]
        )
        codes = [diagnostic["code"] for diagnostic in payload["diagnostics"]]
        self.assertIn("source-unparseable", codes)

    def test_the_payload_keeps_the_frozen_schema_keys(self) -> None:
        response = self._read("oracle", "variants_oracle.kicad_pro")
        payload = _body(response)
        self.assertEqual(payload["schema"], "prism.project_variants_a0")
        self.assertEqual(payload["projectId"], "prj_fixture")
        self.assertIn("sourceRevisionKey", payload)
        self.assertEqual(
            set(payload.keys()),
            {"schema", "projectId", "commit", "sourceRevisionKey", "variants", "diagnostics"},
        )


class VariantCatalogErrorTests(unittest.TestCase):
    def test_an_unresolvable_ref_is_400(self) -> None:
        with patch.object(api, "get_project_for_role_or_404"), patch.object(
            api.variant_catalog_service,
            "discover_variant_catalog",
            side_effect=ValueError("Commit not found: nope"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                _run(api.get_project_variants("prj", _request(), "nope", _User()))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Could not read design variants for this revision")

    def test_a_runtime_failure_is_503(self) -> None:
        with patch.object(api, "get_project_for_role_or_404"), patch.object(
            api.variant_catalog_service,
            "discover_variant_catalog",
            side_effect=RuntimeError("git unavailable"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                _run(api.get_project_variants("prj", _request(), None, _User()))
        self.assertEqual(ctx.exception.status_code, 503)


class VariantCatalogCachingTests(unittest.TestCase):
    PAYLOAD = {
        "schema": "prism.project_variants_a0",
        "projectId": "prj",
        "commit": "a" * 40,
        "sourceRevisionKey": "key-a",
        "variants": [],
        "diagnostics": [],
    }

    def _read(self, payload: dict, headers: dict[str, str] | None = None):
        with patch.object(api, "get_project_for_role_or_404"), patch.object(
            api.variant_catalog_service,
            "discover_variant_catalog",
            return_value=payload,
        ):
            return _run(
                api.get_project_variants("prj", _request(headers), payload.get("commit"), _User())
            )

    def test_commit_responses_are_private_and_revalidate(self) -> None:
        response = self._read(self.PAYLOAD)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-cache")
        expected_etag = response.headers["etag"]

        revalidated = self._read(
            self.PAYLOAD, {"If-None-Match": expected_etag}
        )
        self.assertEqual(revalidated.status_code, 304)
        self.assertEqual(revalidated.body, b"")
        self.assertEqual(revalidated.headers["etag"], expected_etag)

    def test_identical_sources_at_different_commits_have_distinct_etags(self):
        first = self._read(self.PAYLOAD)
        second = self._read({**self.PAYLOAD, "commit": "b" * 40}, {"If-None-Match": first.headers["etag"]})
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(first.headers["etag"], second.headers["etag"])

    def test_moving_ref_must_revalidate(self):
        with patch.object(api, "get_project_for_role_or_404"), patch.object(api.variant_catalog_service, "discover_variant_catalog", return_value=self.PAYLOAD):
            response = _run(api.get_project_variants("prj", _request(), "HEAD", _User()))
        self.assertEqual(response.headers["cache-control"], "private, no-cache")

    def test_working_tree_responses_must_revalidate(self) -> None:
        payload = {**self.PAYLOAD, "commit": None}
        response = self._read(payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-cache")

        etag = response.headers["etag"]
        revalidated = self._read(payload, {"If-None-Match": etag})
        self.assertEqual(revalidated.status_code, 304)

        changed = self._read(
            {**payload, "sourceRevisionKey": "key-b"},
            {"If-None-Match": etag},
        )
        self.assertEqual(changed.status_code, 200)
        self.assertNotEqual(changed.headers["etag"], etag)


class _Project:
    """Only the fields the snapshot seam reads."""

    def __init__(self, directory: Path, anchor: str) -> None:
        self.id = "prj_fixture"
        self.path = str(directory)
        self.project_file = anchor


if __name__ == "__main__":
    unittest.main()
