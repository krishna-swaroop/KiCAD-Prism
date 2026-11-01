"""Authenticated discovery of operator-installed extensions."""

from fastapi import APIRouter, Depends

from app.api._helpers import get_project_for_role_or_404
from app.core.security import AuthenticatedUser, require_viewer
from app.services.extensions import ExtensionManifest, extension_manifest

router = APIRouter()


@router.get("/extensions", response_model=ExtensionManifest)
def list_extensions(user: AuthenticatedUser = Depends(require_viewer)) -> ExtensionManifest:
    return extension_manifest()


@router.get("/projects/{project_id}/extensions", response_model=ExtensionManifest)
def list_project_extensions(
    project_id: str, user: AuthenticatedUser = Depends(require_viewer),
) -> ExtensionManifest:
    get_project_for_role_or_404(project_id, user.role)
    return extension_manifest()
