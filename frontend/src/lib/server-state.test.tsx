import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pollUntil, ServerStateStore, usePoll, useServerState, type ServerKey, type ServerReadOptions } from "./server-state";

/** A load function whose calls the test settles by hand. */
function manualLoad<T>() {
  const calls: Array<{ signal: AbortSignal; resolve: (value: T) => void; reject: (error: unknown) => void }> = [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { load, calls };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderRead<T>(
  store: ServerStateStore,
  key: ServerKey | null,
  load: (signal: AbortSignal) => Promise<T>,
  options: ServerReadOptions<T> = {},
) {
  return renderHook(
    ({ readKey, readOptions }) => useServerState(readKey, load, readOptions, store),
    { initialProps: { readKey: key, readOptions: options } },
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useServerState", () => {
  it("reads once, reports loading, then the data", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result } = renderRead(store, ["thing", 1], load);
    expect(result.current.loading).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => calls[0].resolve("one"));
    expect(result.current).toMatchObject({ data: "one", loading: false, error: null, fetching: false });
  });

  it("reads nothing for a null key", () => {
    const store = new ServerStateStore();
    const load = vi.fn(async () => "x");
    const { result } = renderRead(store, null, load);
    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("drops a response that lost the race to a newer request", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result } = renderRead(store, ["race"], load);
    let refreshed: Promise<void> | undefined;
    act(() => {
      refreshed = result.current.refresh();
    });
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => {
      calls[1].resolve("new");
      await refreshed;
    });
    await act(async () => calls[0].resolve("old"));
    expect(result.current.data).toBe("new");
  });

  it("ignores the previous key's response after the key changes", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result, rerender } = renderRead(store, ["session", "a"], load);
    rerender({ readKey: ["session", "b"], readOptions: {} });
    await flush();
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => calls[0].resolve("from a"));
    expect(result.current.data).toBeUndefined();
    await act(async () => calls[1].resolve("from b"));
    expect(result.current.data).toBe("from b");
  });

  it("aborts the request in flight when the last observer leaves", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const onData = vi.fn();
    const { unmount } = renderRead(store, ["gone"], load, { onData });
    unmount();
    await flush();
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => calls[0].resolve("late"));
    expect(onData).not.toHaveBeenCalled();
    expect(store.snapshot(JSON.stringify(["gone"])).data).toBeUndefined();
  });

  it("shares one request between observers of the same key", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const first = renderRead(store, ["shared"], load);
    const second = renderRead(store, ["shared"], load);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => calls[0].resolve("both"));
    expect(first.result.current.data).toBe("both");
    expect(second.result.current.data).toBe("both");
  });

  it("keeps the last data on screen through a refresh, and through a failed one", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result } = renderRead(store, ["swr"], load);
    await act(async () => calls[0].resolve("first"));
    act(() => {
      void result.current.refresh();
    });
    expect(result.current).toMatchObject({ data: "first", fetching: true, loading: false });
    await act(async () => calls[1].reject(new Error("offline")));
    expect(result.current.data).toBe("first");
    expect(result.current.error?.message).toBe("offline");
    act(() => {
      void result.current.refresh();
    });
    await act(async () => calls[2].resolve("second"));
    expect(result.current).toMatchObject({ data: "second", error: null });
  });

  it("counts the keys on screen whose re-read failed, and stops when they read again or leave", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const heard = vi.fn();
    store.watch(heard);
    const { result, unmount } = renderRead(store, ["area", "one"], load);
    await act(async () => calls[0].resolve("first"));
    expect(store.outdated(["area"])).toBe(0);
    act(() => { void result.current.refresh(); });
    await act(async () => calls[1].reject(new Error("offline")));
    expect([store.outdated(["area"]), store.outdated(["other"])]).toEqual([1, 0]);
    expect(heard).toHaveBeenCalled();
    act(() => { void result.current.refresh(); });
    expect(store.outdated(["area"]), "not while it reads again").toBe(0);
    await act(async () => calls[2].reject(new Error("offline")));
    expect(store.outdated(["area"])).toBe(1);
    unmount();
    await flush();
    expect(store.outdated(["area"]), "nobody shows it").toBe(0);
  });

  it("re-reads observed keys under an invalidated prefix only", async () => {
    const store = new ServerStateStore();
    const branches = manualLoad<string>();
    const other = manualLoad<string>();
    renderRead(store, ["project", "p1", "branches"], branches.load);
    renderRead(store, ["project", "p2", "branches"], other.load);
    await act(async () => {
      branches.calls[0].resolve("b1");
      other.calls[0].resolve("b2");
    });
    act(() => {
      void store.invalidate(["project", "p1"]);
    });
    expect(branches.load).toHaveBeenCalledTimes(2);
    expect(other.load).toHaveBeenCalledTimes(1);
  });

  it("polls without overlapping requests", async () => {
    vi.useFakeTimers();
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<number>();
    renderRead(store, ["poll"], load, { pollMs: 1000 });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => calls[0].resolve(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("skips polls while hidden and reads when the tab becomes visible", async () => {
    vi.useFakeTimers();
    const store = new ServerStateStore();
    const load = vi.fn(async () => "branches");
    renderRead(store, ["visible"], load, { pollMs: 1000, whileVisible: true });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility("visible"));
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keeps one poller when only the options object changes identity", async () => {
    vi.useFakeTimers();
    const store = new ServerStateStore();
    const load = vi.fn(async () => "x");
    const { rerender } = renderRead(store, ["steady"], load, { pollMs: 1000 });
    await flush();
    rerender({ readKey: ["steady"], readOptions: { pollMs: 1000 } });
    rerender({ readKey: ["steady"], readOptions: { pollMs: 1000 } });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("hands every failed read to onError, but not an abort", async () => {
    const store = new ServerStateStore();
    const onError = vi.fn();
    const { load, calls } = manualLoad<string>();
    const { result } = renderRead(store, ["failing"], load, { onError });
    await act(async () => calls[0].reject(new Error("offline")));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    act(() => {
      void result.current.refresh();
    });
    act(() => {
      void result.current.refresh();
    });
    await act(async () => calls[1].reject(new DOMException("aborted", "AbortError")));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("hands every successful response to onData", async () => {
    const store = new ServerStateStore();
    const onData = vi.fn();
    const load = vi.fn(async () => "value");
    renderRead(store, ["callback"], load, { onData });
    await flush();
    expect(onData).toHaveBeenCalledWith("value");
  });
});

describe("retention (D22)", () => {
  it("shows a remounted key's last data at once, marked stale, while it reads again", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const first = renderRead(store, ["kept"], load);
    await act(async () => calls[0].resolve("one"));
    first.unmount();
    await flush();

    const again = renderRead(store, ["kept"], load);
    expect(again.result.current).toMatchObject({ data: "one", loading: false, stale: true, fetching: true });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => calls[1].resolve("two"));
    expect(again.result.current).toMatchObject({ data: "two", stale: false, fetching: false });
  });

  it("keeps the data stale when the re-read fails", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    renderRead(store, ["kept"], load).unmount();
    await act(async () => calls[0].resolve("one"));
    // The response arrived after the observer left: nothing was kept.
    expect(store.snapshot(JSON.stringify(["kept"])).data).toBeUndefined();

    const mounted = renderRead(store, ["kept"], load);
    await act(async () => calls[1].resolve("one"));
    mounted.unmount();
    await flush();
    const again = renderRead(store, ["kept"], load);
    await act(async () => calls[2].reject(new Error("offline")));
    expect(again.result.current).toMatchObject({ data: "one", stale: true });
    expect(again.result.current.error?.message).toBe("offline");
  });

  it("forgets the data after the retention window", async () => {
    vi.useFakeTimers();
    const store = new ServerStateStore();
    const load = vi.fn(async () => "value");
    const first = renderRead(store, ["window"], load, { retainMs: 1000 });
    await flush();
    first.unmount();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(store.snapshot(JSON.stringify(["window"])).data).toBe("value");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(store.snapshot(JSON.stringify(["window"])).data).toBeUndefined();
    const again = renderRead(store, ["window"], load, { retainMs: 1000 });
    expect(again.result.current.loading).toBe(true);
  });

  it("forgets at once with retainMs 0", async () => {
    const store = new ServerStateStore();
    const load = vi.fn(async () => "value");
    const first = renderRead(store, ["none"], load, { retainMs: 0 });
    await flush();
    first.unmount();
    await flush();
    expect(store.snapshot(JSON.stringify(["none"])).data).toBeUndefined();
  });

  it("forget drops kept keys under a prefix and starts observed ones over", async () => {
    const store = new ServerStateStore();
    const kept = manualLoad<string>();
    const observed = manualLoad<string>();
    const other = manualLoad<string>();
    renderRead(store, ["session", "a"], kept.load).unmount();
    const mounted = renderRead(store, ["session", "b"], observed.load);
    const outside = renderRead(store, ["other"], other.load);
    await act(async () => {
      kept.calls[0].resolve("a");
      observed.calls[0].resolve("b");
      other.calls[0].resolve("x");
    });
    let late: Promise<void> | undefined;
    act(() => {
      late = mounted.result.current.refresh();
    });

    act(() => store.forget(["session"]));
    expect(store.snapshot(JSON.stringify(["session", "a"])).data).toBeUndefined();
    expect(mounted.result.current).toMatchObject({ data: undefined, loading: true });
    expect(observed.calls[1].signal.aborted).toBe(true);
    await act(async () => {
      observed.calls[1].resolve("before forget");
      await late;
    });
    expect(mounted.result.current.data).toBeUndefined();
    await act(async () => observed.calls[2].resolve("after forget"));
    expect(mounted.result.current.data).toBe("after forget");
    expect(outside.result.current.data).toBe("x");
  });

  it("forget can spare one key, or every observed key", async () => {
    const store = new ServerStateStore();
    const load = vi.fn(async () => "value");
    const spared = renderRead(store, ["session", "a"], load);
    const observed = renderRead(store, ["session", "b"], load);
    renderRead(store, ["session", "c"], load).unmount();
    await flush();
    act(() => store.forget(["session"], { except: ["session", "a"], unobservedOnly: true }));
    expect(spared.result.current.data).toBe("value");
    expect(observed.result.current.data).toBe("value");
    expect(store.snapshot(JSON.stringify(["session", "c"])).data).toBeUndefined();
    act(() => store.forget(["session"], { except: ["session", "a"] }));
    expect(spared.result.current.data).toBe("value");
    expect(observed.result.current.data).toBeUndefined();
  });

  it("keepPrevious shows the previous key's data until the new key answers", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result, rerender } = renderRead(store, ["page", 1], load, { keepPrevious: true });
    await act(async () => calls[0].resolve("page one"));
    rerender({ readKey: ["page", 2], readOptions: { keepPrevious: true } });
    expect(result.current).toMatchObject({ data: "page one", placeholder: true, loading: false, fetching: true });
    await act(async () => calls[1].resolve("page two"));
    expect(result.current).toMatchObject({ data: "page two", placeholder: false });
  });

  it("keepPrevious keeps the previous data when the new key's read fails", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result, rerender } = renderRead(store, ["page", 1], load, { keepPrevious: true });
    await act(async () => calls[0].resolve("page one"));
    rerender({ readKey: ["page", 2], readOptions: { keepPrevious: true } });
    await act(async () => calls[1].reject(new Error("offline")));
    expect(result.current).toMatchObject({ data: "page one", placeholder: true, loading: false });
    expect(result.current.error?.message).toBe("offline");
  });

  it("without keepPrevious a key change starts empty", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result, rerender } = renderRead(store, ["page", 1], load);
    await act(async () => calls[0].resolve("page one"));
    rerender({ readKey: ["page", 2], readOptions: {} });
    expect(result.current).toMatchObject({ data: undefined, placeholder: false, loading: true });
  });

  it("a key changed back within the window shows its kept data while it re-reads", async () => {
    const store = new ServerStateStore();
    const { load, calls } = manualLoad<string>();
    const { result, rerender } = renderRead(store, ["page", 1], load);
    await act(async () => calls[0].resolve("page one"));
    rerender({ readKey: ["page", 2], readOptions: {} });
    await flush();
    rerender({ readKey: ["page", 1], readOptions: {} });
    expect(result.current).toMatchObject({ data: "page one", stale: true, fetching: true });
  });
});

