import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/lib/api";
import type { ProjectComponentImportProposal } from "@/types/catalog";
import { useImportSessionProposals, useNonOverlappingPoll } from "./library-import-session-proposals";

vi.mock("@/lib/api", () => ({
  fetchJson: vi.fn(),
  fetchApi: vi.fn(),
  readApiError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import { toast } from "sonner";

function proposal(sessionId: string, reference: string): ProjectComponentImportProposal {
  return {
    id: `${sessionId}-${reference}`,
    session_id: sessionId,
    dedupe_key: reference,
    component_uid: reference,
    reference,
    status: "candidate",
    accepted_component_id: "",
    metadata: { references: [reference] },
    assets: [],
    provenance: [],
    findings: [],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useImportSessionProposals", () => {
  beforeEach(() => {
    vi.mocked(fetchJson).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("keeps a delayed session A result off session B's list", async () => {
    let finishA: ((value: { items: ProjectComponentImportProposal[] }) => void) | undefined;
    vi.mocked(fetchJson).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/session-a/proposals")) {
        return new Promise((resolve) => {
          finishA = resolve;
        });
      }
      if (url.endsWith("/session-b/proposals")) {
        return { items: [proposal("session-b", "R-B")] };
      }
      throw new Error(`unrouted ${url}`);
    });

    const { result, rerender } = renderHook(
      ({ sessionId }) => useImportSessionProposals(sessionId),
      { initialProps: { sessionId: "session-a" } },
    );

    rerender({ sessionId: "session-b" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.proposals.map((item) => item.reference)).toEqual(["R-B"]);

    await act(async () => {
      finishA!({ items: [proposal("session-a", "R-A")] });
      await Promise.resolve();
    });
    expect(result.current.proposals.map((item) => item.reference)).toEqual(["R-B"]);
    expect(result.current.proposals[0]?.session_id).toBe("session-b");
  });

  it("ignores a delayed proposals response after unmount", async () => {
    let finish: ((value: { items: ProjectComponentImportProposal[] }) => void) | undefined;
    vi.mocked(fetchJson).mockImplementation(async () => new Promise((resolve) => {
      finish = resolve;
    }));
    const { unmount } = renderHook(() => useImportSessionProposals("session-a"));
    unmount();
    await act(async () => {
      finish!({ items: [proposal("session-a", "late")] });
      await Promise.resolve();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("useNonOverlappingPoll", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
  });

  it("does not start a second tick while the first is still in flight", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const tick = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    renderHook(() => useNonOverlappingPoll(true, tick, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("reports a failed tick and recovers on the next interval", async () => {
    vi.useFakeTimers();
    const tick = vi.fn()
      .mockRejectedValueOnce(new Error("scan refresh failed"))
      .mockResolvedValueOnce(undefined);
    renderHook(() => useNonOverlappingPoll(true, tick, 1000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(toast.error).toHaveBeenCalledWith("scan refresh failed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tick).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast.error).mock.calls).toHaveLength(1);
  });

  it("aborts an in-flight tick on unmount so it cannot publish", async () => {
    vi.useFakeTimers();
    const seen: AbortSignal[] = [];
    const tick = vi.fn(async (signal: AbortSignal) => {
      seen.push(signal);
      await new Promise(() => undefined);
    });
    const { unmount } = renderHook(() => useNonOverlappingPoll(true, tick, 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    unmount();
    expect(seen[0]?.aborted).toBe(true);
  });
});
