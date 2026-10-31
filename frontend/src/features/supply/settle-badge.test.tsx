import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tracking-api", () => ({ getProjectOpen: vi.fn(), chooseTrackLine: vi.fn() }));
vi.mock("./supply-api", () => ({ chooseSupplyMaker: vi.fn(), otherSupplyMaker: vi.fn(), markPartNumbers: vi.fn() }));

import { SettleBadge } from "./settle-badge";
import * as api from "./tracking-api";

const mocked = vi.mocked(api);
const line = { mpn: "LM358D", manufacturer: "Some Name", candidates: [{ part_id: "p1", manufacturer: "Texas Instruments" }, { part_id: "p2", manufacturer: "Onsemi" }] };

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); });
afterEach(cleanup);

describe("a project's open questions", () => {
  it("shows nothing when there are none", async () => {
    mocked.getProjectOpen.mockResolvedValue({ choices: [], lines: [] });
    const { container } = render(<MemoryRouter><SettleBadge projectId="prj_1" /></MemoryRouter>);
    await waitFor(() => expect(mocked.getProjectOpen).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("counts them, opens the answers and refreshes after one", async () => {
    mocked.getProjectOpen
      .mockResolvedValueOnce({ choices: [], lines: [line] })
      .mockResolvedValue({ choices: [], lines: [] });
    mocked.chooseTrackLine.mockResolvedValue(undefined);
    const changed = vi.fn();
    render(<MemoryRouter><SettleBadge projectId="prj_1" onChanged={changed} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "1 to settle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Texas Instruments" }));
    await waitFor(() => expect(mocked.chooseTrackLine).toHaveBeenCalledWith("prj_1", "p1", "Some Name"));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: /to settle/ })).toBeNull());
  });
});
