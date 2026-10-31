import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EndOfLifeLine, ForecastSection } from "./forecast-section";
import { chanceText, chipText, dateText, isGrey, rangeText } from "./forecast-text";
import { forecastWord } from "./forecast-words";
import { learning, partForecastFixture, shown } from "./forecast-test-fixtures";

afterEach(cleanup);

describe("how a forecast is said", () => {
  it("uses days within two weeks and dates beyond", () => {
    expect(dateText("2026-11-20", "2026-11-20")).toBe("today");
    expect(dateText("2026-11-21", "2026-11-20")).toBe("tomorrow");
    expect(dateText("2026-11-25", "2026-11-20")).toBe("in about 5 days");
    expect(dateText("2026-12-14", "2026-11-20")).toBe("14 Dec");
    expect(dateText("2027-01-09", "2026-11-20")).toContain("2027");
  });

  it("gives a range around the most likely day", () => {
    expect(rangeText("2026-12-02", "2026-12-14", "2027-01-09", "2026-11-20")).toBe("around 14 Dec (between 2 Dec and 9 Jan 2027)");
    expect(rangeText("2026-11-23", "2026-11-25", "2026-11-29", "2026-11-20")).toBe("in about 5 days (3 to 9 days)");
  });

  it("has one scale of words, the same as the server", () => {
    expect([0.95, 0.78, 0.5, 0.2, 0.04].map((p) => forecastWord(p).word)).toEqual(["Almost certain", "Likely", "Uncertain", "Unlikely", "Very unlikely"]);
    expect(chanceText(forecastWord(0.784))).toBe("Likely (78%)");
  });

  it("greys a forecast unless its model is shown, and says why", () => {
    expect(isGrey(shown)).toBe(false);
    expect(isGrey(learning)).toBe(true);
    expect(isGrey(undefined)).toBe(true);
    expect(chipText(learning)).toEqual({ label: "Learning", title: "Learning: 23 of 60 checks" });
    expect(chipText({ ...learning, state: "paused", reason: "Its 80% ranges held 60% of the time" }).label).toBe("Paused");
  });
});

describe("the part sheet's Forecast section", () => {
  it("puts the end-of-life chance in a line of its own, for the outlook", () => {
    render(<EndOfLifeLine forecast={partForecastFixture({}, shown)} />);
    expect(screen.getByText(/Chance of an end-of-life change within 12 months/).querySelector("strong")).not.toBeNull();
    const { container } = render(<EndOfLifeLine forecast={null} />);
    expect(container.textContent).toBe("");
  });

  it("says what to expect, in dates and words, ", () => {
    render(<ForecastSection forecast={partForecastFixture({}, shown)} currency="EUR" />);
    expect(screen.getByText(/Can be bought on 18 Dec/)).toBeTruthy();
    expect(screen.getByText("Likely (78%)")).toBeTruthy();
    expect(screen.getByText("around 14 Dec (between 2 Dec and 9 Jan 2027)")).toBeTruthy();
    expect(screen.getByText(/DigiKey back/)).toBeTruthy();
    expect(screen.getByText("(quoted 6 w)")).toBeTruthy();
    expect(screen.getByText(/Out everywhere within 8 weeks:/)).toBeTruthy();
    expect(screen.getByText("Likely (82%)").tagName).toBe("STRONG");
    expect(screen.queryByText(/Chance of an end-of-life change/), "it sits under the outlook, not here").toBeNull();
    expect(screen.getByText(/In 90 days, at its price quantity/)).toBeTruthy();
    expect(screen.getAllByRole("listitem", { name: /^Week/ })).toHaveLength(12);
  });

  it("shows no Learning chip for a shown model and one for each learning line", () => {
    const { rerender } = render(<ForecastSection forecast={partForecastFixture({}, shown)} currency="EUR" />);
    expect(screen.queryAllByText("Learning")).toHaveLength(0);
    rerender(<ForecastSection forecast={partForecastFixture({}, learning)} currency="EUR" />);
    expect(screen.getAllByText("Learning").length).toBeGreaterThanOrEqual(3);
  });

  it("explains each line when asked why", () => {
    render(<ForecastSection forecast={partForecastFixture({}, shown)} currency="EUR" />);
    const icons = screen.getAllByRole("button", { name: "Why" });
    expect(icons.length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/real waits have run 1.4 times the quote/)).toBeNull();
    // Each opens its own words on hover.
    icons.forEach((icon) => fireEvent.mouseEnter(icon));
    expect(screen.getAllByText(/real waits have run 1.4 times the quote/).length).toBeGreaterThan(0);
  });

  it("has no counter of its own: it is made at the price quantity", () => {
    render(<ForecastSection forecast={partForecastFixture({}, shown)} currency="EUR" />);
    expect(screen.queryByLabelText("Quantity to forecast for")).toBeNull();
  });

  it("says a part with too few readings has none yet", () => {
    render(<ForecastSection forecast={{ available: false, reason: "too_few_readings", today: "2026-11-20", models: {} }} currency="EUR" />);
    expect(screen.getByText("Forecasts start after a week of readings.")).toBeTruthy();
    cleanup();
    render(<ForecastSection forecast={{ available: false, reason: "no_readings", today: "2026-11-20", models: {} }} currency="EUR" />);
    expect(screen.getByText("Nothing has been read for this part yet.")).toBeTruthy();
  });

  it("says out of stock now instead of a runout", () => {
    render(<ForecastSection forecast={partForecastFixture({ out_now: true, runout: null }, shown)} currency="EUR" />);
    expect(screen.getByText("Out of stock at every distributor now.")).toBeTruthy();
    expect(screen.queryByText(/Runs out/)).toBeNull();
  });
});
