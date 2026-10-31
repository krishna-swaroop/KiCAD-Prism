import { describe, expect, it } from "vitest";

import type { SupplyInsight } from "@/types/supply";
import { confidenceLabel, insightBasis, insightLines } from "./insight-text";
import { insightFixture } from "./supply-test-fixtures";

function insight(overrides: Partial<SupplyInsight> = {}): SupplyInsight {
  return insightFixture({ confidence: "medium", inputs: { points: 12, span_days: 11, points_in_run: 12, current: 300 }, ...overrides });
}

describe("insight text", () => {
  it("says nothing before there is anything honest to say", () => {
    expect(insightLines(insight({ confidence: "none" }))).toEqual([]);
  });

  it("states the rate, the days to zero and to the threshold", () => {
    const lines = insightLines(insight({ trend: "falling", decrease_per_day: 49.6, days_to_zero: 6, days_to_threshold: 1 }));
    expect(lines).toEqual([
      "Observed net decrease: 50 a day.",
      "At that rate it reaches zero in about 6 days.",
      "It reaches your threshold in about 1 day.",
    ]);
  });

  it("does not give a runout beyond a year, and says when the fall speeds up", () => {
    expect(insightLines(insight({ trend: "falling", decrease_per_day: 2, beyond_year: true }))).toEqual([
      "Observed net decrease: 2 a day.",
      "That is too slow to run out within a year.",
    ]);
    const lines = insightLines(insight({ trend: "falling", decrease_per_day: 20, days_to_zero: 15, pace: "accelerating", recent_decrease_per_day: 90, days_to_zero_recent: 3 }));
    expect(lines).toContain("It is falling faster lately: 90 a day over the later half of the readings. At the recent pace it reaches zero in about 3 days.");
  });

  it("describes steady, rising and not-enough-yet differently", () => {
    expect(insightLines(insight({ trend: "steady" }))).toEqual(["Stock is steady."]);
    expect(insightLines(insight({ trend: "rising" }))).toEqual(["Stock is rising."]);
    expect(insightLines(insight())[0]).toMatch(/Too few readings since the last restock/);
  });

  it("reports restock cadence, and an overdue restock plainly", () => {
    const base = { trend: "steady" as const, restocks: 3, restock_interval_days: 30 };
    expect(insightLines(insight({ ...base, restock_expected_in_days: 12 }))[1])
      .toBe("Restocked 3 times in this history, about every 30 days. Next expected in about 12 days.");
    expect(insightLines(insight({ ...base, restock_expected_in_days: -4 }))[1]).toMatch(/Expected 4 days ago, not seen yet\.$/);
    expect(insightLines(insight({ trend: "steady", restocks: 1 }))[1]).toBe("Restocked once in this history.");
  });

  it("shows what a projection rests on", () => {
    expect(insightBasis(insight())).toBe("12 daily readings over 11 days; 12 since the last restock or change of listings.");
    expect(insightBasis(insight({ inputs: { points: 2, span_days: 1, points_in_run: 2, current: 5 } }))).toMatch(/over 1 day;/);
    expect(confidenceLabel(insight({ confidence: "high" }))).toBe("High confidence");
  });

  it("tells how the stock behaved over the whole history", () => {
    const lines = insightLines(insight({
      trend: "steady", lead_gap_days: 20, zero_share: 0.3, restock_latency_days: 9, volatility: 0.8, sources_change: -2, concentration: 0.9,
    }));
    expect(lines).toEqual([
      "Stock is steady.",
      "At the observed rate it runs out 20 days before a new order could arrive.",
      "It was out of stock on 30% of the days, and stayed there about 9 days before stock returned.",
      "Its stock swings widely.",
      "2 distributors stopped holding it over this history.",
      "Nearly all of the stock is at one distributor.",
    ]);
  });

  it("names a lead time that moved, a collapse in one step, and the season", () => {
    const lines = insightLines(insight({
      trend: "steady",
      lead_time_trend: { before: 28, after: 70, since: "2026-08-01" },
      anomalies: [{ day: "2026-10-01", from: 960, to: 100 }],
      seasonality: { index: { "1": 0.8, "11": 1.4 }, peak: 11, trough: 1 },
    }));
    expect(lines).toEqual([
      "Stock is steady.",
      "The quoted lead time went from 4 w to 10 w since 2026-08-01.",
      "On 2026-10-01 stock fell from 960 to 100 in one step, which ordinary use does not do.",
      "Over the year it runs highest in November and lowest in January.",
    ]);
  });
});
