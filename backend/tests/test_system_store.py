"""SYS-03: migration 26 and ``SystemStore`` against an isolated PostgreSQL schema."""

from __future__ import annotations

import os
import unittest
import uuid
from unittest import mock

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency guard for host-only checks
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]

from app.services.systems import store as store_module
from app.services.systems.store import (
    Conflict,
    Invalid,
    NotFound,
    StaleVersion,
    SystemStore,
)
from app.services.workspace_migrations import (
    m028_system_review_pending_changes,
    m029_system_import_sessions,
    m030_system_snapshot_manifest,
    m031_system_exports,
    m032_system_catalog_binding,
    m033_system_catalog_instances,
    m034_system_child_reviews,
    m035_system_optional_rules,
    m036_system_port_mating,
    m037_system_link_types,
    m038_system_harnesses,
    m039_system_harness_part_pins,
    m040_system_poses,
)
from app.services.workspace_migrations.m026_system_builder import migrate
from app.services.workspace_schema_migrations import MIGRATIONS

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL", "").strip().replace(
    "postgresql+psycopg://", "postgresql://", 1
)
SHA_A = "a" * 40
SHA_B = "b" * 40
ACTOR = "user:designer@example.com"


def port(key: str, *, reference: str = "J1", pins: int = 4) -> dict:
    return {
        "portKey": key,
        "memberKeys": [key],
        "reference": reference,
        "libId": "Connector_Generic:Conn_01x04",
        "footprint": "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
        "pinCount": pins,
    }


class MigrationRegistryTest(unittest.TestCase):
    def test_migration_26_is_registered(self) -> None:
        self.assertIn((26, "system_builder", migrate), MIGRATIONS)


