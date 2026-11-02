import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalStock, LocalStockRow } from "@/types/supply";

const getLocalStock = vi.fn();
vi.mock("./component-supply-api", () => ({ getLocalStock: (id: string) => getLocalStock(id) }));

import { LocalStockSection } from "./local-stock-section";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const row = (key: string, extra: Partial<LocalStockRow> = {}): LocalStockRow => ({
  key, source: "Stores", source_id: "s", location: "WH1/A/01", quantity: 10, allocated: 0, status: "available", external: false,
  batch: "", uom: "", stale: false, fetched_at: "2026-10-28T10:00:00Z", updated_at: "", ...extra,
});
const stock = (extra: Partial<LocalStock>): LocalStock => ({ component_id: "c", uom: "", mixed_units: false, available: 0, held: 0, at_vendor: 0, rows: [], ...extra });

describe("a component's local stock", () => {
  it("totals what can be used, what is held and what is at a vendor, and marks stale and vendor rows", async () => {
    getLocalStock.mockResolvedValue(stock({
      available: 300, held: 50, at_vendor: 30,
      rows: [row("a", { quantity: 400, allocated: 100 }), row("b", { status: "on hold", quantity: 50, stale: true }), row("c", { external: true, quantity: 30, location: "EXT/VENDOR1" })],
    }));
    render(<LocalStockSection componentId="c" />);
    expect(await screen.findByText("300")).toBeTruthy();
    expect(screen.getByText("50", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Vendor")).toBeTruthy();
    expect(screen.getByText("Stale")).toBeTruthy();
  });

  it("shows nothing when the local inventory holds none", async () => {
    getLocalStock.mockResolvedValue(stock({}));
    const { container } = render(<LocalStockSection componentId="c" />);
    await vi.waitFor(() => expect(getLocalStock).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.querySelector("section")).toBeNull();
  });
});
