import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PrismSemanticViewerElement, PrismSemanticViewState } from "@/types/prism-semantic-viewer";

import { Semantic3dControls } from "./semantic-3d-controls";

const viewState: PrismSemanticViewState = {
  mode: "3d",
  layers: [{ id: 1, name: "F.Cu", color: "rgb(200 50 50)", visible: true }],
  boardLayers: [
    { role: "soldermask", side: "front", name: "F.Mask", color: "rgb(77 26 102)", visible: true },
    { role: "soldermask", side: "back", name: "B.Mask", color: "rgb(77 26 102)", visible: true },
    { role: "silkscreen", side: "front", name: "F.SilkS", color: "rgb(245 245 245)", visible: false },
    { role: "paste", side: "back", name: "B.Paste", color: "rgb(158 161 166)", visible: true },
  ],
  showBoard: true,
  showComponents: true,
  showPlaceholders: true,
  realisticColors: true,
  separation: 0,
  isolateNet: false,
  hasNet: false,
};

function viewer(state: PrismSemanticViewState) {
  const element = document.createElement("div") as unknown as PrismSemanticViewerElement;
  Object.assign(element, { getViewState: () => state, setBoardLayerVisible: vi.fn(), setLayerVisible: vi.fn() });
  return element;
}

describe("Semantic3dControls", () => {
  it("lists each side's mask, paste and silkscreen, and toggles one side", () => {
    const element = viewer(viewState);
    render(<Semantic3dControls viewer={element} />);
    const technical = screen.getByLabelText("Technical layers");
    expect(within(technical).getByText("B.Mask")).toBeTruthy();
    fireEvent.click(within(technical).getByRole("button", { name: "Hide B.Mask" }));
    expect(element.setBoardLayerVisible).toHaveBeenCalledWith("soldermask", "back", false);
    fireEvent.click(within(technical).getByRole("button", { name: "Show F.SilkS" }));
    expect(element.setBoardLayerVisible).toHaveBeenCalledWith("silkscreen", "front", true);
    // Copper stays in its own list, through its own call.
    expect(within(technical).queryByText("F.Cu")).toBeNull();
  });

  it("leaves technical layers out of the flat 2D layer view", () => {
    render(<Semantic3dControls viewer={viewer({ ...viewState, mode: "layer" })} />);
    expect(screen.queryByLabelText("Technical layers")).toBeNull();
  });
});
