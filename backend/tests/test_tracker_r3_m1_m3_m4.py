"""R3-M1 / M3 / M4: actor role, txn-across-I/O, DispatchPause mapping."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.executor_support import (  # noqa: E402
    NON_CONSUMING_ERROR_CLASSES,
    apply_provider_error,
    policy_check,
    provider_error_for_dispatch_pause,
    resolve_actor_role,
)
from app.services.trackers.publication_policy import (  # noqa: E402
    ALLOWED_PROMOTE_MIN_ROLES,
    DispatchPause,
    normalize_promote_min_role,
)


class PromoteMinRoleValidationTests(unittest.TestCase):
    def test_allowlist_is_viewer_designer(self) -> None:
        self.assertEqual(ALLOWED_PROMOTE_MIN_ROLES, frozenset({"viewer", "designer"}))

    def test_normalize_accepts_viewer_and_designer(self) -> None:
        self.assertEqual(normalize_promote_min_role("viewer"), "viewer")
        self.assertEqual(normalize_promote_min_role("designer"), "designer")
        self.assertIsNone(normalize_promote_min_role(None))

    def test_normalize_rejects_admin_and_garbage(self) -> None:
        with self.assertRaises(ValueError):
            normalize_promote_min_role("admin")
        with self.assertRaises(ValueError):
            normalize_promote_min_role("nope")


class ActorRoleResolutionTests(unittest.TestCase):
    def test_prefers_snapshotted_actor_role(self) -> None:
        conn = MagicMock()
        role = resolve_actor_role(conn, {"actor_role": "viewer", "actor_user_id": "u1"})
        self.assertEqual(role, "viewer")
        conn.execute.assert_not_called()

    def test_resolves_from_user_roles_by_user_id(self) -> None:
        conn = MagicMock()
        with patch(
            "app.services.trackers.executor_support._lookup_role_in_schema",
            return_value="viewer",
        ), patch(
            "app.services.trackers.executor_support.workspace_schema",
            return_value="workspace",
        ):
            role = resolve_actor_role(conn, {"actor_user_id": "u_viewer"})
        self.assertEqual(role, "viewer")

    def test_missing_actor_id_defaults_to_designer(self) -> None:
        conn = MagicMock()
        self.assertEqual(resolve_actor_role(conn, {}), "designer")
        conn.execute.assert_not_called()

    def test_unresolved_actor_user_defaults_to_viewer(self) -> None:
        conn = MagicMock()
        with patch(
            "app.services.trackers.executor_support._lookup_role_in_schema",
            return_value=None,
        ), patch(
            "app.services.trackers.executor_support.workspace_schema",
            return_value="workspace",
        ):
            self.assertEqual(resolve_actor_role(conn, {"actor_user_id": "missing"}), "viewer")

    def test_missing_identity_schema_falls_back_to_designer(self) -> None:
        conn = MagicMock()
        from app.services.trackers.executor_support import _RoleSchemaMissing

        with patch(
            "app.services.trackers.executor_support._lookup_role_in_schema",
            side_effect=_RoleSchemaMissing("workspace"),
        ), patch(
            "app.services.trackers.executor_support.workspace_schema",
            return_value="workspace",
        ):
            self.assertEqual(resolve_actor_role(conn, {"actor_user_id": "u1"}), "designer")


class DispatchPauseMappingTests(unittest.TestCase):
    def test_visibility_is_not_auth_lost(self) -> None:
        err = provider_error_for_dispatch_pause(DispatchPause("visibility", "need ack"))
        self.assertEqual(err.class_, "visibility")
        self.assertNotEqual(err.class_, "auth_lost")

    def test_visibility_unknown_and_paused(self) -> None:
        self.assertEqual(
            provider_error_for_dispatch_pause(DispatchPause("visibility_unknown", "unk")).class_,
            "visibility_unknown",
        )
        self.assertEqual(
            provider_error_for_dispatch_pause(DispatchPause("paused", "paused")).class_,
            "paused",
        )
        self.assertEqual(
            provider_error_for_dispatch_pause(DispatchPause("connector_missing", "gone")).class_,
            "connector_missing",
        )

    def test_policy_check_maps_pause(self) -> None:
        conn = MagicMock()
        with patch(
            "app.services.trackers.executor_support.evaluate_dispatch",
            side_effect=DispatchPause("visibility", "ack required"),
        ), patch(
            "app.services.trackers.executor_support.resolve_actor_role",
            return_value="designer",
        ), patch(
            "app.services.trackers.executor_support.workspace_schema",
            return_value="workspace",
        ):
            with self.assertRaises(ProviderError) as caught:
                policy_check(conn, project_id="prj", op={"actor_role": "designer"})
        self.assertEqual(caught.exception.class_, "visibility")


class AuthLostPauseTests(unittest.TestCase):
    def test_apply_auth_lost_pauses_connector(self) -> None:
        conn = MagicMock()
        ops = MagicMock()
        apply_provider_error(
            conn,
            ops,
            op={"id": "op1", "state": "sent"},
            fence=1,
            exc=ProviderError("auth_lost", "revoked", retryable=False),
            connector_id="cn1",
            remote_container_id="99",
        )
        self.assertEqual(conn.execute.call_count, 2)
        first_sql = conn.execute.call_args_list[0].args[0]
        self.assertIn("tracker_connectors", first_sql)
        self.assertIn("auth_lost", first_sql)
        ops.schedule.assert_called_once()
        self.assertFalse(ops.schedule.call_args.kwargs.get("consume_attempt", True))

    def test_visibility_does_not_pause_connector(self) -> None:
        conn = MagicMock()
        ops = MagicMock()
        apply_provider_error(
            conn,
            ops,
            op={"id": "op1", "state": "sent"},
            fence=1,
            exc=ProviderError("visibility", "ack", retryable=False),
            connector_id="cn1",
            remote_container_id="99",
        )
        conn.execute.assert_not_called()
        ops.schedule.assert_called_once()

    def test_non_consuming_includes_policy_pauses(self) -> None:
        self.assertIn("visibility", NON_CONSUMING_ERROR_CLASSES)
        self.assertIn("auth_lost", NON_CONSUMING_ERROR_CLASSES)


class TxnAcrossIoTests(unittest.TestCase):
    def test_create_claimed_op_releases_connection_before_provider_io(self) -> None:
        from app.services.trackers import create_executor as ce

        open_conns: list[Any] = []

        class FakeConn:
            def __init__(self) -> None:
                self.committed = False
                self.closed = False

            def commit(self) -> None:
                self.committed = True

            def execute(self, *args: Any, **kwargs: Any) -> Any:
                return MagicMock(fetchone=MagicMock(return_value=None))

            def close(self) -> None:
                self.closed = True

            def __enter__(self) -> FakeConn:
                open_conns.append(self)
                return self

            def __exit__(self, *args: Any) -> None:
                self.closed = True

        @contextmanager_factory
        def fake_connect():
            conn = FakeConn()
            open_conns.append(conn)
            try:
                yield conn
            finally:
                conn.closed = True

        claimed = {"id": "op_x", "fence": 1, "dispatch": "execute", "op": "create_issue"}
        prepared = {
            "mode": "create",
            "op": {"id": "op_x", "state": "sent"},
            "fence": 1,
            "op_id": "op_x",
            "connector": {"id": "cn"},
            "destination": MagicMock(remoteContainerId="1"),
            "outbound": object(),
            "thread": {"id": "tt"},
            "container_path": "a/b",
        }

        io_saw_closed = {}

        def run_io(prep: Any) -> Any:
            # After prepare commit, prior connection must not still be open for I/O.
            io_saw_closed["prior_closed"] = all(getattr(c, "closed", False) or c.committed for c in open_conns)
            raise ProviderError("visibility", "paused", retryable=False)

        with patch.object(ce, "_default_connect", fake_connect), patch.object(
            ce, "_prepare_execute_create", return_value=prepared
        ), patch.object(ce, "_run_create_io", side_effect=run_io), patch.object(
            ce, "apply_provider_error", create=True
        ):
            # apply_provider_error is imported into create_executor namespace
            with patch("app.services.trackers.create_executor.apply_provider_error") as apply_err:
                with patch.object(ce, "OpStore") as OpStore:
                    OpStore.return_value.get.return_value = {
                        "id": "op_x",
                        "state": "sent",
                        "fence": 1,
                        "op": "create_issue",
                    }
                    ce.execute_claimed_op(claimed)
                    apply_err.assert_called_once()
        self.assertTrue(io_saw_closed.get("prior_closed"))


def contextmanager_factory(fn):  # noqa: ANN001
    from contextlib import contextmanager

    return contextmanager(fn)


if __name__ == "__main__":
    unittest.main()
