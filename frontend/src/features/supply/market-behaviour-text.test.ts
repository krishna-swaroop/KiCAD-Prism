import { describe, expect, it } from "vitest";

import { behaviourLines } from "./market-behaviour-text";

describe("how distributors move together", () => {
  it("says nothing before there is history", () => {
    expect(behaviourLines(undefined)).toEqual([]);
    expect(behaviourLines({ repricing: {}, leadership: null, exchange: {}, restock_order: null, arrivals: null })).toEqual([]);
  });

  it("states cadence, who leads, the exchange rate share, who restocks first and how reliable arrivals are", () => {
    const lines = behaviourLines({
      repricing: { Mouser: 30 },
      leadership: { changes: 8, followed: 6, followed_share: 0.75, leader: "DigiKey", led: { DigiKey: 5 } },
      exchange: { "TME": { currency: "PLN", from: "2026-01-01", to: "2026-04-01", in_base_percent: 6, local_percent: 0, exchange_percent: 6 } },
      restock_order: { rounds: 4, first: "Mouser", firsts: { Mouser: 3 } },
      arrivals: { announced: 6, open: 1, arrived: 4, slipped: 1, on_time: 2, on_time_share: 0.4, median_delay_days: 9 },
    });
    expect(lines).toEqual([
      "Mouser changes its price about every 30 days.",
      "Of 8 price changes, 75% were followed by another distributor within two weeks.",
      "DigiKey usually moves first.",
      "TME prices in PLN: in the base currency the price is up 6% since 2026-01-01, of which +6 points are the exchange rate.",
      "Mouser usually restocks first (4 restocks compared).",
      "40% of announced arrivals came within a week of the date given; typically 9 days after it.",
    ]);
  });
});
