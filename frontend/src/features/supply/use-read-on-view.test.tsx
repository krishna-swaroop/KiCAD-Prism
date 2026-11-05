import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "./supply-api";
import { useReadOnView } from "./use-read-on-view";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("reading a part on view", () => {
  it("asks once per part and reloads only when something was read", async () => {
    const ask = vi.spyOn(api, "readSupplyPartOnView").mockResolvedValueOnce({ read: 2 }).mockResolvedValueOnce({ read: 0 });
    const reload = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ id }) => useReadOnView(id, reload), { initialProps: { id: "p1" } });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    rerender({ id: "p1" });
    rerender({ id: "p2" });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls.map(([id]) => id)).toEqual(["p1", "p2"]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
