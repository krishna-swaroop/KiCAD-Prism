/**
 * The one client for comment threads, shared by the canvas visualizer and
 * the comparison discussion rail.
 *
 * Every mutation goes through `fetchApi` without an author field: the
 * server attributes writes to the session. Refusals and stale revisions
 * come back as `CommentMutationError`, which keeps the machine code, the
 * current revision and the required role so a caller can offer "reload and
 * retry" or explain who may do this, instead of showing a bare failure.
 */

import { ApiHttpError, fetchApi } from "@/lib/api";
import { normalizeComment } from "@/lib/comment-overlays";
import type {
    Comment,
    CommentContext,
    CommentMutationErrorPayload,
    CommentReply,
    CommentsFile,
    CreateCommentRequest,
    CreateComparisonCommentRequest,
    CreateReplyRequest,
    MentionCandidate,
    UpdateCommentRequest,
    UpdateReplyRequest,
} from "@/types/comments";

export class CommentMutationError extends ApiHttpError {
    currentRevision?: number | null;
    requiredRole?: string;

    constructor(status: number, payload: CommentMutationErrorPayload) {
        super(status, payload.detail, payload.code);
        this.name = "CommentMutationError";
        this.currentRevision = payload.currentRevision;
        this.requiredRole = payload.requiredRole;
    }

    /** The thread changed under the user; reload before editing again. */
    get isConflict(): boolean {
        return this.status === 409 || this.code === "revision_conflict";
    }

    /** The action exists but this caller may not perform it. */
    get isRefusal(): boolean {
        return this.status === 403;
    }
}

interface ReplyResult {
    comment: Comment;
    reply: CommentReply;
}

function projectBase(projectId: string): string {
    return `/api/projects/${encodeURIComponent(projectId)}`;
}

async function parseError(response: Response, fallback: string): Promise<CommentMutationError> {
    let payload: CommentMutationErrorPayload = { detail: fallback };
    try {
        const raw = (await response.json()) as Partial<CommentMutationErrorPayload> & { detail?: unknown };
        const detail = raw.detail;
        payload = {
            detail:
                typeof detail === "string" && detail.trim()
                    ? detail
                    : Array.isArray(detail)
                        ? detail.map((entry: { loc?: unknown[]; msg?: string }) =>
                            `${String(entry.loc?.slice(-1)?.[0] ?? "Field")}: ${entry.msg ?? ""}`).join(", ")
                        : fallback,
            code: typeof raw.code === "string" ? raw.code : undefined,
            currentRevision: typeof raw.currentRevision === "number" ? raw.currentRevision : raw.currentRevision === null ? null : undefined,
            requiredRole: typeof raw.requiredRole === "string" ? raw.requiredRole : undefined,
        };
    } catch {
        // Non-JSON error bodies keep the fallback message.
    }
    return new CommentMutationError(response.status, payload);
}

async function request<T>(input: string, init: RequestInit | undefined, fallback: string): Promise<T> {
    const response = await fetchApi(input, init);
    if (!response.ok) {
        throw await parseError(response, fallback);
    }
    return (await response.json()) as T;
}

function json(body: unknown): RequestInit {
    return { method: "POST", body: JSON.stringify(body) };
}

/**
 * Wire payloads are rebuilt from the fields the contract names, so a stray
 * `author` (or anything else) on a caller's object never reaches the server.
 */
function createCommentPayload(payload: CreateCommentRequest): CreateCommentRequest {
    return {
        context: payload.context,
        location: payload.location,
        content: payload.content,
        elementId: payload.elementId,
        elementRef: payload.elementRef,
        elementType: payload.elementType,
        commentClass: payload.commentClass,
        severity: payload.severity,
        mentions: payload.mentions,
        metadata: payload.metadata,
    };
}

function createComparisonPayload(payload: CreateComparisonCommentRequest): CreateComparisonCommentRequest {
    return {
        baseCommit: payload.baseCommit,
        compareCommit: payload.compareCommit,
        domain: payload.domain,
        content: payload.content,
        filePath: payload.filePath,
        semanticItemId: payload.semanticItemId,
        semanticItemRef: payload.semanticItemRef,
        anchorKind: payload.anchorKind,
        commentClass: payload.commentClass,
        severity: payload.severity,
        mentions: payload.mentions,
    };
}

function updateCommentPayload(payload: UpdateCommentRequest): UpdateCommentRequest {
    return {
        content: payload.content,
        severity: payload.severity,
        commentClass: payload.commentClass,
        mentions: payload.mentions,
        status: payload.status,
        expectedRevision: payload.expectedRevision,
    };
}

