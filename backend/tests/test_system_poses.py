"""SB2-28: stored poses (CONTRACTS_P2 §14.3, D-P2-14).

A pose is audited placement data: it saves with a version check, never moves
the connectivity digest, is frozen in snapshots (and restored from them), and
a child system's poses travel inside its snapshot as a rigid group.
"""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from fastapi import FastAPI
from unittest import mock

from test_system_api import _request
from test_system_scene import SceneCase
from test_system_snapshots import DESIGNER, VIEWER, SnapshotCase

from app.api import systems as systems_api
from app.services.systems import manifest as manifest_io
from app.services.systems import service as service_module
from app.services.systems.manifest_schema import Manifest
from app.services.systems.placement import poses
from app.services.systems.scene import board_bounds
from app.services.systems.store import Invalid, NotFound, StaleVersion

QUARTER_Z = [0.0, 0.0, math.sqrt(0.5), math.sqrt(0.5)]  # 90° about +z
CASES = json.loads((Path(__file__).resolve().parent / "fixtures" / "system_builder" / "placement_cases.json").read_text())


class PoseGoldenTest(unittest.TestCase):
    """The pose cases shared with ``frontend/…/placement/poses.test.ts`` replay here exactly."""

    OPS = {
        "canonicalRotation": lambda i: poses.canonical_rotation(i["rotation"]),
        "poseFrom": lambda i: poses.pose_from(i["translationMm"], i["rotation"]),
        "compose": lambda i: poses.compose(i["parent"], i["child"]),
        "matrix": lambda i: poses.matrix(i["pose"]),
        "transformBounds": lambda i: poses.transform_bounds(i["pose"], i["bounds"]),
        "defaultRow": lambda i: poses.default_row([(k, b) for k, b in i["items"]]),
        "place": lambda i: poses.place([(k, b) for k, b in i["items"]], i["stored"]),
    }

    def test_every_case_replays(self) -> None:
        self.assertEqual({c["op"] for c in CASES["poses"]}, set(self.OPS))
        for spec in CASES["poses"]:
            with self.subTest(case=spec["name"]):
                self.assertEqual(self.OPS[spec["op"]](spec["input"]), spec["expected"])


class PoseLibraryTest(unittest.TestCase):
    def test_pose_from_canonicalises_the_rotation(self) -> None:
        pose = poses.pose_from([1, 2, 3], [0, 0, -2, -2])
        self.assertEqual(pose["translationMm"], [1.0, 2.0, 3.0])
        self.assertEqual(pose["rotation"], poses.canonical_rotation(QUARTER_Z))
        self.assertGreater(pose["rotation"][3], 0)

    def test_pose_from_refuses_what_is_not_a_pose(self) -> None:
        for translation, rotation in (([0, 0], [0, 0, 0, 1]), ([0, 0, 0], [0, 0, 0, 0]),
                                      ([math.nan, 0, 0], [0, 0, 0, 1]), ([0, 0, 0], [0, math.inf, 0, 1]),
                                      ([2e6, 0, 0], [0, 0, 0, 1])):
            with self.subTest(translation=translation, rotation=rotation), self.assertRaises(ValueError):
                poses.pose_from(translation, rotation)

    def test_a_stored_pose_wins_and_the_others_keep_their_default_slots(self) -> None:
        box = {"minMm": [0, 0, -0.8], "maxMm": [50, 40, 0.8]}
        items = [("a", box), ("b", box), ("c", box)]
        defaults = poses.default_row(items)
        moved = {"translationMm": [5, 500, 0], "rotation": QUARTER_Z, "source": "manual"}
        placed = poses.place(items, {"b": moved})
        self.assertEqual(placed["b"], {"translationMm": [5.0, 500.0, 0.0],
                                       "rotation": poses.canonical_rotation(QUARTER_Z), "source": "manual"})
        for key in ("a", "c"):
            self.assertEqual(placed[key], {**defaults[key], "source": "default"}, "moving b never shifts c")


