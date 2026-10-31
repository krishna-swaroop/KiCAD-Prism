import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRole } from "@/types/auth";
import type { SupplyAssessment, SupplyFinding, SupplyOutlook } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getSupplyAssessment: vi.fn(),
  proposeWaiver: vi.fn(),
  decideWaiver: vi.fn(),
  revokeWaiver: vi.fn(),
}));

import { OutlookSection } from "./outlook-section";
import * as api from "./supply-api";
import { forgetServerState } from "@/lib/server-state";

const mocked = vi.mocked(api);

function finding(overrides: Partial<SupplyFinding> = {}): SupplyFinding {
  return { check: "nrnd", severity: "warning", text: "The manufacturer does not recommend this part for new designs.", scope: "nrnd", waiver: null, detail: {}, ...overrides };
}

function assessment(overrides: Partial<SupplyAssessment> = {}): SupplyAssessment {
  return {
    part_id: "p1", health: 6.4, status: "warning", need: null, changes_at: null, findings: [finding()],
    sub_scores: [
      { name: "lifecycle", score: 3, reasons: ["Manufacturer lifecycle: nrnd."] },
      { name: "sourcing", score: 3, reasons: ["Only one distributor holds it."] },
      { name: "inventory", score: 1, reasons: [] },
      { name: "market", score: 1, reasons: [] },
      { name: "compliance", score: 1, reasons: [] },
    ],
    ...overrides,
  };
}

const waiver = { id: "w1", state: "approved" as const, reason: "We hold stock", proposed_by: "a@example.com", decided_by: "qa@example.com", holds: true, outdated: false };

const OUTLOOK: SupplyOutlook = {
  band: "no_signs", label: "No signs of an end", method: "rule-based", signals: [],
};

function renderIt(role: UserRole = "designer") {
  render(<OutlookSection outlook={OUTLOOK} partId="p1" role={role} />);
}

/** The scores and findings open from the info icon; a click holds them open. */
async function openDetails() {
  fireEvent.click(await screen.findByRole("button", { name: "Show how the outlook and the health are worked out" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getSupplyAssessment.mockResolvedValue(assessment());
  mocked.proposeWaiver.mockResolvedValue({ id: "w1", state: "proposed" });
  mocked.decideWaiver.mockResolvedValue();
  mocked.revokeWaiver.mockResolvedValue();
});
afterEach(cleanup);

describe("the outlook and health line", () => {
  it("shows health, the five risk scores and the findings", async () => {
    renderIt();
    expect(await screen.findByText("6.4 of 10")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Risk" })).toBeNull();
    await openDetails();
    const risk = screen.getByRole("list", { name: "Risk" });
    expect(within(risk).getAllByRole("listitem")).toHaveLength(5);
    expect(within(risk).getByTitle("Only one distributor holds it.")).toBeTruthy();
    expect(screen.getByText(/does not recommend this part/)).toBeTruthy();
  });

  it("puts the health on the outlook's line under one title, with one info icon for both", async () => {
    renderIt();
    expect(await screen.findByText("6.4 of 10")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Health" })).toBeNull();
    const section = screen.getByRole("region", { name: "Outlook" });
    expect(within(section).getAllByRole("button", { name: /Show how the outlook/ })).toHaveLength(1);
    expect(within(section).getByText("No signs of an end").className).toContain("success");
    await openDetails();
    expect(screen.getByText(/Nothing found points to an end/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Risk" })).toBeTruthy();
  });

  it("opens the scores and findings when the info icon is hovered, and closes them again", async () => {
    renderIt();
    const icon = await screen.findByRole("button", { name: "Show how the outlook and the health are worked out" });
    fireEvent.mouseEnter(icon);
    expect(await screen.findByRole("list", { name: "Risk" })).toBeTruthy();
    fireEvent.mouseLeave(icon);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Risk" })).toBeNull());
  });

  it("says so when there is nothing to assess", async () => {
    mocked.getSupplyAssessment.mockResolvedValue(assessment({ status: "unknown", health: 0, findings: [] }));
    renderIt();
    expect(await screen.findByText("No data to assess yet")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Risk" })).toBeNull();
  });

  it("lets a designer ask QA to waive a finding with a reason, and puts the severity tag above each finding", async () => {
    renderIt("designer");
    await openDetails();
    const findings = await screen.findByRole("list", { name: "Findings" });
    fireEvent.click(within(findings).getByRole("button", { name: "Waive" }));
    fireEvent.change(within(findings).getByRole("textbox"), { target: { value: "We hold stock" } });
    fireEvent.click(within(findings).getByRole("button", { name: "Ask QA" }));
    await waitFor(() => expect(mocked.proposeWaiver).toHaveBeenCalledWith("p1", "nrnd", "We hold stock"));
    const tag = within(findings).getByText("Warning");
    const text = within(findings).getByText(/does not recommend this part/);
    expect(tag.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the outlook's signals in the same modal", async () => {
    render(<OutlookSection outlook={{ ...OUTLOOK, band: "ending", label: "Ending", signals: [{ text: "A notice announces end of life.", source: "product change notice", weight: "hard" }] }} partId="p1" role="designer" />);
    expect(screen.queryByText(/A notice announces end of life/)).toBeNull();
    await openDetails();
    expect(screen.getByRole("list", { name: "Outlook signals" })).toBeTruthy();
    expect(screen.getByText("(product change notice)")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Risk" })).toBeTruthy();
  });

  it("lets QA approve what a designer asked for, but not a designer", async () => {
    const waiting = assessment({ findings: [finding({ waiver: { ...waiver, state: "proposed", holds: false, decided_by: "" } })] });
    mocked.getSupplyAssessment.mockResolvedValue(waiting);
    renderIt("qa");
    await openDetails();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocked.decideWaiver).toHaveBeenCalledWith("w1", true));
    cleanup();
    forgetServerState([]);
    renderIt("designer");
    await openDetails();
    await screen.findByText(/Waiting for QA/);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy();
  });

  it("shows a waiver that holds as accepted, and one for an earlier condition as needing a look", async () => {
    mocked.getSupplyAssessment.mockResolvedValue(assessment({ status: "ok", findings: [finding({ waiver })] }));
    renderIt("qa");
    await openDetails();
    expect(await screen.findByText("Waived by qa@example.com: We hold stock")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    cleanup();
    forgetServerState([]);
    mocked.getSupplyAssessment.mockResolvedValue(assessment({ findings: [finding({ waiver: { ...waiver, holds: false, outdated: true } })] }));
    renderIt("designer");
    await openDetails();
    expect(await screen.findByText(/Waived for an earlier condition/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waive again" })).toBeTruthy();
  });

  it("offers no waiver to a viewer and shows a failed action", async () => {
    renderIt("viewer");
    await openDetails();
    await screen.findByText(/does not recommend/);
    expect(screen.queryByRole("button", { name: "Waive" })).toBeNull();
    cleanup();
    forgetServerState([]);
    mocked.decideWaiver.mockRejectedValue(new Error("Could not save the decision"));
    mocked.getSupplyAssessment.mockResolvedValue(assessment({ findings: [finding({ waiver: { ...waiver, state: "proposed", holds: false } })] }));
    renderIt("admin");
    await openDetails();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not save the decision");
  });
});
