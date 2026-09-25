from __future__ import annotations

import json
import unittest

from app.services.forge_hosts import ForgeHostConfigError, parse_forge_hosts, resolve_forge_host


class ForgeHostRegistryTests(unittest.TestCase):
    def test_built_in_hosts_are_exact(self) -> None:
        hosts = parse_forge_hosts("")
        self.assertEqual(hosts["github.com"].kind, "github")
        self.assertEqual(hosts["gitlab.com"].kind, "gitlab")
        self.assertIsNone(resolve_forge_host("gitlab.example.com", ""))

    def test_extra_gitlab_host_is_registered(self) -> None:
        host = resolve_forge_host("git.acme.test", "git.acme.test=gitlab")
        self.assertIsNotNone(host)
        self.assertEqual(host.kind, "gitlab")
        self.assertEqual(host.api_root, "https://git.acme.test/api/v4")
        self.assertEqual(host.token_name, "GITLAB_TOKEN")

    def test_structured_hosts_support_distinct_tokens_and_api_prefixes(self) -> None:
        hosts = parse_forge_hosts(
            json.dumps(
                [
                    {
                        "host": "git-a.acme.test",
                        "kind": "gitlab",
                        "api_root": "https://gateway.acme.test/one/api/v4/",
                        "token_name": "ACME_A_TOKEN",
                    },
                    {
                        "host": "git-b.acme.test",
                        "kind": "gitlab",
                        "api_root": "https://gateway.acme.test/two/api/v4",
                        "token_name": "ACME_B_TOKEN",
                    },
                ]
            )
        )
        self.assertEqual(hosts["git-a.acme.test"].api_root, "https://gateway.acme.test/one/api/v4")
        self.assertEqual(hosts["git-a.acme.test"].token_name, "ACME_A_TOKEN")
        self.assertEqual(hosts["git-b.acme.test"].api_root, "https://gateway.acme.test/two/api/v4")
        self.assertEqual(hosts["git-b.acme.test"].token_name, "ACME_B_TOKEN")

    def test_structured_api_root_can_use_a_deliberately_configured_host(self) -> None:
        host = resolve_forge_host(
            "git.acme.test",
            json.dumps(
                [
                    {
                        "host": "git.acme.test",
                        "kind": "gitlab",
                        "api_root": "https://api-gateway.acme.test/gitlab/api/v4",
                        "token_name": "ACME_TOKEN",
                    }
                ]
            ),
        )
        self.assertIsNotNone(host)
        self.assertEqual(host.api_root, "https://api-gateway.acme.test/gitlab/api/v4")

    def test_substring_gitlab_is_not_enough(self) -> None:
        self.assertIsNone(resolve_forge_host("notgitlab.example.com", ""))

    def test_invalid_entries_fail_closed(self) -> None:
        with self.assertRaisesRegex(ForgeHostConfigError, "host=gitlab"):
            parse_forge_hosts("git.acme.test")
        with self.assertRaisesRegex(ForgeHostConfigError, "kinds must be gitlab"):
            parse_forge_hosts("git.acme.test=github")
        with self.assertRaisesRegex(ForgeHostConfigError, "cannot redefine"):
            parse_forge_hosts("gitlab.com=gitlab")
        with self.assertRaisesRegex(ForgeHostConfigError, "bare hostnames"):
            parse_forge_hosts("https://git.acme.test=gitlab")

    def test_invalid_structured_entries_fail_closed_without_echoing_values(self) -> None:
        invalid_configs = (
            '[{"host":"git.acme.test","kind":"github","api_root":"https://git.acme.test/api/v4","token_name":"ACME_TOKEN"}]',
            '[{"host":"git.acme.test","kind":"gitlab","api_root":"http://git.acme.test/api/v4","token_name":"ACME_TOKEN"}]',
            '[{"host":"git.acme.test","kind":"gitlab","api_root":"https://git.acme.test/api/v4?token=secret","token_name":"ACME_TOKEN"}]',
            '[{"host":"git.acme.test","kind":"gitlab","api_root":"https://user:secret@git.acme.test/api/v4","token_name":"ACME_TOKEN"}]',
            '[{"host":"git.acme.test","kind":"gitlab","api_root":"https://git.acme.test/api/v4","token_name":"ACME-TOKEN"}]',
            '[{"host":"git.acme.test","kind":"gitlab","api_root":"https://git.acme.test/api/v4","token_name":"ACME_TOKEN"}',
        )
        for raw in invalid_configs:
            with self.assertRaises(ForgeHostConfigError) as caught:
                parse_forge_hosts(raw)
            self.assertNotIn("secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
