import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { SupplyOutlook } from "@/types/supply";
import { OutlookSection } from "./outlook-section";

afterEach(cleanup);

describe("the outlook section", () => {
  it("shows the band and every signal with its source", () => {
    const outlook: SupplyOutlook = {
      band: "ending",
      label: "Ending",
      method: "rule-based",
      signals: [{ text: "A last time buy has been announced.", source: "distributor lifecycle", weight: "hard" }],
    };
    render(<OutlookSection outlook={outlook} />);
    expect(screen.getByText("Ending")).toBeTruthy();
    expect(screen.queryByText(/A last time buy has been announced\./)).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Show how the outlook/ }));
    expect(screen.getByText(/rule-based, from the signals below/)).toBeTruthy();
    expect(screen.getByText(/A last time buy has been announced\./)).toBeTruthy();
    expect(screen.getByText("(distributor lifecycle)")).toBeTruthy();
  });

  it("does not promise a long life when nothing was found", () => {
    render(<OutlookSection outlook={{ band: "no_signs", label: "No signs of an end", method: "rule-based", signals: [] }} />);
    expect(screen.queryByText(/not a promise of a long life/)).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Show how the outlook/ }));
    expect(screen.getByText(/not a promise of a long life/)).toBeTruthy();
    expect(screen.getByText("No signs of an end").className).toContain("success");
  });

  it("says when nothing has been read", () => {
    render(<OutlookSection outlook={{ band: "unknown", label: "Not enough to say", method: "rule-based", signals: [] }} />);
    expect(screen.getByText("Nothing has been read for this part yet.")).toBeTruthy();
  });
});
