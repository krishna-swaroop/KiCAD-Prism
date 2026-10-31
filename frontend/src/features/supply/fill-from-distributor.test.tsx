import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FillCandidate } from "@/types/supply";

import { defaultChosen, fillChanges } from "./fill-model";
import { FillFromDistributor } from "./fill-from-distributor";

const mocked = vi.hoisted(() => ({ searchFillCandidates: vi.fn(), getFillDetails: vi.fn() }));
vi.mock("./fill-api", () => mocked);

const candidate: FillCandidate = {
  connector_id: "c1",
  connector: "Mouser",
  provider: "mouser",
  sku: "595-LM358DR",
  mpn: "LM358DR",
  manufacturer: "Texas Instruments",
  description: "Dual op amp",
  product_url: "https://example.invalid/p",
  manufacturer_matches: true,
};
const details = { description: "Amplifier, dual", datasheet_url: "https://example.invalid/ds.pdf", package_name: "", category: "" };
const form = { mpn: "LM358DR", manufacturer: "texas instruments", description: "", datasheet_url: "", vendor: "", vendor_part_number: "" };

describe("fillChanges", () => {
  it("lists what differs, leaves out what matches or is blank, and fills only empty fields by default", () => {
    const changes = fillChanges(candidate, { ...details, datasheet_url: "" }, { ...form, mpn: "LM358DR", vendor: "Mouser" });
    expect(changes.map((change) => change.key)).toEqual(["manufacturer", "description", "vendor_part_number"]);
    expect([...defaultChosen(changes)]).toEqual(["description", "vendor_part_number"]);
  });

  it("skips fields the form does not have", () => {
    expect(fillChanges(candidate, details, { mpn: "LM358DR" })).toEqual([]);
  });
});

describe("FillFromDistributor", () => {
  beforeEach(() => {
    mocked.searchFillCandidates.mockResolvedValue({ candidates: [candidate], skipped: [{ connector: "TME", reason: "no match" }] });
    mocked.getFillDetails.mockResolvedValue(details);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("looks up, shows the candidates, then hands the chosen fields to the form", async () => {
    const onApply = vi.fn();
    render(<FillFromDistributor values={form} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    expect(await screen.findByText(/Texas Instruments, LM358DR/)).toBeTruthy();
    expect(mocked.searchFillCandidates).toHaveBeenCalledWith("LM358DR", "texas instruments");
    expect(screen.getByText(/TME \(no match\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(await screen.findByText("Amplifier, dual")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Fill 4 fields/ }));
    expect(onApply).toHaveBeenCalledWith({
      description: "Amplifier, dual",
      datasheet_url: "https://example.invalid/ds.pdf",
      vendor: "Mouser",
      vendor_part_number: "595-LM358DR",
    });
  });

  it("does not replace a filled field unless it is ticked", async () => {
    const onApply = vi.fn();
    render(<FillFromDistributor values={form} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Use" }));
    const manufacturer = await screen.findByRole("checkbox", { name: "Manufacturer" });
    expect(manufacturer.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(manufacturer);
    fireEvent.click(screen.getByRole("button", { name: /Fill 5 fields/ }));
    expect(onApply.mock.calls[0][0].manufacturer).toBe("Texas Instruments");
  });

  it("says so when nothing is found, and shows a failure", async () => {
    mocked.searchFillCandidates.mockResolvedValueOnce({ candidates: [], skipped: [] });
    render(<FillFromDistributor values={form} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    expect(await screen.findByText("No distributor knows this part number.")).toBeTruthy();
    mocked.searchFillCandidates.mockRejectedValueOnce(new Error("Could not look the part up"));
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not look the part up"));
  });

  it("needs a part number to look up", () => {
    render(<FillFromDistributor values={{ ...form, mpn: " " }} onApply={vi.fn()} />);
    expect((screen.getByRole("button", { name: /Look up/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
