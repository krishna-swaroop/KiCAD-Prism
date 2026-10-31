import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComponentPart } from "@/types/supply";

const getComponentParts = vi.fn();
const decideAlternate = vi.fn();
const proposeAlternate = vi.fn();
vi.mock("./component-supply-api", () => ({
  getComponentParts: (id: string) => getComponentParts(id),
  decideAlternate: (...args: unknown[]) => decideAlternate(...args),
  proposeAlternate: (...args: unknown[]) => proposeAlternate(...args),
  removeAlternate: vi.fn(),
}));

import { ComponentPartsSection } from "./component-parts-section";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const part = (mpn: string, extra: Partial<ComponentPart> = {}): ComponentPart => ({
  part_id: mpn, role: "alternate", approval: "pending", manufacturer: "Vishay", mpn, created_by: "d@example.com",
  created_at: "2026-10-28T10:00:00Z", decided_by: "", decided_at: null, ...extra,
});
const parts = [part("MAIN-1", { role: "main", approval: "approved" }), part("ALT-1")];

describe("a component's parts", () => {
  it("lets a designer propose but not decide", async () => {
    getComponentParts.mockResolvedValue({ component_id: "c", parts });
    // A write is followed by a fresh read of the parts.
    proposeAlternate.mockImplementation(async () => { getComponentParts.mockResolvedValue({ component_id: "c", parts: [...parts, part("ALT-2")] }); });
    render(<ComponentPartsSection componentId="c" canPropose canDecide={false} />);
    expect(await screen.findByText("Main")).toBeTruthy();
    expect(screen.getByText("Waiting for QA")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve ALT-1" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Alternate part number"), { target: { value: "ALT-2" } });
    fireEvent.click(screen.getByRole("button", { name: /Propose alternate/ }));
    await waitFor(() => expect(proposeAlternate).toHaveBeenCalledWith("c", "", "ALT-2"));
    expect(await screen.findByText("ALT-2")).toBeTruthy();
  });

  it("lets QA approve an alternate, and never the main part", async () => {
    getComponentParts.mockResolvedValue({ component_id: "c", parts });
    decideAlternate.mockImplementation(async () => { getComponentParts.mockResolvedValue({ component_id: "c", parts: [parts[0], part("ALT-1", { approval: "approved" })] }); });
    render(<ComponentPartsSection componentId="c" canPropose={false} canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve ALT-1" }));
    await waitFor(() => expect(decideAlternate).toHaveBeenCalledWith("c", "ALT-1", true, "MAIN-1"));
    expect(await screen.findByText("Approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /MAIN-1/ })).toBeNull();
    expect(screen.queryByLabelText("Alternate part number")).toBeNull();
  });
});
