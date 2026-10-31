"""Where parts are used: reading BOMs from semantic indexes, matching them to parts, and the In use scope.

The field-name tests need nothing; the rest need ``PRISM_DATABASE_URL``.
"""

from __future__ import annotations

import os
import re
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from supply_api_helpers import request as _request  # noqa: E402

from app.core.errors import install_error_handlers  # noqa: E402
from app.services.supply import bom_fields, parts_view, usage  # noqa: E402

POSTGRES_URL = os.environ.get("PRISM_DATABASE_URL", "").strip()
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
SEED = "seed@example.com"
FRONTEND_SOURCE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "features" / "supply" / "bom-supply.ts"


def component(reference, maker="", mpn="", **fields):
    values = {"Manufacturer": maker, "Manufacturer Part Number": mpn, "DNP": "No", "In BOM": "Yes", **fields}
    return {"reference": reference, "fields": values}


class FieldNameTests(unittest.TestCase):
    def test_the_frontend_and_the_backend_read_the_same_field_names(self) -> None:
        source = FRONTEND_SOURCE.read_text(encoding="utf-8")

        def names(constant: str) -> tuple[str, ...]:
            body = re.search(constant + r"[^=]*=\s*\[(.*?)\];", source, flags=re.DOTALL)
            self.assertIsNotNone(body, constant)
            return tuple(re.findall(r'"([^"]+)"', body.group(1)))

        self.assertEqual(names("MANUFACTURER_FIELDS"), bom_fields.MANUFACTURER_FIELDS)
        self.assertEqual(names("MPN_FIELDS"), bom_fields.MPN_FIELDS)
        self.assertEqual(names("LCSC_FIELDS"), bom_fields.LCSC_FIELDS)

    def test_an_lcsc_number_is_read_from_its_field_or_from_a_supplier_that_says_lcsc(self) -> None:
        self.assertEqual(bom_fields.lcsc_of({"LCSC Part #": " c7950 "}), "C7950")
        self.assertEqual(bom_fields.lcsc_of({"LCSC": "C25804", "Supplier": "LCSC", "Supplier Part": "C1"}), "C25804")
        self.assertEqual(bom_fields.lcsc_of({"Supplier": "LCSC", "Supplier Part": "C2040"}), "C2040")
        self.assertEqual(bom_fields.lcsc_of({"Supplier": "Mouser", "Supplier Part": "C2040"}), "")
        self.assertEqual(bom_fields.lcsc_of({"LCSC": "not a number"}), "")
        self.assertEqual(bom_fields.lcsc_of({}), "")

    def test_identity_prefers_the_explicit_name_and_never_reads_the_distributors_number(self) -> None:
        self.assertEqual(bom_fields.identity_of({"Mnf.": "TRACO", "PartNumber": "TSR 1-2450"}), ("TRACO", "TSR 1-2450"))
        self.assertEqual(bom_fields.identity_of({"PartNumber": "LOOSE", "Manufacturer Part Number": "EXACT"})[1], "EXACT")
        self.assertEqual(bom_fields.identity_of({"Vendor Part Number": "DIST-9"}), ("", ""))
        self.assertEqual(bom_fields.identity_of({"MPN": "  ", "PartNumber": "FALLBACK"})[1], "FALLBACK")
        self.assertEqual(bom_fields.identity_of({"manufacturer": None}), ("", ""))

    def test_fitted_means_in_the_bom_and_not_marked_do_not_place(self) -> None:
        self.assertTrue(bom_fields.is_fitted({}))
        self.assertTrue(bom_fields.is_fitted({"DNP": "No", "In BOM": "Yes"}))
        self.assertFalse(bom_fields.is_fitted({"DNP": "Yes"}))
        self.assertFalse(bom_fields.is_fitted({"In BOM": "No"}))


