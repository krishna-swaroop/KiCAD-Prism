import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./release-check-api", () => ({ getReleaseSnapshotState: vi.fn(), getReleaseSnapshot: vi.fn(), releaseComplianceCsvUrl: () => "/csv" }));

import * as api from "./release-check-api";
import { QUEUED_POLL_MS, ReleaseSnapshotCard } from "./release-snapshot-card";

const mocked = vi.mocked(api);

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("a release's supply snapshot", () => {
  it("follows a queued snapshot until it is taken, then stops asking", async () => {
    mocked.getReleaseSnapshotState.mockResolvedValueOnce({ state: "running", done: 0, total: 1, failed: 0, reason: "" }).mockResolvedValue({ state: "done", done: 1, total: 1, failed: 0, reason: "" });
    mocked.getReleaseSnapshot.mockResolvedValue({
      status: "ok", health: 8.5, created_at: "2026-10-29T10:00:00Z", compliance: false,
      assessment: { tracked: 3, parts: 4, needing_a_look: 1 },
    } as never);
    render(<ReleaseSnapshotCard projectId="prj" buildId="b1" />);
    await flush();
    expect(screen.getByText("The supply snapshot is being taken.")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(QUEUED_POLL_MS); });
    await flush();
    await flush();
    expect(screen.getByText("Supply health 8.5 of 10 when published")).toBeTruthy();
    const asked = mocked.getReleaseSnapshotState.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(QUEUED_POLL_MS * 3); });
    expect(mocked.getReleaseSnapshotState.mock.calls.length).toBe(asked);
  });

  it("shows a failure that comes after the queue", async () => {
    mocked.getReleaseSnapshotState.mockResolvedValueOnce({ state: "running", done: 0, total: 1, failed: 0, reason: "" }).mockResolvedValue({ state: "failed", done: 0, total: 1, failed: 1, reason: "This build exported no BOM file." });
    render(<ReleaseSnapshotCard projectId="prj" buildId="b2" />);
    await flush();
    await act(async () => { vi.advanceTimersByTime(QUEUED_POLL_MS); });
    await flush();
    expect(screen.getByText("No supply snapshot was taken: This build exported no BOM file.")).toBeTruthy();
  });
});
