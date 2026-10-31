import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


vi.mock("./supply-api", () => ({ decideWaiver: vi.fn(), decideSource: vi.fn() }));
vi.mock("./component-supply-api", () => ({ decideAlternate: vi.fn() }));
vi.mock("./ending-api", () => ({ decideDismissal: vi.fn() }));
vi.mock("./tracking-api", () => ({ decideMute: vi.fn() }));

import * as componentApi from "./component-supply-api";
import * as endingApi from "./ending-api";
import * as trackingApi from "./tracking-api";
import * as api from "./supply-api";
import { ToApprove } from "./to-approve";
import { toApproveFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);
const items = toApproveFixture({
  waivers: [{ id: "w1", part_id: "p1", mpn: "LM358D", manufacturer: "TI", check_id: "single_source", scope: "x", reason: "Second source qualified", proposed_by: "dee@example.com", proposed_at: "2026-10-16T10:00:00Z" }],
});

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(cleanup);

describe("waiting for approval", () => {
  it("lists alerts someone asked to switch off and decides them", async () => {
    vi.mocked(trackingApi.decideMute).mockResolvedValue(undefined);
    const asked = toApproveFixture({
      waivers: [],
      mutes: [{ id: "m1", part_id: "p3", mpn: "BAT54", manufacturer: "Nexperia", kind: "price_up", proposed_by: "dee@example.com", proposed_at: "2026-10-16T10:00:00Z" }],
    });
    render(<MemoryRouter><ToApprove items={asked} canDecide onDecided={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    expect(screen.getByText(/price up \(dee@example.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(trackingApi.decideMute).toHaveBeenCalledWith("m1", true));
  });

  it("lists dismissals someone asked for with their reasons and decides them", async () => {
    vi.mocked(endingApi.decideDismissal).mockResolvedValue(undefined);
    const decided = vi.fn().mockResolvedValue(undefined);
    const asked = toApproveFixture({
      waivers: [],
      dismissals: [{ id: "d1", component_id: "cmp-2", component_name: "Op amp", component_mpn: "LM358", reasons: ["last_time_buy"],
        proposed_by: "dee@example.com", proposed_at: "2026-10-16T10:00:00Z" }],
    });
    render(<MemoryRouter><ToApprove items={asked} canDecide onDecided={decided} /></MemoryRouter>);
    expect(screen.getByText(/last time buy \(dee@example.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(endingApi.decideDismissal).toHaveBeenCalledWith("d1", false));
    expect(screen.getByRole("link", { name: "Op amp" }).getAttribute("href")).toContain("component=cmp-2");
  });

  it("lists waivers and decides in one click", async () => {
    mocked.decideWaiver.mockResolvedValue(undefined);
    const decided = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><ToApprove items={items} canDecide onDecided={decided} /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
    await waitFor(() => expect(mocked.decideWaiver).toHaveBeenCalledWith("w1", true));
    await waitFor(() => expect(decided).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "LM358D, TI" }).getAttribute("href")).toContain("part=p1");
  });

  it("lists alternates proposed for a component, links the component and decides them", async () => {
    vi.mocked(componentApi.decideAlternate).mockResolvedValue({} as never);
    const decided = vi.fn().mockResolvedValue(undefined);
    const alternates = toApproveFixture({
      waivers: [],
      alternates: [{ component_id: "cmp-1", component_name: "R 10k 0603", component_mpn: "RC0603", part_id: "p9", mpn: "ERJ-3EKF1002V",
        manufacturer: "Panasonic", proposed_by: "dee@example.com", proposed_at: "2026-10-16T10:00:00Z", main_part_id: "p1", main_mpn: "RC0603FR-0710KL" }],
    });
    render(<MemoryRouter><ToApprove items={alternates} canDecide onDecided={decided} /></MemoryRouter>);
    expect(screen.getByText("Alternate")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ERJ-3EKF1002V, Panasonic for R 10k 0603" }).getAttribute("href")).toContain("component=cmp-1");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText(/vs RC0603FR-0710KL/)).toBeTruthy();
    await waitFor(() => expect(componentApi.decideAlternate).toHaveBeenCalledWith("cmp-1", "p9", false, "p1"));
    await waitFor(() => expect(decided).toHaveBeenCalledTimes(1));
  });

  it("shows nothing when nothing waits, and no buttons to those who may not decide", () => {
    const { container, rerender } = render(<MemoryRouter><ToApprove items={toApproveFixture()} canDecide onDecided={vi.fn()} /></MemoryRouter>);
    expect(container.textContent).toBe("");
    rerender(<MemoryRouter><ToApprove items={items} canDecide={false} onDecided={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
