"""SB2-01: manifests from the live system, the DB round trip, and manifest-backed snapshots (CONTRACTS_P2 §9)."""

from __future__ import annotations

import unittest

from fastapi import FastAPI
from unittest import mock

from test_system_api import _request
from test_system_snapshots import DESIGNER, VIEWER, SnapshotCase

from app.api import systems as systems_api
from app.services.systems import manifest as manifest_io
from app.services.systems import service as service_module
from app.services.systems.manifest_schema import Manifest, connectivity_view, digests, full_view
from app.services.systems.store import Forbidden, Invalid, NotFound

NOW = "2026-09-30T12:00:00+00:00"


class ManifestTest(SnapshotCase):
    def build(self) -> Manifest:
        manifest = manifest_io.build(self.store, self.sid, created_by="user:t", created_at=NOW)
        self.conn.commit()
        return manifest

    def test_build_captures_every_instance_link_row_override_and_layout(self) -> None:
        self.store.put_layout(self.sid, {self.instances["PAY"]: {"x": 10, "y": -20}})
        with self.store.mutation(self.sid, expected_version=None, actor="user:t") as change:
            key = self.store.list_links(self.sid)[0]["a_port"]["portKey"]
            self.store.set_override(change, self.instances["OBC-A"], key, "promoted")
        self.conn.commit()
        manifest = self.build()
        self.assertEqual({i.label for i in manifest.instances}, set(self.instances))
        self.assertEqual({link.name for link in manifest.links} >= set(self.links), True)
        rows = sum(len(link["rows"]) for link in self.store.list_links(self.sid))
        self.assertEqual(sum(len(link.rows) for link in manifest.links), rows)
        obc = next(i for i in manifest.instances if i.id == self.instances["OBC-A"])
        self.assertEqual([(o.portKey, o.state) for o in obc.portOverrides], [(key, "promoted")])
        self.assertEqual(manifest.layout.positions[self.instances["PAY"]].model_dump(), {"x": 10.0, "y": -20.0})
        self.assertEqual(manifest.meta.sourceVersion, self.version())
        # Writers sort by ID so the same state always serializes the same way.
        self.assertEqual([i.id for i in manifest.instances], sorted(i.id for i in manifest.instances))
        self.assertEqual(digests(manifest), digests(self.build()))

    def test_round_trip_db_manifest_db_keeps_ids_and_digests(self) -> None:
        self.store.put_layout(self.sid, {self.instances["OBC-A"]: {"x": 1.5, "y": 2.5}})
        with self.store.mutation(self.sid, expected_version=None, actor="user:t") as change:
            self.store.update_system(change, optional_rules=["SYS-V09"])
        self.conn.commit()
        before = self.build()
        self.assertEqual(before.system.optionalRules, ["SYS-V09"])
        self.store.delete_system(self.sid)
        self.conn.commit()
        imported = manifest_io.import_manifest(self.store, before, actor="user:importer")
        self.conn.commit()
        self.assertEqual(imported, before.system.id)
        after = self.build()
        self.assertEqual(full_view(after), full_view(before))
        self.assertEqual(digests(after), digests(before))
        self.assertEqual([e["kind"] for e in self.store.history(self.sid)][:1], ["system_imported"])

    def test_import_refuses_an_id_that_already_exists_and_unsupported_sections(self) -> None:
        manifest = self.build()
        with self.assertRaises(Exception):
            manifest_io.import_manifest(self.store, manifest, actor="user:t")
        self.conn.rollback()
        body = manifest.model_dump(mode="json", by_alias=True)
        body["placement"]["drivingMates"] = [{"instanceId": body["instances"][0]["id"],
                                               "linkId": body["links"][0]["id"]}]
        with self.assertRaises(Invalid):
            manifest_io.import_manifest(self.store, Manifest.model_validate(body), actor="user:t")

    def test_snapshot_stores_the_manifest_and_its_digests(self) -> None:
        meta = self.snapshot("CDR")
        stored = self.store.get_snapshot(self.sid, meta["id"])
        manifest = Manifest.model_validate(stored["manifest"])
        self.assertEqual(manifest.meta.snapshot.model_dump(), {"id": meta["id"], "name": "CDR", "note": ""})
        self.assertEqual((meta["digest"], meta["connectivityDigest"]),
                         (digests(manifest)["full"], digests(manifest)["connectivity"]))
        self.assertEqual(meta["manifestSchema"], "prism.system_manifest.v1")

        # Nothing changed: same digests. A layout move changes only the full digest.
        again = self.snapshot("CDR-2")
        self.assertEqual((again["digest"], again["connectivityDigest"]), (meta["digest"], meta["connectivityDigest"]))
        self.store.put_layout(self.sid, {self.instances["PAY"]: {"x": 400, "y": 0}})
        self.conn.commit()
        moved = self.snapshot("CDR-3")
        self.assertEqual(moved["connectivityDigest"], meta["connectivityDigest"])
        self.assertNotEqual(moved["digest"], meta["digest"])

    def test_p1_snapshots_without_a_manifest_stay_readable(self) -> None:
        with self.store.mutation(self.sid, expected_version=None, actor="user:t", bump=False) as change:
            legacy = self.store.create_snapshot(change, name="old", note="", document={"system": {}, "instances": []},
                                                digest="sha256:legacy", open_review_count=0, renderer_version="1")
        self.conn.commit()
        [listed] = [s for s in self.service.list_snapshots(DESIGNER, self.sid) if s["id"] == legacy["id"]]
        self.assertEqual((listed["manifestSchema"], listed["connectivityDigest"]), (None, None))
        with self.assertRaises(NotFound):
            self.service.snapshot_manifest(DESIGNER, self.sid, legacy["id"])

    def test_manifest_is_served_whole_or_not_at_all(self) -> None:
        meta = self.snapshot("CDR")
        served = self.service.snapshot_manifest(VIEWER, self.sid, meta["id"])
        self.assertEqual(served["meta"]["snapshot"]["id"], meta["id"])
        self.hide_pay()
        with self.assertRaises(Forbidden):
            self.service.snapshot_manifest(VIEWER, self.sid, meta["id"])

        app = FastAPI()
        app.include_router(systems_api.router, prefix="/api/systems")
        with mock.patch.object(service_module, "service", self.service):
            denied = _request(app, "GET", f"/api/systems/{self.sid}/snapshots/{meta['id']}/manifest", user="viewer")
            allowed = _request(app, "GET", f"/api/systems/{self.sid}/snapshots/{meta['id']}/manifest", user="admin")
        self.assertEqual(denied.status, 403)
        self.assertEqual(allowed.status, 200)
        self.assertEqual(connectivity_view(Manifest.model_validate(allowed.json))["system"]["id"], self.sid)


if __name__ == "__main__":
    unittest.main()
