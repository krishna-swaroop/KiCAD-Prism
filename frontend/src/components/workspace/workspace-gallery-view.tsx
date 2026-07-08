import { Folder } from "lucide-react";

import { FolderTreeItem, Project } from "@/types/project";
import { ProjectCard } from "@/components/project-card";

import { FolderActionMenu, ProjectActionMenu } from "./workspace-action-menus";
import { PROJECT_GRID_CLASS } from "./workspace-types";

interface WorkspaceGalleryViewProps {
  searchQuery: string;
  isSearching: boolean;
  searchResults: Project[];
  selectedProjectId: string | null;
  currentFolderId: string | null;
  visibleFolders: FolderTreeItem[];
  visibleProjects: Project[];
  getProjectDisplayName: (project: Project) => string;
  onOpenProject: (project: Project) => void;
  onShowDetails: (project: Project) => void;
  onOpenFolder: (folderId: string) => void;
  onRenameFolder: (folder: FolderTreeItem) => void;
  onDeleteFolder: (folder: FolderTreeItem) => void;
  onMoveProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  canManageProjects: boolean;
  thumbnailBust?: number;
}

export function WorkspaceGalleryView({
  searchQuery,
  isSearching,
  searchResults,
  selectedProjectId,
  currentFolderId,
  visibleFolders,
  visibleProjects,
  getProjectDisplayName,
  onOpenProject,
  onShowDetails,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveProject,
  onDeleteProject,
  canManageProjects,
  thumbnailBust,
}: WorkspaceGalleryViewProps) {
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
            <div className={PROJECT_GRID_CLASS}>
              {searchResults.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  selected={selectedProjectId === project.id}
                  searchQuery={searchQuery}
                  onClick={() => onShowDetails(project)}
                  onDoubleClick={() => onOpenProject(project)}
                  onOpen={() => onOpenProject(project)}
                  thumbnailBust={thumbnailBust}
                  actions={
                    <ProjectActionMenu
                      project={project}
                      projectName={getProjectDisplayName(project)}
                      onMove={onMoveProject}
                      onDelete={onDeleteProject}
                      canManage={canManageProjects}
                    />
                  }
                />
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
              <div className={PROJECT_GRID_CLASS}>
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selected={selectedProjectId === project.id}
                    onClick={() => onShowDetails(project)}
                    onDoubleClick={() => onOpenProject(project)}
                    onOpen={() => onOpenProject(project)}
                    actions={
                      <ProjectActionMenu
                        project={project}
                        projectName={getProjectDisplayName(project)}
                        onMove={onMoveProject}
                        onDelete={onDeleteProject}
                        canManage={canManageProjects}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
