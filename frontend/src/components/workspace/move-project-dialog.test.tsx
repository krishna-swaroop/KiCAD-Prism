import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FolderTreeItem, Project } from "@/types/project";
import { MoveProjectDialog } from "./move-project-dialog";

function project(id: string, folderId: string | null): Project {
  return {
    id,
    name: id,
    description: "",
    path: `/projects/${id}`,
    last_modified: "2026-08-01T00:00:00Z",
    folder_id: folderId,
  };
}

const folders: FolderTreeItem[] = [
  {
    id: "fld_a",
    name: "Folder A",
    parent_id: null,
    depth: 0,
    has_children: false,
    direct_project_count: 1,
    total_project_count: 1,
  },
  {
    id: "fld_target",
    name: "Target",
    parent_id: null,
    depth: 0,
    has_children: false,
    direct_project_count: 0,
    total_project_count: 0,
  },
];

describe("MoveProjectDialog bulk moves", () => {
  it("submits all selected project ids in one confirmation", () => {
    const onConfirm = vi.fn();
    render(
      <MoveProjectDialog
        projects={[project("prj_a", "fld_a"), project("prj_b", null)]}
        folders={folders}
        isMoving={false}
        onClose={() => {}}
        onConfirm={onConfirm}
        getProjectDisplayName={(item) => item.name}
      />,
    );

    expect(screen.getByRole("heading", { name: "Move 2 Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Destination folder" }), {
      target: { value: "fld_target" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(["prj_a", "prj_b"], "fld_target");
  });
});
