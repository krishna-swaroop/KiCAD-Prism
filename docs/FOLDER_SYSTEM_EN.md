# Folder System for Project Organization

## Overview

A folder system has been implemented for organizing projects in KiCAD Prism, inspired by Altium 365 functionality. This feature allows users to group projects into folders and subfolders for better workspace organization.

---

## Features

### ✅ Implemented Features

1. **Create Folders and Subfolders**
   - Create root folders (without parent)
   - Create nested subfolders (unlimited depth)
   - Dialog with parent folder selection

2. **Move Projects**
   - Move projects between folders via context menu
   - Move projects to root (no folder)
   - Automatic removal from previous folder

3. **Folder Display**
   - Tree structure in sidebar
   - Project count in each folder (including subfolders)
   - Current folder highlighting
   - Expand/collapse folders

4. **Navigation**
   - Click folder → display projects inside
   - "Back to All" button to return to all projects
   - "All Projects" section in sidebar

5. **Folder Management**
   - Rename folders
   - Delete folders (projects move to parent or root)
   - Context menu for quick actions

---

## Architecture

### Backend (Python/FastAPI)

#### New Files:

**`backend/app/services/folder_service.py`**
- `Folder` model with hierarchy support
- CRUD operations for folders
- Project management in folders
- Project counting with subfolders
- Circular reference prevention

**`backend/app/api/folders.py`**
- REST API endpoints for folders
- Request validation via Pydantic
- Error handling

#### Updated Files:

**`backend/app/services/project_service.py`**
- Added `folder_id` field to `Project` model
- Updated `register_project` function to save `folder_id`
- Updated project loading functions

**`backend/app/main.py`**
- Registered new `/api/folders` router

---

### Frontend (React/TypeScript)

#### New Components:

**`src/components/folder-tree.tsx`**
- Tree view of folders
- Expand/collapse functionality
- Selected folder highlighting
- Project counts

**`src/components/folder-view.tsx`**
- Display projects in folder
- Empty state (no projects)
- Folder information header

**`src/components/folder-dialog.tsx`**
- Create/rename folder dialog
- Parent folder selection
- Name validation

**`src/components/move-project-menu.tsx`**
- Context menu for moving projects
- Tree structure of folders
- Current folder indication

**`src/components/folder-context-menu.tsx`**
- Context menu for folders
- Quick actions (rename, delete, create subfolder)

**`src/components/folder-card.tsx`**
- Card view for folders in main content
- Beautiful gradient background
- Project and subfolder counts

#### Updated Components:

**`src/components/workspace.tsx`**
- Integration of all new components
- Folder state management
- API calls for folder operations

**`src/components/project-card.tsx`**
- Added `renderActions` prop for custom actions
- Project move context menu

**`src/types/project.ts`**
- Added `Folder` interface
- Added `FolderTreeItem` interface
- Updated `Project` interface with `folder_id` field

---

## API Endpoints

### Folders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/folders/` | Get all folders (flat list) |
| `GET` | `/api/folders/tree` | Get folder tree |
| `GET` | `/api/folders/root` | Get only root folders |
| `GET` | `/api/folders/{folder_id}` | Get folder by ID |
| `GET` | `/api/folders/{folder_id}/children` | Get child folders |
| `GET` | `/api/folders/{folder_id}/projects` | Get projects in folder |
| `POST` | `/api/folders/` | Create new folder |
| `PUT` | `/api/folders/{folder_id}` | Update folder |
| `DELETE` | `/api/folders/{folder_id}` | Delete folder |

### Projects in Folders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/folders/{folder_id}/projects/{project_id}` | Add project to folder |
| `DELETE` | `/api/folders/{folder_id}/projects/{project_id}` | Remove project from folder |
| `POST` | `/api/folders/projects/{project_id}/move` | Move project |

---

## Data Structure

### Folder Model

```json
{
  "id": "folder_20260225120000000000",
  "name": "My Folder",
  "parent_id": null,
  "created_at": "2026-02-25T12:00:00",
  "updated_at": "2026-02-25T12:00:00",
  "project_ids": ["proj1", "proj2"],
  "child_folder_ids": ["folder_2", "folder_3"]
}
```

### FolderTreeItem Model

```json
{
  "id": "folder_1",
  "name": "My Folder",
  "parent_id": null,
  "depth": 0,
  "project_count": 5,
  "has_children": true
}
```

### Updated Project Model

```json
{
  "id": "proj1",
  "name": "My Project",
  "folder_id": "folder_1",
  ...
}
```

---

## Data Storage

Folders are stored in:
```
data/projects/.folders.json
```

Example content:
```json
{
  "folder_1": {
    "id": "folder_1",
    "name": "Hardware Projects",
    "parent_id": null,
    "created_at": "2026-02-25T12:00:00",
    "updated_at": "2026-02-25T12:00:00",
    "project_ids": ["proj1", "proj2"],
    "child_folder_ids": ["folder_2"]
  },
  "folder_2": {
    "id": "folder_2",
    "name": "Power Supplies",
    "parent_id": "folder_1",
    "created_at": "2026-02-25T12:05:00",
    "updated_at": "2026-02-25T12:05:00",
    "project_ids": ["proj3"],
    "child_folder_ids": []
  }
}
```

---

## Usage

### Create a Folder

1. Click the `+` button next to "Folders" header in sidebar
2. Enter folder name
3. (Optional) Select parent folder to create subfolder
4. Click "Create Folder"

### Move Project to Folder

1. Find the project in the list
2. Click the `⋮` (three dots) icon on the project card
3. Select target folder from menu
4. Project will be moved

### Rename Folder

*Planned:* Folder context menu → "Rename"

### Delete Folder

*Planned:* Folder context menu → "Delete"
- Projects will be moved to parent folder or root
- Subfolders must be deleted first