@unittest.skipUnless(POSTGRES_URL, "TEST_POSTGRES_URL is required for System Builder store tests")
@unittest.skipUnless(psycopg is not None, "psycopg is required for System Builder store tests")
class StoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = f"system_store_{uuid.uuid4().hex}"
        self.conn = psycopg.connect(POSTGRES_URL, row_factory=dict_row)
        self.conn.execute(f'CREATE SCHEMA "{self.schema}"')
        self.conn.execute(f'SET search_path TO "{self.schema}", public')
        self.conn.execute("CREATE TABLE ws_folders (id TEXT PRIMARY KEY)")
        migrate(self.conn)
        migrate(self.conn)  # idempotent
        # The later system-only migrations the store relies on (27 touches workspace tables).
        for later in (m028_system_review_pending_changes, m029_system_import_sessions,
                      m030_system_snapshot_manifest, m031_system_exports, m032_system_catalog_binding,
                      m033_system_catalog_instances, m034_system_child_reviews,
                      m035_system_optional_rules, m036_system_port_mating,
                      m037_system_link_types, m038_system_harnesses, m039_system_harness_part_pins,
                      m040_system_poses):
            later.migrate(self.conn)
        self.conn.commit()
        self.store = SystemStore(self.conn)

    def tearDown(self) -> None:
        try:
            self.conn.rollback()
            self.conn.execute(f'DROP SCHEMA "{self.schema}" CASCADE')
            self.conn.commit()
        finally:
            self.conn.close()

    # ------------------------------------------------------------------ helpers

    def system(self, name: str = "Flight stack") -> dict:
        created = self.store.create_system(name=name, folder_id=None, actor=ACTOR)
        self.conn.commit()
        return created

    def mutate(self, system_id: str, version: int | None = None):
        if version is None:
            version = self.store.get_system(system_id)["version"]
        return self.store.mutation(system_id, expected_version=version, actor=ACTOR)

    def instance(self, system_id: str, label: str, project: str = "prj_obc") -> dict:
        with self.mutate(system_id) as change:
            row = self.store.add_instance(
                change, project_id=project, label=label, baseline_commit=SHA_A,
                tracked_ref="main", pinned=False,
            )
        self.conn.commit()
        return row

    def kinds(self, system_id: str) -> list[str]:
        return [event["kind"] for event in reversed(self.store.history(system_id))]

    # ------------------------------------------------------------------ systems

    def test_create_starts_at_version_one_with_an_audit_event(self) -> None:
        created = self.system()
        self.assertTrue(created["id"].startswith("sys_"))
        self.assertEqual(len(created["id"]), 36)
        self.assertEqual(created["version"], 1)
        self.assertEqual(self.kinds(created["id"]), ["system_created"])
        self.assertEqual(self.store.history(created["id"])[0]["actor"], ACTOR)

    def test_blank_name_is_invalid(self) -> None:
        with self.assertRaises(Invalid):
            self.store.create_system(name="  ", folder_id=None, actor=ACTOR)

    def test_one_mutation_bumps_the_version_once(self) -> None:
        sid = self.system()["id"]
        with self.mutate(sid, 1) as change:
            self.store.add_instance(change, project_id="p", label="A", baseline_commit=SHA_A,
                                    tracked_ref=None, pinned=False)
            self.store.add_instance(change, project_id="p", label="B", baseline_commit=SHA_A,
                                    tracked_ref=None, pinned=False)
        self.conn.commit()
        self.assertEqual(change.version, 2)
        self.assertEqual(self.store.get_system(sid)["version"], 2)
        self.assertEqual(len(change.events), 2)

    def test_stale_version_reports_the_current_one(self) -> None:
        sid = self.system()["id"]
        self.instance(sid, "A")
        with self.assertRaises(StaleVersion) as raised:
            with self.mutate(sid, 1):
                self.fail("must not enter")
        self.assertEqual(raised.exception.current, 2)

    def test_failed_mutation_leaves_no_trace_after_rollback(self) -> None:
        sid = self.system()["id"]
        with self.assertRaises(Conflict):
            with self.mutate(sid) as change:
                self.store.add_instance(change, project_id="p", label="A", baseline_commit=SHA_A,
                                        tracked_ref=None, pinned=False)
                self.store.add_instance(change, project_id="p", label="a", baseline_commit=SHA_A,
                                        tracked_ref=None, pinned=False)
        self.conn.rollback()
        self.assertEqual(self.store.get_system(sid)["version"], 1)
        self.assertEqual(self.store.list_instances(sid), [])
        self.assertEqual(self.kinds(sid), ["system_created"])

    def test_detection_mutation_needs_no_version_but_still_bumps(self) -> None:
        sid = self.system()["id"]
        with self.store.mutation(sid, expected_version=None, actor="system:detection"):
            pass
        self.conn.commit()
        self.assertEqual(self.store.get_system(sid)["version"], 2)

    def test_concurrent_mutations_serialize_on_the_row_lock(self) -> None:
        sid = self.system()["id"]
        other = psycopg.connect(POSTGRES_URL, row_factory=dict_row)
        try:
            other.execute(f'SET search_path TO "{self.schema}", public')
            other.execute("SET lock_timeout = '200ms'")
            other.commit()  # a rolled-back transaction would also revert these SETs
            with self.mutate(sid, 1):
                with self.assertRaises(psycopg.errors.LockNotAvailable):
                    with SystemStore(other).mutation(sid, expected_version=1, actor=ACTOR):
                        pass
                other.rollback()
            self.conn.commit()
            with self.assertRaises(StaleVersion):
                with SystemStore(other).mutation(sid, expected_version=1, actor=ACTOR):
                    pass
        finally:
            other.close()

    def test_update_system_audits_only_real_changes(self) -> None:
        sid = self.system()["id"]
        self.conn.execute("INSERT INTO ws_folders (id) VALUES ('fld_1')")
        with self.mutate(sid) as change:
            self.store.update_system(change, name="Flight stack", folder_id="fld_1")
        self.conn.commit()
        event = self.store.history(sid)[0]
        self.assertEqual(event["kind"], "system_updated")
        self.assertEqual(set(event["payload"]), {"folder_id"})

    def test_folder_deletion_unplaces_the_system(self) -> None:
        self.conn.execute("INSERT INTO ws_folders (id) VALUES ('fld_1')")
        sid = self.store.create_system(name="S", folder_id="fld_1", actor=ACTOR)["id"]
        self.conn.execute("DELETE FROM ws_folders WHERE id = 'fld_1'")
        self.assertIsNone(self.store.get_system(sid)["folder_id"])

    def test_list_systems_counts(self) -> None:
        sid = self.system()["id"]
        self.instance(sid, "A")
        listed = self.store.list_systems()
        self.assertEqual([(s["id"], s["instance_count"], s["open_review_count"]) for s in listed],
                         [(sid, 1, 0)])

    def test_delete_system_removes_everything_it_owns(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with self.mutate(sid) as change:
            link = self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                          b_instance_id=b["id"], b_port=port("/r/b"))
            self.store.replace_rows(change, link["id"], [{"pinA": "1", "pinB": "1"}])
        self.store.put_layout(sid, {"x": 1})
        self.store.delete_system(sid)
        for table in ("system_instances", "system_links", "system_link_rows",
                      "system_audit_events", "system_layouts"):
            self.assertEqual(self.conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"], 0, table)
        with self.assertRaises(NotFound):
            self.store.delete_system(sid)

    # ------------------------------------------------------------------ instances

    def test_labels_are_unique_ignoring_case(self) -> None:
        sid = self.system()["id"]
        self.instance(sid, "OBC-A")
        with self.assertRaises(Conflict):
            self.instance(sid, "obc-a")
        self.conn.rollback()
        other = self.system("Other")["id"]
        self.instance(other, "OBC-A")  # labels are per system

    def test_instance_rejects_short_or_upper_case_commits(self) -> None:
        sid = self.system()["id"]
        for commit in ("abc123", "A" * 40, ""):
            with self.assertRaises(Invalid):
                with self.mutate(sid) as change:
                    self.store.add_instance(change, project_id="p", label="X", baseline_commit=commit,
                                            tracked_ref=None, pinned=False)
            self.conn.rollback()

    def test_instance_limit(self) -> None:
        sid = self.system()["id"]
        with mock.patch.object(store_module, "MAX_INSTANCES", 2):
            self.instance(sid, "A")
            self.instance(sid, "B")
            with self.assertRaises(Invalid):
                self.instance(sid, "C")

    def test_update_instance_and_baseline(self) -> None:
        sid = self.system()["id"]
        inst = self.instance(sid, "A")
        with self.mutate(sid) as change:
            self.store.update_instance(change, inst["id"], pinned=True, tracked_ref=None)
            self.store.set_baseline(change, inst["id"], SHA_B, kind="baseline_auto_advanced")
        self.conn.commit()
        row = self.store.get_instance(sid, inst["id"])
        self.assertEqual((row["pinned"], row["tracked_ref"], row["baseline_commit"]), (True, None, SHA_B))
        event = self.store.history(sid)[0]
        self.assertEqual((event["kind"], event["payload"]["from"], event["payload"]["to"]),
                         ("baseline_auto_advanced", SHA_A, SHA_B))

    def test_reverse_index_spans_systems(self) -> None:
        one, two = self.system("One")["id"], self.system("Two")["id"]
        a = self.instance(one, "OBC-A", "prj_obc")
        b = self.instance(one, "OBC-B", "prj_obc")
        c = self.instance(two, "OBC", "prj_obc")
        self.instance(two, "PWR", "prj_power")
        found = {row["id"] for row in self.store.instances_for_projects(["prj_obc"])}
        self.assertEqual(found, {a["id"], b["id"], c["id"]})
        self.assertEqual(self.store.instances_for_projects([]), [])

    def test_deleted_project_leaves_instances_unresolved(self) -> None:
        sid = self.system()["id"]
        inst = self.instance(sid, "A", "prj_gone")
        version = self.store.get_system(sid)["version"]
        self.assertEqual(self.store.mark_project_unresolved("prj_gone"), [sid])
        self.assertEqual(self.store.get_instance(sid, inst["id"])["resolution"], "unresolved")
        self.assertEqual(self.store.get_system(sid)["version"], version + 1)
        self.assertEqual(self.store.mark_project_unresolved("prj_gone"), [])

    def test_instance_with_links_needs_cascade(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with self.mutate(sid) as change:
            link = self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                          b_instance_id=b["id"], b_port=port("/r/b"))
        self.conn.commit()
        with self.assertRaises(Conflict):
            with self.mutate(sid) as change:
                self.store.remove_instance(change, a["id"], cascade_links=False)
        self.conn.rollback()
        with self.mutate(sid) as change:
            self.store.remove_instance(change, a["id"], cascade_links=True)
        self.conn.commit()
        self.assertEqual(self.store.list_links(sid), [])
        event = self.store.history(sid)[0]
        self.assertEqual((event["kind"], event["payload"]["removedLinks"]),
                         ("instance_removed", [link["id"]]))

    # ------------------------------------------------------------------ overrides

    def test_linked_port_cannot_be_hidden(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with self.mutate(sid) as change:
            self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                   b_instance_id=b["id"], b_port=port("/r/b"))
            self.store.set_override(change, a["id"], "/r/other", "promoted")
        self.conn.commit()
        with self.assertRaises(Conflict):
            with self.mutate(sid) as change:
                self.store.set_override(change, a["id"], "/r/a", "hidden")
        self.conn.rollback()
        self.assertEqual(self.store.list_overrides(a["id"]), {"/r/other": "promoted"})
        with self.mutate(sid) as change:
            self.store.set_override(change, a["id"], "/r/other", None)
        self.assertEqual(self.store.list_overrides(a["id"]), {})
        with self.assertRaises(Invalid):
            with self.mutate(sid) as change:
                self.store.set_override(change, a["id"], "/r/x", "visible")

    # ------------------------------------------------------------------ links and rows

    def test_link_validation(self) -> None:
        sid = self.system()["id"]
        a = self.instance(sid, "A")
        with self.assertRaises(Invalid):
            with self.mutate(sid) as change:
                self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                       b_instance_id=a["id"], b_port=port("/r/a"))
        self.conn.rollback()
        broken = port("/r/a")
        broken["memberKeys"] = ["/r/other"]
        with self.assertRaises(Invalid):
            with self.mutate(sid) as change:
                self.store.create_link(change, a_instance_id=a["id"], a_port=broken,
                                       b_instance_id=a["id"], b_port=port("/r/b"))
        self.conn.rollback()
        # Two ports on one instance are a legal loop-back link.
        with self.mutate(sid) as change:
            self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                   b_instance_id=a["id"], b_port=port("/r/b"))

    def test_links_cannot_reach_into_another_system(self) -> None:
        one, two = self.system("One")["id"], self.system("Two")["id"]
        a, foreign = self.instance(one, "A"), self.instance(two, "B")
        with self.assertRaises(NotFound):
            with self.mutate(one) as change:
                self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                       b_instance_id=foreign["id"], b_port=port("/r/b"))
        self.conn.rollback()
        # The composite key enforces the same rule in the database itself.
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            self.conn.execute(
                """
                INSERT INTO system_links (id, system_id, a_instance_id, a_port, b_instance_id, b_port)
                VALUES ('slk_x', %s, %s, '{}', %s, '{}')
                """,
                (one, a["id"], foreign["id"]),
            )

    def test_replace_rows(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with self.mutate(sid) as change:
            link = self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                          b_instance_id=b["id"], b_port=port("/r/b"),
                                          name="A ↔ B", harness="WH-001")
            rows = self.store.replace_rows(change, link["id"], [
                {"pinA": "1", "pinB": "1", "signal": "GND", "netA": ["GND", "GND"], "netB": ["GND"]},
                {"pinA": "01", "pinB": "2", "signal": "VIN", "netA": ["/b", "/a"], "source": "import"},
            ])
        self.conn.commit()
        by_pin = {row["pin_a"]: row for row in rows}
        self.assertEqual(set(by_pin), {"1", "01"})  # pad numbers stay strings
        self.assertEqual(by_pin["1"]["net_a"], ["GND"])
        self.assertEqual(by_pin["01"]["net_a"], ["/a", "/b"])
        self.assertEqual(by_pin["01"]["source"], "import")
        keep = by_pin["1"]["id"]
        with self.mutate(sid) as change:
            again = self.store.replace_rows(change, link["id"], [{"id": keep, "pinA": "1", "pinB": "3"}])
        self.conn.commit()
        self.assertEqual([(r["id"], r["pin_b"]) for r in again], [(keep, "3")])
        event = self.store.history(sid)[0]
        self.assertEqual(event["payload"]["removed"], [by_pin["01"]["id"]])
        for bad, error in (
            ([{"pinA": "1", "pinB": "1"}, {"pinA": "1", "pinB": "1"}], Invalid),
            ([{"pinA": "", "pinB": "1"}], Invalid),
            ([{"pinA": "1", "pinB": "1", "source": "guess"}], Invalid),
            ([{"id": "srw_elsewhere", "pinA": "1", "pinB": "1"}], Conflict),
        ):
            with self.assertRaises(error):
                with self.mutate(sid) as change:
                    self.store.replace_rows(change, link["id"], bad)
            self.conn.rollback()

    def test_row_and_link_limits(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with mock.patch.object(store_module, "MAX_ROWS", 2), mock.patch.object(store_module, "MAX_LINKS", 1):
            with self.mutate(sid) as change:
                link = self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                              b_instance_id=b["id"], b_port=port("/r/b"))
            self.conn.commit()
            with self.assertRaises(Invalid):
                with self.mutate(sid) as change:
                    self.store.replace_rows(change, link["id"], [
                        {"pinA": str(i), "pinB": str(i)} for i in range(1, 4)])
            self.conn.rollback()
            with self.assertRaises(Invalid):
                with self.mutate(sid) as change:
                    self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/c"),
                                           b_instance_id=b["id"], b_port=port("/r/d"))

    def test_set_link_port_and_delete(self) -> None:
        sid = self.system()["id"]
        a, b = self.instance(sid, "A"), self.instance(sid, "B")
        with self.mutate(sid) as change:
            link = self.store.create_link(change, a_instance_id=a["id"], a_port=port("/r/a"),
                                          b_instance_id=b["id"], b_port=port("/r/b"))
            self.store.set_link_port(change, link["id"], "a", port("/r/a2", reference="J12"))
        self.conn.commit()
        self.assertEqual(self.store.get_link(sid, link["id"])["a_port"]["reference"], "J12")
        with self.assertRaises(Invalid):
            with self.mutate(sid) as change:
                self.store.set_link_port(change, link["id"], "c", port("/r/a"))
        self.conn.rollback()
        with self.mutate(sid) as change:
            self.store.delete_link(change, link["id"])
        with self.assertRaises(NotFound):
            self.store.get_link(sid, link["id"])

    # ------------------------------------------------------------------ layout, history

    def test_layout_is_not_engineering_state(self) -> None:
        sid = self.system()["id"]
        self.store.put_layout(sid, {"sin_1": {"x": 10, "y": 20}})
        self.store.put_layout(sid, {"sin_1": {"x": 11, "y": 20}})
        self.assertEqual(self.store.get_layout(sid), {"sin_1": {"x": 11, "y": 20}})
        self.assertEqual(self.store.get_system(sid)["version"], 1)
        self.assertEqual(self.kinds(sid), ["system_created"])

    def test_history_pages_newest_first(self) -> None:
        sid = self.system()["id"]
        for label in ("A", "B", "C"):
            self.instance(sid, label)
        page = self.store.history(sid, limit=2)
        self.assertEqual([e["payload"]["label"] for e in page], ["C", "B"])
        rest = self.store.history(sid, before_seq=page[-1]["seq"])
        self.assertEqual([e["kind"] for e in rest], ["instance_added", "system_created"])

    # ------------------------------------------------------------------ artifacts, checks

    def test_interface_cache_first_writer_wins(self) -> None:
        first = {"projectId": "prj_obc", "commit": SHA_A, "extractor": {"version": "1"},
                 "digest": "sha256:one", "components": []}
        second = {**first, "digest": "sha256:two"}
        self.assertEqual(self.store.put_interface(first)["digest"], "sha256:one")
        self.assertEqual(self.store.put_interface(second)["digest"], "sha256:one")
        self.assertIsNone(self.store.get_interface("prj_obc", SHA_A, "2"))
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.store.put_interface({**first, "commit": "abc"})

    def test_source_check_bookkeeping(self) -> None:
        sid = self.system()["id"]
        inst = self.instance(sid, "A")
        self.store.record_source_check(inst["id"], tip_commit=SHA_B, checked_commit=SHA_B,
                                       outcome="auto_advanced")
        self.store.record_source_check(inst["id"], tip_commit=None, checked_commit=None,
                                       outcome="ref_missing")
        check = self.store.get_source_check(inst["id"])
        self.assertEqual((check["last_checked_commit"], check["last_outcome"]), (SHA_B, "ref_missing"))
        self.assertIsNone(self.store.get_instance(sid, inst["id"])["tip_commit"])
        self.assertEqual(self.store.get_system(sid)["version"], 2)  # bookkeeping is not a mutation

    # ------------------------------------------------------------------ review constraints

    def test_review_constraints(self) -> None:
        sid = self.system()["id"]
        inst = self.instance(sid, "A")
        insert = """
            INSERT INTO system_reviews (id, system_id, instance_id, kind, status)
            VALUES (%s, %s, %s, %s, %s)
        """
        self.conn.execute(insert, ("srv_1", sid, inst["id"], "source_update", "open"))
        self.conn.execute(insert, ("srv_2", sid, inst["id"], "source_update", "superseded"))
        with self.assertRaises(psycopg.errors.UniqueViolation):
            self.conn.execute(insert, ("srv_3", sid, inst["id"], "baseline_unreachable", "open"))
        self.conn.rollback()
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.conn.execute(insert, ("srv_4", sid, inst["id"], "import", "open"))
        self.conn.rollback()
        self.conn.execute(insert, ("srv_5", sid, None, "import", "open"))
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.conn.execute(
                "INSERT INTO system_review_items (id, review_id, ordinal, kind, link_end) "
                "VALUES ('sri_1', 'srv_5', 0, 'net_changed', 'c')"
            )


if __name__ == "__main__":
    unittest.main()
