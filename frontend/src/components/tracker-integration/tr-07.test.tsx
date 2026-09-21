import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommentCard } from "@/components/comment-card";
import { ComparisonDiscussionRail } from "@/components/design-comparison/comparison-discussion-rail";
import {
    actionAllowed,
    displayedCanvasRevision,
    describeMutationError,
} from "@/components/tracker-integration/comment-editor";
import { CommentMutationError, createComment, createComparisonComment, updateComment } from "@/lib/comments-client";
import { fetchApi } from "@/lib/api";
import * as trackersClient from "@/lib/trackers-client";
import type { Comment, CommentPermissions } from "@/types/comments";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, fetchApi: vi.fn() };
});

// TR-42 comparison rail loads tracker settings via fetchApi; isolate that so
// create-thread assertions inspect the POST body, not the settings GET.
vi.mock("@/lib/trackers-client", async () => {
    const actual = await vi.importActual<typeof import("@/lib/trackers-client")>("@/lib/trackers-client");
    return { ...actual, getProjectTracker: vi.fn() };
});

const mockedFetch = vi.mocked(fetchApi);
const mockedGetProjectTracker = vi.mocked(trackersClient.getProjectTracker);

const ownPermissions: CommentPermissions = {
    canReply: true,
    canEdit: true,
    canDelete: true,
    canResolve: false,
    canPublish: false,
};

const otherPermissions: CommentPermissions = {
    canReply: true,
    canEdit: false,
    canDelete: false,
    canResolve: true,
    canPublish: true,
};

function comment(overrides: Partial<Comment> = {}): Comment {
    return {
        id: "c1",
        author: "Priya",
        authorUserId: "u_priya",
        authorKind: "user",
        timestamp: "2026-09-20T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
        revision: 1,
        status: "OPEN",
        context: "PCB",
        location: { x: 1, y: 2, layer: "F.Cu" },
        content: "Check this footprint.",
        replies: [],
        commentClass: "question",
        severity: "minor",
        mentions: [],
        anchor: { state: "pinned", commit: "a".repeat(40), source: "client" },
        permissions: ownPermissions,
        ...overrides,
    };
}

const respond = (payload: unknown, status = 200): Response =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
    cleanup();
});

describe("displayed canvas revision (F2 / C1)", () => {
    it("sends the historical SHA and never invents HEAD", () => {
        const sha = "b".repeat(40);
        expect(displayedCanvasRevision(sha)).toEqual({
            commit: sha,
            worktree: false,
            sourceRevisionKey: null,
        });
    });

    it("marks a live/worktree view as unpinned worktree", () => {
        expect(displayedCanvasRevision(null)).toEqual({
            worktree: true,
            sourceRevisionKey: null,
        });
        expect(displayedCanvasRevision("3f2c9a1")).toEqual({
            worktree: true,
            sourceRevisionKey: null,
        });
    });

    it("forwards sourceRevisionKey for pinned and worktree views", () => {
        const sha = "d".repeat(40);
        expect(displayedCanvasRevision(sha, "src:worktree")).toEqual({
            commit: sha,
            worktree: false,
            sourceRevisionKey: "src:worktree",
        });
        expect(displayedCanvasRevision(null, "src:live")).toEqual({
            worktree: true,
            sourceRevisionKey: "src:live",
        });
    });
});

