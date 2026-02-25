"""
Folders API for managing project organization.
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from app.services import folder_service

router = APIRouter()


class FolderCreate(BaseModel):
    """Request model for creating a folder."""
    name: str
    parent_id: Optional[str] = None


class FolderUpdate(BaseModel):
    """Request model for updating a folder."""
    name: Optional[str] = None
    parent_id: Optional[str] = None


class FolderResponse(BaseModel):
    """Response model for folder."""
    id: str
    name: str
    parent_id: Optional[str] = None
    created_at: str
    updated_at: str
    project_ids: List[str] = []
    child_folder_ids: List[str] = []


class FolderTreeItem(BaseModel):
    """Response model for folder tree item."""
    id: str
    name: str
    parent_id: Optional[str] = None
    depth: int = 0
    project_count: int = 0
    has_children: bool = False


class ProjectMoveRequest(BaseModel):
    """Request model for moving project to folder."""
    folder_id: Optional[str] = None  # None means move to root (no folder)


@router.get("/", response_model=List[FolderTreeItem])
async def list_folders():
    """
    Get all folders as a flattened tree structure.
    Returns folders sorted by depth and name.
    """
    return folder_service.get_folder_tree()


@router.get("/tree", response_model=List[FolderTreeItem])
async def get_folder_tree():
    """
    Get folder tree structure for UI navigation.
    Same as GET / but explicit endpoint for clarity.
    """
    return folder_service.get_folder_tree()


@router.get("/root", response_model=List[FolderResponse])
async def get_root_folders():
    """
    Get only root-level folders (folders without parent).
    """
    folders = folder_service.get_root_folders()
    return [FolderResponse(**f.dict()) for f in folders]


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str):
    """
    Get folder by ID with its contents.
    """
    folder = folder_service.get_folder_by_id(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse(**folder.dict())


@router.get("/{folder_id}/children", response_model=List[FolderResponse])
async def get_folder_children(folder_id: str):
    """
    Get direct child folders of a folder.
    """
    folder = folder_service.get_folder_by_id(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    children = folder_service.get_folder_children(folder_id)
    return [FolderResponse(**f.dict()) for f in children]


@router.get("/{folder_id}/projects", response_model=List[dict])
async def get_folder_projects(
    folder_id: str,
    include_subfolders: bool = True
):
    """
    Get all projects in a folder.
    
    Args:
        folder_id: Folder ID
        include_subfolders: If True, include projects from subfolders
    """
    folder = folder_service.get_folder_by_id(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    return folder_service.get_folder_projects(folder_id, include_subfolders)


@router.post("/", response_model=FolderResponse)
async def create_folder(request: FolderCreate):
    """
    Create a new folder.
    
    Args:
        name: Folder name
        parent_id: Optional parent folder ID for nested folders
    """
    try:
        folder = folder_service.create_folder(
            name=request.name,
            parent_id=request.parent_id
        )
        return FolderResponse(**folder.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: str, request: FolderUpdate):
    """
    Update folder properties.
    
    Args:
        folder_id: Folder ID to update
        name: New name (optional)
        parent_id: New parent ID for moving folder (optional)
    """
    try:
        folder = folder_service.update_folder(
            folder_id=folder_id,
            name=request.name,
            parent_id=request.parent_id
        )
        return FolderResponse(**folder.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    delete_projects: bool = False
):
    """
    Delete a folder.
    
    Args:
        folder_id: Folder ID to delete
        delete_projects: If True, also delete projects in folder.
                        If False, projects move to parent folder or root.
    
    Returns:
        Success message
    """
    try:
        success = folder_service.delete_folder(
            folder_id=folder_id,
            delete_projects=delete_projects
        )
        if not success:
            raise HTTPException(status_code=404, detail="Folder not found")
        return {"message": "Folder deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{folder_id}/projects/{project_id}")
async def add_project_to_folder(folder_id: str, project_id: str):
    """
    Add a project to a folder.
    Project is automatically removed from any previous folder.
    """
    try:
        folder = folder_service.add_project_to_folder(folder_id, project_id)
        return FolderResponse(**folder.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{folder_id}/projects/{project_id}")
async def remove_project_from_folder(folder_id: str, project_id: str):
    """
    Remove a project from a folder.
    Project becomes unassigned (root level).
    """
    try:
        folder = folder_service.remove_project_from_folder(folder_id, project_id)
        return FolderResponse(**folder.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/move")
async def move_project(project_id: str, request: ProjectMoveRequest):
    """
    Move a project to a folder or to root (no folder).
    
    Args:
        project_id: Project ID to move
        folder_id: Target folder ID, or None to move to root
    """
    result = folder_service.move_project_to_folder(
        project_id=project_id,
        folder_id=request.folder_id
    )
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result
