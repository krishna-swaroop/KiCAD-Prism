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
import { useSupplyPartsList } from "./use-supply-parts";

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