describe("action capabilities replace canModify (C8 / F9.role_state_matrix)", () => {
    it("shows own edit/delete and hides resolve when the API says so", () => {
        render(
            <CommentCard
                comment={comment()}
                screenPosition={{ x: 10, y: 10 }}
                onClose={vi.fn()}
                onResolve={vi.fn()}
                onReply={vi.fn().mockResolvedValue(undefined)}
                onDelete={vi.fn().mockResolvedValue(undefined)}
                onEdit={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.getByRole("button", { name: "Edit comment" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Delete comment" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Resolve comment" })).toBeNull();
        expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy();
    });

    it("lets a viewer reply to someone else's thread without edit/delete", () => {
        render(
            <CommentCard
                comment={comment({ author: "Alex", authorUserId: "u_alex", permissions: otherPermissions })}
                screenPosition={{ x: 10, y: 10 }}
                onClose={vi.fn()}
                onResolve={vi.fn()}
                onReply={vi.fn().mockResolvedValue(undefined)}
                onDelete={vi.fn().mockResolvedValue(undefined)}
                onEdit={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Resolve comment" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Edit comment" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull();
    });

    it("keeps the caret in the reply box (keyboard reply focus)", () => {
        render(
            <CommentCard
                comment={comment()}
                screenPosition={{ x: 10, y: 10 }}
                onClose={vi.fn()}
                onResolve={vi.fn()}
                onReply={vi.fn().mockResolvedValue(undefined)}
                onDelete={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Reply" }));
        expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Reply" }));
    });

    it("reads permissions as-is and does not re-derive from role names", () => {
        expect(actionAllowed(ownPermissions, "canEdit")).toBe(true);
        expect(actionAllowed(otherPermissions, "canEdit")).toBe(false);
        expect(actionAllowed(undefined, "canEdit", true)).toBe(true);
    });
});

describe("stale edits are a recoverable conflict (C1)", () => {
    beforeEach(() => {
        mockedFetch.mockReset();
    });

    it("surfaces revision_conflict with the current revision", async () => {
        mockedFetch.mockResolvedValueOnce(respond({
            detail: "Comment changed since revision 1",
            code: "revision_conflict",
            currentRevision: 3,
        }, 409));
        const error = await updateComment("p", "c1", { content: "stale", expectedRevision: 1 })
            .then(() => null, (caught: unknown) => caught);
        expect(error).toBeInstanceOf(CommentMutationError);
        const described = describeMutationError(error, "failed");
        expect(described.conflict).toBe(true);
        expect(described.currentRevision).toBe(3);
    });

    it("offers reload on a 409 from the card editor", async () => {
        const onReload = vi.fn().mockResolvedValue(undefined);
        const onEdit = vi.fn().mockRejectedValue(new CommentMutationError(409, {
            detail: "Comment changed since revision 1",
            code: "revision_conflict",
            currentRevision: 3,
        }));
        render(
            <CommentCard
                comment={comment()}
                screenPosition={{ x: 10, y: 10 }}
                onClose={vi.fn()}
                onResolve={vi.fn()}
                onReply={vi.fn().mockResolvedValue(undefined)}
                onDelete={vi.fn().mockResolvedValue(undefined)}
                onEdit={onEdit}
                onReload={onReload}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onReload).toHaveBeenCalled());
        expect(screen.getByRole("alert").textContent).toMatch(/changed/i);
        expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    });
});

describe("canvas and comparison creates send the displayed revision/side, not author", () => {
    beforeEach(() => {
        mockedFetch.mockReset();
        mockedFetch.mockImplementation(async () => respond(comment()));
        mockedGetProjectTracker.mockReset();
        mockedGetProjectTracker.mockRejectedValue(new Error("tracker settings unused"));
    });

    it("forwards the displayed commit on canvas create and never sends author", async () => {
        const sha = "c".repeat(40);
        await createComment("prj", {
            context: "PCB",
            location: { x: 1, y: 2, layer: "F.Cu" },
            content: "on A",
            revision: displayedCanvasRevision(sha),
            // @ts-expect-error author is not a request field
            author: "Mallory",
        });
        const body = JSON.parse(String(mockedFetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty("author");
        expect(body.revision).toEqual({ commit: sha, worktree: false, sourceRevisionKey: null });
    });

    it("sends selectedSide on comparison create", async () => {
        await createComparisonComment("prj", {
            baseCommit: "a".repeat(40),
            compareCommit: "b".repeat(40),
            domain: "SCH",
            content: "on compare",
            selectedSide: "compare",
        });
        const body = JSON.parse(String(mockedFetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty("author");
        expect(body.selectedSide).toBe("compare");
        expect(mockedFetch.mock.calls[0]?.[0]).toBe("/api/projects/prj/comparison-comments");
    });

    it("comparison rail posts selectedSide=compare and no author", async () => {
        mockedFetch.mockImplementation(async () => respond(comment({ scope: "comparison" })));
        render(
            <ComparisonDiscussionRail
                projectId="p1"
                base={"a".repeat(40)}
                compare={"b".repeat(40)}
                domain="PCB"
                anchor={null}
                comments={[]}
                canComment
                onCommentsChange={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        fireEvent.change(screen.getByPlaceholderText("Add review context…"), {
            target: { value: "looks off on the new side" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Add thread" }));
        await waitFor(() => {
            expect(
                mockedFetch.mock.calls.some(
                    ([url, init]) =>
                        String(url).includes("/comparison-comments") && init?.method === "POST",
                ),
            ).toBe(true);
        });
        const post = mockedFetch.mock.calls.find(
            ([url, init]) => String(url).includes("/comparison-comments") && init?.method === "POST",
        );
        const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty("author");
        expect(body.selectedSide).toBe("compare");
        expect(body.baseCommit).toBe("a".repeat(40));
        expect(body.compareCommit).toBe("b".repeat(40));
    });
});