describe("usePoll", () => {
  it("does not start a second tick while the first is still in flight", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const tick = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    renderHook(() => usePoll(true, tick, { intervalMs: 1000, onError: vi.fn() }));
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

  it("reports a repeated outage only once until a tick succeeds", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const tick = vi.fn()
      .mockRejectedValueOnce(new Error("scan refresh failed"))
      .mockRejectedValueOnce(new Error("scan refresh failed"))
      .mockRejectedValueOnce(new Error("scan refresh failed"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("scan refresh failed"));
    renderHook(() => usePoll(true, tick, { intervalMs: 1000, onError }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(tick).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tick).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tick).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("aborts an in-flight tick on unmount", async () => {
    vi.useFakeTimers();
    const seen: AbortSignal[] = [];
    const tick = vi.fn(async (signal: AbortSignal) => {
      seen.push(signal);
      await new Promise(() => undefined);
    });
    const { unmount } = renderHook(() => usePoll(true, tick, { intervalMs: 1000, onError: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    unmount();
    expect(seen[0]?.aborted).toBe(true);
  });

  it("does nothing while disabled", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => undefined);
    renderHook(() => usePoll(false, tick, { intervalMs: 1000, onError: vi.fn() }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(tick).not.toHaveBeenCalled();
  });
});

describe("pollUntil", () => {
  it("ticks at once, then every interval, until done", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const done = pollUntil(async () => ++reads === 3, { intervalMs: 800 });
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toBe(1);
    await vi.advanceTimersByTimeAsync(1600);
    await expect(done).resolves.toBe(true);
    expect(reads).toBe(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toBe(3);
  });

  it("waits one interval first with delayFirst and gives up after maxTicks", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const done = pollUntil(async () => {
      reads += 1;
      return false;
    }, { intervalMs: 2000, delayFirst: true, maxTicks: 3 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(reads).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(done).resolves.toBe(false);
    expect(reads).toBe(3);
  });

  it("rejects with a tick's error and on abort", async () => {
    vi.useFakeTimers();
    await expect(pollUntil(async () => {
      throw new Error("Metadata batch failed");
    }, { intervalMs: 800 })).rejects.toThrow("Metadata batch failed");
    const controller = new AbortController();
    const waiting = pollUntil(async () => false, { intervalMs: 800, signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });
});
