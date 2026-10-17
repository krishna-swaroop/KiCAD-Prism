"""The viewer-source routes served from a revision's bundle (WP-C8b, ADR §8).

With ``PRISM_DESIGN_SOURCE_PROJECT_METADATA=bundle`` the routes in
``backend/app/api/project_viewer_sources.py`` serve a revision's design files
from ``sources/<RepoPath>`` instead of a checkout or a Git read. These tests
build a stored bundle (the ``prism-kicad`` stub's canonical zip writer) that
holds exactly the sources the legacy path reads, and assert the two answers are
the same bytes, lists, headers and status; that the ``legacy`` switch never
opens a bundle; and that a member that is not ready falls back to legacy.
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.api import project_viewer_sources as viewer_sources
from app.core.config import settings
from app.core.security import AuthenticatedUser
from app.services import project_service
from app.services import project_viewer_sources_bundle as mapping
from app.services.design_bundle import reader, schemas
from app.services.design_bundle.archive import open_archive
from app.services.design_bundle.consumer import BundleRead
from app.services.design_bundle.generator import bundle_key
from app.services.design_bundle.reader import OpenedRevision
from support import prism_kicad_stub as stub
from support.repo import init_repo

EXAMPLES = Path(__file__).resolve().parents[2] / "native" / "contracts" / "prism" / "examples"
GENERATOR = json.loads((EXAMPLES / "CliVersionA0.example.json").read_text(encoding="utf-8"))
REVISION_KEY = "b" * 64
GENERATOR_DIGEST = "c" * 64
PROJECT_ID = "prj_demo"

PRO_CONTENT = json.dumps({"schematic": {"page_layout_descr_file": "Sheet.kicad_wks"}}) + "\n"
SCH_CONTENT = "(kicad_sch (version 20260306) (generator \"eeschema\"))\n"
PCB_CONTENT = "(kicad_pcb (version 20260206) (generator \"pcbnew\"))\n"
POWER_CONTENT = "(kicad_sch (version 20260306))\n"
WKS_CONTENT = "(page_layout (version 20240101))\n"

REPO_FILES = {
    "board/demo.kicad_pro": PRO_CONTENT,
    "board/demo.kicad_sch": SCH_CONTENT,
    "board/demo.kicad_pcb": PCB_CONTENT,
    "board/Subsheets/power.kicad_sch": POWER_CONTENT,
    "board/Sheet.kicad_wks": WKS_CONTENT,
    "board/Design-Outputs/model.step": "ISO-10303-21;\n",
    "README.md": "# demo\n",
}


def project_document() -> dict:
    """A ``projections/project.json`` consistent with ``REPO_FILES``."""

    return {
        "schema": "prism.project.a0",
        "projectFile": "board/demo.kicad_pro",
        "projectName": "demo",
        "textVariables": {},
        "netClasses": [],
        "documents": [
            {"path": "board/Subsheets/power.kicad_sch", "kind": "schematic", "properties": {}},
            {"path": "board/demo.kicad_pcb", "kind": "board", "properties": {}},
            {"path": "board/demo.kicad_sch", "kind": "root-schematic", "properties": {}},
        ],
        "references": [
            {
                "kind": "drawing-sheet",
                "documentPath": "board/demo.kicad_pro",
                "field": "/schematic/page_layout_descr_file",
                "raw": "Sheet.kicad_wks",
                "variables": [],
                "target": {
                    "kind": "repository", "path": "board/Sheet.kicad_wks",
                    "base": "project-directory", "inSources": True,
                },
            },
            {
                "kind": "sheet-file",
                "documentPath": "board/demo.kicad_sch",
                "sheetUuid": "5eb27ce9-6d8e-40a9-9f6d-8f14c5f68638",
                "raw": "Subsheets/power.kicad_sch",
                "variables": [],
                "target": {
                    "kind": "repository", "path": "board/Subsheets/power.kicad_sch",
                    "base": "document-directory", "inSources": True,
                },
            },
        ],
    }


CONFIG = {
    "schema": "prism.revision_key.effective_config.a1",
    "project_file": "board/demo.kicad_pro",
    "root_schematic": "board/demo.kicad_sch",
    "board": "board/demo.kicad_pcb",
    "excluded_dirs": [],
}

SOURCE_MEMBERS = {
    f"sources/{path}": content.encode("utf-8")
    for path, content in REPO_FILES.items()
    if path != "README.md" and not path.endswith((".glb", ".step", ".stp"))
}


def bundle_members(*, sources: dict[str, bytes] | None = None, document: dict | None = None) -> dict[str, bytes]:
    """The source members plus the project projection the mapping reads."""

    members = dict(SOURCE_MEMBERS if sources is None else sources)
    members[mapping.PROJECT_JSON] = (json.dumps(document or project_document()) + "\n").encode("utf-8")
    return members


def manifest_for(members: dict[str, bytes], config: dict, *, parse_status: str = "complete") -> dict:
    """A manifest over ``members`` (the store's test builder, with this project's config)."""

    listed = []
    for path, data in sorted(members.items(), key=lambda item: item[0].encode("utf-8")):
        entry = {"path": path, "stage": "parse", "sha256": stub.digest(data), "bytes": len(data)}
        if path.startswith("sources/"):
            entry.update(
                role=stub.source_role(path.rsplit("/", 1)[-1]),
                source={"path": path[len("sources/"):], "kind": "regular", "object_id": stub.blob_id(data)},
            )
        else:
            entry.update(
                role="projection",
                member_schema=next(s["schema"] for s in GENERATOR["member_schemas"] if s["path"] == path),
            )
        listed.append(entry)
    return {
        "schema": "prism.bundle.manifest.a3",
        "generator": GENERATOR,
        "revision_key": REVISION_KEY,
        "bundle_key": bundle_key(REVISION_KEY, GENERATOR),
        "config": config,
        "board_id": "main",
        "stages": {
            "parse": {"status": parse_status, "warnings": [], "failed_members": []},
            "board": {"status": "pending", "warnings": [], "failed_members": []},
            "models": {"status": "pending", "warnings": [], "failed_members": []},
        },
        "read_set": {"probes": [], "listings": [], "gitlinks": []},
        "members": listed,
    }


def write_bundle(path: Path, members: dict[str, bytes], config: dict, *, parse_status: str = "complete"):
    manifest = manifest_for(members, config, parse_status=parse_status)
    bundle = stub.compact(manifest) + b"\n"
    entries = [("bundle.json", bundle)] + [(m["path"], members[m["path"]]) for m in manifest["members"]]
    path.write_bytes(stub.zip_bytes(entries))
    return open_archive(path)


def normalize(response) -> tuple[object, dict[str, str], bytes]:
    """A route's answer as ``(status, headers, body)``; a JSON dict route keeps its document."""

    if isinstance(response, dict):
        return None, {}, json.dumps(response, sort_keys=True).encode("utf-8")
    return render(response)


