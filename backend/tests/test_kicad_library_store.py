"""Declared KiCad libraries: CRUD, variable ownership, row versions, the check claim, history and usage.

Runs the store against a scratch schema migrated by the production workspace
ledger, so the migration and the SQL are the real ones.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import Conflict, Invalid, NotFound, StaleVersion  # noqa: E402
from app.services import kicad_libraries, kicad_library_store as store  # noqa: E402
from app.services.workspace_schema_migrations import WORKSPACE_LEDGER  # noqa: E402
from support.postgres import requires_scratch_postgres, scratch_schema, seed_project, seed_repository  # noqa: E402

LSF = {"name": "lsf", "variables": ["LSF_KICAD_LIB"], "git": "https://example.org/lsf.git", "ref": "main"}
COMMIT = "a" * 40
OTHER = "b" * 40


@requires_scratch_postgres("KiCad library store tests")
class KicadLibraryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = scratch_schema(self, "kicad_libraries", ledgers=(WORKSPACE_LEDGER,))
        patcher = patch.object(store, "connect", self.scratch.connection)
        patcher.start()
        self.addCleanup(patcher.stop)
        kicad_libraries.forget_rows()
        self.addCleanup(kicad_libraries.forget_rows)

    def test_create_lists_and_reads_back(self) -> None:
        created = store.create(LSF, updated_by="a@example.org")
        self.assertEqual(created["state"], "pending")
        self.assertEqual((created["git"], created["ref"], created["variables"]), (LSF["git"], "main", ["LSF_KICAD_LIB"]))
        self.assertEqual((created["updatedBy"], created["updatePolicy"], created["kind"]), ("a@example.org", "follow", "git"))
        self.assertEqual(created["checkIntervalSeconds"], 86400)
        self.assertEqual([row["name"] for row in store.list_all()], ["lsf"])
        self.assertEqual(store.get("lsf")["name"], "lsf")

    def test_declared_is_what_the_resolver_validates(self) -> None:
        store.create(LSF, updated_by="")
        (row,) = store.declared()
        library = kicad_libraries.validate_entry(row)
        self.assertEqual((library.git, library.ref, library.update_policy), (LSF["git"], "main", "follow"))

    def test_a_path_library(self) -> None:
        created = store.create({"name": "local", "variables": ["LOCAL_LIB"], "path": "lsf/"}, updated_by="")
        self.assertEqual((created["path"], created["git"], created["kind"]), ("lsf", "", "path"))

    def test_invalid_input(self) -> None:
        for fields in (
            {**LSF, "git": "http://example.org/x.git"},
            {**LSF, "variables": []},
            {**LSF, "variables": ["PATH"]},
            {**LSF, "name": "a b"},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                store.create(fields, updated_by="")

    def test_a_name_is_unique(self) -> None:
        store.create(LSF, updated_by="")
        with self.assertRaises(Conflict):
            store.create({**LSF, "variables": ["OTHER_LIB"]}, updated_by="")

    def test_a_variable_has_one_owner(self) -> None:
        store.create(LSF, updated_by="")
        with self.assertRaises(Conflict):
            store.create({**LSF, "name": "second"}, updated_by="")
        store.create({**LSF, "name": "second", "variables": ["SECOND_LIB"]}, updated_by="")
        with self.assertRaises(Conflict):
            store.update("second", {"variables": ["LSF_KICAD_LIB"]}, expected_version=None, updated_by="")

    def test_an_update_needs_the_current_version(self) -> None:
        created = store.create(LSF, updated_by="")
        changed = store.update("lsf", {"update_policy": "pinned"}, expected_version=created["rowVersion"], updated_by="b")
        self.assertEqual(changed["rowVersion"], created["rowVersion"] + 1)
        with self.assertRaises(StaleVersion):
            store.update("lsf", {"update_policy": "follow"}, expected_version=created["rowVersion"], updated_by="c")
        with self.assertRaises(StaleVersion):
            store.delete("lsf", expected_version=created["rowVersion"])
        store.delete("lsf", expected_version=changed["rowVersion"])

    def test_a_new_ref_marks_the_fetch_pending_and_clears_the_pin(self) -> None:
        store.create({**LSF, "update_policy": "pinned"}, updated_by="")
        store.record_published("lsf", commit=COMMIT, ref="main", size_bytes=10, requested_by="")
        pinned = store.update("lsf", {"update_policy": "pinned"}, expected_version=None, updated_by="")
        self.assertEqual(pinned["pinnedCommit"], COMMIT)
        self.assertEqual(pinned["state"], "ready")
        moved = store.update("lsf", {"ref": "v2"}, expected_version=None, updated_by="")
        self.assertEqual((moved["state"], moved["pinnedCommit"], moved["fetchedCommit"]), ("pending", "", COMMIT))

    def test_pinning_pins_what_is_served_and_following_clears_it(self) -> None:
        store.create(LSF, updated_by="")
        store.record_published("lsf", commit=COMMIT, ref="main", size_bytes=1, requested_by="")
        frozen = store.update("lsf", {"update_policy": "pinned"}, expected_version=None, updated_by="")
        self.assertEqual((frozen["updatePolicy"], frozen["pinnedCommit"]), ("pinned", COMMIT))
        thawed = store.update("lsf", {"update_policy": "follow"}, expected_version=None, updated_by="")
        self.assertEqual((thawed["updatePolicy"], thawed["pinnedCommit"]), ("follow", ""))

    def test_the_history_keeps_the_last_versions_newest_first(self) -> None:
        store.create(LSF, updated_by="")
        for index in range(store.KEPT_VERSIONS + 3):
            store.record_published("lsf", commit=f"{index:040x}", ref="main", size_bytes=1, requested_by="a")
        history = store.versions("lsf")
        self.assertEqual(len(history), store.KEPT_VERSIONS)
        self.assertEqual(history[0]["commit"], f"{store.KEPT_VERSIONS + 2:040x}")
        self.assertEqual(store.get("lsf")["fetchedCommit"], f"{store.KEPT_VERSIONS + 2:040x}")

    def test_publishing_a_deleted_library_is_not_an_error(self) -> None:
        store.record_published("gone", commit=COMMIT, ref="main", size_bytes=1, requested_by="")
        store.record_fetch("gone", state="failed", error="x")

    def test_deleting_a_library_deletes_its_history(self) -> None:
        store.create(LSF, updated_by="")
        store.record_published("lsf", commit=COMMIT, ref="main", size_bytes=1, requested_by="")
        store.delete("lsf", expected_version=None)
        self.assertEqual(store.versions("lsf"), [])
        with self.assertRaises(NotFound):
            store.get("lsf")

    def test_fetch_state_is_recorded_and_checked(self) -> None:
        store.create(LSF, updated_by="")
        store.record_fetch("lsf", state="fetching", progress=40, error=None)
        self.assertEqual((store.get("lsf")["state"], store.get("lsf")["progress"]), ("fetching", 40))
        with self.assertRaises(Invalid):
            store.record_fetch("lsf", state="bogus")

    def test_due_libraries_are_claimed_once(self) -> None:
        store.create(LSF, updated_by="")
        store.create({"name": "local", "variables": ["LOCAL_LIB"], "path": "x"}, updated_by="")
        first = store.claim_due(10)
        self.assertEqual([row["name"] for row in first], ["lsf"])
        self.assertEqual(store.claim_due(10), [])

    def test_a_library_is_due_again_after_its_interval(self) -> None:
        store.create(LSF, updated_by="")
        store.claim_due(10)
        with self.scratch.connection() as conn:
            conn.execute("UPDATE ws_kicad_libraries SET last_checked_at = now() - interval '2 days'")
        self.assertEqual([row["name"] for row in store.claim_due(10)], ["lsf"])

    def test_a_check_records_what_it_saw_and_keeps_the_last_commit_on_failure(self) -> None:
        store.create(LSF, updated_by="")
        store.record_check("lsf", remote_commit=COMMIT, error=None)
        store.record_check("lsf", remote_commit=None, error="no answer")
        row = store.get("lsf")
        self.assertEqual((row["remoteCommit"], row["lastCheckError"]), (COMMIT, "no answer"))
        store.record_check("lsf", remote_commit=OTHER, error=None)
        self.assertEqual((store.get("lsf")["remoteCommit"], store.get("lsf")["lastCheckError"]), (OTHER, None))

    def test_refresh_bumps_only_a_path_librarys_generation(self) -> None:
        store.create({"name": "local", "variables": ["LOCAL_LIB"], "path": "x"}, updated_by="")
        store.create(LSF, updated_by="")
        store.refresh_path("local", expected_version=None, updated_by="")
        (local,) = [row for row in store.declared() if row["name"] == "local"]
        self.assertEqual(local["generation"], 2)
        with self.assertRaises(Invalid):
            store.refresh_path("lsf", expected_version=None, updated_by="")

    def test_usage_counts_projects_that_still_exist(self) -> None:
        with self.scratch.connection() as conn:
            seed_repository(conn, "r1")
            seed_project(conn, "p1", "r1")
            seed_project(conn, "p2", "r1")
        store.replace_usage("p1", "rev1", {"LSF_KICAD_LIB": 86, "KICAD10_3DMODEL_DIR": 4}, {"LSF_KICAD_LIB": 1})
        store.replace_usage("p2", "rev2", {"LSF_KICAD_LIB": 3}, {})
        store.replace_usage("deleted", "rev3", {"LSF_KICAD_LIB": 9}, {})
        usage = {row["variable"]: row for row in store.usage()}
        self.assertEqual((usage["LSF_KICAD_LIB"]["projects"], usage["LSF_KICAD_LIB"]["models"]), (2, 89))
        self.assertEqual(usage["LSF_KICAD_LIB"]["sheets"], 1)
        self.assertEqual(store.projects_using(["LSF_KICAD_LIB"]), 2)
        self.assertEqual(store.projects_using(["KICAD10_3DMODEL_DIR"]), 1)
        self.assertEqual(store.projects_using([]), 0)

    def test_replacing_usage_forgets_the_variables_a_project_no_longer_uses(self) -> None:
        with self.scratch.connection() as conn:
            seed_repository(conn, "r1")
            seed_project(conn, "p1", "r1")
        store.replace_usage("p1", "rev1", {"A_LIB": 1, "B_LIB": 1}, {})
        store.replace_usage("p1", "rev2", {"A_LIB": 2}, {})
        self.assertEqual([(r["variable"], r["models"]) for r in store.usage()], [("A_LIB", 2)])


if __name__ == "__main__":
    unittest.main()
