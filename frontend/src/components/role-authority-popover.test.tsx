import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoleAuthorityPopover } from "./role-authority-popover";

describe("RoleAuthorityPopover", () => {
  it("opens the authority matrix from the role label and highlights the current role", () => {
    render(<RoleAuthorityPopover role="component_qa" />);

    fireEvent.click(screen.getByRole("button", { name: "Show permissions for Component QA" }));

    const matrix = screen.getByRole("table", { name: "Role authority matrix" });
    expect(screen.getByText("Your role is Component QA. The highlighted column shows what you can do.")).toBeInTheDocument();
    expect(within(matrix).getByRole("columnheader", { name: "Component QA (current)" })).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Review component QA: Component QA is allowed")).toBeInTheDocument();
    expect(within(matrix).getByLabelText("Manage projects: Component QA is not allowed")).toBeInTheDocument();
  });

  it("renders a plain reference chart with no highlighted role when role is omitted", () => {
    render(<RoleAuthorityPopover trigger="View role permissions" />);

    fireEvent.click(screen.getByRole("button", { name: "Show the role permission matrix" }));

    const matrix = screen.getByRole("table", { name: "Role authority matrix" });
    expect(
      screen.getByText("What each role can do across projects and the component catalog."),
    ).toBeInTheDocument();
    expect(within(matrix).queryByText("Your role")).not.toBeInTheDocument();
  });
});
