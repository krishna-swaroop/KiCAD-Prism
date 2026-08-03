import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PermissionHint, permissionHintMessage } from "./permission-hint";

describe("PermissionHint", () => {
  it("renders the control untouched when nothing is blocked", () => {
    const view = render(
      <PermissionHint blocked={false} action="import components">
        <button type="button">Import</button>
      </PermissionHint>,
    );
    // No wrapper means no stray focus stop in the tab order for users who can
    // actually use the control.
    expect(view.container.querySelector("[tabindex]")).toBeNull();
    expect(view.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("wraps a blocked control in a focusable hint target", () => {
    const view = render(
      <PermissionHint blocked action="import components">
        <button type="button" disabled>
          Import
        </button>
      </PermissionHint>,
    );
    // A disabled button takes no focus and fires no pointer events, so the
    // explanation has to hang off something else.
    const wrapper = view.container.querySelector('[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("button")).toBeDisabled();
  });

});

describe("permissionHintMessage", () => {
  it("says what is not allowed", () => {
    expect(permissionHintMessage("import components")).toBe(
      "Your role does not allow you to import components.",
    );
  });

  it("names a single sufficient role as something to ask for", () => {
    expect(permissionHintMessage("delete projects", ["admin"])).toContain(
      "Ask an administrator for the Admin role.",
    );
  });

  it("lists several sufficient roles readably", () => {
    const message = permissionHintMessage("edit the catalog", ["component_designer", "component_qa", "admin"]);
    expect(message).toContain("Component Designer, Component QA or Admin role");
  });
});
