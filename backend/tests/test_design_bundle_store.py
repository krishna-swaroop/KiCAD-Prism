"""The archive reader (bundle-format.md §9), readiness (§3.3) and the store's unpacked cache (§8)."""

from __future__ import annotations

import copy
import json
import os
import struct
import tempfile
import time
import unittest
import zlib
from pathlib import Path
from unittest import mock

from app.core.config import settings
from app.services.design_bundle import manifest as rules
from app.services.design_bundle import schemas, store
from app.services.design_bundle.archive import BundleInvalid, open_archive
from app.services.design_bundle.generator import bundle_key
from support import prism_kicad_stub as stub

EXAMPLES = Path(__file__).resolve().parents[2] / "native" / "contracts" / "prism" / "examples"
RK = "a" * 64


def _manifest(members: dict[str, bytes]) -> dict:
    """A valid parse-complete manifest over ``members`` (sources plus every projection)."""

    generator = json.loads((EXAMPLES / "CliVersionA0.example.json").read_text())
    listed = []
    for path, data in sorted(members.items(), key=lambda item: item[0].encode()):
        entry = {"path": path, "stage": "parse", "sha256": stub.digest(data), "bytes": len(data)}
        if path.startswith("sources/"):
            entry.update(role=stub.source_role(path.rsplit("/", 1)[-1]),
                         source={"path": path[8:], "kind": "regular", "object_id": stub.blob_id(data)})
        else:
            entry.update(role="projection", member_schema=next(s["schema"] for s in generator["member_schemas"] if s["path"] == path))
        listed.append(entry)
    stage = {"status": "complete", "warnings": [], "failed_members": []}
    return {
        "schema": "prism.bundle.manifest.a3", "generator": generator, "revision_key": RK,
        "bundle_key": bundle_key(RK, generator),
        "config": {"schema": "prism.revision_key.effective_config.a1", "project_file": "p.kicad_pro", "excluded_dirs": []},
        "board_id": "main",
        "stages": {"parse": stage, "board": {"status": "skipped", "skip_reason": "no-board", "warnings": [], "failed_members": []},
                   "models": {"status": "skipped", "skip_reason": "no-board", "warnings": [], "failed_members": []}},
        "read_set": {"probes": [], "listings": [], "gitlinks": []},
        "members": listed,
    }


def _members() -> dict[str, bytes]:
    members = {"sources/p.kicad_pro": b"{}\n"}
    for path, root in stub.PROJECTIONS.items():
        members[path] = (EXAMPLES / f"{root}.example.json").read_bytes()
    return members


def _write(path: Path, manifest: dict, members: dict[str, bytes], *, entries=None) -> Path:
    bundle = stub.compact(manifest) + b"\n"
    path.write_bytes(stub.zip_bytes(entries or [("bundle.json", bundle), *((m["path"], members[m["path"]]) for m in manifest["members"])]))
    return path


class ReaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.members = _members()
        self.manifest = _manifest(self.members)

    def _good(self) -> Path:
        return _write(self.tmp / "good.prism", self.manifest, self.members)

    def assertRejected(self, data: bytes, code: str, **kwargs) -> None:
        path = self.tmp / "bad.prism"
        path.write_bytes(data)
        with self.assertRaises(BundleInvalid) as caught:
            open_archive(path, **kwargs)
        self.assertEqual(caught.exception.code, code)

    def test_a_valid_archive_opens_and_every_member_reads(self) -> None:
        archive = open_archive(self._good(), expected_bundle_key=self.manifest["bundle_key"])
        self.assertEqual(rules.violations(archive.manifest), [])
        for path, data in self.members.items():
            self.assertEqual(archive.read(path), data)

    def test_the_contract_example_keeps_every_invariant(self) -> None:
        example = json.loads((EXAMPLES / "BundleManifestA3.example.json").read_text())
        self.assertEqual(rules.violations(example), [])
        broken = copy.deepcopy(example)
        broken["stages"]["board"].pop("fill_check")
        self.assertIn("I8: cross_check or fill_check", rules.violations(broken))

    def test_hostile_and_malformed_archives_are_rejected(self) -> None:
        good = self._good().read_bytes()
        self.assertRejected(good + b"x", "zip-malformed")  # trailing data
        self.assertRejected(good[:-2] + b"\x01\x00" + b"c", "zip-malformed")  # a comment
        self.assertRejected(good, "bundle-invalid", expected_bundle_key="b" * 64)  # identity (§9 step 5)
        descriptor = bytearray(good)
        cd_offset = struct.unpack_from("<I", good, len(good) - 6)[0]
        struct.pack_into("<H", descriptor, 6, 0x0808)  # a data descriptor, in both headers
        struct.pack_into("<H", descriptor, cd_offset + 8, 0x0808)
        self.assertRejected(bytes(descriptor), "zip-unsupported")
        bundle = stub.compact(self.manifest) + b"\n"
        entries = [("bundle.json", bundle), *((p, self.members[p]) for p in sorted(self.members, key=str.encode))]
        self.assertRejected(stub.zip_bytes([entries[0], ("../evil", b"x"), *entries[1:]]), "zip-path-invalid")
        self.assertRejected(stub.zip_bytes([*entries, ("SOURCES/p.kicad_pro", b"x")]), "zip-path-collision")
        self.assertRejected(stub.zip_bytes([*entries, (entries[1][0], b"y")]), "zip-duplicate-member")
        self.assertRejected(stub.zip_bytes(entries[1:] + entries[:1]), "zip-malformed")  # bundle.json not first
        self.assertRejected(stub.zip_bytes(entries[:-1]), "member-missing")
        self.assertRejected(stub.zip_bytes([*entries, ("sources/zz.kicad_sch", b"z")]), "member-unlisted")
        a1 = {**self.manifest, "schema": "prism.bundle.manifest", "version": "a1"}
        self.assertRejected(stub.zip_bytes([("bundle.json", stub.compact(a1)), *entries[1:]]), "manifest-unsupported")
        invalid = {**self.manifest, "board_id": "Main!"}
        self.assertRejected(stub.zip_bytes([("bundle.json", stub.compact(invalid)), *entries[1:]]), "manifest-invalid")

    def test_a_gap_and_disagreeing_local_headers(self) -> None:
        data = bytearray(self._good().read_bytes())
        cd_offset = struct.unpack_from("<I", data, len(data) - 6)[0]
        gap = bytearray(data[:cd_offset] + b"\0" + data[cd_offset:])
        struct.pack_into("<I", gap, len(gap) - 6, cd_offset + 1)  # the central directory moved one byte on
        self.assertRejected(bytes(gap), "zip-malformed")
        disagree = bytearray(data)
        struct.pack_into("<I", disagree, 14, struct.unpack_from("<I", data, 14)[0] ^ 1)  # local CRC only
        self.assertRejected(bytes(disagree), "zip-malformed")

    def test_a_zip_bomb_is_refused_before_inflating(self) -> None:
        bomb = b"\0" * (4 * 1024 * 1024)
        packed = zlib.compressobj(9, zlib.DEFLATED, -15)
        compressed = packed.compress(bomb) + packed.flush()
        self.assertGreater(len(bomb) // len(compressed), 200)
        members = {**self.members, "sources/bomb.step": bomb}
        manifest = _manifest(members)
        path = _write(self.tmp / "bomb.prism", manifest, members)
        with self.assertRaises(BundleInvalid) as caught:
            open_archive(path)
        self.assertEqual(caught.exception.code, "zip-ratio-exceeded")

    def test_a_member_that_lies_about_its_digest_or_schema(self) -> None:
        members = dict(self.members)
        manifest = _manifest(members)
        members["projections/stackup.json"] = b'{"schema":"prism.stackup.a0"}\n'  # same size? no: listed digest differs
        manifest_entry = next(m for m in manifest["members"] if m["path"] == "projections/stackup.json")
        manifest_entry["bytes"] = len(members["projections/stackup.json"])
        archive = open_archive(_write(self.tmp / "lie.prism", manifest, members))
        with self.assertRaises(BundleInvalid) as caught:
            archive.read("projections/stackup.json")
        self.assertEqual(caught.exception.code, "member-digest-mismatch")
        manifest_entry["sha256"] = stub.digest(members["projections/stackup.json"])
        archive = open_archive(_write(self.tmp / "schema.prism", manifest, members))
        with self.assertRaises(BundleInvalid) as caught:
            archive.read("projections/stackup.json")
        self.assertEqual(caught.exception.code, "member-schema-invalid")


class ReadinessTests(unittest.TestCase):
    def test_section_3_3(self) -> None:
        example = json.loads((EXAMPLES / "BundleManifestA3.example.json").read_text())
        self.assertEqual(rules.readiness(example, "projections/stackup.json", job_active=False).state, "ready")
        pending = copy.deepcopy(example)
        pending["members"] = [m for m in pending["members"] if m["stage"] == "parse"]
        pending["stages"]["board"] = {"status": "pending", "warnings": [], "failed_members": []}
        pending["stages"]["models"] = {"status": "pending", "warnings": [], "failed_members": []}
        self.assertEqual(rules.readiness(pending, "materialization/board.kmpack", job_active=True).state, "pending")
        self.assertEqual(rules.readiness(pending, "materialization/board.kmpack", job_active=False).state, "unavailable")
        partial = copy.deepcopy(pending)
        partial["stages"]["board"] = {"status": "partial", "fill_provenance": "refilled", "warnings": [],
                                      "failed_members": [{"path": "materialization/board.kmpack", "code": "materialization-failed", "message": "no copper"}]}
        partial["stages"]["models"] = {"status": "skipped", "skip_reason": "earlier-stage-failed", "warnings": [], "failed_members": []}
        self.assertEqual(rules.readiness(partial, "materialization/board.kmpack", job_active=False).state, "failed")
        self.assertEqual(rules.readiness(partial, "viewer/models/components.glb", job_active=False).detail, "earlier-stage-failed")
        no_design = copy.deepcopy(example)
        no_design["members"] = [m for m in no_design["members"] if m["path"] != "design.json"]
        self.assertEqual(rules.readiness(no_design, "design.json", job_active=False).state, "not-applicable")
        self.assertEqual(rules.readiness(None, "design.json", job_active=True).state, "pending")


class StoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_ROOT", str(self.tmp / "bundles")))
        self.members = _members()
        self.manifest = _manifest(self.members)
        self.digest = "c" * 64
        self.path = store.prepare("proj-1", RK, self.digest)
        _write(self.path, self.manifest, self.members)

    def test_layout(self) -> None:
        self.assertEqual(self.path, self.tmp / "bundles" / "proj-1" / RK / f"{self.digest}.prism")
        with self.assertRaises(ValueError):
            store.archive_path("../x", RK, self.digest)

    def test_lazy_verified_extraction_into_a_version_directory(self) -> None:
        archive = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        base = store.extract(archive, "proj-1", RK, self.digest, ["projections/stackup.json", "sources/"])
        self.assertEqual(base.name, archive.manifest_sha256)
        self.assertEqual((base / "bundle.json").read_bytes(), archive.manifest_bytes)
        self.assertEqual((base / "projections/stackup.json").read_bytes(), self.members["projections/stackup.json"])
        self.assertEqual(oct((base / "sources/p.kicad_pro").stat().st_mode & 0o777), "0o644")
        self.assertFalse((base / "projections/project.json").exists())  # only what was asked
        store.extract(archive, "proj-1", RK, self.digest, ["projections/stackup.json"])  # idempotent
        (base / "projections/stackup.json").unlink()
        (base / "projections/stackup.json").symlink_to("/etc/hosts")
        with self.assertRaises(BundleInvalid):
            store.extract(archive, "proj-1", RK, self.digest, ["projections/stackup.json"])

    def test_a_matching_marker_skips_step_7_but_step_6_still_fails_on_a_changed_member(self) -> None:
        archive = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        self.assertFalse(archive.verified)
        store.write_marker(archive, "proj-1", RK, self.digest)
        marker = store.marker_path("proj-1", RK, self.digest)
        self.assertEqual(marker.read_text(), archive.manifest_sha256 + "\n")
        opened = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        self.assertTrue(opened.verified)
        with mock.patch.object(schemas, "validate") as validate:
            self.assertEqual(opened.read("projections/stackup.json"), self.members["projections/stackup.json"])
            validate.assert_not_called()
        # Same manifest and marker, one changed member byte: step 6 still rejects it.
        altered = dict(self.members)
        data = altered["projections/stackup.json"]
        altered["projections/stackup.json"] = b"X" + data[1:]
        _write(self.path, self.manifest, altered)
        opened = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        self.assertTrue(opened.verified)
        with self.assertRaises(BundleInvalid) as caught:
            opened.read("projections/stackup.json")
        self.assertEqual(caught.exception.code, "member-digest-mismatch")

    def test_an_absent_or_stale_marker_still_runs_step_7(self) -> None:
        for marker_text in (None, "0" * 64 + "\n"):
            with self.subTest(marker=marker_text):
                marker = store.marker_path("proj-1", RK, self.digest)
                marker.unlink(missing_ok=True)
                if marker_text is not None:
                    marker.write_text(marker_text)
                opened = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
                self.assertFalse(opened.verified)
                with mock.patch.object(schemas, "validate") as validate:
                    self.assertEqual(opened.read("projections/stackup.json"), self.members["projections/stackup.json"])
                validate.assert_called_once()

    def test_deleting_or_superseding_a_generator_removes_the_marker(self) -> None:
        archive = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        store.write_marker(archive, "proj-1", RK, self.digest)
        marker = store.marker_path("proj-1", RK, self.digest)
        self.assertEqual(store.remove_other_generators("proj-1", RK, self.digest), [])
        self.assertTrue(marker.is_file())  # the kept generator keeps its marker
        self.assertEqual(store.remove_other_generators("proj-1", RK, "d" * 64), [self.digest])
        self.assertFalse(marker.exists())
        self.assertFalse(self.path.exists())
        self.path = store.prepare("proj-1", RK, self.digest)
        _write(self.path, self.manifest, self.members)
        archive = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        store.write_marker(archive, "proj-1", RK, self.digest)
        store.delete("proj-1", RK, self.digest)
        self.assertFalse(marker.exists())

    def test_a_rejected_archive_is_deleted_like_a_missing_one(self) -> None:
        self.path.write_bytes(self.path.read_bytes() + b"junk")
        self.assertIsNone(store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"]))
        self.assertFalse(self.path.exists())

    def test_older_generators_and_cache_versions_and_stale_temporaries_go(self) -> None:
        old = store.prepare("proj-1", RK, "d" * 64)
        old.write_bytes(b"old")
        (store.cache_dir("proj-1", RK, "d" * 64) / ("e" * 64)).mkdir(parents=True)
        self.assertEqual(store.remove_other_generators("proj-1", RK, self.digest), ["d" * 64])
        self.assertTrue(self.path.exists())
        archive = store.open_bundle("proj-1", RK, self.digest, self.manifest["bundle_key"])
        store.extract(archive, "proj-1", RK, self.digest, ["sources/"])
        stale = store.cache_dir("proj-1", RK, self.digest) / ("f" * 64)
        stale.mkdir()
        os.utime(stale, (time.time() - 7200, time.time() - 7200))
        self.assertEqual(store.prune_versions("proj-1", RK, self.digest, archive.manifest_sha256, grace_seconds=3600), 1)
        temp = self.path.parent / f".{self.path.name}.prism-kicad-42-0.tmp"
        temp.write_bytes(b"partial")
        os.utime(temp, (time.time() - 7200, time.time() - 7200))
        self.assertEqual(store.sweep_temporary_files(), 1)
        self.assertGreater(store.stored_bytes("proj-1"), 0)


if __name__ == "__main__":
    unittest.main()
