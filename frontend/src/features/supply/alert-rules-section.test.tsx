import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./tracking-api", () => ({ getAlertRules: vi.fn(), saveAlertRules: vi.fn(), followPart: vi.fn() }));

import { AlertRulesSection } from "./alert-rules-section";
import { alertTitle } from "./alert-text";
import { alertFixture } from "./supply-test-fixtures";
import * as api from "./tracking-api";

const mocked = vi.mocked(api);
const MUTABLE = ["out_of_stock", "below_threshold", "price_up", "target_price_missed", "assessment_worse"];
const WATCH = { threshold: 100, pinned: false, owner: "ana@example.com", packaging: "any" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAlertRules.mockResolvedValue({ muted: [], muting: [], price_rise_percent: null, likely_out_percent: null, target_price: null, target_currency: "", mutable: MUTABLE });
  mocked.saveAlertRules.mockImplementation(async (_id, rules) => ({ ...rules, muting: [] }));
});
afterEach(cleanup);

describe("the alert rules of a part", () => {
  it("mutes an alert, sets a target price and saves", async () => {
    render(<AlertRulesSection partId="p1" canEdit />);
    fireEvent.click(await screen.findByLabelText("Price rises"));
    fireEvent.change(screen.getByLabelText("A price rise of at least (%)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Likely to run out at a chance of (%)"), { target: { value: "85" } });
    fireEvent.change(screen.getByLabelText("Target price"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "eur" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert rules" }));
    await waitFor(() => expect(mocked.saveAlertRules).toHaveBeenCalledWith("p1", {
      muted: ["price_up"], price_rise_percent: 40, likely_out_percent: 85, target_price: "0.5", target_currency: "EUR",
    }));
  });

  it("keeps an alert QA has yet to switch off unticked, marked as asked, and asks again on save", async () => {
    mocked.getAlertRules.mockResolvedValue({ muted: [], muting: ["price_up"], price_rise_percent: null, likely_out_percent: null, target_price: null, target_currency: "", mutable: MUTABLE });
    mocked.saveAlertRules.mockImplementation(async (_id, rules) => ({ ...rules, muted: [], muting: ["price_up"] }));
    render(<AlertRulesSection partId="p1" canEdit />);
    expect((await screen.findByLabelText("Price rises")).getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByText("Asked QA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save alert rules" }));
    await waitFor(() => expect(mocked.saveAlertRules).toHaveBeenCalledWith("p1", expect.objectContaining({ muted: ["price_up"] })));
    expect(await screen.findByText("Asked QA")).toBeTruthy();
  });

  it("says the alerts go to the Dashboard, and never suggests email", async () => {
    const { container } = render(<AlertRulesSection partId="p1" canEdit />);
    expect(await screen.findByText("A Dashboard alert when")).toBeTruthy();
    expect(container.textContent).not.toMatch(/mail|notify me|alert me/i);
  });

  it("types the stock threshold beside its rule and saves it on the watch", async () => {
    const onChanged = vi.fn(async () => undefined);
    mocked.followPart.mockResolvedValue({} as never);
    render(<AlertRulesSection partId="p1" canEdit watch={WATCH} onChanged={onChanged} />);
    const box = await screen.findByLabelText("Stock threshold");
    expect((box as HTMLInputElement).value).toBe("100");
    fireEvent.change(box, { target: { value: "lots" } });
    expect(screen.getByRole("button", { name: "Save alert rules" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(box, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert rules" }));
    await waitFor(() => expect(mocked.followPart).toHaveBeenCalledWith("p1", { threshold: 250 }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("leaves the watch alone when the threshold is unchanged", async () => {
    render(<AlertRulesSection partId="p1" canEdit watch={WATCH} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save alert rules" }));
    await waitFor(() => expect(mocked.saveAlertRules).toHaveBeenCalled());
    expect(mocked.followPart).not.toHaveBeenCalled();
  });

  it("shows nothing to someone who cannot edit", () => {
    const { container } = render(<AlertRulesSection partId="p1" canEdit={false} />);
    expect(container.textContent).toBe("");
  });
});

describe("the new alert kinds in words", () => {
  it("say what was crossed", () => {
    expect(alertTitle(alertFixture({ kind: "target_price_missed", detail: { price: "0.8", target: "0.5", currency: "EUR" } }))).toBe("Price 0.8 EUR is over your target of 0.5");
    expect(alertTitle(alertFixture({ kind: "assessment_worse", detail: { was: "ok", now: "warning" } }))).toBe("Assessment went from ok to warning");
  });
});
