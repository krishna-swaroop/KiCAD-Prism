"""Admin settings for KiCad path libraries.

An administrator declares the libraries behind the path variables boards use
(``${LSF_KICAD_LIB}``); Prism fetches them, keeps them current or frozen, and
binds the variables for every KiCad process. Every write is guarded by the
library's ETag (``If-Match``). Database work and the remote checks run in a
worker thread.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.core import preconditions
from app.core.config import settings
from app.core.errors import Conflict, Invalid
from app.core.security import AuthenticatedUser, require_admin
from app.services import kicad_libraries, kicad_library_fetch, kicad_library_store as store, kicad_library_updates

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings/kicad-libraries", tags=["settings"])

_SOURCE = ("git", "ref", "subdir")


class LibraryView(BaseModel):
    """A library as the console shows it.

    ``ready`` is whether it serves a version now (the disk decides); ``state`` is
    the last fetch's report. ``servedCommit`` is what is bound, ``remoteCommit``
    what the last check saw the ref at.
    """

    name: str
    kind: str
    variables: list[str]
    git: str
    ref: str
    subdir: str
    path: str
    updatePolicy: str
    pinnedCommit: str
    checkIntervalSeconds: int
    lastCheckedAt: datetime | None = None
    lastCheckError: str | None = None
    remoteCommit: str
    fetchedCommit: str
    servedCommit: str
    state: str
    error: str | None = None
    progress: int | None = None
    sizeBytes: int | None = None
    fetchedAt: datetime | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    updatedBy: str
    ready: bool
    # Why the library is not in service although declared (its row no longer validates); None when it is.
    problem: str | None = None
    overriddenVariables: list[str]
    etag: str
    rowVersion: int
    projectsUsing: int = 0


class VariableUsage(BaseModel):
    variable: str
    projects: int
    models: int
    sheets: int
    bound: bool


class LibraryList(BaseModel):
    libraries: list[LibraryView]
    usage: list[VariableUsage]
    pathLibrariesEnabled: bool
    checkIntervals: list[int]


class VersionView(BaseModel):
    commit: str
    ref: str
    fetchedAt: datetime
    requestedBy: str
    serving: bool


class LibraryCreate(BaseModel):
    name: str
    variables: list[str]
    git: str | None = None
    ref: str = ""
    subdir: str = ""
    path: str | None = None
    updatePolicy: str = "follow"
    checkIntervalSeconds: int = kicad_libraries.DEFAULT_CHECK_INTERVAL


class LibraryUpdate(BaseModel):
    variables: list[str] | None = None
    ref: str | None = None
    subdir: str | None = None
    updatePolicy: str | None = None
    checkIntervalSeconds: int | None = None


class RemoteCheck(BaseModel):
    git: str = Field(max_length=2000)
    ref: str = Field("", max_length=200)


class RemoteCheckResult(BaseModel):
    reachable: bool
    error: str | None = None
    defaultBranch: str | None = None
    tags: list[str] = []
    branches: list[str] = []
    refFound: bool | None = None


class CheckResult(BaseModel):
    library: LibraryView
    remoteCommit: str
    moved: bool
    queued: bool
    error: str | None = None


_FIELDS = {
    "updatePolicy": "update_policy",
    "checkIntervalSeconds": "check_interval_seconds",
}


def _fields(body: BaseModel, *, exclude_unset: bool = True) -> dict[str, Any]:
    changes = body.model_dump(exclude_unset=exclude_unset, exclude_none=True)
    return {_FIELDS.get(key, key): value for key, value in changes.items()}


def _expected(request: Request, name: str) -> int:
    version = preconditions.int_version(preconditions.if_match(request, store.ETAG_KIND, name))
    return -1 if version is None else version


def _with_etag(view: dict[str, Any], response: Response) -> dict[str, Any]:
    response.headers["ETag"] = view["etag"]
    return view


def _decorated(view: dict[str, Any]) -> dict[str, Any]:
    return {**view, "projectsUsing": store.projects_using(view["variables"])}


def _queue_fetch(view: dict[str, Any], user: AuthenticatedUser, *, commit: str = "") -> None:
    if view["git"]:
        kicad_library_fetch.request_fetch(view["name"], commit=commit, requested_by=user.email)


async def _run(work: Callable[[], Any]) -> Any:
    return await asyncio.to_thread(work)


@router.get("", response_model=LibraryList, summary="List KiCad path libraries")
async def list_libraries(_user: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    """The declared libraries, the variables boards use, and which of those a library binds."""

    def read() -> dict[str, Any]:
        views = [_decorated(view) for view in store.list_all()]
        bound = {name for view in views if view["ready"] for name in view["variables"]}
        taken = kicad_libraries.snapshot()
        usage = [{**row, "bound": row["variable"] in bound or taken.defines(row["variable"])} for row in store.usage()]
        return {
            "libraries": views,
            "usage": usage,
            "pathLibrariesEnabled": bool(settings.PRISM_KICAD_LIBRARY_MOUNT_ROOT.strip()),
            "checkIntervals": list(kicad_libraries.CHECK_INTERVALS),
        }

    return await _run(read)


@router.post("", response_model=LibraryView, status_code=201, summary="Declare a KiCad path library")
async def create_library(
    body: LibraryCreate, response: Response, user: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """Declare a library and queue its first fetch. A path library must sit under the configured mount root."""

    if body.path and not settings.PRISM_KICAD_LIBRARY_MOUNT_ROOT.strip():
        raise Invalid("Path libraries are off: set PRISM_KICAD_LIBRARY_MOUNT_ROOT on the server")
    if body.path and (problem := kicad_libraries.mount_root_problem()):
        raise Invalid(problem)
    fields = _fields(body, exclude_unset=False)

    def create() -> dict[str, Any]:
        view = store.create(fields, updated_by=user.email)
        logger.info("KiCad library %s declared by %s", view["name"], user.email)
        _queue_fetch(view, user)
        return _decorated(view)

    return _with_etag(await _run(create), response)


@router.post("/check", response_model=RemoteCheckResult, summary="Check that a repository and ref exist")
async def check_remote(body: RemoteCheck, _user: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    return await _run(lambda: kicad_library_fetch.check_remote(body.git, body.ref))


@router.get("/{name}/versions", response_model=list[VersionView], summary="The versions a library has served")
async def library_versions(name: str, _user: AuthenticatedUser = Depends(require_admin)) -> list[dict[str, Any]]:
    def read() -> list[dict[str, Any]]:
        served = store.get(name)["servedCommit"]
        return [{**version, "serving": version["commit"] == served} for version in store.versions(name)]

    return await _run(read)


@router.patch("/{name}", response_model=LibraryView, summary="Change a KiCad path library")
async def update_library(
    name: str, body: LibraryUpdate, request: Request, response: Response,
    user: AuthenticatedUser = Depends(require_admin),
) -> dict[str, Any]:
    """Change the variables, ref, subfolder, update policy or check interval.

    A new ref or subfolder fetches again; what is served stays bound until the
    new version is published.
    """

    expected = _expected(request, name)
    changes = _fields(body)

    def update() -> dict[str, Any]:
        before = store.get(name)
        view = store.update(name, changes, expected_version=expected, updated_by=user.email)
        logger.info("KiCad library %s changed by %s: %s", name, user.email, ", ".join(sorted(changes)) or "nothing")
        if any(before[key] != view[key] for key in _SOURCE):
            _queue_fetch(view, user)
        return _decorated(view)

    return _with_etag(await _run(update), response)


@router.post("/{name}/fetch", response_model=LibraryView, summary="Fetch a KiCad path library again")
async def fetch_library(
    name: str, response: Response, user: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """Retry a failed fetch, or restore a library whose files were lost."""

    def refetch() -> dict[str, Any]:
        view = store.get(name)
        if not view["git"]:
            raise Invalid("A path library has nothing to fetch")
        store.record_fetch(name, state="pending", error=None, progress=None)
        _queue_fetch(view, user, commit=view["pinnedCommit"] if view["updatePolicy"] == "pinned" else "")
        return _decorated(store.get(name))

    return _with_etag(await _run(refetch), response)


@router.post("/{name}/refresh", response_model=LibraryView, summary="Read a path library's folder again")
async def refresh_library(
    name: str, request: Request, response: Response, user: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """A path library's content is only picked up when asked: boards using it refresh their models."""

    expected = _expected(request, name)
    return _with_etag(
        await _run(lambda: _decorated(store.refresh_path(name, expected_version=expected, updated_by=user.email))),
        response,
    )


