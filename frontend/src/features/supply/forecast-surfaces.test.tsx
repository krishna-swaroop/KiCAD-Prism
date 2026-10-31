import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ getForecastInsights: vi.fn(), getPartForecast: vi.fn() }));

import type { ForecastInsights, PartHistory } from "@/types/supply";
import { BomForecastLine } from "./bom-forecast-line";
import { ComingUpCard, likelyOutTile } from "./dashboard-forecast";
import { ForecastInsightsSection } from "./forecast-insights";
import { learning, partForecastFixture, shown } from "./forecast-test-fixtures";
import { historyRows, withForecast } from "./part-history-model";
import { RowRunout } from "./part-row-forecast";
import { partRowFixture } from "./supply-test-fixtures";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const history: PartHistory = {
  days: 90, currency: "EUR", total: [["2026-11-19", 1100], ["2026-11-20", 1000]], events: [],
  connectors: [{ connector_id: "c1", name: "Mouser", provider: "mouser", stock: [["2026-11-19", 1100], ["2026-11-20", 1000]], price: [["2026-11-20", 0.4]], stale: false, last_read: null }],
} as unknown as PartHistory;

describe("the forecast on the history charts", () => {
  it("continues the total with a band from the last real day, greyed while the model is learning", () => {
    const base = historyRows(history, "stock", new Set());
    const result = withForecast(history, "stock", base, partForecastFixture({}, learning), new Set());
    expect(result.overlay).toEqual({ from: "2026-11-20", grey: true });
    const last = result.rows.find((row) => row.day === "2026-12-18");
    expect(last?.forecast).toBe(0);
    expect(last?.band).toEqual([0, 200]);
    expect(result.rows.find((row) => row.day === "2026-11-20")?.band).toEqual([1000, 1000]);
    expect(withForecast(history, "stock", base, partForecastFixture({}, shown), new Set()).overlay?.grey).toBe(false);
  });

  it("adds nothing without a forecast, when the total is switched off, or without readings", () => {
    const base = historyRows(history, "stock", new Set());
    expect(withForecast(history, "stock", base, null, new Set()).overlay).toBeNull();
    expect(withForecast(history, "stock", base, { available: false, today: "x", models: {} }, new Set()).overlay).toBeNull();
    expect(withForecast(history, "stock", historyRows(history, "stock", new Set(["total"])), partForecastFixture({}, shown), new Set(["total"])).overlay).toBeNull();
  });

  it("continues the price with its ranges at 30 and 90 days", () => {
    const base = historyRows(history, "price", new Set());
    const result = withForecast(history, "price", base, partForecastFixture({}, shown), new Set());
    expect(result.overlay).toEqual({ from: "2026-11-20", grey: false });
    expect(result.rows.find((row) => row.day === "2027-02-18")?.band).toEqual([0.4, 0.47]);
  });
});

describe("a row's runout", () => {
  const forecast = { made_on: "2026-11-20", runout: { median_date: "2026-12-14", low_date: "2026-12-02", high_date: "2027-01-09", p: 0.8 }, p_out_4w: 0.75, p_out_8w: 0.9 };

  it("shows 'out ~14 Dec' once the model is shown, as a warning when likely within four weeks", () => {
    const { container } = render(<RowRunout part={partRowFixture({ forecast })} state="shown" />);
    expect(screen.getByText("out ~14 Dec")).toBeTruthy();
    expect(container.querySelector(".text-warning")).toBeTruthy();
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain("Likely (75%)");
  });

  it("shows nothing while the model is learning or the part is out already", () => {
    expect(render(<RowRunout part={partRowFixture({ forecast })} state="learning" />).container.textContent).toBe("");
    cleanup();
    expect(render(<RowRunout part={partRowFixture({ forecast: { ...forecast, out_now: true } })} state="shown" />).container.textContent).toBe("");
  });
});

