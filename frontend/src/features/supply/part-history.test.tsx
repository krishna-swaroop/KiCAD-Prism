import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PartForecast, PartHistory } from "@/types/supply";

vi.mock("./supply-api", () => ({ getPartHistory: vi.fn() }));

import { forecastKeyOf, historyRows, withDistributorForecasts } from "./part-history-model";
import { PartHistoryPanel } from "./part-history";
import * as api from "./supply-api";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

const HISTORY: PartHistory = {
  days: 90,
  currency: "EUR",
  connectors: [
    { connector_id: "c1", name: "DigiKey", provider: "digikey", last_read: "2026-03-01T08:00:00Z", stale: false, stock: [["2026-02-28", 50], ["2026-03-01", 40]], price: [["2026-02-28", 0.5], ["2026-03-01", 0.5]] },
    { connector_id: "c2", name: "Mouser", provider: "mouser", last_read: "2026-02-28T08:00:00Z", stale: true, stock: [["2026-02-28", 10]], price: [] },
  ],
  total: [["2026-02-28", 60], ["2026-03-01", 40]],
  events: [{ day: "2026-03-01", kind: "notice", text: "Notice: End of life" }],
};

describe("the history rows", () => {
  it("makes a column per distributor, the total, and a dashed continuation for a line not read lately", () => {
    const { rows, keys } = historyRows(HISTORY, "stock", new Set());
    expect(keys.map((item) => item.key)).toEqual(["c1", "c2", "total"]);
    expect(rows).toEqual([
      { day: "2026-02-28", c1: 50, c2: 10, total: 60, "c2~": 10 },
      { day: "2026-03-01", c1: 40, c2: null, total: 40, "c2~": 10 },
    ]);
  });

  it("leaves out a line switched off, and a distributor without prices from the price chart", () => {
    expect(historyRows(HISTORY, "stock", new Set(["c2", "total"])).keys.map((item) => item.key)).toEqual(["c1"]);
    expect(historyRows(HISTORY, "price", new Set()).keys.map((item) => item.key)).toEqual(["c1"]);
  });
});

describe("a forecast for each distributor", () => {
  const forecast = {
    available: true, today: "2026-03-01", models: {},
    by_distributor: {
      stock: [{ connector_id: "c1", path: [{ day: "2026-03-01", median: 40 }, { day: "2026-03-15", median: 30 }] }, { connector_id: "c2", path: [{ day: "2026-03-15", median: 5 }] }],
      price: [{ connector_id: "c1", now: 0.5, h30: { date: "2026-03-31", median: 0.55 }, h90: { date: "2026-05-30", median: 0.6 } }],
    },
  } as unknown as PartForecast;

  it("continues each line from its last reading, on its own key", () => {
    const rows = historyRows(HISTORY, "stock", new Set()).rows;
    const drawn = withDistributorForecasts(HISTORY, "stock", rows, forecast, new Set());
    expect(drawn).toEqual(["c1", "c2"]);
    const find = (day: string) => rows.find((row) => row.day === day);
    expect(find("2026-03-01")?.[forecastKeyOf("c1")]).toBe(40);
    expect(find("2026-03-15")?.[forecastKeyOf("c1")]).toBe(30);
    expect(find("2026-02-28")?.[forecastKeyOf("c2")]).toBe(10);
    expect(find("2026-03-15")?.[forecastKeyOf("c2")]).toBe(5);
  });

  it("draws the price ahead for the distributors that have one, and none for a switched-off line", () => {
    const rows = historyRows(HISTORY, "price", new Set()).rows;
    expect(withDistributorForecasts(HISTORY, "price", rows, forecast, new Set())).toEqual(["c1"]);
    expect(rows.find((row) => row.day === "2026-05-30")?.[forecastKeyOf("c1")]).toBe(0.6);
    expect(withDistributorForecasts(HISTORY, "price", historyRows(HISTORY, "price", new Set()).rows, forecast, new Set(["c1"]))).toEqual([]);
  });
});

describe("the history on the part sheet", () => {
  it("shows a legend where a click isolates a distributor and a second click brings the rest back, and opens the chart larger", async () => {
    vi.mocked(api.getPartHistory).mockResolvedValue(HISTORY);
    render(<PartHistoryPanel kind="stock" partId="p1" history={HISTORY} threshold={null} />);
    const digikey = await screen.findByRole("button", { name: /DigiKey/ });
    expect(digikey.getAttribute("aria-pressed")).toBe("true");
    const mouser = screen.getByRole("button", { name: /Mouser/ });
    const total = screen.getByRole("button", { name: /Counted in total/ });
    fireEvent.click(digikey);
    expect([digikey, mouser, total].map((item) => item.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    fireEvent.click(mouser);
    expect([digikey, mouser, total].map((item) => item.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    fireEvent.click(mouser);
    expect([digikey, mouser, total].map((item) => item.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect(mouser.textContent).not.toContain("not read lately");
    expect(mouser.textContent).toContain("10");
    expect(mouser.getAttribute("title")).toContain("Not read for longer");
    fireEvent.click(screen.getByRole("button", { name: "Open the stock history larger" }));
    await waitFor(() => expect(api.getPartHistory).toHaveBeenCalledWith("p1", 90, expect.anything()));
    expect(await screen.findByRole("radio", { name: "6 months" })).toBeTruthy();
    expect(await screen.findByText("2026-03-01: Notice: End of life")).toBeTruthy();
  }, 30_000);

  it("says history builds up when there is none", async () => {
    render(<PartHistoryPanel kind="stock" partId="p2" history={{ ...HISTORY, connectors: [], total: [], events: [] }} />);
    expect(await screen.findByText("History builds up as the part is read.")).toBeTruthy();
  });

  it("draws the price under its own legend, with only the distributors that have prices and no total", () => {
    render(<PartHistoryPanel kind="price" partId="p1" history={HISTORY} />);
    expect(screen.getByRole("button", { name: /DigiKey/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mouser/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Counted in total/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open the price history larger" })).toBeTruthy();
  });
});
