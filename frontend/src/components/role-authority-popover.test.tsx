import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoleAuthorityPopover } from "./role-authority-popover";

describe("RoleAuthorityPopover", () => {
  it("opens the authority matrix from the role label and highlights the current role", () => {
    render(<RoleAuthorityPopover role="qa" />);

    fireEvent.click(screen.getByRole("button", { name: "Show permissions for QA" }));

    const matrix = screen.getByRole("table", { name: "Role authority matrix" });
    expect(screen.getByText("Highlighted column is QA.")).toBeInTheDocument();
    expect(within(matrix).getByRole("columnheader", { name: "QA (current)" })).toBeInTheDocument();
    expect(screen.queryByText("Browse projects, schematics, boards, and existing comments.")).not.toBeInTheDocument();
    expect(within(matrix).getByLabelText("Review component QA: QA is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Manage projects: QA is not allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Inspect Release Studio: QA is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Start a project release build: QA is not allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Approve a project release: QA is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Publish to GitHub or GitLab: QA is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Edit component library: QA is not allowed")).toBeInTheDocument();
  });

  it("shows designers can author the catalog and start project releases", () => {
    render(<RoleAuthorityPopover role="designer" />);

    fireEvent.click(screen.getByRole("button", { name: "Show permissions for Designer" }));

    const matrix = screen.getByRole("table", { name: "Role authority matrix" });
    expect(within(matrix).getByLabelText("Edit component library: Designer is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Start a project release build: Designer is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Review component QA: Designer is not allowed")).toBeInTheDocument();
  });
});
