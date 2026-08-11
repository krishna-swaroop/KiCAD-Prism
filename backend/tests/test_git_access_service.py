"""Tests for how Prism authenticates to Git servers and reports on it."""

from __future__ import annotations

import base64
import hashlib
import hmac
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.services import git_access_service
from app.services.git_remote_url import parse_remote_url


class HostNameValidation(unittest.TestCase):
    """Host names reach ssh-keyscan's argv, so they get the same care as URLs."""

    def test_option_like_host_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            git_access_service.scan_host_key("-oProxyCommand=id")

    def test_host_with_shell_metacharacters_is_rejected(self) -> None:
        for candidate in ("git.example.com; id", "git.example.com$(id)", "a b"):
            with self.subTest(candidate=candidate):
                with self.assertRaises(ValueError):
                    git_access_service.scan_host_key(candidate)

    def test_blank_host_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            git_access_service.forget_host("   ")

    def test_ordinary_host_passes_validation(self) -> None:
        with mock.patch.object(
            git_access_service.subprocess,
            "run",
            return_value=mock.Mock(stdout="git.example.com ssh-ed25519 AAAA\n", returncode=0),
        ):
            with mock.patch.object(
                git_access_service, "_fingerprints_of", return_value=["SHA256:abc (ED25519)"]
            ):
                candidate = git_access_service.scan_host_key("git.internal.example")
        self.assertEqual(candidate.host, "git.internal.example")


class HostKeyBootstrap(unittest.TestCase):
    """A scan is only as trustworthy as its network; a published fingerprint is not."""

    def test_key_matching_a_published_fingerprint_is_pinned(self) -> None:
        published = next(iter(git_access_service.PUBLISHED_HOST_FINGERPRINTS["github.com"]))
        candidate = git_access_service.HostKeyCandidate(
            host="github.com",
            fingerprints=[f"{published} (ED25519)"],
            entries="github.com ssh-ed25519 AAAA",
        )
        with (
            mock.patch.object(git_access_service, "is_host_trusted", return_value=False),
            mock.patch.object(git_access_service, "scan_host_key", return_value=candidate),
            mock.patch.object(
                git_access_service,
                "_entries_matching",
                return_value="github.com ssh-ed25519 AAAA",
            ),
            mock.patch.object(git_access_service, "trust_host") as trust_host,
        ):
            outcomes = git_access_service.bootstrap_known_hosts()

        self.assertEqual(outcomes["github.com"], "pinned")
        trust_host.assert_called()

    def test_key_that_matches_nothing_published_is_refused(self) -> None:
        candidate = git_access_service.HostKeyCandidate(
            host="github.com",
            fingerprints=["SHA256:somethingelse (ED25519)"],
            entries="github.com ssh-ed25519 AAAA",
        )
        with (
            mock.patch.object(git_access_service, "is_host_trusted", return_value=False),
            mock.patch.object(git_access_service, "scan_host_key", return_value=candidate),
            mock.patch.object(git_access_service, "trust_host") as trust_host,
        ):
            outcomes = git_access_service.bootstrap_known_hosts()

        self.assertEqual(outcomes["github.com"], "fingerprint-mismatch")
        trust_host.assert_not_called()

    def test_an_already_pinned_host_is_not_re_pinned(self) -> None:
        # Re-pinning would let a changed host key in silently.
        with (
            mock.patch.object(git_access_service, "is_host_trusted", return_value=True),
            mock.patch.object(git_access_service, "scan_host_key") as scan,
            mock.patch.object(git_access_service, "trust_host") as trust_host,
        ):
            outcomes = git_access_service.bootstrap_known_hosts()

        self.assertEqual(set(outcomes.values()), {"already-trusted"})
        scan.assert_not_called()
        trust_host.assert_not_called()

    def test_an_unreachable_host_does_not_raise(self) -> None:
        with (
            mock.patch.object(git_access_service, "is_host_trusted", return_value=False),
            mock.patch.object(
                git_access_service, "scan_host_key", side_effect=RuntimeError("no route")
            ),
        ):
            outcomes = git_access_service.bootstrap_known_hosts()
        self.assertTrue(all(value.startswith("scan-failed") for value in outcomes.values()))


