import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceSidebar } from "./workspace-sidebar";

afterEach(cleanup);

function renderSidebar(props: Partial<React.ComponentProps<typeof WorkspaceSidebar>> = {}) {
  const onSectionChange = vi.fn();
  render(
    <WorkspaceSidebar section="projects" isCollapsed={false} onToggle={() => {}} onSectionChange={onSectionChange} {...props} />,
  );
  return onSectionChange;
}

describe("WorkspaceSidebar", () => {
  it("hides Supply unless the role may open it", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: "Supply" })).toBeNull();
    expect(screen.getByRole("button", { name: "Projects" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Library Manager" })).toBeTruthy();
  });

  it("shows Supply and switches to it", () => {
    const onSectionChange = renderSidebar({ canOpenSupply: true });
    fireEvent.click(screen.getByRole("button", { name: "Supply" }));
    expect(onSectionChange).toHaveBeenCalledWith("supply");
  });

  it("marks the current section", () => {
    renderSidebar({ canOpenSupply: true, section: "supply" });
    expect(screen.getByRole("button", { name: "Supply" }).getAttribute("data-variant")).toBe("secondary");
    expect(screen.getByRole("button", { name: "Projects" }).getAttribute("data-variant")).toBe("ghost");
  });

  it("keeps the label for the collapsed sidebar", () => {
    renderSidebar({ canOpenSupply: true, isCollapsed: true });
    expect(screen.getByRole("button", { name: "Supply" }).textContent).toBe("");
  });
});
