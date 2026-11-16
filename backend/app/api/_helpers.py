import gzip
import json
import mimetypes
import re
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import quote

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

from app.core import policy
from app.core.gzip_config import GZIP_EXCLUDED_CONTENT_TYPES
from app.core.roles import Role
from app.core.security import AuthenticatedUser
from app.services.workspace_service import workspace
from app.services import file_service, project_service
from app.services.catalog.preview_files import stored_file


VALID_OUTPUT_TYPES = {"design", "manufacturing"}


# There is deliberately no get_project_or_404 here. A lookup that ignores the
# caller's role is one import away from being an access-control bypass, and the
# one that existed had no callers to justify the risk. Use the role-aware
# functions below, or say at the call site why a project may be returned to
# somebody who cannot otherwise see it.


def authorized_project(user: AuthenticatedUser, project_id: str, action: policy.Action = "read") -> dict:
    """The full workspace record of a project ``user`` may ``action``.

    403 when the caller may not ``action`` at all, 404 when the project does not
    exist or its folder hides it from the caller's role. The record carries the
    checkout path, repository URL and thumbnail columns, so callers never need a
    second, role-blind lookup.
    """
    policy.authorize(user, action)
    row = workspace.get_project_for_role(project_id, user.role)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return row


def get_project_for_role_or_404(project_id: str, role: Role) -> project_service.Project:
    """Visibility-only lookup as the ``Project`` model, for routes whose
    dependency already authorized the action."""
    row = workspace.get_project_for_role(project_id, role)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return _row_to_project(row)


# Jobs whose subject is a remote repository rather than a project. Enqueue
# hands a second requester of the same import the first requester's job, so
# anyone who may start one may follow it (D6).
_REMOTE_REPOSITORY_KINDS = frozenset({"project_import", "project_analyze"})


def authorize_job_read(job: dict, user: AuthenticatedUser) -> None:
    """Who may see a job: whoever may see its subject (D6). Project jobs follow
    the project, imports whoever may import, catalog
    jobs the catalog roles; a job with none of these its requester or an admin.

    Never the requester alone where enqueue deduplicates: a second reader gets
    the first requester's job id."""
    project_id = job.get("project_id")
    if project_id:
        get_project_for_role_or_404(str(project_id), user.role)
        return
    if job.get("worker_pool") == "catalog":
        if not policy.role_allows(user.role, "catalog_read"):
            raise HTTPException(status_code=403, detail="Catalog read access required")
        return
    if job.get("kind") in _REMOTE_REPOSITORY_KINDS:
        if not policy.role_allows(user.role, "design"):
            raise HTTPException(status_code=403, detail="Job access denied")
        return
    policy.require_owner_or_admin(user, job.get("requested_by"), detail="Job access denied")


def _row_to_project(row: dict) -> project_service.Project:
    """Convert a workspace DB row dict into the Project Pydantic model."""
    return project_service.Project(
        id=row["id"],
        name=row["name"],
        display_name=row.get("display_name"),
        description=row.get("description", ""),
        path=row.get("path", ""),
        last_modified=row.get("last_modified", ""),
        registered_at=row.get("registered_at"),
        last_synced_at=row.get("repo_last_synced"),
        thumbnail_url=project_service.thumbnail_url_for_row(row),
        sub_path=row.get("relative_path") if row.get("relative_path") != "." else None,
        project_file=row.get("project_file_rel") or None,
        import_branch=row.get("import_branch"),
        parent_repo=row.get("parent_repo"),
        repo_url=row.get("repo_url"),
        origin_url=row.get("origin_url"),
        origin_owner=row.get("origin_owner"),
        import_type=row.get("import_type"),
        parent_repo_path=row.get("parent_repo_path"),
        folder_id=row.get("folder_id"),
    )


def require_output_type(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in VALID_OUTPUT_TYPES:
        raise HTTPException(status_code=400, detail="Type must be 'design' or 'manufacturing'")
    return normalized


def resolve_path_within_root(root: str, relative_path: str, *, invalid_detail: str) -> Path:
    root_path = Path(root).resolve()
    target_path = (root_path / relative_path).resolve()

    try:
        target_path.relative_to(root_path)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=invalid_detail) from error

    return target_path


def preview_file_response(request: Request, path: Path, media_type: str, headers: dict[str, str]) -> Response:
    """Serve a catalog preview, which is usually stored gzipped beside its ``.svg`` path.

    A browser that accepts gzip gets the stored bytes as they are, marked
    ``Content-Encoding: gzip`` so the compression middleware leaves them alone;
    any other client gets them decompressed.
    """

    stored = stored_file(path)
    if stored is None:
        raise HTTPException(status_code=404, detail="Preview not found")
    file, packed = stored
    if not packed:
        return FileResponse(file, media_type=media_type, headers=headers)
    headers = {**headers, "Vary": "Accept-Encoding"}
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        return FileResponse(file, media_type=media_type, headers={**headers, "Content-Encoding": "gzip"})
    import gzip  # noqa: PLC0415

    return Response(gzip.decompress(file.read_bytes()), media_type=media_type, headers=headers)


