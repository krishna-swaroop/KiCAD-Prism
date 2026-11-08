"""The bundle's record of the libraries its models were exported with, and when it is outdated.

A board's models resolve through KiCad path variables bound to libraries
fetched at runtime. A bundle records what each variable its board uses pointed
at; it is outdated when any of those differs now, and only those count.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services import kicad_libraries as libs
from app.services.design_bundle import manifest as manifest_rules
from app.services.design_bundle import reader, stage_models, store
from app.services.design_bundle.archive import open_archive
from app.services.design_bundle.reader import OpenedRevision
from support import prism_kicad_stub as stub
from test_kicad_libraries import COMMIT, OTHER, Configured, publish, row
from test_viewer_3d_bundle import BUNDLE_KEY, CONFIG, GENERATOR, GENERATOR_DIGEST, PROJECT_ID, REVISION_KEY

COMMIT_ID = "c" * 40
v3d_pack, v3d_glb = "materialization/board.kmpack", "viewer/models/components.glb"
LSF_FINGERPRINT = f"git:https://gitlab.com/lsf/lsf-kicad-lib.git#@{COMMIT}"
PLACEMENTS = {
    "footprints": [
        {"reference": "C1", "models": [{"path": "${LSF_KICAD_LIB}/cap.step"}]},
        {"reference": "R1", "models": [{"path": "${KICAD10_3DMODEL_DIR}/R.step"}]},
        {"reference": "U1", "models": [{"path": "${KIPRJMOD}/own.step"}]},
    ]
}
PROJECT = {"text_variables": {}, "pcbnew": {"page_layout_descr_file": "${LSF_KICAD_LIB}/layouts/A4.kicad_wks"}}


def write_archive(path: Path, *, models: str = "complete", placements: dict | None = PLACEMENTS, project: dict | None = PROJECT):
    """A stored bundle whose parse stage holds the placements and the project file."""

    def stage(status: str) -> dict:
        return {"status": status, "warnings": [], "failed_members": []}

    members, listed = {}, []
    for member_path, document, role in (
        ("projections/placements.json", placements, "projection"),
        (f"sources/{CONFIG['project_file']}", project, "source-project"),
    ):
        if document is None:
            continue
        data = (json.dumps(document) + "\n").encode("utf-8")
        entry = {"path": member_path, "stage": "parse", "role": role, "sha256": stub.digest(data), "bytes": len(data)}
        schemas = [s["schema"] for s in GENERATOR["member_schemas"] if s["path"] == member_path]
        if schemas:
            entry["member_schema"] = schemas[0]
        listed.append(entry)
        members[member_path] = data
    if models == "complete":
        for member_path, member_stage, role, data in (
            (v3d_pack, "board", "materialization", b"KMMATPK\0" + b"\0" * 24),
            (v3d_glb, "models", "component-models", b"glTF" + b"\0" * 16),
        ):
            entry = {"path": member_path, "stage": member_stage, "role": role, "sha256": stub.digest(data), "bytes": len(data)}
            if role == "materialization":
                entry["member_schema"] = "kicad_monkey.materialization.a0"
            listed.append(entry)
            members[member_path] = data
    listed.sort(key=lambda member: member["path"].encode("utf-8"))
    manifest = {
        "schema": "prism.bundle.manifest.a3", "generator": GENERATOR, "revision_key": REVISION_KEY, "bundle_key": BUNDLE_KEY,
        "config": CONFIG, "board_id": "main",
        "stages": {"parse": stage("complete"), "board": stage("complete"), "models": stage(models)},
        "read_set": {"probes": [], "listings": [], "gitlinks": []}, "members": listed,
    }
    entries = [("bundle.json", stub.compact(manifest) + b"\n")] + [(m["path"], members[m["path"]]) for m in listed]
    path.write_bytes(stub.zip_bytes(entries))
    return open_archive(path)


class ModelsCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(settings, "KICAD_PROJECTS_ROOT", str(self.tmp / "projects")))
        self.enterContext(mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_ROOT", ""))
        reader._unaffected.clear()

    def opened(self, archive, *, active: bool = False) -> OpenedRevision:
        return OpenedRevision(PROJECT_ID, COMMIT_ID, REVISION_KEY, GENERATOR_DIGEST, BUNDLE_KEY, archive, active)

    def record(self, **variables: str | None) -> None:
        store.write_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST, {"variables": variables})

    def outdated(self, opened: OpenedRevision, *rows_: dict, publish_as: str | None = None) -> bool:
        if publish_as and not (self.tmp / "projects" / ".kicad-prism" / "libraries" / "lsf" / publish_as).exists():
            publish(self.tmp / "projects", "lsf", publish_as)
        with Configured(self.tmp / "projects", *rows_):
            return reader.models_outdated(opened, snapshot=libs.snapshot({}))


class ReferencedTests(ModelsCase):
    def test_the_variables_come_from_the_bundles_placements_and_project_file(self) -> None:
        found = stage_models.referenced_variables(write_archive(self.tmp / "a.prism"))
        self.assertEqual(found.variables, ["KICAD10_3DMODEL_DIR", "LSF_KICAD_LIB"])
        self.assertEqual(dict(found.sheets), {"LSF_KICAD_LIB": 1})

    def test_a_bundle_without_placements_or_without_a_project_file_names_nothing(self) -> None:
        for name, placements, project in (("a", None, {}), ("b", {}, None)):
            with self.subTest(missing="placements" if placements is None else "project file"):
                found = stage_models.referenced_variables(write_archive(self.tmp / f"{name}.prism", placements=placements, project=project))
                self.assertEqual((found.variables, dict(found.sheets)), ([], {}))


class CacheKeyTests(unittest.TestCase):
    def key(self, libraries=None) -> str:
        from test_design_bundle_stage_models import GENERATOR as generator, _record

        return stage_models.cache_key(_record(), generator, "10.0.7", libraries)

    def test_a_key_without_libraries_is_what_it_was(self) -> None:
        self.assertEqual(self.key(), self.key({}))
        self.assertEqual(self.key(), self.key(None))

    def test_the_key_moves_with_what_a_used_variable_points_at(self) -> None:
        bound = self.key({"LSF_KICAD_LIB": "git:u#@" + COMMIT})
        self.assertNotEqual(bound, self.key())
        self.assertNotEqual(bound, self.key({"LSF_KICAD_LIB": "git:u#@" + OTHER}))
        self.assertNotEqual(bound, self.key({"LSF_KICAD_LIB": None}))
        self.assertEqual(bound, self.key({"LSF_KICAD_LIB": "git:u#@" + COMMIT}))


class StoreRecordTests(ModelsCase):
    def test_a_record_round_trips_and_goes_with_its_bundle(self) -> None:
        self.assertIsNone(store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST))
        self.record(LSF_KICAD_LIB="git:u#@x", KICAD10_3DMODEL_DIR=None)
        self.assertEqual(
            store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST)["variables"],
            {"LSF_KICAD_LIB": "git:u#@x", "KICAD10_3DMODEL_DIR": None},
        )
        store.delete(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST)
        self.assertIsNone(store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST))

    def test_a_garbled_record_reads_as_none(self) -> None:
        path = store.models_record_path(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST)
        path.parent.mkdir(parents=True)
        path.write_text("{nope", encoding="utf-8")
        self.assertIsNone(store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST))
        path.write_text('{"variables": 3}', encoding="utf-8")
        self.assertIsNone(store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST))

    def test_a_newer_generator_removes_the_older_ones_record(self) -> None:
        old = "e" * 64
        store.write_models_record(PROJECT_ID, REVISION_KEY, old, {"variables": {}})
        self.record()
        store.remove_other_generators(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST)
        self.assertIsNone(store.read_models_record(PROJECT_ID, REVISION_KEY, old))
        self.assertIsNotNone(store.read_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST))


class OutdatedTests(ModelsCase):
    def test_with_no_library_bound_nothing_is_outdated(self) -> None:
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        self.assertFalse(self.outdated(opened))

    def test_a_bundle_with_a_record_that_still_holds_is_current(self) -> None:
        self.record(LSF_KICAD_LIB=LSF_FINGERPRINT, KICAD10_3DMODEL_DIR=None)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        self.assertFalse(self.outdated(opened, row(), publish_as=COMMIT))

    def test_a_library_published_at_a_newer_commit_outdates_it(self) -> None:
        self.record(LSF_KICAD_LIB=LSF_FINGERPRINT, KICAD10_3DMODEL_DIR=None)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        self.assertTrue(self.outdated(opened, row(), publish_as=OTHER))

    def test_a_library_the_board_used_and_that_was_removed_outdates_it(self) -> None:
        self.record(LSF_KICAD_LIB=LSF_FINGERPRINT)
        self.assertTrue(self.outdated(self.opened(write_archive(self.tmp / "a.prism"))))

    def test_a_variable_that_had_no_library_outdates_the_bundle_once_one_arrives(self) -> None:
        self.record(LSF_KICAD_LIB=None, KICAD10_3DMODEL_DIR=None)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        self.assertTrue(self.outdated(opened, row(), publish_as=COMMIT))

    def test_a_library_for_a_variable_the_board_does_not_use_changes_nothing(self) -> None:
        self.record(LSF_KICAD_LIB=None, KICAD10_3DMODEL_DIR=None)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        unrelated = row(name="other", variables=("OTHER_LIB",))
        publish(self.tmp / "projects", "other", COMMIT)
        self.assertFalse(self.outdated(opened, unrelated))

    def test_a_bundle_without_a_record_is_outdated_only_when_a_variable_it_names_is_bound(self) -> None:
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        unrelated = row(name="other", variables=("OTHER_LIB",))
        publish(self.tmp / "projects", "other", COMMIT)
        self.assertFalse(self.outdated(opened, unrelated))
        self.assertTrue(self.outdated(opened, row(), publish_as=COMMIT))

    def test_a_bundle_still_building_or_with_pending_parts_is_not_outdated(self) -> None:
        self.record(LSF_KICAD_LIB=None)
        built = write_archive(self.tmp / "a.prism")
        self.assertFalse(self.outdated(self.opened(built, active=True), row(), publish_as=COMMIT))
        pending = write_archive(self.tmp / "b.prism", models="pending")
        self.assertFalse(self.outdated(self.opened(pending), row(), publish_as=COMMIT))
        self.assertFalse(self.outdated(self.opened(None), row(), publish_as=COMMIT))

    def test_the_environment_defining_a_variable_instead_of_a_library_is_a_change_too(self) -> None:
        self.record(LSF_KICAD_LIB=None, KICAD10_3DMODEL_DIR=None)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        self.assertTrue(reader.models_outdated(opened, snapshot=libs.snapshot({"KICAD10_3DMODEL_DIR": str(self.tmp)})))

    def test_models_built_means_complete_or_partial(self) -> None:
        for status, expected in (("complete", True), ("partial", True), ("pending", False), ("failed", False)):
            with self.subTest(status=status):
                self.assertEqual(manifest_rules.models_built({"stages": {"models": {"status": status}}}), expected)


class TriggerTests(ModelsCase):
    """What queues a refresh: a 3D tab read, and the background prebuild for a project's HEAD."""

    def test_the_3d_status_queues_a_refresh_and_reports_it(self) -> None:
        from app.services import viewer_3d_bundle as v3d

        built = self.opened(write_archive(self.tmp / "a.prism"))
        refreshing = self.opened(write_archive(self.tmp / "b.prism"), active=True)
        generator = mock.Mock(document=GENERATOR, digest=GENERATOR_DIGEST)
        with mock.patch.object(v3d.cli, "generator", return_value=generator),                 mock.patch.object(v3d.reader, "open_revision", side_effect=[built, refreshing]) as opened,                 mock.patch.object(v3d.reader, "models_outdated", return_value=True),                 mock.patch.object(v3d.reader, "refresh_models", return_value="job_9") as refresh,                 mock.patch.object(v3d.rows, "get_bundle", return_value={"job_id": "job_9"}),                 mock.patch.object(v3d.reader.rows, "touch_bundle"):
            answer = v3d.status(PROJECT_ID, COMMIT_ID, requested_by="dev@example.com")
        refresh.assert_called_once_with(built, requested_by="dev@example.com")
        self.assertEqual(opened.call_count, 2)
        self.assertEqual(opened.call_args_list[1].kwargs, {"queue": False})
        self.assertTrue(answer["refreshing"])
        self.assertEqual(answer["job_id"], "job_9")

    def test_an_up_to_date_bundle_queues_nothing_and_is_not_refreshing(self) -> None:
        from app.services import viewer_3d_bundle as v3d

        built = self.opened(write_archive(self.tmp / "a.prism"))
        generator = mock.Mock(document=GENERATOR, digest=GENERATOR_DIGEST)
        with mock.patch.object(v3d.cli, "generator", return_value=generator),                 mock.patch.object(v3d.reader, "open_revision", return_value=built),                 mock.patch.object(v3d.reader, "models_outdated", return_value=False),                 mock.patch.object(v3d.reader, "refresh_models") as refresh,                 mock.patch.object(v3d.reader.rows, "touch_bundle"):
            answer = v3d.status(PROJECT_ID, COMMIT_ID)
        refresh.assert_not_called()
        self.assertFalse(answer["refreshing"])

    def test_the_backfill_refreshes_a_head_once_per_change_in_the_bound_libraries(self) -> None:
        from types import SimpleNamespace

        from app.services.design_bundle import backfill

        def snapshot(fingerprint: str) -> libs.Snapshot:
            return libs.Snapshot(bindings={"LSF_KICAD_LIB": libs.Binding("LSF_KICAD_LIB", self.tmp, fingerprint, "lsf")})

        run = SimpleNamespace(state=backfill.BackfillState(), outcome={"keyed": 0}, free=2)
        with mock.patch.object(backfill.reader, "open_revision", return_value="opened") as opened,                 mock.patch.object(backfill.reader, "models_outdated", return_value=True),                 mock.patch.object(backfill.reader, "refresh_models", return_value="job_1") as refresh:
            with mock.patch.object(backfill.kicad_libraries, "current", return_value=libs.Snapshot()):
                backfill._refresh_models(PROJECT_ID, COMMIT_ID, run)
            opened.assert_not_called()  # no library bound: nothing can be outdated
            with mock.patch.object(backfill.kicad_libraries, "current", return_value=snapshot("a")):
                backfill._refresh_models(PROJECT_ID, COMMIT_ID, run)
                backfill._refresh_models(PROJECT_ID, COMMIT_ID, run)
            self.assertEqual(refresh.call_count, 1, "the same HEAD and bindings are looked at once")
            with mock.patch.object(backfill.kicad_libraries, "current", return_value=snapshot("b")):
                backfill._refresh_models(PROJECT_ID, COMMIT_ID, run)
            self.assertEqual(refresh.call_count, 2)
        self.assertEqual(run.free, 0)
        self.assertEqual(len(run.outcome["refreshed"]), 2)
        self.assertEqual(refresh.call_args.kwargs["priority"], backfill.jobs.BACKFILL_PRIORITY)
        self.assertEqual(refresh.call_args.kwargs["requested_by"], backfill.jobs.BACKFILL_REQUESTED_BY)

    def test_a_head_that_is_not_outdated_is_not_refreshed(self) -> None:
        from types import SimpleNamespace

        from app.services.design_bundle import backfill

        run = SimpleNamespace(state=backfill.BackfillState(), outcome={"keyed": 0}, free=2)
        bound = libs.Snapshot(bindings={"X_LIB": libs.Binding("X_LIB", self.tmp, "fp", "x")})
        with mock.patch.object(backfill.reader, "open_revision", return_value="opened"),                 mock.patch.object(backfill.reader, "models_outdated", return_value=False),                 mock.patch.object(backfill.reader, "refresh_models") as refresh,                 mock.patch.object(backfill.kicad_libraries, "current", return_value=bound):
            backfill._refresh_models(PROJECT_ID, COMMIT_ID, run)
        refresh.assert_not_called()
        self.assertEqual(run.free, 2)