def render(response) -> tuple[int, dict[str, str], bytes]:
    """Run an ASGI response to completion and return its status, headers and body."""

    scope = {"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": []}
    messages: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(response(scope, receive, send))
    start = next(message for message in messages if message["type"] == "http.response.start")
    headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in start["headers"]}
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], headers, body


#: FileResponse stamps these from the served file's inode; the cache copy and the
#: checkout copy differ there, and nothing a client decides on depends on them.
VOLATILE_HEADERS = ("etag", "last-modified", "date")


def stable(headers: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in headers.items() if key not in VOLATILE_HEADERS}


class _BundleFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.repo = init_repo(self.tmp / "repo", REPO_FILES)
        assert self.repo is not None
        self.project = project_service.Project(
            id=PROJECT_ID,
            name="demo",
            description="",
            path=str(self.tmp / "repo" / "board"),
            last_modified="",
            parent_repo_path=str(self.tmp / "repo"),
            project_file="demo.kicad_pro",
        )
        self.user = AuthenticatedUser(email="viewer@example.com", name="Viewer", role="viewer")
        self.enterContext(mock.patch.object(settings, "PRISM_DESIGN_BUNDLE_ROOT", str(self.tmp / "bundles")))

    def opened(
        self,
        members: dict[str, bytes] | None = None,
        *,
        config: dict | None = None,
        parse_status: str = "complete",
    ) -> OpenedRevision:
        members = bundle_members() if members is None else members
        config = CONFIG if config is None else config
        archive = write_bundle(self.tmp / "demo.prism", members, config, parse_status=parse_status)
        return OpenedRevision(PROJECT_ID, self.repo, REVISION_KEY, GENERATOR_DIGEST, None, archive, False)

    def read(self, **kwargs) -> BundleRead:
        """The ``BundleRead`` the route would get, through the real consumer gate."""

        from app.services.design_bundle.consumer import bundle_read

        opened = self.opened(**kwargs)
        with mock.patch.object(settings, "PRISM_DESIGN_SOURCE_PROJECT_METADATA", "bundle"), \
                mock.patch.object(reader, "open_revision", return_value=opened):
            result = bundle_read("PROJECT_METADATA", PROJECT_ID, self.repo, [mapping.PROJECT_JSON])
        assert result is not None
        return result

    def serve(self, route, *, mode: str, bundle: OpenedRevision | None = None, **kwargs):
        """Call a route under ``mode``; the legacy mode asserts no bundle was opened."""

        with mock.patch.object(settings, "PRISM_DESIGN_SOURCE_PROJECT_METADATA", mode), \
                mock.patch.object(viewer_sources, "get_project_for_role_or_404", return_value=self.project):
            if mode == "bundle":
                with mock.patch.object(reader, "open_revision", return_value=bundle):
                    return asyncio.run(route(user=self.user, **kwargs))
            with mock.patch.object(reader, "open_revision") as open_revision:
                response = asyncio.run(route(user=self.user, **kwargs))
            open_revision.assert_not_called()
            return response

    def assert_same(self, bundle_response, legacy_response) -> None:
        status, headers, body = normalize(bundle_response)
        legacy_status, legacy_headers, legacy_body = normalize(legacy_response)
        self.assertEqual(status, legacy_status)
        self.assertEqual(body, legacy_body)
        self.assertEqual(stable(headers), stable(legacy_headers))


