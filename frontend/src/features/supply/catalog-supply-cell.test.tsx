import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StoresState } from "@/types/supply";
import { CatalogSupplyCell } from "./catalog-supply-cell";
import { standingFixture } from "./supply-test-fixtures";

afterEach(cleanup);

describe("the catalog's Supply column", () => {
  it("shows the distributors' status, price and stock with what the stores hold", () => {
    const { container } = render(<CatalogSupplyCell standing={standingFixture({ status: "ok", stock: 12400, watched: true, unit_price: "0.5", currency: "EUR", local_available: 300, stores: { state: "stock", available: 300, since: null } })} />);
    expect(container.textContent).toContain("Dist 12,400 · Stores 300");
    expect(container.textContent).toContain("0.50");
    expect(container.textContent).not.toContain("Test data");
  });

  it("marks a price a simulated connector made up", () => {
    const { container } = render(<CatalogSupplyCell standing={standingFixture({ status: "ok", stock: 10, watched: true, unit_price: "0.5", currency: "EUR", test_data: true })} />);
    expect(container.textContent).toContain("€0.50Test data");
  });

  it("says a component is not tracked when only the stores know it", () => {
    const { container } = render(<CatalogSupplyCell standing={standingFixture({ status: "unknown", stock: null, watched: false, local_available: 40, stores: { state: "stock", available: 40, since: null } })} />);
    expect(screen.getByText("Not tracked")).toBeTruthy();
    expect(container.textContent).toContain("Stores 40");
  });

  it("tells none, not connected and a feed that is down apart", () => {
    const cell = (stores: StoresState) => render(<CatalogSupplyCell standing={standingFixture({ status: "unknown", stock: null, watched: false, stores })} />).container.textContent;
    expect(cell({ state: "none", available: null, since: null })).toContain("Stores None");
    cleanup();
    expect(cell({ state: "not_connected", available: null, since: null })).toContain("Stores Not connected");
    cleanup();
    expect(cell({ state: "down", available: 825, since: new Date().toISOString() })).toMatch(/Stores Feed down · \d{2}:\d{2}/);
  });

  it("shows a dash for a component nobody holds or tracks", () => {
    render(<CatalogSupplyCell standing={undefined} />);
    expect(screen.getByText("-")).toBeTruthy();
  });
});
