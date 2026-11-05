import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PackagingOptions } from "@/types/supply";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./packaging-api", () => ({
  getPackagingOptions: vi.fn(), pickPackaging: vi.fn(), clearPackagingPick: vi.fn(), applySimilarPicks: vi.fn(),
}));

import * as api from "./packaging-api";
import { PackagingPickDialog } from "./packaging-pick-dialog";

const mocked = vi.mocked(api);

const options: PackagingOptions = {
  part_id: "p1", connector_id: "c1", package: "", picked: null, picked_by: "", note: "", saves_calls_a_day: 1,
  listings: [
    { id: "l1", sku: "C1", packaging: "cut_tape", moq: 1, order_multiple: 1, stock: 500, lead_time_days: null, marketplace: false, currency: "USD", prices: { "1": "0.5", "100": "0.4", "1000": "0.4" }, fetched_at: null, raw_mpn: "LM358D", other_number: false, reel_size: null, packaging_inferred: false, product_url: "" },
    { id: "l2", sku: "C2", packaging: "tape_reel", moq: 3000, order_multiple: 3000, stock: 9000, lead_time_days: null, marketplace: false, currency: "USD", prices: { "1": null, "100": null, "1000": null }, fetched_at: null, raw_mpn: "LM358D-T", other_number: true, reel_size: 3000, packaging_inferred: false, product_url: "" },
  ],
  can_unpin: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getPackagingOptions.mockResolvedValue(options);
});
afterEach(cleanup);

describe("picking a packaging", () => {
  it("lists the listings with chips, marks a different number and says what picking saves", async () => {
    mocked.pickPackaging.mockResolvedValue({ picked: "l2", packaging: "tape_reel", similar: [] });
    const changed = vi.fn();
    const closed = vi.fn();
    render(<PackagingPickDialog partId="p1" connectorId="c1" onClose={closed} onChanged={changed} />);
    const list = await screen.findByRole("list", { name: "Listings" });
    expect(screen.getByText(/saves 1.00 calls a day/)).toBeTruthy();
    expect(within(list).getAllByText("Different number")).toHaveLength(1);
    expect(within(list).getByText("9,000 in stock")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Follow C2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.pickPackaging).toHaveBeenCalledWith("p1", "c1", "l2"));
    await waitFor(() => expect(closed).toHaveBeenCalled());
    expect(changed).toHaveBeenCalled();
  });

  it("offers the same packaging for similar parts and applies only what is ticked", async () => {
    mocked.pickPackaging.mockResolvedValue({
      picked: "l2", packaging: "tape_reel",
      similar: [
        { part_id: "p2", connector_id: "c1", connector: "LCSC", mpn: "B", manufacturer: "Acme", listings: 2, saves_calls_a_day: 1, listing_id: "x", sku: "C9" },
        { part_id: "p3", connector_id: "c1", connector: "LCSC", mpn: "C", manufacturer: "Acme", listings: 2, saves_calls_a_day: 1, listing_id: "y", sku: "C8" },
      ],
    });
    mocked.applySimilarPicks.mockResolvedValue({ picked: 1 });
    render(<PackagingPickDialog partId="p1" connectorId="c1" onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Follow C2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const list = await screen.findByRole("list", { name: "Similar parts" });
    fireEvent.click(within(list).getByLabelText(/^C, Acme/));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1" }));
    await waitFor(() => expect(mocked.applySimilarPicks).toHaveBeenCalledWith("c1", "tape_reel", ["p2"]));
  });
});

describe("the packaging dialog", () => {
  it("starts with only the picked listing ticked, shows the case, and unticking it follows every listing again", async () => {
    mocked.getPackagingOptions.mockResolvedValue({ ...options, picked: "l1", package: "SOT-23" });
    mocked.clearPackagingPick.mockResolvedValue(undefined as never);
    const changed = vi.fn();
    render(<PackagingPickDialog partId="p1" connectorId="c1" onClose={vi.fn()} onChanged={changed} />);
    const first = (await screen.findByRole("checkbox", { name: "Follow C1" })) as HTMLButtonElement;
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Follow C2" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getAllByText("SOT-23")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Pick / })).toBeNull();
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.clearPackagingPick).toHaveBeenCalledWith("p1", "c1"));
  });
});
