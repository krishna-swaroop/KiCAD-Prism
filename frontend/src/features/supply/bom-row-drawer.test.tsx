import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupplyBomLineResult } from "@/types/supply";
import { BomRowDrawer } from "./bom-row-drawer";
import type { BomLineDetail } from "./bom-supply";

afterEach(cleanup);

const line = { key: "k", mpn: "LM358", manufacturer: "TI", references: ["U1"], quantity: 1 } as unknown as BomLineDetail;

function result(extra: Partial<SupplyBomLineResult>): SupplyBomLineResult {
  return { state: "tracked", part_id: "p1", need: 10, part_need: 10, status: "ok", stock: 500, lifecycle: "active", watched: true, ...extra } as SupplyBomLineResult;
}

function renderDrawer(extra: Partial<SupplyBomLineResult>) {
  render(<BomRowDrawer lines={[line]} results={{ k: result(extra) }} canWatch={false} busyKey={null} onClose={vi.fn()} onWatch={vi.fn()} onOpenPart={vi.fn()} />);
}

describe("the BOM line drawer and the preferred distributor", () => {
  it("shows the preferred distributor first, with what it holds", () => {
    renderDrawer({ preferred: { connector_id: "c1", connector_name: "DigiKey", provider: "digikey", stock: 800 } });
    expect(screen.getByText(/Preferred:/).textContent).toContain("holds 800");
  });

  it("says why it is not used when the BOM is bought elsewhere", () => {
    renderDrawer({
      preferred: { connector_id: "c1", connector_name: "DigiKey", provider: "digikey", stock: 4 },
      buy: { quantity: 10, connector_name: "Mouser", provider: "mouser", sku: "M-1", unit_price: "0.1", currency: "EUR", extended: "1", covers: true, waste: 0 } as never,
    });
    expect(screen.getByText(/Preferred:/).textContent).toContain("not used for this build: not enough stock");
  });

  it("says nothing when no distributor is preferred", () => {
    renderDrawer({});
    expect(screen.queryByText(/Preferred:/)).toBeNull();
  });
});

describe("a BOM line no catalog component has", () => {
  it("offers the Component Database instead of a watch", () => {
    const onAddToLibrary = vi.fn();
    render(
      <BomRowDrawer lines={[line]} results={{ k: result({ state: "unknown", part_id: null, in_library: false }) }} canWatch busyKey={null}
        onClose={vi.fn()} onWatch={vi.fn()} onOpenPart={vi.fn()} onAddToLibrary={onAddToLibrary} />,
    );
    expect(screen.getByText("Not in the Component Database.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Watch this part/ })).toBeNull();
    screen.getByRole("button", { name: /Add to Component Database/ }).click();
    expect(onAddToLibrary).toHaveBeenCalledWith(line);
  });

  it("offers nothing to a user who cannot write the catalog", () => {
    render(
      <BomRowDrawer lines={[line]} results={{ k: result({ state: "unknown", part_id: null, in_library: false }) }} canWatch busyKey={null}
        onClose={vi.fn()} onWatch={vi.fn()} onOpenPart={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Add to Component Database|Watch this part/ })).toBeNull();
  });
});
