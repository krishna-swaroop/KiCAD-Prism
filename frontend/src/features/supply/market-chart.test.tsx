import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import MarketChart from "./market-chart";
import { MARKET_COLUMNS } from "./market-model";

// Recharts measures its box with ResizeObserver, which jsdom does not have.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe("the market chart", () => {
  it("mounts with a name that says which figure it shows", () => {
    const series = [
      { kind: "all" as const, scope: "All followed parts", sample: 6, points: [["2026-03-01", 0.1], ["2026-03-02", 0.2]] as Array<[string, number]> },
    ];
    const { container } = render(<MarketChart series={series} column={MARKET_COLUMNS[0]} />);
    expect(screen.getByRole("img", { name: "Out of stock over time" })).toBeTruthy();
    expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
  }, 30_000);
});
