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
    fireEvent.mouseEnter(screen.getByRole("button", { name: /Show what the outlook/ }));
    expect(screen.queryByText(/rule-based/)).toBeNull();
    expect(screen.getByText(/A last time buy has been announced\./)).toBeTruthy();
    expect(screen.getByText("(distributor lifecycle)")).toBeTruthy();
  });

  it("shows no signs of an end as a good band, with no empty info icon", () => {
    render(<OutlookSection outlook={{ band: "no_signs", label: "No signs of an end", method: "rule-based", signals: [] }} />);
    expect(screen.queryByRole("button", { name: /Show what the outlook/ })).toBeNull();
    expect(screen.getByText("No signs of an end").className).toContain("success");
  });

  it("says when nothing has been read", () => {
    render(<OutlookSection outlook={{ band: "unknown", label: "Not enough to say", method: "rule-based", signals: [] }} />);
    expect(screen.getByText("Not read yet")).toBeTruthy();
  });
});
