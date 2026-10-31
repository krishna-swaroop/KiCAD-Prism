import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { changesSupply } from "./supply-writes";
import { useLoaded } from "./use-loaded";

describe("useLoaded", () => {
  it("starts from what the last visit showed and reloads behind it", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const first = renderHook(() => useLoaded("k", fetcher, "failed"));
    expect(first.result.current.status).toBe("loading");
    await waitFor(() => expect(first.result.current.data).toBe("first"));
    first.unmount();
    await act(async () => { await Promise.resolve(); });

    const again = renderHook(() => useLoaded("k", fetcher, "failed"));
    expect(again.result.current.status).toBe("ready");
    expect(again.result.current.data).toBe("first");
    await waitFor(() => expect(again.result.current.data).toBe("second"));
  });

  it("shares one read between the screens that show a resource", async () => {
    const fetcher = vi.fn().mockResolvedValue(["c1"]);
    const a = renderHook(() => useLoaded("connectors", fetcher, "failed"));
    const b = renderHook(() => useLoaded("connectors", fetcher, "failed"));
    await waitFor(() => expect(b.result.current.data).toEqual(["c1"]));
    expect(a.result.current.data).toEqual(["c1"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads again what is on screen after a write", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(2);
    const shown = renderHook(() => useLoaded("parts/p1/notices", fetcher, "failed"));
    await waitFor(() => expect(shown.result.current.data).toBe(1));
    const write = changesSupply(async (title: string) => title);
    await act(async () => { await write("EOL"); });
    await waitFor(() => expect(shown.result.current.data).toBe(2));
  });

  it("asks again only while the data wants it", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockResolvedValueOnce({ state: "running" }).mockResolvedValue({ state: "done" });
      const job = renderHook(() => useLoaded("checks/r1", fetcher, "failed", { refreshEvery: 1000, refreshWhile: (data: { state: string }) => data.state === "running" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(job.result.current.data).toEqual({ state: "running" });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(job.result.current.data).toEqual({ state: "done" });
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
