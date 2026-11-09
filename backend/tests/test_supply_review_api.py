"""The supply review API: the queue, and the decisions people make on it.

Needs ``PRISM_DATABASE_URL``. Requests go through the real router into a
disposable schema.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
SEED_ACTOR = "seed@example.com"


class StubProvider:
    def __init__(self, *matches) -> None:
        self.matches = list(matches)

    def lookup_mpn(self, mpn, manufacturer=None):
        return list(self.matches)


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply API tests")
class SupplyReviewApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_connectors, supply_review
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import discovery, parts
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.models import PartMatch
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.discovery, cls.parts, cls.PartMatch = database, discovery, parts, PartMatch
        cls.AuthenticatedUser = AuthenticatedUser
        cls.users = {
            role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role)
            for role in ("viewer", "qa", "designer", "admin")
        }
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_review_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        from app.core.errors import install_error_handlers
        install_error_handlers(cls.app)
        cls.app.include_router(supply_review.router)
        supply_connectors.register_validation_redaction(cls.app)
        cls.patcher = mock.patch.object(supply_connectors, "service", cls.connectors)
        cls.patcher.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.patcher.stop()
        from support.postgres import APPLICATION_URL, drop_schema

        drop_schema(cls.store.schema, url=APPLICATION_URL)

    def setUp(self) -> None:
        with self.store.connection() as conn:
            for table in ("supply_listings", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")
        self.connector_id = self.connectors.create(actor=SEED_ACTOR, provider="fake", display_name="Sim")["id"]
        with self.store.connection() as conn:
            self.part = self.parts.ensure_part(conn, "Texas Instruments", "LM358D", SEED_ACTOR)
        self.discover(
            self.PartMatch("fake", "S1", "LM358D", "TI"),
            self.PartMatch("fake", "S2", "LM358DR", "Texas Instruments"),
            self.PartMatch("fake", "S3", "LM358D", "TEXAS INSTRUMENTS INC"),
        )
        # Listings an earlier version left waiting on a spelling nobody had mapped (the new rules count "TI" at once).
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET match_state = 'manufacturer_unresolved', match_reason = 'manufacturer spelling not confirmed' WHERE sku = 'S1'")
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, status, seen_at_provider) VALUES ('ti', 'TI', 'pending', 'fake')")

    # --- helpers ----------------------------------------------------------

    def discover(self, *matches) -> None:
        service = self.discovery.DiscoveryService(lambda _id: StubProvider(*matches), self.store)
        service.discover(self.part.id, self.connector_id)

    def call(self, method: str, path: str, *, role: str = "admin", body=None, user=None):
        return _request(self.app, method, path, user=user or self.users[role], body=body)

    def listing_id(self, sku: str) -> str:
        with self.store.connection() as conn:
            return conn.execute("SELECT id FROM supply_listings WHERE sku = %s", (sku,)).fetchone()["id"]

    def listing_state(self, sku: str) -> str:
        with self.store.connection() as conn:
            return conn.execute("SELECT match_state FROM supply_listings WHERE sku = %s", (sku,)).fetchone()["match_state"]

    # --- roles ------------------------------------------------------------

    def test_readers_see_the_queue_and_viewers_do_not(self) -> None:
        for role in ("admin", "designer", "qa"):
            self.assertEqual(self.call("GET", "/api/supply/review", role=role).status, 200, role)
        self.assertEqual(self.call("GET", "/api/supply/review", role="viewer").status, 403)

    def test_only_admin_and_qa_may_decide(self) -> None:
        sku1, alias = self.listing_id("S1"), {"alias_key": "ti", "manufacturer_id": self.part.manufacturer_id}
        calls = [
            ("POST", "/api/supply/review/aliases/confirm", alias),
            ("POST", f"/api/supply/review/listings/{sku1}/pin", None),
            ("POST", f"/api/supply/review/listings/{sku1}/reject", None),
        ]
        for role in ("designer", "viewer"):
            for method, path, body in calls:
                self.assertEqual(self.call(method, path, role=role, body=body).status, 403, f"{role} {path}")
        self.assertEqual(self.listing_state("S1"), "manufacturer_unresolved", "nothing changed")
        self.assertEqual(self.call("POST", calls[1][1], role="qa").status, 204)

    def test_tokens(self) -> None:
        reader = self.AuthenticatedUser(email="bot@example.com", name="bot", role="admin", auth_type="agent", scopes=["api:read"])
        self.assertEqual(self.call("GET", "/api/supply/review", user=reader).status, 200)
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S1')}/reject", user=reader).status, 403)
        kicad = self.AuthenticatedUser(email="k@example.com", name="k", role="admin", auth_type="kicad_provider", scopes=["remote_symbols.read"])
        self.assertEqual(self.call("GET", "/api/supply/review", user=kicad).status, 403)
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S1')}/pin", user=kicad).status, 403)

    # --- the queue --------------------------------------------------------

    def test_the_queue_lists_what_waits_for_a_person(self) -> None:
        queue = self.call("GET", "/api/supply/review", role="designer").json
        self.assertEqual(queue["counts"], {"aliases": 1, "unresolved": 1, "near": 0})
        (alias,) = queue["aliases"]
        self.assertEqual((alias["alias_key"], alias["alias_text"], alias["waiting_listings"]), ("ti", "TI", 1))
        by_sku = {item["sku"]: item for item in queue["listings"]}
        self.assertEqual(sorted(by_sku), ["S1"], "the exact listing is not in the queue, and another number is kept on the part, not queued")
        self.assertEqual(by_sku["S1"]["match_state"], "manufacturer_unresolved")
        self.assertEqual(by_sku["S1"]["connector_name"], "Sim")
        self.assertEqual(by_sku["S1"]["part"], {"id": self.part.id, "mpn": "LM358D", "manufacturer": "Texas Instruments"})
        self.assertEqual(queue["manufacturers"], [{"id": self.part.manufacturer_id, "name": "Texas Instruments", "part_count": 1}])

    def test_listings_pinned_under_another_number_are_listed_by_part_and_taken_off_together(self) -> None:
        self.assertEqual(self.call("GET", "/api/supply/review").json["other_numbers"], [])
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S2')}/pin").status, 204)
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S1')}/pin").status, 204)
        (group,) = self.call("GET", "/api/supply/review").json["other_numbers"]
        self.assertEqual((group["mpn"], [item["sku"] for item in group["listings"]]), ("LM358D", ["S2"]), "S1 has the part's own number")
        ids = [item["id"] for item in group["listings"]]
        self.assertEqual(self.call("POST", "/api/supply/review/listings/reject-many", body={"listing_ids": ids}, role="designer").status, 403)
        self.assertEqual(self.call("POST", "/api/supply/review/listings/reject-many", body={"listing_ids": ids}).json, {"rejected": 1})
        self.assertEqual(self.listing_state("S2"), "rejected")
        self.assertEqual(self.call("GET", "/api/supply/review").json["other_numbers"], [])

    def test_proposed_waivers_wait_in_the_queue_until_decided(self) -> None:
        with self.store.connection() as conn:
            conn.execute(
                "INSERT INTO supply_attention_decisions (id, part_id, kind, scope, reason, decision, state, made_by) "
                "VALUES ('w1', %s, 'single_source', 's', 'ok', 'waive', 'proposed', 'dee@example.com')", (self.part.id,)
            )
        waiting = self.call("GET", "/api/supply/review", role="designer").json["to_approve"]
        self.assertEqual([w["id"] for w in waiting["waivers"]], ["w1"])
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_attention_decisions SET state = 'approved'")
        self.assertEqual(self.call("GET", "/api/supply/review").json["to_approve"], {"waivers": [], "alternates": [], "dismissals": [], "mutes": []})

    def test_pinning_a_listing_with_another_number_can_add_that_number_to_the_part(self) -> None:
        body = {"add_number": True}
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S2')}/pin", body=body).status, 204)
        with self.store.connection() as conn:
            self.assertEqual([row["mpn"] for row in conn.execute("SELECT mpn FROM supply_part_numbers WHERE part_id = %s ORDER BY mpn", (self.part.id,)).fetchall()], ["LM358DR"])
        self.assertEqual(self.call("GET", "/api/supply/review").json["other_numbers"], [], "it is the part's number now")

    def test_a_part_whose_maker_the_answers_do_not_settle_is_a_question_a_designer_can_answer(self) -> None:
        with self.store.connection() as conn:
            made = self.parts.ensure_part(conn, "", "AB-1", SEED_ACTOR)
        self.discovery.DiscoveryService(
            lambda _id: StubProvider(self.PartMatch("fake", "Q1", "AB-1", "Acme"), self.PartMatch("fake", "Q2", "AB-1", "Bolt Co")), self.store
        ).discover(made.id, self.connector_id)
        queue = self.call("GET", "/api/supply/review", role="designer").json
        (question,) = [item for item in queue["choices"] if item["part_id"] == made.id]
        key = next(option["key"] for option in question["options"] if option["spelling"] == "Bolt Co")
        self.assertEqual(self.call("POST", f"/api/supply/review/choices/{made.id}/choose", body={"key": key}, role="viewer").status, 403)
        self.assertEqual(self.call("POST", f"/api/supply/review/choices/{made.id}/choose", body={"key": key}, role="designer").json, {"result": "settled"})
        self.assertEqual(self.listing_state("Q2"), "exact")
        self.assertEqual([item for item in self.call("GET", "/api/supply/review").json["choices"] if item["part_id"] == made.id], [])

    def test_a_spelling_prism_learned_can_be_undone_by_those_who_decide(self) -> None:
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, manufacturer_id, status, source) "
                         "SELECT 'texas instr', 'Texas Instr', manufacturer_id, 'confirmed', 'learned' FROM supply_parts LIMIT 1")
        matched = self.call("GET", "/api/supply/review").json["matched"]
        self.assertEqual([item["alias_key"] for item in matched["aliases"]], ["texas instr"])
        self.assertEqual(self.call("POST", "/api/supply/review/aliases/texas instr/undo", role="designer").status, 403)
        self.assertEqual(self.call("POST", "/api/supply/review/aliases/texas instr/undo").status, 200)
        self.assertEqual(self.call("GET", "/api/supply/review").json["matched"]["aliases"], [])

    # --- decisions --------------------------------------------------------

    def test_a_spelling_nothing_waits_on_is_not_listed(self) -> None:
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, status, seen_at_provider) VALUES ('stale', 'Stale', 'pending', 'fake')")
        queue = self.call("GET", "/api/supply/review", role="designer").json
        self.assertEqual([item["alias_key"] for item in queue["aliases"]], ["ti"])
        self.assertEqual(queue["counts"]["aliases"], 1)

    def test_confirming_a_spelling_settles_the_listings_waiting_on_it(self) -> None:
        response = self.call("POST", "/api/supply/review/aliases/confirm", role="qa",
                             body={"alias_key": "ti", "manufacturer_id": self.part.manufacturer_id})
        self.assertEqual((response.status, response.json), (200, {"listings_updated": 1}))
        self.assertEqual(self.listing_state("S1"), "exact")
        queue = self.call("GET", "/api/supply/review").json
        self.assertEqual((queue["aliases"], queue["counts"]["unresolved"]), ([], 0))
        with self.store.connection() as conn:
            actor = conn.execute("SELECT actor FROM supply_audit_events WHERE action = 'alias.confirm'").fetchone()["actor"]
        self.assertEqual(actor, "qa@example.com", "the actor is the signed-in user")

    def test_a_spelling_can_be_mapped_to_a_manufacturer_named_on_the_spot(self) -> None:
        response = self.call("POST", "/api/supply/review/aliases/confirm",
                             body={"alias_key": "ti", "new_manufacturer_name": "Texas Instruments Inc."})
        self.assertEqual(response.json, {"listings_updated": 1})
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM supply_manufacturers").fetchone()["n"], 1,
                             "the name resolved to the existing manufacturer")
        brand_new = self.call("POST", "/api/supply/review/aliases/confirm",
                              body={"alias_key": "nope", "new_manufacturer_name": "Brand New"})
        self.assertEqual(brand_new.status, 400, "an unknown spelling is still refused")

    def test_alias_errors(self) -> None:
        mid = self.part.manufacturer_id
        for body, code in (
            ({"alias_key": "missing", "manufacturer_id": mid}, "alias_error"),
            ({"alias_key": "ti", "manufacturer_id": "missing"}, "alias_error"),
        ):
            response = self.call("POST", "/api/supply/review/aliases/confirm", body=body)
            self.assertEqual((response.status, response.json["code"]), (400, code), body)
        self.call("POST", "/api/supply/review/aliases/confirm", body={"alias_key": "ti", "manufacturer_id": mid})
        again = self.call("POST", "/api/supply/review/aliases/confirm", body={"alias_key": "ti", "manufacturer_id": mid})
        self.assertEqual((again.status, again.json["detail"]), (400, "This spelling is already mapped."))

    def test_the_request_must_name_exactly_one_target(self) -> None:
        for body in ({"alias_key": "ti"}, {"alias_key": "ti", "manufacturer_id": "x", "new_manufacturer_name": "Y"},
                     {"alias_key": "ti", "manufacturer_id": "x", "actor": "mallory"}):
            response = self.call("POST", "/api/supply/review/aliases/confirm", body=body)
            self.assertEqual(response.status, 422, body)
            self.assertTrue(all(not {"input", "ctx"} & set(item) for item in response.json["detail"]), body)
            self.assertNotIn("mallory", json.dumps(response.json))

    def test_pinning_confirms_the_candidate_part(self) -> None:
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S2')}/pin", role="qa").status, 204)
        self.assertEqual(self.listing_state("S2"), "manual")
        self.assertEqual(self.call("GET", "/api/supply/review").json["counts"]["near"], 0)

    def test_rejecting_removes_it_and_discovery_does_not_bring_it_back(self) -> None:
        self.assertEqual(self.call("POST", f"/api/supply/review/listings/{self.listing_id('S2')}/reject").status, 204)
        self.assertEqual(self.listing_state("S2"), "rejected")
        self.discover(self.PartMatch("fake", "S2", "LM358DR", "Texas Instruments"))
        self.assertEqual(self.listing_state("S2"), "rejected")
        self.assertNotIn("S2", [item["sku"] for item in self.call("GET", "/api/supply/review").json["listings"]])

    def test_missing_targets(self) -> None:
        self.assertEqual(self.call("POST", "/api/supply/review/listings/missing/pin").status, 404)
        self.assertEqual(self.call("POST", "/api/supply/review/listings/missing/reject").status, 404)
        with self.store.connection() as conn:
            conn.execute("UPDATE supply_listings SET part_id = NULL WHERE sku = 'S1'")
        orphan = self.call("POST", f"/api/supply/review/listings/{self.listing_id('S1')}/pin")
        self.assertEqual((orphan.status, orphan.json["code"]), (400, "invalid_request"))


if __name__ == "__main__":
    unittest.main()
