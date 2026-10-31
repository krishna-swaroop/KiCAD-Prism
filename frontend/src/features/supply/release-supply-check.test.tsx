import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReleaseCheck } from "@/types/supply";

vi.mock("./release-check-api", () => ({ getReleaseCheck: vi.fn() }));

import * as api from "./release-check-api";
import { ReleaseSupplyCheck, ReleaseSupplySummary } from "./release-supply-check";
import { releaseLineFixture } from "./supply-test-fixtures";

const mocked = vi.mocked(api);

const available: ReleaseCheck = {
  available: true, health: 5.4, status: "error", parts: 40, tracked: 38, not_tracked: 2, needing_a_look: 1, without_number: 0,
  attention: [releaseLineFixture({
    manufacturer: "Acme", mpn: "OBS-1", quantity: 2, state: "tracked", part_id: "p1", health: 0, status: "fatal",
    findings: [{ check: "obsolete", severity: "fatal", text: "The manufacturer lists this part as obsolete." }], waived: 0,
  })],
  lines: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("the supply check on a release", () => {
  it("shows health, how much is tracked and the parts that need a look, as a note", async () => {
    mocked.getReleaseCheck.mockResolvedValue(available);
    render(<ReleaseSupplyCheck projectId="prj_1" buildId="bld_1" />);
    expect(await screen.findByText("BOM health 5.4 of 10")).toBeTruthy();
    expect(mocked.getReleaseCheck).toHaveBeenCalledWith("prj_1", "bld_1", expect.anything());
    expect(screen.getByText(/38 of 40 parts tracked, 2 not yet/)).toBeTruthy();
    expect(screen.getByText(/does not block publishing/)).toBeTruthy();
    const list = screen.getByRole("list", { name: "Parts that need a look" });
    expect(within(list).getByText("OBS-1, Acme")).toBeTruthy();
    expect(within(list).getByText("The manufacturer lists this part as obsolete.")).toBeTruthy();
  });

  it("says how many lines of the BOM name no part number", async () => {
    mocked.getReleaseCheck.mockResolvedValue({ ...available, without_number: 3 } as ReleaseCheck);
    render(<ReleaseSupplyCheck projectId="prj_1" buildId="bld_1" />);
    expect(await screen.findByText(/3 lines without a part number/)).toBeTruthy();
  });

  it("has a one-line summary for the publish step", async () => {
    mocked.getReleaseCheck.mockResolvedValue(available);
    render(<ReleaseSupplySummary projectId="prj_1" buildId="bld_1" />);
    expect(await screen.findByText("Supply health 5.4 of 10")).toBeTruthy();
    expect(screen.getByText("1 to look at")).toBeTruthy();
  });

  it("lists nothing when no part needs a look", async () => {
    mocked.getReleaseCheck.mockResolvedValue({ ...available, status: "ok", health: 8.8, needing_a_look: 0, attention: [] } as ReleaseCheck);
    render(<ReleaseSupplyCheck projectId="prj_1" buildId="bld_1" />);
    await screen.findByText("BOM health 8.8 of 10");
    expect(screen.queryByRole("list", { name: "Parts that need a look" })).toBeNull();
  });

  it("explains a BOM that has not been read, and shows nothing when the check fails or is not allowed", async () => {
    mocked.getReleaseCheck.mockResolvedValue({ available: false, reason: "This revision's BOM has not been read yet." });
    render(<ReleaseSupplyCheck projectId="prj_1" buildId="bld_1" />);
    expect(await screen.findByText("This revision's BOM has not been read yet.")).toBeTruthy();
    cleanup();
    mocked.getReleaseCheck.mockRejectedValue(new Error("Insufficient permissions"));
    const { container } = render(<ReleaseSupplyCheck projectId="prj_2" buildId="bld_1" />);
    await waitFor(() => expect(mocked.getReleaseCheck).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
