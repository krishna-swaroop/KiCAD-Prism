import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PriceTrend } from "./price-trend";
import * as api from "./supply-api";
import { headlineFixture, priceFixture } from "./supply-test-fixtures";

vi.mock("./supply-api");

afterEach(cleanup);

const history = [{ day: "2026-02-01", price: 1 }, { day: "2026-03-01", price: 1.3 }];

describe("the price section", () => {
  it("shows nothing before there are priced readings", () => {
    const { container } = render(<PriceTrend price={priceFixture({ currency: "", history: [], trend: null })} />);
    expect(container.textContent).toBe("");
  });

  it("shows the latest price and the move over the window", () => {
    render(<PriceTrend price={priceFixture({ currency: "EUR", history, trend: { currency: "EUR", was: "1", now: "1.3", change_percent: 30, days: 28 } })} />);
    expect(screen.getByRole("region", { name: "Price" })).toBeTruthy();
    expect(screen.getByText(/Up 30% over 28 days, from/)).toBeTruthy();
  });

  it("says which currency a price was converted from, not the price", () => {
    render(<PriceTrend price={priceFixture({
      currency: "EUR", history, trend: null, quantity: 100, default: 100, own: false,
      headline: headlineFixture({ unit_price: "0.41", currency: "EUR", price_quantity: 100, price_kind: "orderable", price_lead_days: null, price_range: null, price_native: { price: "0.4491", currency: "USD" }, price_seen_day: null, price_unrated: [] }),
    })} />);
    expect(screen.getByText("Converted from USD.")).toBeTruthy();
    expect(screen.queryByText(/0[.,]4491/)).toBeNull();
  });

  it("says nothing when the price has not moved", () => {
    render(<PriceTrend price={priceFixture({ currency: "EUR", history, trend: { currency: "EUR", was: "1.3", now: "1.3", change_percent: 0, days: 7 } })} />);
    expect(screen.queryByText(/Unchanged/)).toBeNull();
  });

  it("says why there is no move yet", () => {
    render(<PriceTrend price={priceFixture({ currency: "EUR", history: [history[1]], trend: null })} />);
    expect(screen.queryByText(/needs a week of readings/)).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Show what the price is" }));
    expect(screen.getByText(/A move needs a week of readings/)).toBeTruthy();
  });

  it("shows the quantity it is priced at and lets a person change it", async () => {
    vi.mocked(api.setPriceQuantity).mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<PriceTrend partId="p1" canEdit onChanged={onChanged} price={priceFixture({ currency: "EUR", history, trend: null, quantity: 100, default: 100, own: false })} />);
    expect(screen.getByText("for 100")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change the price quantity" }));
    fireEvent.change(screen.getByLabelText("Pieces"), { target: { value: "4,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.setPriceQuantity).toHaveBeenCalledWith("p1", 4000));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("goes back to the default quantity", async () => {
    vi.mocked(api.setPriceQuantity).mockResolvedValue(undefined);
    render(<PriceTrend partId="p1" canEdit onChanged={vi.fn()} price={priceFixture({ currency: "EUR", history, trend: null, quantity: 4000, default: 100, own: true })} />);
    expect(screen.getByText("for 4,000").getAttribute("title")).toBe("Set for this part");
    fireEvent.click(screen.getByRole("button", { name: "Change the price quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Use 100" }));
    await waitFor(() => expect(api.setPriceQuantity).toHaveBeenCalledWith("p1", null));
  });

  it("does not offer the change to a reader, and refuses a quantity out of range", () => {
    const { rerender } = render(<PriceTrend partId="p1" canEdit={false} price={priceFixture({ currency: "EUR", history, trend: null, quantity: 100, default: 100, own: false })} />);
    expect(screen.queryByRole("button", { name: "Change the price quantity" })).toBeNull();
    expect(screen.getByText("for 100")).toBeTruthy();
    rerender(<PriceTrend partId="p1" canEdit price={priceFixture({ currency: "EUR", history, trend: null, quantity: 100, default: 100, own: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "Change the price quantity" }));
    fireEvent.change(screen.getByLabelText("Pieces"), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a price that nothing can be bought at", () => {
    render(
      <PriceTrend
        price={priceFixture({
          currency: "EUR", history, trend: null, quantity: 100, default: 100, own: false,
          headline: headlineFixture({ unit_price: "0.4", currency: "EUR", price_quantity: 100, price_kind: "backorder", price_lead_days: 84, price_range: { low: "0.24", high: "0.4", median: "0.32", sellers: 2 }, price_native: null, price_seen_day: null, price_unrated: ["CHF"] }),
        })}
      />,
    );
    expect(screen.getByText(/Nothing is in stock. This is the cheapest price with a lead time, 12 w/)).toBeTruthy();
    expect(screen.queryByText(/Across 2 distributors/)).toBeNull();
    expect(screen.getByText(/No exchange rate for CHF/)).toBeTruthy();
  });
});
