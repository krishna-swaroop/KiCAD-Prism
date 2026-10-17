"""WP-C1a: the semantic index is read from the design bundle under its switch.

With ``PRISM_DESIGN_SOURCE_SEMANTIC_INDEX=bundle`` every public reader of
``semantic_index_service`` serves the bundle member
``projections/semantic-index.json`` (``prism.semantic_index.a2``) instead of
building and storing its own index; the legacy path is untouched when the
switch is ``legacy``, when a working-tree request is made, when the member is
not ready yet, and when the bundle answers a final non-member.

The stored bundle is faked from the stub CLI's contract examples
(``support/prism_kicad_stub.py``), the way ``test_design_bundle_store.py``
does, and ``reader.open_revision`` is patched to hand the service the opened
revision; no ``prism-kicad`` process runs.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from starlette.requests import Request

from app.api import project_semantic_index as api
from app.core.config import settings
from app.services import semantic_index_service
from app.services.design_bundle import consumer
from app.services.design_bundle.archive import open_archive
from app.services.design_bundle.generator import bundle_key
from app.services.design_bundle.reader import OpenedRevision
from support import prism_kicad_stub as stub

EXAMPLES = Path(__file__).resolve().parents[2] / "native" / "contracts" / "prism" / "examples"
REVISION_KEY = "a" * 64
GENERATOR_DIGEST = "c" * 64
COMMIT = "1234567890abcdef1234567890abcdef12345678"
LEGACY_INDEX = {"schema": "prism.semantic_index_a0", "components": []}


# ------------------------------------------------------------------ the bundle


def _members() -> dict[str, bytes]:
    members = {"sources/p.kicad_pro": b"{}\n"}
    for path, root in stub.PROJECTIONS.items():
        members[path] = (EXAMPLES / f"{root}.example.json").read_bytes()
    return members


def _manifest(members: dict[str, bytes]) -> dict:
    """A valid parse-complete manifest over ``members`` (test_design_bundle_store.py's shape)."""

    generator = json.loads((EXAMPLES / "CliVersionA0.example.json").read_text())
    listed = []
    for path, data in sorted(members.items(), key=lambda item: item[0].encode()):
        entry = {"path": path, "stage": "parse", "sha256": stub.digest(data), "bytes": len(data)}
        if path.startswith("sources/"):
            entry.update(role=stub.source_role(path.rsplit("/", 1)[-1]),
                         source={"path": path[8:], "kind": "regular", "object_id": stub.blob_id(data)})
        else:
            entry.update(role="projection",
                         member_schema=next(s["schema"] for s in generator["member_schemas"] if s["path"] == path))
        listed.append(entry)
    stage = {"status": "complete", "warnings": [], "failed_members": []}
    return {
        "schema": "prism.bundle.manifest.a3", "generator": generator, "revision_key": REVISION_KEY,
        "bundle_key": bundle_key(REVISION_KEY, generator),
        "config": {"schema": "prism.revision_key.effective_config.a1", "project_file": "p.kicad_pro", "excluded_dirs": []},
        "board_id": "main",
        "stages": {"parse": stage, "board": {"status": "skipped", "skip_reason": "no-board", "warnings": [], "failed_members": []},
                   "models": {"status": "skipped", "skip_reason": "no-board", "warnings": [], "failed_members": []}},
        "read_set": {"probes": [], "listings": [], "gitlinks": []},
        "members": listed,
    }


def _write_bundle(path: Path, manifest: dict, members: dict[str, bytes]) -> Path:
    archive = stub.compact(manifest) + b"\n"
    path.write_bytes(stub.zip_bytes(
        [("bundle.json", archive), *((m["path"], members[m["path"]]) for m in manifest["members"])]
    ))
    return path


class _User:
    def __init__(self, role: str = "viewer") -> None:
        self.email = "viewer@example.com"
        self.name = "Viewer"
        self.role = role


def _request(headers: dict[str, str] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "headers": [(key.lower().encode("ascii"), value.encode("ascii")) for key, value in (headers or {}).items()],
            "query_string": b"",
            "client": ("127.0.0.1", 12345),
        }
    )