class TrustedHostListing(unittest.TestCase):
    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.path = Path(self._temporary.name) / "known_hosts"
        self.addCleanup(self._temporary.cleanup)
        patcher = mock.patch.object(
            git_access_service, "known_hosts_path", return_value=self.path
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_hosts_are_listed(self) -> None:
        self.path.write_text(
            "github.com ssh-ed25519 AAAA\n"
            "# a comment\n"
            "[git.internal.example]:2222 ssh-rsa BBBB\n"
            "gitlab.com,172.65.251.78 ssh-ed25519 CCCC\n",
            encoding="utf-8",
        )
        self.assertEqual(
            git_access_service.trusted_hosts(),
            ["172.65.251.78", "git.internal.example", "github.com", "gitlab.com"],
        )

    def test_hashed_entries_are_skipped(self) -> None:
        # Hashed host names are not recoverable, by design.
        self.path.write_text("|1|abc=|def= ssh-ed25519 AAAA\n", encoding="utf-8")
        self.assertEqual(git_access_service.trusted_hosts(), [])

    def test_missing_file_is_empty(self) -> None:
        self.assertEqual(git_access_service.trusted_hosts(), [])


class RepositoryAccessCheck(unittest.TestCase):
    def _remote(self, url: str = "https://github.com/org/repo.git"):
        return parse_remote_url(url)

    def test_readable_repository_reports_its_default_branch(self) -> None:
        fake_git = mock.Mock()
        fake_git.ls_remote.return_value = (
            "ref: refs/heads/main\tHEAD\nabc123\tHEAD\n"
        )
        with mock.patch("git.Git", return_value=fake_git):
            result = git_access_service.check_repository_access(self._remote())

        self.assertTrue(result.authorized)
        self.assertTrue(result.reachable)
        self.assertEqual(result.default_branch, "main")

    def test_refused_key_is_reachable_but_unauthorized(self) -> None:
        # The distinction matters: the server answered, it just said no.
        error = Exception()
        error.stderr = "git@github.com: Permission denied (publickey)."
        fake_git = mock.Mock()
        fake_git.ls_remote.side_effect = error
        with mock.patch("git.Git", return_value=fake_git):
            result = git_access_service.check_repository_access(self._remote())

        self.assertTrue(result.reachable)
        self.assertFalse(result.authorized)
        self.assertEqual(result.reason, "ssh-key-not-authorized")

    def test_unresolvable_host_is_not_reachable(self) -> None:
        error = Exception()
        error.stderr = "fatal: Could not resolve host: git.internal"
        fake_git = mock.Mock()
        fake_git.ls_remote.side_effect = error
        with mock.patch("git.Git", return_value=fake_git):
            result = git_access_service.check_repository_access(self._remote())

        self.assertFalse(result.reachable)
        self.assertFalse(result.authorized)


class ForgeGuidance(unittest.TestCase):
    def test_github_guidance_links_the_repository_deploy_key_page(self) -> None:
        guidance = git_access_service.guidance_for(
            parse_remote_url("https://github.com/pixxelhq/JTYU-IN.git")
        )
        self.assertEqual(guidance.forge, "GitHub")
        self.assertEqual(
            guidance.deploy_key_url, "https://github.com/pixxelhq/JTYU-IN/settings/keys"
        )
        # The single-repository limit is the thing nothing in the product said.
        self.assertIn("machine user", guidance.instructions)

    def test_scp_style_url_produces_the_same_link(self) -> None:
        guidance = git_access_service.guidance_for(
            parse_remote_url("git@github.com:pixxelhq/JTYU-IN.git")
        )
        self.assertEqual(
            guidance.deploy_key_url, "https://github.com/pixxelhq/JTYU-IN/settings/keys"
        )

    def test_gitlab_guidance_is_recognised(self) -> None:
        guidance = git_access_service.guidance_for(
            parse_remote_url("https://gitlab.com/group/board.git")
        )
        self.assertEqual(guidance.forge, "GitLab")
        self.assertIn("/-/settings/repository", guidance.deploy_key_url or "")

    def test_self_hosted_forge_still_gets_instructions(self) -> None:
        guidance = git_access_service.guidance_for(
            parse_remote_url("ssh://git@git.internal.example/hw/board.git")
        )
        self.assertEqual(guidance.forge, "git.internal.example")
        self.assertIsNone(guidance.deploy_key_url)
        self.assertIn("deploy key", guidance.instructions)


class KeyGenerationAndFingerprints(unittest.TestCase):
    """Key handling must not depend on OpenSSH binaries.

    The backend image ships without openssh-client, so shelling out to
    ssh-keygen failed with `[Errno 2] No such file or directory: 'ssh-keygen'`
    and the workspace could not create a key at all.
    """

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        self.addCleanup(self._temporary.cleanup)
        for name, filename in (
            ("ssh_dir", ""),
            ("private_key_path", "id_ed25519"),
            ("public_key_path", "id_ed25519.pub"),
        ):
            patcher = mock.patch.object(
                git_access_service,
                name,
                return_value=self.root / filename if filename else self.root,
            )
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_key_generation_needs_no_external_binary(self) -> None:
        with mock.patch.object(
            git_access_service.shutil, "which", return_value=None
        ):
            info = git_access_service.generate_key("prism@workspace")

        self.assertTrue(info.exists)
        self.assertEqual(info.key_type, "ssh-ed25519")
        self.assertEqual(info.comment, "prism@workspace")
        self.assertTrue((info.fingerprint or "").startswith("SHA256:"))

    def test_private_key_is_not_readable_by_others(self) -> None:
        # ssh refuses to use a key whose file is group or world readable.
        git_access_service.generate_key("prism@workspace")
        mode = (self.root / "id_ed25519").stat().st_mode & 0o777
        self.assertEqual(mode, 0o600)

    def test_generating_again_replaces_the_previous_key(self) -> None:
        first = git_access_service.generate_key("prism@workspace")
        second = git_access_service.generate_key("prism@workspace")
        self.assertNotEqual(first.public_key, second.public_key)
        self.assertEqual(git_access_service.describe_key().public_key, second.public_key)

    @unittest.skipIf(shutil.which("ssh-keygen") is None, "ssh-keygen not installed")
    def test_fingerprint_matches_ssh_keygen(self) -> None:
        # The value has to be byte-identical to what a forge displays, so it is
        # checked against the real tool wherever that tool is available.
        info = git_access_service.generate_key("prism@workspace")
        result = subprocess.run(
            ["ssh-keygen", "-lf", str(self.root / "id_ed25519.pub")],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(info.fingerprint, result.stdout.split()[1])

    def test_malformed_public_key_has_no_fingerprint(self) -> None:
        self.assertIsNone(git_access_service.fingerprint_of_public_key("not-a-key"))
        self.assertIsNone(git_access_service.fingerprint_of_public_key("ssh-ed25519 !!!!"))

    def test_missing_key_reports_absent(self) -> None:
        self.assertFalse(git_access_service.describe_key().exists)


class HostMatchingWithoutSSHKeygen(unittest.TestCase):
    """`is_host_trusted` gates whether SSH remotes work, so it cannot depend on
    a binary that may be absent."""

    def setUp(self) -> None:
        self._temporary = tempfile.TemporaryDirectory()
        self.path = Path(self._temporary.name) / "known_hosts"
        self.addCleanup(self._temporary.cleanup)
        patcher = mock.patch.object(
            git_access_service, "known_hosts_path", return_value=self.path
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_plain_host_is_matched(self) -> None:
        self.path.write_text("github.com ssh-ed25519 AAAA\n", encoding="utf-8")
        self.assertTrue(git_access_service.is_host_trusted("github.com"))
        self.assertFalse(git_access_service.is_host_trusted("gitlab.com"))

    def test_comma_separated_and_bracketed_hosts_are_matched(self) -> None:
        self.path.write_text(
            "gitlab.com,172.65.251.78 ssh-ed25519 AAAA\n"
            "[git.internal.example]:2222 ssh-rsa BBBB\n",
            encoding="utf-8",
        )
        self.assertTrue(git_access_service.is_host_trusted("gitlab.com"))
        self.assertTrue(git_access_service.is_host_trusted("172.65.251.78"))
        self.assertTrue(git_access_service.is_host_trusted("git.internal.example"))

    def test_hashed_entries_are_matched(self) -> None:
        # OpenSSH hashes host names by default; the replacement for
        # `ssh-keygen -F` has to understand that form or every hashed entry
        # would read as untrusted.
        salt = b"0123456789abcdef0123"
        digest = hmac.new(salt, b"git.internal.example", hashlib.sha1).digest()
        pattern = (
            "|1|"
            + base64.b64encode(salt).decode()
            + "|"
            + base64.b64encode(digest).decode()
        )
        self.path.write_text(f"{pattern} ssh-ed25519 AAAA\n", encoding="utf-8")
        self.assertTrue(git_access_service.is_host_trusted("git.internal.example"))
        self.assertFalse(git_access_service.is_host_trusted("other.example"))

    def test_forgetting_a_host_removes_only_that_host(self) -> None:
        self.path.write_text(
            "github.com ssh-ed25519 AAAA\ngitlab.com ssh-ed25519 BBBB\n",
            encoding="utf-8",
        )
        self.assertTrue(git_access_service.forget_host("github.com"))
        self.assertFalse(git_access_service.is_host_trusted("github.com"))
        self.assertTrue(git_access_service.is_host_trusted("gitlab.com"))

    def test_forgetting_an_unknown_host_reports_no_change(self) -> None:
        self.path.write_text("github.com ssh-ed25519 AAAA\n", encoding="utf-8")
        self.assertFalse(git_access_service.forget_host("nowhere.example"))

    def test_no_known_hosts_file_means_nothing_is_trusted(self) -> None:
        self.assertFalse(git_access_service.is_host_trusted("github.com"))


class MissingToolReporting(unittest.TestCase):
    def test_scanning_without_ssh_keyscan_names_the_missing_package(self) -> None:
        # The bare OSError reads "[Errno 2] No such file or directory:
        # 'ssh-keyscan'", which says nothing about which feature broke.
        with mock.patch.object(git_access_service.shutil, "which", return_value=None):
            with self.assertRaises(git_access_service.MissingSSHToolError) as caught:
                git_access_service.scan_host_key("git.internal.example")
        self.assertIn("openssh-client", str(caught.exception))

    def test_startup_names_the_missing_binaries_and_the_stale_image(self) -> None:
        with mock.patch.object(git_access_service.shutil, "which", return_value=None):
            with self.assertLogs(git_access_service.logger, level="WARNING") as logs:
                missing = git_access_service.warn_if_openssh_missing("The prism worker")
        self.assertEqual(missing, ["ssh", "ssh-keygen", "ssh-keyscan"])
        warning = "\n".join(logs.output)
        self.assertIn("The prism worker", warning)
        self.assertIn("openssh-client", warning)
        # The realistic case is one stale image out of several built from the
        # same Dockerfile, so the log has to suggest a rebuild.
        self.assertIn("rebuild", warning)

    def test_startup_is_silent_when_openssh_is_present(self) -> None:
        with mock.patch.object(git_access_service.shutil, "which", return_value="/usr/bin/ssh"):
            with self.assertNoLogs(git_access_service.logger, level="WARNING"):
                self.assertEqual(git_access_service.warn_if_openssh_missing("The API"), [])

    def test_tool_availability_is_reportable(self) -> None:
        with mock.patch.object(git_access_service.shutil, "which", return_value=None):
            self.assertEqual(
                git_access_service.openssh_tools(),
                {"ssh": False, "ssh-keygen": False, "ssh-keyscan": False},
            )


if __name__ == "__main__":
    unittest.main()
