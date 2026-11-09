import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supply-api", () => ({ rejectSupplyListings: vi.fn(), pinSupplyListing: vi.fn() }));

import { OtherNumberPins } from "./other-number-pins";
import { pinSupplyListing, rejectSupplyListings } from "./supply-api";

const reject = vi.mocked(rejectSupplyListings);
const groups = [{
  part_id: "p1", mpn: "TSR 1-2450", manufacturer: "Traco",
  listings: [
    { id: "a", sku: "C1", raw_mpn: "ACAG0301-2450-T", connector: "LCSC" },
    { id: "b", sku: "C2", raw_mpn: "TSRN 1-2450", connector: "LCSC" },
  ],
}];

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(cleanup);

describe("pins under another number", () => {
  it("takes the unticked listings off the part in one go", async () => {
    reject.mockResolvedValue({ rejected: 1 });
    const decided = vi.fn().mockResolvedValue(undefined);
    render(<OtherNumberPins groups={groups} canDecide onDecided={decided} />);
    const group = screen.getByLabelText("Pinned under other numbers: TSR 1-2450");
    fireEvent.click(within(group).getByLabelText("Track C1"));
    fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith(["a"]));
    expect(vi.mocked(pinSupplyListing)).toHaveBeenCalledWith("b", true);
    await waitFor(() => expect(decided).toHaveBeenCalled());
  });

  it("shows nothing without such pins and no buttons to those who may not decide", () => {
    const { container, rerender } = render(<OtherNumberPins groups={[]} canDecide onDecided={vi.fn()} />);
    expect(container.textContent).toBe("");
    rerender(<OtherNumberPins groups={groups} canDecide={false} onDecided={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
