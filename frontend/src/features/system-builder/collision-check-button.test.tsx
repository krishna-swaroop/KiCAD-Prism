import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CollisionCheck, Finding } from "@/types/system";

import { CollisionCheckButton } from "./collision-check-button";
import { instance, systemDocument } from "./test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const collision = { rule: "SYS-V22", severity: "warning" } as Finding;

function documentWith(check: CollisionCheck, findings: Finding[] = []) {
  return { ...systemDocument([instance("OBC")]), validation: { findings, notEvaluated: [], exempt: [], collisionCheck: check,
    counts: { error: 0, warning: findings.length, info: 0, notEvaluated: 0 } } };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Check collisions (SB2-108)", () => {
  it("shows the check's state and the collision count", () => {
    const { rerender } = render(<CollisionCheckButton systemId="sys_1" reload={vi.fn()}
      document={documentWith({ state: "not_checked", checkedAt: null, notEvaluated: [] })} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Check collisions · not checked");
    rerender(<CollisionCheckButton systemId="sys_1" reload={vi.fn()} document={documentWith(
      { state: "current", checkedAt: "t1", notEvaluated: [{ occurrence: "/b", label: "B", reason: "bundle_missing" }] },
      [collision, collision])} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Check collisions · checked · 2 found · 1 not checked");
    expect(screen.getByRole("button").textContent).toBe("2");
  });

  it("queues a check and reloads once a newer one is stored", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let polls = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ jobId: "job_1" }, 202);
      polls += 1;
      return json({ systemId: "sys_1", state: "current", checkedAt: polls > 1 ? "t2" : "t1", notEvaluated: [], findings: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn(async () => {});
    render(<CollisionCheckButton systemId="sys_1" reload={reload}
      document={documentWith({ state: "stale", checkedAt: "t1", notEvaluated: [] })} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Checking collisions…"));
    await vi.advanceTimersByTimeAsync(4100);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/sys_1/collisions");
  });
});
