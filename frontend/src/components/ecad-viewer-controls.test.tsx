import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ECadViewerElement, EcadPcbViewState } from "@/types/ecad-viewer";
import { EcadViewerControls, SchematicPageTree } from "./ecad-viewer-controls";

/**
 * The slice of <ecad-viewer> the PCB objects tab talks to: a state snapshot,
 * the visibility setter, and the event surface the panel subscribes to.
 */
function stubPcbViewer(overrides: Partial<EcadPcbViewState["objectVisibility"]> = {}) {
  const state: EcadPcbViewState = {
    layers: [{ name: "F.Cu", color: "#c83434", visible: true, highlighted: false }],
    objectOpacity: { tracks: 1, vias: 1, pads: 1, zones: 0.6 },
    objectVisibility: {
      references: true,
      values: true,
      footprintText: true,
      hiddenText: false,
      padNumbers: true,
      padNetNames: true,
      trackNetNames: true,
      ...overrides,
    },
    highlightTracks: true,
  };
  const setPcbObjectVisibility = vi.fn((kind: keyof EcadPcbViewState["objectVisibility"], visible: boolean) => {
    state.objectVisibility[kind] = visible;
  });
  const viewer = {
    // Like the element, hand out a fresh snapshot each time.
    getPcbViewState: () => ({ ...state, objectVisibility: { ...state.objectVisibility } }),
    setPcbObjectVisibility,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as ECadViewerElement;
  return { viewer, state, setPcbObjectVisibility };
}

describe("EcadViewerControls PCB objects tab", () => {
  it("lists the pad-number and net-name toggles and forwards a change to the viewer", () => {
    const { viewer, setPcbObjectVisibility } = stubPcbViewer();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);

    fireEvent.click(view.getByRole("button", { name: "Objects & filters" }));

    const padNumbers = view.getByRole("checkbox", { name: "Pad numbers" });
    const padNets = view.getByRole("checkbox", { name: "Net names on pads" });
    const trackNets = view.getByRole("checkbox", { name: "Net names on tracks & vias" });
    expect(padNumbers.getAttribute("aria-checked")).toBe("true");
    expect(padNets.getAttribute("aria-checked")).toBe("true");
    expect(trackNets.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(trackNets);
    expect(setPcbObjectVisibility).toHaveBeenCalledWith("trackNetNames", false);
    // The panel re-reads the viewer after every mutation, so the box follows.
    expect(view.getByRole("checkbox", { name: "Net names on tracks & vias" }).getAttribute("aria-checked")).toBe("false");
  });

  it("reflects a viewer that already has pad numbers off", () => {
    const { viewer } = stubPcbViewer({ padNumbers: false });
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    fireEvent.click(view.getByRole("button", { name: "Objects & filters" }));
    expect(view.getByRole("checkbox", { name: "Pad numbers" }).getAttribute("aria-checked")).toBe("false");
    expect(view.getByRole("checkbox", { name: "Net names on pads" }).getAttribute("aria-checked")).toBe("true");
  });
});

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
