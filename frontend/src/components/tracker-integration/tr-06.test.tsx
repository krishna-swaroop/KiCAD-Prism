/**
 * TR-06: the comments client speaks the frozen DTOs (F1, F2).
 *
 * The server examples come straight from docs/tracker-integration/
 * dto-examples.json so a drift between packet and client fails here, not
 * in a browser.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchApi } from "@/lib/api";
import { normalizeComment } from "@/lib/comment-overlays";
import {
    CommentMutationError,
    createComment,
    createComparisonComment,
    deleteComment,
    deleteReply,
    exportComments,
    listComments,
    listComparisonComments,
    listMentionCandidates,
    replyToComment,
    setCommentStatus,
    updateComment,
    updateReply,
} from "@/lib/comments-client";
import type { Comment, CommentReply } from "@/types/comments";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, fetchApi: vi.fn() };
});

const examples = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../docs/tracker-integration/dto-examples.json"), "utf8"),
) as {
    comments: {
        Comment: Comment;
        Comment_legacy_unpinned: Partial<Comment>;
        CreateCommentRequest: Record<string, unknown>;
        UpdateCommentRequest: Record<string, unknown>;
        ConflictError: Record<string, unknown>;
        PublicationDeniedError: Record<string, unknown>;
    };
};

const respond = (payload: unknown, status = 200): Response =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

function lastRequest(): { url: string; init: RequestInit } {
    const calls = vi.mocked(fetchApi).mock.calls;
    const [url, init] = calls[calls.length - 1] as [string, RequestInit];
    return { url, init };
}

function lastBody(): Record<string, unknown> {
    return JSON.parse(String(lastRequest().init.body)) as Record<string, unknown>;
}

describe("comments client against the frozen server examples", () => {
    beforeEach(() => {
        vi.mocked(fetchApi).mockReset();
    });

    it("reads the frozen Comment example without altering it", async () => {
        vi.mocked(fetchApi).mockResolvedValueOnce(respond({ meta: { version: "1.1" }, comments: [examples.comments.Comment] }));
        const [comment] = await listComments("prj_47c2551996d0");
        expect(comment.id).toBe("c_8f3a1b2c");
        expect(comment.authorUserId).toBe("u_1a2b");
        expect(comment.authorKind).toBe("user");
        expect(comment.revision).toBe(1);
        expect(comment.anchor.state).toBe("pinned");
        expect(comment.anchor.commit).toHaveLength(40);
        expect(comment.permissions?.canPublish).toBe(true);
        const [prismReply, remoteReply] = comment.replies;
        expect(prismReply.id).toBe("r_4d5e6f70");
        expect(prismReply.origin).toBe("prism");
        expect(remoteReply.origin).toBe("remote");
        expect(remoteReply.authorKind).toBe("remote");
        expect(remoteReply.remoteAttribution?.login).toBe("arjun-gh");
        expect(lastRequest().url).toBe("/api/projects/prj_47c2551996d0/comments");
    });

    it("normalizes legacy replies and unpinned anchors from a 1.0 server", () => {
        const legacy = normalizeComment({
            id: "c_old",
            author: "swaroop",
            timestamp: "2026-01-01T00:00:00Z",
            status: "OPEN",
            context: "PCB",
            location: { x: 1, y: 2, layer: "F.Cu" },
            content: "old",
            replies: [{ author: "Mira", timestamp: "2026-01-02T00:00:00Z", content: "reply" } as CommentReply],
        });
        expect(legacy.authorKind).toBe("legacy");
        expect(legacy.authorUserId).toBeFalsy();
        expect(legacy.revision).toBe(1);
        expect(legacy.updatedAt).toBe(legacy.timestamp);
        expect(legacy.anchor).toEqual({
            state: "unpinned", source: null, commit: null, sourceRevisionKey: null, baseCommit: null, compareCommit: null,
        });
        expect(legacy.replies[0].id).toBe("legacy:c_old:0");
        expect(legacy.replies[0].authorKind).toBe("legacy");
        expect(legacy.replies[0].origin).toBe("prism");

        const frozen = normalizeComment(examples.comments.Comment_legacy_unpinned as Comment);
        expect(frozen.anchor.state).toBe("unpinned");
        expect(frozen.permissions?.canPublish).toBe(false);
    });

    it("never sends an author and forwards the displayed revision", async () => {
        vi.mocked(fetchApi).mockImplementation(async () => respond(examples.comments.Comment));

        await createComment("p", {
            context: "PCB", location: { x: 1, y: 2, layer: "F.Cu" }, content: "hi", severity: "major",
            revision: examples.comments.CreateCommentRequest.revision as { commit: string; worktree: boolean; sourceRevisionKey: null },
            // @ts-expect-error author is not part of the contract; it must not survive to the wire either
            author: "Mallory",
        });
        expect(lastBody()).not.toHaveProperty("author");
        expect(lastBody().revision).toEqual(examples.comments.CreateCommentRequest.revision);
        expect(lastRequest().init.method).toBe("POST");

        await createComparisonComment("p", {
            baseCommit: "a".repeat(40), compareCommit: "b".repeat(40), domain: "PCB", content: "cmp", anchorKind: "comparison",
        });
        expect(lastRequest().url).toBe("/api/projects/p/comparison-comments");
        expect(lastBody()).not.toHaveProperty("author");

        vi.mocked(fetchApi).mockResolvedValueOnce(
            respond({ comment: examples.comments.Comment, reply: examples.comments.Comment.replies[0] }),
        );
        await replyToComment("p", "c_8f3a1b2c", { content: "reply" });
        expect(lastRequest().url).toBe("/api/projects/p/comments/c_8f3a1b2c/replies");
        expect(lastBody()).toEqual({ content: "reply" });

        await updateComment("p", "c_8f3a1b2c", examples.comments.UpdateCommentRequest);
        expect(lastRequest().init.method).toBe("PATCH");
        expect(lastBody()).toMatchObject({ content: expect.any(String), severity: "critical", expectedRevision: 1 });

        await setCommentStatus("p", { id: "c_8f3a1b2c", revision: 4 }, true);
        expect(lastBody()).toEqual({ status: "RESOLVED", expectedRevision: 4 });

        await updateReply("p", "c_8f3a1b2c", "r_4d5e6f70", { content: "edited", expectedRevision: 1 });
        expect(lastRequest().url).toBe("/api/projects/p/comments/c_8f3a1b2c/replies/r_4d5e6f70");

        vi.mocked(fetchApi).mockResolvedValueOnce(respond({ deleted: "c_8f3a1b2c" }));
        await deleteComment("p", "c_8f3a1b2c", 2);
        expect(lastRequest().url).toBe("/api/projects/p/comments/c_8f3a1b2c?expectedRevision=2");
        expect(lastRequest().init.method).toBe("DELETE");
    });

    it("scopes comparison listings, mention candidates, reply deletion and export to the project", async () => {
        vi.mocked(fetchApi).mockResolvedValueOnce(respond({ meta: { version: "1.1" }, comments: [examples.comments.Comment] }));
        const comparison = await listComparisonComments("p", "a".repeat(40), "b".repeat(40), "PCB");
        expect(comparison[0].anchor.state).toBe("pinned");
        expect(lastRequest().url).toBe(`/api/projects/p/comparison-comments?base=${"a".repeat(40)}&compare=${"b".repeat(40)}&domain=PCB`);

        vi.mocked(fetchApi).mockResolvedValueOnce(respond([{ email: "arjun@example.com", role: "designer" }]));
        const candidates = await listMentionCandidates("p");
        expect(candidates[0].role).toBe("designer");
        expect(lastRequest().url).toBe("/api/projects/p/comments/mention-candidates");

        vi.mocked(fetchApi).mockResolvedValueOnce(respond(examples.comments.Comment));
        const afterDelete = await deleteReply("p", "c_8f3a1b2c", "r_4d5e6f70", 2);
        expect(afterDelete.id).toBe("c_8f3a1b2c");
        expect(lastRequest().url).toBe("/api/projects/p/comments/c_8f3a1b2c/replies/r_4d5e6f70?expectedRevision=2");
        expect(lastRequest().init.method).toBe("DELETE");

        vi.mocked(fetchApi).mockResolvedValueOnce(respond({ success: true, comments_path: ".comments/comments.json" }));
        const exported = await exportComments("p");
        expect(exported.comments_path).toBe(".comments/comments.json");
        expect(lastRequest().url).toBe("/api/projects/p/comments/push");
    });

    it("returns the reply the server created, from the normalized thread", async () => {
        const comment = examples.comments.Comment;
        vi.mocked(fetchApi).mockResolvedValueOnce(respond({ comment, reply: comment.replies[0] }));
        const result = await replyToComment("p", comment.id, { content: "x" });
        expect(result.reply.id).toBe("r_4d5e6f70");
        expect(result.comment.replies).toHaveLength(2);
    });

    it("turns a 409 into an actionable conflict carrying the current revision", async () => {
        vi.mocked(fetchApi).mockResolvedValueOnce(respond(examples.comments.ConflictError, 409));
        const error = await updateComment("p", "c_1", { content: "stale", expectedRevision: 1 }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(CommentMutationError);
        const conflict = error as CommentMutationError;
        expect(conflict.isConflict).toBe(true);
        expect(conflict.code).toBe("revision_conflict");
        expect(conflict.currentRevision).toBe(3);
        expect(conflict.message).toBe("Comment changed since revision 1");
    });

    it("turns a 403 refusal into a message plus the role that would be needed", async () => {
        vi.mocked(fetchApi).mockResolvedValueOnce(respond(examples.comments.PublicationDeniedError, 403));
        const error = await setCommentStatus("p", { id: "c_1", revision: 2 }, true).catch((caught: unknown) => caught);
        const refusal = error as CommentMutationError;
        expect(refusal.isRefusal).toBe(true);
        expect(refusal.code).toBe("publication_required");
        expect(refusal.requiredRole).toBe("designer");
        expect(refusal.message).toMatch(/designer role/);
    });

    it("keeps the fallback message for validation and non-JSON failures", async () => {
        vi.mocked(fetchApi).mockResolvedValueOnce(
            respond({ detail: [{ loc: ["body", "severity"], msg: "must be one of: info, minor" }] }, 422),
        );
        const validation = await createComment("p", {
            context: "PCB", location: { x: 0, y: 0, layer: "" }, content: "x",
        }).then(() => null, (caught: unknown) => caught as CommentMutationError);
        expect(validation?.message).toBe("severity: must be one of: info, minor");

        vi.mocked(fetchApi).mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }));
        const outage = await listComments("p").then(() => null, (caught: unknown) => caught as CommentMutationError);
        expect(outage?.status).toBe(504);
        expect(outage?.message).toBe("Failed to load comments");
    });
});
