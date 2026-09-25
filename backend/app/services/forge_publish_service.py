"""Publish a Release Studio dossier as a GitHub or GitLab Release asset.

Prism's workspace SSH key can clone; it cannot create forge Releases. This
module uses the token environment variable selected by the resolved forge host,
and says so when that token is missing or lacks write scope.
"""

from __future__ import annotations

import io
import json
import os
import re
import tarfile
from dataclasses import dataclass
from typing import Any, Mapping, Sequence
from urllib.parse import quote

import requests

from app.core.config import settings
from app.release_studio.canonical import write_deterministic_zip
from app.services.forge_hosts import ForgeHostConfigError, resolve_forge_host
from app.services.git_remote_url import ParsedRemote, RemoteUrlError, parse_remote_url

_TAG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


class ForgePublishError(RuntimeError):
    """A publish attempt the user can act on (missing token, wrong host, 403)."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class ForgeTarget:
    kind: str
    name: str
    host: str
    owner_repo: str
    api_root: str
    token_configured: bool
    token_hint: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "name": self.name,
            "host": self.host,
            "owner_repo": self.owner_repo,
            "token_configured": self.token_configured,
            "token_hint": self.token_hint,
        }


def describe_forge(repo_url: str | None) -> ForgeTarget:
    """Resolve the imported remote to a GitHub or GitLab publish target."""

    if not repo_url or not str(repo_url).strip():
        raise ForgePublishError("This project has no imported Git remote to publish to.")
    try:
        parsed = parse_remote_url(str(repo_url))
    except RemoteUrlError as exc:
        raise ForgePublishError(f"The imported remote cannot be published: {exc}") from exc
    return _target_from_parsed(parsed)


def dossier_tar_to_zip(dossier_bytes: bytes) -> bytes:
    """Repack dossier members as a zip. Same files, forge-friendly container."""

    members: dict[str, bytes] = {}
    archive_mtime = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(dossier_bytes), mode="r:*") as archive:
            for info in archive.getmembers():
                if not info.isfile():
                    continue
                extracted = archive.extractfile(info)
                if extracted is None:
                    continue
                members[info.name] = extracted.read()
                archive_mtime = max(archive_mtime, int(info.mtime or 0))
    except tarfile.TarError as exc:
        raise ForgePublishError(f"The stored dossier could not be read: {exc}") from exc
    if not members:
        raise ForgePublishError("The stored dossier is empty.")
    return write_deterministic_zip(members, mtime=archive_mtime)


def list_releases(repo_url: str | None, *, limit: int = 10) -> list[dict[str, str]]:
    """Prior GitHub/GitLab Releases for the cover history table.

    Failures degrade to an empty list so a cover can still compose. The current
    unpublished release is prepended by the document engine, not here.
    """

    try:
        target = describe_forge(repo_url)
    except ForgePublishError:
        return []
    if target.kind == "unsupported" or not target.token_configured:
        return []
    try:
        headers = _headers_for_target(target)
        if target.kind == "github":
            payload = _request(
                "GET",
                f"{target.api_root}/repos/{target.owner_repo}/releases",
                headers=headers,
                forge="GitHub",
                params={"per_page": max(1, min(limit, 30))},
            )
            rows = payload if isinstance(payload, list) else []
            return [_github_release_row(item) for item in rows if isinstance(item, dict)][:limit]
        project = quote(target.owner_repo, safe="")
        payload = _request(
            "GET",
            f"{target.api_root}/projects/{project}/releases",
            headers=headers,
            forge="GitLab",
            params={"per_page": max(1, min(limit, 30))},
        )
        rows = payload if isinstance(payload, list) else []
        return [_gitlab_release_row(item) for item in rows if isinstance(item, dict)][:limit]
    except ForgePublishError:
        return []


def tag_exists(repo_url: str | None, tag: str) -> bool:
    """True when the forge already has this Git tag. API failures read as absent.

    This asks about the *tag*, not about a Release. A tag pushed from a
    workstation with no Release attached still makes the name unusable: both
    forges bind a new Release to the existing tag and ignore the commit the
    caller asked for, which would point the Release at a different revision
    than the one the dossier was built from.
    """

    candidate = (tag or "").strip()
    if not candidate:
        return False
    try:
        target = describe_forge(repo_url)
    except ForgePublishError:
        return False
    if target.kind == "unsupported" or not target.token_configured:
        return False
    try:
        headers = _headers_for_target(target)
        if target.kind == "github":
            _request(
                "GET",
                f"{target.api_root}/repos/{target.owner_repo}/git/ref/"
                f"tags/{quote(candidate, safe='')}",
                headers=headers,
                forge="GitHub",
            )
            return True
        project = quote(target.owner_repo, safe="")
        _request(
            "GET",
            f"{target.api_root}/projects/{project}/repository/tags/"
            f"{quote(candidate, safe='')}",
            headers=headers,
            forge="GitLab",
        )
        return True
    except ForgePublishError:
        return False


def publish_release(
    *,
    repo_url: str,
    commit_sha: str,
    tag: str,
    title: str,
    notes: str,
    zip_bytes: bytes,
    filename: str,
    extra_assets: Sequence[tuple[str, bytes]] = (),
) -> dict[str, str]:
    """Create the forge Release on ``commit_sha`` and attach the zip plus extras.

    The Release *name* is the tag. ``title`` is ignored so a client cannot
    publish sheets that state one revision under a different Release title.
    """

    target = describe_forge(repo_url)
    if not target.token_configured:
        raise ForgePublishError(target.token_hint, status_code=409)
    if target.kind == "unsupported":
        raise ForgePublishError(
            "Publishing is only implemented for GitHub and GitLab remotes."
        )
    normalized_tag = _require_tag(tag)
    _ = title
    name = normalized_tag
    body = notes.strip()
    extras = list(extra_assets)
    if target.kind == "github":
        return _publish_github(
            target, commit_sha, normalized_tag, name, body, zip_bytes, filename, extras
        )
    return _publish_gitlab(
        target, commit_sha, normalized_tag, name, body, zip_bytes, filename, extras
    )


def release_zip_filename(project_name: str, tag: str) -> str:
    stem = _SAFE_FILENAME_RE.sub("-", (project_name or "release").strip()) or "release"
    safe_tag = _SAFE_FILENAME_RE.sub("-", tag.strip()) or "release"
    return f"{stem}-{safe_tag}.zip"


def _target_from_parsed(parsed: ParsedRemote) -> ForgeTarget:
    host = parsed.host.casefold()
    owner_repo = parsed.path.strip("/").removesuffix(".git")
    try:
        registered = resolve_forge_host(host, settings.PRISM_FORGE_HOSTS)
    except ForgeHostConfigError as error:
        raise ForgePublishError(str(error)) from error
    if registered is None:
        return ForgeTarget(
            kind="unsupported",
            name=parsed.host,
            host=parsed.host,
            owner_repo=owner_repo,
            api_root="",
            token_configured=False,
            token_hint=(
                f"Publishing is only implemented for GitHub and GitLab remotes, not {parsed.host}."
            ),
        )
    token = _token_for_name(registered.token_name)
    hint = (
        f"Set {registered.token_name} with contents:write to create a GitHub Release. "
        "The workspace SSH key can clone but cannot publish."
        if registered.kind == "github"
        else f"Set {registered.token_name} with api scope to create a GitLab Release. "
        "The workspace SSH key can clone but cannot publish."
    )
    return ForgeTarget(
        kind=registered.kind,
        name=registered.display_name,
        host=parsed.host,
        owner_repo=owner_repo,
        api_root=registered.api_root,
        token_configured=bool(token),
        token_hint=hint,
    )


def _require_tag(tag: str) -> str:
    candidate = (tag or "").strip()
    if candidate.startswith("refs/"):
        raise ForgePublishError("Enter a tag name such as v1.0.0, not a Git ref path.")
    if not _TAG_RE.match(candidate):
        raise ForgePublishError(
            "Tag must start with a letter or digit and contain only letters, digits, dots, underscores, and hyphens."
        )
    return candidate


def _github_headers(token: str | None = None) -> dict[str, str]:
    configured = _token_for_name("GITHUB_TOKEN") if token is None else token
    return {
        "Authorization": f"Bearer {configured}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _gitlab_headers(token: str | None = None) -> dict[str, str]:
    configured = _token_for_name("GITLAB_TOKEN") if token is None else token
    return {"PRIVATE-TOKEN": configured}


def _headers_for_target(target: ForgeTarget) -> dict[str, str]:
    registered = resolve_forge_host(target.host, settings.PRISM_FORGE_HOSTS)
    if registered is None:
        raise ForgePublishError("The configured forge target is no longer available.")
    token = _token_for_name(registered.token_name)
    if registered.kind == "github":
        return _github_headers(token)
    return _gitlab_headers(token)


def _token_for_name(token_name: str) -> str:
    configured = getattr(settings, token_name, None)
    if configured is None:
        configured = os.environ.get(token_name, "")
    return str(configured or "").strip()


def _github_release_row(item: dict[str, Any]) -> dict[str, str]:
    commit = str(item.get("target_commitish") or "")
    if len(commit) != 40:
        commit = ""
    body = str(item.get("body") or item.get("name") or "")
    return {
        "tag": str(item.get("tag_name") or ""),
        "date": str(item.get("published_at") or item.get("created_at") or ""),
        "commit_hash": commit,
        "message": body.strip().splitlines()[0] if body.strip() else "",
        "url": str(item.get("html_url") or ""),
    }


def _gitlab_release_row(item: dict[str, Any]) -> dict[str, str]:
    commit_info = item.get("commit") if isinstance(item.get("commit"), dict) else {}
    commit = str(commit_info.get("id") or "")
    body = str(item.get("description") or item.get("name") or "")
    tag = str(item.get("tag_name") or "")
    links = item.get("_links") if isinstance(item.get("_links"), dict) else {}
    url = str(item.get("html_url") or links.get("self") or "")
    return {
        "tag": tag,
        "date": str(item.get("released_at") or item.get("created_at") or ""),
        "commit_hash": commit,
        "message": body.strip().splitlines()[0] if body.strip() else "",
        "url": url,
    }


def _publish_github(
    target: ForgeTarget,
    commit_sha: str,
    tag: str,
    name: str,
    body: str,
    zip_bytes: bytes,
    filename: str,
    extra_assets: Sequence[tuple[str, bytes]] = (),
) -> dict[str, str]:
    headers = _headers_for_target(target)
    created = _request(
        "POST",
        f"{target.api_root}/repos/{target.owner_repo}/releases",
        headers=headers,
        json_body={
            "tag_name": tag,
            "target_commitish": commit_sha,
            "name": name,
            "body": body,
            "draft": False,
            "prerelease": False,
        },
        forge="GitHub",
    )
    # The Release exists from here on. Anything that goes wrong before every
    # asset is attached has to take it back down: a Release with a missing
    # dossier or pack is both publicly visible and unretryable, because the
    # tag it holds makes the next create fail with "already_exists".
    release_id = created.get("id")
    try:
        upload_url = str(created.get("upload_url") or "").split("{", 1)[0]
        if not upload_url:
            raise ForgePublishError("GitHub created the release but returned no upload URL.")
        assets = [(filename, zip_bytes), *list(extra_assets)]
        for asset_name, payload in assets:
            _request(
                "POST",
                f"{upload_url}?name={quote(asset_name)}",
                headers={**headers, "Content-Type": "application/zip"},
                data=payload,
                forge="GitHub",
            )
    except ForgePublishError as exc:
        _delete_github_release(target, headers, release_id)
        raise ForgePublishError(
            f"{exc} The incomplete GitHub Release was removed; publish again.",
            status_code=exc.status_code,
        ) from exc
    html_url = str(created.get("html_url") or "")
    if not html_url:
        html_url = f"https://github.com/{target.owner_repo}/releases/tag/{quote(tag)}"
    return {"url": html_url, "tag": tag, "forge": "github"}


def _delete_github_release(
    target: ForgeTarget, headers: dict[str, str], release_id: Any
) -> None:
    """Best-effort removal of a Release whose asset upload failed.

    The upload error is what the user needs to see, so a failed cleanup is
    logged into neither the response nor an exception -- it only means the
    operator has to delete the empty Release by hand, which is the situation
    this function is trying to avoid, not one it can make worse.
    """

    if not release_id:
        return
    try:
        _request(
            "DELETE",
            f"{target.api_root}/repos/{target.owner_repo}/releases/{release_id}",
            headers=headers,
            forge="GitHub",
        )
    except ForgePublishError:
        return


def _publish_gitlab(
    target: ForgeTarget,
    commit_sha: str,
    tag: str,
    name: str,
    body: str,
    zip_bytes: bytes,
    filename: str,
    extra_assets: Sequence[tuple[str, bytes]] = (),
) -> dict[str, str]:
    headers = _headers_for_target(target)
    project = quote(target.owner_repo, safe="")
    assets = [(filename, zip_bytes), *list(extra_assets)]
    links: list[dict[str, str]] = []
    for asset_name, payload in assets:
        package_url = (
            f"{target.api_root}/projects/{project}/packages/generic/"
            f"{quote(tag, safe='')}/{quote(tag, safe='')}/{quote(asset_name)}"
        )
        _request(
            "PUT",
            package_url,
            headers=headers,
            data=payload,
            forge="GitLab",
        )
        links.append({"name": asset_name, "url": package_url, "link_type": "package"})
    _request(
        "POST",
        f"{target.api_root}/projects/{project}/releases",
        headers=headers,
        json_body={
            "name": name,
            "tag_name": tag,
            "ref": commit_sha,
            "description": body,
            "assets": {"links": links},
        },
        forge="GitLab",
    )
    html_url = f"https://{target.host}/{target.owner_repo}/-/releases/{quote(tag)}"
    return {"url": html_url, "tag": tag, "forge": "gitlab"}


def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    forge: str,
    json_body: dict[str, Any] | None = None,
    data: bytes | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    try:
        response = requests.request(
            method,
            url,
            headers=headers,
            json=json_body,
            data=data,
            params=params,
            timeout=60,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise ForgePublishError(f"{forge} could not be reached: {exc}") from exc
    if response.status_code == 404:
        raise ForgePublishError(f"{forge} has no such release.", status_code=404)
    if response.status_code in {401, 403}:
        raise ForgePublishError(
            f"{forge} refused the token. Publishing needs write access "
            f"({'contents:write' if forge == 'GitHub' else 'api scope'}), not clone-only.",
            status_code=403,
        )
    if 300 <= response.status_code < 400:
        raise ForgePublishError(
            f"{forge} returned an unexpected redirect.",
            status_code=502,
        )
    if response.status_code >= 400:
        detail = _error_detail(
            response,
            sensitive_values=_sensitive_header_values(headers),
        )
        raise ForgePublishError(
            f"{forge} rejected the release ({response.status_code}): {detail}",
            status_code=409 if response.status_code in {409, 422} else 502,
        )
    if not response.content:
        return {}
    try:
        parsed = response.json()
    except ValueError:
        return {}
    return parsed


def _error_detail(
    response: requests.Response,
    *,
    sensitive_values: Sequence[str] = (),
) -> str:
    try:
        payload = response.json()
    except ValueError:
        text = (response.text or "").strip()
        detail = _redact(text or response.reason, sensitive_values)
        return detail[:300]
    if isinstance(payload, dict):
        message = payload.get("message") or payload.get("error") or payload.get("error_description")
        if message:
            return _redact(str(message), sensitive_values)[:300]
    return _redact(response.reason, sensitive_values)[:300]


def _redact(value: str, sensitive_values: Sequence[str]) -> str:
    redacted = str(value or "")
    for sensitive in sensitive_values:
        candidate = str(sensitive or "")
        if candidate:
            redacted = redacted.replace(candidate, "[redacted]")
    return redacted


def _sensitive_header_values(headers: Mapping[str, str]) -> tuple[str, ...]:
    values: list[str] = []
    for value in headers.values():
        candidate = str(value or "")
        if not candidate:
            continue
        values.append(candidate)
        if candidate.casefold().startswith("bearer "):
            values.append(candidate[7:])
    return tuple(values)
