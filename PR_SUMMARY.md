# Pull Request: Folder System for Project Organization

## 🎯 Overview

This PR implements a comprehensive folder system for organizing KiCAD projects in KiCAD Prism, inspired by Altium 365. Users can now group projects into folders and subfolders for better workspace organization.

---

## ✨ Key Features

### 1. Folder Management
- ✅ Create root folders and nested subfolders (unlimited depth)
- ✅ Rename and delete folders
- ✅ Context menu for quick actions
- ✅ Tree view in sidebar with expand/collapse

### 2. Project Organization
- ✅ Move projects between folders via context menu (⋮)
- ✅ Move projects to root (no folder)
- ✅ Create new folder directly from project move menu
- ✅ Automatic removal from previous folder

### 3. Visual Display
- ✅ Folder cards in main content area
- ✅ Subfolders displayed when viewing a folder
- ✅ Project counts in each folder (including subfolders)
- ✅ Current folder highlighting

### 4. Navigation
- ✅ Click folder to view contents
- ✅ Navigate between folders and subfolders
- ✅ "Back to All" button for quick navigation
- ✅ Search across all projects

---

## 📁 Visual Structure

```
┌────────────────────────────────────────────────────────────┐
│ Sidebar              │      Main Content                  │
│───────────────────── │                                    │
│ Folders       [+]    │  ┌──────────────────────────────┐  │
│ ▼ Hardware Projects  │  │  Hardware Projects           │  │
│   ▼ Power Supplies   │  │  5 projects • 2 subfolders   │  │
│   • MCU Boards       │  │                              │  │
│   └─ All Projects    │  │  Subfolders                  │  │
│                      │  │  ┌──────────┐ ┌──────────┐  │  │
│                      │  │  │ 📁 Power │  │ 📁 MCU   │  │  │
│                      │  │  │ Supplies │  │ Boards   │  │  │
│                      │  │  └──────────┘ └──────────┘  │  │
│                      │  │                              │  │
│                      │  │  Projects                    │  │
│                      │  │  [Project Cards...]          │  │
│                      │  └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technical Implementation

### Backend Changes

**New Files:**
- `backend/app/services/folder_service.py` - Folder business logic
- `backend/app/api/folders.py` - REST API endpoints

**Modified Files:**
- `backend/app/services/project_service.py` - Added `folder_id` field
- `backend/app/main.py` - Registered `/api/folders` router

**Key Functions:**
- `create_folder()` - Create folder with optional parent
- `move_project_to_folder()` - Move project between folders
- `update_project_folder_id()` - Update project registry
- `get_folder_tree()` - Get hierarchical folder structure

### Frontend Changes

**New Components:**
- `src/components/folder-tree.tsx` - Sidebar tree view
- `src/components/folder-view.tsx` - Folder content display
- `src/components/folder-card.tsx` - Folder card UI
- `src/components/folder-dialog.tsx` - Create/rename dialog
- `src/components/move-project-menu.tsx` - Move project menu
- `src/components/folder-context-menu.tsx` - Folder actions menu

**Modified Components:**
- `src/components/workspace.tsx` - Folder integration
- `src/components/project-card.tsx` - Added context menu
- `src/types/project.ts` - Added folder types

---

## 🔌 API Endpoints

### Folders
```
GET    /api/folders/                      # List all folders
GET    /api/folders/tree                  # Get folder tree
GET    /api/folders/root                  # Get root folders
GET    /api/folders/{folder_id}           # Get folder details
GET    /api/folders/{folder_id}/children  # Get child folders
GET    /api/folders/{folder_id}/projects  # Get projects in folder
POST   /api/folders/                      # Create folder
PUT    /api/folders/{folder_id}           # Update folder
DELETE /api/folders/{folder_id}           # Delete folder
```

### Projects
```
POST   /api/folders/projects/{project_id}/move  # Move project
```

---

## 📊 Data Model

### Folder Storage
Location: `data/projects/.folders.json`

```json
{
  "folder_1": {
    "id": "folder_1",
    "name": "Hardware Projects",
    "parent_id": null,
    "project_ids": ["proj1", "proj2"],
    "child_folder_ids": ["folder_2"]
  },
  "folder_2": {
    "id": "folder_2",
    "name": "Power Supplies",
    "parent_id": "folder_1",
    "project_ids": ["proj3"],
    "child_folder_ids": []
  }
}
```

### Project Model Update
```typescript
interface Project {
  id: string;
  name: string;
  folder_id?: string;  // NEW: Folder assignment
  // ... other fields
}
```

---

## 🎨 Usage Examples

### Create a Folder
1. Click `+` button next to "Folders" in sidebar
2. Enter folder name
3. (Optional) Select parent folder for subfolder
4. Click "Create Folder"

### Move Project
1. Click `⋮` (three dots) on project card
2. Select target folder from menu
3. Project moves immediately

### Navigate Folders
1. Click folder in sidebar or folder card
2. View projects and subfolders
3. Click subfolder to drill down
4. Click "Back to All" to return

---

## 🧪 Testing

### Manual Testing Checklist
- [ ] Create root folder
- [ ] Create subfolder
- [ ] Move project to folder
- [ ] Move project to different folder
- [ ] Move project to root (no folder)
- [ ] Create folder from project move menu
- [ ] Navigate into folder
- [ ] Navigate into subfolder
- [ ] Navigate back to all projects
- [ ] Verify project counts update correctly
- [ ] Verify folder tree expand/collapse
- [ ] Delete folder (projects move to parent)

### API Testing
```bash
# Create folder
curl -X POST http://localhost:8000/api/folders/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Folder", "parent_id": null}'

