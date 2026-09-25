import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComparisonDiscussionRail } from "./comparison-discussion-rail";
import { fetchApi, readApiError } from "@/lib/api";
import type { Comment } from "@/types/comments";

vi.mock("@/lib/api", () => ({
    fetchApi: vi.fn(),
    readApiError: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchApi);
const mockedReadError = vi.mocked(readApiError);

/**
 * A rejected request used to leave the reply button disabled until remount:
 * `addReply` set `busy` and never cleared it when `fetchApi` threw. These
 * tests pin that every path out of the handler re-enables the composer.
 */

const comment: Comment = {
    id: "c1",
    author: "Kim",
    timestamp: "2026-08-22T00:00:00Z",
    status: "OPEN",
    context: "PCB",
    location: { x: 0, y: 0, layer: "F.Cu" },
    content: "Tracer looks wrong near J4",
    replies: [],
    commentClass: "general",
    severity: "info",
    mentions: [],
};

const baseProps = {
    projectId: "p1",
    base: "aaa",
    compare: "bbb",
    domain: "PCB" as const,
    anchor: null,
    comments: [comment],
    canComment: true,
    onCommentsChange: () => {},
    onClose: () => {},
};

function openReplyComposer() {
    // Two buttons answer to "Reply" across the rail's lifetime, but only one
    // at a time: the opener swaps for the submit button once replying.
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const textarea = screen.getByPlaceholderText("Reply…");
    fireEvent.change(textarea, { target: { value: "Looks good to me" } });
    return screen.getByRole("button", { name: "Reply" });
}

beforeEach(() => {
    mockedFetch.mockReset();
    mockedReadError.mockReset();
});

afterEach(() => {
    cleanup();
});

describe("ComparisonDiscussionRail addReply", () => {
    it("re-enables the reply button after a network rejection", async () => {
        mockedFetch.mockRejectedValue(new Error("network down"));

        render(<ComparisonDiscussionRail {...baseProps} />);
        const submit = openReplyComposer();
        expect(submit).not.toBeDisabled();

        fireEvent.click(submit);
        await waitFor(() => expect(screen.getByRole("button", { name: "Reply" })).not.toBeDisabled());
        expect(screen.getByText("network down")).toBeTruthy();
    });

    it("re-enables the reply button after an API error response", async () => {
        mockedFetch.mockResolvedValue(new Response(null, { status: 500 }));
        mockedReadError.mockResolvedValue("Server exploded");

        render(<ComparisonDiscussionRail {...baseProps} />);
        const submit = openReplyComposer();
        fireEvent.click(submit);

        await waitFor(() => expect(screen.getByRole("button", { name: "Reply" })).not.toBeDisabled());
        expect(mockedReadError).toHaveBeenCalled();
    });

    it("still delivers the reply on the happy path", async () => {
        const onCommentsChange = vi.fn();
        mockedFetch.mockResolvedValue(new Response(JSON.stringify({ comment: { ...comment, id: "r1" } }), { status: 200 }));

        render(<ComparisonDiscussionRail {...baseProps} onCommentsChange={onCommentsChange} />);
        const submit = openReplyComposer();
        fireEvent.click(submit);

        await waitFor(() => expect(onCommentsChange).toHaveBeenCalledTimes(1));
        expect(mockedFetch).toHaveBeenCalledWith("/api/projects/p1/comments/c1/replies", {
            method: "POST",
            body: JSON.stringify({ content: "Looks good to me" }),
        });
        // Composer reset signals completion.
        expect(screen.queryByPlaceholderText("Reply…")).toBeNull();
    });
});
