import { Folder } from "lucide-react";

import { SearchProject } from "@/hooks/use-workspace-search";
import { FolderTreeItem, Project } from "@/types/project";
import { Checkbox } from "@/components/ui/checkbox";

import { FolderActionMenu, ProjectActionMenu } from "./workspace-action-menus";

interface WorkspaceListViewProps {
  isSearching: boolean;
  selectedProjectId: string | null;
  bulkSelectedProjectIds: ReadonlySet<string>;
  currentFolderId: string | null;
  breadcrumbs: FolderTreeItem[];
  listFolders: FolderTreeItem[];
  listProjects: Project[];
  getProjectDisplayName: (project: Project) => string;
  onSelectProject: (project: Project) => void;
  onToggleProjectSelection: (projectId: string, selected: boolean) => void;
  onOpenProject: (project: Project) => void;
  onOpenFolder: (folderId: string) => void;
  onRenameFolder: (folder: FolderTreeItem) => void;
  onDeleteFolder: (folder: FolderTreeItem) => void;
  onMoveProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onRegenerateThumbnail: (project: Project) => void;
  canManageProjects: boolean;
}

function resolveProjectLocation(
  project: Project,
  isSearching: boolean,
  currentFolderId: string | null,
  breadcrumbs: FolderTreeItem[]
): string {
  if (isSearching && "folder_path" in project) {
    return (project as SearchProject).folder_path;
  }

  if (currentFolderId) {
    return breadcrumbs.map((crumb) => crumb.name).join(" / ");
  }

  return "Workspace Root";
}

export function WorkspaceListView({
  isSearching,
  selectedProjectId,
  bulkSelectedProjectIds,
  currentFolderId,
  breadcrumbs,
  listFolders,
  listProjects,
  getProjectDisplayName,
  onSelectProject,
  onToggleProjectSelection,
  onOpenProject,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveProject,
  onDeleteProject,
  onRegenerateThumbnail,
  canManageProjects,
}: WorkspaceListViewProps) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-x-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="w-4"><span className="sr-only">Select</span></span>
        <div>Name</div>
        <div>Description</div>
        <div>Location</div>
        <div>Updated</div>
        <div className="w-8" />
      </div>

      {listFolders.length === 0 && listProjects.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">No items to display.</div>
      ) : (
        <div>
          {listFolders.map((folder) => (
            <div
              key={folder.id}
              className="grid grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-4 py-2"
            >
              <span className="w-4" />
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left text-sm font-medium hover:text-primary"
                onClick={() => onOpenFolder(folder.id)}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
              <p className="truncate text-sm text-muted-foreground">Folder</p>
              <p className="truncate text-sm text-muted-foreground">Current Level</p>
              <p className="truncate text-sm text-muted-foreground">-</p>
              <div className="flex justify-end">
                <FolderActionMenu
                  folder={folder}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  canManage={canManageProjects}
                />
              </div>
            </div>
          ))}

          {listProjects.map((project) => (
            <div
              key={project.id}
              className={`grid grid-cols-[auto_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-4 py-2 transition-colors ${selectedProjectId === project.id || bulkSelectedProjectIds.has(project.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
              onClick={() => onSelectProject(project)}
              onDoubleClick={() => onOpenProject(project)}
            >
              <div
                className="flex w-4 items-center"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {canManageProjects && (
                  <Checkbox
                    checked={bulkSelectedProjectIds.has(project.id)}
                    onCheckedChange={(checked) => onToggleProjectSelection(project.id, checked === true)}
                    aria-label={`Select ${getProjectDisplayName(project)}`}
                  />
                )}
              </div>
              <button
                type="button"
                className="truncate text-left text-sm font-medium hover:text-primary"
                onClick={() => onSelectProject(project)}
                onDoubleClick={() => onOpenProject(project)}
              >
                {getProjectDisplayName(project)}
              </button>
              <p className="truncate text-sm text-muted-foreground">{project.description || "No description"}</p>
              <p className="truncate text-sm text-muted-foreground">
                {resolveProjectLocation(project, isSearching, currentFolderId, breadcrumbs)}
              </p>
              <p className="truncate text-sm text-muted-foreground">{project.last_modified}</p>
              <div
                className="flex justify-end"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <ProjectActionMenu
                  project={project}
                  projectName={getProjectDisplayName(project)}
                  onMove={onMoveProject}
                  onDelete={onDeleteProject}
                  onRegenerateThumbnail={onRegenerateThumbnail}
                  canManage={canManageProjects}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
