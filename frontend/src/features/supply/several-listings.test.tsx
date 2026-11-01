import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./packaging-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./packaging-api")>()), listPackagingSeveral: vi.fn() }));
vi.mock("./packaging-pick-dialog", () => ({ PackagingPickDialog: ({ partId }: { partId: string }) => <div>Picking {partId}</div> }));

import * as api from "./packaging-api";
import { SeveralListings } from "./several-listings";

afterEach(cleanup);

const row = (partId: string, mpn: string, by: string) => ({
  part_id: partId, connector_id: "c1", connector: "DigiKey", provider: "digikey", mpn, manufacturer: "Acme", listings: 3,
  picked_listing: by ? "l1" : null, picked_sku: by ? "CT-1" : "", picked_by: by, note: "", new_since_pick: 0, saves_calls_a_day: 0,
});

describe("several listings at a distributor", () => {
  it("lists the picks, narrows to the parts with none, and opens the pick dialog", async () => {
    vi.mocked(api.listPackagingSeveral).mockResolvedValue({ items: [row("p1", "R1", "auto"), row("p2", "R2", "")] });
    render(<MemoryRouter><SeveralListings canDecide /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Several listings at a distributor/ }));
    expect(await screen.findByText("Following CT-1, picked by Prism")).toBeTruthy();
    expect(screen.getByText("No pick yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No pick yet (1)" }));
    expect(screen.queryByText("R1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(screen.getByText("Picking p2")).toBeTruthy();
  });

  it("shows nothing without such parts", async () => {
    vi.mocked(api.listPackagingSeveral).mockResolvedValue({ items: [] });
    const { container } = render(<MemoryRouter><SeveralListings canDecide /></MemoryRouter>);
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
});