describe("the dashboard's forecast", () => {
  it("withholds the number while learning and says how far along it is", () => {
    expect(likelyOutTile({ likely_out_4w: 7, state: learning })).toEqual({ label: "Likely out in 4 weeks", value: 0, learning: "Learning: 23 of 60 checks" });
    expect(likelyOutTile({ likely_out_4w: 7, state: shown })).toEqual({ label: "Likely out in 4 weeks", value: 7, learning: undefined });
    expect(likelyOutTile({ likely_out_4w: 7, state: { ...learning, state: "paused" } })?.learning).toContain("Paused");
    expect(likelyOutTile(undefined)).toBeNull();
  });

  it("lists the next expected events and opens the part", () => {
    const open = vi.fn();
    render(<ComingUpCard today="2026-11-20" onOpenPart={open} events={[
      { kind: "runout", date: "2026-12-14", part_id: "p1", mpn: "LM358DR", manufacturer: "TI", text: "likely out", probability: 0.8 },
      { kind: "price", date: "2027-02-18", part_id: "p2", mpn: "AD8318", manufacturer: "ADI", text: "price likely up 8%", probability: null },
    ]} />);
    expect(screen.getByText(/likely out/)).toBeTruthy();
    expect(screen.getByText(/Likely \(80%\)/)).toBeTruthy();
    fireEvent.click(screen.getByText("LM358DR"));
    expect(open).toHaveBeenCalledWith("p1");
  });
});

describe("the BOM drawer's line", () => {
  it("asks at the build quantity and speaks only for a shown model", async () => {
    mocked.getPartForecast.mockResolvedValue(partForecastFixture({ buy_state: { "4w": shown, "8w": shown } }, shown));
    render(<BomForecastLine partId="p1" need={300} />);
    expect(await screen.findByText(/Can be bought for this build in 8 weeks/)).toBeTruthy();
    expect(mocked.getPartForecast).toHaveBeenCalledWith("p1", 300, expect.anything());
    cleanup();
    mocked.getPartForecast.mockResolvedValue(partForecastFixture({}, learning));
    const { container } = render(<BomForecastLine partId="p2" need={300} />);
    await waitFor(() => expect(mocked.getPartForecast).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });
});

describe("Insights' forecasts", () => {
  const page: ForecastInsights = {
    currency: "EUR",
    coming_up: [],
    likely_out_4w: 0,
    lead_times: [{ kind: "manufacturer", scope: "Murata", now: 40, low: 45, median: 60, high: 75, direction: "stretching", points: 30 }],
    warnings: [{ kind: "category", scope: "category:MLCC", metric: "out_of_stock", before: 0.04, after: 0.11, direction: "up", since: "2026-10-02" }],
    prices: { parts: 10, flat: 8, likeliest_up: [{ part_id: "p1", mpn: "AD8318", manufacturer: "ADI", now: 8, low: 8, median: 8.6, high: 9.4, change: 0.075, flat: false }] },
    lifecycle: { last_buy_lag: { available: false, cases: 2, needs: 5 }, changes: 4, needs: 30 },
    track_record: {
      models: [
        { target: "out_4w", label: "Out everywhere within 4 weeks", kind: "chance", state: "learning", checks: 23, needs: 60, score: 0.9, since: null, reason: "23 of 60 checks" },
        { target: "price_90", label: "Price in 90 days", kind: "range", state: "shown", checks: 50, needs: 40, score: 0.8, since: "2026-11-01T00:00:00Z", reason: "" },
        { target: "lead_90", label: "Lead time in 3 months", kind: "range", state: "learning", checks: 0, needs: 30, score: null, since: null, reason: "" },
      ],
      reliability: { out_4w: [{ said: 0.7, happened: 0.68, cases: 40 }] },
    },
  };

  it("shows only the cards with something to say, and the track record in full", () => {
    render(<ForecastInsightsSection page={page} onOpenPart={vi.fn()} />);
    expect(screen.getByText(/MLCC/)).toBeTruthy();
    expect(screen.getByText(/out of stock up from 4% to 11% since 2026-10-02/)).toBeTruthy();
    expect(screen.getByText(/8 of 10 parts are likely to stay flat/)).toBeTruthy();
    expect(screen.getByText("Track record")).toBeTruthy();
    expect(screen.getByText("23 of 60 checks")).toBeTruthy();
    expect(screen.getByText(/said 70%, happened 68% \(40\)/)).toBeTruthy();
    expect(screen.getByText(/4 of the 30 lifecycle changes needed have been seen/)).toBeTruthy();
    expect(screen.queryByText("Lead times ahead"), "its forecast is still learning").toBeNull();
    expect(screen.queryByText("Coming up"), "its forecast is still learning").toBeNull();
  });
});
