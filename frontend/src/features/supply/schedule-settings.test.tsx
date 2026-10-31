import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./tracking-api", () => ({ getSchedule: vi.fn(), saveSchedule: vi.fn() }));

import { ScheduleSettings } from "./schedule-settings";
import * as api from "./tracking-api";

const settings = { spare: { waiting: true, tier2_early: true, notices: true, library: true } };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.getSchedule).mockResolvedValue(settings); });
afterEach(cleanup);

describe("spare work", () => {
  it("saves a switch", async () => {
    vi.mocked(api.saveSchedule).mockImplementation(async (next) => next);
    render(<ScheduleSettings />);
    fireEvent.click(await screen.findByLabelText("Change notices of untracked parts"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveSchedule).toHaveBeenCalledWith({ ...settings, spare: { waiting: true, tier2_early: true, notices: false, library: true } }));
  });

  it("does not offer a working week, which spare budget no longer follows", async () => {
    render(<ScheduleSettings />);
    await screen.findByLabelText("Parts waiting for room");
    expect(screen.queryByLabelText("Sat")).toBeNull();
    expect(screen.queryByLabelText("Time zone")).toBeNull();
    expect(screen.getByText(/background reads/)).toBeTruthy();
  });

  it("shows nothing when it cannot be read", async () => {
    vi.mocked(api.getSchedule).mockRejectedValue(new Error("no"));
    const { container } = render(<ScheduleSettings />);
    await waitFor(() => expect(api.getSchedule).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
