"""Notes on a project's BOM lines. Anyone who reads supply data and can open the project may read and write them."""

from __future__ import annotations

from functools import partial
from typing import Any

from fastapi import APIRouter, Depends, Response

from app.api import supply_connectors
from app.api._helpers import get_project_for_role_or_404
from app.api.supply_bom_models import CommentIn, SupplyBomComment
from app.api.supply_call import run_supply
from app.api.supply_models import Items
from app.core.security import AuthenticatedUser, require_supply_commenter, require_supply_reader
from app.services.supply import bom_comments

router = APIRouter(prefix="/api/supply/projects", tags=["supply"])
_run = partial(run_supply, invalid="invalid_comment")


def _store():
    return supply_connectors.service.store


@router.get("/{project_id}/bom-comments", response_model=Items[SupplyBomComment])
async def list_comments(project_id: str, user: AuthenticatedUser = Depends(require_supply_reader)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def read() -> dict[str, Any]:
        with _store().connection() as conn:
            return {"items": bom_comments.for_project(conn, project_id)}

    return await _run(read)


@router.post("/{project_id}/bom-comments", status_code=201, response_model=SupplyBomComment)
async def add_comment(project_id: str, body: CommentIn, user: AuthenticatedUser = Depends(require_supply_commenter)) -> dict[str, Any]:
    get_project_for_role_or_404(project_id, user.role)

    def run() -> dict[str, Any]:
        with _store().connection() as conn:
            return bom_comments.add(conn, project_id, body.line_key, body.body, user.email, user.name or "")

    return await _run(run)


@router.delete("/{project_id}/bom-comments/{comment_id}", status_code=204)
async def remove_comment(project_id: str, comment_id: str, user: AuthenticatedUser = Depends(require_supply_commenter)) -> Response:
    get_project_for_role_or_404(project_id, user.role)

    def run() -> None:
        with _store().connection() as conn:
            bom_comments.remove(conn, project_id, comment_id, user.email, admin=user.role == "admin")

    await _run(run)
    return Response(status_code=204)