class PoseServiceTest(SnapshotCase):
    def move(self, label: str, translation, rotation=(0, 0, 0, 1), version=None):
        return self.service.set_pose(DESIGNER, self.sid, self.version() if version is None else version,
                                     self.instances[label], {"translationMm": list(translation),
                                                             "rotation": list(rotation)})

    def test_a_move_is_stored_audited_and_version_checked(self) -> None:
        before = self.version()
        result = self.move("OBC-A", [10, 20, 30], QUARTER_Z)
        self.assertEqual(result.version, before + 1)
        self.assertEqual((result.body["source"], result.body["translationMm"], result.body["updatedBy"]),
                         ("manual", [10.0, 20.0, 30.0], DESIGNER.actor))
        listed = self.service.poses(VIEWER, self.sid)
        self.assertEqual(listed["version"], before + 1)
        self.assertEqual([p["instanceId"] for p in listed["poses"]], [self.instances["OBC-A"]])
        [event] = self.events("pose_updated")
        self.assertEqual(event["payload"]["before"], None)
        self.assertEqual(event["payload"]["after"]["translationMm"], [10.0, 20.0, 30.0])

        with self.assertRaises(StaleVersion):
            self.move("OBC-A", [0, 0, 0], version=before)
        with self.assertRaises(Invalid):
            self.move("OBC-A", [0, 0, 0], (0, 0, 0, 0))
        with self.assertRaises(NotFound):
            self.service.set_pose(DESIGNER, self.sid, self.version(), "sin_missing",
                                  {"translationMm": [0, 0, 0], "rotation": [0, 0, 0, 1]})

    def test_moving_never_changes_the_connectivity_digest(self) -> None:
        first = self.snapshot("before")
        self.move("PWR", [0, 120, 0], QUARTER_Z)
        moved = self.snapshot("after")
        self.assertEqual(moved["connectivityDigest"], first["connectivityDigest"])
        self.assertNotEqual(moved["digest"], first["digest"])

    def test_a_snapshot_freezes_poses_and_restores_them(self) -> None:
        self.move("PWR", [0, 120, 0], QUARTER_Z)
        meta = self.snapshot("CDR")
        frozen = Manifest.model_validate(self.store.get_snapshot(self.sid, meta["id"])["manifest"])
        [pose] = frozen.placement.poses
        self.assertEqual((pose.instanceId, pose.translationMm, pose.source),
                         (self.instances["PWR"], [0.0, 120.0, 0.0], "manual"))
        live = self.service.poses(DESIGNER, self.sid)["poses"]

        self.move("PWR", [999, 0, 0])  # later edits don't touch the frozen copy
        self.store.delete_system(self.sid)
        self.conn.commit()
        manifest_io.import_manifest(self.store, frozen, actor="user:importer")
        self.conn.commit()
        restored = self.service.poses(DESIGNER, self.sid)["poses"]
        strip = lambda items: [{k: v for k, v in p.items() if k not in ("updatedBy", "updatedAt")} for p in items]
        self.assertEqual(strip(restored), strip(live))

    def test_clear_and_reset_go_back_to_default(self) -> None:
        self.move("OBC-A", [10, 0, 0])
        self.move("PWR", [20, 0, 0])
        cleared = self.service.set_pose(DESIGNER, self.sid, self.version(), self.instances["OBC-A"], None)
        self.assertEqual(cleared.body, {"instanceId": self.instances["OBC-A"], "source": "default"})
        self.move("OBC-B", [30, 0, 0])
        result = self.service.reset_poses(DESIGNER, self.sid, self.version())
        self.assertEqual(result.body["reset"], sorted([self.instances["PWR"], self.instances["OBC-B"]]))
        self.assertEqual(self.service.poses(DESIGNER, self.sid)["poses"], [])
        [event] = self.events("poses_reset")
        self.assertEqual(event["payload"]["instanceIds"], result.body["reset"])

    def test_deleting_an_instance_drops_its_pose(self) -> None:
        self.move("PAY", [10, 0, 0])
        self.service.remove_instance(DESIGNER, self.sid, self.version(), self.instances["PAY"], cascade=True)
        self.assertEqual(self.service.poses(DESIGNER, self.sid)["poses"], [])

    def test_api(self) -> None:
        app = FastAPI()
        app.include_router(systems_api.router, prefix="/api/systems")
        url = f"/api/systems/{self.sid}/poses"
        body = {"translationMm": [1, 2, 3], "rotation": [0, 0, 0, 1]}
        etag = lambda: {"If-Match": f'"sys:{self.sid}:{self.version()}"'}
        with mock.patch.object(service_module, "service", self.service):
            unconditional = _request(app, "PUT", f"{url}/{self.instances['PWR']}", body=body, user="designer")
            viewer = _request(app, "PUT", f"{url}/{self.instances['PWR']}", body=body, user="viewer",
                              headers=etag())
            saved = _request(app, "PUT", f"{url}/{self.instances['PWR']}", body=body, user="designer",
                             headers=etag())
            bad = _request(app, "PUT", f"{url}/{self.instances['PWR']}", body={**body, "rotation": [0, 0, 0]},
                           user="designer", headers=etag())
            listed = _request(app, "GET", url, user="viewer")
            reset = _request(app, "DELETE", url, user="designer", headers=etag())
        self.assertEqual(unconditional.status, 428)
        self.assertEqual(viewer.status, 403)
        self.assertEqual(saved.status, 200, saved.text)
        self.assertEqual(saved.json["source"], "manual")
        self.assertEqual(bad.status, 422)
        self.assertEqual(listed.status, 200)
        self.assertEqual(len(listed.json["poses"]), 1)
        self.assertEqual((reset.status, reset.json["reset"]), (200, [self.instances["PWR"]]))


