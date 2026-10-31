import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "@/lib/api";
import type { User } from "@/types/auth";
import type { SupplyReviewQueue } from "@/types/supply";

vi.mock("./supply-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supply-api")>()),
  getSupplyReviewQueue: vi.fn(),
  confirmSupplyAlias: vi.fn(),
  pinSupplyListing: vi.fn(),
  rejectSupplyListing: vi.fn(),
}));

import { ReviewView } from "./review-view";
import * as api from "./supply-api";
import { reviewListingFixture, reviewQueueFixture, toApproveFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);
const qa: User = { name: "Quinn", email: "quinn@example.com", role: "qa" };
const designer: User = { name: "Dee", email: "dee@example.com", role: "designer" };

const TI = { id: "m1", name: "Texas Instruments", part_count: 3 };

function queue(overrides: Partial<SupplyReviewQueue> = {}): SupplyReviewQueue {
  return reviewQueueFixture({
    aliases: [{ alias_key: "ti", alias_text: "TI", seen_at_provider: "mouser", first_seen_at: "2026-03-01T10:00:00Z", waiting_listings: 2 }],
    listings: [
      reviewListingFixture({
        id: "l1", connector_id: "c1", connector_name: "Mouser EU", sku: "595-LM358", raw_mpn: "LM358D", raw_manufacturer: "TI",
        match_state: "manufacturer_unresolved", match_reason: "manufacturer spelling not confirmed",
        first_seen_at: "2026-03-01T10:00:00Z", part: { id: "p1", mpn: "LM358D", manufacturer: "Texas Instruments" },
      }),
      reviewListingFixture({
        id: "l2", connector_id: "c1", connector_name: "Mouser EU", sku: "595-LM358DR", raw_mpn: "LM358DR", raw_manufacturer: "Texas Instruments",
        match_state: "near", match_reason: "different part number",
        first_seen_at: "2026-03-01T09:00:00Z", part: { id: "p1", mpn: "LM358D", manufacturer: "Texas Instruments" },
      }),
    ],
    counts: { aliases: 1, unresolved: 1, near: 1 },
    manufacturers: [TI],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getSupplyReviewQueue.mockResolvedValue(queue());
});
afterEach(cleanup);

describe("the review queue", () => {
  it("shows spellings and listings with what they are candidates for", async () => {
    render(<ReviewView user={qa} />);
    const alias = await screen.findByRole("article", { name: "Spelling TI" });
    expect(within(alias).getByText("Seen at mouser. 2 listings are waiting.")).toBeTruthy();
    const unresolved = screen.getByRole("article", { name: "Listing 595-LM358" });
    expect(within(unresolved).getByText("Spelling not mapped")).toBeTruthy();
    expect(within(unresolved).getByText(/For LM358D by Texas Instruments/)).toBeTruthy();
    const near = screen.getByRole("article", { name: "Listing 595-LM358DR" });
    expect(within(near).getByText("Near match")).toBeTruthy();
    expect(within(near).getByText(/Different part number\./)).toBeTruthy();
    expect(within(screen.getByLabelText("Manufacturer spellings")).getByText("1")).toBeTruthy();
    expect(within(screen.getByLabelText("Listings waiting")).getByText("2")).toBeTruthy();
  });

  it("lets readers look but not decide", async () => {
    render(<ReviewView user={designer} />);
    await screen.findByRole("article", { name: "Spelling TI" });
    expect(screen.getByText(/QA and administrators decide\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Confirm as this part|Reject|Map|Create and map/ })).toBeNull();
    expect(screen.queryByLabelText("Manufacturer for TI")).toBeNull();
  });

  it("says when there is nothing to review", async () => {
    mocked.getSupplyReviewQueue.mockResolvedValue(queue({ aliases: [], listings: [], counts: { aliases: 0, unresolved: 0, near: 0 } }));
    render(<ReviewView user={qa} />);
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
  });

  it("says there is nothing to review when the server sends an empty to-approve list", async () => {
    mocked.getSupplyReviewQueue.mockResolvedValue(queue({ aliases: [], listings: [], counts: { aliases: 0, unresolved: 0, near: 0 }, to_approve: toApproveFixture() }));
    render(<ReviewView user={qa} />);
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
  });

  it("does not say nothing to review when only an alternate waits", async () => {
    mocked.getSupplyReviewQueue.mockResolvedValue(queue({
      aliases: [], listings: [], counts: { aliases: 0, unresolved: 0, near: 0 },
      to_approve: toApproveFixture({ alternates: [{ component_id: "cmp-1", component_name: "R 10k 0603", component_mpn: "RC0603", part_id: "p9", mpn: "ERJ-3EKF1002V", manufacturer: "Panasonic", proposed_by: "dee@example.com", proposed_at: "2026-10-20T10:00:00Z", main_part_id: "", main_mpn: "" }] }),
    }));
    render(<MemoryRouter><ReviewView user={qa} /></MemoryRouter>);
    expect(await screen.findByText(/ERJ-3EKF1002V/)).toBeTruthy();
    expect(screen.queryByText("Nothing to review")).toBeNull();
  });

  it("reports a load failure and retries", async () => {
    mocked.getSupplyReviewQueue.mockRejectedValueOnce(new Error("Could not load the review queue"));
    render(<ReviewView user={qa} />);
    expect(await screen.findByText("Could not load the review queue")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("article", { name: "Spelling TI" })).toBeTruthy();
  });
});

