import { Folder } from "lucide-react";

import { FolderTreeItem, Project } from "@/types/project";
import { ProjectCard } from "@/components/project-card";
import { Checkbox } from "@/components/ui/checkbox";

import { FolderActionMenu, ProjectActionMenu } from "./workspace-action-menus";
import {
  FOLDER_GRID_CLASS,
  FOLDER_GRID_CLASS_COMPACT,
  PROJECT_GRID_CLASS,
  PROJECT_GRID_CLASS_COMPACT,
} from "./workspace-types";

interface WorkspaceGalleryViewProps {
  searchQuery: string;
  isSearching: boolean;
  searchResults: Project[];
  selectedProjectId: string | null;
  propertiesPanelOpen?: boolean;
  bulkSelectedProjectIds: ReadonlySet<string>;
  currentFolderId: string | null;
  visibleFolders: FolderTreeItem[];
  visibleProjects: Project[];
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

export function WorkspaceGalleryView({
  searchQuery,
  isSearching,
  searchResults,
  selectedProjectId,
  propertiesPanelOpen = false,
  bulkSelectedProjectIds,
  currentFolderId,
  visibleFolders,
  visibleProjects,
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
}: WorkspaceGalleryViewProps) {
  const projectGridClass = propertiesPanelOpen ? PROJECT_GRID_CLASS_COMPACT : PROJECT_GRID_CLASS;
  const folderGridClass = propertiesPanelOpen ? FOLDER_GRID_CLASS_COMPACT : FOLDER_GRID_CLASS;
  const selectCheckboxClass = propertiesPanelOpen
    ? "h-4 w-4 border-2 bg-background/95 shadow-md"
    : "h-5 w-5 border-2 bg-background/95 shadow-md";

  return (
    <div className="space-y-6">
      {isSearching ? (
        <>
          <p className="text-sm text-muted-foreground">Search Results ({searchResults.length})</p>
          {searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No projects found for "{searchQuery}".
            </div>
          ) : (
            <div className={projectGridClass} data-testid="project-gallery-grid">
              {searchResults.map((project) => (
                <div key={project.id} className="group relative">
                  {canManageProjects && (
                    <div
                      className={`absolute left-2 top-2 z-10 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
                        bulkSelectedProjectIds.has(project.id) ? "opacity-100" : "opacity-0"
                      }`}
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        className={selectCheckboxClass}
                        checked={bulkSelectedProjectIds.has(project.id)}
                        onCheckedChange={(checked) => onToggleProjectSelection(project.id, checked === true)}
                        aria-label={`Select ${getProjectDisplayName(project)}`}
                      />
                    </div>
                  )}
                  <ProjectCard
                    project={project}
                    dense={propertiesPanelOpen}
                    selected={selectedProjectId === project.id || bulkSelectedProjectIds.has(project.id)}
                    searchQuery={searchQuery}
                    onClick={() => onSelectProject(project)}
                    onDoubleClick={() => onOpenProject(project)}
                    actions={
                      <ProjectActionMenu
                        project={project}
                        projectName={getProjectDisplayName(project)}
                        onMove={onMoveProject}
                        onDelete={onDeleteProject}
                        onRegenerateThumbnail={onRegenerateThumbnail}
                        canManage={canManageProjects}
                      />
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {visibleFolders.length > 0 && (
            <section className="space-y-3">
              {currentFolderId !== null && (
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Folders</h3>
              )}
              <div className={folderGridClass}>
                {visibleFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
                    onClick={() => onOpenFolder(folder.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenFolder(folder.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-md bg-muted p-2">
                          <Folder className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="line-clamp-1 text-sm font-semibold">{folder.name}</p>
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {folder.total_project_count}
                          </span>
                        </div>
                      </div>
                      <FolderActionMenu
                        folder={folder}
                        onRename={onRenameFolder}
                        onDelete={onDeleteFolder}
                        canManage={canManageProjects}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            {visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No projects in this level.
              </div>
            ) : (
              <div className={projectGridClass} data-testid="project-gallery-grid">
                {visibleProjects.map((project) => (
                  <div key={project.id} className="group relative">
                    {canManageProjects && (
                      <div
                        className={`absolute left-2 top-2 z-10 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
                          bulkSelectedProjectIds.has(project.id) ? "opacity-100" : "opacity-0"
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          className={selectCheckboxClass}
                          checked={bulkSelectedProjectIds.has(project.id)}
                          onCheckedChange={(checked) => onToggleProjectSelection(project.id, checked === true)}
                          aria-label={`Select ${getProjectDisplayName(project)}`}
                        />
                      </div>
                    )}
                    <ProjectCard
                      project={project}
                      dense={propertiesPanelOpen}
                      selected={selectedProjectId === project.id || bulkSelectedProjectIds.has(project.id)}
                      onClick={() => onSelectProject(project)}
                      onDoubleClick={() => onOpenProject(project)}
                      actions={
                        <ProjectActionMenu
                          project={project}
                          projectName={getProjectDisplayName(project)}
                          onMove={onMoveProject}
                          onDelete={onDeleteProject}
                          onRegenerateThumbnail={onRegenerateThumbnail}
                          canManage={canManageProjects}
                        />
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
