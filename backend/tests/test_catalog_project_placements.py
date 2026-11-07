"""Which catalog revision a project commit placed (issue #698, the #695 stamp).

The reader finds the stamp on schematic symbol instances; the scan records a
commit's placements (stamped, or inferred for parts placed before the stamp)
and the report says which have a newer released revision.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.services import kicad_library_reader, project_catalog_usage_service, project_revision  # noqa: E402
from app.services.catalog.metadata_normalization import is_reserved_stamp_key  # noqa: E402
from app.services.catalog.placement_stamp import placed_symbols, read_stamp  # noqa: E402
from app.services.catalog.project_placements import CatalogProjectPlacements  # noqa: E402
from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402
from support.repo import init_repo  # noqa: E402

ACTOR = "designer@example.com"
COMPONENT = "0b1c2d3e-0000-4000-8000-000000000001"
REVISION = "0b1c2d3e-0000-4000-8000-000000000002"


def _property(name: str, value: str) -> str:
    return f'\t\t(property "{name}" "{value}" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))\n'


def instance(lib_id: str, references: list[str], properties: dict[str, str], *, symbol_uuid: str = "") -> str:
    """One schematic symbol instance as KiCad writes it."""
    props = "".join(_property(name, value) for name, value in properties.items())
    paths = "".join(f'\t\t\t\t(path "/{index}" (reference "{ref}") (unit 1))\n' for index, ref in enumerate(references))
    return (
        f'\t(symbol (lib_id "{lib_id}") (at 10 10 0) (unit 1)\n'
        f'\t\t(uuid "{symbol_uuid or uuid.uuid4()}")\n'
        f"{props}"
        f'\t\t(pin "1" (uuid "{uuid.uuid4()}"))\n'
        f'\t\t(instances\n\t\t\t(project "demo"\n{paths}\t\t\t)\n\t\t)\n'
        "\t)\n"
    )


def schematic(*instances: str) -> str:
    library = '\t(lib_symbols\n\t\t(symbol "remote_x:R" (property "Value" "R" (at 0 0 0)))\n\t)\n'
    return f'(kicad_sch (version 20250114) (generator "eeschema")\n{library}{"".join(instances)})\n'


class StampReaderTests(unittest.TestCase):
    def test_reads_the_stamp_and_every_reference_of_an_instance(self) -> None:
        text = schematic(
            instance("remote_lib:R", ["R1", "R11"], {
                "Reference": "R1", "Value": "10k", "Prism_Component": COMPONENT, "Prism_Revision": REVISION.upper(),
            }, symbol_uuid="abc"),
            instance("power:GND", ["#PWR01"], {"Reference": "#PWR01", "Value": "GND"}),
        )

        [placed, power] = placed_symbols(text, "main.kicad_sch")

        self.assertEqual((placed.lib_id, placed.symbol_uuid, placed.references), ("remote_lib:R", "abc", ("R1", "R11")))
        self.assertEqual((placed.stamp.component_id, placed.stamp.revision_id), (COMPONENT, REVISION))
        self.assertEqual((placed.library_nickname, placed.symbol_name), ("remote_lib", "R"))
        self.assertIsNone(power.stamp)

    def test_stamp_names_match_like_reserved_keys_and_values_must_be_uuids(self) -> None:
        self.assertEqual(read_stamp({"prism-component": COMPONENT, "Prism Revision": REVISION}).revision_id, REVISION)
        self.assertIsNone(read_stamp({"Prism_Component": COMPONENT}))
        self.assertIsNone(read_stamp({"Prism_Component": COMPONENT, "Prism_Revision": "v2"}))
        self.assertIsNone(read_stamp({"PrismComponent": COMPONENT, "PrismRevision": REVISION}))


class _CatalogParts(unittest.TestCase):
    """A scratch catalog store and released parts with a symbol; no tests of its own."""

    def setUp(self) -> None:
        for target, value in (
            ("app.core.config.settings.CATALOG_KLC_ENABLED", False),
            ("app.core.config.settings.CATALOG_KLC_RELEASE_GATE", "warn"),
            ("app.core.config.settings.REMOTE_PROVIDER_LIBRARY_PREFIX", "remote"),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.service = ComponentCatalogPostgresService(store_root=self.root / "components", database_url=CATALOG_URL)
        self.service.initialize()
        self.addCleanup(self.service.close)
        self.token = uuid.uuid4().hex[:10]
        self.library = f"Usage_{self.token}"
        self.project_id = f"project-{self.token}"

    def _release(self, component_id: str) -> dict:
        head = self.service.get_component(component_id)
        self.service.set_release_status(component_id, "in_progress", actor=ACTOR)
        review = self.service.set_release_status(component_id, "qa_review", actor=ACTOR)
        approved = self.service.set_release_status(
            component_id, "done", actor="qa@example.com", actor_role="qa",
            expected_revision_id=review["revision_id"], expected_manifest_hash=review["manifest_hash"],
        )
        released = self.service.set_release_status(
            component_id, "released", actor=ACTOR, actor_role="designer",
            expected_revision_id=approved["revision_id"], expected_manifest_hash=approved["manifest_hash"],
        )
        self.assertNotEqual(head, None)
        return released

    def _draft_part(self) -> dict:
        created = self.service.create_manual_component(
            value="10k", description="usage", datasheet="https://example.com/r.pdf",
            manufacturer="Prism Usage", manufacturer_part_number=f"USE-{self.token}", actor=ACTOR,
        )
        self.addCleanup(self.service.deactivate_component, str(created["id"]), actor="usage-test@local", reason="cleanup")
        return created

    def _released_part(self) -> dict:
        created = self._draft_part()
        component_id = str(created["id"])
        self.service.import_symbol_library(
            component_id, upload_name="R_Usage.kicad_sym",
            # Laid out as KiCad writes it: placement rewrites one property per line, and
            # without kicad-cli (CI) the upload is stored as given.
            payload=(
                '(kicad_symbol_lib (version 20231120) (generator "test")\n'
                '  (symbol "R_Usage"\n'
                '    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                '    (property "Value" "10k" (at 0 0 0) (effects (font (size 1.27 1.27))))\n'
                "  )\n"
                ")\n"
            ).encode(),
            target_library=self.library, selected_symbol="R_Usage", actor=ACTOR,
        )
        self.service.import_footprint(
            component_id, upload_name="R_Usage.kicad_mod",
            payload=f'(footprint "R_Usage" (version 20240108) (generator "test") (descr "{self.token}"))'.encode(),
            target_library=self.library, selected_footprint="R_Usage", actor=ACTOR,
        )
        return self._release(component_id)

    def _placed_fields(self, released: dict) -> dict[str, str]:
        """The symbol fields remote placement wrote for this released revision."""
        [symbol] = [asset for asset in released["assets"] if asset["asset_type"] == "symbol"]
        placed = self.service.get_asset_by_id(str(symbol["id"]), revision_id=released["revision_id"])
        return kicad_library_reader.symbol_properties(placed["payload"].decode("utf-8"))

    def _second_release(self, released: dict) -> dict:
        self.service.update_component_metadata(
            str(released["id"]), {"description": "usage, revised"}, actor=ACTOR,
            expected_revision_id=released["revision_id"],
        )
        return self._release(str(released["id"]))

    def _stamped(self, component_id: str, revision_id: str) -> str:
        return schematic(instance("remote_x:R", ["R1"], {
            "Reference": "R1", "Prism_Component": component_id, "Prism_Revision": revision_id,
        }))

    def _record(self, text: str, commit: str = "c1") -> dict:
        with self.service.connection() as conn:
            rows, counts = CatalogProjectPlacements.resolve(conn, placed_symbols(text, "main.kicad_sch"))
            CatalogProjectPlacements.record_scan(conn, self.project_id, commit, rows, counts)
            conn.commit()
        with self.service.connection() as conn:
            report = CatalogProjectPlacements.report(conn, self.project_id, commit)
            conn.rollback()
        return report



@requires_scratch_postgres("project placement tests")
class ProjectPlacementTests(_CatalogParts):
    def test_a_stamped_part_reports_the_newer_release_as_an_update(self) -> None:
        first = self._released_part()
        fields = self._placed_fields(first)
        self.assertEqual(fields["Prism_Revision"], first["revision_id"])
        lib_id = f"remote_{self.library.lower()}:R_Usage"
        text = schematic(instance(lib_id, ["R1", "R2"], {"Reference": "R1", **fields}))

        current = self._record(text)
        [item] = current["items"]
        self.assertEqual((item["basis"], item["status"], item["references"]), ("stamp", "current", ["R1", "R2"]))

        second = self._second_release(first)
        [item] = self._record(text)["items"]
        self.assertEqual(item["status"], "update_available")
        self.assertEqual((item["revisionId"], item["latestRevisionId"]), (first["revision_id"], second["revision_id"]))
        self.assertEqual((item["recordedVersion"] < item["latestVersion"]), True)

    def test_an_unstamped_part_is_inferred_from_its_library_name_and_fields(self) -> None:
        first = self._released_part()
        fields = {name: value for name, value in self._placed_fields(first).items() if not is_reserved_stamp_key(name)}
        second = self._second_release(first)
        lib_id = f"remote_{self.library.lower()}:R_Usage"
        text = schematic(
            instance(lib_id, ["R1"], {"Reference": "R1", **fields}),
            instance(lib_id, ["R2"], {"Reference": "R2", **fields, "Description": "edited by hand"}),
            instance("Device:R", ["R3"], {"Reference": "R3", "Value": "1k"}),
        )

        report = self._record(text)

        by_basis = {item["basis"]: item for item in report["items"]}
        self.assertEqual(by_basis["inferred_metadata"]["revisionId"], first["revision_id"])
        self.assertEqual(by_basis["inferred_metadata"]["status"], "update_available")
        self.assertEqual(by_basis["identity"]["revisionId"], "")
        self.assertEqual(by_basis["identity"]["status"], "unknown_revision")
        self.assertTrue(by_basis["identity"]["mixedRevisions"])
        self.assertEqual(
            (report["scan"]["symbolCount"], report["scan"]["stampedCount"], report["scan"]["inferredCount"],
             report["scan"]["untrackedCount"]),
            (3, 0, 2, 1),
        )
        self.assertNotEqual(second["revision_id"], first["revision_id"])

    def test_a_draft_part_that_never_released_is_unreleased(self) -> None:
        draft = self._draft_part()

        report = self._record(self._stamped(str(draft["id"]), str(draft["revision_id"])))

        [item] = report["items"]
        self.assertEqual((item["status"], item["latestRevisionId"]), ("unreleased", ""))
        self.assertEqual(report["summary"]["unreleased"], 1)

    def test_a_release_archived_after_release_is_retired(self) -> None:
        released = self._released_part()
        self.service.set_release_status(str(released["id"]), "archived", actor=ACTOR)

        [item] = self._record(self._stamped(str(released["id"]), released["revision_id"]))["items"]

        self.assertEqual(item["status"], "retired")

    def test_an_inactive_part_is_retired(self) -> None:
        draft = self._draft_part()
        self.service.deactivate_component(str(draft["id"]), actor=ACTOR, reason="retired")

        [item] = self._record(self._stamped(str(draft["id"]), str(draft["revision_id"])))["items"]

        self.assertEqual(item["status"], "retired")

    def test_a_stamp_this_catalog_does_not_know_is_recorded_as_found(self) -> None:
        text = schematic(instance("remote_x:R", ["R9"], {
            "Reference": "R9", "Prism_Component": COMPONENT, "Prism_Revision": REVISION,
        }))
        [item] = self._record(text)["items"]
        self.assertEqual((item["componentId"], item["status"]), (COMPONENT, "unknown_component"))

    def test_rescanning_a_commit_replaces_its_rows(self) -> None:
        released = self._released_part()
        lib_id = f"remote_{self.library.lower()}:R_Usage"
        stamped = instance(lib_id, ["R1"], {"Reference": "R1", **self._placed_fields(released)})
        self.assertEqual(len(self._record(schematic(stamped))["items"]), 1)
        report = self._record(schematic())
        self.assertEqual((report["items"], report["scan"]["symbolCount"]), ([], 0))


@requires_scratch_postgres("project catalog usage scan tests")
class CommitScanTests(_CatalogParts):
    """The service reads a commit's schematics from Git, not the working tree."""

    def test_scan_records_the_committed_schematic_and_report_defaults_to_head(self) -> None:
        released = self._released_part()
        lib_id = f"remote_{self.library.lower()}:R_Usage"
        repo = self.root / "repo"
        committed = schematic(
            instance(lib_id, ["R1"], {"Reference": "R1", **self._placed_fields(released)})
        )
        commit = init_repo(repo, {
            "board/main.kicad_sch": committed,
            "board/sub/child.kicad_sch": schematic(),
            "board/main.kicad_sch-bak": "ignored",
        }, message="board")
        # Uncommitted edits are not scanned.
        (repo / "board" / "main.kicad_sch").write_text(schematic(), encoding="utf-8")
        location = project_revision.ProjectLocation(repo.resolve(), "board")

        # The scan's symbols now come from the bundle's occurrences member
        # (ADR §9.7 R1); this test is about placement resolution and the report.
        symbols = placed_symbols(committed, "main.kicad_sch")
        with (
            patch.object(project_revision, "locate_id", return_value=location),
            patch.object(project_catalog_usage_service, "read_commit_symbols", return_value=symbols),
            patch("app.services.component_catalog_service.catalog_service", self.service),
        ):
            result = project_catalog_usage_service.scan(self.project_id)
            report = project_catalog_usage_service.report(self.project_id)

        self.assertEqual((result["commit"], result["stamped_count"]), (commit, 1))
        self.assertEqual((report["commit"], report["latestScannedCommit"]), (commit, commit))
        [item] = report["items"]
        self.assertEqual((item["status"], item["references"]), ("current", ["R1"]))


if __name__ == "__main__":
    unittest.main()
