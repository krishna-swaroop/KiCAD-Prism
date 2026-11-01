"""Extension manifests fail closed and project discovery preserves visibility."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from app.api import extensions as extension_api
from app.core.config import settings
from app.core.errors import Unavailable, install_error_handlers
from app.core.security import AuthenticatedUser
from app.services.extensions import ExtensionManifest, MAX_MANIFEST_BYTES, extension_manifest
from support.asgi import USERS, request


def manifest() -> dict:
    return {
        "schema_version": 1,
        "extensions": [{
            "id": "example-bridge", "name": "Example bridge", "version": "1.0.0",
            "description": "An independently hosted integration.",
            "actions": [{"id": "open", "label": "Open bridge", "kind": "panel",
                         "url": "https://bridge.example.com/prism?mode=review"}],
        }],
    }


def app() -> FastAPI:
    result = FastAPI()
    install_error_handlers(result)
    result.include_router(extension_api.router, prefix="/api")
    return result


class ManifestTest(unittest.TestCase):
    def test_valid_urls_preserve_query_and_allow_loopback_development(self) -> None:
        for url in ("https://bridge.example.com/prism?mode=review", "http://localhost:8123/",
                    "http://127.0.0.1:8123/", "http://[::1]:8123/"):
            with self.subTest(url=url):
                value = manifest()
                value["extensions"][0]["actions"][0]["url"] = url
                result = ExtensionManifest.model_validate(value)
                self.assertEqual(result.extensions[0].actions[0].url, url)

    def test_unsafe_or_ambiguous_urls_are_rejected(self) -> None:
        for url in ("javascript:alert(1)", "file:///tmp/tool", "/bridge", "//bridge.example.com/",
                    "http://bridge.example.com/", "https://user:secret@bridge.example.com/",
                    "https://bridge.example.com/#fragment", "https://bridge.example.com/#",
                    "https://bridge.example.com:99999/", "https://bridge.example.com:/",
                    "https://bridge.example.com:0/", "https://bad_host.example/", "https:///no-host",
                    "https://bridge.example.com/\n", "https://bridge.example.com\\@localhost/",
                    "https://bridge.example.com/{project}", "https://[::1]evil/",
                    "http://127.1/", "http://localhost.example.com/", "http://localhost./"):
            with self.subTest(url=url):
                value = manifest()
                value["extensions"][0]["actions"][0]["url"] = url
                with self.assertRaises(ValidationError):
                    ExtensionManifest.model_validate(value)

    def test_schema_bounds_and_duplicates(self) -> None:
        cases = []
        for version in (True, "1", 2):
            value = manifest()
            value["schema_version"] = version
            cases.append(value)
        value = manifest()
        del value["schema_version"]
        cases.append(value)
        value = manifest()
        value["extensions"] *= 2
        cases.append(value)
        for key, bad in (("id", "Bad_ID"), ("name", " " * 5), ("version", "x" * 65),
                         ("description", "x" * 1001), ("unknown", True)):
            value = manifest()
            value["extensions"][0][key] = bad
            cases.append(value)
        for actions in ([], [manifest()["extensions"][0]["actions"][0]] * 2):
            value = manifest()
            value["extensions"][0]["actions"] = actions
            cases.append(value)
        value = manifest()
        value["extensions"] = [dict(value["extensions"][0], id=f"bridge-{i}") for i in range(33)]
        cases.append(value)
        value = manifest()
        value["extensions"][0]["actions"] = [dict(value["extensions"][0]["actions"][0], id=f"open-{i}") for i in range(9)]
        cases.append(value)
        for index, value in enumerate(cases):
            with self.subTest(case=index), self.assertRaises(ValidationError):
                ExtensionManifest.model_validate(value)

    def test_empty_setting_and_live_file_replacement(self) -> None:
        with mock.patch.object(settings, "PRISM_EXTENSIONS_FILE", ""):
            self.assertEqual(extension_manifest().model_dump(), {"schema_version": 1, "extensions": []})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "extensions.json"
            with mock.patch.object(settings, "PRISM_EXTENSIONS_FILE", str(path)):
                path.write_text(json.dumps(manifest()), encoding="utf-8")
                self.assertEqual(len(extension_manifest().extensions), 1)
                path.write_text('{"schema_version":1,"extensions":[]}', encoding="utf-8")
                self.assertEqual(extension_manifest().extensions, [])
                for bad in (b"{", b"\xff", b" " * (MAX_MANIFEST_BYTES + 1),
                            b'{"schema_version":1,"schema_version":1,"extensions":[]}'):
                    path.write_bytes(bad)
                    with self.assertRaises(Unavailable) as caught:
                        extension_manifest()
                    self.assertEqual(caught.exception.code, "extensions_unavailable")
                    self.assertNotIn(str(path), str(caught.exception))
                path.unlink()
                with self.assertRaises(Unavailable):
                    extension_manifest()


class ExtensionApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.app = app()
        patcher = mock.patch.object(settings, "PRISM_EXTENSIONS_FILE", "")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_registration_and_viewer_discovery(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('app.include_router(extensions_router, prefix="/api", tags=["extensions"])', source)
        paths = self.app.openapi()["paths"]
        self.assertIn("/api/extensions", paths)
        self.assertIn("/api/projects/{project_id}/extensions", paths)
        response = request(self.app, "GET", "/api/extensions", user="viewer")
        self.assertEqual((response.status, response.json), (200, {"schema_version": 1, "extensions": []}))

    def test_project_visibility_is_checked_before_loading_manifest(self) -> None:
        with mock.patch.object(extension_api, "get_project_for_role_or_404") as visible:
            response = request(self.app, "GET", "/api/projects/project-a/extensions", user="viewer")
            self.assertEqual(response.status, 200)
            visible.assert_called_once_with("project-a", "viewer")
        with mock.patch.object(extension_api, "get_project_for_role_or_404", side_effect=HTTPException(404, "Project not found")), \
                mock.patch.object(extension_api, "extension_manifest") as loader:
            response = request(self.app, "GET", "/api/projects/hidden/extensions", user="viewer")
            self.assertEqual(response.status, 404)
            loader.assert_not_called()

    def test_provider_tokens_are_forbidden(self) -> None:
        provider = AuthenticatedUser(email="provider@example.com", name="provider", role="admin", auth_type="kicad_provider")
        with mock.patch.dict(USERS, {"provider": provider}), \
                mock.patch.object(extension_api, "extension_manifest") as loader:
            for path in ("/api/extensions", "/api/projects/project-a/extensions"):
                self.assertEqual(request(self.app, "GET", path, user="provider").status, 403)
            loader.assert_not_called()

    def test_configuration_failure_uses_fixed_flat_error(self) -> None:
        with mock.patch.object(settings, "PRISM_EXTENSIONS_FILE", "/missing/private/extensions.json"):
            response = request(self.app, "GET", "/api/extensions", user="viewer")
        self.assertEqual(response.status, 503)
        self.assertEqual(response.json["code"], "extensions_unavailable")
        self.assertNotIn("private", response.text)
        self.assertEqual(set(response.json), {"detail", "code"})
