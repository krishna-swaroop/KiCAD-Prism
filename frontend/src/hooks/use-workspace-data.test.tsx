import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  fetchApi: vi.fn(),
  readApiError: vi.fn(async (_response: Response, fallback: string) => fallback),
}));

vi.mock("@/lib/api", () => api);

import { clearWorkspaceDataCache, useWorkspaceData, workspaceSessionKey } from "./use-workspace-data";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function bootstrap(tag: string) {
  return {
    projects: [{ id: `project-${tag}`, name: tag } as never],
    folders: [{ id: `folder-${tag}`, name: tag } as never],
  };
}

/** Each fetchJson call gets its own deferred so tests resolve them in any order. */
function queueLoads() {
  const loads: Deferred<unknown>[] = [];
  api.fetchJson.mockImplementation((_input: unknown, init?: RequestInit) => {
    const pending = deferred<unknown>();
    pending.signal = init?.signal ?? undefined;
    loads.push(pending);
    return pending.promise;
  });
  return loads;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const alice = workspaceSessionKey({ email: "alice@example.com", role: "designer" });
const bob = workspaceSessionKey({ email: "bob@example.com", role: "viewer" });

beforeEach(() => {
  clearWorkspaceDataCache();
  api.fetchJson.mockReset();
  api.fetchApi.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWorkspaceData", () => {
  it("shows the first load and then keeps the latest data across remounts", async () => {
    const loads = queueLoads();
    const { result, unmount } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(result.current.loading).toBe(true);
    expect(result.current.stale).toBe(false);

    await act(async () => loads[0].resolve(bootstrap("a1")));
    expect(result.current.loading).toBe(false);
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-a1"]);
    expect(result.current.stale).toBe(false);
    unmount();

    const remounted = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(remounted.result.current.loading).toBe(false);
    expect(remounted.result.current.projects.map((p) => p.id)).toEqual(["project-a1"]);
    // Cached data is shown but not yet confirmed by this mount's load.
    expect(remounted.result.current.stale).toBe(true);
    await act(async () => loads[1].resolve(bootstrap("a2")));
    expect(remounted.result.current.projects.map((p) => p.id)).toEqual(["project-a2"]);
    expect(remounted.result.current.stale).toBe(false);
  });

  it("keeps the post-mutation data when the pre-mutation refresh resolves later", async () => {
    const loads = queueLoads();
    const { result } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    await act(async () => loads[0].resolve(bootstrap("initial")));

    // A refresh started before the mutation is still in flight...
    let earlier!: Promise<void>;
    act(() => {
      earlier = result.current.refresh();
    });
    // ...when the mutation's own refresh starts and finishes first.
    api.fetchApi.mockResolvedValue({ ok: true } as Response);
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.createFolder("New", null);
    });
    await flush();
    expect(loads).toHaveLength(3);
    await act(async () => loads[2].resolve(bootstrap("after-mutation")));
    await act(async () => {
      await mutation;
    });
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-after-mutation"]);

    await act(async () => {
      loads[1].resolve(bootstrap("before-mutation"));
      await earlier;
    });
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-after-mutation"]);
    expect(result.current.folders.map((f) => f.id)).toEqual(["folder-after-mutation"]);

    // The module cache is the latest response too.
    const remounted = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(remounted.result.current.projects.map((p) => p.id)).toEqual(["project-after-mutation"]);
  });

  it("never shows one session's cache to another and rekeys on session change", async () => {
    const loads = queueLoads();
    const { result, rerender } = renderHook(({ sessionKey }) => useWorkspaceData({ sessionKey }), {
      initialProps: { sessionKey: alice },
    });
    await act(async () => loads[0].resolve(bootstrap("alice")));
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-alice"]);

    rerender({ sessionKey: bob });
    expect(result.current.loading).toBe(true);
    expect(result.current.projects).toEqual([]);
    await flush();
    expect(loads).toHaveLength(2);

    await act(async () => loads[1].resolve(bootstrap("bob")));
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-bob"]);

    const bobAgain = renderHook(() => useWorkspaceData({ sessionKey: bob }));
    expect(bobAgain.result.current.projects.map((p) => p.id)).toEqual(["project-bob"]);
    const aliceAgain = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(aliceAgain.result.current.loading).toBe(true);
    expect(aliceAgain.result.current.projects).toEqual([]);
  });

  it("drops a load that resolves for a session that is no longer current", async () => {
    const loads = queueLoads();
    const { result, rerender } = renderHook(({ sessionKey }) => useWorkspaceData({ sessionKey }), {
      initialProps: { sessionKey: alice },
    });
    rerender({ sessionKey: bob });
    await flush();
    expect(loads[0].signal?.aborted).toBe(true);

    await act(async () => loads[0].resolve(bootstrap("alice-late")));
    expect(result.current.loading).toBe(true);
    expect(result.current.projects).toEqual([]);

    await act(async () => loads[1].resolve(bootstrap("bob")));
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-bob"]);
  });

  it("unmounting aborts the pending load and publishes nothing", async () => {
    const loads = queueLoads();
    const { result, unmount } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    const snapshot = result.current;
    unmount();
    expect(loads[0].signal?.aborted).toBe(true);
    await act(async () => loads[0].resolve(bootstrap("late")));
    expect(result.current).toBe(snapshot);
  });

  it("a load that ignores its abort cannot repopulate a cleared cache", async () => {
    // Transports do not always honour the signal; the cache must not depend on it.
    const loads = queueLoads();
    const first = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    first.unmount();
    clearWorkspaceDataCache();
    await act(async () => loads[0].resolve(bootstrap("before-logout")));

    const next = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(next.result.current.projects).toEqual([]);
    expect(next.result.current.loading).toBe(true);
  });

  it("clearing the cache invalidates a refresh that was already in flight", async () => {
    const loads = queueLoads();
    const { result } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    await act(async () => loads[0].resolve(bootstrap("initial")));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    clearWorkspaceDataCache();
    await act(async () => {
      loads[1].resolve(bootstrap("stale-writer"));
      await pending;
    });

    // The mounted hook still shows what it received, but a fresh mount for the
    // same session starts from nothing rather than from the stale writer.
    const remounted = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(remounted.result.current.projects).toEqual([]);
    expect(remounted.result.current.loading).toBe(true);
  });

  it("a mutation started under one session does not refresh or cache after the session changes", async () => {
    const loads = queueLoads();
    const mutation = deferred<Response>();
    api.fetchApi.mockReturnValue(mutation.promise);
    const { result, rerender, unmount } = renderHook(({ sessionKey }) => useWorkspaceData({ sessionKey }), {
      initialProps: { sessionKey: alice },
    });
    await act(async () => loads[0].resolve(bootstrap("alice")));

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.renameFolder("folder-alice", "renamed");
    });
    rerender({ sessionKey: bob });
    await flush();
    await act(async () => loads[1].resolve(bootstrap("bob")));
    expect(loads).toHaveLength(2);

    // The server-side rename succeeded, but its refresh belongs to a session
    // this hook no longer serves: no request is started for it.
    await act(async () => {
      mutation.resolve({ ok: true } as Response);
      await expect(pending).resolves.toEqual({ ok: true });
    });
    expect(loads).toHaveLength(2);
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-bob"]);

    unmount();
    const aliceAgain = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(aliceAgain.result.current.projects).toEqual([]);
    expect(aliceAgain.result.current.loading).toBe(true);
  });

  it("a mutation that completes after unmount publishes nothing", async () => {
    const loads = queueLoads();
    const mutation = deferred<Response>();
    api.fetchApi.mockReturnValue(mutation.promise);
    const { result, unmount } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    await act(async () => loads[0].resolve(bootstrap("alice")));

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.deleteProject("project-alice");
    });
    unmount();
    clearWorkspaceDataCache();
    await act(async () => {
      mutation.resolve({ ok: true } as Response);
      await expect(pending).resolves.toEqual({ ok: true });
    });
    expect(loads).toHaveLength(1);
    const remounted = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    expect(remounted.result.current.projects).toEqual([]);
  });

  it("keeps shown data and reports a refresh error when a later load fails", async () => {
    const loads = queueLoads();
    const { result } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    await act(async () => loads[0].resolve(bootstrap("good")));

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refresh();
    });
    await act(async () => {
      loads[1].reject(new Error("Failed to load workspace"));
      await refresh;
    });
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-good"]);
    expect(result.current.error).toBeNull();
    expect(result.current.refreshError).toBe("Failed to load workspace");
    expect(result.current.stale).toBe(true);
    expect(result.current.loading).toBe(false);

    act(() => {
      refresh = result.current.refresh();
    });
    await act(async () => {
      loads[2].resolve(bootstrap("recovered"));
      await refresh;
    });
    expect(result.current.refreshError).toBeNull();
    expect(result.current.stale).toBe(false);
    expect(result.current.projects.map((p) => p.id)).toEqual(["project-recovered"]);
  });

  it("reports a hard error only when there is no data to fall back on", async () => {
    const loads = queueLoads();
    const { result } = renderHook(() => useWorkspaceData({ sessionKey: alice }));
    await act(async () => loads[0].reject(new Error("boom")));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("boom");
    expect(result.current.refreshError).toBeNull();
    expect(result.current.projects).toEqual([]);
    expect(result.current.stale).toBe(false);
  });

  it("an aborted load is not an error", async () => {
    const loads = queueLoads();
    const { result, rerender } = renderHook(({ sessionKey }) => useWorkspaceData({ sessionKey }), {
      initialProps: { sessionKey: alice },
    });
    rerender({ sessionKey: bob });
    await act(async () => loads[0].reject(new DOMException("aborted", "AbortError")));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
