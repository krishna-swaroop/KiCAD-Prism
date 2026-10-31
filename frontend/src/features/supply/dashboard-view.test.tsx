import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";
import { alertFixture, dashboardFixture } from "./supply-test-fixtures";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getSupplyDashboard: vi.fn(),
  listSupplyAlerts: vi.fn(),
  listSupplyParts: vi.fn(),
  getSupplyReviewQueue: vi.fn(),
  acknowledgeSupplyAlert: vi.fn(),
  snoozeSupplyAlert: vi.fn(),
}));
vi.mock("./ending-api", () => ({ getEndingParts: vi.fn(async () => ({ items: [], tracked: 0, more: 0 })) }));
vi.mock("./part-sheet", () => ({ PartSheet: ({ partId }: { partId: string | null }) => (partId ? <div>Sheet of {partId}</div> : null) }));

import * as api from "./supply-api";
import { DashboardView } from "./dashboard-view";
import { reviewQueueFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);
const user: User = { name: "Ana", email: "ana@example.com", role: "designer" };

function Location() {
  return <output aria-label="location">{useLocation().search}</output>;
}

function renderView() {
  render(
    <MemoryRouter initialEntries={["/?section=supply&part=old&partsQ=x"]}>
      <DashboardView user={user} />
      <Location />
    </MemoryRouter>,
  );
}

const atRiskTile = () => screen.findByRole("button", { name: /^At risk\s*\d/ });
const search = () => screen.getByLabelText("location").textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getSupplyDashboard.mockResolvedValue(dashboardFixture());
  mocked.listSupplyAlerts.mockResolvedValue({ items: [alertFixture({ id: 1, kind: "out_of_stock", severity: "error", mpn: "OOS-1", detail: { stock: 0 } })] });
  mocked.listSupplyParts.mockResolvedValue({ items: [], total: 3, limit: 50, offset: 0, next_offset: null, forecast_state: {} });
  mocked.getSupplyReviewQueue.mockResolvedValue(reviewQueueFixture({ aliases: [], listings: [], counts: { aliases: 1, unresolved: 2, near: 1 }, manufacturers: [] }));
});
afterEach(cleanup);

