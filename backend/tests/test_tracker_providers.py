"""Provider registry: which hosts publish issues, and provider-aware wording."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.trackers import providers  # noqa: E402
from app.services.trackers.contracts import Destination  # noqa: E402
from app.services.trackers.errors import ProviderError  # noqa: E402
from app.services.trackers.inbound import CallableFetcher  # noqa: E402
from app.services.trackers.provider_registry import (  # noqa: E402
    ContextInboundFetcher,
    DestinationContext,
    TrackerProviderBundle,
)
from app.services.trackers.provenance import resolve_editor  # noqa: E402
from app.services.trackers.state_mutations import supersession_message  # noqa: E402


_DEST = Destination(
    connectorId="cn_1", containerKind="repo", containerPath="acme/board", remoteContainerId="1", generation=1,
)


class ProviderRegistryTests(unittest.TestCase):
    def test_github_is_the_only_issue_provider_today(self) -> None:
        self.assertTrue(providers.is_issue_provider("github"))
        self.assertFalse(providers.is_issue_provider("gitea"))
        self.assertFalse(providers.is_issue_provider(""))

    def test_unknown_provider_is_a_data_error_not_account_linking(self) -> None:
        with self.assertRaises(ProviderError) as caught:
            providers.kit_for("")
        self.assertEqual(caught.exception.class_, "invalid_request")
        self.assertNotIn("account linking", str(caught.exception))

    def test_recovery_pages_follow_the_adapters_own_forge(self) -> None:
        class _Adapter:
            kind = "gitea"

        with self.assertRaises(ProviderError):
            providers.issue_page_fetcher_for(_Adapter(), _DEST)
        with self.assertRaises(ProviderError):
            providers.comment_page_fetcher_for(_Adapter(), _DEST, "1")

    def test_inbound_fetcher_carries_the_destination_provider(self) -> None:
        bundle = TrackerProviderBundle(
            connector_id="cn_1", provider="github", issue=object(), comment=object(),
            bot_user_id="", bot_login="",
        )
        ctx = DestinationContext(
            connector_id="cn_1", remote_container_id="1", container_path="acme/board",
            destination_generation=1, paused=False, provider="github", writes_enabled=True,
        )
        self.assertEqual(ContextInboundFetcher(bundle, ctx).provider, "github")
        self.assertEqual(CallableFetcher(provider="gitlab").provider, "gitlab")

    def test_account_linking_hosts_are_refused_by_name(self) -> None:
        with self.assertRaises(ProviderError) as caught:
            providers.kit_for("gitea")
        self.assertEqual(caught.exception.class_, "capability_missing")
        self.assertIn("Gitea", str(caught.exception))

    def test_credential_payload_accepts_snake_case_and_requires_every_field(self) -> None:
        kit = providers.kit_for("github")
        payload = kit.credential_payload({"app_id": "1", "installationId": "2"})
        self.assertEqual(payload, {"appId": "1", "installationId": "2", "privateKey": ""})
        self.assertTrue(kit.has_credentials({"app_id": "1"}))
        with self.assertRaises(ProviderError):
            kit.require_complete(payload)

    def test_display_names_keep_brand_casing(self) -> None:
        self.assertEqual(providers.display_name("gitlab"), "GitLab")
        self.assertEqual(providers.display_name("github.com"), "GitHub")


class ProviderWordingTests(unittest.TestCase):
    def test_editor_names_the_connectors_forge(self) -> None:
        self.assertEqual(resolve_editor(actor_login="ana", provider="gitlab").display, "ana (GitLab)")
        self.assertEqual(resolve_editor(provider="gitlab").display, "edited on GitLab")
        self.assertEqual(resolve_editor(actor_login="ana").display, "ana (GitHub)")

    def test_supersession_note_names_the_connectors_forge(self) -> None:
        note = supersession_message(remote_state="closed", local_intent_state="open", provider="gitlab")
        self.assertEqual(note, "Closed on GitLab after this thread was reopened in Prism")


if __name__ == "__main__":
    unittest.main()
