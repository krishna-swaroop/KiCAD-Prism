"""The bundled variant catalog (ADR native design bundle §9.6, C1).

With ``PRISM_DESIGN_SOURCE_SEMANTIC_INDEX=bundle`` a commit's catalog is the
bundle member ``projections/semantic-index.json``'s ``assembly``, not a source
scan. The acceptance is parity: for every committed case whose sources were
*not* upgraded, today's ``discover_snapshot_catalog`` on the fixture equals the
golden ``assembly`` mapped back to today's shape. The switch tests pin the
rollout fallback: the working tree and a member that is not ready never leave
the legacy path.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from app.core.config import settings
from app.services import variant_catalog_service
from app.services.design_bundle import consumer
from app.services.design_bundle.manifest import Readiness
from app.services.project_source_snapshot import ProjectSourceSnapshot
from support.repo import init_repo  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
GOLDENS = REPO / "native" / "parity" / "goldens"
FIXTURES = json.loads((REPO / "native" / "parity" / "fixtures.json").read_text(encoding="utf-8"))

#: Committed parity cases whose sources stage parse did not upgrade; for these
#: the golden ``assembly`` is exactly what today's discovery answers.
CASES = (
    "dv-case_fold",
    "dv-kicad11_tokens",
    "dv-no_variants",
    "dv-oracle",
    "dv-oracle_rev2",
    "dv-rule_area",
    "dv-sch_only",
    "sb-mini_obc-F0",
    "sb-mini_obc-F1",
    "sb-mini_obc-F11.1",
    "sb-mini_obc-F11.2",
    "sb-mini_obc-F2",
    "sb-mini_obc-F3",
    "sb-mini_obc-F4",
    "sb-mini_obc-F5",
    "sb-mini_obc-F6",
    "sb-mini_obc-F7",
    "sb-mini_obc-F8",
    "sb-mini_obc-F9",
    "sb-mini_payload-F0",
    "sb-mini_power-F0",
    "sb-mini_power-F10",
    "sb-p2-ambiguous-F0",
    "sb-p2-edge_a-F0",
    "sb-p2-edge_b-F0",
    "sb-p2-mezz_base-F0",
    "sb-p2-mezz_top-F0",
    "sb-p2-mezz_top-F1",
)

PROJECT_FILES = {
    "boards/main/main.kicad_pro": json.dumps({"schematic": {"variants": [{"name": "Lite"}]}}),
    "boards/main/main.kicad_sch": "(kicad_sch (version 20260306) (generator \"eeschema\"))\n",
    "boards/main/main.kicad_pcb": "(kicad_pcb (version 20260206) (generator \"pcbnew\"))\n",
}

BUNDLE_ENTRY = {"name": "FromBundle", "description": None, "sources": ["project"]}
BUNDLE_DIAGNOSTIC = {
    "code": "source-unparseable",
    "severity": "error",
    "source": "schematic",
    "path": "boards/main/broken.kicad_sch",
    "message": "Could not read broken.kicad_sch as a KiCad source.",
}


def golden_assembly(case: str) -> dict:
    return json.loads((GOLDENS / case / "semantic-index.json").read_text(encoding="utf-8"))["assembly"]


class GoldenParityTests(unittest.TestCase):
    """The mapping reproduces today's discovery for the non-upgraded goldens."""

    def test_today_discovery_equals_the_goldens_assembly(self) -> None:
        by_id = {fixture["id"]: fixture for fixture in FIXTURES["fixtures"]}
        for case in CASES:
            with self.subTest(case=case):
                fixture = by_id[case]
                root = (REPO / fixture["sourceRoot"]).resolve()
                snapshot = ProjectSourceSnapshot(
                    root=root,
                    project_file=(root / fixture["project"]).resolve(),
                    commit=None,
                )
                today = variant_catalog_service.discover_snapshot_catalog(snapshot)
                # A committed fixture's source root is its project directory, so
                # the golden's RepoPaths are already today's spelling (D9).
                mapped = variant_catalog_service._catalog_body_from_assembly(
                    golden_assembly(case), ""
                )
                self.assertEqual(mapped, today)

    def test_resolver_diagnostics_stay_out_of_the_catalog(self) -> None:
        # dv-oracle's only diagnostics are resolver ones (no `source`): the
        # catalog answer must be their empty list, not the resolver's rows.
        mapped = variant_catalog_service._catalog_body_from_assembly(golden_assembly("dv-oracle"), "")
        self.assertEqual(mapped["diagnostics"], [])

    def test_catalog_diagnostics_are_kept_in_emission_order(self) -> None:
        mapped = variant_catalog_service._catalog_body_from_assembly(golden_assembly("dv-case_fold"), "")
        self.assertEqual(
            [diagnostic["code"] for diagnostic in mapped["diagnostics"]],
            ["catalog-name-case-mismatch", "catalog-name-case-mismatch"],
        )

    def test_repository_relative_paths_map_to_the_project(self) -> None:
        assembly = {"catalog": [], "diagnostics": [BUNDLE_DIAGNOSTIC]}
        mapped = variant_catalog_service._catalog_body_from_assembly(assembly, "boards/main")
        self.assertEqual(
            mapped["diagnostics"],
            [
                {
                    "code": "source-unparseable",
                    "severity": "error",
                    "source": "schematic",
                    "path": "broken.kicad_sch",
                    "message": "Could not read broken.kicad_sch as a KiCad source.",
                }
            ],
        )

    def test_paths_outside_the_project_keep_today_s_bare_name(self) -> None:
        diagnostic = {**BUNDLE_DIAGNOSTIC, "path": "libraries/common.kicad_sch"}
        assembly = {"catalog": [], "diagnostics": [diagnostic]}
        mapped = variant_catalog_service._catalog_body_from_assembly(assembly, "boards/main")
        self.assertEqual(mapped["diagnostics"][0]["path"], "common.kicad_sch")