@router.post("/{name}/check", response_model=CheckResult, summary="Check a library's remote now")
async def check_library(name: str, user: AuthenticatedUser = Depends(require_admin)) -> dict[str, Any]:
    """The scheduled check, on demand. A following library fetches a moved ref; a pinned one only reports it."""

    def check() -> dict[str, Any]:
        store.get(name)  # a missing library is a 404, not an empty answer
        result = kicad_library_updates.check_library(name)
        return {**result, "library": _decorated(store.get(name))}

    return await _run(check)


@router.post("/{name}/update", response_model=LibraryView, summary="Fetch a library's ref as it is now")
async def update_now(
    name: str, request: Request, response: Response, user: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """Move to where the ref points now. A pinned library is pinned at that commit."""

    expected = _expected(request, name)

    def update() -> dict[str, Any]:
        view = store.get(name)
        if not view["git"]:
            raise Invalid("A path library has nothing to fetch; refresh it instead")
        try:
            commit = kicad_library_fetch.resolve_remote(view["git"], view["ref"])
        except kicad_library_fetch.FetchError as error:
            logger.warning("KiCad library %s: could not resolve %s: %s", name, view["ref"], error)
            raise Conflict(
                "The repository did not answer for that tag or branch; check the address and ref, then try again",
                code="remote-unreachable",
            ) from error
        changes: dict[str, Any] = {"pinned_commit": commit} if view["updatePolicy"] == "pinned" else {}
        updated = store.update(name, changes, expected_version=expected, updated_by=user.email)
        logger.info("KiCad library %s updated to %s by %s", name, commit, user.email)
        _queue_fetch(updated, user, commit=commit)
        return _decorated(store.get(name))

    return _with_etag(await _run(update), response)


def _set_policy(policy: str) -> Callable[..., Any]:
    async def handler(
        name: str, request: Request, response: Response, user: AuthenticatedUser = Depends(require_admin)
    ) -> dict[str, Any]:
        expected = _expected(request, name)

        def change() -> dict[str, Any]:
            view = store.update(name, {"update_policy": policy}, expected_version=expected, updated_by=user.email)
            logger.info("KiCad library %s set to %s by %s", name, policy, user.email)
            if policy == "follow":
                _queue_fetch(view, user)  # following again: move to where the ref is now, not at the next check
            return _decorated(view)

        return _with_etag(await _run(change), response)

    handler.__name__ = handler.__qualname__ = "freeze_library" if policy == "pinned" else "unfreeze_library"
    return handler


router.add_api_route(
    "/{name}/freeze", _set_policy("pinned"), methods=["POST"], response_model=LibraryView,
    summary="Pin a library at the commit it serves now",
)
router.add_api_route(
    "/{name}/unfreeze", _set_policy("follow"), methods=["POST"], response_model=LibraryView,
    summary="Let a library follow its ref again",
)


@router.post("/{name}/versions/{commit}/use", response_model=LibraryView, summary="Pin a library at an earlier version")
async def use_version(
    name: str, commit: str, request: Request, response: Response, user: AuthenticatedUser = Depends(require_admin)
) -> dict[str, Any]:
    """Go back (or forward) to a version the library has served: the way out of a bad upstream commit."""

    expected = _expected(request, name)

    def use() -> dict[str, Any]:
        if not any(version["commit"] == commit for version in store.versions(name)):
            raise Invalid("That is not a version this library has served")
        view = store.update(
            name, {"update_policy": "pinned", "pinned_commit": commit}, expected_version=expected, updated_by=user.email
        )
        logger.info("KiCad library %s pinned at %s by %s", name, commit, user.email)
        _queue_fetch(view, user, commit=commit)
        return _decorated(store.get(name))

    return _with_etag(await _run(use), response)


@router.delete("/{name}", status_code=204, response_model=None, summary="Remove a KiCad path library")
async def delete_library(
    name: str, request: Request, user: AuthenticatedUser = Depends(require_admin)
) -> Response:
    """Forget the library and stop serving it; its files go after a grace period. A path library's folder is left alone."""

    expected = _expected(request, name)

    def delete() -> None:
        view = store.delete(name, expected_version=expected)
        logger.info("KiCad library %s removed by %s", name, user.email)
        library = kicad_libraries.Library(name=name, variables=tuple(view["variables"]), git=view["git"], path=view["path"])
        kicad_library_fetch.request_removal(library, requested_by=user.email)

    await _run(delete)
    return Response(status_code=204)
