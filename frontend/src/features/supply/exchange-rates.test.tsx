import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ getFxRates: vi.fn(), refreshFxRates: vi.fn(), enterFxRates: vi.fn() }));

import { ExchangeRates } from "./exchange-rates";
import { parseRates } from "./exchange-rates-model";
import * as api from "./supply-api";

const mocked = vi.mocked(api);
const stored = { day: "2026-03-01", currencies: ["USD", "GBP"], stale: true };

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); mocked.getFxRates.mockResolvedValue(stored); });
afterEach(cleanup);

describe("reading rates", () => {
  it("takes currency codes with a positive rate, and nothing else", () => {
    expect(parseRates("usd 1.08, GBP=0.85")).toEqual({ USD: 1.08, GBP: 0.85 });
    expect(parseRates("USD")).toBeNull();
    expect(parseRates("USDX 1.1")).toBeNull();
    expect(parseRates("USD -1")).toBeNull();
    expect(parseRates("")).toBeNull();
  });
});

describe("the exchange rates", () => {
  it("shows their day and that they are old, refreshes them and saves rates by hand", async () => {
    mocked.refreshFxRates.mockResolvedValue({ ...stored, stale: false, saved: 30 });
    mocked.enterFxRates.mockResolvedValue({ ...stored, saved: 1 });
    render(<ExchangeRates />);
    fireEvent.click(await screen.findByRole("button", { name: /Exchange rates/ }));
    expect(await screen.findByText("From 2026-03-01")).toBeTruthy();
    expect(screen.getByText("Out of date")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh from the ECB" }));
    await waitFor(() => expect(mocked.refreshFxRates).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Save rates" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-03-02" } });
    fireEvent.change(screen.getByLabelText("Rates"), { target: { value: "USD 1.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rates" }));
    await waitFor(() => expect(mocked.enterFxRates).toHaveBeenCalledWith("2026-03-02", { USD: 1.1 }));
  });
});
