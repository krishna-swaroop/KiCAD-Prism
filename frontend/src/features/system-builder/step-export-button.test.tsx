import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepExportButton } from "./step-export-button";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const none = { systemId: "sys_1", state: "none", version: null, createdAt: null, sizeBytes: null, skipped: [], jobId: null, error: null };

describe("Export STEP (SB2-109)", () => {
  it("offers the download when this version's export is ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...none, state: "ready", version: 7, sizeBytes: 12_300_000 })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<StepExportButton systemId="sys_1" version={7} />);
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Download STEP · v7 · 12.3 MB"));
    fireEvent.click(screen.getByRole("button"));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("exports first when the latest is of another version, then downloads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ jobId: "job_1" }, 202);
      reads += 1;
      if (reads === 1) return json({ ...none, state: "ready", version: 6 });
      return json({ ...none, state: reads > 2 ? "ready" : "running", version: 7 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<StepExportButton systemId="sys_1" version={7} />);
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Export STEP"));
    fireEvent.click(screen.getByRole("button"));
    await vi.advanceTimersByTimeAsync(6100);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === "POST" && String(url).endsWith("/sys_1/step"))).toBe(true);
  });
});
