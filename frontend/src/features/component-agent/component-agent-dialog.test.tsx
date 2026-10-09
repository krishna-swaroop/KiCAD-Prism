import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api", () => ({ fetchJson: vi.fn() }));
import { fetchJson } from "@/lib/api";
import { observeAgentTask, observeAgentActivity } from "./component-agent-dialog";

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("component task polling", () => {
  it("streams activity, closes at completion and ignores late events", () => {
    const listeners = new Map<string, (event: { data: string }) => void>();
    const close = vi.fn();
    class Source {
      close = close;
      addEventListener(name: string, listener: (event: { data: string }) => void) { listeners.set(name, listener); }
    }
    vi.stubGlobal("EventSource", Source);
    const updated = vi.fn();
    const stop = observeAgentActivity("task", updated);
    listeners.get("activity")!({ data: JSON.stringify({ id: "task", trace: [], status: "running" }) });
    expect(updated).toHaveBeenCalledTimes(1);
    listeners.get("end")!({ data: "{}" });
    expect(close).toHaveBeenCalledOnce();
    listeners.get("activity")!({ data: "{}" });
    expect(updated).toHaveBeenCalledTimes(1); stop();
  });
  it("does not publish a late task response after navigation", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(fetchJson).mockReturnValue(new Promise(done => { resolve = done; }));
    const updated = vi.fn(), failed = vi.fn();
    const stop = observeAgentTask("old-task", updated, failed);
    stop(); resolve({ id: "old-task", status: "completed" });
    await Promise.resolve(); await Promise.resolve();
    expect(updated).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
  });
  it("stops polling a completed task and cancels a pending timer", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchJson).mockResolvedValue({ id: "task", status: "running" });
    const updated = vi.fn();
    const stop = observeAgentTask("task", updated, vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(updated).toHaveBeenCalledTimes(1);
    stop(); await vi.advanceTimersByTimeAsync(5000);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    vi.mocked(fetchJson).mockResolvedValue({ id: "done", status: "completed" });
    const stopDone = observeAgentTask("done", updated, vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchJson).toHaveBeenCalledTimes(2); stopDone();
  });
});
