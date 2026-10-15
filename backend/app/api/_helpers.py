from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

from app.core import policy
from app.core.roles import Role
from app.core.security import AuthenticatedUser
from app.services.workspace_service import workspace
from app.services import project_service
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


def _system_visible(system_id: str, role: Role) -> bool:
    from app.services.systems import visibility
    from app.services.systems.jobs import workspace_connection

    with workspace_connection() as conn:
        return bool(visibility.visible_systems(conn, role, system_id=system_id))


def authorize_job_read(job: dict, user: AuthenticatedUser) -> None:
    """Who may see a job: whoever may see its subject (D6). Project jobs follow
    the project, System jobs the System, imports whoever may import, catalog
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
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    system_id = payload.get("systemId")
    if system_id:
        if not _system_visible(str(system_id), user.role):
            raise HTTPException(status_code=404, detail="System not found")
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
