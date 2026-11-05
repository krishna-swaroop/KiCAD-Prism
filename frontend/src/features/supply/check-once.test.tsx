import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./tracking-api", () => ({ startCheck: vi.fn(), getCheck: vi.fn() }));

import { CheckOnceButton } from "./check-once-button";
import * as api from "./tracking-api";

const mocked = vi.mocked(api);
const progress = (done: number, finished = false) => ({ id: "r1", kind: "bom" as const, project_id: "p", created_at: "", state: finished ? "done" as const : "running" as const, total: 4, done, failed: 0, reason: "" });

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("check once", () => {
  it("starts a check of the unread lines, shows progress and refreshes when it finishes", async () => {
    mocked.startCheck.mockResolvedValue({ id: "r1", parts: 4, already_tracked: 0, skipped: [], progress: progress(0) });
    // The check is read once it starts, then every five seconds.
    mocked.getCheck.mockResolvedValueOnce(progress(0)).mockResolvedValueOnce(progress(2)).mockResolvedValueOnce(progress(4, true));
    const finished = vi.fn();
    render(<CheckOnceButton projectId="p" lines={[{ manufacturer: "Acme", mpn: "A" }]} onFinished={finished} />);
    fireEvent.click(screen.getByRole("button", { name: /Check once \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check (1)" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocked.startCheck).toHaveBeenCalledWith("bom", "p", [{ manufacturer: "Acme", mpn: "A" }]);
    expect(screen.getByText("0 of 4 parts read")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.getByRole("status").textContent).toBe("Checking: 0 of 4 parts read");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("status").textContent).toBe("Checking: 2 of 4 parts read");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(finished).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing when every line already has a reading", () => {
    const { container } = render(<CheckOnceButton projectId="p" lines={[]} onFinished={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
