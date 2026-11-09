import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PartForecast, PartHistory } from "@/types/supply";
import { makeTip } from "./part-history-chart";
import { dailyBetween, forecastKeyOf, highKeyOf, historyRows, lowKeyOf, withDistributorForecasts, withForecast } from "./part-history-model";

afterEach(cleanup);

const HISTORY: PartHistory = {
  days: 90,
  currency: "EUR",
  connectors: [
    { connector_id: "c1", name: "DigiKey", provider: "digikey", last_read: "2026-03-01T08:00:00Z", stale: false, stock: [["2026-02-28", 50], ["2026-03-01", 40]], price: [["2026-02-28", 0.5], ["2026-03-01", 0.5]] },
  ],
  total: [["2026-02-28", 60], ["2026-03-01", 40]],
  events: [],
};

const FORECAST = {
  available: true, today: "2026-03-01", models: {},
  price: {
    now: 0.5, inputs: {},
    h30: { low: 0.45, median: 0.5, high: 0.6, flat: false, date: "2026-03-31", state: { state: "shown" } },
    h90: { low: 0.4, median: 0.55, high: 0.7, flat: false, date: "2026-05-30", state: { state: "shown" } },
  },
  by_distributor: {
    stock: [],
    price: [{ connector_id: "c1", now: 0.5, h30: { date: "2026-03-31", median: 0.52, low: 0.48, high: 0.58 }, h90: { date: "2026-05-30", median: 0.6, low: 0.5, high: 0.7 } }],
  },
} as unknown as PartForecast;

describe("a straight line between known days", () => {
  it("has a value for every day, the last included", () => {
    const days = dailyBetween([["2026-03-01", 10], ["2026-03-05", 18]]);
    expect(days).toEqual([["2026-03-02", 12], ["2026-03-03", 14], ["2026-03-04", 16], ["2026-03-05", 18]]);
    expect(dailyBetween([["2026-03-01", 1]])).toEqual([]);
  });
});

describe("the price projections", () => {
  it("fill every day to 90 days for each distributor and for the total, with their ranges", () => {
    const rows = historyRows(HISTORY, "price", new Set()).rows;
    withDistributorForecasts(HISTORY, "price", rows, FORECAST, new Set());
    const day = rows.find((row) => row.day === "2026-03-16");
    expect(typeof day?.[forecastKeyOf("c1")]).toBe("number");
    expect(day?.[lowKeyOf("c1")]).toBeLessThan(day?.[forecastKeyOf("c1")] as number);
    expect(day?.[highKeyOf("c1")]).toBeGreaterThan(day?.[forecastKeyOf("c1")] as number);
    expect(rows.filter((row) => String(row.day) > "2026-03-01" && String(row.day) <= "2026-05-30")).toHaveLength(90);
    const total = withForecast(HISTORY, "price", historyRows(HISTORY, "price", new Set()), FORECAST, new Set());
    expect(total.rows.find((row) => row.day === "2026-04-15")?.forecast).toBeGreaterThan(0.5);
    expect(total.rows.find((row) => row.day === "2026-05-30")?.forecast).toBeCloseTo(0.55);
  });
});

describe("the hover", () => {
  const Tip = makeTip((value) => value.toFixed(2));
  const row = { day: "2026-04-15", [lowKeyOf("c1")]: 0.49, [highKeyOf("c1")]: 0.61 };

  it("lists a distributor's projection after its last reading, marked projected with its range, and the total's forecast with its range", () => {
    render(<Tip active label="2026-04-15" payload={[
      { dataKey: forecastKeyOf("c1"), value: 0.55, name: "DigiKey", color: "#f00", payload: row },
      { dataKey: "forecast", value: 0.54, name: "Forecast", color: "#00f", payload: row },
      { dataKey: "band", value: [0.47, 0.6], name: "Forecast range", color: "#00f", payload: row },
    ]} />);
    expect(screen.getByText(/DigiKey \(projected\)/)).toBeTruthy();
    expect(screen.getByText(/0\.49 to 0\.61/)).toBeTruthy();
    expect(screen.getByText(/0\.47 to 0\.60/)).toBeTruthy();
  });

  it("does not list a projection on a day its distributor has a reading", () => {
    render(<Tip active label="2026-03-01" payload={[
      { dataKey: "c1", value: 0.5, name: "DigiKey", color: "#f00", payload: row },
      { dataKey: forecastKeyOf("c1"), value: 0.5, name: "DigiKey", color: "#f00", payload: row },
    ]} />);
    expect(screen.getAllByText(/DigiKey/)).toHaveLength(1);
    expect(screen.queryByText(/projected/)).toBeNull();
  });
});