class LinesTests(unittest.TestCase):
    def test_fitted_parts_are_counted_per_distinct_part(self) -> None:
        lines = usage.lines_from_components([
            component("R2", "Acme", "R-10K"), component("R1", "ACME", "r10k"), component("C1", "Acme", "C-1"),
            component("R9", "Acme", "R-1K", DNP="Yes"), component("TP1"), component("X1", "Acme", "X", **{"In BOM": "No"}),
        ])
        self.assertEqual([(line.mpn, line.quantity, line.references) for line in lines], [("R-10K", 2, "R1 R2"), ("C-1", 1, "C1"), ("", 1, "TP1")])
        self.assertEqual({line.match_key for line in lines}, {"R10K", "C1", ""})

    def test_a_fitted_component_without_any_number_is_a_line_per_value_and_footprint(self) -> None:
        lines = usage.lines_from_components([
            component("J2", Value="796638-2", Footprint="TerminalBlock:2P"), component("J3", Value="796638-2", Footprint="TerminalBlock:2P"),
            component("J4", Value="796638-2", Footprint="TerminalBlock:3P"), component("J5", Value="796638-2", DNP="Yes"),
        ])
        self.assertEqual([(line.key, line.mpn, line.match_key, line.quantity, line.references) for line in lines], [
            ("none:796638-2|TerminalBlock:2P", "", "", 2, "J2 J3"),
            ("none:796638-2|TerminalBlock:3P", "", "", 1, "J4"),
        ])

    def test_a_prism_id_the_library_knows_replaces_what_the_symbol_says(self) -> None:
        asked = []

        def library(ids):
            asked.append(set(ids))
            return {"c1": ("Texas Instruments", "LM358DR")}

        lines = usage.lines_from_components([
            component("U1", "TI", "old-text", **{"Prism ID": "c1"}),
            component("U2", "Texas Instruments", "LM358DR"),
            component("U3", "Acme", "X-1", **{"Prism ID": "gone"}),
        ], library)
        self.assertEqual(asked, [{"c1", "gone"}])
        self.assertEqual([(line.manufacturer, line.mpn, line.quantity) for line in lines], [("Texas Instruments", "LM358DR", 2), ("Acme", "X-1", 1)])

    def test_a_component_without_a_part_number_leaves_the_symbols_own_fields(self) -> None:
        (line,) = usage.lines_from_components(
            [component("U1", "TI", "LM358", **{"Prism ID": "c1"})], lambda ids: {"c1": ("TI", "  ")},
        )
        self.assertEqual((line.manufacturer, line.mpn), ("TI", "LM358"))

    def test_a_missing_manufacturer_gives_a_blank_alias_key(self) -> None:
        (line,) = usage.lines_from_components([component("U1", "", "LM358")])
        self.assertEqual((line.alias_key, line.match_key), ("", "LM358"))


