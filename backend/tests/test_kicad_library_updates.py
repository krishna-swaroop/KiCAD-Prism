"""The scheduled check of a KiCad library's remote: follow fetches a moved ref, pinned only reports it."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import kicad_library_fetch as fetch  # noqa: E402
from app.services import kicad_library_updates as updates  # noqa: E402
from test_kicad_library_fetch import FetchCase  # noqa: E402


class CheckTests(FetchCase):
    def setUp(self) -> None:
        super().setUp()
        for target in ("record_check", "claim_due"):
            patcher = mock.patch.object(updates.store, target)
            setattr(self, target, patcher.start())
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(updates.fetch, "request_fetch")
        self.request_fetch = patcher.start()
        self.addCleanup(patcher.stop)

    def declared(self, **fields: object):
        library = self.library(**fields)
        entry = {
            "name": library.name, "variables": list(library.variables), "git": library.git, "ref": library.ref,
            "update_policy": library.update_policy, "pinned_commit": library.pinned_commit,
        }
        patcher = mock.patch.object(updates.kicad_libraries, "declared_rows", return_value=[entry])
        patcher.start()
        self.addCleanup(patcher.stop)
        return library

    def test_a_following_library_whose_ref_moved_is_fetched_at_the_commit_the_check_saw(self) -> None:
        library = self.declared()
        fetch.fetch_version(library, self.first)
        second = self.advance()
        result = updates.check_library("lsf")
        self.assertEqual((result["remoteCommit"], result["moved"], result["queued"]), (second, True, True))
        self.record_check.assert_called_once_with("lsf", remote_commit=second, error=None)
        self.request_fetch.assert_called_once_with("lsf", commit=second, requested_by=updates.SYSTEM_USER)

    def test_a_following_library_that_is_current_costs_nothing(self) -> None:
        library = self.declared()
        fetch.fetch_version(library, self.first)
        result = updates.check_library("lsf")
        self.assertEqual((result["moved"], result["queued"]), (False, False))
        self.request_fetch.assert_not_called()
        self.record_check.assert_called_once_with("lsf", remote_commit=self.first, error=None)

    def test_a_pinned_library_whose_ref_moved_is_reported_and_not_fetched(self) -> None:
        library = self.declared(update_policy="pinned", pinned_commit=self.first)
        fetch.fetch_version(library, self.first)
        second = self.advance()
        result = updates.check_library("lsf")
        self.assertEqual((result["remoteCommit"], result["moved"], result["queued"]), (second, True, False))
        self.request_fetch.assert_not_called()

    def test_a_library_with_nothing_served_yet_is_fetched_by_a_following_check(self) -> None:
        self.declared()
        result = updates.check_library("lsf")
        self.assertTrue(result["queued"])

    def test_a_check_that_cannot_reach_the_remote_records_why_and_fetches_nothing(self) -> None:
        library = self.declared(git=(self.root / "gone").as_uri())
        result = updates.check_library("lsf")
        self.assertFalse(result["queued"])
        self.assertTrue(result["error"])
        self.request_fetch.assert_not_called()
        (call,) = self.record_check.call_args_list
        self.assertIsNone(call.kwargs["remote_commit"])
        self.assertEqual(call.kwargs["error"], result["error"])
        del library

    def test_an_unknown_or_path_library_is_a_no_op(self) -> None:
        self.assertFalse(updates.check_library("unknown")["queued"])
        self.record_check.assert_not_called()

    def test_every_due_library_is_checked_and_one_failing_does_not_stop_the_rest(self) -> None:
        self.claim_due.return_value = [{"name": "a"}, {"name": "b"}, {"name": "c"}]
        calls = []

        def check(name: str) -> dict:
            calls.append(name)
            if name == "a":
                raise RuntimeError("boom")
            return {"queued": name == "c"}

        with mock.patch.object(updates, "check_library", check):
            queued = updates.check_due()
        self.assertEqual((calls, queued), (["a", "b", "c"], 1))
        self.claim_due.assert_called_once_with(updates.MAX_PER_SCAN)


if __name__ == "__main__":
    unittest.main()
