import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RestockRecord, ScorecardRow } from "@/types/supply";
import { RestockRecordDetails } from "./restock-record";
import { ScorecardTable } from "./scorecard-table";

afterEach(cleanup);

const row = (over: Partial<ScorecardRow> = {}): ScorecardRow => ({
  connector_id: "c1", name: "Mouser EU", provider: "mouser", parts: 12,
  stock_outs: { n: 9, median_days_out: 18 },
  restocked_first: { rounds: 7, first: 5 },
  promises: { resolved: 8, kept: 6, median_days_late: 12 },
  wait: { n: 6, quoted_days: 14, real_days: 25 },
  in_stock: { days: 900, share: 0.82 },
  ...over,
});

describe("the distributor scorecard", () => {
  it("shows each figure with what it rests on", () => {
    render(<ScorecardTable scorecard={{ distributors: [row()], shared_parts: 12, min_events: 5 }} />);
    expect(screen.getByText("Mouser EU")).toBeTruthy();
    expect(screen.getByText("12 shared parts")).toBeTruthy();
    expect(screen.getByText("5 of 7")).toBeTruthy();
    expect(screen.getByText("6 of 8")).toBeTruthy();
    expect(screen.getByText("late by 12 d")).toBeTruthy();
    expect(screen.getByText("2 w said, 4 w real")).toBeTruthy();
    expect(screen.getByText("82%")).toBeTruthy();
    expect(screen.getByText("18 d out")).toBeTruthy();
  });

  it("withholds a figure under the minimum and says what it needs", () => {
    const thin = row({ restocked_first: { rounds: 2, first: null }, promises: { resolved: 2, kept: null, median_days_late: null }, wait: { n: 2, quoted_days: null, real_days: null }, in_stock: { days: 3, share: null } });
    const { container } = render(<ScorecardTable scorecard={{ distributors: [thin], shared_parts: 1, min_events: 5 }} />);
    expect(container.querySelector('[title="Needs 5 rounds"]')).toBeTruthy();
    expect(container.querySelector('[title="Needs 5 promises"]')).toBeTruthy();
    expect(container.querySelector('[title="Needs 5 waits"]')).toBeTruthy();
    expect(screen.queryByText(/of 2/)).toBeNull();
  });

  it("says so when no part is listed by two distributors", () => {
    render(<ScorecardTable scorecard={{ distributors: [], shared_parts: 0, min_events: 5 }} />);
    expect(screen.getByText("No part is listed by two distributors yet.")).toBeTruthy();
  });
});

const record = (over: Partial<RestockRecord> = {}): RestockRecord => ({
  connector_id: "c1", name: "Mouser EU", provider: "mouser", open: null, kept: 0, resolved: 0, stock_outs: 0, ...over,
});

describe("the restock promises on a part", () => {
  it("shows a dated arrival and a quoted lead time, and marks one past its day", () => {
    render(
      <RestockRecordDetails record={[
        record({ open: { kind: "dated", expected: "2026-11-02", quantity: 4000, late: false }, kept: 2, resolved: 3 }),
        record({ connector_id: "c2", name: "DigiKey", provider: "digikey", open: { kind: "lead_time", expected: "2026-10-01", quoted_lead_days: 84, late: true }, stock_outs: 1 }),
      ]} />,
    );
    expect(screen.getByText("4,000 due 2026-11-02")).toBeTruthy();
    expect(screen.getByText("kept 2 of 3 here")).toBeTruthy();
    expect(screen.getByText("back by 2026-10-01 (quoted 12 w), past that day")).toBeTruthy();
    expect(screen.getByText("1 stock-out seen")).toBeTruthy();
  });

  it("shows nothing when no distributor has run out or announced stock", () => {
    const { container } = render(<RestockRecordDetails record={[record()]} />);
    expect(container.textContent).toBe("");
  });
});