export async function listComments(projectId: string, signal?: AbortSignal): Promise<Comment[]> {
    const file = await request<CommentsFile>(`${projectBase(projectId)}/comments`, { signal }, "Failed to load comments");
    return (file.comments ?? []).map(normalizeComment);
}

export async function listComparisonComments(
    projectId: string,
    base: string,
    compare: string,
    domain?: CommentContext,
    signal?: AbortSignal,
): Promise<Comment[]> {
    const params = new URLSearchParams({ base, compare });
    if (domain) params.set("domain", domain);
    const file = await request<CommentsFile>(
        `${projectBase(projectId)}/comparison-comments?${params}`,
        { signal },
        "Failed to load comparison comments",
    );
    return (file.comments ?? []).map(normalizeComment);
}

export async function listMentionCandidates(projectId: string, signal?: AbortSignal): Promise<MentionCandidate[]> {
    return request<MentionCandidate[]>(
        `${projectBase(projectId)}/comments/mention-candidates`,
        { signal },
        "Failed to load mention candidates",
    );
}

export async function createComment(projectId: string, payload: CreateCommentRequest): Promise<Comment> {
    const created = await request<Comment>(
        `${projectBase(projectId)}/comments`,
        json(createCommentPayload(payload)),
        "Failed to post comment",
    );
    return normalizeComment(created);
}

export async function createComparisonComment(
    projectId: string,
    payload: CreateComparisonCommentRequest,
): Promise<Comment> {
    const created = await request<Comment>(
        `${projectBase(projectId)}/comparison-comments`,
        json(createComparisonPayload(payload)),
        "Failed to post comment",
    );
    return normalizeComment(created);
}

export async function updateComment(
    projectId: string,
    commentId: string,
    payload: UpdateCommentRequest,
): Promise<Comment> {
    const updated = await request<Comment>(
        `${projectBase(projectId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "PATCH", body: JSON.stringify(updateCommentPayload(payload)) },
        "Failed to update comment",
    );
    return normalizeComment(updated);
}

/** Resolve or reopen, pinned to the revision the caller displayed. */
export function setCommentStatus(
    projectId: string,
    comment: Pick<Comment, "id" | "revision">,
    resolved: boolean,
): Promise<Comment> {
    return updateComment(projectId, comment.id, {
        status: resolved ? "RESOLVED" : "OPEN",
        expectedRevision: comment.revision,
    });
}

export async function replyToComment(
    projectId: string,
    commentId: string,
    payload: CreateReplyRequest,
): Promise<ReplyResult> {
    const result = await request<ReplyResult>(
        `${projectBase(projectId)}/comments/${encodeURIComponent(commentId)}/replies`,
        json({ content: payload.content }),
        "Failed to add reply",
    );
    const comment = normalizeComment(result.comment);
    const reply = comment.replies.find((entry) => entry.id === result.reply?.id) ?? result.reply;
    return { comment, reply };
}

export async function updateReply(
    projectId: string,
    commentId: string,
    replyId: string,
    payload: UpdateReplyRequest,
): Promise<Comment> {
    const updated = await request<Comment>(
        `${projectBase(projectId)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`,
        { method: "PATCH", body: JSON.stringify({ content: payload.content, expectedRevision: payload.expectedRevision }) },
        "Failed to update reply",
    );
    return normalizeComment(updated);
}

export async function deleteReply(
    projectId: string,
    commentId: string,
    replyId: string,
    expectedRevision?: number,
): Promise<Comment> {
    const params = expectedRevision === undefined ? "" : `?expectedRevision=${expectedRevision}`;
    const updated = await request<Comment>(
        `${projectBase(projectId)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}${params}`,
        { method: "DELETE" },
        "Failed to delete reply",
    );
    return normalizeComment(updated);
}

export async function deleteComment(projectId: string, commentId: string, expectedRevision?: number): Promise<void> {
    const params = expectedRevision === undefined ? "" : `?expectedRevision=${expectedRevision}`;
    await request<{ deleted: string }>(
        `${projectBase(projectId)}/comments/${encodeURIComponent(commentId)}${params}`,
        { method: "DELETE" },
        "Failed to delete comment",
    );
}

export async function exportComments(projectId: string): Promise<{ comments_path: string }> {
    return request<{ comments_path: string }>(
        `${projectBase(projectId)}/comments/push`,
        { method: "POST" },
        "Failed to export comments",
    );
}
