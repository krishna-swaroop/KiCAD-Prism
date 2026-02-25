"""
Folder Service for managing project folders and organization.
Supports nested folders, project assignment, and folder hierarchy.
"""
import os
import json
import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel
from pathlib import Path


class Folder(BaseModel):
    """Folder model with support for nested structure."""
    id: str
    name: str
    parent_id: Optional[str] = None  # Parent folder ID for nesting
    created_at: str
    updated_at: str
    project_ids: List[str] = []  # Projects directly in this folder
    child_folder_ids: List[str] = []  # Child folders


class FolderTreeItem(BaseModel):
    """Flattened folder structure for UI."""
    id: str
    name: str
    parent_id: Optional[str] = None
    depth: int = 0
    project_count: int = 0  # Total projects in this folder and subfolders
    has_children: bool = False


# Folders storage file
FOLDERS_FILE = os.path.join(
    os.path.dirname(__file__), 
    "../../../data/projects/.folders.json"
)

# Ensure data directory exists
os.makedirs(os.path.dirname(FOLDERS_FILE), exist_ok=True)


def _load_folders() -> Dict[str, Folder]:
    """Load folders from JSON file."""
    if os.path.exists(FOLDERS_FILE):
        try:
            with open(FOLDERS_FILE, 'r') as f:
                data = json.load(f)
                return {k: Folder(**v) for k, v in data.items()}
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Failed to load folders: {e}")
    return {}


def _save_folders(folders: Dict[str, Folder]) -> None:
    """Save folders to JSON file."""
    try:
        with open(FOLDERS_FILE, 'w') as f:
            data = {k: v.dict() for k, v in folders.items()}
            json.dump(data, f, indent=2)
    except IOError as e:
        print(f"Error: Failed to save folders: {e}")


def get_all_folders() -> List[Folder]:
    """Get all folders."""
    folders = _load_folders()
    return list(folders.values())


def get_folder_tree() -> List[FolderTreeItem]:
    """
    Get flattened folder tree with depth and project counts.
    Returns root folders first, then children.
    """
    folders = _load_folders()
    projects_registry = _load_project_registry()
    
    def count_projects_in_folder(folder_id: str, visited: set = None) -> int:
        """Count all projects in folder and its subfolders."""
        if visited is None:
            visited = set()
        if folder_id in visited:
            return 0
        visited.add(folder_id)
        
        folder = folders.get(folder_id)
        if not folder:
            return 0
        
        count = len(folder.project_ids)
        for child_id in folder.child_folder_ids:
            count += count_projects_in_folder(child_id, visited)
        return count
    
    def get_depth(folder_id: str, depth: int = 0) -> int:
        """Get folder depth in hierarchy."""
        folder = folders.get(folder_id)
        if not folder or not folder.parent_id:
            return depth
        return get_depth(folder.parent_id, depth + 1)
    
    tree_items = []
    for folder in folders.values():
        project_count = count_projects_in_folder(folder.id)
        depth = get_depth(folder.id)
        
        tree_items.append(FolderTreeItem(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            depth=depth,
            project_count=project_count,
            has_children=len(folder.child_folder_ids) > 0
        ))
    
    # Sort by depth first, then by name
    tree_items.sort(key=lambda x: (x.depth, x.name.lower()))
    return tree_items


def get_folder_by_id(folder_id: str) -> Optional[Folder]:
    """Get folder by ID."""
    folders = _load_folders()
    return folders.get(folder_id)


def create_folder(name: str, parent_id: Optional[str] = None) -> Folder:
    """
    Create a new folder.
    
    Args:
        name: Folder name
        parent_id: Optional parent folder ID for nested folders
    
    Returns:
        Created folder
    
    Raises:
        ValueError: If parent folder doesn't exist or name is empty
    """
    if not name or not name.strip():
        raise ValueError("Folder name cannot be empty")
    
    folders = _load_folders()
    
    # Validate parent exists if provided
    if parent_id and parent_id not in folders:
        raise ValueError(f"Parent folder '{parent_id}' not found")
    
    # Check for duplicate name in same parent
    for folder in folders.values():
        if folder.name.lower() == name.strip().lower() and folder.parent_id == parent_id:
            raise ValueError(f"Folder with name '{name}' already exists in this location")
    
    # Generate unique ID
    folder_id = f"folder_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    while folder_id in folders:
        folder_id = f"folder_{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}_{len(folder_id)}"
    
    now = datetime.datetime.now().isoformat()
    folder = Folder(
        id=folder_id,
        name=name.strip(),
        parent_id=parent_id,
        created_at=now,
        updated_at=now,
        project_ids=[],
        child_folder_ids=[]
    )
    
    # Add to parent's child_folder_ids if parent exists
    if parent_id:
        parent = folders[parent_id]
        parent.child_folder_ids.append(folder_id)
        parent.updated_at = now
    
    folders[folder_id] = folder
    _save_folders(folders)
    
    return folder