class ViewerSourceBundleTests(_BundleFixture):
    # -- /schematic --------------------------------------------------------

    def test_schematic_at_a_commit_matches_legacy(self) -> None:
        route = viewer_sources.get_project_schematic
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    def test_schematic_in_the_working_tree_matches_legacy(self) -> None:
        route = viewer_sources.get_project_schematic
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=None, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=None, project_id=PROJECT_ID),
        )

    def test_schematic_falls_back_when_the_config_names_no_root(self) -> None:
        config = {**CONFIG}
        del config["root_schematic"]
        bundle = self.opened(config=config)
        route = viewer_sources.get_project_schematic
        # The bundle branch declines; the legacy path still serves the file.
        response = self.serve(route, mode="bundle", bundle=bundle, commit=self.repo, project_id=PROJECT_ID)
        self.assert_same(response, self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID))

    def test_the_working_tree_never_opens_a_bundle(self) -> None:
        # A request without a commit is the working tree, which may hold
        # uncommitted changes no bundle carries: it stays legacy in bundle mode.
        routes = (
            viewer_sources.get_project_schematic,
            viewer_sources.get_project_pcb,
            viewer_sources.get_project_subsheets,
            viewer_sources.get_project_viewer_support_files,
        )
        for route in routes:
            with self.subTest(route=route.__name__), \
                    mock.patch.object(settings, "PRISM_DESIGN_SOURCE_PROJECT_METADATA", "bundle"), \
                    mock.patch.object(viewer_sources, "get_project_for_role_or_404", return_value=self.project), \
                    mock.patch.object(reader, "open_revision") as open_revision:
                asyncio.run(route(user=self.user, commit=None, project_id=PROJECT_ID))
                open_revision.assert_not_called()

    # -- /pcb --------------------------------------------------------------

    def test_pcb_at_a_commit_matches_legacy(self) -> None:
        route = viewer_sources.get_project_pcb
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    def test_pcb_in_the_working_tree_matches_legacy(self) -> None:
        route = viewer_sources.get_project_pcb
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=None, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=None, project_id=PROJECT_ID),
        )

    # -- /schematic/subsheets ---------------------------------------------

    def test_subsheets_at_a_commit_match_legacy(self) -> None:
        route = viewer_sources.get_project_subsheets
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    def test_subsheets_in_the_working_tree_match_legacy(self) -> None:
        route = viewer_sources.get_project_subsheets
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=None, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=None, project_id=PROJECT_ID),
        )

    # -- /viewer/support-files --------------------------------------------

    def test_support_files_at_a_commit_match_legacy(self) -> None:
        route = viewer_sources.get_project_viewer_support_files
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    def test_support_files_in_the_working_tree_match_legacy(self) -> None:
        route = viewer_sources.get_project_viewer_support_files
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=None, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=None, project_id=PROJECT_ID),
        )

    # -- /3d-model ---------------------------------------------------------

    def test_3d_model_keeps_the_legacy_path(self) -> None:
        route = viewer_sources.get_project_3d_model
        self.assert_same(
            self.serve(route, mode="bundle", bundle=self.opened(), commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    # -- rollout -----------------------------------------------------------

    def test_a_missing_member_falls_back_to_legacy(self) -> None:
        # The projection is ready, so the bundle answers; its board member is not
        # present, so the PCB route keeps today's answer.
        sources = {path: data for path, data in SOURCE_MEMBERS.items() if not path.endswith("demo.kicad_pcb")}
        bundle = self.opened(members=bundle_members(sources=sources))
        route = viewer_sources.get_project_pcb
        self.assert_same(
            self.serve(route, mode="bundle", bundle=bundle, commit=self.repo, project_id=PROJECT_ID),
            self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID),
        )

    def test_a_not_ready_member_falls_back_without_a_response_change(self) -> None:
        # The projection itself is still pending: `bundle_read` returns None.
        members = {"sources/board/demo.kicad_pro": PRO_CONTENT.encode("utf-8")}
        bundle = self.opened(members=members, parse_status="pending")
        route = viewer_sources.get_project_schematic
        response = self.serve(route, mode="bundle", bundle=bundle, commit=self.repo, project_id=PROJECT_ID)
        self.assert_same(response, self.serve(route, mode="legacy", commit=self.repo, project_id=PROJECT_ID))

    def test_the_legacy_switch_never_opens_a_bundle(self) -> None:
        for route, kwargs in (
            (viewer_sources.get_project_schematic, {"project_id": PROJECT_ID, "commit": self.repo}),
            (viewer_sources.get_project_subsheets, {"project_id": PROJECT_ID, "commit": self.repo}),
            (viewer_sources.get_project_viewer_support_files, {"project_id": PROJECT_ID, "commit": self.repo}),
            (viewer_sources.get_project_pcb, {"project_id": PROJECT_ID, "commit": self.repo}),
            (viewer_sources.get_project_3d_model, {"project_id": PROJECT_ID, "commit": self.repo}),
        ):
            with self.subTest(route=route.__name__), \
                    mock.patch.object(settings, "PRISM_DESIGN_SOURCE_PROJECT_METADATA", "legacy"), \
                    mock.patch.object(viewer_sources, "get_project_for_role_or_404", return_value=self.project), \
                    mock.patch.object(reader, "open_revision") as open_revision:
                asyncio.run(route(user=self.user, **kwargs))
                open_revision.assert_not_called()


class MappingTests(_BundleFixture):
    """The bundle branch itself: each mapping reads the member it should."""

    def test_schematic_reads_config_root_schematic(self) -> None:
        source = mapping.schematic(self.read())
        assert source is not None
        self.assertEqual(
            (source.name, source.repo_path, source.content),
            ("demo.kicad_sch", "board/demo.kicad_sch", SCH_CONTENT.encode("utf-8")),
        )

    def test_schematic_is_none_without_a_root_schematic(self) -> None:
        config = {**CONFIG}
        del config["root_schematic"]
        self.assertIsNone(mapping.schematic(self.read(config=config)))

    def test_pcb_reads_config_board(self) -> None:
        source = mapping.pcb(self.read())
        assert source is not None
        self.assertEqual(
            (source.name, source.repo_path, source.content),
            ("demo.kicad_pcb", "board/demo.kicad_pcb", PCB_CONTENT.encode("utf-8")),
        )

    def test_subsheets_are_the_hierarchy_documents_with_project_relative_urls(self) -> None:
        files = mapping.subsheets(self.read(), PROJECT_ID, self.repo)
        self.assertEqual(
            files,
            [{
                "name": "Subsheets/power.kicad_sch",
                "url": f"/api/projects/{PROJECT_ID}/asset/Subsheets/power.kicad_sch?commit={self.repo}",
            }],
        )

    def test_subsheets_in_the_working_tree_drop_the_commit(self) -> None:
        files = mapping.subsheets(self.read(), PROJECT_ID, None)
        self.assertEqual(
            files,
            [{
                "name": "Subsheets/power.kicad_sch",
                "url": f"/api/projects/{PROJECT_ID}/asset/Subsheets/power.kicad_sch",
            }],
        )

    def test_subsheets_decline_without_a_main_schematic(self) -> None:
        config = {**CONFIG}
        del config["root_schematic"]
        self.assertIsNone(mapping.subsheets(self.read(config=config), PROJECT_ID, self.repo))

    def test_support_files_are_the_project_file_and_its_drawing_sheet(self) -> None:
        files = mapping.support_files(self.read())
        self.assertEqual(
            files,
            [
                {"filename": "demo.kicad_pro", "content": PRO_CONTENT},
                {"filename": "Sheet.kicad_wks", "content": WKS_CONTENT},
            ],
        )

    def test_support_files_decline_when_the_drawing_sheet_is_not_a_source(self) -> None:
        document = project_document()
        document["references"][0]["target"] = {
            "kind": "repository", "path": "board/Sheet.kicad_wks", "base": "project-directory", "inSources": False,
        }
        self.assertIsNone(mapping.support_files(self.read(members=bundle_members(document=document))))

    def test_support_files_decline_when_the_drawing_sheet_member_is_absent(self) -> None:
        sources = {path: data for path, data in SOURCE_MEMBERS.items() if not path.endswith("Sheet.kicad_wks")}
        self.assertIsNone(mapping.support_files(self.read(members=bundle_members(sources=sources))))

    def test_a_source_the_bundle_lacks_is_none(self) -> None:
        sources = {path: data for path, data in SOURCE_MEMBERS.items() if not path.endswith("demo.kicad_pcb")}
        self.assertIsNone(mapping.pcb(self.read(members=bundle_members(sources=sources))))


class ProjectDocumentTests(unittest.TestCase):
    def test_the_test_document_is_a_valid_project_member(self) -> None:
        schemas.validate(project_document(), "prism.project.a0")


if __name__ == "__main__":
    unittest.main()
