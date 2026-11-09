import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/types/auth";
import type { SemanticComponent } from "@/types/prism-selection";

vi.mock("./supply-api", () => ({ lookupSupplyPart: vi.fn(), getSupplyPart: vi.fn() }));
vi.mock("./part-sheet", () => ({ PartSheet: ({ partId }: { partId: string | null }) => (partId ? <div>Sheet of {partId}</div> : null) }));

import * as api from "./supply-api";
import { SelectionSupplyRow } from "./selection-supply-row";

const part: SemanticComponent = {
  componentUid: "cmp:R1", reference: "R1", value: "10k", footprint: "R_0603",
  fields: { Manufacturer: "Acme", "Manufacturer Part Number": "R-10K" },
} as SemanticComponent;
const user = (role: User["role"]) => ({ role } as User);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("the supply link of a selected component", () => {
  it("opens the part's sheet when Prism tracks the part", async () => {
    vi.mocked(api.lookupSupplyPart).mockResolvedValue({ partId: "p1", followed: true });
    render(<SelectionSupplyRow component={part} user={user("designer")} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open supply part" }));
    expect(await screen.findByText("Sheet of p1")).toBeTruthy();
    expect(api.lookupSupplyPart).toHaveBeenCalledWith("Acme", "R-10K", expect.anything());
    expect(screen.queryByText("Not tracked")).toBeNull();
  });

  it("still opens a part Prism knows but does not track, and says it is not tracked", async () => {
    vi.mocked(api.lookupSupplyPart).mockResolvedValue({ partId: "p2", followed: false });
    render(<SelectionSupplyRow component={part} user={user("designer")} />);
    expect(await screen.findByText("Not tracked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open supply part" }));
    expect(await screen.findByText("Sheet of p2")).toBeTruthy();
  });

  it("says so when Supply does not know the part", async () => {
    vi.mocked(api.lookupSupplyPart).mockResolvedValue(null);
    render(<SelectionSupplyRow component={part} user={user("designer")} />);
    expect(await screen.findByText("Not in Supply")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open supply part" })).toBeNull();
  });

  it("shows nothing to a role that cannot read supply data, or for a symbol without a part number", async () => {
    const { container, rerender } = render(<SelectionSupplyRow component={part} user={user("viewer")} />);
    expect(container.innerHTML).toBe("");
    rerender(<SelectionSupplyRow component={{ ...part, fields: {} } as SemanticComponent} user={user("designer")} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(api.lookupSupplyPart).not.toHaveBeenCalled();
  });
});
