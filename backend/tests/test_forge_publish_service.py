"""Unit tests for GitHub/GitLab Release publishing."""

from __future__ import annotations

import io
import json
import os
import sys
import tarfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

from app.services import forge_publish_service as forge  # noqa: E402


def _dossier_tar(*names: str, mtime: int = 0) -> bytes:
    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w:gz") as archive:
        for name in names:
            data = f"{name}\n".encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = mtime
            archive.addfile(info, io.BytesIO(data))
    return payload.getvalue()


class _Response:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.reason = "error"
        self.content = b"{}" if payload is not None else b""

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class ForgeDescribeTests(unittest.TestCase):
    def test_github_remote_is_detected(self) -> None:
        with patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"):
            target = forge.describe_forge("https://github.com/org/board.git")
        self.assertEqual(target.kind, "github")
        self.assertEqual(target.owner_repo, "org/board")
        self.assertTrue(target.token_configured)

    def test_gitlab_remote_is_detected(self) -> None:
        with patch.object(forge.settings, "GITLAB_TOKEN", ""):
            target = forge.describe_forge("https://gitlab.com/group/board.git")
        self.assertEqual(target.kind, "gitlab")
        self.assertFalse(target.token_configured)
        self.assertIn("GITLAB_TOKEN", target.token_hint)

    def test_unsupported_host_explains_the_limit(self) -> None:
        target = forge.describe_forge("https://bitbucket.org/org/board.git")
        self.assertEqual(target.kind, "unsupported")
        self.assertIn("GitHub and GitLab", target.token_hint)

    def test_a_hostname_that_contains_gitlab_is_not_auto_enabled(self) -> None:
        with patch.object(forge.settings, "PRISM_FORGE_HOSTS", ""):
            target = forge.describe_forge("https://notgitlab.example.com/org/board.git")
        self.assertEqual(target.kind, "unsupported")

    def test_configured_self_hosted_gitlab_resolves(self) -> None:
        with (
            patch.object(forge.settings, "PRISM_FORGE_HOSTS", "git.acme.test=gitlab"),
            patch.object(forge.settings, "GITLAB_TOKEN", "glpat-example"),
        ):
            target = forge.describe_forge("https://git.acme.test/group/board.git")
        self.assertEqual(target.kind, "gitlab")
        self.assertEqual(target.api_root, "https://git.acme.test/api/v4")
        self.assertTrue(target.token_configured)

    def test_structured_self_hosted_targets_use_their_own_token_references(self) -> None:
        config = json.dumps(
            [
                {
                    "host": "git-a.acme.test",
                    "kind": "gitlab",
                    "api_root": "https://gateway.acme.test/one/api/v4",
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
        with (
            patch.object(forge.settings, "PRISM_FORGE_HOSTS", config),
            patch.dict(os.environ, {"ACME_A_TOKEN": "token-a", "ACME_B_TOKEN": "token-b"}, clear=False),
        ):
            first = forge.describe_forge("https://git-a.acme.test/group/board.git")
            second = forge.describe_forge("https://git-b.acme.test/group/board.git")
        self.assertTrue(first.token_configured)
        self.assertTrue(second.token_configured)
        self.assertNotIn("token-a", repr(first))
        self.assertNotIn("token-b", repr(second))
        self.assertNotIn("token-a", str(first.to_dict()))
        self.assertNotIn("token-b", str(second.to_dict()))


class ForgeZipTests(unittest.TestCase):
    def test_dossier_tar_is_repacked_as_zip(self) -> None:
        zip_bytes = forge.dossier_tar_to_zip(_dossier_tar("manifest.json", "docs/cover.pdf"))
        import zipfile

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            self.assertEqual(set(archive.namelist()), {"manifest.json", "docs/cover.pdf"})

    def test_dossier_zip_carries_the_tar_mtime(self) -> None:
        from datetime import datetime, timezone
        import zipfile

        stamp = int(datetime(2026, 8, 14, 3, 39, tzinfo=timezone.utc).timestamp())
        zip_bytes = forge.dossier_tar_to_zip(_dossier_tar("manifest.json", mtime=stamp))
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            self.assertEqual(archive.getinfo("manifest.json").date_time, (2026, 8, 14, 3, 39, 0))

    def test_filename_is_safe(self) -> None:
        self.assertEqual(forge.release_zip_filename("USB PD", "v1.0.0"), "USB-PD-v1.0.0.zip")


class ForgePublishTests(unittest.TestCase):
    def test_missing_github_token_is_actionable(self) -> None:
        with patch.object(forge.settings, "GITHUB_TOKEN", ""):
            with self.assertRaises(forge.ForgePublishError) as caught:
                forge.publish_release(
                    repo_url="https://github.com/org/board.git",
                    commit_sha="a" * 40,
                    tag="v1.0.0",
                    title="",
                    notes="",
                    zip_bytes=b"zip",
                    filename="board-v1.0.0.zip",
                )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("GITHUB_TOKEN", str(caught.exception))

    def test_github_creates_a_release_and_uploads_the_zip(self) -> None:
        calls: list[dict] = []

        def request(method, url, **kwargs):  # noqa: ANN001
            calls.append({"method": method, "url": url, "json": kwargs.get("json"), "data": kwargs.get("data")})
            if method == "POST" and url.endswith("/releases"):
                return _Response(
                    201,
                    {
                        "html_url": "https://github.com/org/board/releases/tag/v1.0.0",
                        "upload_url": "https://uploads.github.com/repos/org/board/releases/1/assets{?name,label}",
                    },
                )
            return _Response(201, {})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            published = forge.publish_release(
                repo_url="https://github.com/org/board.git",
                commit_sha="a" * 40,
                tag="v1.0.0",
                title="Board",
                notes="notes",
                zip_bytes=b"zip-bytes",
                filename="board-v1.0.0.zip",
            )
        self.assertEqual(published["url"], "https://github.com/org/board/releases/tag/v1.0.0")
        self.assertEqual(calls[0]["json"]["tag_name"], "v1.0.0")
        self.assertEqual(calls[0]["json"]["name"], "v1.0.0")
        self.assertEqual(calls[0]["json"]["target_commitish"], "a" * 40)
        self.assertIn("name=board-v1.0.0.zip", calls[1]["url"])
        self.assertEqual(calls[1]["data"], b"zip-bytes")

    def test_failed_asset_upload_removes_the_release_it_created(self) -> None:
        """An assetless Release is unretryable: its tag blocks the next create."""

        calls: list[tuple[str, str]] = []

        def request(method, url, **_kwargs):  # noqa: ANN001
            calls.append((method, url))
            if method == "POST" and url.endswith("/releases"):
                return _Response(
                    201,
                    {
                        "id": 4242,
                        "html_url": "https://github.com/org/board/releases/tag/v1.0.0",
                        "upload_url": "https://uploads.github.com/repos/org/board/releases/4242/assets{?name,label}",
                    },
                )
            if "uploads.github.com" in url:
                return _Response(502, {"message": "upstream timeout"})
            return _Response(204, {})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            with self.assertRaises(forge.ForgePublishError) as caught:
                forge.publish_release(
                    repo_url="https://github.com/org/board.git",
                    commit_sha="a" * 40,
                    tag="v1.0.0",
                    title="Board",
                    notes="notes",
                    zip_bytes=b"zip-bytes",
                    filename="board-v1.0.0.zip",
                )
        self.assertIn("removed", str(caught.exception))
        self.assertIn(
            ("DELETE", "https://api.github.com/repos/org/board/releases/4242"), calls
        )

    def test_github_uploads_extra_assets_and_rolls_them_back_together(self) -> None:
        calls: list[tuple[str, str]] = []

        def request(method, url, **_kwargs):  # noqa: ANN001
            calls.append((method, url))
            if method == "POST" and url.endswith("/releases"):
                return _Response(
                    201,
                    {
                        "id": 7,
                        "html_url": "https://github.com/org/board/releases/tag/v1.0.0",
                        "upload_url": "https://uploads.github.com/repos/org/board/releases/7/assets{?name,label}",
                    },
                )
            if "jlcpcb-upload.zip" in url:
                return _Response(502, {"message": "pack failed"})
            return _Response(201, {})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            with self.assertRaises(forge.ForgePublishError):
                forge.publish_release(
                    repo_url="https://github.com/org/board.git",
                    commit_sha="a" * 40,
                    tag="v1.0.0",
                    title="ignored",
                    notes="",
                    zip_bytes=b"zip-bytes",
                    filename="board-v1.0.0.zip",
                    extra_assets=[("board-v1.0.0-jlcpcb-upload.zip", b"pack")],
                )
        self.assertIn(("DELETE", "https://api.github.com/repos/org/board/releases/7"), calls)

    def test_gitlab_uploads_a_package_then_creates_the_release(self) -> None:
        calls: list[str] = []

        def request(method, url, **kwargs):  # noqa: ANN001
            calls.append(f"{method} {url}")
            return _Response(201, {})

        with (
            patch.object(forge.settings, "GITLAB_TOKEN", "glpat-example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            published = forge.publish_release(
                repo_url="https://gitlab.com/group/board.git",
                commit_sha="b" * 40,
                tag="v2.0.0",
                title="Board",
                notes="",
                zip_bytes=b"zip-bytes",
                filename="board-v2.0.0.zip",
            )
        self.assertEqual(published["forge"], "gitlab")
        self.assertIn("/-/releases/v2.0.0", published["url"])
        self.assertTrue(calls[0].startswith("PUT "))
        self.assertTrue(calls[1].startswith("POST "))
        self.assertIn("/packages/generic/", calls[0])
        self.assertTrue(calls[1].endswith("/releases"))

    def test_self_hosted_gitlab_publish_uses_api_prefix_and_per_host_header(self) -> None:
        config = json.dumps(
            [
                {
                    "host": "git-a.acme.test",
                    "kind": "gitlab",
                    "api_root": "https://gateway.acme.test/one/api/v4",
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
        calls: list[dict] = []

        def request(method, url, **kwargs):  # noqa: ANN001
            calls.append({"method": method, "url": url, "headers": kwargs["headers"]})
            return _Response(201, {})

        with (
            patch.object(forge.settings, "PRISM_FORGE_HOSTS", config),
            patch.dict(os.environ, {"ACME_A_TOKEN": "token-a", "ACME_B_TOKEN": "token-b"}, clear=False),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            forge.publish_release(
                repo_url="https://git-a.acme.test/group/board.git",
                commit_sha="a" * 40,
                tag="v1.0.0",
                title="Board",
                notes="",
                zip_bytes=b"zip-a",
                filename="board-a.zip",
            )
            forge.publish_release(
                repo_url="https://git-b.acme.test/group/board.git",
                commit_sha="b" * 40,
                tag="v2.0.0",
                title="Board",
                notes="",
                zip_bytes=b"zip-b",
                filename="board-b.zip",
            )
        self.assertEqual(calls[0]["url"], "https://gateway.acme.test/one/api/v4/projects/group%2Fboard/packages/generic/v1.0.0/v1.0.0/board-a.zip")
        self.assertEqual(calls[0]["headers"]["PRIVATE-TOKEN"], "token-a")
        self.assertEqual(calls[1]["url"], "https://gateway.acme.test/one/api/v4/projects/group%2Fboard/releases")
        self.assertEqual(calls[1]["headers"]["PRIVATE-TOKEN"], "token-a")
        self.assertEqual(calls[2]["url"], "https://gateway.acme.test/two/api/v4/projects/group%2Fboard/packages/generic/v2.0.0/v2.0.0/board-b.zip")
        self.assertEqual(calls[2]["headers"]["PRIVATE-TOKEN"], "token-b")
        self.assertEqual(calls[3]["headers"]["PRIVATE-TOKEN"], "token-b")

    def test_clone_only_token_is_reported_as_forbidden(self) -> None:
        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_clone"),
            patch.object(
                forge.requests,
                "request",
                return_value=_Response(403, {"message": "Resource not accessible by integration"}),
            ),
        ):
            with self.assertRaises(forge.ForgePublishError) as caught:
                forge.publish_release(
                    repo_url="https://github.com/org/board.git",
                    commit_sha="a" * 40,
                    tag="v1.0.0",
                    title="",
                    notes="",
                    zip_bytes=b"zip",
                    filename="board-v1.0.0.zip",
                )
        self.assertEqual(caught.exception.status_code, 403)
        self.assertIn("contents:write", str(caught.exception))

    def test_invalid_tag_is_rejected_before_calling_the_forge(self) -> None:
        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request") as request,
        ):
            with self.assertRaises(forge.ForgePublishError):
                forge.publish_release(
                    repo_url="https://github.com/org/board.git",
                    commit_sha="a" * 40,
                    tag="refs/tags/v1",
                    title="",
                    notes="",
                    zip_bytes=b"zip",
                    filename="board.zip",
                )
        request.assert_not_called()

    def test_requests_never_follow_redirects_with_forge_credentials(self) -> None:
        with (
            patch.object(forge.settings, "GITLAB_TOKEN", "glpat-example"),
            patch.object(
                forge.requests,
                "request",
                return_value=_Response(302, {}, text="redirect"),
            ) as request,
        ):
            with self.assertRaisesRegex(forge.ForgePublishError, "unexpected redirect"):
                forge.publish_release(
                    repo_url="https://gitlab.com/group/board.git",
                    commit_sha="a" * 40,
                    tag="v1.0.0",
                    title="",
                    notes="",
                    zip_bytes=b"zip",
                    filename="board.zip",
                )
        self.assertFalse(request.call_args.kwargs["allow_redirects"])

    def test_error_detail_redacts_before_truncating_the_response(self) -> None:
        detail = forge._error_detail(
            _Response(500, None, text=("x" * 299) + "secret-token-tail"),
            sensitive_values=("secret-token-tail",),
        )
        self.assertNotIn("secret-token-tail", detail)

    def test_error_detail_redacts_bare_bearer_tokens(self) -> None:
        detail = forge._error_detail(
            _Response(500, None, text="upstream echoed ghp-secret"),
            sensitive_values=forge._sensitive_header_values(
                {"Authorization": "Bearer ghp-secret"}
            ),
        )
        self.assertNotIn("ghp-secret", detail)


class ForgeListTests(unittest.TestCase):
    def test_github_releases_are_normalized(self) -> None:
        def request(method, url, **kwargs):  # noqa: ANN001
            self.assertEqual(method, "GET")
            return _Response(
                200,
                [
                    {
                        "tag_name": "v1.0.0",
                        "published_at": "2026-01-02T00:00:00Z",
                        "target_commitish": "a" * 40,
                        "body": "First line\nSecond",
                    }
                ],
            )

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            rows = forge.list_releases("https://github.com/org/board.git")
        self.assertEqual(rows[0]["tag"], "v1.0.0")
        self.assertEqual(rows[0]["commit_hash"], "a" * 40)
        self.assertEqual(rows[0]["message"], "First line")

    def test_list_releases_degrades_when_the_token_is_missing(self) -> None:
        with patch.object(forge.settings, "GITHUB_TOKEN", ""):
            self.assertEqual(forge.list_releases("https://github.com/org/board.git"), [])

    def test_tag_exists_on_github(self) -> None:
        calls: list[str] = []

        def request(method, url, **_kwargs):  # noqa: ANN001
            calls.append(url)
            return _Response(200, {"ref": "refs/tags/v1.0.0"})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            self.assertTrue(forge.tag_exists("https://github.com/org/board.git", "v1.0.0"))
        # A tag pushed without a Release still takes the name, so the question
        # has to be asked of the Git ref rather than of the Releases list.
        self.assertIn("/git/ref/tags/v1.0.0", calls[0])

    def test_a_tag_without_a_release_still_reads_as_taken(self) -> None:
        def request(method, url, **_kwargs):  # noqa: ANN001
            if "/git/ref/tags/" in url:
                return _Response(200, {"ref": "refs/tags/v2.0.0"})
            return _Response(404, {"message": "Not Found"})

        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            self.assertTrue(forge.tag_exists("https://github.com/org/board.git", "v2.0.0"))

    def test_gitlab_tag_existence_asks_the_repository_tags(self) -> None:
        calls: list[str] = []

        def request(method, url, **_kwargs):  # noqa: ANN001
            calls.append(url)
            return _Response(200, {"name": "v1.0.0"})

        with (
            patch.object(forge.settings, "GITLAB_TOKEN", "glpat_example"),
            patch.object(forge.requests, "request", side_effect=request),
        ):
            self.assertTrue(forge.tag_exists("https://gitlab.com/org/board.git", "v1.0.0"))
        self.assertIn("/repository/tags/v1.0.0", calls[0])

    def test_missing_tag_is_not_an_error(self) -> None:
        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", return_value=_Response(404, {"message": "Not Found"})),
        ):
            self.assertFalse(forge.tag_exists("https://github.com/org/board.git", "v9.9.9"))

    def test_list_releases_is_empty_when_the_forge_fails(self) -> None:
        with (
            patch.object(forge.settings, "GITHUB_TOKEN", "ghp_example"),
            patch.object(forge.requests, "request", return_value=_Response(502, {"message": "bad gateway"})),
        ):
            self.assertEqual(forge.list_releases("https://github.com/org/board.git"), [])


if __name__ == "__main__":
    unittest.main()
