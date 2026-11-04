"""Admin routes for KiCad path libraries: who may use them, the ETag on every write, and what each action does.

The real application and the real policy run; only the store and the job
queue are replaced, so no database is needed. A user's role comes from the
request helper the supply tests use.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import kicad_libraries_settings as api  # noqa: E402
from app.core.errors import NotFound, StaleVersion  # noqa: E402
from app.core.security import AuthenticatedUser  # noqa: E402
from app.services import kicad_library_fetch  # noqa: E402
from supply_api_helpers import request  # noqa: E402

ROOT = "/api/settings/kicad-libraries"
COMMIT = "a" * 40
OTHER = "b" * 40


def user(role: str) -> AuthenticatedUser:
    return AuthenticatedUser(email=f"{role}@example.org", name=role, role=role)


def view(name: str = "lsf", **fields: object) -> dict:
    return {
        "name": name, "kind": "git", "variables": ["LSF_KICAD_LIB"], "git": "https://example.org/lsf.git", "ref": "main",
        "subdir": "", "path": "", "updatePolicy": "follow", "pinnedCommit": "", "checkIntervalSeconds": 86400,
        "lastCheckedAt": None, "lastCheckError": None, "remoteCommit": "", "fetchedCommit": "", "servedCommit": "",
        "state": "pending", "error": None, "progress": None, "sizeBytes": None, "fetchedAt": None, "createdAt": None,
        "updatedAt": None, "updatedBy": "admin@example.org", "ready": False, "overriddenVariables": [],
        "etag": f'"kicad-library:{name}:1"', "rowVersion": 1, **fields,
    }


class RouteCase(unittest.TestCase):
    def setUp(self) -> None:
        import app.main as main

        self.app = main.app
        self.store = self.enterContext(mock.patch.object(api, "store"))
        self.store.ETAG_KIND = "kicad-library"
        self.store.projects_using.return_value = 0
        self.fetch = self.enterContext(mock.patch.object(api.kicad_library_fetch, "request_fetch"))
        self.removal = self.enterContext(mock.patch.object(api.kicad_library_fetch, "request_removal"))

    def call(self, method: str, path: str = "", *, role: str = "admin", body=None, etag: str | None = None):
        headers = {"If-Match": etag} if etag else None
        return request(self.app, method, ROOT + path, user=user(role), body=body, headers=headers)


class AccessTests(RouteCase):
    ROUTES = (
        ("GET", ""), ("POST", ""), ("POST", "/check"), ("GET", "/lsf/versions"), ("PATCH", "/lsf"),
        ("POST", "/lsf/fetch"), ("POST", "/lsf/refresh"), ("POST", "/lsf/check"), ("POST", "/lsf/update"),
        ("POST", "/lsf/freeze"), ("POST", "/lsf/unfreeze"), ("POST", f"/lsf/versions/{COMMIT}/use"), ("DELETE", "/lsf"),
    )

    def test_only_an_administrator_may_use_any_of_them(self) -> None:
        for role in ("viewer", "designer"):
            for method, path in self.ROUTES:
                with self.subTest(role=role, route=f"{method} {path}"):
                    response = self.call(method, path, role=role, body={} if method in ("POST", "PATCH") else None)
                    self.assertEqual(response.status, 403)
        self.store.list_all.assert_not_called()
        self.fetch.assert_not_called()

    def test_every_route_of_the_router_is_one_of_those_tested(self) -> None:
        paths = {(next(iter(route.methods - {"HEAD"})), route.path.removeprefix(ROOT)) for route in api.router.routes}
        tested = {
            (method, path.replace("lsf", "{name}").replace(COMMIT, "{commit}")) for method, path in self.ROUTES
        }
        self.assertEqual(paths, tested)


class ListAndCreateTests(RouteCase):
    def test_the_list_says_which_variables_boards_use_and_which_a_library_binds(self) -> None:
        self.store.list_all.return_value = [view(ready=True)]
        self.store.usage.return_value = [
            {"variable": "LSF_KICAD_LIB", "projects": 2, "models": 90, "sheets": 1},
            {"variable": "NOPE_LIB", "projects": 1, "models": 3, "sheets": 0},
        ]
        self.store.projects_using.return_value = 2
        answer = self.call("GET").json
        self.assertEqual(answer["libraries"][0]["projectsUsing"], 2)
        self.assertEqual({row["variable"]: row["bound"] for row in answer["usage"]}, {"LSF_KICAD_LIB": True, "NOPE_LIB": False})
        self.assertEqual(answer["checkIntervals"], [3600, 21600, 86400, 604800])
        self.assertFalse(answer["pathLibrariesEnabled"])

    def test_declaring_a_git_library_queues_its_first_fetch_and_returns_its_etag(self) -> None:
        self.store.create.return_value = view()
        response = self.call("POST", body={"name": "lsf", "variables": ["LSF_KICAD_LIB"], "git": "https://example.org/lsf.git", "ref": "main"})
        self.assertEqual(response.status, 201)
        self.assertEqual(response.headers["etag"], '"kicad-library:lsf:1"')
        self.fetch.assert_called_once_with("lsf", commit="", requested_by="admin@example.org")
        fields = self.store.create.call_args.args[0]
        self.assertEqual((fields["update_policy"], fields["check_interval_seconds"]), ("follow", 86400))

    def test_a_path_library_is_refused_while_path_libraries_are_off(self) -> None:
        response = self.call("POST", body={"name": "x", "variables": ["X_LIB"], "path": "team/3d"})
        self.assertEqual(response.status, 422)
        self.store.create.assert_not_called()

    def test_a_path_library_is_not_fetched(self) -> None:
        self.store.create.return_value = view(kind="path", git="", path="team/3d")
        with mock.patch.object(api.settings, "PRISM_KICAD_LIBRARY_MOUNT_ROOT", "/mnt/libs"):
            response = self.call("POST", body={"name": "x", "variables": ["X_LIB"], "path": "team/3d"})
        self.assertEqual(response.status, 201)
        self.fetch.assert_not_called()


class GuardedWriteTests(RouteCase):
    GUARDED = (
        ("PATCH", "/lsf", {"ref": "v2"}), ("POST", "/lsf/refresh", None), ("POST", "/lsf/update", None),
        ("POST", "/lsf/freeze", None), ("POST", "/lsf/unfreeze", None), ("POST", f"/lsf/versions/{COMMIT}/use", None),
        ("DELETE", "/lsf", None),
    )

    def test_a_write_without_if_match_is_refused_before_anything_changes(self) -> None:
        for method, path, body in self.GUARDED:
            with self.subTest(route=f"{method} {path}"):
                response = self.call(method, path, body=body)
                self.assertEqual(response.status, 428)
        self.store.update.assert_not_called()
        self.store.delete.assert_not_called()
        self.fetch.assert_not_called()

    def test_an_etag_of_another_library_reads_as_stale(self) -> None:
        self.store.update.side_effect = StaleVersion("changed", headers={"ETag": '"kicad-library:lsf:2"'})
        response = self.call("PATCH", "/lsf", body={"ref": "v2"}, etag='"kicad-library:other:1"')
        self.assertEqual(response.status, 412)
        self.assertEqual(self.store.update.call_args.kwargs["expected_version"], -1)

    def test_a_stale_etag_is_a_412_that_carries_the_current_one(self) -> None:
        self.store.get.return_value = view()
        self.store.update.side_effect = StaleVersion("changed", headers={"ETag": '"kicad-library:lsf:2"'})
        response = self.call("PATCH", "/lsf", body={"ref": "v2"}, etag='"kicad-library:lsf:1"')
        self.assertEqual(response.status, 412)
        self.assertEqual(response.headers["etag"], '"kicad-library:lsf:2"')
        self.assertEqual(response.json["code"], "stale_version")
        self.fetch.assert_not_called()


class ChangeTests(RouteCase):
    def test_a_new_ref_fetches_again_and_a_new_policy_does_not(self) -> None:
        self.store.get.return_value = view()
        self.store.update.return_value = view(ref="v2")
        self.assertEqual(self.call("PATCH", "/lsf", body={"ref": "v2"}, etag='"kicad-library:lsf:1"').status, 200)
        self.fetch.assert_called_once()
        self.assertEqual(self.store.update.call_args.args[1], {"ref": "v2"})
        self.assertEqual(self.store.update.call_args.kwargs["expected_version"], 1)
        self.fetch.reset_mock()
        self.store.update.return_value = view(updatePolicy="pinned")
        self.call("PATCH", "/lsf", body={"updatePolicy": "pinned", "checkIntervalSeconds": 3600}, etag='"kicad-library:lsf:1"')
        self.assertEqual(self.store.update.call_args.args[1], {"update_policy": "pinned", "check_interval_seconds": 3600})
        self.fetch.assert_not_called()

    def test_freeze_and_unfreeze_set_the_policy(self) -> None:
        self.store.update.return_value = view()
        for path, policy in (("/lsf/freeze", "pinned"), ("/lsf/unfreeze", "follow")):
            with self.subTest(path=path):
                self.assertEqual(self.call("POST", path, etag='"kicad-library:lsf:1"').status, 200)
                self.assertEqual(self.store.update.call_args.args[1], {"update_policy": policy})

    def test_unfreezing_moves_to_the_ref_now_and_freezing_fetches_nothing(self) -> None:
        self.store.update.return_value = view(updatePolicy="pinned")
        self.call("POST", "/lsf/freeze", etag='"kicad-library:lsf:1"')
        self.fetch.assert_not_called()
        self.store.update.return_value = view()
        self.call("POST", "/lsf/unfreeze", etag='"kicad-library:lsf:1"')
        self.fetch.assert_called_once_with("lsf", commit="", requested_by="admin@example.org")

    def test_using_a_version_pins_the_library_there_and_fetches_it(self) -> None:
        self.store.versions.return_value = [{"commit": COMMIT}]
        self.store.update.return_value = view(updatePolicy="pinned", pinnedCommit=COMMIT)
        self.store.get.return_value = view(updatePolicy="pinned", pinnedCommit=COMMIT)
        response = self.call("POST", f"/lsf/versions/{COMMIT}/use", etag='"kicad-library:lsf:1"')
        self.assertEqual(response.status, 200)
        self.assertEqual(self.store.update.call_args.args[1], {"update_policy": "pinned", "pinned_commit": COMMIT})
        self.fetch.assert_called_once_with("lsf", commit=COMMIT, requested_by="admin@example.org")

    def test_a_version_the_library_never_served_is_refused(self) -> None:
        self.store.versions.return_value = [{"commit": COMMIT}]
        response = self.call("POST", f"/lsf/versions/{OTHER}/use", etag='"kicad-library:lsf:1"')
        self.assertEqual(response.status, 422)
        self.store.update.assert_not_called()
        self.fetch.assert_not_called()

    def test_updating_now_fetches_where_the_ref_points_and_a_pinned_library_moves_its_pin(self) -> None:
        self.store.get.return_value = view(updatePolicy="pinned", pinnedCommit=COMMIT)
        self.store.update.return_value = view(updatePolicy="pinned", pinnedCommit=OTHER)
        with mock.patch.object(api.kicad_library_fetch, "resolve_remote", return_value=OTHER):
            response = self.call("POST", "/lsf/update", etag='"kicad-library:lsf:1"')
        self.assertEqual(response.status, 200)
        self.assertEqual(self.store.update.call_args.args[1], {"pinned_commit": OTHER})
        self.fetch.assert_called_once_with("lsf", commit=OTHER, requested_by="admin@example.org")

    def test_updating_a_following_library_changes_no_pin(self) -> None:
        self.store.get.return_value = view()
        self.store.update.return_value = view()
        with mock.patch.object(api.kicad_library_fetch, "resolve_remote", return_value=OTHER):
            self.call("POST", "/lsf/update", etag='"kicad-library:lsf:1"')
        self.assertEqual(self.store.update.call_args.args[1], {})

    def test_an_unreachable_remote_is_a_conflict_not_a_crash(self) -> None:
        self.store.get.return_value = view()
        error = kicad_library_fetch.FetchError("No answer from the repository within 30 seconds")
        with mock.patch.object(api.kicad_library_fetch, "resolve_remote", side_effect=error):
            response = self.call("POST", "/lsf/update", etag='"kicad-library:lsf:1"')
        self.assertEqual((response.status, response.json["code"]), (409, "remote-unreachable"))
        self.fetch.assert_not_called()

    def test_a_manual_check_reports_and_returns_the_library(self) -> None:
        self.store.get.return_value = view()
        result = {"remoteCommit": COMMIT, "moved": True, "queued": True, "error": None}
        with mock.patch.object(api.kicad_library_updates, "check_library", return_value=result):
            answer = self.call("POST", "/lsf/check").json
        self.assertEqual((answer["remoteCommit"], answer["queued"]), (COMMIT, True))
        self.assertEqual(answer["library"]["name"], "lsf")

    def test_a_check_of_an_unknown_library_is_a_404(self) -> None:
        self.store.get.side_effect = NotFound("There is no library named x")
        self.assertEqual(self.call("POST", "/x/check").status, 404)

    def test_removing_a_library_stops_serving_it(self) -> None:
        self.store.delete.return_value = view()
        response = self.call("DELETE", "/lsf", etag='"kicad-library:lsf:1"')
        self.assertEqual(response.status, 204)
        self.assertEqual(self.store.delete.call_args.kwargs["expected_version"], 1)
        library = self.removal.call_args.args[0]
        self.assertEqual((library.name, library.git), ("lsf", "https://example.org/lsf.git"))

    def test_retrying_a_fetch_pins_nothing_for_a_following_library(self) -> None:
        self.store.get.return_value = view()
        self.assertEqual(self.call("POST", "/lsf/fetch").status, 200)
        self.fetch.assert_called_once_with("lsf", commit="", requested_by="admin@example.org")

    def test_retrying_a_pinned_librarys_fetch_asks_for_its_pin(self) -> None:
        self.store.get.return_value = view(updatePolicy="pinned", pinnedCommit=COMMIT)
        self.call("POST", "/lsf/fetch")
        self.fetch.assert_called_once_with("lsf", commit=COMMIT, requested_by="admin@example.org")

    def test_the_versions_say_which_one_is_serving(self) -> None:
        self.store.get.return_value = view(servedCommit=COMMIT)
        self.store.versions.return_value = [
            {"commit": COMMIT, "ref": "main", "fetchedAt": "2026-11-04T10:00:00Z", "requestedBy": "a"},
            {"commit": OTHER, "ref": "main", "fetchedAt": "2026-11-03T10:00:00Z", "requestedBy": "b"},
        ]
        self.assertEqual([v["serving"] for v in self.call("GET", "/lsf/versions").json], [True, False])


if __name__ == "__main__":
    unittest.main()
