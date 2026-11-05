import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./part-sheet", () => ({
  PartSheet: ({ partId, onClose }: { partId: string; onClose: () => void }) => <button type="button" onClick={onClose}>Close {partId}</button>,
}));

import { KiCadPartPage, panelAddress } from "./kicad-part-page";

const replace = vi.fn();
afterEach(() => {
  cleanup();
  replace.mockReset();
  vi.unstubAllGlobals();
});

function stubLocation() {
  vi.stubGlobal("location", { ...window.location, replace });
}

describe("the part page inside KiCad", () => {
  it("shows the part alone and goes back to the panel's view of its component when closed", () => {
    stubLocation();
    render(<KiCadPartPage partId="p1" componentId="cmp-7" user={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Close p1" }));
    expect(replace).toHaveBeenCalledWith("/remote-provider/panel?component=cmp-7");
  });

  it("goes straight back to the panel when the address names no part", () => {
    stubLocation();
    render(<KiCadPartPage partId={null} componentId={null} user={null} />);
    expect(replace).toHaveBeenCalledWith("/remote-provider/panel");
  });

  it("builds the panel address with or without a component", () => {
    expect(panelAddress("a b")).toBe("/remote-provider/panel?component=a+b");
    expect(panelAddress(null)).toBe("/remote-provider/panel");
  });
});