# --------------------------------------------------------------------- tests


class _BundleCase(unittest.TestCase):
    """A stored stub bundle, the switch, and the two seams every reader shares."""

    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.members = _members()
        self.member_bytes = self.members["projections/semantic-index.json"]
        self.member = json.loads(self.member_bytes)
        self.manifest = _manifest(self.members)
        self.archive = open_archive(_write_bundle(self.tmp / "p1.prism", self.manifest, self.members))
        self.project = SimpleNamespace(id="p1", path=str(self.tmp / "checkout"))

        self.enterContext(mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_ROOT", str(self.tmp / "bundles")))
        # The commit is resolved the way _revision_identity resolves it; the opened
        # revision stands in for reader.open_revision so no workspace row is read.
        self.locate = self.enterContext(mock.patch.object(
            semantic_index_service.project_revision, "locate", return_value=SimpleNamespace(repo_root=self.tmp)))
        self.resolve = self.enterContext(mock.patch.object(
            semantic_index_service.project_revision, "resolve_commit", return_value=COMMIT))
        self.open_revision = self.enterContext(mock.patch.object(
            consumer.reader, "open_revision", return_value=self.opened()))

    def opened(self, *, member: bool = True) -> OpenedRevision:
        # bundle_key None: read/extract must not touch the bundle rows (there is no
        # database here); readiness comes from the archive's manifest alone.
        archive = self.archive
        if not member:  # a final bundle that carries no semantic-index member
            only = {"sources/p.kicad_pro": b"{}\n"}
            archive = open_archive(_write_bundle(self.tmp / "empty.prism", _manifest(only), only))
        return OpenedRevision(
            project_id="p1", commit=COMMIT, revision_key=REVISION_KEY, generator_digest=GENERATOR_DIGEST,
            bundle_key=None, archive=archive, job_active=False,
        )

    def _legacy_artifact(self) -> Path:
        """A stored legacy index and the patches that make the legacy readers find it."""

        root = self.tmp / "index"
        self.enterContext(mock.patch.object(semantic_index_service, "semantic_index_root", return_value=root))
        self.enterContext(mock.patch.object(
            semantic_index_service, "_revision_identity", return_value=("legacykey", COMMIT)))
        path = Path(semantic_index_service.artifact_path("p1", "legacykey"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(LEGACY_INDEX), encoding="utf-8")
        return path

    def _bundle(self):
        return mock.patch.object(settings, "PRISM_DESIGN_SOURCE_SEMANTIC_INDEX", "bundle")

    def _legacy(self):
        return mock.patch.object(settings, "PRISM_DESIGN_SOURCE_SEMANTIC_INDEX", "legacy")


class ReaderTests(_BundleCase):
    def test_legacy_never_opens_the_bundle_and_keeps_today_s_results(self) -> None:
        path = self._legacy_artifact()
        with self._legacy():
            self.assertEqual(semantic_index_service.get_or_build(self.project, "HEAD"), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.get_existing(self.project, "HEAD"), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.generate(self.project, "HEAD"), LEGACY_INDEX)
            artifact = semantic_index_service.artifact_file(self.project, "HEAD")
            self.assertEqual(tuple(artifact), (path, "legacykey"))
            self.assertEqual(artifact.generator, semantic_index_service.generator_cache_tag())
            self.assertEqual(semantic_index_service.get_status(self.project, "HEAD")["available"], True)
        self.open_revision.assert_not_called()
        self.resolve.assert_not_called()

    def test_a_working_tree_request_never_opens_the_bundle(self) -> None:
        self._legacy_artifact()
        with self._bundle():
            self.assertEqual(semantic_index_service.get_or_build(self.project, None), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.get_status(self.project, None)["available"], True)
        self.open_revision.assert_not_called()

    def test_a_ready_member_serves_every_reader(self) -> None:
        self.resolve.reset_mock()
        with self._bundle():
            self.assertEqual(semantic_index_service.get_or_build(self.project, "HEAD"), self.member)
            self.assertEqual(semantic_index_service.get_existing(self.project, "HEAD"), self.member)
            self.assertEqual(semantic_index_service.generate(self.project, "HEAD", force=True), self.member)
        self.resolve.assert_called_with(self.locate.return_value, "HEAD")
        self.open_revision.assert_called_with("p1", COMMIT, queue=True, requested_by="")

    def test_a_ready_member_artifact_file_is_the_verified_cache_file(self) -> None:
        with self._bundle():
            artifact = semantic_index_service.artifact_file(self.project, "HEAD")
        path, revision_key = artifact
        self.assertEqual(revision_key, REVISION_KEY)
        self.assertEqual(artifact.generator, GENERATOR_DIGEST)
        self.assertEqual(path.read_bytes(), self.member_bytes)

    def test_a_not_ready_member_falls_back_to_the_legacy_result(self) -> None:
        self._legacy_artifact()
        # pending: bundle_read answers None and queues the build
        with self._bundle(), mock.patch.object(consumer, "bundle_read", return_value=None):
            self.assertEqual(semantic_index_service.get_or_build(self.project, "HEAD"), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.get_existing(self.project, "HEAD"), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.generate(self.project, "HEAD"), LEGACY_INDEX)
        # not-applicable: a real final bundle that carries no semantic-index member
        with self._bundle(), mock.patch.object(
            consumer.reader, "open_revision", return_value=self.opened(member=False)
        ):
            self.assertEqual(semantic_index_service.get_or_build(self.project, "HEAD"), LEGACY_INDEX)
            self.assertEqual(semantic_index_service.get_status(self.project, "HEAD")["sourceRevisionKey"], "legacykey")


class StatusTests(_BundleCase):
    def test_status_is_bundle_shaped_when_the_member_is_ready(self) -> None:
        with self._bundle():
            status = semantic_index_service.get_status(self.project, "HEAD")
        self.assertEqual(status["schema"], "prism.semantic_index_status_a0")
        self.assertEqual(status["projectId"], "p1")
        self.assertEqual(status["sourceRevisionKey"], REVISION_KEY)
        self.assertEqual(status["commit"], COMMIT)
        self.assertTrue(status["available"])
        self.assertEqual(status["generator"]["cacheTag"], GENERATOR_DIGEST)
        self.assertEqual(
            set(status["generator"]),
            {"name", "version", "build", "cacheTag", "kicadMonkeyVersion"},
        )

    def test_status_keeps_today_s_shape_in_legacy_mode(self) -> None:
        self._legacy_artifact()
        with self._legacy():
            status = semantic_index_service.get_status(self.project, "HEAD")
        self.assertEqual(status["schema"], "prism.semantic_index_status_a0")
        self.assertEqual(status["sourceRevisionKey"], "legacykey")
        self.assertTrue(status["available"])
        self.assertEqual(status["generator"]["cacheTag"], semantic_index_service.generator_cache_tag())

    def test_status_falls_back_when_the_member_is_not_ready(self) -> None:
        self._legacy_artifact()
        with self._bundle(), mock.patch.object(consumer, "bundle_read", return_value=None):
            status = semantic_index_service.get_status(self.project, "HEAD")
        self.assertEqual(status["sourceRevisionKey"], "legacykey")
        self.assertEqual(status["generator"]["cacheTag"], semantic_index_service.generator_cache_tag())


class IdentityRouteTests(_BundleCase):
    def test_identity_serves_the_member_with_the_bundle_etag_and_304(self) -> None:
        etag = f'"{REVISION_KEY}-{GENERATOR_DIGEST}"'
        with mock.patch.object(api, "get_project_for_role_or_404", return_value=self.project), self._bundle():
            response = asyncio.run(api.get_semantic_index_identity(_request(), "p1", "HEAD", _User()))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["etag"], etag)
            self.assertEqual(Path(response.path).read_bytes(), self.member_bytes)

            cached = asyncio.run(api.get_semantic_index_identity(
                _request({"If-None-Match": etag}), "p1", "HEAD", _User()))
        self.assertEqual(cached.status_code, 304)
        self.assertEqual(cached.body, b"")


if __name__ == "__main__":
    unittest.main()