#: Headers for bytes Prism serves but did not write -- released members, KiCad's
#: SVG plots, Gerber layers drawn as SVG. SVG served inline from this origin is
#: script; the sandbox and the sniffing block keep an inline view from becoming
#: a way to run code against a logged-in session.
SANDBOXED_CONTENT_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


#: Larger commit files are served from the content-addressed blob cache, not read whole.
COMMIT_FILE_STREAM_BYTES = 1 << 20


_FULL_SHA = re.compile(r"[0-9a-f]{40}")

#: A file read at a full commit SHA never changes. ``private``: it is served to
#: a signed-in session only.
PINNED_CACHE_CONTROL = "private, max-age=31536000, immutable"


def revision_cache_headers(commit: Optional[str]) -> Dict[str, str]:
    """Cache headers for a file read at ``commit``.

    A full SHA names bytes that never change, so the browser keeps them. Any
    other revision (HEAD, a branch, a short SHA) can move: the browser asks
    again every time and the ETag turns an unchanged answer into a 304.
    """

    if commit and _FULL_SHA.fullmatch(commit):
        return {"Cache-Control": PINNED_CACHE_CONTROL}
    return {"Cache-Control": "no-cache"}


def _etag_matches(request: Request, etag: str) -> bool:
    header = request.headers.get("if-none-match")
    if not header:
        return False
    tags = {tag.strip().removeprefix("W/") for tag in header.split(",")}
    return "*" in tags or etag in tags


def _accepts_gzip(request: Request) -> bool:
    for coding in request.headers.get("accept-encoding", "").split(","):
        name, _, params = coding.strip().partition(";")
        if name.strip().lower() == "gzip":
            return params.replace(" ", "") not in ("q=0", "q=0.0", "q=0.00", "q=0.000")
    return False


def _compressible(media_type: str) -> bool:
    if media_type.startswith(("image/", "video/", "audio/")):
        return False
    return not media_type.startswith(GZIP_EXCLUDED_CONTENT_TYPES)


def gzip_served_path(
    request: Request, path: Path, media_type: str, content_key: str, headers: Dict[str, str]
) -> Path:
    """The file to send for ``path``: its gzip copy when the client takes gzip.

    Call it from a worker thread: the first request for some content compresses
    it. ``headers`` gains ``Content-Encoding``, so the response middleware
    passes the copy through instead of compressing it again on the event loop.
    """

    if "range" in request.headers or not _compressible(media_type) or not _accepts_gzip(request):
        return path
    headers["Content-Encoding"] = "gzip"
    headers["Vary"] = "Accept-Encoding"
    return file_service.gzip_copy(path, content_key)


def gzip_json_response(request: Request, payload: object, headers: Dict[str, str]) -> Response:
    """``payload`` as JSON, serialized and (when the client takes it) gzipped here.

    For a large body built in a worker thread: returning the object instead
    leaves serializing and compressing it to the event loop.
    """

    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    response_headers = dict(headers)
    if len(body) > COMMIT_FILE_STREAM_BYTES and _accepts_gzip(request):
        body = gzip.compress(body, compresslevel=file_service.GZIP_COPY_LEVEL, mtime=0)
        response_headers["Content-Encoding"] = "gzip"
        response_headers["Vary"] = "Accept-Encoding"
    return Response(content=body, media_type="application/json", headers=response_headers)


def commit_file_response(
    commit_file: file_service.CommitFile,
    *,
    inline: bool = True,
    headers: Optional[Dict[str, str]] = None,
    request: Optional[Request] = None,
) -> Response:
    """Serve a file read at a commit; a large one streams from the blob cache.

    With the ``request``, the response carries an ETag naming the file's
    content (its blob, or its bundle member digest): a matching
    ``If-None-Match`` is answered 304 without the bytes, and a large
    compressible file is sent from a gzip copy made once in this worker thread
    instead of being compressed again by the middleware on the event loop.
    """
    media_type = mimetypes.guess_type(commit_file.name)[0] or "application/octet-stream"
    response_headers = dict(headers or {})
    if request is not None:
        etag = f'"{commit_file.blob_sha}"'
        response_headers["ETag"] = etag
        if _etag_matches(request, etag):
            return Response(status_code=304, headers=response_headers)
    disposition = "inline" if inline else "attachment"
    safe_name = commit_file.name.replace('"', "")
    response_headers["Content-Disposition"] = (
        f'{disposition}; filename="{safe_name}"; filename*=UTF-8\'\'{quote(commit_file.name)}'
    )
    if commit_file.size > COMMIT_FILE_STREAM_BYTES:
        path = commit_file.cached_path()
        if request is not None:
            path = gzip_served_path(request, path, media_type, commit_file.blob_sha, response_headers)
        return FileResponse(path, media_type=media_type, headers=response_headers)
    return Response(content=commit_file.content, media_type=media_type, headers=response_headers)
