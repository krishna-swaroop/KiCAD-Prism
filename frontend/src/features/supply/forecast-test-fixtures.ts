import type { ForecastModelState, PartForecast } from "@/types/supply";

export const learning: ForecastModelState = { state: "learning", checks: 23, needs: 60, reason: "23 of 60 checks" };
export const shown: ForecastModelState = { state: "shown", checks: 80, needs: 60, reason: "" };

const chance = (probability: number, word: string) => ({ probability, percent: Math.round(probability * 100), word });

/** A part falling steadily: likely buyable for a while, running out around 14 December. */
export function partForecastFixture(over: Partial<PartForecast> = {}, state: ForecastModelState = learning): PartForecast {
  return {
    available: true,
    today: "2026-11-20",
    quantity: 100,
    out_now: false,
    models: {},
    weeks: Array.from({ length: 12 }, (_, index) => ({ week: index + 1, date: new Date(Date.UTC(2026, 10, 20 + (index + 1) * 7)).toISOString().slice(0, 10), ...chance(index < 3 ? 0.95 : index < 6 ? 0.78 : 0.1, index < 3 ? "Almost certain" : index < 6 ? "Likely" : "Unlikely") })),
    buy_state: { "4w": state, "8w": state },
    out_everywhere: { "4w": chance(0.3, "Unlikely"), "8w": chance(0.82, "Likely") },
    runout: { low: "2026-12-02", median: "2026-12-14", high: "2027-01-09", ...chance(0.82, "Likely"), state },
    back: [{ connector_id: "c1", name: "DigiKey", provider: "digikey", low: "2027-01-05", median: "2027-01-20", high: "2027-02-28", quote_days: 42, ratio: 1.4, beyond_share: 0.05, state }],
    path: [{ day: "2026-11-20", low: 1000, median: 1000, high: 1000 }, { day: "2026-12-04", low: 300, median: 500, high: 700 }, { day: "2026-12-18", low: 0, median: 0, high: 200 }],
    inputs: { span_days: 20, holders: 2, drain_known: 1, outages_modelled: 0, weekly: false },
    price: {
      now: 0.4, inputs: { readings: 20, span_days: 20, own_moves: 0, pooled_moves: 12 },
      h30: { low: 0.4, median: 0.4, high: 0.42, flat: false, date: "2026-12-20", state },
      h90: { low: 0.4, median: 0.43, high: 0.47, flat: false, date: "2027-02-18", state },
    },
    end_of_life: { p12: chance(0.12, "Unlikely"), p24: chance(0.22, "Unlikely"), changes: 9, needs: 30, state: learning },
    ...over,
  };
}
