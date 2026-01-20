import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from typing import List, Optional
from app.services import project_service, file_service
from app.services.git_service import get_releases, get_commits_list, get_file_from_commit, file_exists_in_commit, sync_with_remote

router = APIRouter()

from pydantic import BaseModel

@router.get("/", response_model=List[project_service.Project])
async def list_projects():
    return project_service.get_registered_projects()

class ImportRequest(BaseModel):
    url: str

@router.post("/import")
async def import_project(request: ImportRequest):
    """
    Start an async project import job.
    """
    try:
        job_id = project_service.start_import_job(request.url)
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/import/{job_id}")
async def get_import_status(job_id: str):
    """
    Deprecated: Use /jobs/{job_id} instead.
    """
    status = project_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """
    Get the status of any background job (import or workflow).
    """
    status = project_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

class WorkflowRequest(BaseModel):
    type: str # design, manufacturing, render
    author: Optional[str] = "anonymous"

@router.post("/{project_id}/workflows")
async def trigger_workflow(project_id: str, request: WorkflowRequest):
    """
    Trigger a KiCAD workflow (jobset output).
    """
    valid_types = ["design", "manufacturing", "render"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid workflow type")
        
    try:
        job_id = project_service.start_workflow_job(project_id, request.type, request.author)
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/thumbnail")
async def get_project_thumbnail(project_id: str):
    path = project_service.get_project_thumbnail_path(project_id)
    if not path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path)

@router.get("/{project_id}", response_model=project_service.Project)
async def get_project_detail(project_id: str):
    """Get detailed project information."""
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/{project_id}/files", response_model=List[file_service.FileItem])
async def get_project_files(project_id: str, type: str = "design"):
    """
    List files in Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        type: 'design' or 'manufacturing'
    """
    if type not in ["design", "manufacturing"]:
        raise HTTPException(status_code=400, detail="Type must be 'design' or 'manufacturing'")
    
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return file_service.get_project_files(project.path, type)

@router.get("/{project_id}/download")
async def download_file(project_id: str, path: str, type: str = "design", inline: bool = False):
    """
    Download a specific file from Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        path: Relative path to file within output folder
        type: 'design' or 'manufacturing'
        inline: If True, serve as inline content (view in browser)
    """
    if type not in ["design", "manufacturing"]:
        raise HTTPException(status_code=400, detail="Type must be 'design' or 'manufacturing'")
    
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    folder_name = "Design-Outputs" if type == "design" else "Manufacturing-Outputs"
    file_path = os.path.join(project.path, folder_name, path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(os.path.join(project.path, folder_name))):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    if os.path.isdir(file_path):
        raise HTTPException(status_code=400, detail="Cannot download directory")
    
    disposition = "inline" if inline else "attachment"
    return FileResponse(file_path, filename=os.path.basename(file_path), content_disposition_type=disposition)

@router.get("/{project_id}/readme")
async def get_project_readme(project_id: str, commit: str = None):
    """
    Get README.md content from project root.
    If commit is provided, fetch from that commit; otherwise use working directory.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # If viewing a specific commit, use Git
    if commit:
        try:
            content = get_file_from_commit(project.path, commit, "README.md")
            return {"content": content}
        except HTTPException:
            raise
    
    # Otherwise read from filesystem
    readme_path = os.path.join(project.path, "README.md")
    
    if not os.path.exists(readme_path):
        raise HTTPException(status_code=404, detail="README.md not found")
    
    try:
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading README: {str(e)}")

@router.get("/{project_id}/asset/{asset_path:path}")
async def get_project_asset(project_id: str, asset_path: str):
    """
    Serve assets (images, etc.) from project directory.
    Typically used for README image references.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Resolve asset path (typically relative to project root)
    file_path = os.path.join(project.path, asset_path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(project.path)):
        raise HTTPException(status_code=400, detail="Invalid asset path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Asset not found")
    
    if os.path.isdir(file_path):
        raise HTTPException(status_code=400, detail="Cannot serve directory")
    
    return FileResponse(file_path)

@router.get("/{project_id}/docs")
async def get_docs_files(project_id: str):
    """
    List all files in the docs/ folder.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    docs_dir = os.path.join(project.path, "docs")
    
    return file_service.get_files_recursive(docs_dir)

@router.get("/{project_id}/docs/content")
async def get_doc_file_content(project_id: str, path: str, commit: str = None):
    """
    Get markdown file content from docs/ folder.
    If commit is provided, fetch from that commit; otherwise use working directory.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # If viewing a specific commit, use Git
    if commit:
        try:
            file_path = f"docs/{path}"
            content = get_file_from_commit(project.path, commit, file_path)
            return {"content": content, "path": path}
        except HTTPException:
            raise
    
    # Otherwise read from filesystem
    docs_dir = os.path.join(project.path, "docs")
    file_path = os.path.join(docs_dir, path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(docs_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")

@router.get("/{project_id}/releases")
async def get_project_releases(project_id: str):
    """
    Get list of Git releases/tags for a project.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    releases = get_releases(project.path)
    return {"releases": releases}

@router.get("/{project_id}/commits")
async def get_project_commits(project_id: str, limit: int = 50):
    """
    Get list of commits for a project.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    commits = get_commits_list(project.path, limit)
    return {"commits": commits}


@router.post("/{project_id}/sync")
async def sync_project(project_id: str):
    """
    Sync project repository with remote.
    
    Performs a git fetch and hard reset to match the remote branch state.
    This will discard any local changes not pushed to remote.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = sync_with_remote(project.path)
    return result


@router.get("/{project_id}/schematic")
async def get_project_schematic(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_schematic_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="Schematic not found")
    return FileResponse(path)

@router.get("/{project_id}/schematic/subsheets")
async def get_project_subsheets(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    main_path = project_service.find_schematic_file(project.path)
    if not main_path:
        raise HTTPException(status_code=404, detail="Schematic not found")
        
    subsheets = project_service.get_subsheets(project.path, main_path)
    # Convert filenames to URLs
    subsheet_urls = [{"name": s, "url": f"/api/projects/{project_id}/asset/{s}"} for s in subsheets]
    return {"files": subsheet_urls}

@router.get("/{project_id}/pcb")
async def get_project_pcb(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_pcb_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="PCB not found")
    return FileResponse(path)

@router.get("/{project_id}/3d-model")
async def get_project_3d_model(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_3d_model(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="3D model not found")
    return FileResponse(path)

@router.get("/{project_id}/ibom")
async def get_project_ibom(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_ibom_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="iBoM not found")
    return FileResponse(path)
