"""R19 acceptance: the Release Studio HTTP surface.

Route handlers are called directly (the pattern `test_health_api.py` uses) so
the gate logic is exercised without standing up OIDC.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import sys
import tarfile
import unittest
import zipfile
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402


@dataclass
class _User:
    """Mirrors the identity fields the routes actually read off AuthenticatedUser.

    `email` is the identity the routes record as actor/owner/approver; the stub
    carried `username`, which the real model does not have, so the stub could
    not have caught the routes referencing a non-existent attribute.
    """

    email: str
    role: str = "designer"


def _run(coro):
    return asyncio.run(coro)


class ReleaseStudioRequestAndCoverageTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.api import release_studio as api

        self.api = api

    def test_candidate_requires_a_full_immutable_git_sha(self) -> None:
        valid = "a" * 40
        self.assertEqual(self.api.CandidateRequest(commit_sha=valid).commit_sha, valid)
        for mutable_or_ambiguous in ("HEAD", "main", "a" * 12, "g" * 40):
            with self.assertRaises(ValidationError):
                self.api.CandidateRequest(commit_sha=mutable_or_ambiguous)

    def test_candidate_enqueue_identity_includes_variant(self) -> None:
        user = _User("designer")
        requests: list[dict] = []
        identity = {"tag": "v1.0.0", "document_name": "DOC", "date": "2026-08-14"}

        def enqueue(kind, payload, **kwargs):  # noqa: ANN001 - JobService seam
            requests.append({"kind": kind, "payload": payload, **kwargs})
            return {"job_id": f"job-{len(requests)}"}

        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api.jobs, "enqueue", side_effect=enqueue),
            patch.object(self.api.workspace, "get_project_by_id", return_value={"repo_url": "https://github.com/org/repo.git"}),
            patch.object(self.api.forge_publish, "tag_exists", return_value=False),
        ):
            first = _run(self.api.create_candidate(
                "project", self.api.CandidateRequest(
                    config_key="production", commit_sha="a" * 40, variant="A", identity=identity
                ), user
            ))
            same = _run(self.api.create_candidate(
                "project", self.api.CandidateRequest(
                    config_key="production", commit_sha="a" * 40, variant="A", identity=identity
                ), user
            ))
            other = _run(self.api.create_candidate(
                "project", self.api.CandidateRequest(
                    config_key="production", commit_sha="a" * 40, variant="B", identity=identity
                ), user
            ))
        self.assertEqual(first["job"]["job_id"], "job-1")
        self.assertEqual(same["job"]["job_id"], "job-2")
        self.assertNotEqual(requests[0]["artifact_key"], requests[2]["artifact_key"])
        self.assertEqual(requests[0]["artifact_key"], requests[1]["artifact_key"])
        self.assertEqual(other["job"]["job_id"], "job-3")

    def test_publish_request_requires_a_tag(self) -> None:
        with self.assertRaises(ValidationError):
            self.api.PublishRequest(tag="")
        request = self.api.PublishRequest(tag="v1.0.0", title="Board", notes="notes")
        self.assertEqual(request.tag, "v1.0.0")

    def test_source_discovery_hides_internal_exception_details(self) -> None:
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(
                self.api.workspace,
                "get_project_by_id",
                return_value={"path": "/srv/private/board", "relative_path": "board"},
            ),
            patch(
                "app.release_studio.source.discover_source",
                side_effect=RuntimeError("failed at /srv/private/board/secret.kicad_pro"),
            ),
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.get_source(
                        "project", "a" * 40, _User("viewer", role="viewer")
                    )
                )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(
            caught.exception.detail,
            "Could not inspect this revision's Release Studio source.",
        )
        self.assertNotIn("/srv/private", str(caught.exception.detail))

    def test_publish_zips_the_dossier_and_creates_a_forge_release(self) -> None:
        user = _User("designer@example.com")
        build = {
            "id": "build-1",
            "candidate_id": "candidate-1",
            "status": "succeeded",
            "dossier_artifact_id": "dossier-1",
        }
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api, "_build_or_404", return_value=build),
            patch.object(
                self.api.store,
                "get_candidate",
                return_value={"id": "candidate-1", "commit_sha": "a" * 40},
            ),
            patch.object(
                self.api.workspace,
                "get_project_by_id",
                return_value={"name": "board", "repo_url": "https://github.com/org/repo.git"},
            ),
            patch.object(self.api, "_artifact_bytes", return_value=b"tar-bytes"),
            patch.object(
                self.api,
                "_candidate_configuration",
                return_value={"revision": "v1.0.0", "release_notes": "composed notes"},
            ),
            patch.object(self.api.forge_publish, "dossier_tar_to_zip", return_value=b"zip-bytes") as zip_fn,
            patch.object(
                self.api.forge_publish,
                "publish_release",
                return_value={"url": "https://github.com/org/repo/releases/tag/v1.0.0", "tag": "v1.0.0", "forge": "github"},
            ) as publish_fn,
            patch.object(
                self.api,
                "_approval_state",
                return_value={"can_publish": True, "published": None, "blocked_reason": ""},
            ),
            patch.object(self.api, "_ready_vendor_pack_assets", return_value=([], [])),
            patch.object(self.api.store, "record_publish", return_value={"id": "pub-1", "tag": "v1.0.0"}),
        ):
            payload = _run(
                self.api.publish_build(
                    "project",
                    "build-1",
                    self.api.PublishRequest(tag="v1.0.0", title="Board", notes="shipped"),
                    user,
                )
            )
        self.assertEqual(payload["filename"], "board-v1.0.0.zip")
        self.assertEqual(payload["release"]["url"], "https://github.com/org/repo/releases/tag/v1.0.0")
        zip_fn.assert_called_once_with(b"tar-bytes")
        publish_fn.assert_called_once()
        kwargs = publish_fn.call_args.kwargs
        self.assertEqual(kwargs["tag"], "v1.0.0")
        self.assertEqual(kwargs["commit_sha"], "a" * 40)
        self.assertEqual(kwargs["filename"], "board-v1.0.0.zip")
        # Notes reach the cover's revision-history table, so the Release
        # description is the composed text rather than the browser's copy.
        self.assertEqual(kwargs["notes"], "composed notes")
        self.assertEqual(kwargs["title"], "v1.0.0")
        self.assertEqual(kwargs["extra_assets"], [])

    def test_publish_refuses_a_tag_the_build_was_not_composed_as(self) -> None:
        """A stale draft must not name a Release the sheets inside contradict."""

        user = _User("designer@example.com")
        build = {
            "id": "build-1",
            "candidate_id": "candidate-1",
            "status": "succeeded",
            "dossier_artifact_id": "dossier-1",
        }
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api, "_build_or_404", return_value=build),
            patch.object(
                self.api.store,
                "get_candidate",
                return_value={"id": "candidate-1", "commit_sha": "a" * 40},
            ),
            patch.object(
                self.api,
                "_candidate_configuration",
                return_value={"revision": "v1.1.0"},
            ),
            patch.object(self.api.forge_publish, "publish_release") as publish_fn,
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.publish_build(
                        "project",
                        "build-1",
                        self.api.PublishRequest(tag="v1.2.0"),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("v1.1.0", str(caught.exception.detail))
        publish_fn.assert_not_called()

    def test_publish_refuses_a_build_that_recorded_no_tag(self) -> None:
        user = _User("designer@example.com")
        build = {
            "id": "build-1",
            "candidate_id": "candidate-1",
            "status": "succeeded",
            "dossier_artifact_id": "dossier-1",
        }
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api, "_build_or_404", return_value=build),
            patch.object(
                self.api.store,
                "get_candidate",
                return_value={"id": "candidate-1", "commit_sha": "a" * 40},
            ),
            patch.object(self.api, "_candidate_configuration", return_value={}),
            patch.object(self.api.forge_publish, "publish_release") as publish_fn,
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.publish_build(
                        "project",
                        "build-1",
                        self.api.PublishRequest(tag="v1.0.0"),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 409)
        publish_fn.assert_not_called()

    def test_publish_refuses_a_failed_build(self) -> None:
        user = _User("designer@example.com")
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(
                self.api,
                "_build_or_404",
                return_value={"id": "build-1", "status": "failed"},
            ),
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.publish_build(
                        "project",
                        "build-1",
                        self.api.PublishRequest(tag="v1.0.0"),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 409)


    def test_enqueue_requires_tag_document_name_and_date(self) -> None:
        user = _User("designer@example.com")
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api.workspace, "get_project_by_id", return_value={"repo_url": ""}),
            patch.object(self.api.jobs, "enqueue") as enqueue,
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.create_candidate(
                        "project",
                        self.api.CandidateRequest(commit_sha="a" * 40),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 400)
        enqueue.assert_not_called()

    def test_enqueue_refuses_a_tag_that_already_exists(self) -> None:
        user = _User("designer@example.com")
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(
                self.api.workspace,
                "get_project_by_id",
                return_value={"repo_url": "https://github.com/org/repo.git"},
            ),
            patch.object(self.api.forge_publish, "tag_exists", return_value=True),
            patch.object(self.api.jobs, "enqueue") as enqueue,
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.create_candidate(
                        "project",
                        self.api.CandidateRequest(
                            commit_sha="a" * 40,
                            identity={"tag": "v1.0.0", "document_name": "DOC", "date": "2026-08-14"},
                        ),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 409)
        enqueue.assert_not_called()

    def test_publish_refuses_a_build_that_is_not_clear_to_publish(self) -> None:
        user = _User("designer@example.com")
        build = {
            "id": "build-1",
            "candidate_id": "candidate-1",
            "status": "succeeded",
            "dossier_artifact_id": "dossier-1",
        }
        with (
            patch.object(self.api, "get_project_for_role_or_404"),
            patch.object(self.api, "_build_or_404", return_value=build),
            patch.object(
                self.api.store,
                "get_candidate",
                return_value={"id": "candidate-1", "commit_sha": "a" * 40},
            ),
            patch.object(
                self.api,
                "_candidate_configuration",
                return_value={"revision": "v1.0.0"},
            ),
            patch.object(self.api, "_vendor_readiness", return_value=[]),
            patch.object(
                self.api,
                "_approval_state",
                return_value={
                    "can_publish": False,
                    "published": None,
                    "blocked_reason": "Designer and QA must both approve this dossier.",
                },
            ),
            patch.object(self.api.forge_publish, "publish_release") as publish_fn,
        ):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.publish_build(
                        "project",
                        "build-1",
                        self.api.PublishRequest(tag="v1.0.0"),
                        user,
                    )
                )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("Designer and QA", str(caught.exception.detail))
        publish_fn.assert_not_called()


class ReleaseStudioDocumentSheetApiTests(unittest.TestCase):
    """D10: composed sheets have a first-class immutable preview surface."""

    def setUp(self) -> None:
        from app.api import release_studio as api

        self.api = api
        self.user = _User("viewer", role="viewer")
        self.pdf = b"%PDF-1.4 test fabrication"
        self.digest = hashlib.sha256(self.pdf).hexdigest()
        pdf_member = {
            "id": "member-pdf",
            "path": "documentation/fabrication.pdf",
            "released_digest": self.digest,
            "media_type": "application/pdf",
        }
        payload = io.BytesIO()
        with tarfile.open(fileobj=payload, mode="w:gz") as archive:
            info = tarfile.TarInfo(pdf_member["path"])
            info.size = len(self.pdf)
            archive.addfile(info, io.BytesIO(self.pdf))

        patches = (
            patch.object(api, "get_project_for_role_or_404", lambda *_args: None),
            patch.object(api, "_build_or_404", lambda *_args: {"dossier_artifact_id": "a1"}),
            patch.object(api.store, "build_members", lambda _build: [pdf_member]),
            patch.object(api, "_artifact_bytes", lambda _artifact: payload.getvalue()),
        )
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_sheet_listing_is_pdf_only(self) -> None:
        result = _run(
            self.api.list_document_sheets("proj", "build", user=self.user)
        )
        self.assertEqual([item["key"] for item in result["sheets"]], ["fabrication"])
        self.assertNotIn("svg", result["sheets"][0])
        self.assertEqual(
            result["sheets"][0]["pdf"]["path"], "documentation/fabrication.pdf"
        )

    def test_sheet_preview_is_digest_checked_and_immutable(self) -> None:
        response = _run(
            self.api.preview_document_sheet(
                "proj", "build", "fabrication", user=self.user
            )
        )
        self.assertEqual(response.body, self.pdf)
        self.assertEqual(response.headers["etag"], f'"{self.digest}"')
        self.assertIn("immutable", response.headers["cache-control"])

    def test_sheet_preview_rejects_non_key_paths(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            _run(
                self.api.preview_document_sheet(
                    "proj", "build", "../manifest", user=self.user
                )
            )
        self.assertEqual(caught.exception.status_code, 404)

    def test_sheet_preview_hides_corrupt_archive_details(self) -> None:
        with patch.object(self.api, "_artifact_bytes", return_value=b"not a tar archive"):
            with self.assertRaises(HTTPException) as caught:
                _run(
                    self.api.preview_document_sheet(
                        "proj", "build", "fabrication", user=self.user
                    )
                )

        self.assertEqual(caught.exception.status_code, 500)
        self.assertEqual(caught.exception.detail, "The stored dossier could not be read.")


class ReleaseStudioVendorApiTests(unittest.TestCase):
    """Vendor profiles and packs are registry-shaped, not JLCPCB-shaped."""

    def setUp(self) -> None:
        from app.api import release_studio as api

        self.api = api
        self.user = _User("viewer", role="viewer")
        gerber = b"G04 gerber*\n"
        xlsx = b"xlsx-bom"
        dossier = io.BytesIO()
        with tarfile.open(fileobj=dossier, mode="w:gz") as archive:
            for name, payload in (
                ("fabrication/gerbers/board-F_Cu.gbr", gerber),
                ("fabrication/drill/board-PTH.drl", b"M48\n"),
                ("manufacturing/vendors/jlcpcb/bom.csv", b"Comment,Designator\n"),
                ("manufacturing/vendors/jlcpcb/cpl.csv", b"Designator,PosX\n"),
            ):
                info = tarfile.TarInfo(name)
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
        evidence = io.BytesIO()
        with tarfile.open(fileobj=evidence, mode="w:gz") as archive:
            info = tarfile.TarInfo("raw/vendors/jlcpcb/bom.xlsx")
            info.size = len(xlsx)
            archive.addfile(info, io.BytesIO(xlsx))
            info = tarfile.TarInfo("raw/vendors/jlcpcb/cpl.xlsx")
            info.size = len(xlsx)
            archive.addfile(info, io.BytesIO(xlsx))
        self.dossier_bytes = dossier.getvalue()
        self.evidence_bytes = evidence.getvalue()
        patches = (
            patch.object(api, "get_project_for_role_or_404", lambda *_args: None),
            patch.object(
                api,
                "_build_or_404",
                lambda *_args: {
                    "id": "build-1",
                    "dossier_artifact_id": "dossier-1",
                    "evidence_artifact_id": "evidence-1",
                },
            ),
            patch.object(
                api,
                "_artifact_bytes",
                lambda artifact_id: (
                    self.dossier_bytes
                    if artifact_id == "dossier-1"
                    else self.evidence_bytes
                ),
            ),
        )
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_lists_registered_profiles(self) -> None:
        payload = _run(self.api.list_vendor_profiles("proj", user=self.user))
        self.assertEqual([item["id"] for item in payload["profiles"]], ["jlcpcb"])
        self.assertTrue(all("pack_filename" in item for item in payload["profiles"]))
        self.assertTrue(all("title" in item for item in payload["profiles"]))

    def test_unknown_vendor_pack_is_not_jlc_shaped(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            _run(
                self.api.download_build_vendor_pack(
                    "proj", "build-1", "pcbway", user=self.user
                )
            )
        self.assertEqual(caught.exception.status_code, 404)
        self.assertIn("Unknown vendor", str(caught.exception.detail))

    def test_jlcpcb_pack_is_a_zip_of_gerbers_and_workbooks(self) -> None:
        response = _run(
            self.api.download_build_vendor_pack(
                "proj", "build-1", "jlcpcb", user=self.user
            )
        )
        self.assertEqual(response.media_type, "application/zip")
        self.assertIn("jlcpcb-upload.zip", response.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
            names = set(archive.namelist())
        self.assertIn("gerbers/board-F_Cu.gbr", names)
        self.assertIn("drill/board-PTH.drl", names)
        self.assertIn("bom.xlsx", names)
        self.assertIn("cpl.xlsx", names)


if __name__ == "__main__":
    unittest.main()
