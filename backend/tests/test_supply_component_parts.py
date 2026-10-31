"""A component's main part and its alternates (``component_parts``), against a real catalog.

Needs ``TEST_POSTGRES_URL``: the table refers to catalog components, so these tests run where the catalog lives.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
import unittest.mock
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402
from support.postgres import CATALOG_URL, requires_scratch_postgres  # noqa: E402

AUTHOR = "author@example.com"


@requires_scratch_postgres("component parts")
class ComponentPartsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_component_parts, supply_connectors
        from app.core.security import AuthenticatedUser
        from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService
        from app.services.supply import component_parts
        from app.services.supply.store import SupplyStore

        cls.tempdir = tempfile.TemporaryDirectory()
        cls.catalog = ComponentCatalogPostgresService(store_root=Path(cls.tempdir.name) / "components", database_url=CATALOG_URL)
        cls.catalog.initialize()
        cls.store = type("CatalogSupplyStore", (SupplyStore,), {"url": CATALOG_URL})()
        cls.store._initialized = True  # the catalog service above ran the ledger, supply tables included
        cls.cp = component_parts
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "designer", "qa", "admin")}
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_component_parts.router)
        cls.service_patch = unittest.mock.patch.object(supply_connectors, "service", type("S", (), {"store": cls.store})())
        cls.service_patch.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.service_patch.stop()
        cls.tempdir.cleanup()

    def _component(self) -> dict:
        token = uuid.uuid4().hex[:10]
        component = self.catalog.create_manual_component(
            value="10k", description="Component parts test", datasheet="https://example.com/r.pdf",
            manufacturer=f"Maker {token}", manufacturer_part_number=f"CP-{token}", actor=AUTHOR,
        )
        self.addCleanup(self.catalog.deactivate_component, str(component["id"]), actor=AUTHOR, reason="component parts test cleanup")
        return component

    def _parts(self, component_id: str) -> list[dict]:
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            return self.cp.parts_of(conn, component_id)

    def _call(self, role: str, method: str, path: str, body=None):
        return _request(self.app, method, path, user=self.users[role], body=body)

    def test_a_number_written_with_other_spaces_dashes_or_case_finds_the_component_without_reading_the_catalog(self) -> None:
        from app.services import component_catalog_service
        from app.services.supply import catalog_read

        component = self._component()
        number = component["mpn"]  # CP-<token>
        found = self.catalog.components_by_compact_number([number.replace("-", "").upper()])
        self.assertEqual([item["id"] for item in found], [str(component["id"])])

        with unittest.mock.patch.object(component_catalog_service, "catalog_service", self.catalog), \
                unittest.mock.patch.object(self.catalog, "list_components", side_effect=AssertionError("read the whole catalog")):
            maker = component["manufacturer"]
            have = catalog_read.in_library([(f"{maker} Inc.", number.replace("-", " ").lower())])
            self.assertEqual(len(have), 1, "another spelling of the maker, the number written differently")
            self.assertEqual(catalog_read.component_for(maker, number.replace("-", "")), str(component["id"]))

        self.catalog.deactivate_component(str(component["id"]), actor=AUTHOR, reason="component parts test")
        self.assertEqual(self.catalog.components_by_compact_number([number.replace("-", "").upper()]), [], "a retired component")

    def test_the_main_part_follows_the_current_revision(self) -> None:
        component = self._component()
        (main,) = self._parts(str(component["id"]))
        self.assertEqual((main["role"], main["approval"], main["mpn"]), ("main", "approved", component["mpn"]))

        renamed = f"{component['mpn']}-B"
        self.catalog.update_component_metadata(str(component["id"]), {"mpn": renamed}, actor=AUTHOR, expected_revision_id=component["revision_id"])
        (main,) = self._parts(str(component["id"]))
        self.assertEqual(main["mpn"], renamed, "the old main part is no longer the component's")

    def test_an_alternate_counts_only_once_qa_approves_it(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            main_id = self.cp.parts_of(conn, component_id)[0]["part_id"]
            proposed = self.cp.propose_alternate(conn, component_id, component["manufacturer"], f"ALT-{uuid.uuid4().hex[:8]}", AUTHOR)
            self.assertEqual(self.cp.counted_parts(conn, [component_id]), {component_id: [main_id]}, "a pending alternate does not count")
            self.cp.decide(conn, component_id, proposed["part_id"], True, "qa@example.com")
            self.assertEqual(self.cp.counted_parts(conn, [component_id]), {component_id: [main_id, proposed["part_id"]]})
            self.assertEqual(self.cp.components_of(conn, [proposed["part_id"]]), {proposed["part_id"]: [component_id]})
            self.cp.decide(conn, component_id, proposed["part_id"], False, "qa@example.com")
            self.assertEqual(self.cp.counted_parts(conn, [component_id]), {component_id: [main_id]}, "a rejected alternate stops counting")

    def test_the_main_part_cannot_also_be_an_alternate_and_an_alternate_is_not_proposed_twice(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            with self.assertRaisesRegex(self.cp.ComponentPartError, "main part"):
                self.cp.propose_alternate(conn, component_id, component["manufacturer"], component["mpn"], AUTHOR)
            number = f"ALT-{uuid.uuid4().hex[:8]}"
            self.cp.propose_alternate(conn, component_id, component["manufacturer"], number, AUTHOR)
            with self.assertRaisesRegex(self.cp.ComponentPartError, "already an alternate"):
                self.cp.propose_alternate(conn, component_id, component["manufacturer"], number, AUTHOR)

    def test_an_approved_alternate_becomes_the_main_part_when_the_revision_names_it(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        number = f"ALT-{uuid.uuid4().hex[:8]}"
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            proposed = self.cp.propose_alternate(conn, component_id, component["manufacturer"], number, AUTHOR)
        self.catalog.update_component_metadata(component_id, {"mpn": number}, actor=AUTHOR, expected_revision_id=component["revision_id"])
        (main,) = self._parts(component_id)
        self.assertEqual((main["part_id"], main["role"], main["approval"]), (proposed["part_id"], "main", "approved"))

    def test_an_unknown_component_is_refused(self) -> None:
        with self.store.connection() as conn:
            with self.assertRaisesRegex(self.cp.ComponentPartError, "no such component"):
                self.cp.propose_alternate(conn, "no-such-component", "Maker", f"X-{uuid.uuid4().hex[:8]}", AUTHOR)

    def test_designers_propose_qa_decides_and_viewers_see_nothing(self) -> None:
        component = self._component()
        base = f"/api/supply/components/{component['id']}"
        self.assertEqual(self._call("viewer", "GET", f"{base}/parts").status, 403)
        listed = self._call("designer", "GET", f"{base}/parts")
        self.assertEqual((listed.status, [part["role"] for part in listed.json["parts"]]), (200, ["main"]))

        proposed = self._call("designer", "POST", f"{base}/alternates", {"manufacturer": component["manufacturer"], "mpn": f"ALT-{uuid.uuid4().hex[:8]}"})
        self.assertEqual(proposed.status, 200)
        alternate = proposed.json["parts"][1]
        self.assertEqual(alternate["approval"], "pending")

        decision = f"{base}/alternates/{alternate['part_id']}/decision"
        self.assertEqual(self._call("designer", "POST", decision, {"approve": True}).status, 403, "designers do not decide")
        approved = self._call("qa", "POST", decision, {"approve": True})
        self.assertEqual((approved.status, approved.json["parts"][1]["approval"]), (200, "approved"))

        self.assertEqual(self._call("qa", "DELETE", f"{base}/alternates/{alternate['part_id']}").status, 204)
        self.assertEqual([part["role"] for part in self._call("qa", "GET", f"{base}/parts").json["parts"]], ["main"])
        self.assertEqual(self._call("qa", "DELETE", f"{base}/alternates/{alternate['part_id']}").json["code"], "component_part_error")

    # --- only library parts are followed (D12, D14) ---------------------------------------------------------------

    def test_a_number_with_no_library_component_cannot_be_watched(self) -> None:
        from app.services.supply import watches

        with self.store.connection() as conn:
            with self.assertRaises(self.cp.NotInLibrary):
                watches.add_watch(conn, "Nobody", f"LOOSE-{uuid.uuid4().hex[:8]}", AUTHOR)
        component = self._component()
        with self.store.connection() as conn:
            # No sync has run for the new component: the watch syncs its main part itself.
            record, created = watches.add_watch(conn, "", component["mpn"], AUTHOR)
            self.assertTrue(created)
            self.assertEqual(self.cp.parts_of(conn, str(component["id"]))[0]["part_id"], record.part_id)

    def test_only_library_parts_get_a_tier(self) -> None:
        from app.services.supply import parts, tracking

        component = self._component()
        with self.store.connection() as conn:
            loose = parts.ensure_part(conn, "Nobody", f"LOOSE-{uuid.uuid4().hex[:8]}", AUTHOR)
            library = self.cp.library_part(conn, component["manufacturer"], component["mpn"], AUTHOR)
            for part in (loose, library):
                conn.execute(
                    "INSERT INTO supply_watches (id, part_id, tier, rate, origin, owner, created_by) VALUES (%s, %s, 2, 'weekly', 'person', %s, %s)",
                    (uuid.uuid4().hex, part.id, AUTHOR, AUTHOR),
                )
            tracking.recompute(conn, [loose.id, library.id])
            tiered = {row["part_id"] for row in conn.execute(
                "SELECT part_id FROM supply_part_tiers WHERE part_id = ANY(%s)", ([loose.id, library.id],)).fetchall()}
        self.assertEqual(tiered, {library.id}, "a watch on a non-library part is never polled")

    def test_a_notice_must_name_library_parts(self) -> None:
        body = {"title": "EOL", "kind": "end_of_life", "parts": [{"manufacturer": "Nobody", "mpn": f"LOOSE-{uuid.uuid4().hex[:8]}"}]}
        from app.api import supply_pcn

        from app.core.errors import install_error_handlers

        app = type(self.app)()
        install_error_handlers(app)
        app.include_router(supply_pcn.router)
        answer = _request(app, "POST", "/api/supply/notices", user=self.users["admin"], body=body)
        self.assertEqual((answer.status, answer.json["code"]), (400, "not_in_library"))

    def test_one_off_results_for_non_library_numbers_expire(self) -> None:
        from datetime import datetime, timedelta, timezone

        from app.services.supply import oneoff, parts

        component = self._component()
        now = datetime.now(timezone.utc)
        with self.store.connection() as conn:
            loose = parts.ensure_part(conn, "Nobody", f"LOOSE-{uuid.uuid4().hex[:8]}", AUTHOR)
            recent = parts.ensure_part(conn, "Nobody", f"LOOSE-{uuid.uuid4().hex[:8]}", AUTHOR)
            library = self.cp.library_part(conn, component["manufacturer"], component["mpn"], AUTHOR)
            connector = conn.execute(
                "INSERT INTO supply_connectors (id, provider, display_name) VALUES (%s, 'csv', %s) RETURNING id",
                (uuid.uuid4().hex, f"expiry {uuid.uuid4().hex[:6]}"),
            ).fetchone()["id"]
            for part, age in ((loose, 8), (recent, 2), (library, 8)):
                request_id = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO supply_read_requests (id, kind, requested_by, created_at) VALUES (%s, 'bom', %s, %s)",
                    (request_id, AUTHOR, now - timedelta(days=age)),
                )
                conn.execute(
                    "INSERT INTO supply_read_request_work (request_id, part_id, connector_id) VALUES (%s, %s, %s)",
                    (request_id, part.id, connector),
                )
            oneoff.expire(conn, now)
            left = {row["id"] for row in conn.execute(
                "SELECT id FROM supply_parts WHERE id = ANY(%s)", ([loose.id, recent.id, library.id],)).fetchall()}
            conn.execute("DELETE FROM supply_connectors WHERE id = %s", (connector,))
        self.assertEqual(left, {recent.id, library.id}, "only the week-old check of a non-library number is gone")

    def test_a_proposed_alternate_waits_in_review_until_qa_decides(self) -> None:
        from app.services.supply import review

        component = self._component()
        component_id = str(component["id"])
        other = self._component()
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id, str(other["id"])])
            proposed = self.cp.propose_alternate(conn, component_id, other["manufacturer"], other["mpn"], AUTHOR)

            def waiting() -> list[tuple[str, str]]:
                return [(item["component_id"], item["part_id"]) for item in review.to_approve(conn)["alternates"]
                        if item["component_id"] == component_id]

            self.assertEqual(waiting(), [(component_id, proposed["part_id"])])
            (item,) = [item for item in review.to_approve(conn)["alternates"] if item["component_id"] == component_id]
            self.assertEqual((item["mpn"], item["proposed_by"]), (other["mpn"], AUTHOR))
            self.cp.decide(conn, component_id, proposed["part_id"], True, "qa@example.com")
            self.assertEqual(waiting(), [], "decided")

    def test_a_decision_taken_against_a_main_part_that_has_since_changed_is_refused(self) -> None:
        from app.services.supply import review
        from app.services.supply.errors import Clash

        component = self._component()
        component_id = str(component["id"])
        other, replacement = self._component(), self._component()
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id, str(other["id"]), str(replacement["id"])])
            alternate = self.cp.propose_alternate(conn, component_id, other["manufacturer"], other["mpn"], AUTHOR)["part_id"]
            (shown,) = [item for item in review.to_approve(conn)["alternates"] if item["component_id"] == component_id]
            old_main = self.cp.parts_of(conn, component_id)[0]["part_id"]
            self.assertEqual((shown["main_part_id"], shown["main_mpn"]), (old_main, component["mpn"]), "the queue shows what it is judged against")
            self.cp._set_main(conn, component_id, self.cp.parts_of(conn, str(replacement["id"]))[0]["part_id"])  # noqa: SLF001
            with self.assertRaises(Clash):
                self.cp.decide(conn, component_id, alternate, True, "qa@example.com", main_part_id=shown["main_part_id"])
            self.assertEqual({row["part_id"]: row["approval"] for row in self.cp.parts_of(conn, component_id)}[alternate], "pending")
            (again,) = [item for item in review.to_approve(conn)["alternates"] if item["component_id"] == component_id]
            self.cp.decide(conn, component_id, alternate, True, "qa@example.com", main_part_id=again["main_part_id"])

    def test_a_new_main_part_sends_approved_alternates_back_to_qa(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        other, replacement = self._component(), self._component()
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id, str(other["id"]), str(replacement["id"])])
            alternate = self.cp.propose_alternate(conn, component_id, other["manufacturer"], other["mpn"], AUTHOR)["part_id"]
            self.cp.decide(conn, component_id, alternate, True, "qa@example.com")
            new_main = self.cp.parts_of(conn, str(replacement["id"]))[0]["part_id"]
            self.cp._set_main(conn, component_id, new_main)  # noqa: SLF001 - what a library edit of the MPN does through sync_main
            approval = {row["part_id"]: row["approval"] for row in self.cp.parts_of(conn, component_id)}
            audit = conn.execute(
                "SELECT detail FROM supply_audit_events WHERE action = 'component.alternates_reopened' AND subject_id = %s", (component_id,)
            ).fetchone()
        self.assertEqual((approval[new_main], approval[alternate]), ("approved", "pending"), "approved against the old part, asked again")
        self.assertEqual(audit["detail"]["alternates"], 1)

    def test_lines_naming_two_components_on_one_part_share_only_alternates_both_approved(self) -> None:
        first, second, alt_a, alt_b = self._component(), self._component(), self._component(), self._component()
        ids = [str(item["id"]) for item in (first, second, alt_a, alt_b)]
        with self.store.connection() as conn:
            self.cp.sync_main(conn, ids)
            part = self.cp.parts_of(conn, ids[0])[0]["part_id"]
            for component, alternate in ((first, alt_a), (first, alt_b), (second, alt_b)):
                found = self.cp.propose_alternate(conn, str(component["id"]), alternate["manufacturer"], alternate["mpn"], AUTHOR)["part_id"]
                self.cp.decide(conn, str(component["id"]), found, True, "qa@example.com")
            only_b = self.cp.parts_of(conn, ids[3])[0]["part_id"]
            shared = self.cp.alternates_for(conn, {part: {ids[0], ids[1]}})
            alone = self.cp.alternates_for(conn, {part: {ids[0]}})
        self.assertEqual(shared, {part: [only_b]}, "the second component never approved the first one's other alternate")
        self.assertEqual(len(alone[part]), 2)

    def test_an_ending_alternate_is_listed_as_one_with_the_healthy_parts_left(self) -> None:
        from unittest import mock

        from app.services.supply import ending_parts, facts, parts_view, usage

        component, other = self._component(), self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id, str(other["id"])])
            main = self.cp.parts_of(conn, component_id)[0]["part_id"]
            alternate = self.cp.propose_alternate(conn, component_id, other["manufacturer"], other["mpn"], AUTHOR)["part_id"]
            self.cp.decide(conn, component_id, alternate, True, "qa@example.com")
            ending = {"id": alternate, "lifecycle": "obsolete", "dropped": False, "status": "fatal", "stock": 0, "problem": None, "fetched_at": None}
            with mock.patch.object(parts_view, "tracked_states", return_value=[ending, {**ending, "id": main, "lifecycle": "active"}]), \
                    mock.patch.object(parts_view, "summaries_for", return_value=[{**ending, "mpn": other["mpn"]}]), \
                    mock.patch.object(facts, "for_part", return_value=[]), mock.patch.object(usage, "used_in", return_value=[]):
                rows = [row for row in ending_parts.queue(conn)["items"] if row["component"]["id"] == component_id]
        (row,) = rows
        self.assertEqual((row["part_id"], row["role"], row["healthy"]), (alternate, "alternate", 1), "its main part is fine")

    def test_an_ending_part_names_the_components_it_counts_for(self) -> None:
        component = self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            main_id = self.cp.parts_of(conn, component_id)[0]["part_id"]
            other = self._component()
            self.cp.sync_main(conn, [str(other["id"])])
            alternate = self.cp.propose_alternate(conn, str(other["id"]), component["manufacturer"], component["mpn"], AUTHOR)
            self.assertEqual(alternate["part_id"], main_id, "the other component proposes this one's main part")
            held = self.cp.components_holding(conn, [main_id])
            self.assertEqual([item["id"] for item in held[main_id]], [component_id], "a pending alternate is not yet the other's")
            self.cp.decide(conn, str(other["id"]), main_id, True, "qa@example.com")
            held = self.cp.components_holding(conn, [main_id])
            self.assertEqual([item["id"] for item in held[main_id]], [component_id, str(other["id"])], "main first, then the approved alternate")
            self.assertEqual(held[main_id][0]["mpn"], component["mpn"])

    def test_the_ending_count_names_each_undecided_component_of_an_ending_part(self) -> None:
        from app.services.supply import ending_parts

        component_id = str(self._component()["id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            main_id = self.cp.parts_of(conn, component_id)[0]["part_id"]

            def count(**state) -> int:
                return ending_parts.undecided_count(conn, [{"id": main_id, "lifecycle": "active", "dropped": False, **state}])

            self.assertEqual(count(), 0, "an active part is not ending")
            self.assertEqual(count(lifecycle="obsolete"), 1)
            ending_parts.set_restriction(conn, component_id, "not_for_new_designs", "", "", "qa@example.com")
            self.assertEqual(count(lifecycle="obsolete"), 0, "decided")
            ending_parts.clear_restriction(conn, component_id, "qa@example.com")
            ending_parts.dismiss(conn, component_id, ["obsolete"], "qa@example.com", approver=True)
            self.assertEqual(count(lifecycle="obsolete"), 0, "dismissed for this reason")
            self.assertEqual(count(lifecycle="obsolete", dropped=True), 1, "a new reason brings it back")

    def test_supply_rows_about_a_component_must_name_a_real_one(self) -> None:
        import psycopg

        component_id = str(self._component()["id"])
        rows = (
            "INSERT INTO supply_component_watches (component_id, owner, created_by) VALUES (%s, 'a', 'a')",
            "INSERT INTO supply_component_restrictions (component_id, level) VALUES (%s, 'retired')",
            "INSERT INTO supply_attention_decisions (id, component_id, kind, decision, made_by) VALUES (md5(random()::text), %s, 'ending', 'dismiss', 'a')",
            "INSERT INTO supply_attention (component_id, kind, severity, state, first_seen_at, last_event_at) VALUES (%s, 'work', 'info', 'open', NOW(), NOW())",
        )
        for insert in rows:
            with self.assertRaises(psycopg.errors.ForeignKeyViolation), self.store.connection() as conn:
                conn.execute(insert, ("no-such-component",))
        with self.store.connection() as conn:
            for insert in rows:
                conn.execute(insert, (component_id,))
            conn.rollback()

    def test_a_component_watch_is_a_reason_to_follow_its_main_part_and_stopping_it_lowers_the_part(self) -> None:
        from app.services.supply import component_watches, stock, tracking

        component_id = str(self._component()["id"])
        with self.store.connection() as conn:
            component_watches.set_watch(conn, component_id, AUTHOR, packaging="tape_reel", tier=1, rate="daily")
            main = self.cp.parts_of(conn, component_id)[0]["part_id"]
            got = tracking.tier_of(conn, main)
            self.assertEqual((got["tier"], got["rate"], got["reasons"]), (1, "daily", [{"kind": "component", "ref": component_id}]))
            self.assertIsNone(conn.execute("SELECT 1 FROM supply_watches WHERE part_id = %s", (main,)).fetchone(), "no part watch is made")
            self.assertEqual(stock.packaging_of(conn, main), "tape_reel")
            component_watches.remove_watch(conn, component_id, AUTHOR)
            self.assertIsNone(tracking.tier_of(conn, main), "nothing else follows it")
            self.assertEqual(stock.packaging_of(conn, main), "any")

    def test_a_watched_component_follows_its_new_part_and_stopping_that_part_stops_the_watch(self) -> None:
        from app.services.supply import component_watches, tracking, watches

        component = self._component()
        component_id = str(component["id"])
        with self.store.connection() as conn:
            component_watches.set_watch(conn, component_id, AUTHOR)
            old = self.cp.parts_of(conn, component_id)[0]["part_id"]
        self.catalog.update_component_metadata(component_id, {"mpn": f"{component['mpn']}-B"}, actor=AUTHOR, expected_revision_id=component["revision_id"])
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            new = self.cp.parts_of(conn, component_id)[0]["part_id"]
            tracking.recompute(conn, [old, new])
            self.assertIsNone(tracking.tier_of(conn, old), "the old number is no longer the component's")
            self.assertEqual(tracking.tier_of(conn, new)["reasons"], [{"kind": "component", "ref": component_id}])
            self.assertTrue(watches.stop_tracking(conn, new, AUTHOR))
            self.assertIsNone(component_watches.get(conn, component_id))
            self.assertIsNone(tracking.tier_of(conn, new))
            self.assertFalse(watches.stop_tracking(conn, new, AUTHOR), "nothing left to stop")

    def test_a_component_without_a_part_number_cannot_be_watched(self) -> None:
        from app.services.supply import component_watches

        with self.store.connection() as conn, self.assertRaises(component_watches.ComponentWatchError):
            component_watches.set_watch(conn, "no-such-component", AUTHOR)

    def test_a_dismissal_holds_only_for_the_reasons_it_was_made_for(self) -> None:
        from app.services.supply import ending_parts

        component_id = str(self._component()["id"])
        with self.store.connection() as conn:
            ending_parts.dismiss(conn, component_id, ["nrnd"], AUTHOR, approver=True)
            stored = ending_parts.dismissals_of(conn, [component_id])[component_id]
            self.assertEqual(stored, ending_parts.reasons_key([{"kind": "nrnd"}]))
            self.assertNotEqual(stored, ending_parts.reasons_key([{"kind": "nrnd"}, {"kind": "last_time_buy"}]), "a new reason brings it back")
            with self.assertRaises(ValueError):
                ending_parts.dismiss(conn, component_id, [], AUTHOR, approver=True)
            conn.execute("DELETE FROM supply_attention_decisions WHERE component_id = %s", (component_id,))

    def test_a_writer_s_dismissal_waits_for_an_approver(self) -> None:
        from app.services.supply import ending_parts, review

        component_id = str(self._component()["id"])
        with self.store.connection() as conn:
            asked = ending_parts.dismiss(conn, component_id, ["obsolete"], "designer@example.com", approver=False)
            self.assertEqual(asked["state"], "proposed")
            self.assertEqual(ending_parts.dismissals_of(conn, [component_id]), {}, "not dismissed until QA says so")
            waiting = [item for item in review.to_approve(conn)["dismissals"] if item["component_id"] == component_id]
            self.assertEqual([(item["id"], item["reasons"], item["proposed_by"]) for item in waiting], [(asked["id"], ["obsolete"], "designer@example.com")])
            ending_parts.decide_dismissal(conn, asked["id"], "qa@example.com", approve=True)
            self.assertEqual(ending_parts.dismissals_of(conn, [component_id]), {component_id: "obsolete"})
            with self.assertRaises(ValueError):
                ending_parts.decide_dismissal(conn, asked["id"], "qa@example.com", approve=False)
            conn.execute("DELETE FROM supply_attention_decisions WHERE component_id = %s", (component_id,))

    def test_a_part_link_opens_the_component_the_part_counts_for(self) -> None:
        from app.api import supply_parts

        component = self._component()
        component_id = str(component["id"])
        number = f"ALT-{uuid.uuid4().hex[:8]}"
        with self.store.connection() as conn:
            self.cp.sync_main(conn, [component_id])
            alternate = self.cp.propose_alternate(conn, component_id, component["manufacturer"], number, AUTHOR)
            self.cp.decide(conn, component_id, alternate["part_id"], True, "qa@example.com")
        app = type(self.app)()
        app.include_router(supply_parts.router)
        answer = _request(app, "GET", f"/api/supply/parts/{alternate['part_id']}/library-component", user=self.users["designer"])
        self.assertEqual((answer.status, answer.json["component_id"]), (200, component_id), "an approved alternate leads to its component")


if __name__ == "__main__":
    unittest.main()
