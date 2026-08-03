import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { Project } from "@/types/project";
import { WorkspaceGalleryView } from "./workspace-gallery-view";

const project: Project = {
  id: "prj_card",
  name: "Card Board",
  description: "",
  path: "/projects/card",
  last_modified: "2026-08-01T00:00:00Z",
  folder_id: null,
};

describe("WorkspaceGalleryView project selection", () => {
  it("uses a compact square shadcn checkbox on project cards", () => {
    const onToggleProjectSelection = vi.fn();

    render(
      <MemoryRouter>
        <WorkspaceGalleryView
          searchQuery=""
          isSearching={false}
          searchResults={[]}
          selectedProjectId={null}
          bulkSelectedProjectIds={new Set()}
          currentFolderId={null}
          visibleFolders={[]}
          visibleProjects={[project]}
          getProjectDisplayName={(item) => item.name}
          onSelectProject={() => {}}
          onToggleProjectSelection={onToggleProjectSelection}
          onOpenProject={() => {}}
          onOpenFolder={() => {}}
          onRenameFolder={() => {}}
          onDeleteFolder={() => {}}
          onMoveProject={() => {}}
          onDeleteProject={() => {}}
          onRegenerateThumbnail={() => {}}
          canManageProjects
        />
      </MemoryRouter>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select Card Board" });
    expect(checkbox).toHaveClass("h-5", "w-5", "border-2", "rounded-sm");

    fireEvent.click(checkbox);
    expect(onToggleProjectSelection).toHaveBeenCalledWith("prj_card", true);
  });
});
