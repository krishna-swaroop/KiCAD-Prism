import { CircuitBoard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";


interface SidebarTreeProps {
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject: (project: Project) => void;
}

export function SidebarTree({
  projects,
  selectedProjectId,
  onSelectProject,
}: SidebarTreeProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Project List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2" style={{ scrollbarWidth: 'thin' }}>
        {projects.length > 0 ? (
          <div className="space-y-0.5">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Projects ({projects.length})
            </div>
            {projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors group",
                  selectedProjectId === project.id && "bg-accent"
                )}
                onClick={() => onSelectProject(project)}
              >
                <CircuitBoard className={cn(
                  "h-4 w-4 shrink-0",
                  selectedProjectId === project.id ? "text-foreground" : "text-success"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate font-medium">{project.display_name || project.name}</div>
                  {project.parent_repo && (
                    <div className="text-[10px] text-muted-foreground truncate leading-tight group-hover:text-muted-foreground/80">
                      {project.parent_repo}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No projects found</p>
            <p className="text-xs mt-1">Import a project to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