# Get all folders
curl http://localhost:8000/api/folders/

# Move project
curl -X POST http://localhost:8000/api/folders/projects/proj123/move \
  -H "Content-Type: application/json" \
  -d '{"folder_id": "folder_456"}'
```

---

## 📝 Migration Notes

### For Existing Installations

1. **No Breaking Changes** - All existing projects remain unchanged
2. **Default State** - Existing projects have `folder_id: null` (root level)
3. **Automatic Display** - Old projects appear in "All Projects" section
4. **Manual Organization** - Users can manually move projects to folders

### Database Migration
- No database migration required
- `.folders.json` created on first folder creation
- `.project_registry.json` automatically updated with `folder_id` field

---

## 🐛 Known Limitations

1. **No Drag & Drop** - Projects moved via context menu only
2. **No Bulk Operations** - Move one project at a time
3. **No Folder Sharing** - Folders are user-specific (no team sharing yet)
4. **No Permissions** - All users can create/delete folders (if auth enabled)

---

## 🚀 Future Enhancements

### Planned Features
- [ ] Drag & drop project movement
- [ ] Bulk project operations
- [ ] Favorite/pinned folders
- [ ] Folder color coding
- [ ] Folder-level search
- [ ] Export/import folder structure
- [ ] Team folder sharing
- [ ] Folder permissions

---

## 📦 Dependencies

### Backend
- FastAPI
- Pydantic
- Python 3.10+

### Frontend
- React 18+
- TypeScript 5+
- Radix UI
- Lucide Icons

**No new external dependencies added**

---

## 📈 Version History

### v1.7 - Context Menu in Folders
- Added context menu for projects inside folders
- Move projects between folders from folder view

### v1.6 - Subfolders Display
- Show subfolders when viewing folder
- Fixed critical project move bug

### v1.2 - Auto-move on Create
- Create folder from project menu auto-moves project

### v1.1 - UI Fixes
- Fixed context menu
- Fixed project move button
- Fixed project display

### v1.0 - Initial Release
- Basic folder creation and management
- Project movement

---

## 📚 Documentation

- Full documentation: `docs/FOLDER_SYSTEM_EN.md`
- API documentation: Available at `/docs` (Swagger UI)

---

## ✅ Checklist

- [x] Backend implementation complete
- [x] Frontend implementation complete
- [x] API endpoints documented
- [x] TypeScript types defined
- [x] Data persistence working
- [x] UI components tested
- [x] Migration path documented
- [x] User documentation created
- [x] No breaking changes
- [x] Build passes without errors

---

## 🎯 Related Issues

Closes #[7] - Implement folder system for project organization

---

**PR Author:** [TriOda]  
**Reviewers Needed:** 1-2  
**Priority:** Low 
**Breaking Change:** No  
**Migration Required:** No