def update_folder(folder_id: str, name: Optional[str] = None, parent_id: Optional[str] = None) -> Folder:
    """
    Update folder properties.
    
    Args:
        folder_id: Folder ID to update
        name: New name (optional)
        parent_id: New parent ID for moving folder (optional)
    
    Returns:
        Updated folder
    
    Raises:
        ValueError: If folder not found or invalid parent
    """
    folders = _load_folders()
    
    if folder_id not in folders:
        raise ValueError(f"Folder '{folder_id}' not found")
    
    folder = folders[folder_id]
    
    # Update name
    if name:
        if not name.strip():
            raise ValueError("Folder name cannot be empty")
        
        # Check for duplicate name in same parent
        for f in folders.values():
            if f.id != folder_id and f.name.lower() == name.strip().lower() and f.parent_id == folder.parent_id:
                raise ValueError(f"Folder with name '{name}' already exists in this location")
        
        folder.name = name.strip()
    
    # Update parent (move folder)
    if parent_id is not None and parent_id != folder.parent_id:
        # Validate new parent exists
        if parent_id and parent_id not in folders:
            raise ValueError(f"Parent folder '{parent_id}' not found")
        
        # Prevent moving folder into itself or its descendants
        if parent_id and _is_descendant(folder_id, parent_id, folders):
            raise ValueError("Cannot move folder into itself or its descendants")
        
        # Remove from old parent's child_folder_ids
        if folder.parent_id and folder.parent_id in folders:
            old_parent = folders[folder.parent_id]
            if folder_id in old_parent.child_folder_ids:
                old_parent.child_folder_ids.remove(folder_id)
                old_parent.updated_at = datetime.datetime.now().isoformat()
        
        # Add to new parent's child_folder_ids
        if parent_id:
            new_parent = folders[parent_id]
            new_parent.child_folder_ids.append(folder_id)
            new_parent.updated_at = datetime.datetime.now().isoformat()
        
        folder.parent_id = parent_id
    
    folder.updated_at = datetime.datetime.now().isoformat()
    folders[folder_id] = folder
    _save_folders(folders)
    
    return folder


def delete_folder(folder_id: str, delete_projects: bool = False) -> bool:
    """
    Delete a folder and optionally its contents.
    
    Args:
        folder_id: Folder ID to delete
        delete_projects: If True, also delete projects in folder
                        If False, move projects to parent folder or root
    
    Returns:
        True if deleted, False if folder not found
    
    Raises:
        ValueError: If folder has child folders
    """
    folders = _load_folders()
    
    if folder_id not in folders:
        return False
    
    folder = folders[folder_id]
    
    # Cannot delete folder with children
    if folder.child_folder_ids:
        raise ValueError("Cannot delete folder with subfolders. Please move or delete subfolders first.")
    
    # Handle projects in folder
    if folder.project_ids:
        if delete_projects:
            # Delete all projects in folder
            from app.services import project_service
            for project_id in folder.project_ids:
                project_service.delete_project(project_id)
        else:
            # Move projects to parent folder or root
            if folder.parent_id and folder.parent_id in folders:
                parent = folders[folder.parent_id]
                parent.project_ids.extend(folder.project_ids)
                parent.updated_at = datetime.datetime.now().isoformat()
            # If no parent, projects become root-level (not in any folder)
    
    # Remove from parent's child_folder_ids
    if folder.parent_id and folder.parent_id in folders:
        parent = folders[folder.parent_id]
        if folder_id in parent.child_folder_ids:
            parent.child_folder_ids.remove(folder_id)
            parent.updated_at = datetime.datetime.now().isoformat()
    
    # Delete folder
    del folders[folder_id]
    _save_folders(folders)
    
    return True


def add_project_to_folder(folder_id: str, project_id: str) -> Folder:
    """
    Add a project to a folder.
    
    Args:
        folder_id: Folder ID
        project_id: Project ID to add
    
    Returns:
        Updated folder
    
    Raises:
        ValueError: If folder or project not found
    """
    folders = _load_folders()
    
    if folder_id not in folders:
        raise ValueError(f"Folder '{folder_id}' not found")
    
    # Verify project exists
    from app.services import project_service
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise ValueError(f"Project '{project_id}' not found")
    
    folder = folders[folder_id]
    
    # Remove project from any other folder
    for f in folders.values():
        if project_id in f.project_ids:
            f.project_ids.remove(project_id)
            f.updated_at = datetime.datetime.now().isoformat()
    
    # Add to this folder
    if project_id not in folder.project_ids:
        folder.project_ids.append(project_id)
        folder.updated_at = datetime.datetime.now().isoformat()
        folders[folder_id] = folder
        _save_folders(folders)
    
    return folder


