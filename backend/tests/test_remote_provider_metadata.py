from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from app.api.remote_provider import provider_metadata


class RemoteProviderMetadataTests(unittest.TestCase):
    def test_v1_metadata_uses_only_capabilities_accepted_by_kicad(self) -> None:
        with (
            patch("app.api.remote_provider._provider_origin", return_value="http://localhost:8000"),
            patch("app.api.remote_provider.provider_auth_service.provider_auth_enabled", return_value=False),
        ):
            metadata = asyncio.run(provider_metadata(object()))

        self.assertEqual(
            metadata["capabilities"],
            {
                "web_ui_v1": True,
                "parts_v1": True,
                "direct_downloads_v1": True,
                "inline_payloads_v1": True,
            },
        )
        self.assertNotIn("representations_v1", metadata["capabilities"])


if __name__ == "__main__":
    unittest.main()
