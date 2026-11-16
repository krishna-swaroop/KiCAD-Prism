"""Project properties routes of /api/projects (split out of projects.py by WP-S1)."""

import asyncio
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.api._blocking import run_bounded_io
from app.api._helpers import get_project_for_role_or_404
from app.api.projects import _load_project_readme_content
from app.api.projects_models import ProjectOverview
from app.core.security import AuthenticatedUser, require_viewer
from app.services import project_import_service, project_metadata_service, project_outputs, project_revision, project_service

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_viewer)])


class ProjectPropertiesTitleBlock(BaseModel):
    # KiCad's title block also carries rev, company and numbered comments.
    # Prism parsed all of them and rendered none; narrowed to what the
    # properties panel displays.
    title: str = ""
    date: str = ""


class ProjectPropertiesSchematicFile(BaseModel):
    path: str
    filename: str
    version: Optional[int] = None
    generator: Optional[str] = None
    generator_version: Optional[str] = None
    title_block: Optional[ProjectPropertiesTitleBlock] = None


class ProjectPropertiesPcbFile(BaseModel):
    path: str
    filename: str
    version: Optional[int] = None
    generator: Optional[str] = None
    generator_version: Optional[str] = None
    dimensions_mm: Optional[Dict[str, float]] = None
    thickness_mm: Optional[float] = None
    title_block: Optional[ProjectPropertiesTitleBlock] = None


class ProjectPropertiesLatestCommit(BaseModel):
    hash: str
    full_hash: str
    author: str
    email: str
    date: str
    message: str


class ProjectPropertiesTag(BaseModel):
    tag: str
    commit_hash: str
    date: str
    message: str


class ProjectPropertiesRepository(BaseModel):
    latest_commit: Optional[ProjectPropertiesLatestCommit] = None
    latest_tag: Optional[ProjectPropertiesTag] = None


class ProjectPropertiesFiles(BaseModel):
    schematic: Optional[ProjectPropertiesSchematicFile] = None
    pcb: Optional[ProjectPropertiesPcbFile] = None


class ProjectPropertiesResponse(BaseModel):
    project: project_service.Project
    repository: ProjectPropertiesRepository
    files: ProjectPropertiesFiles


@router.get("/{project_id}/properties", response_model=ProjectPropertiesResponse)
async def get_project_properties(
    project_id: str,
    response: Response,
    user: AuthenticatedUser = Depends(require_viewer),
):
    project = get_project_for_role_or_404(project_id, user.role)
    payload, headers = await asyncio.to_thread(_build_project_properties, project, user.email)
    for name, value in headers.items():
        response.headers[name] = value
    return payload


def _stored_repository(
    project: project_service.Project,
) -> Optional[dict]:
    """The card's repository facts, refreshing the stored row out of band.

    The facts change only when the repository changes, so the import and sync
    jobs store them and this reads the row. A project imported before the table
    existed, or one whose repository moved without a sync, has its refresh
    queued here and returns what is stored meanwhile. The design half of the
    card now comes from the bundle (``card_from_bundle``), not from this row.
    """
    anchor = project_service.project_anchor(project)
    repo_path, _relative_path = project_outputs.repo_context(project)

    record, current = project_metadata_service.stored_metadata_is_current(
        project.id, project.path, anchor, repo_path,
        revision_ref=project_revision.default_ref(project),
    )
    if not current:
        try:
            project_import_service.start_project_metadata_job(
                project.id, requested_by="project-properties"
            )
        except Exception as error:
            # The queue being unavailable must not take the panel down with it;
            # the card simply keeps whatever was last stored.
            logger.warning(
                "Could not queue metadata refresh for %s: %s", project.id, error
            )

    if not record:
        return None
    return record.get("repository")


def _build_project_properties(
    project: project_service.Project, requested_by: str = ""
) -> tuple[ProjectPropertiesResponse, dict[str, str]]:
    card, headers = project_metadata_service.card_from_bundle(
        str(project.id), requested_by=requested_by
    )
    schematic_metadata, pcb_metadata = card.get("schematic"), card.get("pcb")
    repository = _stored_repository(project) or {}
    latest_commit = repository.get("latest_commit")
    latest_tag = repository.get("latest_tag")

    payload = ProjectPropertiesResponse(
        project=project,
        repository=ProjectPropertiesRepository(
            latest_commit=(
                ProjectPropertiesLatestCommit(**latest_commit)
                if latest_commit
                else None
            ),
            latest_tag=(
                ProjectPropertiesTag(**latest_tag)
                if latest_tag
                else None
            ),
        ),
        files=ProjectPropertiesFiles(
            schematic=(
                ProjectPropertiesSchematicFile(**schematic_metadata)
                if schematic_metadata
                else None
            ),
            pcb=(
                ProjectPropertiesPcbFile(**pcb_metadata)
                if pcb_metadata
                else None
            ),
        ),
    )
    return payload, headers


@router.get("/{project_id}/overview", response_model=ProjectOverview, summary="Project details and README in one payload")
async def get_project_overview(
    project_id: str,
    commit: str = None,
    user: AuthenticatedUser = Depends(require_viewer),
):
    """
    Return project detail and README content in one payload for the overview page.
    """
    project = get_project_for_role_or_404(project_id, user.role)
    readme = await run_bounded_io(_load_project_readme_content, project, commit)
    return {
        "project": project.model_dump(),
        "readme": readme,
    }
