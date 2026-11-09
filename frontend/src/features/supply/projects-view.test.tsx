import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";
import { connectorFixture, partRowFixture } from "./supply-test-fixtures";

vi.mock("./part-sheet", () => ({ PartSheet: () => null }));
vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  listSupplyPartGroups: vi.fn(),
  listSupplyParts: vi.fn(),
  listSupplyConnectors: vi.fn(),
}));

import * as api from "./supply-api";
import { ProjectsView } from "./projects-view";

const mocked = vi.mocked(api);
const designer: User = { name: "Dee", email: "dee@example.com", role: "designer" };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listSupplyConnectors.mockResolvedValue([connectorFixture({ id: "c-mouser", provider: "mouser", display_name: "Mouser EU", enabled: true })]);
  window.localStorage.clear();
});
afterEach(cleanup);

describe("the projects tab", () => {
  it("lists the projects closed, tracked first, and loads a project's parts when it is opened", async () => {
    mocked.listSupplyPartGroups.mockResolvedValue({
      items: [
        {
          project_id: "prj_1", project_name: "Power board", tracked: true, count: 3, statuses: { error: 1, ok: 2 },
          stats: {
            at_risk: 1, out: 0, end_of_life: 0, one_distributor: 2, runs_out_soon: 1, bom_read_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
            variants: ["", "Lite", "Pro"], packaging: "cut_tape", cost_per_board: "18.40", currency: "EUR", cost_change_percent: 3, boards: 120, alerts: 2,
          },
        },
        { project_id: "none", project_name: "Not in a project", tracked: false, count: 1, statuses: { ok: 1 }, stats: { at_risk: 0, out: 0, end_of_life: 0, one_distributor: 0, runs_out_soon: 0 } },
      ],
      total: 4,
    });
    mocked.listSupplyParts.mockResolvedValue({ items: [partRowFixture({ mpn: "LM324" })], total: 3, limit: 50, offset: 0, next_offset: null, forecast_state: {} });
    render(<MemoryRouter><ProjectsView user={designer} /></MemoryRouter>);
    const power = await screen.findByRole("button", { name: /Power board/ });
    expect(within(power).queryByText(/Tracked ·/)).toBeNull();
    expect(within(power).queryByText(/3 parts ·/)).toBeNull();
    expect(within(power).getByRole("img", { name: "Parts by status" })).toBeTruthy();
    expect(within(power).getByText(/a board ▲ 3% in 30 d · can build 120 · BOM read .* · 2 open alerts/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Power board's supply" }).getAttribute("href")).toBe("/project/prj_1?section=supply");
    expect(screen.queryByRole("button", { name: /Not in a project/ }), "parts in no project belong to the Parts tab").toBeNull();
    expect(mocked.listSupplyParts).not.toHaveBeenCalled();
    fireEvent.click(power);
    expect(await screen.findByRole("button", { name: "LM324" })).toBeTruthy();
    expect(mocked.listSupplyParts).toHaveBeenLastCalledWith("in_use", "", expect.anything(), "", 0, 50, "prj_1", "");
  });

  it("says so when no project uses a part", async () => {
    mocked.listSupplyPartGroups.mockResolvedValue({ items: [], total: 0 });
    render(<MemoryRouter><ProjectsView user={designer} /></MemoryRouter>);
    expect(await screen.findByText("No project uses a part Prism knows yet")).toBeTruthy();
  });

  it("narrows the projects' parts to one lifecycle", async () => {
    render(<MemoryRouter initialEntries={["/?projOnly=lifecycle_obsolete"]}><ProjectsView user={null} /></MemoryRouter>);
    await waitFor(() => expect(mocked.listSupplyPartGroups).toHaveBeenCalledWith("in_use", "", expect.anything(), "lifecycle_obsolete", ""));
  });

  it("narrows the projects' parts to one vendor", async () => {
    render(<MemoryRouter initialEntries={["/?projVendor=c-mouser"]}><ProjectsView user={null} /></MemoryRouter>);
    await waitFor(() => expect(mocked.listSupplyPartGroups).toHaveBeenCalledWith("in_use", "", expect.anything(), "", "c-mouser"));
  });
});
