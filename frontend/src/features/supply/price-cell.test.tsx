import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PriceCell } from "./price-cell";
import { pricesAt } from "./price-text";
import { partDetailFixture, partRowFixture } from "./supply-test-fixtures";

afterEach(cleanup);

const NOW = Date.parse("2026-10-17T12:00:00Z");

describe("the price in a row", () => {
  it("shows the price and the quantity it is for", () => {
    render(<PriceCell part={partRowFixture({ price_kind: "orderable" })} now={NOW} />);
    expect(screen.getByText("× 100")).toBeTruthy();
  });

  it("marks a backorder price with its lead time", () => {
    render(<PriceCell part={partRowFixture({ price_kind: "backorder", price_lead_days: 84 })} now={NOW} />);
    expect(screen.getByText("12 w")).toBeTruthy();
    expect(screen.getByText("× 100")).toBeTruthy();
  });

  it("says how old the last in stock price is", () => {
    render(<PriceCell part={partRowFixture({ price_kind: "last_seen", price_seen_day: "2026-10-08" })} now={NOW} />);
    expect(screen.getByText("9 days ago")).toBeTruthy();
  });

  it("says when it is only the list price", () => {
    render(<PriceCell part={partRowFixture({ price_kind: "listed" })} now={NOW} />);
    expect(screen.getByText("list price")).toBeTruthy();
    expect(screen.getByText("× 100")).toBeTruthy();
  });

  it("puts the range and the conversion in the hover text", () => {
    const { container } = render(
      <PriceCell
        part={partRowFixture({ price_range: { low: "0.24", high: "0.4", median: "0.32", sellers: 2 }, price_native: { price: "0.3", currency: "USD" } })}
        now={NOW}
      />,
    );
    const title = container.querySelector("[title]")?.getAttribute("title") ?? "";
    expect(title).toContain("median");
    expect(title).toContain("over 2 distributors");
    expect(title).toContain("Converted from");
  });

  it("says why there is no price", () => {
    render(<PriceCell part={partRowFixture({ unit_price: null, price_unrated: ["USD"] })} now={NOW} />);
    expect(screen.getByText("No price").getAttribute("title")).toBe("No exchange rate for USD");
    cleanup();
    render(<PriceCell part={partRowFixture({ unit_price: null, stock: null })} now={NOW} />);
    expect(screen.getByText("No price").getAttribute("title")).toBe("Not read yet");
  });
});

describe("the price at a quantity", () => {
  const listings = partDetailFixture().listings;
  const offer = { ...listings[0].offer!, moq: 1, order_multiple: 1, currency: "EUR", marketplace: false, price_breaks: [[1, "0.5"], [100, "0.3"], [1000, "0.2"]] as Array<[number, string]> };

  it("takes the break that applies to the quantity", () => {
    const found = pricesAt([{ ...listings[0], counted: true, offer }], 1000);
    expect(found.map((item) => [item.price, item.quantity])).toEqual([["0.2", 1000]]);
    expect(pricesAt([{ ...listings[0], counted: true, offer }], 50)[0].price).toBe("0.5");
  });

  it("orders at least the minimum and whole multiples", () => {
    const found = pricesAt([{ ...listings[0], counted: true, offer: { ...offer, moq: 3000, order_multiple: 500 } }], 100);
    expect(found[0].quantity).toBe(3000);
  });

  it("leaves out listings that do not count or have no price", () => {
    expect(pricesAt([{ ...listings[0], counted: false, offer }], 100)).toEqual([]);
    expect(pricesAt([{ ...listings[0], counted: true, offer: { ...offer, currency: "" } }], 100)).toEqual([]);
  });
});
