"""TR-02: comment mutation authorization and actor identity (fixture set F1)."""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import AuthenticatedUser, guest_user, require_comment_writer  # noqa: E402
from app.services import comment_permissions as cp  # noqa: E402


def session(role="viewer", *, user_id="u_1", name="Priya", email=None):
    return AuthenticatedUser(
        email=email or f"{role}-{user_id}@example.com",
        name=name,
        role=role,
        session_id="sid-1",
        user_id=user_id,
    )


def provider_token(role="designer"):
    return AuthenticatedUser(email="p@example.com", name="Plugin", role=role, auth_type="kicad_provider", scopes=["api:write"])


def service_client(scopes, role="designer", client_id="svc-ci"):
    return AuthenticatedUser(
        email=f"{client_id}@service.local", name="CI bot", role=role,
        auth_type="service_client", client_id=client_id, scopes=scopes,
    )


def authored(user_id, kind=cp.ACTOR_KIND_USER):
    return cp.AuthoredObject(author_user_id=user_id, author_kind=kind)


LEGACY = cp.AuthoredObject(author_user_id=None, author_kind=cp.ACTOR_KIND_LEGACY)
REMOTE = cp.AuthoredObject(author_user_id=None, author_kind=cp.ACTOR_KIND_REMOTE)


class CommentWriterDependencyTests(unittest.TestCase):
    def test_viewer_and_qa_sessions_may_write(self) -> None:  # F1.viewer_creates_root
        for role in ("viewer", "qa", "designer", "admin"):
            self.assertIs(asyncio.run(require_comment_writer(session(role))).role, role)

    def test_provider_token_is_refused_even_as_designer(self) -> None:  # F1.kicad_provider_read_only
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_comment_writer(provider_token("designer")))
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(cp.CommentPermissionError) as ctx2:
            cp.resolve_actor(provider_token("admin"))
        self.assertEqual(ctx2.exception.code, "provider_token_read_only")

    def test_service_client_needs_write_scope(self) -> None:  # F1.service_client_write / _no_write_scope
        self.assertEqual(asyncio.run(require_comment_writer(service_client(["api:write"]))).client_id, "svc-ci")
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_comment_writer(service_client(["api:read"])))
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(cp.CommentPermissionError) as ctx2:
            cp.require_write_scope(service_client(["api:read"]))
        self.assertEqual(ctx2.exception.code, "scope_required")


class ActorIdentityTests(unittest.TestCase):
    def test_session_user_id_is_the_stable_key(self) -> None:
        actor = cp.resolve_actor(session("viewer", user_id="u_7f2a", name="Arjun"))
        self.assertEqual((actor.actor_id, actor.actor_kind, actor.display_name), ("u_7f2a", "user", "Arjun"))

    def test_empty_session_user_id_resolves_through_the_users_table(self) -> None:  # F1.empty_user_id_session
        user = session("designer", user_id="", name="", email="priya@example.com")
        with patch.object(cp.access_service, "get_user_by_email", return_value={"user_id": "u_db", "name": "Priya R"}) as lookup:
            actor = cp.resolve_actor(user)
        lookup.assert_called_once_with("priya@example.com")
        self.assertEqual((actor.actor_id, actor.display_name), ("u_db", "Priya R"))

    def test_session_without_users_row_cannot_mutate(self) -> None:  # F1.no_users_row_session
        with patch.object(cp.access_service, "get_user_by_email", return_value=None):
            with self.assertRaises(cp.CommentPermissionError) as ctx:
                cp.resolve_actor(session("designer", user_id="", email="ghost@example.com"))
        self.assertEqual((ctx.exception.status_code, ctx.exception.code), (403, "identity_unresolved"))

    def test_service_and_external_identities_are_prefixed(self) -> None:  # F1.service_client_write
        svc = cp.resolve_actor(service_client(["api:write"]))
        self.assertEqual((svc.actor_id, svc.actor_kind, svc.display_name), ("service:svc-ci", "service", "CI bot"))
        ext = cp.resolve_actor(AuthenticatedUser(
            email="ext@external.oauth", name="ext-sub", role="viewer", auth_type="external_service", client_id="ext-sub",
        ))
        self.assertEqual(ext.actor_id, "external:ext-sub")
        with self.assertRaises(cp.CommentPermissionError):
            cp.resolve_actor(service_client(["api:write"], client_id=""))

    def test_guest_identity_never_publishes(self) -> None:  # F1.guest_auth_disabled
        actor = cp.resolve_actor(guest_user())
        self.assertEqual((actor.actor_id, actor.actor_kind), ("guest:local", "guest"))
        self.assertFalse(actor.can_publish("viewer"))
        self.assertFalse(cp.capabilities(actor, authored("guest:local", "guest"))["canPublish"])


class OwnershipAndActionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.alex1 = cp.resolve_actor(session("designer", user_id="u_1", name="Alex Chen"))
        self.alex2 = cp.resolve_actor(session("designer", user_id="u_2", name="Alex Chen"))
        self.viewer = cp.resolve_actor(session("viewer", user_id="u_v"))
        self.qa = cp.resolve_actor(session("qa", user_id="u_q"))
        self.admin = cp.resolve_actor(session("admin", user_id="u_a"))

    def test_same_display_name_is_not_ownership(self) -> None:  # F1.duplicate_display_names
        root = authored("u_1")
        self.assertTrue(cp.allowed(cp.CommentAction.EDIT, self.alex1, target=root))
        with self.assertRaises(cp.CommentPermissionError) as ctx:
            cp.authorize(cp.CommentAction.EDIT, self.alex2, target=root)
        self.assertEqual(ctx.exception.code, "not_owner")
        self.assertTrue(cp.allowed(cp.CommentAction.DELETE, self.admin, target=root))

    def test_legacy_objects_are_admin_only(self) -> None:  # F1.legacy_display_name_author / F1.admin_edits_legacy
        for actor in (self.alex1, self.viewer):
            with self.assertRaises(cp.CommentPermissionError) as ctx:
                cp.authorize(cp.CommentAction.EDIT, actor, target=LEGACY)
            self.assertEqual(ctx.exception.code, "legacy_admin_only")
        self.assertTrue(cp.allowed(cp.CommentAction.DELETE, self.admin, target=LEGACY))
        # A legacy row whose text happens to equal an actor id still has no owner.
        self.assertFalse(cp.is_owner(self.alex1, cp.AuthoredObject(author_user_id="u_1", author_kind="legacy")))

    def test_remote_replies_are_read_only(self) -> None:
        with self.assertRaises(cp.CommentPermissionError) as ctx:
            cp.authorize(cp.CommentAction.EDIT, self.alex1, target=REMOTE)
        self.assertEqual(ctx.exception.code, "remote_object_read_only")

    def test_create_and_reply_are_open_to_every_writer(self) -> None:  # F1.viewer_creates_root
        for actor in (self.viewer, self.qa, self.alex1, self.admin):
            cp.authorize(cp.CommentAction.CREATE, actor)
            cp.authorize(cp.CommentAction.REPLY, actor, linked=True)

    def test_status_authority_is_designer_and_above(self) -> None:  # F1.qa_ranks_as_viewer
        for actor in (self.viewer, self.qa):
            with self.assertRaises(cp.CommentPermissionError) as ctx:
                cp.authorize(cp.CommentAction.RESOLVE, actor)
            self.assertEqual((ctx.exception.code, ctx.exception.required_role), ("status_role_required", "designer"))
        cp.authorize(cp.CommentAction.RESOLVE, self.alex1)

    def test_linked_thread_status_needs_publication(self) -> None:  # F6.viewer_resolve_refused analogue
        cp.authorize(cp.CommentAction.RESOLVE, self.alex1, linked=True, promote_min_role="designer")
        with self.assertRaises(cp.CommentPermissionError) as ctx:
            cp.authorize(cp.CommentAction.RESOLVE, self.alex1, linked=True, promote_min_role="admin")
        self.assertEqual((ctx.exception.code, ctx.exception.required_role), ("publication_required", "admin"))
        cp.authorize(cp.CommentAction.RESOLVE, self.admin, linked=True, promote_min_role="admin")

    def test_publication_follows_the_project_policy(self) -> None:  # F8.viewer_task_not_auto_promoted analogue
        self.assertFalse(self.viewer.can_publish("designer"))
        self.assertTrue(self.viewer.can_publish("viewer"))
        with self.assertRaises(cp.CommentPermissionError) as ctx:
            cp.authorize(cp.CommentAction.PROMOTE, self.viewer, promote_min_role="designer")
        self.assertEqual(ctx.exception.code, "publication_required")
        cp.authorize(cp.CommentAction.PROMOTE, self.viewer, promote_min_role="viewer")
        # Retry and Share additionally need status authority even when viewers may promote.
        with self.assertRaises(cp.CommentPermissionError) as ctx2:
            cp.authorize(cp.CommentAction.RETRY, self.viewer, promote_min_role="viewer")
        self.assertEqual(ctx2.exception.code, "status_role_required")
        cp.authorize(cp.CommentAction.SHARE, self.alex1, promote_min_role="viewer")
        cp.authorize(cp.CommentAction.RETRY, self.admin, promote_min_role="admin")

    def test_capabilities_are_plain_booleans(self) -> None:
        caps = cp.capabilities(self.viewer, authored("u_v"), linked=True, promote_min_role="designer")
        self.assertEqual(caps, {"canReply": True, "canEdit": True, "canDelete": True, "canResolve": False, "canPublish": False})
        caps = cp.capabilities(self.alex1, LEGACY, linked=False)
        self.assertEqual(caps, {"canReply": True, "canEdit": False, "canDelete": False, "canResolve": True, "canPublish": True})
        caps = cp.capabilities(self.admin, REMOTE, linked=True, promote_min_role="admin")
        self.assertEqual(caps, {"canReply": True, "canEdit": False, "canDelete": False, "canResolve": True, "canPublish": True})

    def test_guest_with_admin_role_never_publishes(self) -> None:
        actor = cp.resolve_actor(AuthenticatedUser(email="guest@local", name="Guest", role="admin"))
        self.assertEqual(actor.actor_kind, cp.ACTOR_KIND_GUEST)
        self.assertFalse(cp.capabilities(actor, authored("guest:local", "guest"))["canPublish"])
        self.assertFalse(cp.allowed(cp.CommentAction.PROMOTE, actor))
        self.assertFalse(cp.allowed(cp.CommentAction.RETRY, actor))
        self.assertFalse(cp.allowed(cp.CommentAction.SHARE, actor))

    def test_admin_cannot_edit_remote_origin_reply(self) -> None:
        self.assertFalse(cp.allowed(cp.CommentAction.EDIT, self.admin, target=REMOTE))
        self.assertFalse(cp.allowed(cp.CommentAction.DELETE, self.admin, target=REMOTE))
        with self.assertRaises(cp.CommentPermissionError) as ctx:
            cp.authorize(cp.CommentAction.EDIT, self.admin, target=REMOTE)
        self.assertEqual(ctx.exception.code, "remote_object_read_only")

    def test_service_admin_cannot_retry_or_share(self) -> None:
        actor = cp.resolve_actor(service_client(["api:write"], role="admin", client_id="svc1"))
        self.assertFalse(cp.allowed(cp.CommentAction.RETRY, actor))
        self.assertFalse(cp.allowed(cp.CommentAction.SHARE, actor))
        # Promote still follows publication; an admin-role service may promote.
        cp.authorize(cp.CommentAction.PROMOTE, actor)


if __name__ == "__main__":
    unittest.main()
