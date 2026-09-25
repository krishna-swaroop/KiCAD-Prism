import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "@/types/comments";

const api = vi.hoisted(() => ({ fetchApi: vi.fn() }));
vi.mock("@/lib/api", () => api);

import { useLiveComments } from "./use-live-comments";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    readonly url: string;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((message: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    open() {
        this.readyState = 1;
        this.onopen?.();
    }

    emit(cursor: number, scope: "canvas" | "comparison" = "canvas", commentId = "comment-2") {
        this.onmessage?.({ data: JSON.stringify({
            type: "change", cursor, commentId, changeKind: "upsert", scope,
        }) });
    }

    close() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.();
    }
}

function comment(id: string): Comment {
    return {
        id, author: "Reviewer", timestamp: "2026-09-24T00:00:00Z", status: "OPEN",
        context: "PCB", location: { x: 1, y: 2, layer: "F.Cu" }, content: id,
        replies: [], commentClass: "general", severity: "info", mentions: [],
    };
}

function thread(value: Comment | null, cursor: number, status = 200): Response {
    return new Response(JSON.stringify({ comment: value, cursor }), {
        status, headers: { "Content-Type": "application/json" },
    });
}

function snapshot(comments: Comment[], cursor: number, status = 200): Response {
    return new Response(JSON.stringify({
        meta: { version: "1", generator: "Prism" }, comments, cursor,
    }), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    api.fetchApi.mockReset();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("useLiveComments", () => {
    it("shows another user's change without refresh and reconnects from the committed cursor", async () => {
        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1")], 4));
        const { result } = renderHook(() => useLiveComments("project-1", { kind: "canvas" }));
        await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        expect(FakeWebSocket.instances[0].url).toContain("/comments/live?after=4");

        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1")], 4));
        act(() => FakeWebSocket.instances[0].open());
        await waitFor(() => expect(result.current.status).toBe("live"));
        await waitFor(() => expect(api.fetchApi).toHaveBeenCalledTimes(2));

        // A live change reads only the thread it names, not the whole project.
        api.fetchApi.mockResolvedValueOnce(thread(comment("comment-2"), 5));
        act(() => FakeWebSocket.instances[0].emit(5));
        await waitFor(() => expect(result.current.comments.map((entry) => entry.id))
            .toEqual(["comment-1", "comment-2"]));
        expect(api.fetchApi.mock.calls[2][0]).toBe("/api/projects/project-1/comments/comment-2/thread");

        vi.useFakeTimers();
        act(() => FakeWebSocket.instances[0].close());
        act(() => vi.advanceTimersByTime(1_000));
        expect(FakeWebSocket.instances).toHaveLength(2);
        expect(FakeWebSocket.instances[1].url).toContain("/comments/live?after=5");
    });

    it("retains last good comments and reports a read failure", async () => {
        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1")], 7));
        const { result } = renderHook(() => useLiveComments("project-1", { kind: "canvas" }));
        await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1")], 7));
        act(() => FakeWebSocket.instances[0].open());
        await waitFor(() => expect(api.fetchApi).toHaveBeenCalledTimes(2));

        // The thread read fails, so the hook falls back to a snapshot, which also fails.
        api.fetchApi.mockResolvedValueOnce(thread(null, 8, 503));
        api.fetchApi.mockResolvedValueOnce(snapshot([], 8, 503));
        act(() => FakeWebSocket.instances[0].emit(8));
        await waitFor(() => expect(result.current.error).toContain("503"));
        expect(result.current.comments.map((entry) => entry.id)).toEqual(["comment-1"]);
        expect(result.current.hasLoaded).toBe(true);
    });

    it("removes a thread that no longer exists", async () => {
        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1"), comment("comment-2")], 3));
        const { result } = renderHook(() => useLiveComments("project-1", { kind: "canvas" }));
        await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        api.fetchApi.mockResolvedValueOnce(snapshot([comment("comment-1"), comment("comment-2")], 3));
        act(() => FakeWebSocket.instances[0].open());
        await waitFor(() => expect(api.fetchApi).toHaveBeenCalledTimes(2));

        api.fetchApi.mockResolvedValueOnce(thread(null, 4));
        act(() => FakeWebSocket.instances[0].emit(4));
        await waitFor(() => expect(result.current.comments.map((entry) => entry.id)).toEqual(["comment-1"]));
    });

    it("reads a burst of many changed threads as one snapshot", async () => {
        api.fetchApi.mockResolvedValueOnce(snapshot([], 1));
        const { result } = renderHook(() => useLiveComments("project-1", { kind: "canvas" }));
        await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        api.fetchApi.mockResolvedValueOnce(snapshot([], 1));
        act(() => FakeWebSocket.instances[0].open());
        await waitFor(() => expect(api.fetchApi).toHaveBeenCalledTimes(2));

        const many = Array.from({ length: 25 }, (_, index) => comment(`c-${index}`));
        api.fetchApi.mockResolvedValueOnce(snapshot(many, 26));
        act(() => many.forEach((entry, index) => FakeWebSocket.instances[0].emit(index + 2, "canvas", entry.id)));
        await waitFor(() => expect(result.current.comments).toHaveLength(25));
        expect(api.fetchApi).toHaveBeenCalledTimes(3);
        expect(api.fetchApi.mock.calls[2][0]).toBe("/api/projects/project-1/comments");
    });

    it("ignores comparison events while viewing project comments", async () => {
        api.fetchApi.mockResolvedValueOnce(snapshot([], 2));
        const { result } = renderHook(() => useLiveComments("project-1", { kind: "canvas" }));
        await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
        api.fetchApi.mockResolvedValueOnce(snapshot([], 2));
        act(() => FakeWebSocket.instances[0].open());
        await waitFor(() => expect(api.fetchApi).toHaveBeenCalledTimes(2));
        act(() => FakeWebSocket.instances[0].emit(3, "comparison"));
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(api.fetchApi).toHaveBeenCalledTimes(2);
        expect(result.current.comments).toEqual([]);
    });
});
