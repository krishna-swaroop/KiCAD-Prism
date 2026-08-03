import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Project } from "@/types/project";
import { WorkspaceListView } from "./workspace-list-view";

const project: Project = {
  id: "prj_visible",
  name: "Visible Board",
  description: "",
  path: "/projects/visible",
  last_modified: "2026-08-01T00:00:00Z",
  folder_id: null,
};

describe("WorkspaceListView bulk selection", () => {
  it("selects a visible project without opening its properties", () => {
    const onSelectProject = vi.fn();
    const onToggleProjectSelection = vi.fn();

    render(
      <WorkspaceListView
        isSearching={false}
        selectedProjectId={null}
        bulkSelectedProjectIds={new Set()}
        currentFolderId={null}
        breadcrumbs={[]}
        listFolders={[]}
        listProjects={[project]}
        getProjectDisplayName={(item) => item.display_name || item.name}
        onSelectProject={onSelectProject}
        onToggleProjectSelection={onToggleProjectSelection}
        onOpenProject={() => {}}
        onOpenFolder={() => {}}
        onRenameFolder={() => {}}
        onDeleteFolder={() => {}}
        onMoveProject={() => {}}
        onDeleteProject={() => {}}
        onRegenerateThumbnail={() => {}}
        canManageProjects
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Visible Board" }));

    expect(onToggleProjectSelection).toHaveBeenCalledWith("prj_visible", true);
    expect(onSelectProject).not.toHaveBeenCalled();
  });
});