class _Opened:
    """A stored revision whose one member has ``state`` (``tests.test_design_bundle_consumer``)."""

    def __init__(self, state: str, document: dict | None = None) -> None:
        self.absent = False
        self._state = state
        self._document = document
        self.read_paths: list[str] = []

    def readiness(self, paths):
        return {path: Readiness(path, self._state, "parse", "why") for path in paths}

    def read_json(self, path):
        self.read_paths.append(path)
        return self._document


class SwitchTests(unittest.TestCase):
    """The switch and its rollout fallback (``design_bundle.consumer``)."""

    def setUp(self) -> None:
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory(prefix="variant-bundle-")))
        init_repo(self.root, PROJECT_FILES)
        self.project = SimpleNamespace(
            id="prj_switch",
            path=str(self.root / "boards" / "main"),
            project_file="main.kicad_pro",
        )

    def _discover(self, opened, source: str):
        with mock.patch.object(settings, "PRISM_DESIGN_SOURCE_SEMANTIC_INDEX", source), \
                mock.patch.object(consumer.reader, "open_revision", return_value=opened) as open_revision:
            return variant_catalog_service.discover_variant_catalog(self.project, "HEAD"), open_revision

    def _legacy_names(self) -> list[str]:
        catalog = variant_catalog_service.discover_variant_catalog(self.project, "HEAD")
        return [entry["name"] for entry in catalog["variants"]]

    def test_legacy_switch_never_opens_a_bundle(self) -> None:
        result, open_revision = self._discover(_Opened("ready", {"assembly": {}}), "legacy")
        open_revision.assert_not_called()
        self.assertEqual([entry["name"] for entry in result["variants"]], ["Lite"])

    def test_a_ready_member_supplies_the_catalog(self) -> None:
        document = {
            "schema": "prism.semantic_index.a2",
            "assembly": {"catalog": [BUNDLE_ENTRY], "diagnostics": [BUNDLE_DIAGNOSTIC]},
        }
        opened = _Opened("ready", document)
        result, open_revision = self._discover(opened, "bundle")
        open_revision.assert_called_once()
        self.assertEqual(opened.read_paths, [variant_catalog_service.SEMANTIC_INDEX_MEMBER])
        self.assertEqual(result["variants"], [BUNDLE_ENTRY])
        self.assertEqual(result["diagnostics"][0]["path"], "broken.kicad_sch")

    def test_a_member_that_is_not_ready_falls_back(self) -> None:
        for state in ("pending", "unavailable", "failed"):
            with self.subTest(state=state):
                opened = _Opened(state, {"assembly": {"catalog": [BUNDLE_ENTRY]}})
                result, open_revision = self._discover(opened, "bundle")
                open_revision.assert_called_once()
                self.assertEqual([entry["name"] for entry in result["variants"]], ["Lite"])
                self.assertEqual(opened.read_paths, [])

    def test_a_final_non_member_falls_back(self) -> None:
        for state in ("skipped", "not-applicable"):
            with self.subTest(state=state):
                opened = _Opened(state, {"assembly": {"catalog": [BUNDLE_ENTRY]}})
                result, _ = self._discover(opened, "bundle")
                self.assertEqual([entry["name"] for entry in result["variants"]], ["Lite"])
                self.assertEqual(opened.read_paths, [])

    def test_the_working_tree_never_opens_a_bundle(self) -> None:
        opened = _Opened("ready", {"assembly": {}})
        with mock.patch.object(settings, "PRISM_DESIGN_SOURCE_SEMANTIC_INDEX", "bundle"), \
                mock.patch.object(consumer.reader, "open_revision", return_value=opened) as open_revision:
            working_tree = variant_catalog_service.discover_variant_catalog(self.project)
        open_revision.assert_not_called()
        self.assertIsNone(working_tree["commit"])
        self.assertEqual(self._legacy_names(), ["Lite"])

    def test_an_unreadable_ready_member_falls_back(self) -> None:
        class _Broken(_Opened):
            def read_json(self, path):
                raise RuntimeError("corrupt archive")

        with self.assertLogs("app.services.variant_catalog_service", level="ERROR"):
            result, _ = self._discover(_Broken("ready", None), "bundle")
        self.assertEqual([entry["name"] for entry in result["variants"]], ["Lite"])


if __name__ == "__main__":
    unittest.main()
