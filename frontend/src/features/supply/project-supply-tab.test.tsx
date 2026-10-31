import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSupply, ProjectSupplyPart } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getProjectSupply: vi.fn(),
  getProjectParts: vi.fn(),
  listSupplyConnectors: vi.fn(),
}));
vi.mock("./tracking-api", () => ({ keepUsualBuild: vi.fn(), readProjectBom: vi.fn() }));
vi.mock("./part-sheet", () => ({ PartSheet: ({ partId }: { partId: string | null }) => (partId ? <div role="dialog">Sheet of {partId}</div> : null) }));
vi.mock("./track-project-dialog", () => ({ TrackProjectButton: () => <button type="button">Track this project</button> }));

import { ProjectSupplyTab } from "./project-supply-tab";
import * as api from "./supply-api";
import { keepUsualBuild } from "./tracking-api";
import { bomRollupFixture, projectLineFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);

const rollup = bomRollupFixture({
  lines: 3, tracked: 2, not_tracked: 1, watched: 2, at_risk: 1, short: 1, priced: 2, lines_priced: 2, parts: 2,
  currency: "EUR", cost_build: "12.50", cost_per_board: "12.50", can_build: 400, limited_by: "k1", without_stock_data: 0,
  health: 7.4, health_status: "warning",
});

const supply = (overrides: Partial<ProjectSupply> = {}): ProjectSupply => ({
  available: true, variant: "", variants: [], rollup,
  parts: [
    projectLineFixture({ key: "k2", manufacturer: "Acme", mpn: "GOOD-1", quantity: 2, references: "R1 R2", part_id: "p2", state: "tracked", status: "ok", stock: 5000, lifecycle: "active", short: false, unit_price: "0.1", notes: 0, need: 200 }),
    projectLineFixture({ key: "k1", manufacturer: "Acme", mpn: "FLAKY-1", quantity: 1, references: "U1", part_id: "p1", state: "tracked", status: "error", stock: 0, lifecycle: "obsolete", short: true, unit_price: "1.2", notes: 2, need: 100 }),
  ],
  releases: [{
    build_id: "b1", tag: "v1.0", created_at: "2026-09-01T00:00:00Z", health: 9, status: "ok", parts: 2, needing_a_look: 0,
    changed_since: [{ part_id: "p1", manufacturer: "Acme", mpn: "FLAKY-1", was: "ok", now: "error" }],
  }],
  notes: [{ id: "n1", line_key: "k1", body: "Check the second source", author: "a@example.com", author_name: "Ana", created_at: "2026-10-02T00:00:00Z" }],
  ...overrides,
});

const renderTab = (role: "designer" | "viewer" = "designer") =>
  render(<MemoryRouter><ProjectSupplyTab projectId="prj" user={{ name: role, email: `${role}@example.com`, role }} /></MemoryRouter>);

/** The parts list the way the server gives it: a row for each part of the BOM with its line, a chip keeping its parts. */
function serve(lines: ProjectSupplyPart[]) {
  const keeps: Record<string, (line: ProjectSupplyPart) => boolean> = {
    out: (line) => line.part_id !== null && line.stock === 0, unchecked: (line) => line.state !== "tracked",
  };
  mocked.getProjectParts.mockImplementation(async (_project, asked) => {
    const kept = lines.filter((line) => !asked.chip || keeps[asked.chip](line));
    const items = kept.flatMap((line) => (line.part_id ? [{
      id: line.part_id, mpn: line.mpn, manufacturer: "Acme", status: line.status, problem: null, stock: line.stock, listings: 1,
      lifecycle: line.lifecycle, dropped: false, unit_price: "0.1", price_quantity: 100, currency: "EUR", fetched_at: null, tier: 1,
      used_in: 1, watch: null, flags: line.part_id === "p1" ? ["waiting"] : [], distributors: [], line,
    }] : []));
    return {
      items, total: items.length, limit: 100, offset: 0, next_offset: null,
      unmatched: !asked.chip || asked.chip === "unchecked" ? kept.filter((line) => !line.part_id) : [],
      chips: Object.entries(keeps).flatMap(([key, keep]) => (lines.some(keep) ? [{ key, count: lines.filter(keep).length }] : [])),
      forecast_state: { runout: "shown", out_4w: "shown", can_buy_4w: "shown", can_buy_8w: "shown" },
    } as never;
  });
}

