import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectPartsPage, ProjectSupplyPart } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getProjectParts: vi.fn(),
  listSupplyConnectors: vi.fn(),
}));

import { ProjectPartsList } from "./project-parts-list";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

afterEach(cleanup);

const line = (key: string, mpn: string, part_id: string | null, extra: Partial<ProjectSupplyPart> = {}): ProjectSupplyPart => ({
  key, manufacturer: "Acme", mpn, quantity: 2, references: "R1", part_id, state: "tracked", status: "ok", stock: 100, lifecycle: "active",
  short: false, unit_price: "0.1", notes: 0, need: 200, line_cost: "1.00", ...extra,
} as ProjectSupplyPart);

const row = (id: string, mpn: string, of: ProjectSupplyPart) => ({
  id, mpn, manufacturer: "Acme", status: "ok", problem: null, stock: 100, listings: 1, lifecycle: "active", dropped: false, unit_price: "0.1",
  price_quantity: 100, currency: "EUR", fetched_at: null, tier: 1, used_in: 1, watch: null, flags: [], distributors: [], line: of,
});

const page = (overrides: Partial<ProjectPartsPage> = {}): ProjectPartsPage => ({
  items: [row("a", "RISKY-1", line("ka", "RISKY-1", "a", { stock: 0, short: true })), row("b", "SAFE-1", line("kb", "SAFE-1", "b"))],
  total: 2, limit: 100, offset: 0, next_offset: null, unmatched: [line("kc", "NOPN", null)], chips: [{ key: "out", count: 1 }],
  forecast_state: { runout: "shown", out_4w: "shown", can_buy_4w: "shown", can_buy_8w: "shown" },
  ...overrides,
} as ProjectPartsPage);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listSupplyConnectors.mockResolvedValue([]);
  mocked.getProjectParts.mockResolvedValue(page());
});

const show = () => render(
  <MemoryRouter>
    <ProjectPartsList projectId="prj" variant="" boards={100} currency="EUR" selectedId={null} onOpen={() => undefined} />
  </MemoryRouter>,
);

describe("a project's parts list", () => {
  it("shows per board, need and stock side by side, also in the detailed layout", async () => {
    show();
    const risky = (await screen.findByText("RISKY-1")).closest("tr")!;
    expect(within(risky).getByText("2")).toBeTruthy();
    expect(within(risky).getByText("200")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Detailed, a row for each vendor" }));
    expect(screen.getByRole("columnheader", { name: /In stock/ }).textContent).toContain("In stock");
  });

  it("asks the server for a chip, the count it gives, and starts again at the first page", async () => {
    mocked.getProjectParts.mockResolvedValue(page({ total: 250, next_offset: 100 }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ offset: 100 }), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: /Out of stock/ }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ chip: "out", offset: 0 }), expect.anything()));
    expect(screen.getByRole("button", { name: /Out of stock/ }).textContent).toContain("1");
  });

  it("lists the lines no part matches after the parts", async () => {
    show();
    expect(await screen.findByText("NOPN")).toBeTruthy();
    mocked.getProjectParts.mockResolvedValue(page({ unmatched: [] }));
    fireEvent.change(screen.getByLabelText("Search parts"), { target: { value: "R1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ q: "R1" }), expect.anything()));
    await waitFor(() => expect(screen.queryByText("NOPN")).toBeNull());
  });
});
