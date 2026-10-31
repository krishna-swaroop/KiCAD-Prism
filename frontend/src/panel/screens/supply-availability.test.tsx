import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PanelSupply, PanelSupplySummary } from "@/panel/lib/panel-api";
import { compactCount, summaryText } from "@/panel/lib/supply-summary";
import { SupplyAvailability, SupplyDot } from "./SupplyAvailability";

afterEach(cleanup);

const summary: PanelSupplySummary = {
  part_id: "p1", status: "ok", stock: 38200, distributors: 3, lifecycle: "active",
  unit_price: "3.05", price_quantity: 100, currency: "EUR", fetched_at: null, watched: true,
};

describe("the supply summary text", () => {
  it("says stock, distributors, lifecycle and price in one line", () => {
    expect(summaryText(summary)).toMatch(/^38\.2k at 3 distributors, Active, from .*3\.05.* × 100$/);
    expect(summaryText({ ...summary, distributors: 1, lifecycle: "unknown", unit_price: null })).toBe("38.2k at 1 distributor");
    expect(summaryText({ ...summary, stock: null })).toBe("Not read from distributors yet");
  });

  it("shortens big counts and leaves small ones exact", () => {
    expect([0, 999, 1000, 1500, 38200, 120000].map(compactCount)).toEqual(["0", "999", "1k", "1.5k", "38.2k", "120k"]);
  });
});

describe("the availability block", () => {
  const supply: PanelSupply = {
    sources: [],
    summary,
    risks: ["Could run out in about 11 days at the recent rate."],
    offers: [
      { connector: "TME", sku: "A", stock: 1200, marketplace: false, unit_price: "3.40", currency: "EUR", moq: 10, lead_time_days: null, product_url: "https://tme.example/a", fetched_at: null },
      { connector: "Mouser", sku: "B", stock: 9880, marketplace: true, unit_price: null, currency: "", moq: 1, lead_time_days: null, product_url: "", fetched_at: null },
    ],
    links: { component: "https://p/c", sourcing: "https://p/s", supply: "https://p/u" },
  };

  it("shows the standing, what to watch, who holds it, with a link out", () => {
    render(<SupplyAvailability supply={supply} />);
    expect(screen.getByText(/38\.2k at 3 distributors/)).toBeTruthy();
    expect(screen.getByText("Could run out in about 11 days at the recent rate.")).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Distributors" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("link", { name: "Open TME product page" }).getAttribute("href")).toBe("https://tme.example/a");
    expect(within(rows[1]).getByText("marketplace")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open in Prism/ }).getAttribute("href")).toBe("https://p/u");
  });

  it("shows nothing for a component Prism does not track", () => {
    render(<SupplyAvailability supply={{ sources: [] }} />);
    expect(screen.queryByTestId("supply-availability")).toBeNull();
  });

  it("gives a search row a status dot that says why", () => {
    render(<SupplyDot summary={{ ...summary, status: "error" }} />);
    expect(screen.getByRole("img", { name: "Supply status" }).getAttribute("title")).toMatch(/^38\.2k at 3 distributors/);
  });
});