@unittest.skipUnless(POSTGRES_URL, "PRISM_DATABASE_URL is required for supply database tests")
class UsageDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi import FastAPI

        from app.api import supply_bom, supply_connectors, supply_parts
        from app.core.security import AuthenticatedUser
        from app.services.postgres_database import database
        from app.services.supply import parts, watches
        from app.services.supply.connectors import ConnectorService
        from app.services.supply.store import SupplyStore
        from app.services.trackers.secrets import CredentialKeyring

        cls.database, cls.parts, cls.watches = database, parts, watches
        cls.users = {role: AuthenticatedUser(email=f"{role}@example.com", name=role, role=role) for role in ("viewer", "qa", "designer", "admin")}
        cls.store = type("TestSupplyStore", (SupplyStore,), {"schema": f"supply_usage_test_{uuid.uuid4().hex[:8]}"})()
        cls.store.initialize()
        ring = CredentialKeyring({"t": os.urandom(32)}, "t")
        cls.connectors = ConnectorService(cls.store, keyring_factory=lambda: ring, allow_dev=lambda: True)
        cls.app = FastAPI()
        install_error_handlers(cls.app)
        cls.app.include_router(supply_bom.router)
        cls.app.include_router(supply_parts.router)
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
            for table in ("supply_bom_usage_projects", "supply_listings", "supply_watches", "supply_parts", "supply_manufacturer_aliases", "supply_manufacturers", "supply_connectors", "supply_audit_events"):
                conn.execute(f"DELETE FROM {table}")

    # --- helpers ----------------------------------------------------------

    def call(self, method, path, *, role="admin", query=""):
        return _request(self.app, method, path, user=self.users[role], query=query, body=None if method == "GET" else {})

    def part(self, maker, mpn, *, watch=False) -> str:
        with self.store.connection() as conn:
            record = self.parts.ensure_part(conn, maker, mpn, SEED)
            if watch:
                self.watches.add_watch(conn, maker, mpn, SEED)
        return record.id

    def store_project(self, project_id, name, components, revision="r1") -> bool:
        with self.store.connection() as conn:
            return usage.store_project(conn, project_id, name, revision, usage.lines_from_components(components), NOW)

    def rows(self, sql, *params):
        with self.store.connection() as conn:
            return conn.execute(sql, params).fetchall()

    # --- storing ----------------------------------------------------------

    def test_a_project_is_replaced_only_when_its_revision_changes(self) -> None:
        self.assertTrue(self.store_project("p1", "Board A", [component("R1", "Acme", "R-1")]))
        self.assertFalse(self.store_project("p1", "Board A renamed", [component("R1", "Acme", "OTHER")]), "same revision: untouched")
        self.assertEqual(self.rows("SELECT mpn FROM supply_bom_usage")[0]["mpn"], "R-1")
        self.assertEqual(self.rows("SELECT project_name FROM supply_bom_usage_projects")[0]["project_name"], "Board A renamed", "a rename still lands")
        self.assertTrue(self.store_project("p1", "Board A renamed", [component("R1", "Acme", "OTHER")], revision="r2"))
        self.assertEqual([row["mpn"] for row in self.rows("SELECT mpn FROM supply_bom_usage")], ["OTHER"])

    def test_each_design_variant_has_its_own_lines_and_the_revision_decides_when_to_read_them_again(self) -> None:
        def part(reference, mpn, uid, **fields):
            return {**component(reference, "Acme", mpn, **fields), "componentUid": uid}

        payload = {
            "sourceRevisionKey": "rev-1",
            "components": [part("R1", "R-1", "u1"), part("R2", "R-2", "u2"), part("R3", "R-3", "u3", DNP="Yes")],
            "assembly": {
                "default": {"components": {"u3": {"dnp": True}}},
                "variants": [
                    {"name": "No R2", "components": {"u2": {"dnp": True}}},
                    {"name": "Fit R3, swap R1", "components": {"u3": {"dnp": False}, "u1": {"fields": {"Manufacturer Part Number": "R-9"}}}},
                ],
            },
        }
        self.assertEqual(usage.variant_names(payload), ["No R2", "Fit R3, swap R1"])
        by_variant = {name: sorted(line.mpn for line in usage.lines_from_components(usage.variant_components(payload, name))) for name in usage.variant_names(payload)}
        self.assertEqual(by_variant, {"No R2": ["R-1"], "Fit R3, swap R1": ["R-2", "R-3", "R-9"]})
        self.assertEqual(sorted(line.mpn for line in usage.lines_from_components(usage.variant_components(payload, "unknown"))), ["R-1", "R-2"],
                         "an unlisted name gives the components as they are")

        project = SimpleNamespace(id="pv", name="Variants")
        with self.store.connection() as conn:
            first = usage.refresh(conn, [project], lambda _p: payload, NOW)
            again = usage.refresh(conn, [project], lambda _p: payload, NOW)
            self.assertEqual((first["updated"], again["unchanged"]), (1, 1))
            self.assertEqual(usage.project_variants(conn, "pv"), ["Fit R3, swap R1", "No R2"])
            self.assertEqual([r["mpn"] for r in usage.project_rows(conn, "pv")], ["R-1", "R-2"], "the base design has R3 as DNP")
            self.assertEqual([r["mpn"] for r in usage.project_rows(conn, "pv", "No R2")], ["R-1"])
            self.assertEqual(usage.project_rows(conn, "pv", "none such"), [])
            changed = usage.refresh(conn, [project], lambda _p: payload | {"sourceRevisionKey": "rev-2", "assembly": {}}, NOW)
            self.assertEqual((changed["updated"], usage.project_variants(conn, "pv")), (1, []), "a new revision replaces the variants too")

    def test_a_part_only_a_design_variant_fits_counts_as_in_use(self) -> None:
        def part(reference, mpn, uid, **fields):
            return {**component(reference, "Acme", mpn, **fields), "componentUid": uid}

        payload = {
            "sourceRevisionKey": "rev-1",
            "components": [part("R1", "R-1", "u1"), part("R3", "R-3", "u3", DNP="Yes")],
            "assembly": {"default": {"components": {"u3": {"dnp": True}}}, "variants": [{"name": "Full", "components": {"u3": {"dnp": False}}}]},
        }
        only_variant, both = self.part("Acme", "R-3"), self.part("Acme", "R-1")
        with self.store.connection() as conn:
            usage.refresh(conn, [SimpleNamespace(id="pv", name="Variants")], lambda _p: payload, NOW)
            found = usage.used_in(conn, only_variant)
            plain = usage.used_in(conn, both)
            in_use = [item["mpn"] for item in parts_view.ranked_parts(conn, scope="in_use")[0]]
        self.assertEqual(found, [{"project_id": "pv", "project_name": "Variants", "quantity": 1, "references": "R3", "only_in_variants": ["Full"]}])
        self.assertEqual([(use["quantity"], use["only_in_variants"]) for use in plain], [(1, [])], "in the base design too: counted once, no variant named")
        self.assertEqual(sorted(in_use), ["R-1", "R-3"])

    def test_a_stored_line_keeps_the_lcsc_number_of_its_symbol(self) -> None:
        self.store_project("p1", "Board A", [component("R1", "Acme", "R-1", LCSC="c25804"), component("R2", "Acme", "R-1")])
        self.assertEqual([row["lcsc"] for row in self.rows("SELECT lcsc FROM supply_bom_usage")], ["C25804"])
        from app.services.supply import usage as usage_module

        with self.store.connection() as conn:
            self.assertEqual([row["lcsc"] for row in usage_module.project_rows(conn, "p1")], ["C25804"])

    def test_a_stored_line_keeps_its_symbols_value_and_footprint_for_the_package_checks(self) -> None:
        from app.services.supply import project_supply

        self.store_project("p1", "Board A", [component("R1", "Acme", "R-1", Value="10k", Footprint="Resistor_SMD:R_0603_1608Metric")])
        with self.store.connection() as conn:
            (row,) = usage.project_rows(conn, "p1")
        line = project_supply.bom_line(row)
        self.assertEqual((line.value, line.footprint), ("10k", "Resistor_SMD:R_0603_1608Metric"))

    def test_refresh_reads_existing_indexes_and_drops_projects_that_are_gone(self) -> None:
        self.store_project("gone", "Removed board", [component("R1", "Acme", "R-1")])
        projects = [SimpleNamespace(id="p1", name="Board A"), SimpleNamespace(id="p2", name="Never opened"), SimpleNamespace(id="p3", name="Broken")]
        indexes = {"p1": {"sourceRevisionKey": "r1", "components": [component("R1", "Acme", "R-1")]}}

        def existing(project):
            if project.id == "p3":
                raise RuntimeError("unreadable")
            return indexes.get(project.id)

        with self.store.connection() as conn:
            result = usage.refresh(conn, projects, existing, NOW)
        self.assertEqual(result, {"updated": 1, "unchanged": 0, "without_index": 2, "removed": 1})
        self.assertEqual([row["project_id"] for row in self.rows("SELECT project_id FROM supply_bom_usage_projects")], ["p1"])
        with self.store.connection() as conn:
            again = usage.refresh(conn, projects, existing, NOW)
        self.assertEqual((again["updated"], again["unchanged"]), (0, 1))

    # --- matching parts to uses -------------------------------------------

    def test_a_use_matches_a_part_by_number_and_a_blank_or_known_manufacturer(self) -> None:
        part_id = self.part("Texas Instruments", "LM358-D")
        with self.store.connection() as conn:
            conn.execute("INSERT INTO supply_manufacturer_aliases (alias_key, alias_text, manufacturer_id, status) "
                         "SELECT 'ti', 'TI', id, 'confirmed' FROM supply_manufacturers")
        self.store_project("p1", "Exact", [component("U1", "Texas Instruments Inc.", "lm358d")])
        self.store_project("p2", "Alias", [component("U1", "TI", "LM358 D"), component("U2", "TI", "LM358-D")])
        self.store_project("p3", "Blank maker", [component("U1", "", "LM358D")])
        self.store_project("p4", "Other maker", [component("U1", "Onsemi", "LM358D")])
        self.store_project("p5", "Other part", [component("U1", "Texas Instruments", "LM358X")])
        with self.store.connection() as conn:
            found = usage.used_in(conn, part_id)
        self.assertEqual([(row["project_name"], row["quantity"]) for row in found],
                         [("Alias", 2), ("Blank maker", 1), ("Exact", 1)], "the most-used first, other makers and numbers left out")

    def test_the_in_use_scope_lists_known_parts_that_a_project_uses(self) -> None:
        self.part("Acme", "USED-1")
        self.part("Acme", "UNUSED-1")
        self.part("Acme", "WATCHED-ONLY", watch=True)
        self.store_project("p1", "Board A", [component("R1", "Acme", "USED-1")])
        self.store_project("p2", "Board B", [component("R1", "Acme", "USED-1"), component("R2", "Acme", "NOT-KNOWN")])
        listed = self.call("GET", "/api/supply/parts", query="scope=in_use").json
        self.assertEqual([(item["mpn"], item["used_in"]) for item in listed["items"]], [("USED-1", 2)])
        self.assertEqual(listed["total"], 1)
        everything = self.call("GET", "/api/supply/parts", query="scope=all").json["items"]
        self.assertEqual({item["mpn"]: item["used_in"] for item in everything}, {"USED-1": 2, "UNUSED-1": 0, "WATCHED-ONLY": 0})
        self.assertEqual(self.call("GET", "/api/supply/parts", query="scope=in_use&q=nothing").json["items"], [])

    def test_parts_are_grouped_by_project_and_a_group_lists_its_own_parts(self) -> None:
        self.part("Acme", "BOTH-1")
        self.part("Acme", "A-ONLY")
        self.part("Acme", "LOOSE", watch=True)
        self.store_project("p1", "Board A", [component("R1", "Acme", "BOTH-1"), component("R2", "Acme", "A-ONLY")])
        self.store_project("p2", "Board B", [component("R1", "Acme", "BOTH-1")])
        groups = self.call("GET", "/api/supply/part-groups", query="scope=all").json
        self.assertEqual([(g["project_id"], g["project_name"], g["count"]) for g in groups["items"]],
                         [("p1", "Board A", 2), ("p2", "Board B", 1), ("none", "Not in a project", 1)], "the loose parts come last")
        self.assertEqual(groups["total"], 3)
        in_a = self.call("GET", "/api/supply/parts", query="scope=all&project_id=p1").json
        self.assertEqual(sorted(item["mpn"] for item in in_a["items"]), ["A-ONLY", "BOTH-1"])
        loose = self.call("GET", "/api/supply/parts", query="scope=all&project_id=none").json
        self.assertEqual([item["mpn"] for item in loose["items"]], ["LOOSE"])
        searched = self.call("GET", "/api/supply/part-groups", query="scope=all&q=A-ONLY").json
        self.assertEqual([g["project_id"] for g in searched["items"]], ["p1"], "a group with no match is left out")

    def test_a_row_names_its_first_projects_and_a_group_counts_what_needs_a_look(self) -> None:
        self.part("Acme", "BOTH-1")
        self.part("Acme", "A-ONLY")
        self.store_project("p1", "Board A", [component("R1", "Acme", "BOTH-1"), component("R2", "Acme", "A-ONLY")])
        self.store_project("p2", "Board B", [component("R1", "Acme", "BOTH-1")])
        rows = {item["mpn"]: item for item in self.call("GET", "/api/supply/parts", query="scope=all").json["items"]}
        self.assertEqual(rows["BOTH-1"]["project_names"], ["Board A", "Board B"])
        self.assertEqual(rows["A-ONLY"]["project_names"], ["Board A"])
        self.assertEqual((rows["A-ONLY"]["distributors"], rows["A-ONLY"]["flags"]), ([], []))
        groups = {g["project_id"]: g for g in self.call("GET", "/api/supply/part-groups", query="scope=all").json["items"]}
        stats = groups["p1"]["stats"]
        self.assertEqual((stats["at_risk"], stats["out"], stats["one_distributor"]), (0, 0, 0))
        self.assertTrue(stats["bom_read_at"])
        self.assertNotIn("cost_per_board", stats, "only a tracked project has a cost")

    def test_a_row_flags_ncnr_and_parts_not_normally_stocked(self) -> None:
        part_id = self.part("Acme", "FLAGGED")
        with self.store.connection() as conn:
            for name, value in (("ncnr", "Yes"), ("normally_stocking", "No")):
                conn.execute("INSERT INTO supply_part_facts (part_id, provider, name, value, observed_at) VALUES (%s, 'digikey', %s, %s, NOW())", (part_id, name, value))
        rows = {item["mpn"]: item for item in self.call("GET", "/api/supply/parts", query="scope=all").json["items"]}
        self.assertEqual(sorted(rows["FLAGGED"]["flags"]), ["ncnr", "not_stocked"])

    def test_the_followed_scope_is_what_is_tracked_or_in_a_project(self) -> None:
        self.part("Acme", "IN-PROJECT")
        self.part("Acme", "TRACKED-ONLY", watch=True)
        self.part("Acme", "NEITHER")
        self.store_project("p1", "Board A", [component("R1", "Acme", "IN-PROJECT")])
        listed = self.call("GET", "/api/supply/parts", query="scope=followed").json
        self.assertEqual(sorted(item["mpn"] for item in listed["items"]), ["IN-PROJECT", "TRACKED-ONLY"])

    def test_the_part_detail_says_where_it_is_used(self) -> None:
        part_id = self.part("Acme", "USED-1")
        self.store_project("p1", "Board A", [component("R2", "Acme", "USED-1"), component("R1", "Acme", "USED-1")])
        detail = self.call("GET", f"/api/supply/parts/{part_id}").json
        self.assertEqual(detail["used_in"], [{"project_id": "p1", "project_name": "Board A", "quantity": 2, "references": "R1 R2", "only_in_variants": []}])
        alone = self.call("GET", f"/api/supply/parts/{self.part('Acme', 'LONELY')}").json
        self.assertEqual(alone["used_in"], [])

    # --- the endpoint -----------------------------------------------------

    def refresh_with(self, rows, index, role="designer"):
        from app.services.workspace_service import workspace

        def convert(row):
            return SimpleNamespace(id=row["id"], name=row["name"])

        with mock.patch.object(workspace, "get_all_projects", return_value=rows), \
                mock.patch("app.services.project_service._workspace_row_to_project", side_effect=convert), \
                mock.patch("app.services.supply.project_bom.existing_index", return_value=index):
            return self.call("POST", "/api/supply/bom/usage/refresh", role=role)

    def test_building_queues_an_index_job_only_for_projects_without_one(self) -> None:
        from app.services.workspace_service import workspace

        rows = [{"id": "built"}, {"id": "bare_1"}, {"id": "bare_2"}]
        built = SimpleNamespace(id="built", name="built")

        def convert(row):
            return built if row["id"] == "built" else SimpleNamespace(id=row["id"], name=row["id"])

        def existing(project, commit=None):
            return {"sourceRevisionKey": "r1", "components": []} if project is built else None

        with mock.patch.object(workspace, "get_all_projects", return_value=rows),                 mock.patch("app.services.project_service._workspace_row_to_project", side_effect=convert),                 mock.patch("app.services.supply.project_bom.existing_index", side_effect=existing),                 mock.patch("app.services.supply.project_bom.queue_index", return_value=None) as start:
            response = self.call("POST", "/api/supply/bom/usage/build", role="designer")
            denied = self.call("POST", "/api/supply/bom/usage/build", role="qa")
        self.assertEqual((response.status, response.json), (200, {"projects": 3, "missing": 2, "queued": 2}))
        self.assertEqual([call.args[0] for call in start.call_args_list], ["bare_1", "bare_2"])
        self.assertEqual(start.call_args.kwargs, {"requested_by": "designer@example.com"})
        self.assertEqual(denied.status, 403)

    def test_the_refresh_endpoint_reads_every_project_with_its_folders_visibility(self) -> None:
        index = {"sourceRevisionKey": "r1", "components": [component("R1", "Acme", "R-1")]}
        rows = [
            {"id": "open", "name": "Open board", "visibility_mode": "inherit", "allowed_roles": []},
            {"id": "secret", "name": "Admin only board", "visibility_mode": "roles", "allowed_roles": ["admin"]},
        ]
        response = self.refresh_with(rows, index)
        self.assertEqual((response.status, response.json["updated"]), (200, 2))
        roles = {row["project_id"]: sorted(row["visible_roles"]) for row in self.rows("SELECT project_id, visible_roles FROM supply_bom_usage_projects")}
        self.assertEqual(roles, {"open": ["admin", "designer", "qa"], "secret": ["admin"]})

    def test_a_project_hidden_from_a_role_does_not_show_up_for_it(self) -> None:
        part_id = self.part("Acme", "R-1", watch=True)
        self.store_project("open", "Open board", [component("R1", "Acme", "R-1")])
        with self.store.connection() as conn:
            usage.store_project(conn, "secret", "Admin only board", "r1", usage.lines_from_components([component("R1", "Acme", "R-1")]), NOW, ["admin"])
        seen = lambda role: [u["project_name"] for u in self.call("GET", f"/api/supply/parts/{part_id}", role=role).json["used_in"]]  # noqa: E731
        self.assertEqual(sorted(seen("admin")), ["Admin only board", "Open board"])
        self.assertEqual(seen("designer"), ["Open board"])
        self.assertEqual(seen("qa"), ["Open board"])
        counted = lambda role: self.call("GET", "/api/supply/parts", role=role, query="scope=in_use").json["items"][0]["used_in"]  # noqa: E731
        self.assertEqual((counted("admin"), counted("designer")), (2, 1))

    def test_a_part_used_only_in_hidden_projects_is_not_in_use_for_that_role(self) -> None:
        self.part("Acme", "R-1")
        with self.store.connection() as conn:
            usage.store_project(conn, "secret", "Admin only board", "r1", usage.lines_from_components([component("R1", "Acme", "R-1")]), NOW, ["admin"])
        self.assertEqual(self.call("GET", "/api/supply/parts", role="designer", query="scope=in_use").json["total"], 0)
        self.assertEqual(self.call("GET", "/api/supply/parts", role="admin", query="scope=in_use").json["total"], 1)

    def test_who_may_refresh_and_look(self) -> None:
        for role in ("admin", "designer", "qa"):
            self.assertEqual(self.refresh_with([], None, role=role).status, 200, role)
        self.assertEqual(self.refresh_with([], None, role="viewer").status, 403)
        self.assertEqual(self.call("GET", "/api/supply/parts", role="viewer", query="scope=in_use").status, 403)


if __name__ == "__main__":
    unittest.main()