class PoseSceneTest(SceneCase):
    def test_the_scene_draws_a_stored_pose_and_leaves_the_rest_in_their_slots(self) -> None:
        defaults = {o["displayPath"]: o for o in self.service.scene(DESIGNER, self.sid)["occurrences"]}
        self.service.set_pose(DESIGNER, self.sid, self.version(), self.instances["OBC-B"],
                              {"translationMm": [5, 300, 0], "rotation": QUARTER_Z})
        scene = {o["displayPath"]: o for o in self.service.scene(DESIGNER, self.sid)["occurrences"]}
        moved = scene["OBC-B"]
        self.assertEqual(moved["pose"]["source"], "manual")
        expected = poses.pose_from([5, 300, 0], QUARTER_Z)
        self.assertEqual(moved["worldMatrix"], poses.matrix(expected))
        self.assertEqual(moved["boundsMm"], board_bounds(self.interface("OBC-B")), "bounds stay in the board's own frame")
        for label in ("OBC-A", "PAY", "PWR"):
            self.assertEqual(scene[label]["pose"], defaults[label]["pose"])

    def test_a_child_systems_poses_travel_in_its_snapshot(self) -> None:
        self.service.set_pose(DESIGNER, self.sid, self.version(), self.instances["PWR"],
                              {"translationMm": [0, 150, 0], "rotation": [0, 0, 0, 1]})
        publication = self.child()
        bus, version = self.parent()
        added = self.add(bus, version, "CNDH-A", publication["componentId"])
        self.add(bus, added.version, "CNDH-B", publication["componentId"])
        # A live change in the child after publishing doesn't reach the parent.
        self.service.set_pose(DESIGNER, self.sid, self.version(), self.instances["PWR"],
                              {"translationMm": [0, 999, 0], "rotation": [0, 0, 0, 1]})
        scene = {o["displayPath"]: o for o in self.service.scene(DESIGNER, bus)["occurrences"]}
        for copy in ("CNDH-A", "CNDH-B"):
            with self.subTest(copy=copy):
                pwr = scene[f"{copy} ▸ PWR"]
                self.assertEqual((pwr["pose"]["translationMm"], pwr["pose"]["source"]), ([0.0, 150.0, 0.0], "manual"))
                group = scene[copy]["worldMatrix"]
                self.assertEqual(pwr["worldMatrix"][13] - group[13], 150.0)
        self.assertEqual(scene["CNDH-A"]["pose"]["source"], "default")


if __name__ == "__main__":
    unittest.main()
