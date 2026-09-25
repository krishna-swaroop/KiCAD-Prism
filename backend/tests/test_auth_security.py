from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.settings import UpsertRoleRequest, upsert_access_user  # noqa: E402
from app.core.roles import normalize_role, role_matches_allowed_role  # noqa: E402
from app.core.security import (  # noqa: E402
    AuthenticatedUser,
    require_admin,
    require_catalog_reader,
    require_catalog_writer,
    require_designer,
    require_project_release_actor,
    require_remote_symbol_reader,
)
from app.services import access_service, password_credential_service, provider_auth_service  # noqa: E402


class AuthSecurityTests(unittest.TestCase):
    def test_legacy_catalog_roles_normalize_onto_the_current_model(self) -> None:
        self.assertEqual(normalize_role("Component_Designer"), "designer")
        self.assertEqual(normalize_role("component_qa"), "qa")
        self.assertTrue(role_matches_allowed_role("qa", ["viewer"]))
        self.assertFalse(role_matches_allowed_role("qa", ["designer"]))

    def test_qa_does_not_get_project_mutation_access(self) -> None:
        user = AuthenticatedUser(email="qa@example.com", name="QA", role="qa")

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_designer(user))

        self.assertEqual(ctx.exception.status_code, 403)

    def test_project_release_actor_accepts_designer_qa_and_admin(self) -> None:
        for role in ("designer", "qa", "admin"):
            user = AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            resolved = asyncio.run(require_project_release_actor(user))
            self.assertEqual(resolved.role, role)

        viewer = AuthenticatedUser(email="viewer@example.com", name="Viewer", role="viewer")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_project_release_actor(viewer))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_catalog_reader_accepts_designer_and_qa(self) -> None:
        for role in ("designer", "qa"):
            user = AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            resolved = asyncio.run(require_catalog_reader(user))
            self.assertEqual(resolved.role, role)

    def test_catalog_writer_accepts_designer(self) -> None:
        writer = AuthenticatedUser(email="designer@example.com", name="Designer", role="designer")
        resolved = asyncio.run(require_catalog_writer(writer))
        self.assertEqual(resolved.role, "designer")

        for role in ("qa", "viewer"):
            user = AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(require_catalog_writer(user))
            self.assertEqual(ctx.exception.status_code, 403)

    def test_settings_access_upsert_accepts_qa(self) -> None:
        admin = AuthenticatedUser(email="admin@example.com", name="Admin", role="admin")
        with patch.object(
            access_service,
            "upsert_user_role",
            return_value={"email": "qa@example.com", "role": "qa", "source": "store"},
        ), patch.object(
            password_credential_service,
            "has_credential",
            return_value=False,
        ):
            assignment = asyncio.run(
                upsert_access_user(
                    "qa@example.com",
                    UpsertRoleRequest(role="qa"),
                    admin,
                )
            )

        self.assertEqual(assignment.role, "qa")
        self.assertFalse(assignment.has_password)

    def test_kicad_provider_token_cannot_access_admin_api(self) -> None:
        user = AuthenticatedUser(
            email="admin@example.com",
            name="Admin",
            role="admin",
            auth_type="kicad_provider",
            client_id="kicad-prism-kicad",
            scopes=["remote_symbols.read"],
        )

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_admin(user))

        self.assertEqual(ctx.exception.status_code, 403)

    def test_service_admin_token_can_access_admin_api(self) -> None:
        user = AuthenticatedUser(
            email="client@service.local",
            name="PLM Client",
            role="admin",
            auth_type="service_client",
            client_id="prism_client",
            scopes=["api:read", "api:write"],
        )

        resolved = asyncio.run(require_admin(user))
        self.assertEqual(resolved.client_id, "prism_client")

    def test_remote_symbol_reader_requires_scope_for_bearer_tokens(self) -> None:
        user = AuthenticatedUser(
            email="client@service.local",
            name="PLM Client",
            role="viewer",
            auth_type="service_client",
            client_id="prism_client",
            scopes=["api:write"],
        )

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_remote_symbol_reader(user))

        self.assertEqual(ctx.exception.status_code, 403)

    def test_remote_provider_scope_defaults_to_remote_symbols_read(self) -> None:
        self.assertEqual(provider_auth_service.normalize_provider_scope(""), "remote_symbols.read")

    def test_remote_provider_rejects_unknown_scopes(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            provider_auth_service.normalize_provider_scope("remote_symbols.read api:read")

        self.assertEqual(ctx.exception.status_code, 400)

if __name__ == "__main__":
    unittest.main()
