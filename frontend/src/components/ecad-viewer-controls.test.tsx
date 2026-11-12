import { act, fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EcadViewer } from "@/lib/ecad-viewer";
import { fakeEcadViewer, type FakeEcadViewerOptions } from "@/test/fake-ecad-viewer";
import type { EcadPcbViewState } from "@/types/ecad-viewer";
import { EcadViewerControls, PcbLayerList, SchematicPageTree } from "./ecad-viewer-controls";

/** The adapter over a fake element, as the Visualizer holds it. */
function adapted(view: "sch" | "pcb", options: FakeEcadViewerOptions) {
  const element = fakeEcadViewer(options);
  const viewer = new EcadViewer(view);
  viewer.attach(element);
  return { element, viewer };
}

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
  const { element, viewer } = adapted("pcb", { pcb: state });
  return { viewer, state, setPcbObjectVisibility: element.setPcbObjectVisibility };
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

describe("PcbLayerList", () => {
  const layers = [
    { name: "F.Cu", color: "#c83434", visible: true, highlighted: false },
    { name: "User.9", userName: "Script.Cobre", color: "#c2c2c2", visible: true, highlighted: false },
  ];

  it("shows a board's custom layer name with the built-in name beside it", () => {
    const view = render(<PcbLayerList layers={layers} onToggleVisibility={vi.fn()} />);

    expect(view.getByText("Script.Cobre")).toBeTruthy();
    expect(view.getByText("User.9")).toBeTruthy();
    expect(view.getByTitle("Script.Cobre (User.9)")).toBeTruthy();
    // A layer without a custom name gets a plain one, still beside its KiCad name.
    expect(view.getByTitle("Top (F.Cu)")).toBeTruthy();
  });

  it("keeps the built-in name for visibility and highlight calls", () => {
    const onToggleVisibility = vi.fn();
    const onHighlight = vi.fn();
    const view = render(
      <PcbLayerList layers={layers} onToggleVisibility={onToggleVisibility} onHighlight={onHighlight} />,
    );

    fireEvent.click(view.getByRole("button", { name: "Hide Script.Cobre (User.9)" }));
    expect(onToggleVisibility).toHaveBeenCalledWith("User.9", false);

    fireEvent.click(view.getByText("Script.Cobre"));
    expect(onHighlight).toHaveBeenCalledWith("User.9");
  });
});

describe("EcadViewerControls PCB layers tab", () => {
  function stubLayers() {
    const state: EcadPcbViewState = {
      layers: ["F.Cu", "In1.Cu", "B.Cu", "F.Mask", "F.SilkS", "B.SilkS", "Edge.Cuts", "F.Fab"].map((name) => ({
        name,
        color: "#888888",
        visible: true,
        highlighted: false,
      })),
      objectOpacity: { tracks: 1, vias: 1, pads: 1, zones: 1 },
      objectVisibility: {
        references: true,
        values: true,
        footprintText: true,
        hiddenText: false,
        padNumbers: true,
        padNetNames: true,
        trackNetNames: true,
      },
      highlightTracks: true,
    };
    const element = fakeEcadViewer({ pcb: state });
    const viewer = new EcadViewer("pcb");
    viewer.attach(element);
    return { viewer, element };
  }

  it("groups layers by what they are on the board, under plain names", () => {
    const { viewer } = stubLayers();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    const copper = view.getByRole("region", { name: "Copper" });
    expect(copper.textContent).toContain("Inner 1");
    expect(copper.textContent).toContain("In1.Cu");
    expect(view.getByRole("region", { name: "Mechanical" }).textContent).toContain("Board outline");
  });

  it("starts with solder mask and fabrication folded", () => {
    const { viewer } = stubLayers();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    const heading = (name: string) =>
      within(view.getByRole("region", { name })).getAllByRole("button")[0]!;
    expect(heading("Copper").getAttribute("aria-expanded")).toBe("true");
    expect(heading("Solder mask").getAttribute("aria-expanded")).toBe("false");
    expect(heading("Fabrication").getAttribute("aria-expanded")).toBe("false");
    expect(view.queryByText("F.Fab")).toBeNull();

    fireEvent.click(heading("Fabrication"));
    expect(heading("Fabrication").getAttribute("aria-expanded")).toBe("true");
    expect(view.getByText("F.Fab")).toBeTruthy();
  });

  it("hides and shows a whole group through the per-layer call", () => {
    const { viewer, element } = stubLayers();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);

    fireEvent.click(view.getByRole("button", { name: "Hide all copper layers" }));
    expect(element.setPcbLayerVisibility).toHaveBeenCalledTimes(3);
    expect(element.setPcbLayerVisibility).toHaveBeenCalledWith("In1.Cu", false);
    expect(element.setPcbLayerVisibility).not.toHaveBeenCalledWith("F.SilkS", false);

    fireEvent.click(view.getByRole("button", { name: "Show all copper layers" }));
    expect(element.setPcbLayerVisibility).toHaveBeenLastCalledWith("B.Cu", true);
  });

  it("switches board side with the Top / Bottom presets", () => {
    const { viewer, element } = stubLayers();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    const side = view.getByRole("group", { name: "Board side" });
    fireEvent.click(within(side).getByRole("button", { name: "Bottom" }));
    expect(element.applyPcbLayerPreset).toHaveBeenCalledWith("back");
    fireEvent.click(within(side).getByRole("button", { name: "Top" }));
    expect(element.applyPcbLayerPreset).toHaveBeenCalledWith("front");
  });
});

describe("SchematicPageTree", () => {
  it("lists a viewer's pages and switches the element's page", () => {
    const pages = [
      { projectPath: "/root", sheetPath: "/", filename: "root.kicad_sch", name: "Root", depth: 0, active: true },
      { projectPath: "/root/power", sheetPath: "/power", filename: "power.kicad_sch", name: "Power",
        parentProjectPath: "/root", depth: 1, active: false },
    ];
    const { element, viewer } = adapted("sch", { pages });
    const view = render(<EcadViewerControls context="SCH" viewer={viewer} />);
    fireEvent.click(view.getByRole("button", { name: /Power/ }));
    expect(element.switchPage).toHaveBeenCalledWith("/root/power");
  });

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
      <SchematicPageTree pages={pages} />,
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

describe("EcadViewerControls inset toggle", () => {
  it("reflects the viewer's inset mode and toggles it", () => {
    const { element, viewer } = adapted("sch", { insets: true });
    const view = render(<EcadViewerControls context="SCH" viewer={viewer} />);
    const toggle = view.getByRole("button", { name: "Insets" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("title")).toBe("Insets · I");
    fireEvent.click(toggle);
    expect(element.setInsetMode).toHaveBeenCalledWith(true);
    expect(view.getByRole("button", { name: "Insets" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("follows a mode change made with the I key", () => {
    const { element, viewer } = adapted("pcb", { insets: true, pcb: null });
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    act(() => element.setInsetMode!(true));
    expect(view.getByRole("button", { name: "Insets" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("is hidden for a viewer without insets", () => {
    const { viewer } = stubPcbViewer();
    const view = render(<EcadViewerControls context="PCB" viewer={viewer} />);
    expect(view.queryByRole("button", { name: "Insets" })).toBeNull();
  });
});
