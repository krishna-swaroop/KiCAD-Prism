import { Project, FolderTreeItem } from "@/types/project";
import { ProjectCard } from "./project-card";
import { FolderCard } from "./folder-card";
import { MoveProjectMenu } from "./move-project-menu";
import { Folder, FolderOpen } from "lucide-react";

interface FolderViewProps {
  folder: FolderTreeItem | null;
  projects: Project[];
  folders: FolderTreeItem[];
  onFolderClick: (folderId: string) => void;
  onProjectClick: (projectId: string) => void;
  onMoveProject: (projectId: string, folderId: string | null) => void;
  onCreateFolder: (projectId: string) => void;
  isLoading?: boolean;
}

export function FolderView({ folder, projects, folders, onFolderClick, onProjectClick, onMoveProject, onCreateFolder, isLoading }: FolderViewProps) {
  if (!folder) {
    // Show all projects not in any folder
    const unassignedProjects = projects.filter((p) => !p.folder_id);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">All Projects</h2>
            <p className="text-sm text-muted-foreground">
              {unassignedProjects.length} project{unassignedProjects.length !== 1 ? "s" : ""} not in a folder
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : unassignedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Folder className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No unassigned projects</h3>
            <p className="text-sm text-muted-foreground mt-1">
              All projects are organized in folders
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {unassignedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onProjectClick(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Show projects in selected folder
  const folderProjects = projects.filter((p) => p.folder_id === folder.id);
  
  // Get direct subfolders
  const subfolders = folders.filter((f) => f.parent_id === folder.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{folder.name}</h2>
          <p className="text-sm text-muted-foreground">
            {folderProjects.length} project{folderProjects.length !== 1 ? "s" : ""} in this folder
            {subfolders.length > 0 && ` • ${subfolders.length} subfolder${subfolders.length !== 1 ? "s" : ""}`}
            {folder.depth > 0 && ` (Depth: ${folder.depth})`}
          </p>
        </div>
      </div>

      {/* Subfolders Section */}
      {subfolders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Subfolders</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subfolders.map((subfolder) => (
              <FolderCard
                key={subfolder.id}
                folder={subfolder}
                onClick={() => onFolderClick(subfolder.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Projects Section */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : folderProjects.length === 0 && subfolders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Folder className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No projects in this folder</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Move projects here or create a new project
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Projects</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {folderProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onProjectClick(project.id)}
                renderActions={(project) => (
                  <MoveProjectMenu
                    projectId={project.id}
                    currentFolderId={project.folder_id}
                    folders={folders}
                    onMove={onMoveProject}
                    onCreateFolder={onCreateFolder}
                  />
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
