import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchematicPageTree } from "./ecad-viewer-controls";

describe("SchematicPageTree", () => {
  it("emits the resolved parent page for controlled navigation", () => {
    const onNavigate = vi.fn();
    const root = {
      projectPath: "sheet:/root",
      navigatorKey: "sheet:/root",
      sheetPath: "/root",
      filename: "main.kicad_sch",
      depth: 0,
      active: false,
    };
    const child = {
      projectPath: "sheet:/root/child",
      navigatorKey: "sheet:/root/child",
      parentNavigatorKey: root.navigatorKey,
      sheetPath: "/root/child",
      filename: "child.kicad_sch",
      depth: 1,
      active: true,
    };
    const view = render(
      <SchematicPageTree
        viewer={null}
        pages={[root, child]}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: /Parent sheet/i }));
    expect(onNavigate).toHaveBeenCalledWith(root);
  });

  it("keeps search controls separate from the scrollable page list", () => {
    const pages = ["Root", "Power", "Debugger"].map((name, index) => ({
      projectPath: `sheet:/${name.toLowerCase()}`,
      navigatorKey: `sheet:/${name.toLowerCase()}`,
      sheetPath: `/${name.toLowerCase()}`,
      filename: `${name.toLowerCase()}.kicad_sch`,
      name,
      page: String(index + 1),
      depth: 0,
      active: index === 0,
    }));
    const view = render(
      <SchematicPageTree viewer={null} pages={pages} />,
    );

    const list = view.getByLabelText("Schematic page list");
    expect(list.className).toContain("touch-pan-y");
    expect(list.className).toContain("overscroll-contain");

    fireEvent.change(view.getByLabelText("Find schematic page"), {
      target: { value: "debug" },
    });
    expect(view.getByText("1/3")).toBeTruthy();
    expect(view.queryByRole("button", { name: /Power/ })).toBeNull();
    expect(view.getByRole("button", { name: /Debugger/ })).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Clear page search" }));
    expect(view.getByText("3/3")).toBeTruthy();
    expect(view.getByRole("button", { name: /Power/ })).toBeTruthy();
  });
});
