import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchApi = vi.fn();
vi.mock("@/lib/api", () => ({
    fetchApi: (...args: unknown[]) => fetchApi(...args),
}));

import { fakeSemanticViewer } from "@/test/fake-semantic-viewer";
import { useAnalyticPack } from "./use-analytic-pack";

const PACK_URL = "/api/projects/p/webgpu-3d/assets/src/build/board.kmpack";

describe("useAnalyticPack", () => {
    beforeEach(() => {
        fetchApi.mockReset();
    });

    it("stays off without a pack URL or before the viewer is ready", () => {
        const viewer = fakeSemanticViewer();
        const { result, rerender } = renderHook(
            ({ ready, url }) => useAnalyticPack(viewer, ready, url),
            { initialProps: { ready: false, url: PACK_URL as string | null } },
        );
        expect(result.current.phase).toBe("off");
        rerender({ ready: true, url: null });
        expect(result.current.phase).toBe("off");
        expect(fetchApi).not.toHaveBeenCalled();
        expect(viewer.loadAnalyticPack).not.toHaveBeenCalled();
    });

    it("fetches the pack, loads it and unloads it on unmount", async () => {
        const viewer = fakeSemanticViewer();
        const bytes = new Uint8Array([1, 2, 3]).buffer;
        fetchApi.mockResolvedValue(new Response(bytes));
        const { result, unmount } = renderHook(() => useAnalyticPack(viewer, true, PACK_URL));
        await waitFor(() => expect(result.current.phase).toBe("ready"));
        expect(fetchApi).toHaveBeenCalledWith(PACK_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        const loaded = (viewer.loadAnalyticPack.mock.calls as unknown as [ArrayBuffer][])[0]?.[0];
        expect(new Uint8Array(loaded ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
        unmount();
        expect(viewer.unloadAnalyticPack).toHaveBeenCalled();
    });

    it("falls back to the mesh board when the pack cannot be fetched", async () => {
        const viewer = fakeSemanticViewer();
        fetchApi.mockResolvedValue(new Response("missing", { status: 404 }));
        const { result } = renderHook(() => useAnalyticPack(viewer, true, PACK_URL));
        await waitFor(() => expect(result.current.phase).toBe("failed"));
        expect(result.current).toEqual({ phase: "failed", error: "Analytic pack request failed (404)" });
        expect(viewer.loadAnalyticPack).not.toHaveBeenCalled();
        expect(viewer.unloadAnalyticPack).toHaveBeenCalled();
    });
});
