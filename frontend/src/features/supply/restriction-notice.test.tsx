import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const getComponentsStatus = vi.fn();
const clearRestriction = vi.fn();
vi.mock("./catalog-supply-api", () => ({ getComponentsStatus: (...args: unknown[]) => getComponentsStatus(...args) }));
vi.mock("./ending-api", () => ({ clearRestriction: (id: string) => clearRestriction(id) }));

import { RestrictionNotice } from "./restriction-notice";
import { forgetServerState } from "@/lib/server-state";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the Not for new designs mark on a component's Supply tab", () => {
  it("shows the mark, and QA clears it", async () => {
    getComponentsStatus.mockResolvedValue({ c1: { status: "warning", stock: 1, watched: true, restriction: "not_for_new_designs" } });
    clearRestriction.mockImplementation(async () => { getComponentsStatus.mockResolvedValue({ c1: { status: "warning", stock: 1, watched: true, restriction: null } }); });
    render(<RestrictionNotice componentId="c1" manufacturer="TI" mpn="LM358" canDecide />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear mark" }));
    await waitFor(() => expect(clearRestriction).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("Not for new designs")).toBeNull());
  });

  it("shows nothing for an unmarked component, and no Clear to someone who cannot decide", async () => {
    getComponentsStatus.mockResolvedValue({ c1: { status: "ok", stock: 1, watched: true, restriction: "not_for_new_designs" } });
    render(<RestrictionNotice componentId="c1" manufacturer="TI" mpn="LM358" canDecide={false} />);
    expect(await screen.findByText("Not for new designs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear mark" })).toBeNull();
    cleanup();
    forgetServerState([]);
    getComponentsStatus.mockResolvedValue({});
    const { container } = render(<RestrictionNotice componentId="c1" manufacturer="TI" mpn="LM358" canDecide />);
    await waitFor(() => expect(getComponentsStatus).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
