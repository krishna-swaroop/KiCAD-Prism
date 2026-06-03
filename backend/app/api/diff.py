"""
Diff API Routes
"""

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_viewer
from app.services import bom_service, pcb_diff_service, sch_diff_service

router = APIRouter(dependencies=[Depends(require_viewer)])


def _resolve_parent_commit(project_id: str, commit1: str) -> str:
    """Resolve the parent commit hash (blocking — run in a thread)."""
    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        from git import Repo

        repo_root = sch_diff_service._git_root(Path(row["path"]))
        repo = Repo(str(repo_root))
        commit_obj = repo.commit(commit1)
        if not commit_obj.parents:
            raise HTTPException(
                status_code=400, detail="Commit has no parent to diff against"
            )
        return commit_obj.parents[0].hexsha
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e


def _resolve_head_commit(project_id: str) -> str:
    """Resolve HEAD commit hash (blocking — run in a thread)."""
    from app.services.workspace_service import workspace

    row = workspace.get_project_by_id(project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        from git import Repo

        repo_root = sch_diff_service._git_root(Path(row["path"]))
        repo = Repo(str(repo_root))
        return repo.head.commit.hexsha
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}") from e


@router.get("/{project_id}/schematic-diff")
async def get_schematic_diff(
    project_id: str,
    commit1: str,
    commit2: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return interactive schematic diff data between two commits.
    If commit2 is omitted, diffs commit1 against its parent.
    Includes both file contents (for ecad-viewer) and a structured change list.
    """
    get_project_for_role_or_404(project_id, user.role)

    if commit2 is None:
        commit2 = await asyncio.to_thread(_resolve_parent_commit, project_id, commit1)

    result = await asyncio.to_thread(
        sch_diff_service.get_schematic_diff, project_id, commit1, commit2
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail="Schematic not found for this project/commits"
        )
    return result


@router.get("/{project_id}/pcb-diff")
async def get_pcb_diff(
    project_id: str,
    commit1: str,
    commit2: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return interactive PCB diff data between two commits.
    If commit2 is omitted, diffs commit1 against its parent.
    """
    get_project_for_role_or_404(project_id, user.role)

    if commit2 is None:
        commit2 = await asyncio.to_thread(_resolve_parent_commit, project_id, commit1)

    result = await asyncio.to_thread(
        pcb_diff_service.get_pcb_diff, project_id, commit1, commit2
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail="PCB not found for this project/commits"
        )
    return result


@router.get("/{project_id}/bom-diff")
async def get_bom_diff(
    project_id: str,
    commit1: str = None,
    commit2: str = None,
    single: bool = False,
    snapshot: bool = False,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return BOM diff between two commits.
    - If commit2 is omitted, diffs commit1 against its parent.
    - Pass ?single=1 to suppress unchanged rows (single-commit history view).
    - Pass ?snapshot=1 (no commit1/commit2 required) for a plain BOM at HEAD with
      no diff highlighting — all parts are returned as 'unchanged'.
    """
    get_project_for_role_or_404(project_id, user.role)

    if snapshot:
        head = await asyncio.to_thread(_resolve_head_commit, project_id)
        commit1 = head
        commit2 = head
    elif commit1 is None:
        raise HTTPException(
            status_code=422, detail="commit1 is required unless snapshot=1"
        )
    elif commit2 is None:
        commit2 = await asyncio.to_thread(_resolve_parent_commit, project_id, commit1)

    result = await asyncio.to_thread(
        bom_service.get_bom_diff_response, project_id, commit1, commit2, True
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail="No schematic found for this project/commits"
        )
    if single and not snapshot:
        result["rows"] = [r for r in result["rows"] if r["kind"] != "unchanged"]
    return result