class ReportTests(ModelsCase):
    """What the 3D tab is told about variables the server does not define and models that are not there."""

    def report(self, record: dict | None, *rows_: dict, publish_as: str | None = None):
        from app.services import viewer_3d_bundle as v3d

        if record is not None:
            store.write_models_record(PROJECT_ID, REVISION_KEY, GENERATOR_DIGEST, record)
        if publish_as:
            publish(self.tmp / "projects", "lsf", publish_as)
        opened = self.opened(write_archive(self.tmp / "a.prism"))
        with Configured(self.tmp / "projects", *rows_):
            return v3d._variable_report(opened)

    RECORD = {"variables": {}, "models": {"LSF_KICAD_LIB": 86, "KICAD10_3DMODEL_DIR": 4}, "missing": {"KICAD10_3DMODEL_DIR": 1}}

    def test_a_variable_no_library_defines_is_reported_with_its_models(self) -> None:
        unresolved, missing = self.report(self.RECORD)
        self.assertEqual(unresolved, [{"variable": "KICAD10_3DMODEL_DIR", "models": 4}, {"variable": "LSF_KICAD_LIB", "models": 86}])
        self.assertEqual(missing, [], "a missing file under an undefined variable is the variable's problem")

    def test_once_a_library_defines_it_only_the_missing_files_remain(self) -> None:
        unresolved, missing = self.report(self.RECORD, row(), publish_as=COMMIT)
        self.assertEqual(unresolved, [{"variable": "KICAD10_3DMODEL_DIR", "models": 4}])
        stock = row(name="stock", variables=("KICAD10_3DMODEL_DIR",))
        publish(self.tmp / "projects", "stock", COMMIT)
        unresolved, missing = self.report(None, row(), stock)
        self.assertEqual((unresolved, missing), ([], [{"variable": "KICAD10_3DMODEL_DIR", "models": 1}]))

    def test_a_bundle_with_no_record_says_nothing(self) -> None:
        self.assertEqual(self.report(None), ([], []))

    def test_the_stage_counts_missing_files_against_the_snapshot_it_used(self) -> None:
        archive = write_archive(self.tmp / "m.prism")
        library = self.tmp / "projects" / ".kicad-prism" / "libraries" / "lsf"
        publish(self.tmp / "projects", "lsf", COMMIT, {"other.step": "x"})
        with Configured(self.tmp / "projects", row()):
            counts = stage_models.missing_models(archive, libs.snapshot({}))
        self.assertEqual(counts, {"LSF_KICAD_LIB": 1})
        self.assertTrue(library.is_dir())


if __name__ == "__main__":
    unittest.main()
