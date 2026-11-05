import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupplyPartsPage } from "@/types/supply";
import { partRowFixture } from "./supply-test-fixtures";

vi.mock("./supply-api", () => ({
  listSupplyParts: vi.fn(),
  getSupplyPart: vi.fn(),
  listSupplyManufacturers: vi.fn(),
  listSupplyAlerts: vi.fn(),
}));

import * as api from "./supply-api";
import { useSupplyPartsFeed, useSupplyPartsList } from "./use-supply-parts";

const mocked = vi.mocked(api);

afterEach(cleanup);

function page(mpn: string): SupplyPartsPage {
  return { items: [partRowFixture({ id: mpn, mpn })], total: 1, limit: 100, offset: 0, next_offset: null, forecast_state: {} };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("the parts list loader", () => {
  it("ignores a refresh that finishes after the scope has changed", async () => {
    const refreshing = deferred<SupplyPartsPage>();
    mocked.listSupplyParts.mockResolvedValueOnce(page("WATCHED")).mockReturnValueOnce(refreshing.promise);
    const { result, rerender } = renderHook(({ scope }) => useSupplyPartsList(scope, ""), { initialProps: { scope: "watched" as const } });
    await waitFor(() => expect(result.current.data?.items[0].mpn).toBe("WATCHED"));

    let refreshed!: Promise<void>;
    act(() => { refreshed = result.current.refresh(); });

    mocked.listSupplyParts.mockResolvedValueOnce(page("ALL"));
    rerender({ scope: "all" as unknown as "watched" });
    await waitFor(() => expect(result.current.data?.items[0].mpn).toBe("ALL"));

    await act(async () => {
      refreshing.resolve(page("STALE"));
      await refreshed;
    });
    expect(result.current.data?.items[0].mpn).toBe("ALL");
  });

  it("applies a refresh that finishes while the same list is still showing", async () => {
    mocked.listSupplyParts.mockResolvedValueOnce(page("BEFORE")).mockResolvedValueOnce(page("AFTER"));
    const { result } = renderHook(() => useSupplyPartsList("watched", ""));
    await waitFor(() => expect(result.current.data?.items[0].mpn).toBe("BEFORE"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.data?.items[0].mpn).toBe("AFTER");
  });
});

describe("the parts feed", () => {
  const rows = (prefix: string, from: number, count: number) =>
    Array.from({ length: count }, (_, index) => partRowFixture({ id: `${prefix}${from + index}`, mpn: `${prefix}${from + index}` }));
  const answer = (items: ReturnType<typeof rows>, offset: number, next: number | null): SupplyPartsPage =>
    ({ items, total: 120, limit: 50, offset, next_offset: next, forecast_state: {} });

  it("keeps the pages it loaded when the same list is read again, and reads them again", async () => {
    mocked.listSupplyParts.mockReset();
    mocked.listSupplyParts
      .mockResolvedValueOnce(answer(rows("A", 0, 50), 0, 50))
      .mockResolvedValueOnce(answer(rows("A", 50, 50), 50, 100));
    const { result } = renderHook(() => useSupplyPartsFeed("watched", ""));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items).toHaveLength(100);

    // A write reads the first page again; the second page is read again too, and the 100 rows never drop to 50.
    mocked.listSupplyParts
      .mockResolvedValueOnce(answer(rows("B", 0, 50), 0, 50))
      .mockResolvedValueOnce(answer(rows("B", 50, 50), 50, 100));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.items).toHaveLength(100);
    await waitFor(() => expect(result.current.items[99].mpn).toBe("B99"));
    expect(result.current.hasMore).toBe(true);
  });
});
