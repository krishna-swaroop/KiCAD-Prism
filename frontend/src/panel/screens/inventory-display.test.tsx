import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryListScreen } from "./CategoryListScreen";
import { PartDetailScreen } from "./PartDetailScreen";
import { inventoryWarnings } from "@/lib/inventory-presentation";
import { getComponent, getComponentsByCategory, type PanelComponent, type PanelSupplySource } from "@/panel/lib/panel-api";

vi.mock("@/panel/lib/panel-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/panel/lib/panel-api")>(),
  getComponent: vi.fn(),
  getComponentsByCategory: vi.fn(),
}));
vi.mock("@/components/workspace/library-preview-inspector", () => ({
  LibraryPreviewPair: () => null,
}));

const noop = () => {};
const source = (overrides: Partial<PanelSupplySource> = {}): PanelSupplySource => ({
  id: "inventree", kind: "local", display_name: "InvenTree", stock: 200, uom: "pcs",
  stock_status: "available", fetch_status: "ok", fetched_at: "2026-01-01T00:00:00Z",
  ...overrides,
});
const component = (inventory: PanelSupplySource): PanelComponent => ({
  id: "part", slug: "part", name: "Inventory test", identity_kind: "mpn",
  manufacturer: "Prism", mpn: "P-1", description: "Inventory fixture", package_name: "", category: "Parts",
  datasheet_url: "", summary: "", version: "1", library_name: "", symbol_name: "",
  representations: [], assets: [], missing_assets: [], availability_state: "metadata_only", place_enabled: false,
  default_representation_id: "", effective_representation_id: "", preview_status: {},
  symbol_preview_url: "", footprint_preview_url: "", manifest_url: "", inline_url: "",
  supply: { sources: [inventory] },
});

describe("inventory presentation", () => {
  it("preserves all uncertainty reasons including unknown fetch failures", () => {
    expect(inventoryWarnings(source({ fetch_status: "Timeout", mixed_units: true, mixed_status: true })))
      .toEqual(["Sync failed", "Mixed units", "Mixed status"]);
    expect(inventoryWarnings(source({ mixed_fetch: true }))).toEqual(["Sync failed"]);
    expect(inventoryWarnings(source())).toEqual([]);
  });

  it.each([
    ["Sync failed", { fetch_status: "error" }],
    ["Mixed units", { mixed_units: true }],
    ["Mixed status", { mixed_status: true }],
  ] as const)("category stock does not turn green for %s", async (warning, overrides) => {
    vi.mocked(getComponentsByCategory).mockResolvedValue([component(source(overrides))]);
    render(<CategoryListScreen category="Parts" onBack={noop} onSelectComponent={noop}
      onAuthRequired={noop} appendLog={noop} />);
    const badge = await screen.findByTitle(warning);
    expect(badge.className).not.toContain("emerald");
    expect(badge).not.toHaveTextContent("200");
  });

  it("detail labels retained stock and partial freshness without a healthy badge", async () => {
    vi.mocked(getComponent).mockResolvedValue(component(source({
      fetch_status: "error", mixed_fetch: true, mixed_status: true, mixed_freshness: true,
    })));
    render(<PartDetailScreen componentId="part" onBack={noop} appendLog={noop} />);
    expect(await screen.findByText("Last known on hand")).toBeInTheDocument();
    expect(screen.getByText(/Latest location update/)).toBeInTheDocument();
    const badge = screen.getByText("Sync failed · Mixed status");
    expect(badge.className).not.toContain("emerald");
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("200")).toBeInTheDocument());
  });

  it("detail suppresses numeric zero for mixed units", async () => {
    vi.mocked(getComponent).mockResolvedValue(component(source({ stock: 0, mixed_units: true })));
    render(<PartDetailScreen componentId="part" onBack={noop} appendLog={noop} />);
    expect(await screen.findAllByText("Mixed units")).toHaveLength(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
