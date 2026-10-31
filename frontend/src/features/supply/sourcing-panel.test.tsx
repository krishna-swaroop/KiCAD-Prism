import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User, UserRole } from "@/types/auth";
import { partDetailFixture } from "./supply-test-fixtures";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./stock-chart", () => ({ default: () => <div role="img" aria-label="Stock over the last 90 days" /> }));
vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  findSupplyPart: vi.fn(),
  getSupplyPart: vi.fn(),
  getSupplyAssessment: vi.fn(),
}));
vi.mock("./tracking-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tracking-api")>()),
  followNumber: vi.fn(),
  getComponentFollow: vi.fn(),
}));

import SourcingPanel from "./sourcing-panel";
import * as api from "./supply-api";
import * as trackingApi from "./tracking-api";

const mocked = vi.mocked(api);
const tracking = vi.mocked(trackingApi);

function userWith(role: UserRole): User {
  return { name: role, email: `${role}@example.com`, role };
}

function renderPanel(role: UserRole = "designer", manufacturer = "Texas Instruments", mpn = "LM358D") {
  render(
    <MemoryRouter>
      <SourcingPanel componentId="cmp_1" manufacturer={manufacturer} mpn={mpn} user={userWith(role)} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.findSupplyPart.mockResolvedValue("p1");
  mocked.getSupplyPart.mockResolvedValue(partDetailFixture());
  tracking.getComponentFollow.mockResolvedValue(null);
});
afterEach(cleanup);

describe("the Supply tab", () => {
  it("shows the tracked part the way the part sheet does, with a link into Supply", async () => {
    renderPanel();
    expect(await screen.findByRole("region", { name: "Stock" })).toBeTruthy();
    expect(mocked.findSupplyPart).toHaveBeenCalledWith("Texas Instruments", "LM358D", expect.anything());
    expect(mocked.getSupplyPart).toHaveBeenCalledWith("p1", expect.anything());
    const link = screen.getByRole("link", { name: "Open in Supply Tracking" });
    expect(link.getAttribute("href")).toBe("/?section=supply&supplyView=tracking&part=p1");
  });

  it("keeps the component's own watch in reach whether or not something else already follows its part", async () => {
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ tracking: null }));
    renderPanel();
    expect(await screen.findByLabelText("Watch this component")).toBeTruthy();
    cleanup();
    mocked.getSupplyPart.mockResolvedValue(partDetailFixture({ tracking: { tier: 1, rate: "daily", reasons: [] } }));
    renderPanel();
    expect(await screen.findByLabelText("Watch this component")).toBeTruthy();
  });

  it("offers to watch a part Prism does not know yet, then shows it", async () => {
    mocked.findSupplyPart.mockResolvedValueOnce(null);
    tracking.followNumber.mockResolvedValue({ part_id: "p1", manufacturer: "Texas Instruments", mpn: "LM358D", tier: 2, rate: "weekly", threshold: null, pinned: false, owner: "x", packaging: "any" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Watch this part" }));
    await waitFor(() => expect(tracking.followNumber).toHaveBeenCalledWith({ manufacturer: "Texas Instruments", mpn: "LM358D" }));
    expect(await screen.findByRole("region", { name: "Stock" })).toBeTruthy();
  });

  it("offers QA to watch a part, as everyone who reads supply", async () => {
    mocked.findSupplyPart.mockResolvedValueOnce(null);
    renderPanel("qa");
    expect(await screen.findByRole("button", { name: "Watch this part" })).toBeTruthy();
  });

  it("asks for a part number before it looks anything up", () => {
    renderPanel("designer", "Texas Instruments", " ");
    expect(screen.getByText(/needs a manufacturer and a manufacturer part number/)).toBeTruthy();
    expect(mocked.findSupplyPart).not.toHaveBeenCalled();
  });

  it("shows a failed lookup with a retry", async () => {
    mocked.findSupplyPart.mockRejectedValueOnce(new Error("Could not look the part up"));
    renderPanel();
    expect(await screen.findByText("Could not look the part up")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Stock" })).toBeTruthy();
  });
});
