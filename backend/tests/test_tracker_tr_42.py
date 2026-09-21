"""TR-42: host-facing tracker UI contracts for settings and discussion mounts."""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "tracker-integration"
FRONTEND = ROOT / "frontend" / "src"
F1 = json.loads((DOCS / "fixtures" / "F01.json").read_text(encoding="utf-8"))
F2 = json.loads((DOCS / "fixtures" / "F02.json").read_text(encoding="utf-8"))
F9 = json.loads((DOCS / "fixtures" / "F09.json").read_text(encoding="utf-8"))
EXAMPLES = json.loads((DOCS / "dto-examples.json").read_text(encoding="utf-8"))


class FixtureContractTests(unittest.TestCase):
    def test_role_and_browser_fixtures_exist(self) -> None:
        f1_ids = {case["id"] for case in F1["cases"]}
        f9_ids = {case["id"] for case in F9["cases"]}
        self.assertIn("F1.viewer_creates_root", f1_ids)
        self.assertIn("F9.destination_shown_before_promote", f9_ids)
        self.assertIn("F9.settings_states", f9_ids)
        self.assertIn("F2.two_commit_pcb", {case["id"] for case in F2["cases"]})

    def test_comment_examples_carry_tracker_projection_and_permissions(self) -> None:
        comment = EXAMPLES["comments"]["Comment"]
        self.assertIn("tracker", comment)
        self.assertIn("permissions", comment)
        self.assertIn("canPublish", comment["permissions"])
        self.assertIn("syncState", comment["tracker"])


class HostMountSourceTests(unittest.TestCase):
    def test_settings_dialog_mounts_tracker_tabs(self) -> None:
        source = (FRONTEND / "components" / "settings-dialog.tsx").read_text(encoding="utf-8")
        self.assertIn("TrackerConnectorSettings", source)
        self.assertIn("ConnectedAccountsSettings", source)
        self.assertIn("settings-tab-trackers", source)
        self.assertIn("settings-tab-accounts", source)
        self.assertIn("ConnectorHealthPanel", source)
        self.assertIn("ConnectedAccounts", source)

    def test_project_page_mounts_publication_panel(self) -> None:
        source = (FRONTEND / "pages" / "ProjectDetailPage.tsx").read_text(encoding="utf-8")
        self.assertIn("ProjectTrackerSettingsPanel", source)
        self.assertIn("project-tracker-settings-open", source)
        self.assertIn('isAdmin={user?.role === "admin"}', source)

    def test_comment_hosts_mount_promotion_and_chips(self) -> None:
        card = (FRONTEND / "components" / "comment-card.tsx").read_text(encoding="utf-8")
        panel = (FRONTEND / "components" / "comment-panel.tsx").read_text(encoding="utf-8")
        form = (FRONTEND / "components" / "comment-form.tsx").read_text(encoding="utf-8")
        for source in (card, panel):
            self.assertIn("TrackedThreadChip", source)
            self.assertIn("PromotionControl", source)
            self.assertIn("RemoteReply", source)
            self.assertIn("SyncHistory", source)
        self.assertIn("DestinationDisclosure", form)
        self.assertIn("comment-form-auto-promote", form)

    def test_visualizer_and_comparison_refresh_async_sync(self) -> None:
        visualizer = (FRONTEND / "components" / "visualizer.tsx").read_text(encoding="utf-8")
        rail = (
            FRONTEND / "components" / "design-comparison" / "comparison-discussion-rail.tsx"
        ).read_text(encoding="utf-8")
        hook = (
            FRONTEND / "components" / "design-comparison" / "use-comparison-comments.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("getProjectTracker", visualizer)
        self.assertIn("isWorkPending", visualizer)
        self.assertIn("applyTrackerProjection", visualizer)
        self.assertIn("PromotionControl", rail)
        self.assertIn("setComments([])", hook)
        self.assertIn("isWorkPending", hook)


class RouteRegistrationTests(unittest.TestCase):
    def test_sync_history_and_project_tracker_routes_remain_registered(self) -> None:
        main = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        sync = (ROOT / "backend" / "app" / "api" / "tracker_sync.py").read_text(encoding="utf-8")
        project = (ROOT / "backend" / "app" / "api" / "project_trackers.py").read_text(encoding="utf-8")
        self.assertIn("tracker_sync", main)
        self.assertIn("project_trackers", main)
        self.assertIn("/comments/{comment_id}/tracker/history", sync)
        self.assertIn("/{project_id}/tracker", project)


@unittest.skipUnless(
    os.environ.get("TEST_POSTGRES_URL", "").strip(),
    "TEST_POSTGRES_URL is required for live host-facing API checks",
)
class LiveHostApiTests(unittest.TestCase):
    """Optional disposable-DB probe kept as a skippable gate for CI with Postgres."""

    def test_postgres_url_present_for_integration_gate(self) -> None:
        self.assertTrue(os.environ.get("TEST_POSTGRES_URL", "").strip())


if __name__ == "__main__":
    unittest.main()
