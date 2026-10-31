import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { BudgetConnector } from "@/types/supply";

import { BudgetDetail } from "./budget-view";
import { DayBar, daySegments } from "./call-day-bar";
import { CallBudget } from "./connector-card-parts";
import { connectorFixture } from "./supply-test-fixtures";

afterEach(cleanup);

const item: BudgetConnector = {
  connector_id: "c1", name: "DigiKey", provider: "digikey", enabled: true, shares_account: false, day: "2026-03-02",
  reset_in_seconds: 3 * 3600 + 120, daily_budget: 1000, committed: { capacity: 900, spent: 300 }, pool: { capacity: 100, spent: 20 },
  spare_spent: 5, free: { scheduled: 120, kept_for_people: 50, free: 40 }, spent: 325, refused_today: 2,
  tracking: { connector_id: "c1", name: "DigiKey", account: "a1", capacity: 900, committed: 450, free: 450, by_tier: {}, admitted: 380, waiting: 12 },
  notices: null,
  library: null,
  hourly: [{ hour: 1, kind: "offers", purpose: "tier1", calls: 40 }, { hour: 2, kind: "search", purpose: "interactive", calls: 20 }],
  days: [{ day: "2026-03-01", purpose: "tier1", calls: 500 }, { day: "2026-03-02", purpose: "tier1", calls: 300 }],
  searches_pending: 0,
  quotes: { parts: 0, of: 0 },
  owners: { projects: [{ project_id: "prj_1", project_name: "Power board", calls_a_day: 180 }], parts: [{ part_id: "p1", mpn: "LM358DR", manufacturer: "TI", tier: 1, calls_a_day: 1.18, pick_saves: 0.5 }] },
};

describe("the call budget", () => {
  it("says how many tracked parts the connector prices and how many it has still to search, and nothing when there are none", () => {
    const { container, rerender } = render(<MemoryRouter><BudgetDetail item={{ ...item, quotes: { parts: 12, of: 40 }, searches_pending: 1 }} /></MemoryRouter>);
    expect(container.textContent).toContain("Gives a price for 12 of 40 tracked parts.");
    expect(container.textContent).toContain("1 watched part has not been searched here yet.");
    rerender(<MemoryRouter><BudgetDetail item={item} /></MemoryRouter>);
    expect(container.textContent).not.toContain("Gives a price for");
    expect(container.textContent).not.toContain("not been searched");
  });

  it("shows each share, what tracking costs, what waits and what costs most, by project name", () => {
    render(<MemoryRouter><BudgetDetail item={{ ...item, owners: { ...item.owners, projects: [{ ...item.owners.projects[0], project_name: "Power board" }] } }} /></MemoryRouter>);
    const card = screen.getByLabelText("DigiKey call budget");
    expect(within(card).queryByRole("img", { name: /^Tracking \(committed\)/ })).toBeNull();
    expect(within(card).getByText(/Day resets in 3 h 2 min/)).toBeTruthy();
    expect(within(card).getByText("Tracking promises 450 of 900 calls a day, for 380 parts; 12 wait for room.")).toBeTruthy();
    expect(within(card).getByText("2 calls turned away today.")).toBeTruthy();
    expect(within(card).getByLabelText("Calls a day for the last two weeks")).toBeTruthy();
    expect(within(card).getByText(/Daily budget 1,000/)).toBeTruthy();
    expect(within(card).getByLabelText("What the days' calls were for").textContent).toContain("Tier 1");
    expect(within(card).getByLabelText("Calls a day for the last two weeks")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Power board" }).getAttribute("href")).toBe("/project/prj_1?section=supply");
    expect(within(card).getByRole("link", { name: "LM358DR" }).getAttribute("href")).toBe("/?section=supply&supplyView=part&part=p1");
  });

  it("opens under the connector card's calls bar from the chevron", () => {
    render(<CallBudget connector={connectorFixture()} detail={<p>the detail</p>} />);
    expect(screen.queryByText("the detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Calls today/ }));
    expect(screen.getByText("the detail")).toBeTruthy();
  });
});

describe("the day's bar", () => {
  it("splits the day into what was spent and what is left, and says what is free and when the day resets", () => {
    const card = { ...item, daily_budget: 1000, spent: 325, committed: { capacity: 900, spent: 300 }, pool: { capacity: 100, spent: 20 }, spare_spent: 5, free: { scheduled: 400, kept_for_people: 100, free: 150 } };
    render(<MemoryRouter><DayBar item={card} /></MemoryRouter>);
    const bar = screen.getByRole("img", { name: /^Today's calls:/ });
    expect(bar.getAttribute("aria-label")).toContain("Spent on tracking 300");
    expect(bar.getAttribute("aria-label")).toContain("Kept for scheduled work 400");
    expect(bar.getAttribute("aria-label")).toContain("Left today 150");
    expect(screen.getByText("150 calls left today. Resets in 3 h 2 min.")).toBeTruthy();
    expect(daySegments(card).reduce((sum, segment) => sum + segment.calls, 0)).toBe(1000);
  });

  it("never promises more than is left of the day", () => {
    const card = { ...item, daily_budget: 100, spent: 90, committed: { capacity: 90, spent: 80 }, pool: { capacity: 10, spent: 5 }, spare_spent: 5, free: { scheduled: 50, kept_for_people: 40, free: 30 } };
    expect(daySegments(card).reduce((sum, segment) => sum + segment.calls, 0)).toBeLessThanOrEqual(100);
    expect(daySegments(card).find((segment) => segment.id === "free")).toBeUndefined();
  });
});
