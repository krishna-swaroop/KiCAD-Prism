import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { SupplyRowOffer } from "@/types/supply";
import { PartOfferRows } from "./part-offer-rows";
import { partRowFixture, rowOfferFixture } from "./supply-test-fixtures";

afterEach(cleanup);

const offer = (overrides: Partial<SupplyRowOffer> = {}): SupplyRowOffer => rowOfferFixture({
  connector_id: "c1", provider: "fake", name: "Simulated market", sku: "FAKE-1", stock: 10, moq: 1, packaging: "cut_tape",
  currency: "EUR", price_breaks: [[1, "2.00"]], ...overrides,
});

describe("a part's vendor lines", () => {
  it("show prices in the workspace currency, with the distributor's own on hover", () => {
    render(<PartOfferRows part={partRowFixture({ offers: [offer({ base_currency: "INR", base_price_breaks: [[1, "180.0000"]] })] })} />);
    const cell = screen.getAllByText(/₹180/)[0].closest("td");
    expect(cell?.getAttribute("title")).toMatch(/Converted from €2/);
    expect(screen.queryByText(/€2/)).toBeNull();
  });

  it("show the distributor's own prices when there is no rate", () => {
    render(<PartOfferRows part={partRowFixture({ offers: [offer({ base_currency: "INR", base_price_breaks: null })] })} />);
    expect(screen.getAllByText(/€2/).length).toBeGreaterThan(0);
  });
});