---

## Visual Structure

```
┌────────────────────────────────────────────────────────────┐
│ Sidebar              │      Main Content                  │
│───────────────────── │                                    │
│ Folders       [+]    │  ┌──────────────────────────────┐  │
│ ▼ Hardware Projects  │  │  Hardware Projects           │  │
│   ▼ Power Supplies   │  │  3 projects in this folder   │  │
│   • MCU Boards       │  │                              │  │
│   └─ All Projects    │  │  ┌─────────┐ ┌─────────┐    │  │
│                      │  │  │ Project │ │ Project │    │  │
│                      │  │  │   1     │ │   2     │    │  │
│                      │  │  └─────────┘ └─────────┘    │  │
│                      │  └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## Security

### Validation

- Check for empty names
- Check for duplicate names in same folder
- Prevent circular references (folder cannot be its own parent)
- Check parent folder existence

### Limitations

- Minimum name length: 2 characters
- Maximum nesting depth: unlimited
- Projects can only be in one folder at a time

---

## Future Improvements

### Planned Features:

1. **Drag & Drop**
   - Move projects by dragging
   - Move folders in tree

2. **Bulk Operations**
   - Select multiple projects
   - Bulk move to folder

3. **Favorite Folders**
   - Pin important folders to top
   - Quick access

4. **Color Coding**
   - Assign colors to folders
   - Visual categorization

5. **Folder Search**
   - Filter projects by folders
   - Search within specific folder

6. **Export/Import Structure**
   - Save folder structure
   - Restore from backup

7. **Public/Private Folders**
   - Share folders with team
   - Read/write permissions

---

## Testing

### Functionality Testing:

1. **Create Folder**
   ```bash
   curl -X POST http://localhost:8000/api/folders/ \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Folder", "parent_id": null}'
   ```

2. **Get All Folders**
   ```bash
   curl http://localhost:8000/api/folders/
   ```

3. **Move Project**
   ```bash
   curl -X POST http://localhost:8000/api/folders/projects/proj123/move \
     -H "Content-Type: application/json" \
     -d '{"folder_id": "folder_456"}'
   ```

### UI Testing:

1. Open `http://localhost`
2. Create several folders
3. Move projects between folders
4. Check project counts
5. Test expand/collapse

---

## Known Issues

1. **Folder context menu** — not yet implemented in UI (planned)
2. **Drag & Drop** — requires additional library (dnd-kit or react-dnd)
3. **Caching** — may have delays when switching folders frequently

---

## Dependencies

### Backend:
- FastAPI
- Pydantic
- Python 3.10+

### Frontend:
- React 18+
- TypeScript 5+
- Radix UI (for dropdown menus)
- Lucide Icons

---

## Migrating Existing Projects

When updating an existing KiCAD Prism installation:

1. All existing projects remain unchanged
2. `folder_id` field defaults to `null` (projects in root)
3. Old projects automatically appear in "All Projects"
4. Manual move to folders via UI

---

## Feedback

For suggestions and bug reports, please create issues on GitHub.

---

## Changelog

### Version 1.7 (February 25, 2026) - Context Menu in Folders

**New Features:**

1. **Context Menu for Projects in Folders**
   - Added three dots (⋮) for projects inside folders
   - Menu shows all available folders for moving
   - Current folder marked as "(current)"
   - Can move project to another folder
   - Can move project to root (no folder)
   - Can create new folder and move project into it

**Changed Files:**
- `frontend/src/components/folder-view.tsx` — added MoveProjectMenu for projects
- `frontend/src/components/workspace.tsx` — passed onMoveProject and onCreateFolder to FolderView

### Version 1.6 (February 25, 2026) - Subfolders and Improvements

**Fixed Critical Issue:**

**Problem:** When moving a project to a folder, the project did not appear in the folder when opened.

**Cause:** The `move_project_to_folder` function only updated the `project_ids` list in the folder, but **did not update the `folder_id` in the project registry**. Therefore, the frontend filtered projects by the old `folder_id` value (null).

**Solution:**
1. Added `update_project_folder_id()` function to `project_service.py`
2. Function updates `folder_id` of project in `.project_registry.json`
3. Project cache is cleared for immediate update
4. `move_project_to_folder` now calls `update_project_folder_id`

**Changed Files:**
- `backend/app/services/folder_service.py` — call `update_project_folder_id`
- `backend/app/services/project_service.py` — new function `update_project_folder_id`

### Version 1.2 (February 25, 2026) - Report Fixes

**Fixed Issues:**

1. **Create folder from project menu** — now when creating a folder via "Create New Folder..." menu, the project is automatically moved to the new folder:
   - Added `projectToMoveAfterCreate` state
   - `handleMoveProject` is called after folder creation
   - Project immediately appears in new folder

2. **Display projects in folder** — verified filtering correctness:
   - Projects filtered by `folder_id`
   - `fetchData()` updates projects after move
   - Added debugging for verification

### Version 1.1 (February 25, 2026) - Fixes

**Fixed Issues:**

1. **Folder context menu** — added working context menu with buttons:
   - Rename
   - Create Subfolder
   - Delete Folder

2. **"Create New Folder" button** in project move menu now works:
   - Opens folder creation dialog
   - Allows immediate folder creation and project move

3. **Project move button** no longer opens the project:
   - Added `stopPropagation` to prevent project card opening
   - Move menu works correctly

4. **Display projects in folders** fixed:
   - Projects display correctly after move
   - `fetchData()` updates project list after move

### Version 1.0 (February 25, 2026) - Initial Version

- Create folders and subfolders
- Move projects between folders
- Tree structure in sidebar
- Project counts in folders

---

*Document created: February 25, 2026*
*Version: 1.7*