describe("the dashboard", () => {
  it("counts what needs a person, and lists the alerts under it", async () => {
    renderView();
    const tile = await atRiskTile();
    expect(within(tile).getByText("2")).toBeTruthy();
    expect(screen.getByText("Queued for calls").closest("button")!.textContent).toContain("3");
    expect(await screen.findByText("OOS-1")).toBeTruthy();
  });

  it("opens the place that deals with each count", async () => {
    renderView();
    fireEvent.click(await atRiskTile());
    expect(search()).toContain("supplyView=tracking");
    expect(search()).toContain("partsOnly=at_risk");
    expect(search()).not.toContain("partsQ");
    fireEvent.click(screen.getByText("Queued for calls").closest("button")!);
    expect(search()).toContain("partsScope=waiting");
  });

  it("shows how each figure moved and draws the charts, each opening the parts behind it", async () => {
    renderView();
    const tile = await atRiskTile();
    expect(tile.textContent).toContain("1 in 7 days");
    fireEvent.click(await screen.findByRole("button", { name: "Under 2 weeks: 1" }));
    expect(search()).toContain("partsOnly=runs_out_2w");
    fireEvent.click(screen.getByRole("button", { name: "Not recommended for new designs, 2+ distributors: 0" }));
    expect(search()).not.toContain("partsOnly=risk");
    fireEvent.click(screen.getByRole("button", { name: "Not recommended for new designs, Out: 1" }));
    expect(search()).toContain("partsOnly=risk%3Anrnd.out");
    fireEvent.click(screen.getByRole("button", { name: "Active, One distributor: 1" }));
    expect(search()).toContain("partsOnly=risk%3Aactive.one");
  });

  it("has no Ending in library tile: ending parts are notifications on the Dashboard itself", async () => {
    mocked.getSupplyDashboard.mockResolvedValue(dashboardFixture({ ending_components: 3 }));
    renderView();
    await atRiskTile();
    expect(screen.queryByText("Ending in library")).toBeNull();
  });

  it("has no chart and table switch", async () => {
    renderView();
    const card = await screen.findByRole("region", { name: "Projected stock" });
    expect(within(card).getByText("Steady or rising")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /as a table/ })).toBeNull();
  });

  it("narrows the alerts by kind", async () => {
    mocked.listSupplyAlerts.mockResolvedValue({ items: [
      alertFixture({ id: 1, kind: "out_of_stock", severity: "error", mpn: "OOS-1", detail: { stock: 0 } }),
      alertFixture({ id: 2, kind: "pcn", severity: "warning", mpn: "PCN-1", detail: { title: "Change" } }),
    ] });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Change notice 1" }));
    expect(screen.queryByText("OOS-1")).toBeNull();
    expect(screen.getByText("PCN-1")).toBeTruthy();
  });

  it("lists the dates that cannot be missed, soonest first, and the tracked projects", async () => {
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    mocked.getSupplyDashboard.mockResolvedValue(dashboardFixture({
      deadlines: [{ part_id: "p7", mpn: "OLD-7", manufacturer: "Acme", kind: "last_time_buy", date: soon, source: "notice", url: "" }],
      projects: [{
        project_id: "prj_1", project_name: "Power board", count: 3, statuses: { error: 1, ok: 2 },
        stats: { at_risk: 1, out: 0, end_of_life: 0, one_distributor: 2, runs_out_soon: 0, boards: 120, cost_per_board: "18.40", currency: "EUR", cost_change_percent: 3 },
      }],
    }));
    renderView();
    const deadlines = await screen.findByRole("region", { name: "Deadlines" });
    expect(within(deadlines).getByText("OLD-7")).toBeTruthy();
    expect(within(deadlines).getByText("in 20 days")).toBeTruthy();
    fireEvent.click(within(deadlines).getByRole("button", { name: "OLD-7" }));
    expect(search()).toContain("part=p7");
    expect(await screen.findByText("Sheet of p7")).toBeTruthy();
    const projects = screen.getByRole("region", { name: "Tracked projects" });
    expect(within(projects).getByRole("link", { name: "Power board" }).getAttribute("href")).toBe("/project/prj_1?section=supply");
    expect(within(projects).getByText("120")).toBeTruthy();
  });

  it("lists the open alerts the tile counts, and the acknowledged ones only with the cleared", async () => {
    mocked.listSupplyAlerts.mockResolvedValue({ items: [
      alertFixture({ id: 1, kind: "out_of_stock", severity: "error", mpn: "OOS-1", detail: { stock: 0 } }),
      alertFixture({ id: 2, kind: "out_of_stock", severity: "error", mpn: "SEEN-1", state: "acknowledged", detail: { stock: 0 } }),
    ] });
    renderView();
    expect(await screen.findByText("OOS-1")).toBeTruthy();
    expect(screen.queryByText("SEEN-1")).toBeNull();
    fireEvent.click(screen.getByLabelText("Show cleared"));
    expect(await screen.findByText("SEEN-1")).toBeTruthy();
  });

  it("shows a tracked project's boards as unconfirmed while a line is unchecked, and the build its cost is for", async () => {
    mocked.getSupplyDashboard.mockResolvedValue(dashboardFixture({
      projects: [{
        project_id: "prj_2", project_name: "Trigger board", count: 17, statuses: { ok: 17 },
        stats: { at_risk: 0, out: 0, end_of_life: 0, one_distributor: 17, runs_out_soon: 0, boards: 247, cost_per_board: "128.265", currency: "EUR", build_quantity: 10, unchecked: 1 },
      }],
    }));
    renderView();
    const projects = await screen.findByRole("region", { name: "Tracked projects" });
    expect(within(projects).getByText("Unconfirmed")).toBeTruthy();
    expect(within(projects).getByText("247 · 1 unchecked")).toBeTruthy();
    expect(within(projects).getByText("× 10")).toBeTruthy();
  });

  it("has no inbox: the tiles, cards and alerts below say the same", async () => {
    renderView();
    await atRiskTile();
    expect(screen.queryByRole("region", { name: "Inbox" })).toBeNull();
  });

  it("opens a part from an alert", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "OOS-1" }));
    expect(search()).not.toContain("supplyView=tracking");
    expect(search()).toContain("part=");
    expect((await screen.findByText(/^Sheet of /)).textContent).toMatch(/^Sheet of \S+/);
  });

  it("tells a new workspace what to do first", async () => {
    mocked.getSupplyDashboard.mockResolvedValue(dashboardFixture({ figures: { watched: 0, at_risk: 0, out_of_stock: 0, lifecycle: 0, open_alerts: 0, waiting: 0 }, connectors: 0 }));
    mocked.listSupplyAlerts.mockResolvedValue({ items: [] });
    renderView();
    expect(await screen.findByText(/No distributor is connected/)).toBeTruthy();
  });

  it("reports a failure and retries", async () => {
    mocked.getSupplyDashboard.mockRejectedValueOnce(new Error("Backend is down")).mockResolvedValue(dashboardFixture());
    renderView();
    expect(await screen.findByText("Backend is down")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await atRiskTile()).toBeTruthy();
  });
});
