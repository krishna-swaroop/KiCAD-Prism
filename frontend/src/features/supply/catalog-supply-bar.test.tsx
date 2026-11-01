import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("./catalog-supply-api", () => ({ watchCatalogComponents: vi.fn(), previewTrackComponents: vi.fn() }));

import { CatalogSupplyBar } from "./catalog-supply-bar";
import { passesSupplyFilter, supplyFilterFrom } from "./catalog-supply-filter";
import * as api from "./catalog-supply-api";
import { toast } from "sonner";
import { standingFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);
const rows = [
  { id: "c1", manufacturer: "Acme", mpn: "A-1" },
  { id: "c2", manufacturer: "Acme", mpn: "A-2" },
  { id: "c3", manufacturer: "", mpn: "" },
];
const standing = { c1: standingFixture({ status: "ok", stock: 10, watched: true }), c2: standingFixture({ status: "error", stock: 0, watched: false }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.watchCatalogComponents.mockResolvedValue({ watched: 1, skipped: 0 });
  mocked.previewTrackComponents.mockResolvedValue({ fits_nowhere: false, connectors: [] });
});

const WEEKLY = { tier: 2, rate: "weekly" };
const confirm = async () => fireEvent.click(await screen.findByRole("button", { name: /^Track \(\d+\)$/ }));
afterEach(cleanup);

describe("the catalog supply filters", () => {
  it("passes watched and at-risk components, and nothing Prism does not track", () => {
    expect(passesSupplyFilter("", undefined)).toBe(true);
    expect(passesSupplyFilter("watched", standing.c1)).toBe(true);
    expect(passesSupplyFilter("watched", standing.c2)).toBe(false);
    expect(passesSupplyFilter("at_risk", standing.c2)).toBe(true);
    expect(passesSupplyFilter("at_risk", undefined)).toBe(false);
    expect(supplyFilterFrom("at_risk")).toBe("at_risk");
    expect(supplyFilterFrom("junk")).toBe("");
  });

  it("toggles a filter on and off", () => {
    const onFilter = vi.fn();
    const { rerender } = render(<CatalogSupplyBar filter="" onFilter={onFilter} rows={rows} standing={standing} role="designer" onChanged={() => undefined} picked={new Set()} onClearPicks={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "At risk" }));
    expect(onFilter).toHaveBeenLastCalledWith("at_risk");
    rerender(<CatalogSupplyBar filter="at_risk" onFilter={onFilter} rows={rows} standing={standing} role="designer" onChanged={() => undefined} picked={new Set()} onClearPicks={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "At risk" }));
    expect(onFilter).toHaveBeenLastCalledWith("");
  });

  it("watches the shown components that are not watched yet and have a part number", async () => {
    const changed = vi.fn();
    render(<CatalogSupplyBar filter="" onFilter={() => undefined} rows={rows} standing={standing} role="designer" onChanged={changed} picked={new Set()} onClearPicks={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Track 1 shown/ }));
    await confirm();
    await waitFor(() => expect(mocked.watchCatalogComponents).toHaveBeenCalledWith([{ id: "c2", manufacturer: "Acme", mpn: "A-2" }], WEEKLY));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it("says how many were left out and why", async () => {
    mocked.watchCatalogComponents.mockResolvedValue({ watched: 1, skipped: 2 });
    render(<CatalogSupplyBar filter="" onFilter={() => undefined} rows={rows} standing={standing} role="designer" onChanged={() => undefined} picked={new Set()} onClearPicks={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Track 1 shown/ }));
    await confirm();
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Tracking 1 part", { description: expect.stringContaining("2 left out") }));
  });

  it("watches only the picked rows when some are picked", async () => {
    const cleared = vi.fn();
    render(<CatalogSupplyBar filter="" onFilter={() => undefined} rows={rows} standing={{}} role="designer" onChanged={() => undefined} picked={new Set(["c2"])} onClearPicks={cleared} />);
    fireEvent.click(screen.getByRole("button", { name: /Track 1 picked/ }));
    await confirm();
    await waitFor(() => expect(mocked.watchCatalogComponents).toHaveBeenCalledWith([{ id: "c2", manufacturer: "Acme", mpn: "A-2" }], WEEKLY));
    await waitFor(() => expect(cleared).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Clear picks" }));
    expect(cleared).toHaveBeenCalledTimes(2);
  });

  it("offers tracking to QA too, and nothing at all to a role without supply access", () => {
    const { rerender, container } = render(<CatalogSupplyBar filter="" onFilter={() => undefined} rows={rows} standing={standing} role="qa" onChanged={() => undefined} picked={new Set()} onClearPicks={() => undefined} />);
    expect(screen.getByRole("button", { name: /Track 1 shown/ })).toBeTruthy();
    rerender(<CatalogSupplyBar filter="" onFilter={() => undefined} rows={rows} standing={standing} role="viewer" onChanged={() => undefined} picked={new Set()} onClearPicks={() => undefined} />);
    expect(container.textContent).toBe("");
  });
});

describe("the In local stock filter", () => {
  it("keeps components the local inventory can supply now", () => {
    expect(supplyFilterFrom("local_stock")).toBe("local_stock");
    expect(passesSupplyFilter("local_stock", standingFixture({ status: "unknown", stock: null, watched: false, local_available: 300 }))).toBe(true);
    expect(passesSupplyFilter("local_stock", standingFixture({ status: "ok", stock: 10, watched: true, local_available: 0 }))).toBe(false);
    expect(passesSupplyFilter("local_stock", standingFixture({ status: "ok", stock: 10, watched: true }))).toBe(false);
    expect(passesSupplyFilter("local_stock", undefined)).toBe(false);
  });
});