/** The boards are set from the pencil on the Build tile. */
async function boardsTo(count: number) {
  fireEvent.click(await screen.findByRole("button", { name: "Change the number of boards" }));
  const field = await screen.findByLabelText("Boards to cost");
  fireEvent.change(field, { target: { value: String(count) } });
  fireEvent.blur(field);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getProjectSupply.mockResolvedValue(supply());
  mocked.listSupplyConnectors.mockResolvedValue([]);
  serve(supply().parts ?? []);
});
afterEach(cleanup);

describe("the project Supply tab", () => {
  it("lists the parts with their tracking, and the stats above", async () => {
    renderTab();
    const parts = await screen.findByRole("region", { name: "Parts" });
    await within(parts).findByText("GOOD-1");
    const rows = within(parts).getAllByRole("row").slice(1);
    const flaky = rows.find((row) => within(row).queryByText("FLAKY-1"))!;
    fireEvent.click(within(flaky).getByRole("button", { name: "FLAKY-1" }));
    expect(screen.getByRole("dialog").textContent).toBe("Sheet of p1");
    expect(within(flaky).getByRole("img", { name: "Queued for calls" })).toBeTruthy();
    expect(within(flaky).getByText("U1")).toBeTruthy();
    expect(screen.getByText("7.4 of 10")).toBeTruthy();
  });

  it("shows the releases with what changed since, and the line notes", async () => {
    renderTab();
    const releases = await screen.findByRole("region", { name: "Releases" });
    expect(within(releases).getByText("v1.0")).toBeTruthy();
    expect(within(releases).getByText(/is now/)).toBeTruthy();
    expect(within(releases).getByRole("link", { name: "Compliance CSV" }).getAttribute("href")).toContain("/releases/b1/compliance");
    const notes = screen.getByRole("region", { name: "Line notes" });
    expect(within(notes).getByText("Check the second source")).toBeTruthy();
    expect(within(notes).getByRole("link", { name: "FLAKY-1" })).toBeTruthy();
  });

  it("follows the cost of a board over time and names what rounding wastes", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({
      rollup: bomRollupFixture({ ...rollup, waste_cost: "3.20" }),
      cost_history: [
        { day: "2026-09-01", cost_per_board: "12.0000", currency: "EUR", boards: 100 },
        { day: "2026-10-01", cost_per_board: "13.5000", currency: "EUR", boards: 100 },
      ],
    }));
    renderTab();
    const history = await screen.findByRole("region", { name: "Cost over time" });
    expect(within(history).getByText(/up .*1\.5.* since 2026-09-01/)).toBeTruthy();
    expect(screen.getByText(/3\.20.* left over from minimum orders/)).toBeTruthy();
  });

  it("shows what the build costs at other sizes and where the money goes, and a bar opens the part", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({
      cost_curve: [
        { boards: 1, cost_per_board: "20.0000", cost_build: "20.00", currency: "EUR", short: 1, lines_priced: 2, lines: 3 },
        { boards: 100, cost_per_board: "12.5000", cost_build: "1250.00", currency: "EUR", short: 0, lines_priced: 2, lines: 3 },
      ],
      money: {
        lines: [{ key: "k1", part_id: "p1", mpn: "FLAKY-1", manufacturer: "Acme", cost: "900.00", share: 0.72 }],
        other: { count: 4, cost: "350.00", share: 0.28 }, total: "1250.00",
      },
      cost_history: [
        { day: "2026-09-01", cost_per_board: "12.0000", currency: "EUR", boards: 100 },
        { day: "2026-10-01", cost_per_board: "13.5000", currency: "EUR", boards: 100 },
      ],
      cost_history_left_out: [{ day: "2026-09-15", cost_per_board: "99999.0000", currency: "EUR", boards: 100 }],
    }));
    renderTab();
    const curve = await screen.findByRole("region", { name: "Cost per board by build size" });
    expect(within(curve).getByText(/for one board/)).toBeTruthy();
    const money = screen.getByRole("region", { name: "Cost allocation" });
    expect(within(money).getByText("Other 4 lines · 28%")).toBeTruthy();
    expect(within(money).getByRole("button", { name: /FLAKY-1 · 72%/ })).toBeTruthy();
    expect(screen.getByText(/Left out as one price read wrong: 2026-09-15/)).toBeTruthy();
  });

  it("asks the server to sort by part, stock or price, as the Parts tab does, and to put the parts running out first", async () => {
    renderTab();
    const parts = await screen.findByRole("region", { name: "Parts" });
    await within(parts).findByText("FLAKY-1");
    fireEvent.click(within(parts).getByRole("button", { name: "Sort by Price" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ sort: "price:desc" }), expect.anything()));
    fireEvent.click(within(parts).getByRole("button", { name: "Runs out first" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ sort: "runout" }), expect.anything()));
    expect(within(parts).getByRole("button", { name: "Runs out first" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("asks the server to sort by the columns only the project has, over the whole project, and searches the project's parts", async () => {
    renderTab();
    const parts = await screen.findByRole("region", { name: "Parts" });
    await within(parts).findByText("FLAKY-1");
    fireEvent.click(within(parts).getByRole("button", { name: "Sort by Need" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ sort: "need:desc", offset: 0 }), expect.anything()));
    fireEvent.change(within(parts).getByLabelText("Search parts"), { target: { value: "flaky" } });
    fireEvent.click(within(parts).getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocked.getProjectParts).toHaveBeenLastCalledWith("prj", expect.objectContaining({ q: "flaky" }), expect.anything()));
  });

  it("sends the boards to the costing, and the file follows them", async () => {
    renderTab();
    await boardsTo(250);
    await waitFor(() => expect(mocked.getProjectSupply).toHaveBeenLastCalledWith("prj", "", 250, "", expect.anything()));
    expect((await screen.findByRole("link", { name: "Download the costing for 250 boards as a zip" })).getAttribute("href")).toBe("/api/supply/projects/prj/costing.zip?build_quantity=250");
  });

  it("answers whether the boards can be built and what stops it, and a chip filters the parts", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({
      rollup: bomRollupFixture({ ...rollup, can_build: 0, limited_by: "k1", at_risk: 1, needs_a_look: 2 }),
    }));
    renderTab();
    // One of the three lines is not tracked, so the answer stays open.
    expect(await screen.findByText("Unconfirmed")).toBeTruthy();
    expect(screen.getByText("0 of 100 boards · 1 unchecked")).toBeTruthy();
    expect(within(screen.getByLabelText("Headline")).getByRole("button", { name: "FLAKY-1" })).toBeTruthy();
    expect(screen.getByText(/1 at risk, 1 more need a look/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Not priced/ })).toBeNull();
    const parts = screen.getByRole("region", { name: "Parts" });
    await within(parts).findByText("GOOD-1");
    expect(within(parts).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(await screen.findByRole("button", { name: /Out of stock/ }));
    await waitFor(() => expect(within(parts).getAllByRole("row")).toHaveLength(2));
    expect(within(parts).getByText("FLAKY-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Out of stock/ }));
    await waitFor(() => expect(within(parts).getAllByRole("row")).toHaveLength(3));
  });

  it("opens at the project's usual build and offers to keep another size as the usual one", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({ build_quantity: 50, usual_build: 50 }));
    vi.mocked(keepUsualBuild).mockResolvedValue({ project_id: "prj", build_quantity: 200 });
    renderTab();
    expect(await screen.findByText(/of 50 boards/)).toBeTruthy();
    expect(mocked.getProjectSupply).toHaveBeenCalledWith("prj", "", undefined, "", expect.anything());
    expect(screen.queryByRole("button", { name: /as the usual build/ })).toBeNull();
    await boardsTo(200);
    fireEvent.click(await screen.findByRole("button", { name: "Keep 200 as the usual build" }));
    await waitFor(() => expect(keepUsualBuild).toHaveBeenCalledWith("prj", 200));
  });

  it("shows how much of the build the stock covers, line by line, instead of a forecast tile", async () => {
    renderTab();
    expect(await screen.findByText("Stock coverage")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/1 of 2 lines in stock for 100 boards, 1 short/)).toBeTruthy();
  });

  it("prices each line at the quantity the build buys, and shows what the line cost is made of", async () => {
    const base = supply();
    const parts = (base.parts ?? []).map((part) => (part.key === "k2" ? { ...part, unit_price: "0.93", buy_quantity: 20, line_cost: "18.60" } : part));
    mocked.getProjectSupply.mockResolvedValue(supply({ parts }));
    serve(parts);
    renderTab();
    const table = await screen.findByRole("region", { name: "Parts" });
    await within(table).findByText("GOOD-1");
    expect(within(table).getAllByText(/× 20/).length).toBeGreaterThan(0);
    expect(within(table).getByText(/20 × €0\.93/)).toBeTruthy();
  });

  it("counts a line without a part number as not covered, and lists it under Unchecked", async () => {
    const noMpn = projectLineFixture({ key: "none:796638-2|TB", manufacturer: "", mpn: "", quantity: 1, references: "J2", part_id: null, state: "no_mpn", status: null, stock: null, lifecycle: null, short: false, unit_price: null, notes: 0, need: 1 });
    const base = supply();
    mocked.getProjectSupply.mockResolvedValue(supply({ parts: [...(base.parts ?? []), noMpn] }));
    serve([...(base.parts ?? []), noMpn]);
    renderTab();
    expect(await screen.findByText("33%")).toBeTruthy();
    expect(screen.getByText(/1 of 3 lines in stock for 100 boards, 1 short/)).toBeTruthy();
    const parts = screen.getByRole("region", { name: "Parts" });
    await within(parts).findByText("GOOD-1");
    fireEvent.click(await screen.findByRole("button", { name: /Unchecked/ }));
    expect(await within(parts).findByText("No MPN")).toBeTruthy();
    await waitFor(() => expect(within(parts).queryByText("GOOD-1")).toBeNull());
    expect(screen.queryByText("In 8 weeks")).toBeNull();
  });

  it("leaves the spares to the project's tracking settings, and says which the cost has", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({ attrition_percent: 10 }));
    renderTab();
    expect(await screen.findByText(/10% spares/)).toBeTruthy();
    expect(screen.queryByLabelText("Spare parts, percent")).toBeNull();
    expect(mocked.getProjectSupply).toHaveBeenLastCalledWith("prj", "", undefined, "", expect.anything());
  });

  it("offers the costing as a file for a build size", async () => {
    renderTab();
    await boardsTo(250);
    expect(screen.getByRole("link", { name: "Download the costing for 250 boards as a zip" }).getAttribute("href")).toBe("/api/supply/projects/prj/costing.zip?build_quantity=250");
  });

  it("says when the BOM has not been read, offers to read it now, and still offers tracking", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({ available: false, parts: undefined, rollup: undefined, releases: [], notes: [] }));
    renderTab();
    expect(await screen.findByText("Not read")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read now" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Track this project" })).toBeTruthy();
  });

  it("reads the variant picked", async () => {
    mocked.getProjectSupply.mockResolvedValue(supply({ variants: ["Lite"] }));
    renderTab();
    fireEvent.change(await screen.findByLabelText("Design variant"), { target: { value: "Lite" } });
    await waitFor(() => expect(mocked.getProjectSupply).toHaveBeenLastCalledWith("prj", "Lite", undefined, "", expect.anything()));
  });

  it("is closed to a role without supply access, and never asks", () => {
    renderTab("viewer");
    expect(screen.getByText(/not available to your role/)).toBeTruthy();
    expect(mocked.getProjectSupply).not.toHaveBeenCalled();
  });

  it("reports a failure and retries", async () => {
    mocked.getProjectSupply.mockRejectedValueOnce(new Error("Backend is down")).mockResolvedValue(supply());
    renderTab();
    expect(await screen.findByText("Backend is down")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Parts" })).toBeTruthy();
  });
});