def remove_project_from_folder(folder_id: str, project_id: str) -> Folder:
    """
    Remove a project from a folder.
    
    Args:
        folder_id: Folder ID
        project_id: Project ID to remove
    
    Returns:
        Updated folder
    """
    folders = _load_folders()
    
    if folder_id not in folders:
        raise ValueError(f"Folder '{folder_id}' not found")
    
    folder = folders[folder_id]
    
    if project_id in folder.project_ids:
        folder.project_ids.remove(project_id)
        folder.updated_at = datetime.datetime.now().isoformat()
        folders[folder_id] = folder
        _save_folders(folders)
    
    return folder


def get_projects_in_folder(folder_id: str, include_subfolders: bool = True) -> List[str]:
    """
    Get all project IDs in a folder.
    
    Args:
        folder_id: Folder ID
        include_subfolders: If True, include projects from subfolders
    
    Returns:
        List of project IDs
    """
    folders = _load_folders()
    
    if folder_id not in folders:
        return []
    
    folder = folders[folder_id]
    project_ids = list(folder.project_ids)
    
    if include_subfolders:
        for child_id in folder.child_folder_ids:
            project_ids.extend(get_projects_in_folder(child_id, include_subfolders=True))
    
    return project_ids


def get_folder_projects(folder_id: str, include_subfolders: bool = True) -> List[dict]:
    """
    Get full project objects in a folder.
    
    Args:
        folder_id: Folder ID
        include_subfolders: If True, include projects from subfolders
    
    Returns:
        List of project dictionaries
    """
    from app.services import project_service
    
    project_ids = get_projects_in_folder(folder_id, include_subfolders)
    all_projects = project_service.get_registered_projects()
    
    return [p.dict() for p in all_projects if p.id in project_ids]


def _is_descendant(potential_ancestor_id: str, potential_descendant_id: str, folders: Dict[str, Folder]) -> bool:
    """
    Check if potential_ancestor_id is a descendant of potential_descendant_id.
    Used to prevent circular references when moving folders.
    """
    def get_all_descendants(folder_id: str) -> set:
        folder = folders.get(folder_id)
        if not folder:
            return set()
        
        descendants = set(folder.child_folder_ids)
        for child_id in folder.child_folder_ids:
            descendants.update(get_all_descendants(child_id))
        return descendants
    
    descendants = get_all_descendants(potential_descendant_id)
    return potential_ancestor_id in descendants


def _load_project_registry() -> Dict[str, dict]:
    """Load project registry (helper function)."""
    registry_file = os.path.join(
        os.path.dirname(__file__),
        "../../../data/projects/.project_registry.json"
    )
    if os.path.exists(registry_file):
        try:
            with open(registry_file, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}


def get_root_folders() -> List[Folder]:
    """Get only root-level folders (no parent)."""
    folders = _load_folders()
    return [f for f in folders.values() if not f.parent_id]


def get_folder_children(folder_id: str) -> List[Folder]:
    """Get direct child folders of a folder."""
    folders = _load_folders()
    folder = folders.get(folder_id)
    if not folder:
        return []
    
    return [f for f in folders.values() if f.id in folder.child_folder_ids]


def move_project_to_folder(project_id: str, folder_id: Optional[str]) -> dict:
    """
    Move a project to a folder or to root (no folder).

    Args:
        project_id: Project ID to move
        folder_id: Target folder ID, or None to move to root

    Returns:
        Status dictionary
    """
    from app.services import project_service

    # Verify project exists
    project = project_service.get_project_by_id(project_id)
    if not project:
        return {"status": "error", "message": "Project not found"}

    folders = _load_folders()

    # Remove from current folder
    for folder in folders.values():
        if project_id in folder.project_ids:
            folder.project_ids.remove(project_id)
            folder.updated_at = datetime.datetime.now().isoformat()

    # Add to new folder if specified
    if folder_id:
        if folder_id not in folders:
            return {"status": "error", "message": "Folder not found"}

        folders[folder_id].project_ids.append(project_id)
        folders[folder_id].updated_at = datetime.datetime.now().isoformat()

    _save_folders(folders)
    
    # CRITICAL: Update project's folder_id in registry
    project_service.update_project_folder_id(project_id, folder_id)
    
    return {"status": "success", "message": "Project moved successfully"}
