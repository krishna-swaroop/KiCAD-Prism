import { AppWindow, Blocks, Folder, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { WorkspaceSection } from "./workspace-types";

interface WorkspaceSidebarProps {
  section: WorkspaceSection;
  isCollapsed: boolean;
  onToggle: () => void;
  onSectionChange: (section: WorkspaceSection) => void;
  canOpenLibrary: boolean;
}

export function WorkspaceSidebar({
  section,
  isCollapsed,
  onToggle,
  onSectionChange,
  canOpenLibrary,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-card transition-all duration-200",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!isCollapsed && <p className="text-sm font-semibold">Workspace</p>}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 space-y-2 p-2">
        <Button
          variant={section === "projects" ? "secondary" : "ghost"}
          className={cn("w-full justify-start gap-2", isCollapsed && "justify-center px-2")}
          onClick={() => onSectionChange("projects")}
          aria-label="Projects"
        >
          <Folder className="h-4 w-4" />
          {!isCollapsed && <span>Projects</span>}
        </Button>

        {canOpenLibrary && (
          <Button
            variant={section === "library" ? "secondary" : "ghost"}
            className={cn("w-full justify-start gap-2", isCollapsed && "justify-center px-2")}
            onClick={() => onSectionChange("library")}
            aria-label="Library Manager"
          >
            <Blocks className="h-4 w-4" />
            {!isCollapsed && <span>Library Manager</span>}
          </Button>
        )}

        <Button
          variant={section === "apps" ? "secondary" : "ghost"}
          className={cn("w-full justify-start gap-2", isCollapsed && "justify-center px-2")}
          onClick={() => onSectionChange("apps")}
          aria-label="Apps and Integrations"
        >
          <AppWindow className="h-4 w-4" />
          {!isCollapsed && <span>Apps &amp; Integrations</span>}
        </Button>
      </div>
    </aside>
  );
}
