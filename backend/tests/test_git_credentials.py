"""HTTPS Git credentials picked by the remote's URL prefix (#945).

Matching is checked with real Git: ``git remote get-url`` applies ``insteadOf``,
and a local HTTP server records which requests carry an Authorization header.
Tokens are built at run time, never written as literals.
"""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import secrets
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from app.core.config import Settings, settings
from app.services import git_credentials, git_remote_access
from app.services.git_access_service import check_repository_access
from app.services.git_credentials import (
    GitCredentialConfigError,
    credential_for_url,
    parse_git_credentials,
    verify_git_credentials_or_exit,
)
from app.services.git_failures import GitAccessError, describe_git_failure
from app.services.git_remote_url import RemoteUrlError, RemoteUrlPolicy, parse_remote_url
from support.repo import git


def _token() -> str:
    return "tok" + secrets.token_hex(12)


def _entries(*entries: dict) -> str:
    return json.dumps(list(entries))


class _Configured(unittest.TestCase):
    """Patch GITHUB_TOKEN, PRISM_GIT_CREDENTIALS and the token variables."""

    def configure(
        self,
        *,
        github: str = "",
        entries: tuple[dict, ...] = (),
        env: dict[str, str] | None = None,
        insecure_http: bool = False,
    ) -> None:
        for patcher in (
            patch.object(settings, "GITHUB_TOKEN", github),
            patch.object(settings, "PRISM_GIT_CREDENTIALS", _entries(*entries) if entries else ""),
            patch.object(settings, "IMPORT_ALLOW_INSECURE_HTTP", insecure_http),
            patch.dict(os.environ, env or {}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def env_without_parent_config(self) -> dict:
        with patch.dict(os.environ, {}, clear=False):
            for key in [key for key in os.environ if key.startswith("GIT_CONFIG_")]:
                os.environ.pop(key)
            return git_remote_access.git_env()


class ValidatesTheList(_Configured):
    def setUp(self) -> None:
        self.configure(env={"EXAMPLE_GIT_TOKEN": _token()})

    def assertRejected(self, raw: str, fragment: str) -> None:
        with self.assertRaises(GitCredentialConfigError) as caught:
            parse_git_credentials(raw)
        self.assertIn(fragment, str(caught.exception))

    def test_a_valid_entry_is_normalized(self) -> None:
        (credential,) = parse_git_credentials(
            _entries({"url_prefix": "HTTPS://Git.Example.TEST:8443/team/", "token_name": "EXAMPLE_GIT_TOKEN"})
        )
        self.assertEqual(credential.url_prefix, "https://git.example.test:8443/team/")
        self.assertEqual(credential.token_name, "EXAMPLE_GIT_TOKEN")

    def test_prefix_shape_is_enforced(self) -> None:
        cases = {
            "git.example.test/": "must start with https://",
            "ssh://git.example.test/": "must start with https://",
            "https:///": "needs a host",
            "https://*.example.test/": "needs a host",
            "https://git.example.test": "must end with '/'",
            "https://git.example.test/team": "must end with '/'",
            "https://someone@git.example.test/": "must not contain credentials",
            "https://git.example.test/?a=b": "query or fragment",
            "https://git.example.test:notaport/": "not a valid URL",
        }
        for prefix, fragment in cases.items():
            with self.subTest(prefix=prefix):
                self.assertRejected(
                    _entries({"url_prefix": prefix, "token_name": "EXAMPLE_GIT_TOKEN"}), fragment
                )

    def test_every_named_token_must_be_set(self) -> None:
        self.assertRejected(
            _entries({"url_prefix": "https://git.example.test/", "token_name": "UNSET_GIT_TOKEN_945"}),
            "UNSET_GIT_TOKEN_945 is not set",
        )

    def test_entry_fields_are_checked(self) -> None:
        prefix = "https://git.example.test/"
        self.assertRejected(_entries({"url_prefix": prefix, "token_name": "not a name"}), "token_name")
        self.assertRejected(_entries({"url_prefix": prefix}), "token_name")
        self.assertRejected(
            _entries({"url_prefix": prefix, "token_name": "EXAMPLE_GIT_TOKEN", "token": "x"}),
            "unsupported fields: token",
        )
        self.assertRejected(
            _entries({"url_prefix": prefix, "token_name": "EXAMPLE_GIT_TOKEN", "username": ""}),
            "username",
        )

    def test_list_shape_is_checked(self) -> None:
        self.assertRejected("{", "not valid JSON")
        self.assertRejected('{"url_prefix": "https://git.example.test/"}', "JSON array")
        self.assertRejected('["https://git.example.test/"]', "must be an object")

    def test_duplicates_and_github_are_refused(self) -> None:
        entry = {"url_prefix": "https://git.example.test/", "token_name": "EXAMPLE_GIT_TOKEN"}
        self.assertRejected(_entries(entry, entry), "more than once")
        self.assertRejected(
            _entries({"url_prefix": "https://github.com/", "token_name": "EXAMPLE_GIT_TOKEN"}),
            "set GITHUB_TOKEN instead",
        )

    def test_plain_http_needs_the_insecure_flag(self) -> None:
        self.assertRejected(
            _entries({"url_prefix": "http://git.example.test/", "token_name": "EXAMPLE_GIT_TOKEN"}),
            "IMPORT_ALLOW_INSECURE_HTTP",
        )

    def test_tokens_named_by_entries_are_read_from_the_env_file(self) -> None:
        token, override = _token(), _token()
        with tempfile.TemporaryDirectory() as directory:
            env_file = os.path.join(directory, ".env")
            with open(env_file, "w", encoding="utf-8") as handle:
                handle.write(f"FILE_ONLY_GIT_TOKEN={token}\nSHADOWED_GIT_TOKEN=from-file\n")
            raw = _entries(
                {"url_prefix": "https://git.example.test/", "token_name": "FILE_ONLY_GIT_TOKEN"},
                {"url_prefix": "https://other.example.test/", "token_name": "SHADOWED_GIT_TOKEN"},
            )
            with patch.dict(Settings.model_config, {"env_file": env_file}), patch.dict(
                os.environ, {"SHADOWED_GIT_TOKEN": override}
            ):
                os.environ.pop("FILE_ONLY_GIT_TOKEN", None)
                first, second = parse_git_credentials(raw)
        self.assertEqual(first.token, token)
        # The process environment wins over the file, as it does for Settings.
        self.assertEqual(second.token, override)

    def test_startup_check_exits_and_names_the_problem(self) -> None:
        with patch.object(settings, "PRISM_GIT_CREDENTIALS", "["):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
                verify_git_credentials_or_exit("Test process")
        self.assertEqual(caught.exception.code, 3)
        self.assertIn("PRISM_GIT_CREDENTIALS is not valid JSON", stderr.getvalue())


class InjectsOneRewritePerCredential(_Configured):
    def test_github_token_keeps_its_rewrite(self) -> None:
        token = _token()
        self.configure(github=token)
        env = self.env_without_parent_config()
        self.assertEqual(env["GIT_CONFIG_COUNT"], "1")
        self.assertEqual(env["GIT_CONFIG_KEY_0"], f"url.https://{token}@github.com/.insteadOf")
        self.assertEqual(env["GIT_CONFIG_VALUE_0"], "https://github.com/")

    def test_nothing_is_injected_without_credentials(self) -> None:
        self.configure()
        self.assertNotIn("GIT_CONFIG_COUNT", self.env_without_parent_config())

    def test_entries_append_after_the_parent_environment(self) -> None:
        github, example = _token(), _token()
        self.configure(
            github=github,
            entries=(
                {"url_prefix": "https://git.example.test/", "token_name": "EXAMPLE_GIT_TOKEN"},
                {"url_prefix": "https://gitlab.example.test/", "token_name": "EXAMPLE_GIT_TOKEN", "username": "oauth2"},
            ),
            env={"EXAMPLE_GIT_TOKEN": example, "GIT_CONFIG_COUNT": "1"},
        )
        env = git_remote_access.git_env()
        self.assertEqual(env["GIT_CONFIG_COUNT"], "4")
        self.assertEqual(env["GIT_CONFIG_KEY_1"], f"url.https://{github}@github.com/.insteadOf")
        self.assertEqual(env["GIT_CONFIG_KEY_2"], f"url.https://{example}@git.example.test/.insteadOf")
        self.assertEqual(env["GIT_CONFIG_KEY_3"], f"url.https://oauth2:{example}@gitlab.example.test/.insteadOf")
        self.assertEqual(env["GIT_CONFIG_VALUE_3"], "https://gitlab.example.test/")

    def test_nothing_is_written_to_the_global_gitconfig(self) -> None:
        self.configure(github=_token())
        with tempfile.TemporaryDirectory() as home:
            with patch.dict(os.environ, {"HOME": home}):
                git_remote_access.git_env()
            self.assertEqual(os.listdir(home), [])


class MatchesExactly(_Configured):
    """Each token reaches only its own scheme, host and port."""

    def setUp(self) -> None:
        self.github, self.example, self.team = _token(), _token(), _token()
        self.configure(
            github=self.github,
            entries=(
                {"url_prefix": "https://git.example.test/", "token_name": "EXAMPLE_GIT_TOKEN"},
                {"url_prefix": "https://git.example.test/team/", "token_name": "TEAM_GIT_TOKEN"},
            ),
            env={"EXAMPLE_GIT_TOKEN": self.example, "TEAM_GIT_TOKEN": self.team},
        )
        self.repo = tempfile.TemporaryDirectory()
        self.addCleanup(self.repo.cleanup)
        git(self.repo.name, "init", "-q")

    def rewritten(self, url: str) -> str:
        git(self.repo.name, "remote", "remove", "origin", check=False)
        git(self.repo.name, "remote", "add", "origin", url)
        rewrites = {
            key: value for key, value in git_remote_access.git_env().items() if key.startswith("GIT_CONFIG_")
        }
        with patch.dict(os.environ, rewrites):
            return git(self.repo.name, "remote", "get-url", "origin")

    def test_matching_remotes_get_their_own_token(self) -> None:
        cases = {
            "https://github.com/org/repo.git": f"https://{self.github}@github.com/org/repo.git",
            "https://git.example.test/org/repo.git": f"https://{self.example}@git.example.test/org/repo.git",
            # The longest prefix wins, in Git and in credential_for_url.
            "https://git.example.test/team/repo.git": f"https://{self.team}@git.example.test/team/repo.git",
        }
        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(self.rewritten(url), expected)
        self.assertEqual(credential_for_url("https://git.example.test/team/repo.git").token_name, "TEAM_GIT_TOKEN")

    def test_lookalike_remotes_get_no_token(self) -> None:
        for url in (
            "https://github.com.evil.test/org/repo.git",
            "https://evilgithub.com/org/repo.git",
            "https://github.com:8443/org/repo.git",
            "http://github.com/org/repo.git",
            "https://git.example.test.evil.test/org/repo.git",
            "https://git.example.test:8443/org/repo.git",
            "http://git.example.test/org/repo.git",
            "ssh://git@git.example.test/org/repo.git",
        ):
            with self.subTest(url=url):
                self.assertEqual(self.rewritten(url), url)
                self.assertIsNone(credential_for_url(url))


class RefusesDotSegments(unittest.TestCase):
    """curl removes dot segments after Git has attached the token."""

    def test_dot_segments_are_rejected(self) -> None:
        for url in (
            "https://git.example.test/team/../other/repo.git",
            "https://git.example.test/team/%2e%2e/other/repo.git",
            "https://git.example.test/team/%2E%2e/other/repo.git",
            "https://git.example.test/team/./repo.git",
            "ssh://git@git.example.test/team/../other/repo.git",
            "git@git.example.test:team/../other/repo.git",
        ):
            with self.subTest(url=url), self.assertRaises(RemoteUrlError) as caught:
                parse_remote_url(url)
            self.assertIn("'..'", str(caught.exception))

    def test_dots_inside_names_are_fine(self) -> None:
        for url in (
            "https://git.example.test/team/repo.v2.git",
            "https://git.example.test/team/..repo.git",
            "git@git.example.test:team/.dotfiles.git",
        ):
            with self.subTest(url=url):
                parse_remote_url(url)


class _Recorder(BaseHTTPRequestHandler):
    """Challenge for Basic auth, record what comes back, then fail the request."""

    authorizations: list[str]
    paths: list[tuple[str, bool]]

    def do_GET(self) -> None:  # noqa: N802 - http.server's API
        header = self.headers.get("Authorization")
        self.paths.append((self.path.split("?", 1)[0], header is not None))
        if header is not None and self.path.startswith("/team/"):
            # Same host, outside the prefix.
            self.send_response(302)
            self.send_header("Location", self.path.replace("/team/", "/other/", 1))
        elif header is None:
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="git"')
        else:
            self.authorizations.append(header)
            self.send_response(500)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args) -> None:
        pass


def _serve(paths: list[tuple[str, bool]] | None = None) -> tuple[ThreadingHTTPServer, list[str]]:
    seen: list[str] = []
    handler = type("Recorder", (_Recorder,), {"authorizations": seen, "paths": [] if paths is None else paths})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, seen


class NeverLeaksTheToken(_Configured):
    def setUp(self) -> None:
        self.token = _token()
        self.server, self.seen = _serve()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.other, self.other_seen = _serve()
        self.addCleanup(self.other.server_close)
        self.addCleanup(self.other.shutdown)
        port = self.server.server_address[1]
        self.base = f"http://127.0.0.1:{port}/"
        self.configure(
            entries=({"url_prefix": self.base, "token_name": "LOCAL_GIT_TOKEN", "username": "prism"},),
            env={"LOCAL_GIT_TOKEN": self.token},
            insecure_http=True,
        )
        self.policy = RemoteUrlPolicy.build(allow_insecure_http=True)

    def test_token_is_sent_but_never_reported(self) -> None:
        parsed = parse_remote_url(f"{self.base}org/repo.git", self.policy)
        with self.assertLogs(level="DEBUG") as logs:
            with self.assertRaises(GitAccessError) as caught:
                git_remote_access.list_remote_branches(parsed)
            result = check_repository_access(parsed, git_env=git_remote_access.git_env())

        expected = "Basic " + base64.b64encode(f"prism:{self.token}".encode()).decode()
        self.assertIn(expected, self.seen)
        self.assertTrue(any("over plain HTTP" in line for line in logs.output))
        for text in (str(caught.exception), result.message, *logs.output, repr(git_credentials.git_credentials())):
            self.assertNotIn(self.token, text)
        self.assertNotIn(self.token, " ".join(git_credentials.configuration_warnings()))
        self.assertIn("LOCAL_GIT_TOKEN", " ".join(git_credentials.configuration_warnings()))

    def test_another_port_never_sees_the_token(self) -> None:
        other = f"http://127.0.0.1:{self.other.server_address[1]}/org/repo.git"
        result = check_repository_access(
            parse_remote_url(other, self.policy), git_env=git_remote_access.git_env()
        )
        self.assertFalse(result.authorized)
        self.assertEqual(self.other_seen, [])

    def test_a_path_scoped_token_does_not_follow_a_redirect_out_of_its_prefix(self) -> None:
        paths: list[tuple[str, bool]] = []
        server, _ = _serve(paths)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_address[1]}/"
        self.configure(
            entries=({"url_prefix": f"{base}team/", "token_name": "TEAM_GIT_TOKEN"},),
            env={"TEAM_GIT_TOKEN": _token()},
            insecure_http=True,
        )
        result = check_repository_access(
            parse_remote_url(f"{base}team/repo.git", self.policy), git_env=git_remote_access.git_env()
        )
        self.assertFalse(result.authorized)
        self.assertIn(("/team/repo.git/info/refs", True), paths)
        self.assertFalse([path for path in paths if path[0].startswith("/other/")])

    def test_urls_git_echoes_lose_their_userinfo(self) -> None:
        class Failed(Exception):
            stderr = f"fatal: something odd at 'https://prism:{self.token}@git.example.test/org/repo.git/'"

        _, message = describe_git_failure(Failed())
        self.assertNotIn(self.token, message)
        self.assertIn("https://git.example.test/org/repo.git/", message)


if __name__ == "__main__":
    unittest.main()
