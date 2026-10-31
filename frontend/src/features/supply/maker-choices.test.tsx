import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplyChoice, SupplyMatched } from "@/types/supply";

vi.mock("./supply-api", () => ({ chooseSupplyMaker: vi.fn(), otherSupplyMaker: vi.fn(), undoLearnedAlias: vi.fn(), undoSettledPart: vi.fn(), markPartNumbers: vi.fn() }));

import { MakerChoices } from "./maker-choices";
import { MatchedByPrism } from "./matched-by-prism";
import * as api from "./supply-api";

const mocked = vi.mocked(api);

const maker: SupplyChoice = {
  part_id: "p1", mpn: "AB-1", manufacturer: "Not known yet", kind: "maker",
  options: [
    { key: "acme", spelling: "Acme", spellings: ["Acme"], connectors: ["DigiKey"], listings: 1 },
    { key: "bolt", spelling: "Bolt Co", spellings: ["Bolt Co"], connectors: ["Mouser"], listings: 2 },
  ],
};
const unlisted: SupplyChoice = {
  part_id: "p2", mpn: "LT6655", manufacturer: "Linear Technology", kind: "unlisted",
  options: [{ key: "analog devices", spelling: "Analog Devices", spellings: ["Analog Devices"], connectors: ["DigiKey", "Mouser"], listings: 2 }],
};

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(cleanup);

describe("a part whose maker is not settled", () => {
  it("is answered with one click on the maker", async () => {
    mocked.chooseSupplyMaker.mockResolvedValue({ result: "settled" });
    const decided = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><MakerChoices choices={[maker]} onDecided={decided} /></MemoryRouter>);
    const choice = screen.getByLabelText("Choice for AB-1");
    fireEvent.click(within(choice).getAllByRole("button", { name: "This maker" })[1]);
    await waitFor(() => expect(mocked.chooseSupplyMaker).toHaveBeenCalledWith("p1", "bolt"));
    await waitFor(() => expect(decided).toHaveBeenCalled());
  });

  it("asks whether a maker no distributor lists is the same, and a no sets the listings aside", async () => {
    mocked.chooseSupplyMaker.mockResolvedValue({ result: "settled" });
    mocked.otherSupplyMaker.mockResolvedValue({ rejected: 2 });
    render(<MemoryRouter><MakerChoices choices={[unlisted]} onDecided={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    expect(screen.getByText("No distributor lists it under Linear Technology")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Different maker" }));
    await waitFor(() => expect(mocked.otherSupplyMaker).toHaveBeenCalledWith("p2", "analog devices"));
  });

  it("asks which numbers a part is sold as, all ticked, and uses the ticked ones", async () => {
    mocked.markPartNumbers.mockResolvedValue({ counted: 1 });
    const family: SupplyChoice = {
      part_id: "p3", mpn: "GRM155", manufacturer: "Murata", kind: "number",
      options: [
        { key: "GRM155D", spelling: "GRM155D", spellings: ["GRM155D"], connectors: ["DigiKey"], listings: 1 },
        { key: "GRM155J", spelling: "GRM155J", spellings: ["GRM155J"], connectors: ["Mouser"], listings: 1 },
      ],
    };
    render(<MemoryRouter><MakerChoices choices={[family]} onDecided={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Use GRM155J"));
    fireEvent.click(screen.getByRole("button", { name: "Use (1)" }));
    await waitFor(() => expect(mocked.markPartNumbers).toHaveBeenCalledWith("p3", ["GRM155D"]));
  });

  it("shows nothing when there is nothing to choose", () => {
    const { container } = render(<MemoryRouter><MakerChoices choices={[]} onDecided={vi.fn()} /></MemoryRouter>);
    expect(container.textContent).toBe("");
  });
});

describe("what Prism matched", () => {
  const matched: SupplyMatched = {
    aliases: [{ alias_key: "acme co", alias_text: "ACME Co", manufacturer: "Acme", first_seen_at: "2026-10-16T10:00:00Z", parts: 3 }],
    parts: [{ part_id: "p9", mpn: "ZZ-9", manufacturer: "Zeta Works", at: "2026-10-16T10:00:00Z" }],
  };

  it("lists learned spellings with an undo for those who decide, and settled parts", async () => {
    mocked.undoLearnedAlias.mockResolvedValue({ listings: 0 });
    render(<MemoryRouter><MatchedByPrism matched={matched} canDecide onDecided={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Matched by Prism/ }));
    expect(screen.getByText(/Learned from 3 parts/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ZZ-9" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[0]);
    await waitFor(() => expect(mocked.undoLearnedAlias).toHaveBeenCalledWith("acme co"));
  });

  it("takes back a part's maker that Prism settled", async () => {
    mocked.undoSettledPart.mockResolvedValue({ undone: true });
    render(<MemoryRouter><MatchedByPrism matched={matched} canDecide onDecided={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Matched by Prism/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[1]);
    await waitFor(() => expect(mocked.undoSettledPart).toHaveBeenCalledWith("p9"));
  });

  it("offers no undo to those who may not decide", () => {
    render(<MemoryRouter><MatchedByPrism matched={matched} canDecide={false} onDecided={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Matched by Prism/ }));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
