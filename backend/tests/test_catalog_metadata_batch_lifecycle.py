"""A metadata batch from staging to accounting, through ``metadata_batch_lifecycle``."""

from __future__ import annotations

import sys
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

ACTOR = "designer@example.com"


@requires_scratch_postgres("metadata batch lifecycle tests")
class MetadataBatchLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService

        self.tempdir = tempfile.TemporaryDirectory()
        self.service = ComponentCatalogPostgresService(
            store_root=Path(self.tempdir.name) / "components", database_url=CATALOG_URL,
        )
        self.service.initialize()
        self.lifecycle = self.service.metadata_batch_lifecycle
        self.token = uuid.uuid4().hex[:8]
        self.component_ids: list[str] = []
        self.field_keys: list[str] = []

    def tearDown(self) -> None:
        fields = {field["key"]: field for field in self.service.list_metadata_fields(include_archived=True)}
        for key in self.field_keys:
            if key in fields and not fields[key]["archived"]:
                self.service.set_metadata_field_archived(str(fields[key]["id"]), True, actor="test@local")
        for component_id in self.component_ids:
            self.service.deactivate_component(component_id, actor="test@local", reason="batch lifecycle test cleanup")
        self.service.close()
        self.tempdir.cleanup()

    def _part(self, label: str) -> dict:
        part = self.service.create_manual_component(
            value="10k", description="Batch lifecycle part", datasheet="https://example.com/r.pdf",
            manufacturer="Prism Batch", manufacturer_part_number=f"PB-{label}-{self.token}", actor="author@example.com",
        )
        self.component_ids.append(str(part["id"]))
        return part

    def _field_keys(self) -> set[str]:
        return {field["key"] for field in self.service.list_metadata_fields(include_archived=True)}

    def _item(self, batch: dict, component_id: str) -> dict:
        return next(item for item in self.lifecycle.get(batch["id"])["items"] if item["component_id"] == component_id)

    def test_a_conflicting_item_is_marked_and_does_not_roll_back_the_others(self) -> None:
        first, second = self._part("A"), self._part("B")
        batch = self.lifecycle.stage(
            [
                {"component_id": first["id"], "expected_revision_id": first["revision_id"], "patch": {"value": "12k"}},
                {"component_id": second["id"], "expected_revision_id": second["revision_id"], "patch": {"value": "15k"}},
            ],
            source="grid", actor=ACTOR, change_summary="Two edits",
        )
        self.assertEqual((batch["status"], batch["total_items"], batch["valid_items"]), ("ready", 2, 2))
        # The second part moves on after staging, so its staged revision is stale.
        self.service.update_component_metadata(
            second["id"], {"description": "Edited elsewhere"}, actor="other@example.com",
            expected_revision_id=second["revision_id"],
        )
        progress: list[dict] = []

        result = self.lifecycle.apply(batch["id"], actor=ACTOR, progress_callback=progress.append)

        self.assertEqual((result["status"], result["applied"], result["failed"]), ("partial", 1, 1))
        self.assertEqual([error["item_id"] for error in result["errors"]], [self._item(batch, second["id"])["id"]])
        self.assertEqual([entry["completed"] for entry in progress], [1, 2])
        self.assertEqual(progress[-1], {"completed": 2, "total": 2, "applied": 1, "failed": 1})
        self.assertEqual(self.service.get_component(first["id"])["value"], "12k")
        self.assertEqual(self.service.get_component(second["id"])["value"], "10k")
        self.assertEqual(self._item(batch, first["id"])["validation_status"], "applied")
        conflict = self._item(batch, second["id"])
        self.assertEqual(conflict["validation_status"], "conflict")
        self.assertIn("revision", conflict["error_message"].lower())
        accounted = self.lifecycle.get(batch["id"])
        self.assertEqual(
            (accounted["status"], accounted["valid_items"], accounted["applied_items"], accounted["failed_items"]),
            ("partial", 0, 1, 1),
        )

    def test_two_applies_on_one_batch_never_mark_an_applied_item_conflict(self) -> None:
        part = self._part("J")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {"value": "68k"}}],
            source="grid", actor=ACTOR, change_summary="Concurrent apply",
        )
        lifecycle = self.lifecycle
        real_apply_item = lifecycle._apply_item
        start = threading.Barrier(2)
        entered = threading.Lock()
        winner: list[str] = []
        loser_arrived = threading.Event()
        winner_done = threading.Event()

        def apply_item(candidate: str, *, actor: str) -> None:
            with entered:
                first = not winner
                if first:
                    winner.append(candidate)
            if first:
                # Without the batch lock both applies reach this point: wait
                # for the loser to read its stale row before committing.
                loser_arrived.wait(timeout=1.0)
                try:
                    real_apply_item(candidate, actor=actor)
                finally:
                    winner_done.set()
            else:
                loser_arrived.set()
                winner_done.wait(timeout=10)
                raise ValueError("Component revision conflict: current revision changed after preview")

        def run() -> dict:
            start.wait(timeout=10)
            return lifecycle.apply(batch["id"], actor=ACTOR)

        with (
            mock.patch.object(lifecycle, "_apply_item", side_effect=apply_item),
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            results = list(executor.map(lambda _: run(), range(2)))

        self.assertEqual(self._item(batch, part["id"])["validation_status"], "applied")
        accounted = self.lifecycle.get(batch["id"])
        self.assertEqual((accounted["applied_items"], accounted["failed_items"]), (1, 0))
        self.assertEqual(sum(result["applied"] for result in results), 1)

    def test_a_late_conflict_never_overwrites_an_applied_item(self) -> None:
        part = self._part("K")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {"value": "82k"}}],
            source="grid", actor=ACTOR, change_summary="Applied first",
        )
        self.assertEqual(self.lifecycle.apply(batch["id"], actor=ACTOR)["status"], "completed")
        item_id = self._item(batch, part["id"])["id"]

        with self.lifecycle._connect() as conn:
            self.lifecycle._batches.mark_item_conflict(conn, item_id, "late conflict", "2026-01-01T00:00:00Z")
            conn.commit()

        self.assertEqual(self._item(batch, part["id"])["validation_status"], "applied")

    def test_applying_again_skips_what_was_applied(self) -> None:
        part = self._part("C")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {"value": "22k"}}],
            source="grid", actor=ACTOR, change_summary="One edit",
        )
        self.assertEqual(self.lifecycle.apply(batch["id"], actor=ACTOR)["status"], "completed")
        again = self.lifecycle.apply(batch["id"], actor=ACTOR)
        self.assertEqual((again["status"], again["applied"], again["failed"]), ("completed", 0, 0))
        with self.assertRaisesRegex(ValueError, "None of the selected"):
            self.lifecycle.apply(batch["id"], actor=ACTOR, item_ids=[self._item(batch, part["id"])["id"]])

    def test_proposed_fields_gate_apply_and_an_existing_key_is_not_an_error(self) -> None:
        existing_key, new_key = f"existing_{self.token}", f"fresh_{self.token}"
        self.field_keys += [existing_key, new_key]
        self.service.create_metadata_field({"key": existing_key, "label": "Existing"}, actor="admin@example.com")
        part = self._part("D")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {new_key: "x"}}],
            source="csv", actor=ACTOR, change_summary="Needs fields",
            proposed_fields=[
                {"key": existing_key, "label": "Existing", "type": "text", "enum_values": []},
                {"key": new_key, "label": "Fresh", "type": "text", "enum_values": []},
            ],
        )
        self.assertEqual(batch["status"], "needs_fields")
        with self.assertRaisesRegex(ValueError, "must be approved"):
            self.lifecycle.apply(batch["id"], actor=ACTOR)

        approved = self.lifecycle.approve_fields(batch["id"], actor="admin@example.com")

        self.assertEqual((approved["status"], approved["unknown_fields"]), ("ready", []))
        self.assertLessEqual({existing_key, new_key}, self._field_keys())
        self.assertEqual(self.lifecycle.apply(batch["id"], actor=ACTOR)["applied"], 1)
        self.assertEqual(self.service.get_component(part["id"])["extra_fields"][new_key], "x")

    def test_a_failing_proposal_approves_none_of_the_batch_fields(self) -> None:
        # D9: approval is all-or-nothing, in one transaction.
        created_key, bad_key = f"kept_{self.token}", f"bad_{self.token}"
        self.field_keys += [created_key, bad_key]
        part = self._part("E")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {"value": "33k"}}],
            source="csv", actor=ACTOR, change_summary="Bad proposal",
            proposed_fields=[
                {"key": created_key, "label": "Kept", "type": "text", "enum_values": []},
                {"key": bad_key, "label": "Bad", "type": "enum", "enum_values": []},
            ],
        )

        with self.assertRaisesRegex(ValueError, "Enum fields require"):
            self.lifecycle.approve_fields(batch["id"], actor="admin@example.com")

        self.assertNotIn(created_key, self._field_keys())
        self.assertNotIn(bad_key, self._field_keys())
        self.assertEqual(self.lifecycle.get(batch["id"])["status"], "needs_fields")

    def test_a_failing_insert_rolls_back_the_fields_created_before_it(self) -> None:
        first_key, second_key = f"first_{self.token}", f"second_{self.token}"
        self.field_keys += [first_key, second_key]
        part = self._part("H")
        batch = self.lifecycle.stage(
            [{"component_id": part["id"], "expected_revision_id": part["revision_id"], "patch": {"value": "39k"}}],
            source="csv", actor=ACTOR, change_summary="Insert fails",
            proposed_fields=[
                {"key": first_key, "label": "First", "type": "text", "enum_values": []},
                {"key": second_key, "label": "Second", "type": "text", "enum_values": []},
            ],
        )
        fields = self.lifecycle._metadata_fields
        real = fields.create_field_unless_defined

        def fail_on_second(conn, prepared, actor):
            if prepared.field_key == second_key:
                raise ValueError("insert failed")
            return real(conn, prepared, actor)

        with mock.patch.object(fields, "create_field_unless_defined", side_effect=fail_on_second):
            with self.assertRaisesRegex(ValueError, "insert failed"):
                self.lifecycle.approve_fields(batch["id"], actor="admin@example.com")

        self.assertNotIn(first_key, self._field_keys())
        self.assertEqual(self.lifecycle.get(batch["id"])["status"], "needs_fields")

    def test_unknown_batches_are_refused(self) -> None:
        missing = str(uuid.uuid4())
        self.assertIsNone(self.lifecycle.get(missing))
        with self.assertRaisesRegex(ValueError, "not found"):
            self.lifecycle.approve_fields(missing, actor=ACTOR)
        with self.assertRaisesRegex(ValueError, "not found"):
            self.lifecycle.apply(missing, actor=ACTOR)

    def test_a_csv_stages_only_changed_rows_and_proposes_unknown_columns(self) -> None:
        changed, unchanged = self._part("F"), self._part("G")
        column = f"Lifecycle Note {self.token}"
        proposed_key = f"lifecycle_note_{self.token}"
        self.field_keys.append(proposed_key)
        csv_text = (
            f"component_id,expected_revision_id,value,{column}\n"
            f"{changed['id']},{changed['revision_id']},47k,checked\n"
            f"{unchanged['id']},{unchanged['revision_id']},10k,\n"
        )

        batch = self.lifecycle.stage_csv(csv_text, actor=ACTOR, change_summary="CSV edit")

        self.assertEqual((batch["source_rows"], batch["skipped_unchanged_rows"]), (2, 1))
        self.assertEqual((batch["status"], batch["total_items"]), ("needs_fields", 1))
        self.assertEqual([field["key"] for field in batch["unknown_fields"]], [proposed_key])
        self.assertEqual(batch["items"][0]["patch"], {"value": "47k", proposed_key: "checked"})
        self.lifecycle.approve_fields(batch["id"], actor="admin@example.com")
        self.assertEqual(self.lifecycle.apply(batch["id"], actor=ACTOR)["applied"], 1)
        self.assertEqual(self.service.get_component(changed["id"])["value"], "47k")


if __name__ == "__main__":
    unittest.main()