describe("deciding", () => {
  it("maps a spelling to a new manufacturer and refreshes the queue", async () => {
    mocked.confirmSupplyAlias.mockResolvedValue({ listings_updated: 1 });
    render(<ReviewView user={qa} />);
    await screen.findByRole("article", { name: "Spelling TI" });
    fireEvent.click(screen.getByRole("button", { name: "New manufacturer" }));
    const map = screen.getByRole("button", { name: "Create and map" }) as HTMLButtonElement;
    expect(map.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New manufacturer for TI"), { target: { value: "  Texas Instruments  " } });
    mocked.getSupplyReviewQueue.mockResolvedValue(queue({ aliases: [], listings: [], counts: { aliases: 0, unresolved: 0, near: 0 } }));
    fireEvent.click(map);

    await waitFor(() => expect(mocked.confirmSupplyAlias).toHaveBeenCalledWith({ alias_key: "ti", new_manufacturer_name: "Texas Instruments" }));
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
    expect(mocked.getSupplyReviewQueue).toHaveBeenCalledTimes(2);
  });

  it("starts in naming mode when no manufacturer exists yet", async () => {
    mocked.getSupplyReviewQueue.mockResolvedValue(queue({ manufacturers: [] }));
    render(<ReviewView user={qa} />);
    expect(await screen.findByLabelText("New manufacturer for TI")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose existing" })).toBeNull();
  });

  it("offers the existing manufacturers to map to", async () => {
    render(<ReviewView user={qa} />);
    const trigger = await screen.findByLabelText("Manufacturer for TI");
    expect((screen.getByRole("button", { name: "Map" }) as HTMLButtonElement).disabled).toBe(true);
    expect(trigger.textContent).toContain("Map to manufacturer");
  });

  it("confirms a listing as the part it is a candidate for", async () => {
    mocked.pinSupplyListing.mockResolvedValue(undefined);
    render(<ReviewView user={qa} />);
    const row = await screen.findByRole("article", { name: "Listing 595-LM358" });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm as this part" }));
    await waitFor(() => expect(mocked.pinSupplyListing).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(mocked.getSupplyReviewQueue).toHaveBeenCalledTimes(2));
  });

  it("asks before pinning a listing that has another number than the part", async () => {
    mocked.pinSupplyListing.mockResolvedValue(undefined);
    render(<ReviewView user={qa} />);
    const row = await screen.findByRole("article", { name: "Listing 595-LM358DR" });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm as this part" }));
    expect(await screen.findByText("Same Part Under Another Number?")).toBeTruthy();
    expect(mocked.pinSupplyListing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add as a number of the part" }));
    await waitFor(() => expect(mocked.pinSupplyListing).toHaveBeenCalledWith("l2", true));
  });

  it("rejects a listing", async () => {
    mocked.rejectSupplyListing.mockResolvedValue(undefined);
    render(<ReviewView user={qa} />);
    const row = await screen.findByRole("article", { name: "Listing 595-LM358" });
    fireEvent.click(within(row).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(mocked.rejectSupplyListing).toHaveBeenCalledWith("l1"));
  });

  it("keeps the row and shows the reason when a decision fails", async () => {
    mocked.pinSupplyListing.mockRejectedValue(new ApiHttpError(403, "Supply review access required"));
    render(<ReviewView user={qa} />);
    const row = await screen.findByRole("article", { name: "Listing 595-LM358" });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm as this part" }));
    expect(await within(row).findByRole("alert")).toHaveProperty("textContent", "Supply review access required");
    expect(mocked.getSupplyReviewQueue).toHaveBeenCalledTimes(1);
  });

  it("keeps the list on screen if the refresh after a decision fails", async () => {
    mocked.rejectSupplyListing.mockResolvedValue(undefined);
    render(<ReviewView user={qa} />);
    const row = await screen.findByRole("article", { name: "Listing 595-LM358" });
    mocked.getSupplyReviewQueue.mockRejectedValue(new Error("Could not load the review queue"));
    fireEvent.click(within(row).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Could not load the review queue")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Spelling TI" })).toBeTruthy();
  });
});
